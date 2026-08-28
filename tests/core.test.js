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
