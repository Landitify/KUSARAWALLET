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
const summaryMonth = document.getElementById('summaryMonth');
const themeToggle = document.getElementById('themeToggle');

const yearlySection = document.getElementById('yearlySummary');
const menuYearlyBtn = document.getElementById('menuyearly'); // id from your button

// === THEME TOGGLE ===
// apply saved theme at startup
const savedTheme = localStorage.getItem('ft_theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
  if (themeToggle) themeToggle.textContent = 'Light';
} else {
  document.documentElement.classList.remove('dark');
  if (themeToggle) themeToggle.textContent = 'Dark';
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    themeToggle.textContent = isDark ? 'Light' : 'Dark';
    localStorage.setItem('ft_theme', isDark ? 'dark' : 'light');
  });
}

// ====== Charts ======
let pieChart = null;
let lineChart = null;
let yCategoryChart = null;
let yTrendChart = null;

// ====== Firebase Init ======
if (typeof firebase === 'undefined') {
  alert('Firebase not loaded. Check firebase CDN or firebase-config.js');
} else {
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  // ===== Auth events =====
  btnRegister && (btnRegister.onclick = () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) return alert('Fill email & password');
    auth.createUserWithEmailAndPassword(email, pass)
      .then(() => alert('Register successful!'))
      .catch(err => alert(err.message));
  });

  btnLogin && (btnLogin.onclick = () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) return alert('Fill email & password');
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
  });

  signinBtn && (signinBtn.onclick = () => authForm.scrollIntoView({ behavior: 'smooth' }));
  signOutBtn && (signOutBtn.onclick = () => auth.signOut());

  // ===== CATEGORY HANDLING =====
  const defaultCategories = {
    income: ['Gaji', 'Bonus', 'Penjualan', 'Lainnya'],
    expense: ['Makan & Minum', 'Transportasi', 'Tagihan', 'Belanja', 'Hiburan', 'Kesehatan', 'Lainnya'],
    saving: ['Tabungan Darurat', 'Investasi', 'Liburan', 'Lainnya']
  };

  function updateCategoryOptions() {
    if (!txType || !txCategory) return;
    const type = txType.value;
    const categories = defaultCategories[type] || [];
    txCategory.innerHTML = '';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      txCategory.appendChild(opt);
    });
  }

  updateCategoryOptions();
  txType && txType.addEventListener('change', updateCategoryOptions);

  // ===== Auth State =====
  auth.onAuthStateChanged(user => {
    if (user) {
      authForm && (authForm.style.display = 'none');
      userBar && userBar.classList.remove('hidden');
      dashboard && dashboard.classList.remove('hidden');
      userEmail && (userEmail.textContent = user.email);
      document.getElementById('addBtn') && document.getElementById('addBtn').classList.remove('hidden');
      setupUserListener(user.uid);

      // Load yearly UI + data after login
      loadYearOptions();
      updateYearlySummary();
    } else {
      authForm && (authForm.style.display = 'block');
      userBar && userBar.classList.add('hidden');
      dashboard && dashboard.classList.add('hidden');
      document.getElementById('addBtn') && document.getElementById('addBtn').classList.add('hidden');
      detachUserListener();
      // keep yearly hidden by default (will be shown when menuyearly clicked)
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
      // render history and summary (summary will filter by summaryMonth)
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
    const txListEl = document.getElementById('txList');
    if (txListEl) txListEl.innerHTML = '';
    totalIncomeEl && (totalIncomeEl.textContent = 'Rp0');
    totalExpenseEl && (totalExpenseEl.textContent = 'Rp0');
    balanceEl && (balanceEl.textContent = 'Rp0');
    destroyCharts();
  }

  // ===== Add Transaction =====
  const togglePanel = () => addPanel.classList.toggle('hidden');
  addBtn && (addBtn.onclick = togglePanel);
  addBtnDesktop && (addBtnDesktop.onclick = togglePanel);
  cancelTx && (cancelTx.onclick = () => addPanel.classList.add('hidden'));

  saveTx && (saveTx.onclick = () => {
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
  });

  function clearAddForm() {
    txAmount.value = '';
    txDate.value = '';
    txCategory.value = '';
    txDesc.value = '';
  }

  // ===== Render Transactions =====
  function renderTransactions(list) {
    const typeFilterVal = filterType ? filterType.value : 'all';
    const monthFilterVal = filterMonth ? filterMonth.value : '';

    let filtered = list.filter(tx => {
      if (typeFilterVal !== 'all' && tx.type !== typeFilterVal) return false;
      if (monthFilterVal && tx.date.slice(0, 7) !== monthFilterVal) return false;
      return true;
    });

    const txListEl = document.getElementById('txList');
    if (!txListEl) return;
    txListEl.innerHTML = '';

    if (filtered.length === 0) {
      txListEl.innerHTML = `
        <div class="text-center text-slate-500 dark:text-slate-400 py-6">
          No transactions found for this period.
        </div>`;
      return;
    }

    filtered.forEach(tx => {
      const icon =
        tx.type === 'income' ? '💰' :
        tx.type === 'expense' ? '💸' : '🏦';

      const colorClass =
        tx.type === 'income' ? 'text-green-600 dark:text-green-400' :
        tx.type === 'expense' ? 'text-rose-600 dark:text-rose-400' :
        'text-emerald-600 dark:text-emerald-400';

      const card = document.createElement('div');
      card.className =
        'flex items-center justify-between bg-white dark:bg-slate-800 shadow-sm rounded-lg px-4 py-3 border border-slate-100 dark:border-slate-700 transition-colors';

      card.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg ${colorClass}">
            ${icon}
          </div>
          <div>
            <p class="font-medium text-slate-800 dark:text-slate-100">${escapeHtml(tx.category)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">${tx.date} • ${escapeHtml(tx.desc || '-') }</p>
          </div>
        </div>
        <div class="text-right">
          <p class="font-semibold ${colorClass}">${formatCurrency(tx.amount)}</p>
          <button class="delete-btn text-xs text-slate-400 hover:text-rose-500" data-id="${tx.id}">
            Delete
          </button>
        </div>
      `;
      txListEl.appendChild(card);
    });

    // delete logic
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
    const period = summaryMonth ? summaryMonth.value : '';
    const activePeriod = period || new Date().toISOString().slice(0, 7);

    // Filter transaksi untuk SUMMARY (monthly)
    const filtered = list.filter(t => t.date && t.date.slice(0, 7) === activePeriod);

    const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const saving = filtered.filter(t => t.type === 'saving').reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense - saving;

    totalIncomeEl && (totalIncomeEl.textContent = formatCurrency(income));
    totalExpenseEl && (totalExpenseEl.textContent = formatCurrency(expense));
    balanceEl && (balanceEl.textContent = formatCurrency(balance));
    document.getElementById('totalSaving') && (document.getElementById('totalSaving').textContent = formatCurrency(saving));

    // Pie Chart (expense breakdown)
    const catMap = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
      catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
    });
    renderPieChart(Object.keys(catMap), Object.values(catMap));

    // Line Chart (6 months timeline) - uses global list to get months
    const months = lastNMonths(6);
    const monthlyTotals = months.map(m =>
      list.filter(t => t.type === 'expense' && t.date && t.date.slice(0, 7) === m)
        .reduce((s, t) => s + Number(t.amount), 0)
    );
    renderLineChart(months, monthlyTotals);

    // DEFAULT: Transaction history ikut summary period only if user hasn't overridden
    if (filterMonth) {
      if (filterMonth.dataset.auto === '1') {
        filterMonth.value = activePeriod;
      }
    }
  }

  function renderPieChart(labels, data) {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data, backgroundColor: generatePalette(labels.length) }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderLineChart(labels, data) {
    const canvas = document.getElementById('lineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
    if (yCategoryChart) { yCategoryChart.destroy(); yCategoryChart = null; }
    if (yTrendChart) { yTrendChart.destroy(); yTrendChart = null; }
  }

  // ===== Filters handling (user override behavior) =====
  // mark filterMonth as auto by default (so it follows summary)
  if (filterMonth) filterMonth.dataset.auto = '1';

  // when user changes filterMonth manually, disable auto sync
  if (filterMonth) {
    filterMonth.addEventListener('change', () => {
      filterMonth.dataset.auto = '0';
      // re-render transactions using current stored db snapshot via one-time read
      const user = auth.currentUser;
      if (!user) return;
      db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
        const data = s.val() || {};
        const txList = Object.keys(data).map(k => ({ id: k, ...data[k] }))
          .sort((a,b)=>b.timestamp-a.timestamp);
        renderTransactions(txList);
      });
    });
  }

  // when user changes filterType, just re-render transactions
  if (filterType) {
    filterType.addEventListener('change', () => {
      const user = auth.currentUser;
      if (!user) return;
      db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
        const data = s.val() || {};
        const txList = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b)=>b.timestamp-a.timestamp);
        renderTransactions(txList);
      });
    });
  }

  // summaryMonth change → update summary and possibly history
  if (summaryMonth) {
    summaryMonth.addEventListener('change', () => {
      const user = auth.currentUser;
      if (!user) return;
      db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
        const data = s.val() || {};
        const txList = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b)=>b.timestamp-a.timestamp);
        updateSummaryAndCharts(txList);
        if (filterMonth && filterMonth.dataset.auto === '1') {
          renderTransactions(txList);
        }
      });
    });
  }

  // ===== Export CSV =====
  exportCsvBtn && (exportCsvBtn.onclick = () => {
    const user = auth.currentUser;
    if (!user) return alert('Not signed in.');
    db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
      const data = s.val() || {};
      const rows = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      if (!rows.length) return alert('No data to export.');
      const csv = toCSV(rows);
      downloadFile(csv, `finance-export-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    });
  });

  // ===== Yearly Summary logic & UI =====
  // create back button inside yearly section if not exists (simple style)
  function ensureBackButton() {
    if (!yearlySection) return;
    if (document.getElementById('backToDashboard')) return;
    const btn = document.createElement('button');
    btn.id = 'backToDashboard';
    btn.className = 'px-3 py-1 mb-4 border rounded bg-indigo-600 text-white text-sm';
    btn.textContent = '← Back to Dashboard';
    yearlySection.insertBefore(btn, yearlySection.firstChild);
    btn.addEventListener('click', () => {
      // show dashboard, hide yearly
      dashboard && dashboard.classList.remove('hidden');
      yearlySection.classList.add('hidden');
      // reload dashboard summary & transactions
      const user = auth.currentUser;
      if (!user) return;
      db.ref(`users/${user.uid}/transactions`).once('value').then(s => {
        const data = s.val() || {};
        const txList = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b)=>b.timestamp-a.timestamp);
        renderTransactions(txList);
        updateSummaryAndCharts(txList);
      });
    });
  }

  // show yearly section when menuyearly clicked
  if (menuYearlyBtn) {
    menuyearly && menuyearly.addEventListener('click', () => {
      dashboard && dashboard.classList.add('hidden');
      if (yearlySection) yearlySection.classList.remove('hidden');
      ensureBackButton();
      loadYearOptions();   // ensure options exist
      updateYearlySummary();
    });
  }

  // generate year selector options (last 6 years)
  function loadYearOptions() {
    const yearSelector = document.getElementById("yearSelector");
    if (!yearSelector) return;
    const currentYear = new Date().getFullYear();
    yearSelector.innerHTML = "";
    for (let y = currentYear; y >= currentYear - 5; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelector.appendChild(opt);
    }
    yearSelector.value = currentYear;
    yearSelector.onchange = () => updateYearlySummary();
  }

  // yearly summary update (reads full transactions and aggregates by selected year)
  function updateYearlySummary() {
    const yearSelector = document.getElementById("yearSelector");
    if (!yearSelector) return;
    const year = yearSelector.value;
    const user = firebase.auth().currentUser;
    if (!user) return;
    db.ref(`users/${user.uid}/transactions`).once("value", (snap) => {
      const data = snap.val() || {};
      let totalIncome = 0;
      let totalExpense = 0;
      let totalSaving = 0;
      const monthlyIncome = Array(12).fill(0);
      const monthlyExpense = Array(12).fill(0);
      const categories = {};
      Object.values(data).forEach(tx => {
        if (!tx.date) return;
        const d = new Date(tx.date);
        if (isNaN(d)) return; // skip invalid dates
        if (d.getFullYear().toString() !== year) return;
        const month = d.getMonth();
        if (tx.type === "income") {
          totalIncome += Number(tx.amount);
          monthlyIncome[month] += Number(tx.amount);
        } else if (tx.type === "expense") {
          totalExpense += Number(tx.amount);
          monthlyExpense[month] += Number(tx.amount);
          categories[tx.category] = (categories[tx.category] || 0) + Number(tx.amount);
        } else if (tx.type === "saving") {
          totalSaving += Number(tx.amount);
        }
      });
      document.getElementById("yIncome") && (document.getElementById("yIncome").textContent = formatCurrency(totalIncome));
      document.getElementById("yExpense") && (document.getElementById("yExpense").textContent = formatCurrency(totalExpense));
      document.getElementById("ySaving") && (document.getElementById("ySaving").textContent = formatCurrency(totalSaving));
      document.getElementById("yBalance") && (document.getElementById("yBalance").textContent = formatCurrency(totalIncome - totalExpense - totalSaving));
      drawYCategoryChart(categories);
      drawYTrendChart(monthlyIncome, monthlyExpense);
    });
  }

  function drawYCategoryChart(catData) {
    const canvas = document.getElementById("yCategoryChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (yCategoryChart) yCategoryChart.destroy();
    yCategoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(catData),
        datasets: [{
          label: "Expense",
          data: Object.values(catData)
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  function drawYTrendChart(income, expense) {
    const canvas = document.getElementById("yTrendChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (yTrendChart) yTrendChart.destroy();
    yTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
        datasets: [
          { label: "Income", data: income, borderWidth: 2, fill: false },
          { label: "Expense", data: expense, borderWidth: 2, fill: false }
        ]
      },
      options: { responsive: true }
    });
  }

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
    const now = new Date().toISOString().slice(0, 7);
    if (summaryMonth) summaryMonth.value = now;
    if (filterMonth) {
      filterMonth.value = now;
      filterMonth.dataset.auto = '1'; // default: auto-follow summary
    }
  })();

} // end firebase block
