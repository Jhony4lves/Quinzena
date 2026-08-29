const STORAGE_KEY = 'quinzena.v0.3';
const LEGACY_STORAGE_KEYS = ['quinzena.v0.2', 'quinzena.v0.1'];
const SCHEMA_VERSION = 3;
const Core = window.QuinzenaCore;

const defaultState = {
  version: SCHEMA_VERSION,
  settings: { ...Core.DEFAULT_SETTINGS },
  bills: [],
  movements: [],
  filter: 'all',
  movementFilter: 'all',
  onboarded: false
};

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const today = () => new Date();
const currentPeriod = () => Core.periodKey(today());
let editingBillId = null;
let viewPeriod = currentPeriod();
let installPrompt = null;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function migrateState(raw) {
  const period = currentPeriod();
  if (!raw || typeof raw !== 'object') return cloneDefaultState();
  return {
    version: SCHEMA_VERSION,
    settings: Core.normalizeSettings({ ...defaultState.settings, ...(raw.settings || {}) }),
    bills: Array.isArray(raw.bills) ? raw.bills.map(bill => Core.normalizeBill(bill, period)) : [],
    movements: Array.isArray(raw.movements) ? raw.movements.map(Core.normalizeMovement) : [],
    filter: ['all', 'open', 'paid'].includes(raw.filter) ? raw.filter : 'all',
    movementFilter: ['all', 'expense', 'income'].includes(raw.movementFilter) ? raw.movementFilter : 'all',
    onboarded: raw.onboarded === true || Number(raw?.settings?.salary || 0) > 0
  };
}

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return migrateState(JSON.parse(current));
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const migrated = migrateState(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Mantém o app utilizável mesmo se um backup local antigo estiver corrompido.
  }
  return cloneDefaultState();
}

let state = loadState();

function persist() {
  state.version = SCHEMA_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeBills(period = currentPeriod()) {
  return Core.activeBills(state.bills, period);
}

function activeMovements(period = currentPeriod()) {
  return Core.movementsInPeriod(state.movements, period);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function formatDateShort(date) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function formatPeriod(period, withYear = false) {
  const [year, month] = String(period).split('-').map(Number);
  if (!year || !month) return period;
  const result = new Intl.DateTimeFormat('pt-BR', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(new Date(year, month - 1, 1));
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function dateForPeriodDay(period, day) {
  const [year, month] = String(period).split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(Number(day), last));
}

function currentSnapshot() {
  const period = currentPeriod();
  const key = Core.currentCycleKey(state.settings, today());
  const movement = Core.movementTotalsForCycle(key, state.movements, state.settings, period);
  const baseIncome = Core.incomeForCycle(key, state.settings);
  return {
    period,
    key,
    movement,
    baseIncome,
    income: Core.roundMoney(baseIncome + movement.income),
    bills: Core.billTotalForCycle(key, state.bills, state.settings, period),
    openBills: Core.openBillTotalForCycle(key, state.bills, state.settings, period),
    reserveIncoming: Core.reserveIncomingForCycle(key, state.bills, state.settings, period),
    reserveOutgoing: Core.reserveOutgoingForCycle(key, state.bills, state.settings, period),
    available: Core.actualAvailableForCycle(key, state.bills, state.movements, state.settings, period),
    monthBalance: Core.effectiveMonthBalance(state.bills, state.movements, state.settings, period)
  };
}

function render() {
  const snapshot = currentSnapshot();
  const salary = Number(state.settings.salary);
  const cfg = Core.payConfigByKey(snapshot.key, state.settings);
  const reservePlan = Core.automaticReservePlan(state.bills, state.settings, snapshot.period);
  const currentGap = reservePlan.find(item => item.toKey === snapshot.key);
  const nextPay = Core.nextPaymentDate(today(), state.settings);

  $('cycleLabel').textContent = `${cfg.label.toUpperCase()} · ${cfg.pct}%`;
  $('availableAmount').textContent = money(snapshot.available);
  $('cycleIncome').textContent = money(snapshot.income);
  $('cycleBills').textContent = money(snapshot.bills);
  $('cycleBills').title = snapshot.openBills > 0 ? `${money(snapshot.openBills)} ainda em aberto` : 'Todas as contas deste ciclo estão pagas';
  $('cycleVariable').textContent = money(snapshot.movement.expense);
  $('monthBalance').textContent = money(snapshot.monthBalance);
  $('nextPayDate').textContent = `Próximo pagamento · ${formatDateShort(nextPay)}`;

  const caption = [];
  if (snapshot.movement.expense > 0) caption.push(`${money(snapshot.movement.expense)} em gastos lançados`);
  if (snapshot.movement.income > 0) caption.push(`${money(snapshot.movement.income)} em entradas extras`);
  if (snapshot.reserveOutgoing > 0) caption.push(`${money(snapshot.reserveOutgoing)} protegidos para o próximo ciclo`);
  if (snapshot.reserveIncoming > 0) caption.push(`${money(snapshot.reserveIncoming)} recebidos da reserva anterior`);
  $('availableCaption').textContent = caption.length ? `livre após ${caption.join(' · ')}` : 'disponível depois das contas planejadas';

  if (!salary) {
    $('healthText').textContent = 'Configure sua renda';
    $('healthText').style.color = 'var(--warning)';
  } else if (currentGap?.uncovered > 0) {
    $('healthText').textContent = `Ainda faltam ${money(currentGap.uncovered)}`;
    $('healthText').style.color = 'var(--danger)';
  } else if (snapshot.available < 0) {
    $('healthText').textContent = `Ciclo no vermelho: ${money(Math.abs(snapshot.available))}`;
    $('healthText').style.color = 'var(--danger)';
  } else if (snapshot.available < snapshot.income * .15) {
    $('healthText').textContent = 'Margem curta até receber';
    $('healthText').style.color = 'var(--warning)';
  } else {
    $('healthText').textContent = snapshot.reserveOutgoing > 0 ? 'Reserva protegida' : 'Ciclo saudável';
    $('healthText').style.color = 'var(--accent)';
  }

  renderDailyDecision(snapshot);
  renderNextMonth();
  renderReservePlan(snapshot.period);
  renderCycles(snapshot.key, snapshot.period);
  renderInsights(snapshot);
  renderMonthBrowser();
  renderTimeline();
  renderMovements();
  renderBills(snapshot.period);
}

function renderDailyDecision(snapshot) {
  const salary = Number(state.settings.salary);
  const days = Core.daysUntilNextPayment(today(), state.settings);
  const nextPay = Core.nextPaymentDate(today(), state.settings);
  const daily = Core.dailySpendingLimit(snapshot.available, today(), state.settings);
  $('dailyLimit').textContent = money(daily);

  if (!salary) {
    $('dailyLimitCaption').textContent = 'Configure sua renda para calcular seu limite diário.';
  } else if (snapshot.available <= 0) {
    $('dailyLimitCaption').textContent = `Não há margem livre até ${formatDateShort(nextPay)}. O limite volta a crescer quando entrar dinheiro ou o planejamento for ajustado.`;
  } else {
    const registered = snapshot.movement.expense > 0 ? ` Já descontamos ${money(snapshot.movement.expense)} de gastos lançados neste ciclo.` : ' Registre os gastos do dia para manter esse número verdadeiro.';
    $('dailyLimitCaption').textContent = `${days} ${days === 1 ? 'dia' : 'dias'} até ${formatDateShort(nextPay)}.${registered}`;
  }
}

function renderNextMonth() {
  const nextPeriod = Core.shiftPeriod(currentPeriod(), 1);
  const projection = Core.projectionForPeriod(state.bills, state.settings, nextPeriod);
  const salary = Number(state.settings.salary);
  const monthName = formatPeriod(nextPeriod);
  if (!salary) {
    $('nextMonthBalance').textContent = 'Configure sua renda';
    $('nextMonthCaption').textContent = 'As recorrências aparecem aqui antes da virada do mês.';
    return;
  }
  $('nextMonthBalance').textContent = projection.balance >= 0 ? `${money(projection.balance)} livres` : `${money(Math.abs(projection.balance))} faltando`;
  if (projection.uncovered > 0) {
    $('nextMonthCaption').textContent = `${monthName}: ${money(projection.billsTotal)} em contas e ${money(projection.uncovered)} ainda sem cobertura entre pagamentos.`;
  } else if (projection.reserveTotal > 0) {
    $('nextMonthCaption').textContent = `${monthName}: ${money(projection.billsTotal)} em contas; ${money(projection.reserveTotal)} precisarão ser protegidos entre pagamentos.`;
  } else {
    $('nextMonthCaption').textContent = `${monthName}: ${money(projection.billsTotal)} em contas recorrentes, sem reserva extra necessária.`;
  }
}

function renderReservePlan(period) {
  const card = $('reserveCard');
  const host = $('reserveList');
  const plan = Core.automaticReservePlan(state.bills, state.settings, period);
  if (!plan.length) {
    card.hidden = true;
    host.innerHTML = '';
    return;
  }
  card.hidden = false;
  host.innerHTML = plan.map(item => {
    const from = Core.payConfigByKey(item.fromKey, state.settings);
    const to = Core.payConfigByKey(item.toKey, state.settings);
    const recurringBills = activeBills(period).filter(bill => bill.recurring && Core.cycleForDueDay(bill.dueDay, state.settings) === item.toKey).sort((a, b) => b.amount - a.amount);
    const context = recurringBills.length === 1 ? `“${escapeHtml(recurringBills[0].name)}” deixa` : `As recorrências do ${to.label} deixam`;
    if (item.amount <= 0) {
      return `<div class="reserve-item danger"><div class="reserve-flow"><strong>${context} um déficit de ${money(item.required)}.</strong><span>O ${from.label} também não tem sobra para financiar a diferença.</span></div><b>${money(item.uncovered)} descobertos</b></div>`;
    }
    return `<div class="reserve-item ${item.uncovered > 0 ? 'warning' : ''}"><div class="reserve-flow"><strong>${context} ${money(item.required)} faltando todo mês.</strong><span>Separe ${money(item.amount)} do ${from.label} para o próximo ${to.label}.</span>${item.uncovered > 0 ? `<span class="reserve-uncovered">Ainda ficam ${money(item.uncovered)} sem cobertura.</span>` : '<span>Essa reserva não é gasto: continua sendo seu dinheiro, só fica protegido.</span>'}</div><b>Reservar ${money(item.amount)}</b></div>`;
  }).join('');
}

function renderCycles(currentKey, period) {
  const host = $('cycleColumns');
  host.innerHTML = '';
  const plan = Core.automaticReservePlan(state.bills, state.settings, period);
  for (const key of ['p1', 'p2']) {
    const cfg = Core.payConfigByKey(key, state.settings);
    const bills = activeBills(period).filter(bill => Core.cycleForDueDay(bill.dueDay, state.settings) === key);
    const actualAvailable = Core.actualAvailableForCycle(key, state.bills, state.movements, state.settings, period);
    const movements = Core.movementTotalsForCycle(key, state.movements, state.settings, period);
    const incoming = plan.find(item => item.toKey === key && item.amount > 0);
    const outgoing = plan.find(item => item.fromKey === key && item.amount > 0);
    const panel = document.createElement('article');
    panel.className = `cycle-panel ${key === currentKey ? 'current' : ''}`;
    const billRows = bills.length ? bills.sort((a,b)=>a.dueDay-b.dueDay).map(bill => {
      const paid = Core.isBillPaid(bill, period);
      return `<div class="cycle-bill ${paid ? 'paid' : ''}"><span>${paid ? '✓ ' : ''}dia ${String(bill.dueDay).padStart(2,'0')} · ${escapeHtml(bill.name)}</span><span>${money(bill.amount)}</span></div>`;
    }).join('') : `<div class="empty-state compact"><span>Nenhuma conta alocada.</span></div>`;
    panel.innerHTML = `<header><div><strong>${cfg.label}</strong><span>dia ${cfg.day} · ${cfg.pct}% da renda</span></div><strong class="cycle-total">${money(actualAvailable)}</strong></header>${billRows}${movements.income ? `<div class="cycle-bill movement-income"><span>+ entradas extras</span><span>+ ${money(movements.income)}</span></div>` : ''}${movements.expense ? `<div class="cycle-bill movement-expense"><span>− gastos lançados</span><span>- ${money(movements.expense)}</span></div>` : ''}${incoming ? `<div class="cycle-bill cycle-reserve incoming"><span>↳ reserva anterior</span><span>+ ${money(incoming.amount)}</span></div>` : ''}${outgoing ? `<div class="cycle-bill cycle-reserve outgoing"><span>↗ proteger próximo ciclo</span><span>- ${money(outgoing.amount)}</span></div>` : ''}`;
    host.appendChild(panel);
  }
}

function renderInsights(snapshot) {
  const ratio = Core.recurringCommitmentRatio(state.bills, state.settings, snapshot.period);
  $('commitmentRatio').textContent = `${ratio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  $('commitmentHint').textContent = ratio >= 80 ? 'atenção: pouca flexibilidade' : 'da renda em recorrências';

  const openBills = activeBills(snapshot.period).filter(bill => !Core.isBillPaid(bill, snapshot.period));
  const openAmount = Core.roundMoney(openBills.reduce((sum, bill) => sum + bill.amount, 0));
  $('openBillsAmount').textContent = money(openAmount);
  $('openBillsCount').textContent = `${openBills.length} ${openBills.length === 1 ? 'conta' : 'contas'}`;

  const top = Core.topExpenseCategory(state.movements, snapshot.period);
  $('topExpenseCategory').textContent = top ? top.category : '—';
  $('topExpenseHint').textContent = top ? `${money(top.amount)} neste mês` : 'nenhum gasto lançado';

  const largest = Core.largestRecurringBill(state.bills, snapshot.period);
  $('largestRecurring').textContent = largest ? largest.name : '—';
  $('largestRecurringHint').textContent = largest ? `${money(largest.amount)} por mês` : 'nenhuma recorrência';

  const alert = $('smartAlert');
  const uncovered = Core.automaticReservePlan(state.bills, state.settings, snapshot.period).reduce((sum, item) => sum + item.uncovered, 0);
  if (snapshot.available < 0) {
    alert.hidden = false;
    alert.className = 'smart-alert danger';
    alert.innerHTML = `<strong>Ciclo no vermelho.</strong><span>Faltam ${money(Math.abs(snapshot.available))} mesmo depois das reservas e movimentos registrados.</span>`;
  } else if (uncovered > 0) {
    alert.hidden = false;
    alert.className = 'smart-alert warning';
    alert.innerHTML = `<strong>Existe um déficit estrutural.</strong><span>${money(uncovered)} das recorrências ainda não conseguem ser cobertos pelos dois pagamentos.</span>`;
  } else if (ratio >= 90) {
    alert.hidden = false;
    alert.className = 'smart-alert warning';
    alert.innerHTML = `<strong>${ratio}% da renda já nasce comprometida.</strong><span>Qualquer gasto variável pesa bastante. Vale reduzir recorrências antes de assumir novas.</span>`;
  } else {
    alert.hidden = true;
    alert.innerHTML = '';
  }
}

function renderMonthBrowser() {
  const projection = Core.projectionForPeriod(state.bills, state.settings, viewPeriod);
  const movements = Core.movementTotalsForPeriod(state.movements, viewPeriod);
  const effective = Core.effectiveMonthBalance(state.bills, state.movements, state.settings, viewPeriod);
  $('viewMonthTitle').textContent = formatPeriod(viewPeriod, true);
  $('viewMonthBills').textContent = money(projection.billsTotal);
  $('viewMonthIncome').textContent = money(movements.income);
  $('viewMonthExpenses').textContent = money(movements.expense);
  $('viewMonthBalance').textContent = money(effective);
  $('viewMonthBalance').classList.toggle('negative-text', effective < 0);
}

function renderTimeline() {
  const host = $('timelineList');
  const now = today();
  now.setHours(0,0,0,0);
  const periods = [currentPeriod(), Core.shiftPeriod(currentPeriod(), 1)];
  const events = [];
  for (const period of periods) {
    const pays = [Core.payConfigByKey('p1', state.settings), Core.payConfigByKey('p2', state.settings)];
    pays.forEach(pay => events.push({ type: 'pay', date: dateForPeriodDay(period, pay.day), title: pay.label, subtitle: `${pay.pct}% da renda`, amount: Core.incomeForCycle(pay.key, state.settings) }));
    activeBills(period).forEach(bill => events.push({ type: 'bill', date: dateForPeriodDay(period, bill.dueDay), title: bill.name, subtitle: `${bill.category}${Core.isBillPaid(bill, period) ? ' · paga' : ''}`, amount: bill.amount, paid: Core.isBillPaid(bill, period) }));
  }
  const future = events.filter(event => event.date >= now).sort((a,b) => a.date - b.date || (a.type === 'pay' ? -1 : 1)).slice(0, 10);
  if (!future.length) {
    host.innerHTML = '<div class="empty-state"><span>Nenhum evento próximo.</span></div>';
    return;
  }
  host.innerHTML = future.map(event => `<div class="timeline-row ${event.type} ${event.paid ? 'paid' : ''}"><div class="timeline-date"><b>${String(event.date.getDate()).padStart(2,'0')}</b><span>${new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(event.date).replace('.','')}</span></div><div class="timeline-copy"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.subtitle)}</span></div><b class="timeline-amount ${event.type === 'pay' ? 'positive-text' : ''}">${event.type === 'pay' ? '+' : '-'} ${money(event.amount)}</b></div>`).join('');
}

function renderMovements() {
  document.querySelectorAll('.movement-segment').forEach(button => button.classList.toggle('active', button.dataset.movementFilter === state.movementFilter));
  const host = $('movementsList');
  const period = currentPeriod();
  const totals = Core.movementTotalsForPeriod(state.movements, period);
  $('movementSummary').innerHTML = `<span><b>${money(totals.expense)}</b> gastos</span><span><b>${money(totals.income)}</b> entradas extras</span>`;
  const items = activeMovements(period).filter(item => state.movementFilter === 'all' || item.type === state.movementFilter).sort((a,b) => b.date.localeCompare(a.date));
  if (!items.length) {
    host.appendChild($('emptyMovementTemplate').content.cloneNode(true));
    return;
  }
  host.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = `movement-row ${item.type}`;
    const date = new Date(`${item.date}T12:00:00`);
    row.innerHTML = `<div class="movement-icon">${item.type === 'income' ? '+' : '−'}</div><div class="movement-copy"><strong>${escapeHtml(item.name)}</strong><span>${formatDateLong(date)} · ${escapeHtml(item.category)} · ${Core.payConfigByKey(Core.movementCycleKey(item, state.settings), state.settings).label}</span></div><b class="movement-amount ${item.type === 'income' ? 'positive-text' : ''}">${item.type === 'income' ? '+' : '-'} ${money(item.amount)}</b><button class="row-action movement-delete" type="button" aria-label="Excluir movimento">✕</button>`;
    row.querySelector('.movement-delete').addEventListener('click', () => {
      if (!confirm(`Excluir “${item.name}” de ${money(item.amount)}?`)) return;
      state.movements = state.movements.filter(current => current.id !== item.id);
      persist();
      $('purchaseResult').hidden = true;
      render();
    });
    host.appendChild(row);
  });
}

function renderBills(period = currentPeriod()) {
  document.querySelectorAll('.segment').forEach(button => button.classList.toggle('active', button.dataset.filter === state.filter));
  const host = $('billsList');
  host.innerHTML = '';
  const filtered = activeBills(period).filter(bill => {
    if (state.filter === 'all') return true;
    const paid = Core.isBillPaid(bill, period);
    return state.filter === 'paid' ? paid : !paid;
  }).sort((a,b) => a.dueDay - b.dueDay);
  if (!filtered.length) {
    host.appendChild($('emptyTemplate').content.cloneNode(true));
    return;
  }
  filtered.forEach(bill => {
    const paid = Core.isBillPaid(bill, period);
    const row = document.createElement('div');
    row.className = `bill-row ${paid ? 'paid' : ''}`;
    const cycle = Core.payConfigByKey(Core.cycleForDueDay(bill.dueDay, state.settings), state.settings);
    row.innerHTML = `<input class="bill-check" type="checkbox" ${paid ? 'checked' : ''} aria-label="Marcar ${escapeHtml(bill.name)} como paga" /><div><div class="bill-title">${escapeHtml(bill.name)}</div><div class="bill-meta">vence dia ${String(bill.dueDay).padStart(2,'0')} · ${escapeHtml(bill.category)} · ${cycle.label}${bill.recurring ? ' · mensal' : ' · só este mês'}</div></div><div class="bill-amount">${money(bill.amount)}</div><div class="bill-actions"><button class="row-action edit-btn" type="button">Editar</button><button class="row-action delete-btn" type="button" aria-label="Excluir ${escapeHtml(bill.name)}">✕</button></div>`;
    row.querySelector('.bill-check').addEventListener('change', event => {
      state.bills = state.bills.map(item => item.id === bill.id ? Core.setBillPaid(item, period, event.target.checked) : item);
      persist();
      render();
    });
    row.querySelector('.edit-btn').addEventListener('click', () => openBillDialog(bill));
    row.querySelector('.delete-btn').addEventListener('click', () => {
      if (!confirm(`Excluir a conta “${bill.name}”?`)) return;
      state.bills = state.bills.filter(item => item.id !== bill.id);
      persist();
      render();
    });
    host.appendChild(row);
  });
}

function openSettings() {
  const settings = state.settings;
  $('salaryInput').value = settings.salary || '';
  $('payDay1').value = settings.payDay1;
  $('payDay2').value = settings.payDay2;
  $('split1').value = settings.split1;
  $('split2').value = settings.split2;
  validateSettingsForm();
  $('settingsDialog').showModal();
}

function settingsFromForm() {
  return { salary: Number($('salaryInput').value), payDay1: Number($('payDay1').value), payDay2: Number($('payDay2').value), split1: Number($('split1').value), split2: Number($('split2').value) };
}

function validateSettingsForm() {
  const result = Core.validateSettings(settingsFromForm());
  if (!result.splitsValid) {
    $('splitHint').textContent = `Os percentuais somam ${Number($('split1').value) + Number($('split2').value)}%. Precisam dar 100%.`;
  } else if (!result.paydaysValid) {
    $('splitHint').textContent = 'As duas datas precisam ser diferentes e ficar entre os dias 1 e 28.';
  } else {
    $('splitHint').textContent = 'Perfeito: datas válidas e os pagamentos somam 100%.';
  }
  $('splitHint').classList.toggle('error', !result.ok);
  $('saveSettingsBtn').disabled = !result.ok;
  return result.ok;
}

function resetBillForm() {
  editingBillId = null;
  $('billForm').reset();
  $('billRecurring').checked = true;
  $('billDialogEyebrow').textContent = 'NOVA CONTA';
  $('billDialogTitle').textContent = 'Planejar vencimento';
  $('saveBillBtn').textContent = 'Adicionar';
}

function openBillDialog(bill = null) {
  resetBillForm();
  if (bill) {
    editingBillId = bill.id;
    $('billName').value = bill.name;
    $('billAmount').value = bill.amount;
    $('billDueDay').value = bill.dueDay;
    $('billCategory').value = bill.category;
    $('billRecurring').checked = bill.recurring;
    $('billDialogEyebrow').textContent = 'EDITAR CONTA';
    $('billDialogTitle').textContent = 'Atualizar planejamento';
    $('saveBillBtn').textContent = 'Salvar alterações';
  }
  $('billDialog').showModal();
}

function openMovementDialog(type = 'expense') {
  $('movementForm').reset();
  $('movementType').value = type;
  $('movementDate').value = localDateString();
  $('movementCategory').value = type === 'income' ? 'Renda extra' : 'Alimentação';
  syncMovementType();
  $('movementDialog').showModal();
  setTimeout(() => $('movementName').focus(), 50);
}

function syncMovementType() {
  const income = $('movementType').value === 'income';
  $('movementDialogTitle').textContent = income ? 'Registrar entrada extra' : 'Registrar gasto';
  $('saveMovementBtn').textContent = income ? 'Adicionar entrada' : 'Registrar gasto';
}

function renderPurchaseResult(result, name) {
  const host = $('purchaseResult');
  const label = name ? `“${escapeHtml(name)}”` : 'Essa compra';
  host.hidden = false;
  if (result.status === 'fits') {
    host.className = 'simulator-result good';
    host.innerHTML = `<strong>${label} cabe nesta quinzena.</strong><span>Depois da compra, ficam ${money(result.afterPurchase)} livres e a média diária cai para ${money(result.dailyAfter)}.</span>`;
  } else if (result.status === 'invades_reserve') {
    host.className = 'simulator-result warning';
    host.innerHTML = `<strong>Só cabe quebrando uma reserva.</strong><span>${label} usaria ${money(result.reserveInvaded)} já protegidos para o próximo pagamento. O Quinzena não considera esse dinheiro livre.</span>`;
  } else {
    host.className = 'simulator-result danger';
    host.innerHTML = `<strong>Não cabe nesta quinzena.</strong><span>Mesmo consumindo toda a reserva, ainda faltariam ${money(result.shortfall)}.</span>`;
  }
}

function downloadText(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function shareSummary() {
  const snapshot = currentSnapshot();
  const daily = Core.dailySpendingLimit(snapshot.available, today(), state.settings);
  const next = Core.projectionForPeriod(state.bills, state.settings, Core.shiftPeriod(currentPeriod(), 1));
  const text = `Quinzena — resumo\nLivre agora: ${money(snapshot.available)}\nMédia até o próximo pagamento: ${money(daily)}/dia\nReserva protegida: ${money(snapshot.reserveOutgoing)}\nPróximo mês: ${money(next.balance)} de saldo previsto`;
  if (navigator.share) {
    navigator.share({ title: 'Meu resumo no Quinzena', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert('Resumo copiado.'));
  }
}

$('openSettings').addEventListener('click', openSettings);
$('shareBtn').addEventListener('click', shareSummary);
$('addBillBtn').addEventListener('click', () => openBillDialog());
$('quickExpenseBtn').addEventListener('click', () => openMovementDialog('expense'));
$('quickIncomeBtn').addEventListener('click', () => openMovementDialog('income'));
$('movementType').addEventListener('change', syncMovementType);

$('startOnboardingBtn').addEventListener('click', () => {
  state.onboarded = true;
  persist();
  $('welcomeDialog').close();
  setTimeout(openSettings, 80);
});

$('loadDemoBtn').addEventListener('click', () => {
  const period = currentPeriod();
  state = {
    ...cloneDefaultState(),
    onboarded: true,
    settings: { salary: 3200, payDay1: 5, payDay2: 20, split1: 60, split2: 40 },
    bills: [
      { id: 'demo-moradia', name: 'Aluguel', amount: 900, dueDay: 8, category: 'Moradia', recurring: true, paidPeriods: [] },
      { id: 'demo-internet', name: 'Internet', amount: 119.90, dueDay: 12, category: 'Moradia', recurring: true, paidPeriods: [] },
      { id: 'demo-energia', name: 'Energia', amount: 185, dueDay: 22, category: 'Moradia', recurring: true, paidPeriods: [] },
      { id: 'demo-curso', name: 'Curso', amount: 280, dueDay: 25, category: 'Educação', recurring: true, paidPeriods: [] }
    ].map(bill => Core.normalizeBill(bill, period)),
    movements: [
      Core.normalizeMovement({ id: 'demo-mercado', type: 'expense', name: 'Mercado', amount: 83.40, date: localDateString(), category: 'Alimentação' }),
      Core.normalizeMovement({ id: 'demo-freela', type: 'income', name: 'Freela', amount: 150, date: localDateString(), category: 'Renda extra' })
    ]
  };
  persist();
  $('welcomeDialog').close();
  render();
});

['salaryInput', 'payDay1', 'payDay2', 'split1', 'split2'].forEach(id => $(id).addEventListener('input', validateSettingsForm));

$('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!validateSettingsForm()) return;
  state.settings = Core.normalizeSettings(settingsFromForm());
  persist();
  $('settingsDialog').close();
  $('purchaseResult').hidden = true;
  render();
});

$('billForm').addEventListener('submit', event => {
  event.preventDefault();
  const period = currentPeriod();
  const recurring = $('billRecurring').checked;
  const existing = editingBillId ? state.bills.find(item => item.id === editingBillId) : null;
  const nextBill = Core.normalizeBill({
    id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    name: $('billName').value.trim(),
    amount: Number($('billAmount').value),
    dueDay: Number($('billDueDay').value),
    category: $('billCategory').value,
    recurring,
    activePeriod: recurring ? null : (existing?.activePeriod || period),
    paidPeriods: existing?.paidPeriods || []
  }, period);
  if (existing) state.bills = state.bills.map(item => item.id === existing.id ? nextBill : item);
  else state.bills.push(nextBill);
  persist();
  $('billDialog').close();
  resetBillForm();
  $('purchaseResult').hidden = true;
  render();
});

$('movementForm').addEventListener('submit', event => {
  event.preventDefault();
  const movement = Core.normalizeMovement({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: $('movementType').value,
    name: $('movementName').value.trim(),
    amount: Number($('movementAmount').value),
    date: $('movementDate').value,
    category: $('movementCategory').value
  });
  if (!movement.name || movement.amount <= 0) return;
  state.movements.push(movement);
  persist();
  $('movementDialog').close();
  $('purchaseResult').hidden = true;
  render();
});

$('billDialog').addEventListener('close', resetBillForm);

document.querySelectorAll('.segment').forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  persist();
  renderBills();
}));

document.querySelectorAll('.movement-segment').forEach(button => button.addEventListener('click', () => {
  state.movementFilter = button.dataset.movementFilter;
  persist();
  renderMovements();
}));

$('purchaseSimulator').addEventListener('submit', event => {
  event.preventDefault();
  const host = $('purchaseResult');
  if (!Number(state.settings.salary)) {
    host.hidden = false;
    host.className = 'simulator-result danger';
    host.innerHTML = '<strong>Configure sua renda primeiro.</strong><span>O simulador precisa saber quanto entra em cada pagamento.</span>';
    return;
  }
  const amount = Number($('purchaseAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const snapshot = currentSnapshot();
  renderPurchaseResult(Core.purchaseDecision(amount, snapshot.available, snapshot.reserveOutgoing, today(), state.settings), $('purchaseName').value.trim());
});

$('prevMonthBtn').addEventListener('click', () => {
  viewPeriod = Core.shiftPeriod(viewPeriod, -1);
  renderMonthBrowser();
});
$('nextMonthBtn').addEventListener('click', () => {
  viewPeriod = Core.shiftPeriod(viewPeriod, 1);
  renderMonthBrowser();
});

$('csvExportBtn').addEventListener('click', () => {
  const content = '\ufeffCONTAS\r\n' + Core.billsToCsv(state.bills, state.settings, currentPeriod()) + '\r\n\r\nMOVIMENTOS\r\n' + Core.movementsToCsv(state.movements, state.settings, currentPeriod());
  downloadText(content, 'text/csv;charset=utf-8', `quinzena-${currentPeriod()}.csv`);
});

$('exportBtn').addEventListener('click', () => {
  downloadText(JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'application/json', `quinzena-backup-${localDateString()}.json`);
});

$('importInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported.settings || !Array.isArray(imported.bills)) throw new Error('Formato inválido');
    const migrated = migrateState(imported);
    if (!Core.validateSettings(migrated.settings).ok) throw new Error('Configuração inválida');
    state = migrated;
    persist();
    viewPeriod = currentPeriod();
    $('purchaseResult').hidden = true;
    render();
  } catch {
    alert('Não consegui importar esse backup. Confira se ele foi exportado pelo Quinzena.');
  } finally {
    event.target.value = '';
  }
});

$('resetDataBtn').addEventListener('click', () => {
  if (!confirm('Zerar todos os dados do Quinzena neste aparelho? Essa ação não pode ser desfeita sem um backup.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = cloneDefaultState();
  viewPeriod = currentPeriod();
  persist();
  render();
  setTimeout(() => $('welcomeDialog').showModal(), 100);
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('installBtn').hidden = false;
});

$('installBtn').addEventListener('click', async () => {
  if (!installPrompt) {
    alert('No Chrome, use o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $('installBtn').hidden = true;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('installBtn').hidden = true;
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').then(registration => registration.update()).catch(() => {});
}

render();
if (!state.onboarded && !state.settings.salary) setTimeout(() => $('welcomeDialog').showModal(), 180);
else if (!state.settings.salary) setTimeout(openSettings, 250);