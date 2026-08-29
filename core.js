(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuinzenaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_SETTINGS = { salary: 0, payDay1: 1, payDay2: 15, split1: 70, split2: 30 };

  function roundMoney(value) {
    const n = Number(value || 0);
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function periodKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  function shiftPeriod(period = periodKey(), delta = 1) {
    const [year, month] = String(period).split('-').map(Number);
    if (!year || !month) return periodKey();
    return periodKey(new Date(year, month - 1 + Number(delta || 0), 1));
  }

  function normalizeSettings(settings = {}) {
    return {
      salary: roundMoney(settings.salary),
      payDay1: Number(settings.payDay1 ?? DEFAULT_SETTINGS.payDay1),
      payDay2: Number(settings.payDay2 ?? DEFAULT_SETTINGS.payDay2),
      split1: Number(settings.split1 ?? DEFAULT_SETTINGS.split1),
      split2: Number(settings.split2 ?? DEFAULT_SETTINGS.split2)
    };
  }

  function validateSettings(settings = {}) {
    const s = normalizeSettings(settings);
    const paydaysValid = [s.payDay1, s.payDay2].every(day => Number.isInteger(day) && day >= 1 && day <= 28);
    const splitsValid = s.split1 > 0 && s.split2 > 0 && s.split1 + s.split2 === 100;
    return {
      ok: s.salary >= 0 && paydaysValid && s.payDay1 !== s.payDay2 && splitsValid,
      salaryValid: s.salary >= 0,
      paydaysValid: paydaysValid && s.payDay1 !== s.payDay2,
      splitsValid
    };
  }

  function normalizedPaydays(settings = {}) {
    const s = normalizeSettings(settings);
    return [
      { key: 'p1', day: s.payDay1, pct: s.split1 },
      { key: 'p2', day: s.payDay2, pct: s.split2 }
    ].sort((a, b) => a.day - b.day);
  }

  function cycleForDueDay(dueDay, settings = {}) {
    const day = Number(dueDay);
    const [first, second] = normalizedPaydays(settings);
    if (day >= second.day || day < first.day) return second.key;
    return first.key;
  }

  function currentCycleKey(settings = {}, date = new Date()) {
    return cycleForDueDay(date.getDate(), settings);
  }

  function payConfigByKey(key, settings = {}) {
    const s = normalizeSettings(settings);
    return key === 'p1'
      ? { key, day: s.payDay1, pct: s.split1, label: '1º pagamento' }
      : { key, day: s.payDay2, pct: s.split2, label: '2º pagamento' };
  }

  function incomeForCycle(key, settings = {}) {
    const s = normalizeSettings(settings);
    const cfg = payConfigByKey(key, s);
    return roundMoney(s.salary * (cfg.pct / 100));
  }

  function nextPaymentDate(date = new Date(), settings = {}) {
    const now = new Date(date);
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const pays = normalizedPaydays(settings);
    const nextInMonth = pays.find(pay => pay.day > day);
    const chosen = nextInMonth || pays[0];
    return nextInMonth
      ? new Date(year, month, chosen.day)
      : new Date(year, month + 1, chosen.day);
  }

  function daysUntilNextPayment(date = new Date(), settings = {}) {
    const current = new Date(date);
    current.setHours(0, 0, 0, 0);
    const next = nextPaymentDate(current, settings);
    next.setHours(0, 0, 0, 0);
    return Math.max(1, Math.ceil((next.getTime() - current.getTime()) / 86400000));
  }

  function dailySpendingLimit(available, date = new Date(), settings = {}) {
    return roundMoney(Math.max(0, Number(available || 0)) / daysUntilNextPayment(date, settings));
  }

  function normalizeBill(bill = {}, currentPeriod = periodKey()) {
    const recurring = bill.recurring !== false;
    const paidPeriods = Array.isArray(bill.paidPeriods)
      ? [...new Set(bill.paidPeriods.filter(Boolean).map(String))]
      : [];
    if (bill.paid === true && !paidPeriods.includes(currentPeriod)) paidPeriods.push(currentPeriod);
    return {
      id: String(bill.id || ''),
      name: String(bill.name || '').trim(),
      amount: roundMoney(bill.amount),
      dueDay: Number(bill.dueDay),
      category: String(bill.category || 'Outros'),
      recurring,
      activePeriod: recurring ? null : String(bill.activePeriod || bill.createdPeriod || currentPeriod),
      paidPeriods
    };
  }

  function billActiveInPeriod(bill, period = periodKey()) {
    const b = normalizeBill(bill, period);
    return b.recurring || b.activePeriod === period;
  }

  function activeBills(bills = [], period = periodKey()) {
    return bills.map(bill => normalizeBill(bill, period)).filter(bill => billActiveInPeriod(bill, period));
  }

  function isBillPaid(bill, period = periodKey()) {
    return normalizeBill(bill, period).paidPeriods.includes(period);
  }

  function setBillPaid(bill, period = periodKey(), paid = true) {
    const b = normalizeBill(bill, period);
    const periods = new Set(b.paidPeriods);
    if (paid) periods.add(period);
    else periods.delete(period);
    return { ...b, paidPeriods: [...periods].sort() };
  }

  function billTotalForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(activeBills(bills, period)
      .filter(bill => cycleForDueDay(bill.dueDay, settings) === key)
      .reduce((sum, bill) => sum + bill.amount, 0));
  }

  function recurringBillTotalForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(activeBills(bills, period)
      .filter(bill => bill.recurring && cycleForDueDay(bill.dueDay, settings) === key)
      .reduce((sum, bill) => sum + bill.amount, 0));
  }

  function openBillTotalForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(activeBills(bills, period)
      .filter(bill => cycleForDueDay(bill.dueDay, settings) === key && !isBillPaid(bill, period))
      .reduce((sum, bill) => sum + bill.amount, 0));
  }

  function monthBillTotal(bills = [], period = periodKey()) {
    return roundMoney(activeBills(bills, period).reduce((sum, bill) => sum + bill.amount, 0));
  }

  function recurringMonthTotal(bills = [], period = periodKey()) {
    return roundMoney(activeBills(bills, period).filter(bill => bill.recurring).reduce((sum, bill) => sum + bill.amount, 0));
  }

  function availableForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(incomeForCycle(key, settings) - billTotalForCycle(key, bills, settings, period));
  }

  function recurringBalanceForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(incomeForCycle(key, settings) - recurringBillTotalForCycle(key, bills, settings, period));
  }

  function previousCycleKey(key, settings = {}) {
    const ordered = normalizedPaydays(settings).map(pay => pay.key);
    const index = ordered.indexOf(key);
    if (index < 0) return ordered[0];
    return ordered[(index - 1 + ordered.length) % ordered.length];
  }

  function automaticReservePlan(bills = [], settings = {}, period = periodKey()) {
    const ordered = normalizedPaydays(settings).map(pay => pay.key);
    const recurringBalances = Object.fromEntries(ordered.map(key => [key, recurringBalanceForCycle(key, bills, settings, period)]));
    return ordered.flatMap(toKey => {
      const required = roundMoney(Math.max(0, -recurringBalances[toKey]));
      if (!required) return [];
      const fromKey = previousCycleKey(toKey, settings);
      const sourceSurplus = roundMoney(Math.max(0, recurringBalances[fromKey]));
      const amount = roundMoney(Math.min(required, sourceSurplus));
      return [{ fromKey, toKey, required, amount, uncovered: roundMoney(required - amount) }];
    });
  }

  function reserveIncomingForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(automaticReservePlan(bills, settings, period).filter(item => item.toKey === key).reduce((sum, item) => sum + item.amount, 0));
  }

  function reserveOutgoingForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(automaticReservePlan(bills, settings, period).filter(item => item.fromKey === key).reduce((sum, item) => sum + item.amount, 0));
  }

  function plannedAvailableForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(
      availableForCycle(key, bills, settings, period)
      + reserveIncomingForCycle(key, bills, settings, period)
      - reserveOutgoingForCycle(key, bills, settings, period)
    );
  }

  function normalizeMovement(movement = {}) {
    const type = movement.type === 'income' ? 'income' : 'expense';
    const fallbackDate = new Date().toISOString().slice(0, 10);
    return {
      id: String(movement.id || ''),
      type,
      name: String(movement.name || (type === 'income' ? 'Entrada extra' : 'Gasto')).trim(),
      amount: roundMoney(Math.max(0, movement.amount)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(movement.date || '')) ? String(movement.date) : fallbackDate,
      category: String(movement.category || (type === 'income' ? 'Renda extra' : 'Outros'))
    };
  }

  function movementPeriod(movement) {
    return normalizeMovement(movement).date.slice(0, 7);
  }

  function movementDay(movement) {
    return Number(normalizeMovement(movement).date.slice(8, 10));
  }

  function movementCycleKey(movement, settings = {}) {
    return cycleForDueDay(movementDay(movement), settings);
  }

  function movementsInPeriod(movements = [], period = periodKey()) {
    return movements.map(normalizeMovement).filter(item => movementPeriod(item) === period);
  }

  function movementTotalsForCycle(key, movements = [], settings = {}, period = periodKey()) {
    const scoped = movementsInPeriod(movements, period).filter(item => movementCycleKey(item, settings) === key);
    return {
      income: roundMoney(scoped.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)),
      expense: roundMoney(scoped.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0))
    };
  }

  function movementTotalsForPeriod(movements = [], period = periodKey()) {
    const scoped = movementsInPeriod(movements, period);
    return {
      income: roundMoney(scoped.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)),
      expense: roundMoney(scoped.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0))
    };
  }

  function actualAvailableForCycle(key, bills = [], movements = [], settings = {}, period = periodKey()) {
    const movement = movementTotalsForCycle(key, movements, settings, period);
    return roundMoney(plannedAvailableForCycle(key, bills, settings, period) + movement.income - movement.expense);
  }

  function monthBalance(bills = [], settings = {}, period = periodKey()) {
    return roundMoney(normalizeSettings(settings).salary - monthBillTotal(bills, period));
  }

  function effectiveMonthBalance(bills = [], movements = [], settings = {}, period = periodKey()) {
    const movement = movementTotalsForPeriod(movements, period);
    return roundMoney(monthBalance(bills, settings, period) + movement.income - movement.expense);
  }

  function recurringCommitmentRatio(bills = [], settings = {}, period = periodKey()) {
    const salary = normalizeSettings(settings).salary;
    if (salary <= 0) return 0;
    return Math.round((recurringMonthTotal(bills, period) / salary) * 1000) / 10;
  }

  function topExpenseCategory(movements = [], period = periodKey()) {
    const sums = {};
    movementsInPeriod(movements, period).filter(item => item.type === 'expense').forEach(item => {
      sums[item.category] = roundMoney((sums[item.category] || 0) + item.amount);
    });
    const sorted = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    return sorted.length ? { category: sorted[0][0], amount: sorted[0][1] } : null;
  }

  function largestRecurringBill(bills = [], period = periodKey()) {
    const sorted = activeBills(bills, period).filter(bill => bill.recurring).sort((a, b) => b.amount - a.amount);
    return sorted[0] || null;
  }

  function purchaseDecision(amount, available, reserveOutgoing = 0, date = new Date(), settings = {}) {
    const price = roundMoney(Math.max(0, Number(amount || 0)));
    const free = roundMoney(Number(available || 0));
    const protectedReserve = roundMoney(Math.max(0, Number(reserveOutgoing || 0)));
    const spendableBeforeReserve = Math.max(0, free);
    const totalBeforeShortfall = roundMoney(spendableBeforeReserve + protectedReserve);
    let status = 'fits';
    let reserveInvaded = 0;
    let shortfall = 0;
    if (price > spendableBeforeReserve && price <= totalBeforeShortfall) {
      status = 'invades_reserve';
      reserveInvaded = roundMoney(price - spendableBeforeReserve);
    } else if (price > totalBeforeShortfall) {
      status = 'exceeds';
      reserveInvaded = protectedReserve;
      shortfall = roundMoney(price - totalBeforeShortfall);
    }
    const afterPurchase = roundMoney(free - price);
    return {
      status,
      price,
      afterPurchase,
      reserveInvaded,
      shortfall,
      days: daysUntilNextPayment(date, settings),
      dailyAfter: dailySpendingLimit(afterPurchase, date, settings)
    };
  }

  function projectionForPeriod(bills = [], settings = {}, period = periodKey()) {
    const plan = automaticReservePlan(bills, settings, period);
    return {
      period,
      billsTotal: monthBillTotal(bills, period),
      balance: monthBalance(bills, settings, period),
      reserveTotal: roundMoney(plan.reduce((sum, item) => sum + item.amount, 0)),
      uncovered: roundMoney(plan.reduce((sum, item) => sum + item.uncovered, 0)),
      cycles: {
        p1: plannedAvailableForCycle('p1', bills, settings, period),
        p2: plannedAvailableForCycle('p2', bills, settings, period)
      }
    };
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[;\n\r\"]/.test(text) ? `\"${text.replace(/\"/g, '\"\"')}\"` : text;
  }

  function billsToCsv(bills = [], settings = {}, period = periodKey()) {
    const header = ['Descrição', 'Valor', 'Vencimento', 'Categoria', 'Ciclo', 'Recorrente', 'Status'];
    const rows = activeBills(bills, period).sort((a, b) => a.dueDay - b.dueDay).map(bill => [
      bill.name,
      bill.amount.toFixed(2).replace('.', ','),
      String(bill.dueDay),
      bill.category,
      payConfigByKey(cycleForDueDay(bill.dueDay, settings), settings).label,
      bill.recurring ? 'Sim' : 'Não',
      isBillPaid(bill, period) ? 'Paga' : 'Aberta'
    ]);
    return [header, ...rows].map(row => row.map(csvEscape).join(';')).join('\r\n');
  }

  function movementsToCsv(movements = [], settings = {}, period = periodKey()) {
    const header = ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Ciclo'];
    const rows = movementsInPeriod(movements, period).sort((a, b) => a.date.localeCompare(b.date)).map(item => [
      item.date,
      item.type === 'income' ? 'Entrada' : 'Gasto',
      item.name,
      item.amount.toFixed(2).replace('.', ','),
      item.category,
      payConfigByKey(movementCycleKey(item, settings), settings).label
    ]);
    return [header, ...rows].map(row => row.map(csvEscape).join(';')).join('\r\n');
  }

  return {
    DEFAULT_SETTINGS, roundMoney, periodKey, shiftPeriod, normalizeSettings, validateSettings,
    normalizedPaydays, cycleForDueDay, currentCycleKey, payConfigByKey, incomeForCycle,
    nextPaymentDate, daysUntilNextPayment, dailySpendingLimit,
    normalizeBill, billActiveInPeriod, activeBills, isBillPaid, setBillPaid,
    billTotalForCycle, recurringBillTotalForCycle, openBillTotalForCycle, monthBillTotal,
    recurringMonthTotal, availableForCycle, recurringBalanceForCycle, previousCycleKey,
    automaticReservePlan, reserveIncomingForCycle, reserveOutgoingForCycle, plannedAvailableForCycle,
    normalizeMovement, movementPeriod, movementDay, movementCycleKey, movementsInPeriod,
    movementTotalsForCycle, movementTotalsForPeriod, actualAvailableForCycle, effectiveMonthBalance,
    recurringCommitmentRatio, topExpenseCategory, largestRecurringBill,
    purchaseDecision, monthBalance, projectionForPeriod, billsToCsv, movementsToCsv
  };
});