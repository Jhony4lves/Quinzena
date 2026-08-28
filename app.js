const STORAGE_KEY = 'quinzena.v0.2';
const LEGACY_STORAGE_KEY = 'quinzena.v0.1';
const SCHEMA_VERSION = 2;
const Core = window.QuinzenaCore;

const defaultState = {
  version: SCHEMA_VERSION,
  settings: { ...Core.DEFAULT_SETTINGS },
  bills: [],
  filter: 'all'
};

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const today = () => new Date();
const currentPeriod = () => Core.periodKey(today());

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
    filter: ['all', 'open', 'paid'].includes(raw.filter) ? raw.filter : 'all'
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
  const available = Core.availableForCycle(currentKey, state.bills, state.settings, period);
  const monthBalance = Core.monthBalance(state.bills, state.settings, period);

  $('cycleLabel').textContent = `${currentCfg.label.toUpperCase()} · ${currentCfg.pct}%`;
  $('availableAmount').textContent = money(available);
  $('cycleIncome').textContent = money(cycleIncome);
  $('cycleBills').textContent = money(cycleBills);
  $('cycleBills').title = cycleOpenBills > 0 ? `${money(cycleOpenBills)} ainda em aberto` : 'Todas as contas deste ciclo estão pagas';
  $('monthBalance').textContent = money(monthBalance);
  $('nextPayDate').textContent = `Próximo pagamento · ${formatDateShort(nextPaymentDate())}`;

  if (!salary) {
    $('healthText').textContent = 'Configure sua renda';
    $('healthText').style.color = 'var(--warning)';
  } else if (available < 0) {
    $('healthText').textContent = `Faltam ${money(Math.abs(available))}`;
    $('healthText').style.color = 'var(--danger)';
  } else if (available < cycleIncome * .15) {
    $('healthText').textContent = 'Ciclo apertado';
    $('healthText').style.color = 'var(--warning)';
  } else {
    $('healthText').textContent = 'Ciclo saudável';
    $('healthText').style.color = 'var(--accent)';
  }

  renderCycles(currentKey, period);
  renderBills(period);
}

function renderCycles(currentKey, period) {
  const host = $('cycleColumns');
  host.innerHTML = '';
  for (const key of ['p1', 'p2']) {
    const cfg = Core.payConfigByKey(key, state.settings);
    const bills = activeBills().filter(bill => Core.cycleForDueDay(bill.dueDay, state.settings) === key);
    const income = Core.incomeForCycle(key, state.settings);
    const total = Core.billTotalForCycle(key, state.bills, state.settings, period);
    const panel = document.createElement('article');
    panel.className = `cycle-panel ${key === currentKey ? 'current' : ''}`;
    panel.innerHTML = `
      <header>
        <div><strong>${cfg.label}</strong><span>dia ${cfg.day} · ${cfg.pct}% da renda</span></div>
        <strong class="cycle-total">${money(income - total)}</strong>
      </header>
      ${bills.length ? bills.sort((a,b)=>a.dueDay-b.dueDay).map(bill => {
        const paid = Core.isBillPaid(bill, period);
        return `<div class="cycle-bill ${paid ? 'paid' : ''}"><span>${paid ? '✓ ' : ''}dia ${String(bill.dueDay).padStart(2,'0')} · ${escapeHtml(bill.name)}</span><span>${money(bill.amount)}</span></div>`;
      }).join('') : `<div class="empty-state"><span>Nenhuma conta alocada.</span></div>`}
    `;
    host.appendChild(panel);
  }
}

function renderBills(period = currentPeriod()) {
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
      <button class="delete-btn" aria-label="Excluir">✕</button>
    `;
    row.querySelector('.bill-check').addEventListener('change', event => {
      state.bills = state.bills.map(item => item.id === bill.id
        ? Core.setBillPaid(item, period, event.target.checked)
        : item);
      persist();
      render();
    });
    row.querySelector('.delete-btn').addEventListener('click', () => {
      state.bills = state.bills.filter(item => item.id !== bill.id);
      persist();
      render();
    });
    host.appendChild(row);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
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

$('openSettings').addEventListener('click', openSettings);
$('addBillBtn').addEventListener('click', () => $('billDialog').showModal());
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
  const recurring = $('billRecurring').checked;
  state.bills.push(Core.normalizeBill({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: $('billName').value.trim(),
    amount: Number($('billAmount').value),
    dueDay: Number($('billDueDay').value),
    category: $('billCategory').value,
    recurring,
    activePeriod: recurring ? null : currentPeriod(),
    paidPeriods: []
  }, currentPeriod()));
  persist();
  event.target.reset();
  $('billRecurring').checked = true;
  $('billDialog').close();
  render();
});

document.querySelectorAll('.segment').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.segment').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  state.filter = button.dataset.filter;
  persist();
  renderBills();
}));

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
if (!state.settings.salary) setTimeout(openSettings, 250);
