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
    const day = date.getDate();
    const [first, second] = normalizedPaydays(settings);
    if (day >= second.day || day < first.day) return second.key;
    return first.key;
  }

  function payConfigByKey(key, settings = {}) {
    const s = normalizeSettings(settings);
    return key === 'p1'
      ? { day: s.payDay1, pct: s.split1, label: '1º pagamento' }
      : { day: s.payDay2, pct: s.split2, label: '2º pagamento' };
  }

  function incomeForCycle(key, settings = {}) {
    const s = normalizeSettings(settings);
    const cfg = payConfigByKey(key, s);
    return roundMoney(s.salary * (cfg.pct / 100));
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
    return bills
      .map(bill => normalizeBill(bill, period))
      .filter(bill => billActiveInPeriod(bill, period));
  }

  function isBillPaid(bill, period = periodKey()) {
    const b = normalizeBill(bill, period);
    return b.paidPeriods.includes(period);
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
      .filter(bill => bill.recurring)
      .filter(bill => cycleForDueDay(bill.dueDay, settings) === key)
      .reduce((sum, bill) => sum + bill.amount, 0));
  }

  function openBillTotalForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(activeBills(bills, period)
      .filter(bill => cycleForDueDay(bill.dueDay, settings) === key)
      .filter(bill => !isBillPaid(bill, period))
      .reduce((sum, bill) => sum + bill.amount, 0));
  }

  function monthBillTotal(bills = [], period = periodKey()) {
    return roundMoney(activeBills(bills, period).reduce((sum, bill) => sum + bill.amount, 0));
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
    const recurringBalances = Object.fromEntries(
      ordered.map(key => [key, recurringBalanceForCycle(key, bills, settings, period)])
    );

    return ordered.flatMap(toKey => {
      const required = roundMoney(Math.max(0, -recurringBalances[toKey]));
      if (!required) return [];
      const fromKey = previousCycleKey(toKey, settings);
      const sourceSurplus = roundMoney(Math.max(0, recurringBalances[fromKey]));
      const amount = roundMoney(Math.min(required, sourceSurplus));
      return [{
        fromKey,
        toKey,
        required,
        amount,
        uncovered: roundMoney(required - amount)
      }];
    });
  }

  function reserveIncomingForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(automaticReservePlan(bills, settings, period)
      .filter(item => item.toKey === key)
      .reduce((sum, item) => sum + item.amount, 0));
  }

  function reserveOutgoingForCycle(key, bills = [], settings = {}, period = periodKey()) {
    return roundMoney(automaticReservePlan(bills, settings, period)
      .filter(item => item.fromKey === key)
      .reduce((sum, item) => sum + item.amount, 0));
  }

  function plannedAvailableForCycle(key, bills = [], settings = {}, period = periodKey()) {
    const base = availableForCycle(key, bills, settings, period);
    const incoming = reserveIncomingForCycle(key, bills, settings, period);
    const outgoing = reserveOutgoingForCycle(key, bills, settings, period);
    return roundMoney(base + incoming - outgoing);
  }

  function monthBalance(bills = [], settings = {}, period = periodKey()) {
    return roundMoney(normalizeSettings(settings).salary - monthBillTotal(bills, period));
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[;\n\r\"]/.test(text) ? `\"${text.replace(/\"/g, '\"\"')}\"` : text;
  }

  function billsToCsv(bills = [], settings = {}, period = periodKey()) {
    const header = ['Descrição', 'Valor', 'Vencimento', 'Categoria', 'Ciclo', 'Recorrente', 'Status'];
    const rows = activeBills(bills, period)
      .sort((a, b) => a.dueDay - b.dueDay)
      .map(bill => {
        const cycle = payConfigByKey(cycleForDueDay(bill.dueDay, settings), settings).label;
        return [
          bill.name,
          bill.amount.toFixed(2).replace('.', ','),
          String(bill.dueDay),
          bill.category,
          cycle,
          bill.recurring ? 'Sim' : 'Não',
          isBillPaid(bill, period) ? 'Paga' : 'Aberta'
        ];
      });
    return [header, ...rows].map(row => row.map(csvEscape).join(';')).join('\r\n');
  }

  return {
    DEFAULT_SETTINGS,
    roundMoney,
    periodKey,
    normalizeSettings,
    validateSettings,
    normalizedPaydays,
    cycleForDueDay,
    currentCycleKey,
    payConfigByKey,
    incomeForCycle,
    normalizeBill,
    billActiveInPeriod,
    activeBills,
    isBillPaid,
    setBillPaid,
    billTotalForCycle,
    recurringBillTotalForCycle,
    openBillTotalForCycle,
    monthBillTotal,
    availableForCycle,
    recurringBalanceForCycle,
    previousCycleKey,
    automaticReservePlan,
    reserveIncomingForCycle,
    reserveOutgoingForCycle,
    plannedAvailableForCycle,
    monthBalance,
    billsToCsv
  };
});