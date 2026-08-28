const STORAGE_KEY = 'quinzena.v0.2';
const LEGACY_STORAGE_KEY = 'quinzena.v0.1';
const SCHEMA_VERSION = 2;
const Core = window.QuinzenaCore;

const defaultState = {
  version: SCHEMA_VERSION,
  settings: { ...Core.DEFAULT_SETTINGS },
  bills: [],
  filter: 'all',
  onboarded: false
};

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const today = () => new Date();
const currentPeriod = () => Core.periodKey(today());
let editingBillId = null;

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
    filter: ['all', 'open', 'paid'].includes(raw.filter) ? raw.filter : 'all',
    onboarded: raw.onboarded === true || Number(raw?.settings?.salary || 0) > 0
  };
}

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return migrateState(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = migrateState(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Se o armazenamento estiver corrompido, inicia limpo sem apagar o original.
  }
  return cloneDefaultState();
}

let state = loadState();

function persist() {
  state.version = SCHEMA_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeBills() {
  return Core.activeBills(state.bills, currentPeriod());
}

function nextPaymentDate() {
  const now = today();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const pays = Core.normalizedPaydays(state.settings);
  const nextInMonth = pays.find(pay => pay.day > day);
  const chosen = nextInMonth || pays[0];
  return nextInMonth
    ? new Date(year, month, chosen.day)
    : new Date(year, month + 1, chosen.day);
}

function formatDateShort(date) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function render() {
  const period = currentPeriod();
  const salary = Number(state.settings.salary);
  const currentKey = Core.currentCycleKey(state.settings, today());
  const currentCfg = Core.payConfigByKey(currentKey, state.settings);
  const cycleIncome = Core.incomeForCycle(currentKey, state.settings);
  const cycleBills = Core.billTotalForCycle(currentKey, state.bills, state.settings, period);
  const cycleOpenBills = Core.openBillTotalForCycle(currentKey, state.bills, state.settings, period);
  const available = Core.plannedAvailableForCycle(currentKey, state.bills, state.settings, period);
  const reserveIncoming = Core.reserveIncomingForCycle(currentKey, state.bills, state.settings, period);
  const reserveOutgoing = Core.reserveOutgoingForCycle(currentKey, state.bills, state.settings, period);
  const monthBalance = Core.monthBalance(state.bills, state.settings, period);
  const reservePlan = Core.automaticReservePlan(state.bills, state.settings, period);
  const currentGap = reservePlan.find(item => item.toKey === currentKey);

  $('cycleLabel').textContent = `${currentCfg.label.toUpperCase()} · ${currentCfg.pct}%`;
  $('availableAmount').textContent = money(available);
  $('cycleIncome').textContent = money(cycleIncome);
  $('cycleBills').textContent = money(cycleBills);
  $('cycleBills').title = cycleOpenBills > 0 ? `${money(cycleOpenBills)} ainda em aberto` : 'Todas as contas deste ciclo estão pagas';
  $('monthBalance').textContent = money(monthBalance);
  $('nextPayDate').textContent = `Próximo pagamento · ${formatDateShort(nextPaymentDate())}`;

  if (reserveOutgoing > 0) {
    $('availableCaption').textContent = `disponível após contas e ${money(reserveOutgoing)} reservados para o próximo ciclo`;
  } else if (reserveIncoming > 0) {
    $('availableCaption').textContent = `disponível já contando ${money(reserveIncoming)} da reserva do ciclo anterior`;
  } else {
    $('availableCaption').textContent = 'disponível depois das contas planejadas';
  }

  if (!salary) {
    $('healthText').textContent = 'Configure sua renda';
    $('healthText').style.color = 'var(--warning)';
  } else if (currentGap?.uncovered > 0) {
    $('healthText').textContent = `Ainda faltam ${money(currentGap.uncovered)}`;
    $('healthText').style.color = 'var(--danger)';
  } else if (available < 0) {
    $('healthText').textContent = `Faltam ${money(Math.abs(available))}`;
    $('healthText').style.color = 'var(--danger)';
  } else if (available < cycleIncome * .15) {
    $('healthText').textContent = reserveIncoming > 0 ? 'Ciclo equilibrado pela reserva' : 'Ciclo apertado';
    $('healthText').style.color = 'var(--warning)';
  } else {
    $('healthText').textContent = reserveOutgoing > 0 ? 'Reserva do próximo ciclo protegida' : 'Ciclo saudável';
    $('healthText').style.color = 'var(--accent)';
  }

  renderReservePlan(period);
  renderCycles(currentKey, period);
  renderBills(period);
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
    const recurringBills = activeBills()
      .filter(bill => bill.recurring && Core.cycleForDueDay(bill.dueDay, state.settings) === item.toKey)
      .sort((a, b) => b.amount - a.amount);
    const billContext = recurringBills.length === 1
      ? `A conta recorrente “${escapeHtml(recurringBills[0].name)}” deixa`
      : `As contas recorrentes do ${to.label} deixam`;

    if (item.amount <= 0) {
      return `<div class="reserve-item danger">
        <div class="reserve-flow"><strong>${billContext} um déficit de ${money(item.required)}.</strong><span>O ${from.label} também não tem sobra recorrente para criar essa reserva.</span></div>
        <b>${money(item.uncovered)} descobertos</b>
      </div>`;
    }

    const uncovered = item.uncovered > 0
      ? `<span class="reserve-uncovered">Ainda ficam ${money(item.uncovered)} sem cobertura mensal.</span>`
      : `<span>Assim o próximo ${to.label} já começa com esse valor protegido.</span>`;

    return `<div class="reserve-item ${item.uncovered > 0 ? 'warning' : ''}">
      <div class="reserve-flow">
        <strong>${billContext} ${money(item.required)} faltando todo mês.</strong>
        <span>Separe ${money(item.amount)} do ${from.label} para o próximo ${to.label}.</span>
        ${uncovered}
      </div>
      <b>Reservar ${money(item.amount)}</b>
    </div>`;
  }).join('');
}

function renderCycles(currentKey, period) {
  const host = $('cycleColumns');
  host.innerHTML = '';
  const plan = Core.automaticReservePlan(state.bills, state.settings, period);

  for (const key of ['p1', 'p2']) {
    const cfg = Core.payConfigByKey(key, state.settings);
    const bills = activeBills().filter(bill => Core.cycleForDueDay(bill.dueDay, state.settings) === key);
    const plannedAvailable = Core.plannedAvailableForCycle(key, state.bills, state.settings, period);
    const incoming = plan.find(item => item.toKey === key && item.amount > 0);
    const outgoing = plan.find(item => item.fromKey === key && item.amount > 0);
    const panel = document.createElement('article');
    panel.className = `cycle-panel ${key === currentKey ? 'current' : ''}`;

    const billRows = bills.length
      ? bills.sort((a,b)=>a.dueDay-b.dueDay).map(bill => {
          const paid = Core.isBillPaid(bill, period);
          return `<div class="cycle-bill ${paid ? 'paid' : ''}"><span>${paid ? '✓ ' : ''}dia ${String(bill.dueDay).padStart(2,'0')} · ${escapeHtml(bill.name)}</span><span>${money(bill.amount)}</span></div>`;
        }).join('')
      : `<div class="empty-state"><span>Nenhuma conta alocada.</span></div>`;

    const incomingRow = incoming
      ? `<div class="cycle-bill cycle-reserve incoming"><span>↳ reserva do ${Core.payConfigByKey(incoming.fromKey, state.settings).label}</span><span>+ ${money(incoming.amount)}</span></div>`
      : '';
    const outgoingRow = outgoing
      ? `<div class="cycle-bill cycle-reserve outgoing"><span>↗ reservar p/ próximo ${Core.payConfigByKey(outgoing.toKey, state.settings).label}</span><span>- ${money(outgoing.amount)}</span></div>`
      : '';

    panel.innerHTML = `
      <header>
        <div><strong>${cfg.label}</strong><span>dia ${cfg.day} · ${cfg.pct}% da renda</span></div>
        <strong class="cycle-total">${money(plannedAvailable)}</strong>
      </header>
      ${billRows}
      ${incomingRow}
      ${outgoingRow}
    `;
    host.appendChild(panel);
  }
}

function renderBills(period = currentPeriod()) {
  document.querySelectorAll('.segment').forEach(button => button.classList.toggle('active', button.dataset.filter === state.filter));
  const host = $('billsList');
  host.innerHTML = '';
  const filtered = activeBills()
    .filter(bill => {
      if (state.filter === 'all') return true;
      const paid = Core.isBillPaid(bill, period);
      return state.filter === 'paid' ? paid : !paid;
    })
    .sort((a,b) => a.dueDay - b.dueDay);

  if (!filtered.length) {
    host.appendChild($('emptyTemplate').content.cloneNode(true));
    return;
  }

  for (const bill of filtered) {
    const paid = Core.isBillPaid(bill, period);
    const row = document.createElement('div');
    row.className = `bill-row ${paid ? 'paid' : ''}`;
    const cycle = Core.payConfigByKey(Core.cycleForDueDay(bill.dueDay, state.settings), state.settings);
    row.innerHTML = `
      <input class="bill-check" type="checkbox" ${paid ? 'checked' : ''} aria-label="Marcar ${escapeHtml(bill.name)} como paga" />
      <div>
        <div class="bill-title">${escapeHtml(bill.name)}</div>
        <div class="bill-meta">vence dia ${String(bill.dueDay).padStart(2,'0')} · ${escapeHtml(bill.category)} · ${cycle.label}${bill.recurring ? ' · mensal' : ' · só este mês'}</div>
      </div>
      <div class="bill-amount">${money(bill.amount)}</div>
      <div class="bill-actions">
        <button class="row-action edit-btn" type="button" aria-label="Editar ${escapeHtml(bill.name)}">Editar</button>
        <button class="row-action delete-btn" type="button" aria-label="Excluir ${escapeHtml(bill.name)}">✕</button>
      </div>
    `;
    row.querySelector('.bill-check').addEventListener('change', event => {
      state.bills = state.bills.map(item => item.id === bill.id
        ? Core.setBillPaid(item, period, event.target.checked)
        : item);
      persist();
      render();
    });
    row.querySelector('.edit-btn').addEventListener('click', () => openBillDialog(bill));
    row.querySelector('.delete-btn').addEventListener('click', () => {
      state.bills = state.bills.filter(item => item.id !== bill.id);
      persist();
      render();
    });
    host.appendChild(row);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
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
  return {
    salary: Number($('salaryInput').value),
    payDay1: Number($('payDay1').value),
    payDay2: Number($('payDay2').value),
    split1: Number($('split1').value),
    split2: Number($('split2').value)
  };
}

function validateSettingsForm() {
  const result = Core.validateSettings(settingsFromForm());
  if (!result.splitsValid) {
    const sum = Number($('split1').value) + Number($('split2').value);
    $('splitHint').textContent = `Os percentuais somam ${sum}%. Precisam dar 100%.`;
  } else if (!result.paydaysValid) {
    $('splitHint').textContent = 'As duas datas de pagamento precisam ser diferentes e ficar entre os dias 1 e 28.';
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

$('openSettings').addEventListener('click', openSettings);
$('addBillBtn').addEventListener('click', () => openBillDialog());
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
    ].map(bill => Core.normalizeBill(bill, period))
  };
  persist();
  $('welcomeDialog').close();
  render();
});
['salaryInput', 'payDay1', 'payDay2', 'split1', 'split2'].forEach(id => $(id).addEventListener('input', validateSettingsForm));

$('settingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateSettingsForm()) return;
  state.settings = Core.normalizeSettings(settingsFromForm());
  persist();
  $('settingsDialog').close();
  render();
});

$('billForm').addEventListener('submit', (event) => {
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
  render();
});

$('billDialog').addEventListener('close', () => resetBillForm());

document.querySelectorAll('.segment').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.segment').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  state.filter = button.dataset.filter;
  persist();
  renderBills();
}));

$('csvExportBtn').addEventListener('click', () => {
  const csv = '\ufeff' + Core.billsToCsv(state.bills, state.settings, currentPeriod());
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `quinzena-contas-${currentPeriod()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
});

$('exportBtn').addEventListener('click', () => {
  const payload = { ...state, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `quinzena-backup-${new Date().toISOString().slice(0,10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

$('importInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported.settings || !Array.isArray(imported.bills)) throw new Error('Formato inválido');
    const migrated = migrateState(imported);
    if (!Core.validateSettings(migrated.settings).ok) throw new Error('Configuração inválida');
    state = migrated;
    persist();
    render();
  } catch {
    alert('Não consegui importar esse backup. Confira se é um arquivo válido do Quinzena.');
  } finally {
    event.target.value = '';
  }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
if (!state.onboarded && !state.settings.salary) setTimeout(() => $('welcomeDialog').showModal(), 180);
else if (!state.settings.salary) setTimeout(openSettings, 250);
