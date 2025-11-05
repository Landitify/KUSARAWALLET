// script.js
// Uses firebase compat (loaded in index.html).

// ----- UI Elements -----
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const signinBtn = document.getElementById('signinBtn');
const signOutBtn = document.getElementById('signOutBtn');

const userBar = document.getElementById('userBar');
const userEmail = document.getElementById('userEmail');
const dashboard = document.getElementById('dashboard');
const addBtn = document.getElementById('addBtn');
const addBtnDesktop = document.getElementById('addBtnDesktop');
const addPanel = document.getElementById('addPanel');
const saveTx = document.getElementById('saveTx');
const cancelTx = document.getElementById('cancelTx');

const txType = document.getElementById('txType');
const txAmount = document.getElementById('txAmount');
const txDate = document.getElementById('txDate');
const txCategory = document.getElementById('txCategory');
const txDesc = document.getElementById('txDesc');

const txBody = document.getElementById('txBody');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const balanceEl = document.getElementById('balance');

const exportCsvBtn = document.getElementById('exportCsv');
const filterType = document.getElementById('filterType');
const filterMonth = document.getElementById('filterMonth');
const themeToggle = document.getElementById('themeToggle');

// === THEME TOGGLE ===

// apply saved theme at startup
const savedTheme = localStorage.getItem('ft_theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
  themeToggle.textContent = 'Light';
} else {
  document.documentElement.classList.remove('dark');
  themeToggle.textContent = 'Dark';
}

themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  themeToggle.textContent = isDark ? 'Light' : 'Dark';
  localStorage.setItem('ft_theme', isDark ? 'dark' : 'light');
});


// ====== Charts ======
let pieChart = null;
let lineChart = null;

// ====== Firebase Init ======
if (typeof firebase === 'undefined') {
  alert('Firebase not loaded. Check firebase CDN or firebase-config.js');
} else {
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  // ===== Auth events =====
  btnRegister.onclick = () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) return alert('Fill email & password');
    auth.createUserWithEmailAndPassword(email, pass)
      .then(() => alert('Register successful!'))
      .catch(err => alert(err.message));
  };

  btnLogin.onclick = () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) return alert('Fill email & password');
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
  };

  signinBtn.onclick = () => authForm.scrollIntoView({ behavior: 'smooth' });
  signOutBtn.onclick = () => auth.signOut();

  // ===== Auth State =====
  auth.onAuthStateChanged(user => {
    if (user) {
      authForm.style.display = 'none';
      userBar.classList.remove('hidden');
      dashboard.classList.remove('hidden');
      userEmail.textContent = user.email;
      document.getElementById('addBtn').classList.remove('hidden');
      setupUserListener(user.uid);
    } else {
      authForm.style.display = 'block';
      userBar.classList.add('hidden');
      dashboard.classList.add('hidden');
      document.getElementById('addBtn').classList.add('hidden');
      detachUserListener();
    }
  });

  // ===== DB Listener =====
  let transactionsRef = null;
  let listenerCallback = null;

  function setupUserListener(uid) {
    transactionsRef = db.ref(`users/${uid}/transactions`);
    listenerCallback = transactionsRef.on('value', snapshot => {
      const data = snapshot.val() || {};
      const txList = Object.keys(data).map(k => ({ id: k, ...data[k] }))
        .sort((a, b) => b.timestamp - a.timestamp);
      renderTransactions(txList);
      updateSummaryAndCharts(txList);
    });
  }

  function detachUserListener() {
    if (transactionsRef && listenerCallback) {
      transactionsRef.off('value', listenerCallback);
    }
    transactionsRef = null;
    listenerCallback = null;
    txBody.innerHTML = '';
    totalIncomeEl.textContent = 'Rp0';
    totalExpenseEl.textContent = 'Rp0';
    balanceEl.textContent = 'Rp0';
    destroyCharts();
  }

  // ===== Add Transaction =====
  const togglePanel = () => addPanel.classList.toggle('hidden');
  if (addBtn) addBtn.onclick = togglePanel;
  if (addBtnDesktop) addBtnDesktop.onclick = togglePanel;
  if (cancelTx) cancelTx.onclick = () => addPanel.classList.add('hidden');

  saveTx.onclick = () => {
    const type = txType.value;
    const amount = Number(txAmount.value);
    const date = txDate.value;
    const category = txCategory.value || (type === 'income' ? 'Salary' : 'General');
    const desc = txDesc.value || '';
    if (!amount || !date) return alert('Please fill amount and date.');
    const user = firebase.auth().currentUser;
    if (!user) return alert('Not signed in.');

    const payload = { type, amount, date, category, desc, timestamp: Date.now() };
    db.ref(`users/${user.uid}/transactions`).push(payload)
      .then(() => { clearAddForm(); addPanel.classList.add('hidden'); })
      .catch(err => alert(err.message));
  };

  function clearAddForm() {
    txAmount.value = '';
    txDate.value = '';
    txCategory.value = '';
    txDesc.value = '';
  }

  // ===== Render Transactions =====
  function renderTransactions(list) {
    const typeFilter = filterType.value;
    const monthFilter = filterMonth.value;
    let filtered = list.filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (monthFilter && tx.date.slice(0, 7) !== monthFilter) return false;
      return true;
    });

    txBody.innerHTML = '';
    filtered.forEach(tx => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2">${tx.date}</td>
        <td class="py-2">${escapeHtml(tx.desc || '-')}</td>
        <td class="py-2">${escapeHtml(tx.category)}</td>
        <td class="py-2">${formatCurrency(tx.amount)}</td>
        <td class="py-2">${tx.type}</td>
        <td class="py-2 text-center">
          <button class="delete-btn text-sm px-2 py-1 border rounded" data-id="${tx.id}">Delete</button>
        </td>`;
      txBody.appendChild(tr);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!confirm('Delete this transaction?')) return;
        const user = firebase.auth().currentUser;
        db.ref(`users/${user.uid}/transactions/${id}`).remove();
      };
    });
  }

  // ===== Summary & Charts =====
  function updateSummaryAndCharts(list) {
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const saving = list.filter(t => t.type === 'saving').reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense - saving;

    totalIncomeEl.textContent = formatCurrency(income);
    totalExpenseEl.textContent = formatCurrency(expense);
    balanceEl.textContent = formatCurrency(balance);
    document.getElementById('totalSaving').textContent = formatCurrency(saving);

    const catMap = {};
    list.filter(t => t.type === 'expense').forEach(t => {
      catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
    });
    renderPieChart(Object.keys(catMap), Object.values(catMap));

    const months = lastNMonths(6);
    const monthlyTotals = months.map(m =>
      list.filter(t => t.type === 'expense' && t.date.slice(0, 7) === m)
          .reduce((s, t) => s + Number(t.amount), 0)
    );
    renderLineChart(months, monthlyTotals);
  }

  function renderPieChart(labels, data) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data, backgroundColor: generatePalette(labels.length) }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderLineChart(labels, data) {
    const ctx = document.getElementById('lineChart').getContext('2d');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Expenses', data, fill: true, tension: 0.3 }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  function destroyCharts() {
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    if (lineChart) { lineChart.destroy(); lineChart = null; }
  }

  // ===== Filters =====
  filterType.onchange = filterMonth.onchange = () => {
    const user = auth.currentUser;
    if (!user) return;
    db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
      const data = s.val() || {};
      const txList = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b)=>b.timestamp-a.timestamp);
      renderTransactions(txList);
    });
  };

  // ===== Export CSV =====
  exportCsvBtn.onclick = () => {
    const user = auth.currentUser;
    if (!user) return alert('Not signed in.');
    db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
      const data = s.val() || {};
      const rows = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      if (!rows.length) return alert('No data to export.');
      const csv = toCSV(rows);
      downloadFile(csv, `finance-export-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    });
  };

  // ===== Utils =====
  function formatCurrency(num) {
    return 'Rp' + (Number(num) || 0).toLocaleString('id-ID');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function lastNMonths(n) {
    const arr = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(d.toISOString().slice(0, 7));
    }
    return arr;
  }

  function generatePalette(n) {
    const colors = ['#6366F1','#EF4444','#F59E0B','#10B981','#06B6D4','#8B5CF6','#EC4899','#06B6D4','#F97316','#E11D48'];
    return Array.from({ length: n }, (_, i) => colors[i % colors.length]);
  }

  function toCSV(rows) {
    const keys = ['id','type','date','category','desc','amount','timestamp'];
    const lines = [keys.join(',')];
    rows.forEach(r => {
      const line = keys.map(k => `"${String(r[k] ?? '').replace(/"/g,'""')}"`).join(',');
      lines.push(line);
    });
    return lines.join('\n');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // default month
  (function initDefaults(){
    filterMonth.value = new Date().toISOString().slice(0,7);
  })();
}
