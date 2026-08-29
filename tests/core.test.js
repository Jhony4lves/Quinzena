const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

const settings = { salary: 2273, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
const period = '2026-08';

function bill(overrides = {}) {
  return Core.normalizeBill({
    id: 'b1', name: 'Internet', amount: 100, dueDay: 20,
    category: 'Moradia', recurring: true, paidPeriods: [], ...overrides
  }, period);
}

test('divide a renda em centavos sem drift visível', () => {
  assert.equal(Core.incomeForCycle('p1', settings), 1591.10);
  assert.equal(Core.incomeForCycle('p2', settings), 681.90);
});

test('aloca vencimentos pelo último pagamento anterior', () => {
  assert.equal(Core.cycleForDueDay(10, settings), 'p1');
  assert.equal(Core.cycleForDueDay(20, settings), 'p2');
  assert.equal(Core.cycleForDueDay(1, settings), 'p1');
});

test('marcar como paga não devolve dinheiro ao saldo disponível', () => {
  const open = bill({ amount: 200, dueDay: 20 });
  const paid = Core.setBillPaid(open, period, true);
  assert.equal(Core.availableForCycle('p2', [open], settings, period), 481.90);
  assert.equal(Core.availableForCycle('p2', [paid], settings, period), 481.90);
  assert.equal(Core.openBillTotalForCycle('p2', [paid], settings, period), 0);
});

test('status de conta recorrente é independente por mês', () => {
  const paidAugust = Core.setBillPaid(bill(), '2026-08', true);
  assert.equal(Core.isBillPaid(paidAugust, '2026-08'), true);
  assert.equal(Core.isBillPaid(paidAugust, '2026-09'), false);
  assert.equal(Core.billActiveInPeriod(paidAugust, '2026-09'), true);
});

test('conta não recorrente aparece somente no mês em que foi criada', () => {
  const oneOff = bill({ recurring: false, activePeriod: '2026-08' });
  assert.equal(Core.billActiveInPeriod(oneOff, '2026-08'), true);
  assert.equal(Core.billActiveInPeriod(oneOff, '2026-09'), false);
});

test('migra booleano paid legado para o mês atual sem contaminar o futuro', () => {
  const migrated = Core.normalizeBill({ id: 'old', name: 'Antiga', amount: 50, dueDay: 8, paid: true, recurring: true }, '2026-08');
  assert.equal(Core.isBillPaid(migrated, '2026-08'), true);
  assert.equal(Core.isBillPaid(migrated, '2026-09'), false);
});

test('rejeita percentuais que não somam 100 e datas iguais', () => {
  assert.equal(Core.validateSettings({ ...settings, split1: 60, split2: 30 }).ok, false);
  assert.equal(Core.validateSettings({ ...settings, payDay2: 1 }).ok, false);
  assert.equal(Core.validateSettings(settings).ok, true);
});

test('exporta CSV com ciclo, recorrência e status do mês', () => {
  const paid = Core.setBillPaid(bill({ name: 'Internet; Casa', amount: 119.9, dueDay: 20 }), period, true);
  const csv = Core.billsToCsv([paid], settings, period);
  assert.match(csv, /Descrição;Valor;Vencimento;Categoria;Ciclo;Recorrente;Status/);
  assert.match(csv, /"Internet; Casa";119,90;20;Moradia;2º pagamento;Sim;Paga/);
});

test('reserva no segundo pagamento o déficit recorrente do primeiro pagamento seguinte', () => {
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const faculdade = Core.normalizeBill({
    id: 'faculdade', name: 'Faculdade', amount: 1560, dueDay: 14,
    category: 'Educação', recurring: true, paidPeriods: []
  }, period);

  const plan = Core.automaticReservePlan([faculdade], twoPaySettings, period);
  assert.deepEqual(plan, [{ fromKey: 'p2', toKey: 'p1', required: 20, amount: 20, uncovered: 0 }]);
  assert.equal(Core.availableForCycle('p1', [faculdade], twoPaySettings, period), -20);
  assert.equal(Core.plannedAvailableForCycle('p1', [faculdade], twoPaySettings, period), 0);
  assert.equal(Core.plannedAvailableForCycle('p2', [faculdade], twoPaySettings, period), 640);
  assert.equal(Core.monthBalance([faculdade], twoPaySettings, period), 640);
});

test('despesa não recorrente não cria reserva automática para meses futuros', () => {
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const compraUnica = Core.normalizeBill({
    id: 'unica', name: 'Compra única', amount: 1560, dueDay: 14,
    category: 'Outros', recurring: false, activePeriod: period, paidPeriods: []
  }, period);

  assert.deepEqual(Core.automaticReservePlan([compraUnica], twoPaySettings, period), []);
  assert.equal(Core.plannedAvailableForCycle('p1', [compraUnica], twoPaySettings, period), -20);
});

test('informa déficit recorrente descoberto quando o ciclo anterior não consegue financiar tudo', () => {
  const tightSettings = { salary: 1000, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const p1Bill = bill({ id: 'p1', amount: 850, dueDay: 10 });
  const p2Bill = bill({ id: 'p2', amount: 250, dueDay: 20 });
  const plan = Core.automaticReservePlan([p1Bill, p2Bill], tightSettings, period);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0], { fromKey: 'p2', toKey: 'p1', required: 150, amount: 50, uncovered: 100 });
});

test('calcula limite diário até o próximo pagamento', () => {
  const date = new Date(2026, 7, 28, 21, 0, 0);
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  assert.equal(Core.daysUntilNextPayment(date, twoPaySettings), 4);
  assert.equal(Core.dailySpendingLimit(640, date, twoPaySettings), 160);
});

test('simulador aprova compra que cabe e recalcula limite diário', () => {
  const date = new Date(2026, 7, 28, 21, 0, 0);
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const result = Core.purchaseDecision(299, 640, 20, date, twoPaySettings);
  assert.equal(result.status, 'fits');
  assert.equal(result.afterPurchase, 341);
  assert.equal(result.dailyAfter, 85.25);
  assert.equal(result.reserveInvaded, 0);
});

test('simulador avisa quando compra invade reserva protegida', () => {
  const date = new Date(2026, 7, 28, 21, 0, 0);
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const result = Core.purchaseDecision(650, 640, 20, date, twoPaySettings);
  assert.equal(result.status, 'invades_reserve');
  assert.equal(result.reserveInvaded, 10);
  assert.equal(result.shortfall, 0);
});

test('simulador mostra falta real depois de consumir toda a reserva', () => {
  const date = new Date(2026, 7, 28, 21, 0, 0);
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const result = Core.purchaseDecision(700, 640, 20, date, twoPaySettings);
  assert.equal(result.status, 'exceeds');
  assert.equal(result.reserveInvaded, 20);
  assert.equal(result.shortfall, 40);
});

test('projeção do próximo mês mantém recorrências e ignora compra única do mês atual', () => {
  const twoPaySettings = { salary: 2200, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };
  const faculdade = bill({ id: 'faculdade', name: 'Faculdade', amount: 1560, dueDay: 14, category: 'Educação' });
  const compra = bill({ id: 'compra', name: 'Compra única', amount: 500, dueDay: 20, recurring: false, activePeriod: '2026-08' });
  const next = Core.shiftPeriod(period, 1);
  const projection = Core.projectionForPeriod([faculdade, compra], twoPaySettings, next);
  assert.equal(next, '2026-09');
  assert.equal(projection.billsTotal, 1560);
  assert.equal(projection.balance, 640);
  assert.equal(projection.reserveTotal, 20);
  assert.equal(projection.cycles.p2, 640);
});
