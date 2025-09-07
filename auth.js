(function () {
  'use strict';

  /* =========================
     STORAGE KEYS & HELPERS
     ========================= */
  const LS_USERS = "supermarket_users_v2";
  const LS_CURRENT_USER = "currentSupermarket_v2";
  const LS_INVOICES = "invoices_v2";
  const LS_PRODUCTS = "products_v2";
  const LS_REPORTS = "reports_v2";
  const LS_MSG_TPL = "msg_templates_v2";
  const LS_NOTICES = "notices_v2";
  const LS_APP_LANG = "app_lang_v2";
  const LS_DARK = "app_dark_mode_v2";

  function lsGet(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error("lsSet failed", e); }
  }
  function lsRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  /* seed templates/notices if none */
  if (!lsGet(LS_MSG_TPL)) {
    lsSet(LS_MSG_TPL, {
      reminder_wa: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}.\nFadlan iska bixi dukaanka {store} ({phone}).",
      reminder_sms: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone})."
    });
  }
  if (!lsGet(LS_NOTICES)) {
    lsSet(LS_NOTICES, [{ id: `N-${Date.now()}`, title: "Welcome", body: "Welcome to the supermarket invoicing app.", pinned: true, created: Date.now() }]);
  }
 // -------------------------
// Shared small state
// -------------------------
let dashboardLiveInterval = null;

// -------------------------
// Safer initStorage (don't wipe localStorage automatically)
// -------------------------
(function initStorage() {
  const FIRST_RUN_KEY = "__netlifyFirstRun";

  // Safer first-run logic: mark that init ran but do NOT clear user's data automatically.
  // To intentionally clear storage for debugging or fresh deploy, visit URL with ?resetStorage=true
  try {
    if (!localStorage.getItem(FIRST_RUN_KEY)) {
      try {
        const urlParams = new URLSearchParams(location.search);
        if (urlParams.get('resetStorage') === 'true') {
          console.log("⚠️ resetStorage=true: clearing localStorage (explicit request)...");
          localStorage.clear();
          localStorage.setItem(FIRST_RUN_KEY, "true");
          if (window.Notices && typeof window.Notices.add === "function") {
            window.Notices.add({
              title: "Storage Reset",
              body: "Local data was reset by explicit request."
            });
          }
        } else {
          // do not wipe — simply mark that we've initialized once
          localStorage.setItem(FIRST_RUN_KEY, "true");
        }
      } catch (e) {
        // fallback: do not wipe, just mark
        try { localStorage.setItem(FIRST_RUN_KEY, "true"); } catch(e2) {}
      }
    }
  } catch (e) {
    // accessing localStorage might throw in some private contexts — fail silently
    console.warn("initStorage: localStorage access failed", e);
  }

  // 2) Safe getter with auto-repair for known keys (unchanged logic)
  function safeGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("⚠️ Corrupted storage for", key, "- resetting...");
      try { localStorage.removeItem(key); } catch(err){}
      // Show notice for corrupted Gmail only
      if (key === "gmailBackup" && window.Notices) {
        window.Notices.add({
          title: "Storage Repair",
          body: "Your Gmail data was corrupted and has been reset."
        });
      }
      return fallback;
    }
  }

  // Example use: auto-fix Gmail backup JSON
  try {
    const gmailData = safeGet("gmailBackup", []);
    if (!Array.isArray(gmailData)) {
      localStorage.setItem("gmailBackup", JSON.stringify([]));
    }
  } catch (e) {}

  // expose helper globally
  window.safeGet = safeGet;
})(); // end initStorage

  
  /* small helpers */
  function fmtMoney(n) { const num = Number(n) || 0; return num.toFixed(2); }
  function fmtDate(d) { const date = d ? new Date(d) : new Date(); const yyyy = date.getFullYear(); const mm = String(date.getMonth() + 1).padStart(2, '0'); const dd = String(date.getDate()).padStart(2, '0'); return `${yyyy}-${mm}-${dd}`; }
  function fmtDateTime(ts) { const d = new Date(ts); if (isNaN(d)) return String(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function escapeHtml(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cleanPhone(phone) { if (!phone) return ''; let p = String(phone).replace(/\D/g, ''); if (!p) return ''; if (p.startsWith('252')) return p; if (p.startsWith('0')) p = p.slice(1); if (!p.startsWith('252')) p = '252' + p; return p; }
  function ensureId(prefix = 'U') { return `${prefix}-${Date.now()}-${Math.floor(Math.random()*900000)}`; }

  /* storage wrappers */
  function getUsers() { return lsGet(LS_USERS, []); }
  function saveUsers(u) { lsSet(LS_USERS, u); }
  function getCurrentUser() { return lsGet(LS_CURRENT_USER, null); }
  function setCurrentUser(u) { lsSet(LS_CURRENT_USER, u); }
  function clearCurrentUser() { lsRemove(LS_CURRENT_USER); }

  function getAllInvoices() { return lsGet(LS_INVOICES, []); }
  function saveAllInvoices(arr) { lsSet(LS_INVOICES, arr); }
  function getStoreInvoices(storeName) { if (!storeName) return []; return getAllInvoices().filter(i => String(i.store || '').toLowerCase() === String(storeName || '').toLowerCase()); }

  function getAllProducts() { return lsGet(LS_PRODUCTS, []); }
  function saveAllProducts(arr) { lsSet(LS_PRODUCTS, arr); }
  function getStoreProducts(storeName) { if (!storeName) return []; return getAllProducts().filter(p => String(p.store || '').toLowerCase() === String(storeName || '').toLowerCase()); }

  function getAllReports() { return lsGet(LS_REPORTS, []); }
  function saveAllReports(arr) { lsSet(LS_REPORTS, arr); }

  /* =========================
     MIGRATION: ensure stable user IDs
     ========================= */
  function migrateLegacyData() {
    try {
      // Add id for any existing v2 users missing id
      const users = getUsers() || [];
      let changed = false;
      users.forEach(u => {
        if (u && !u.id) { u.id = ensureId('U'); changed = true; }
      });
      if (changed) saveUsers(users);

      // legacy keys migration (if present)
      const legacy = lsGet('supermarket_users') || lsGet('supermarket_users_v1');
      if (legacy && Array.isArray(legacy) && legacy.length) {
        const existing = getUsers() || [];
        legacy.forEach(u => {
          if (!u) return;
          if (!u.id) u.id = ensureId('U');
          const exists = existing.find(e => e.id === u.id || (e.email && u.email && e.email.toLowerCase() === u.email.toLowerCase()));
          if (!exists) existing.push(u);
        });
        saveUsers(existing);
        toast('Migrated legacy users', 'success', 1800);
      }
    } catch (e) { console.warn('Migration failed', e); }
  }
  migrateLegacyData();

  /* =========================
     NOTIFICATIONS / TOASTS (replace alert)
     ========================= */
  (function createToasts() {
    if (document.getElementById('appToasts')) return;
    const div = document.createElement('div');
    div.id = 'appToasts';
    div.style.position = 'fixed';
    div.style.right = '16px';
    div.style.top = '16px';
    div.style.zIndex = 9999;
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.gap = '8px';
    document.body.appendChild(div);
  })();
  function toast(msg, type = 'info', ms = 3000) {
    const wrap = document.getElementById('appToasts');
    if (!wrap) { alert(msg); return; }
    const el = document.createElement('div');
    el.className = 'shadow rounded p-3 text-sm max-w-xs';
    el.style.background = type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#e6f0ff');
    el.style.color = type === 'error' ? '#991b1b' : (type === 'success' ? '#065f46' : '#0f172a');
    el.style.border = '1px solid rgba(0,0,0,0.04)';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity 220ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, ms);
  }

  // /* small polyfills for optional libs */
  // function ensureLib(url, globalName) {
  //   return new Promise((res, rej) => {
  //     if (globalName && window[globalName]) return res(true);
  //     const s = document.createElement('script');
  //     s.src = url;
  //     s.onload = () => res(true);
  //     s.onerror = () => rej(new Error('Failed to load ' + url));
  //     document.head.appendChild(s);
  //   });
  // }

  // /* =========================
  //    TRANSLATION (minimal)
  //    ========================= */
  // const I18N = {
  //   en: { dashboard: "" },
  //   so: { dashboard: "" }
  // };
  // function applyLanguage(lang) {
  //   if (!lang) lang = lsGet(LS_APP_LANG, 'en') || 'en';
  //   lsSet(LS_APP_LANG, lang);
  //   const storeEl = document.getElementById('storeDisplayDesktop');
  //   if (storeEl) {
  //     const name = storeEl.textContent || getCurrentUser()?.name || '';
  //     const base = (I18N[lang] && I18N[lang].dashboard) || '';
  //     const h = storeEl.closest && storeEl.closest('h1');
  //     if (h) h.textContent = `${base} - ${name}`;
  //   }
  // }
  // applyLanguage(lsGet(LS_APP_LANG, 'en'));

  /* =========================
     BASIC UI LOOKUPS
     ========================= */
  const authSection = document.getElementById("authSection");
  const dashboardSection = document.getElementById("dashboardSection");

  // auth
  const registrationForm = document.getElementById("registrationForm");
  const regName = document.getElementById("regName");
  const regAddress = document.getElementById("regAddress");
  const regPhone = document.getElementById("regPhone");
  const regEmail = document.getElementById("regEmail");
  const regPassword = document.getElementById("regPassword");
  const regConfirm = document.getElementById("regConfirm");
  const registerBtn = document.getElementById("registerBtn");

  const loginForm = document.getElementById("loginForm");
  const loginName = document.getElementById("loginName");
  const loginPassword = document.getElementById("loginPassword");
  const loginBtn = document.getElementById("loginBtn");

  const showLoginBtn = document.getElementById("showLogin");
  const showRegisterBtn = document.getElementById("showRegister");
  const logoutBtn = document.getElementById("logoutBtn");

  const storeDisplayDesktop = document.getElementById("storeDisplayDesktop");
  const totalInvoicesEl = document.getElementById("totalInvoices");
  const totalProductsEl = document.getElementById("totalProducts");
  const totalSalesEl = document.getElementById("totalSales");

  const navButtons = Array.from(document.querySelectorAll(".navBtn"));
  const dashboardContent = document.getElementById("dashboardContent");
  const invoicesSection = document.getElementById("invoicesSection");
  const productsSection = document.getElementById("productsSection");
  const reportsSection = document.getElementById("reportsSection");

  // invoices scope (some elements are in products/invoices area)
  const invArea = invoicesSection;
  const createInvoiceBtn = invArea?.querySelector('#createInvoiceBtn');
  const currentTimeEl = invArea?.querySelector('#currentTime');
  const createInvoiceSection = invArea?.querySelector('#createInvoiceSection');
  const editingInvoiceId = invArea?.querySelector('#editingInvoiceId');
  const customerNameInput = invArea?.querySelector('#customerName');
  const customerPhoneInput = invArea?.querySelector('#customerPhone');
  const invoiceDateInput = invArea?.querySelector('#invoiceDate');
  const invoiceItemsContainer = invArea?.querySelector('#invoiceItemsContainer');
  const addItemBtn = invArea?.querySelector('#addItemBtn');
  const amountInput = invArea?.querySelector('#amount');
  const paidInput = invArea?.querySelector('#paid');
  const statusSelect = invArea?.querySelector('#status');
  const saveInvoiceBtn = invArea?.querySelector('#saveInvoiceBtn');
  const formMsg = invArea?.querySelector('#formMsg');
  const invoiceRows = invArea?.querySelector('#invoiceRows');
  const emptyStateInv = invArea?.querySelector('#emptyState');
  const clearPaidBtn = invArea?.querySelector('#clearPaidBtn');
  const filterStatus = invArea?.querySelector('#filterStatus');
  const searchName = invArea?.querySelector('#searchName');
  const reminderMethod = invArea?.querySelector('#reminderMethod');
  const sendAllRemindersBtn = invArea?.querySelector('#sendAllReminders');

  // products scope
  const prodSection = productsSection;
  const addProductBtn = document.getElementById('addProductBtn');
  const productModal = document.getElementById('productModal');
  const productModalBackdrop = document.getElementById('productModalBackdrop');
  const closeModalBtn = document.getElementById('closeModal');
  const cancelModalBtn = document.getElementById('cancelModal');
  const productForm = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  const productName = document.getElementById('productName');
  const productCost = document.getElementById('productCost');
  const productPrice = document.getElementById('productPrice');
  const productQty = document.getElementById('productQty');
  const productRows = document.getElementById('productRows');
  const productCards = document.getElementById('productCards');
  const searchInput = document.getElementById('searchInput');
  const emptyAddBtn = document.getElementById('emptyAddBtn');

  const shopModal = document.getElementById('shopModal');
  const shopBackdrop = document.getElementById('shopBackdrop');
  const cartItemsEl = document.getElementById('cartItems');
  const openCartHeader = document.getElementById('openCartHeader');
  const cartCountHeader = document.getElementById('cartCountHeader');
  const clearCartBtn = document.getElementById('clearCart');
  const closeCartBtn = document.getElementById('closeCart');
  const sellCartBtn = document.getElementById('sellCart');

  const invoiceModal = document.getElementById('invoiceModal');
  // inside invoiceModal we will query modal-specific inputs to avoid duplicate-id confusion
  const invoiceForm = document.getElementById('invoiceForm');
  const backToCartBtn = document.getElementById('backToCart');
  const buyRecordBtn = document.getElementById('buyRecord');
  const buyOnlyBtn = document.getElementById('buyOnly');

  // reports
  const reportsRows = document.getElementById('reportsRows');
  const reportsTotalItems = document.getElementById('reportsTotalItems');
  const reportsTotalSales = document.getElementById('reportsTotalSales');
  const reportsExportPdf = document.getElementById('reportsExportPdf');
  const reportsDeleteAll = document.getElementById('reportsDeleteAll');
  const reportsPeriod = document.getElementById('reportsPeriod') || document.getElementById('reportsTimeFilter') || document.getElementById('reportsPeriod');
  const reportsDate = document.getElementById('reportsDate');
  const reportsSearchInput = document.getElementById('reportsSearchInput') || document.getElementById('reportsSearch');

  let editingProductId = null;
  let cart = [];

  /* =========================
     UI: hide nav/settings while on auth
     ========================= */
     function setAuthVisibility(isAuthScreen) {
      // hide nav buttons and settings cog while on login/register
      // support both .navBtn and #storeSettingsBtn / .storeSettingsBtn
      document.querySelectorAll('.navBtn').forEach(el => {
        if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
      });
      // support id and class selectors for settings button(s)
      const settingsEls = Array.from(document.querySelectorAll('#storeSettingsBtn, .storeSettingsBtn'));
      settingsEls.forEach(el => {
        if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
      });
    }
    

  /* =========================
     SETTINGS COG + SETTINGS MODAL (drop-in replacement)
     Creates AppSettings.open() etc.
     ========================= */
  // lightweight ensure button + modal builder
 



  /* =========================
     AUTH (registration/login/logout) - updated to use stable ids
     ========================= */
  function showLoginForm() { registrationForm?.classList.add('hidden'); loginForm?.classList.remove('hidden'); setAuthVisibility(true); }
  function showRegisterForm() { registrationForm?.classList.remove('hidden'); loginForm?.classList.add('hidden'); setAuthVisibility(true); }

  showLoginBtn?.addEventListener('click', showLoginForm);
  showRegisterBtn?.addEventListener('click', showRegisterForm);

  // registration: create stable id, firstTime flag
  registerBtn?.addEventListener('click', () => {
    const name = regName.value.trim();
    const address = regAddress.value.trim();
    const phone = regPhone.value.trim();
    const email = regEmail.value.trim();
    const password = regPassword.value;
    const confirm = regConfirm.value;
    if (!name || !address || !phone || !email || !password || !confirm) { toast('Please fill in all fields.', 'error'); return; }
    if (password !== confirm) { toast('Passwords do not match.', 'error'); return; }
    const users = getUsers() || [];
    if (users.find(u => u && u.name && u.name.toLowerCase() === name.toLowerCase())) { toast('Supermarket name taken.', 'error'); return; }
    if (users.find(u => u && u.email && u.email.toLowerCase() === email.toLowerCase())) { toast('Email already registered.', 'error'); return; }
    const id = ensureId('U');
    const newUser = { id, name, address, phone, email, password, createdAt: Date.now(), firstTime: true };
    users.push(newUser);
    saveUsers(users);
    toast('Registered successfully. Please login.', 'success');
    regName.value = regAddress.value = regPhone.value = regEmail.value = regPassword.value = regConfirm.value = '';
    showLoginForm();
  });

  // login: allow name or email; open settings modal on first time
  loginBtn?.addEventListener('click', () => {
    const nameOrEmail = loginName.value.trim();
    const pwd = loginPassword.value;
    if (!nameOrEmail || !pwd) { toast('Enter supermarket name & password', 'error'); return; }

    const users = getUsers() || [];
    const targetLower = nameOrEmail.toLowerCase();
    // allow login by supermarket name OR email
    const user = users.find(u =>
      u && u.password === pwd && (
        (u.name && u.name.toLowerCase() === targetLower) ||
        (u.email && u.email.toLowerCase() === targetLower)
      )
    );
    if (!user) { toast('Invalid credentials', 'error'); return; }

    setCurrentUser(user);
    toast('Logged in', 'success');

    // if firstTime show settings modal and clear flag
    if (user.firstTime) {
      // clear flag persistently
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        users[idx] = { ...users[idx], firstTime: false };
        saveUsers(users);
      }
      loadDashboard();
      setTimeout(() => {
        if (typeof openSettingsModal === 'function') openSettingsModal();
        window.AppSettings?.createStoreSettingsBtn?.();
      }, 380);
      return;
    }

    loadDashboard();
    setTimeout(() => window.AppSettings?.createStoreSettingsBtn?.(), 200);
  });



  logoutBtn?.addEventListener('click', () => {
    if (!confirm('Are you sure you want to logout?')) return;
  
    try {
      // stop any dashboard live refresh interval (if used)
      if (typeof dashboardLiveInterval !== 'undefined' && dashboardLiveInterval) {
        clearInterval(dashboardLiveInterval);
        dashboardLiveInterval = null;
      }
    } catch (e) { /* ignore */ }
  
    // clear user & UI
    clearCurrentUser?.();
    authSection?.classList.remove('hidden');
    dashboardSection?.classList.add('hidden');
    showLoginForm?.();
    setAuthVisibility?.(true);
  
    // hide settings cog (slight delay to let UI update)
    setTimeout(() => {
      const b = document.querySelector('.storeSettingsBtn');
      if (b) b.style.display = 'none';
    }, 50);
  
    // feedback
    if (typeof toast === 'function') toast('Logged out', 'success');
  });
  


  

  /* =========================
    /* ---------- Dashboard: totals, filtering and charts ---------- */

let dashboardChart = null;

// parse invoice date robustly; invoices may store timestamp or string
function parseInvoiceDate(d) {
  if (d == null) return null;
  if (typeof d === 'number') return new Date(d);
  if (typeof d === 'string') {
    // try ISO / timestamp / custom "YYYY-MM-DD hh:mm"
    const n = Number(d);
    if (isFinite(n)) return new Date(n);
    // replace space between date and time -> T to help Date parse
    const s = d.replace(' ', 'T');
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt;
  }
  return new Date(d);
}

// returns invoices filtered by period
function getInvoicesByPeriod(period = 'lifetime') {
  const user = getCurrentUser();
  if (!user) return [];
  const all = getStoreInvoices(user.name) || [];
  if (!all.length) return [];

  if (period === 'lifetime') return all;

  const now = new Date();
  // start times
  let start = null;
  if (period === 'today' || period === 'live') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
  } else if (period === 'weekly') {
    // last 7 days (including today)
    start = new Date(now);
    start.setDate(now.getDate() - 6); // 7-day window
    start.setHours(0,0,0,0);
  } else if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'yearly') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    // unknown -> lifetime
    return all;
  }

  return all.filter(inv => {
    const dt = parseInvoiceDate(inv.date);
    if (!dt) return false;
    return dt.getTime() >= start.getTime() && dt.getTime() <= now.getTime();
  });
}

// bucket invoices into chart series depending on period
function buildSalesSeries(invoices, period = 'lifetime') {
  // returns { labels: [], data: [] }
  if (!Array.isArray(invoices)) invoices = [];

  const now = new Date();

  if (period === 'lifetime') {
    // simple: monthly totals by year-month (last 12 months)
    const map = new Map();
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      const amt = Number(inv.paid) || 0;
      map.set(key, (map.get(key)||0) + amt);
    });
    // order keys ascending
    const keys = Array.from(map.keys()).sort();
    const labels = keys;
    const data = keys.map(k => map.get(k) || 0);
    return { labels, data };
  }

  if (period === 'today' || period === 'live') {
    // hourly buckets 0..23 for today
    const labels = Array.from({length:24}, (_,i) => `${i}:00`);
    const arr = Array(24).fill(0);
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      const h = dt.getHours();
      arr[h] += Number(inv.paid) || 0;
    });
    return { labels, data: arr };
  }

  if (period === 'weekly') {
    // last 7 days labels
    const days = [];
    const totals = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0,0,0,0);
      days.push(d);
      totals.push(0);
    }
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      // find matching day index
      for (let idx=0; idx<days.length; idx++) {
        const d = days[idx];
        if (dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth() && dt.getDate() === d.getDate()) {
          totals[idx] += Number(inv.paid) || 0;
          break;
        }
      }
    });
    const labels = days.map(d => `${d.getDate()}/${d.getMonth()+1}`);
    return { labels, data: totals };
  }

  if (period === 'monthly') {
    // days in current month
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const labels = Array.from({length: daysInMonth}, (_, i) => String(i+1));
    const totals = Array(daysInMonth).fill(0);
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        totals[dt.getDate()-1] += Number(inv.paid) || 0;
      }
    });
    return { labels, data: totals };
  }

  if (period === 'yearly') {
    // month buckets Jan..Dec
    const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const totals = Array(12).fill(0);
    const year = now.getFullYear();
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      if (dt.getFullYear() === year) {
        totals[dt.getMonth()] += Number(inv.paid) || 0;
      }
    });
    return { labels, data: totals };
  }

  // fallback
  return { labels: [], data: [] };
}

function renderSalesChart(series, period = 'lifetime') {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (dashboardChart) {
    try { dashboardChart.destroy(); } catch (e) {}
    dashboardChart = null;
  }

  // normalize series
  series = series || { labels: [], data: [] };
  series.labels = Array.isArray(series.labels) ? series.labels : [];
  series.data = Array.isArray(series.data) ? series.data.map(v => Number(v) || 0) : [];

  // max + empty detection
  const maxData = series.data.length ? Math.max(...series.data) : 0;
  const allZero = maxData === 0;

  // step chooser for non-zero values
  const candidateSteps = [1,5,10,50,100,500,1000,5000,10000,50000,100000,500000,1000000];
  function chooseStepAndMax(val) {
    if (!isFinite(val) || val <= 0) return { step: 1, max: 1 };
    for (let i = 0; i < candidateSteps.length; i++) {
      const step = candidateSteps[i];
      const stepsNeeded = Math.ceil(val / step);
      if (stepsNeeded <= 10) {
        const niceMax = step * Math.ceil(val / step);
        return { step, max: niceMax };
      }
    }
    const pow = Math.pow(10, Math.floor(Math.log10(val)));
    let step = pow;
    while (Math.ceil(val / step) > 10) step *= 10;
    const niceMax = step * Math.ceil(val / step);
    return { step, max: niceMax };
  }

  const { step: autoStep, max: autoMax } = chooseStepAndMax(maxData);
  const stepSize = allZero ? 1 : autoStep;
  const niceMax = allZero ? 1 : autoMax;

  // aspect ratio: compact when empty, flexible otherwise
  const aspectRatio = allZero ? 2.6 : Math.min(4, Math.max(1.2, (series.labels.length || 1) / 6));

  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Paid Sales',
        data: series.data,
        fill: false,
        borderWidth: 1,
        barPercentage: 0.75,
        categoryPercentage: 0.85,
        maxBarThickness: 60,
        backgroundColor: allZero ? 'rgba(15,23,42,0.06)' : undefined
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: aspectRatio,
      scales: {
        y: {
          beginAtZero: true,
          max: niceMax,
          grid: { display: !allZero },
          ticks: {
            stepSize: stepSize,
            callback: function(v) { return fmtMoney(v); }
          }
        },
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(ctx) { return fmtMoney(ctx.parsed.y ?? ctx.parsed); }
          }
        },
        legend: { display: false },
        subtitle: {
          display: allZero,
          text: allZero ? 'No sales in selected period' : '',
          align: 'center',
          font: { size: 12 },
          padding: { bottom: 6 }
        }
      }
    }
  });

  // adjust wrapper height a little when empty to keep UI compact
  try {
    const wrapper = canvas.closest('.chart-canvas-wrap') || canvas.parentElement;
    if (wrapper) wrapper.style.height = allZero ? '180px' : '220px';
  } catch (e) {}
}


/* =========================
   Expenses: storage keys & helpers (time-scoped)
   ========================= */

   const LS_EXPENSES_PREFIX = 'store_expenses_v1_'; // will append store name

   function getExpensesKey(storeName) { return LS_EXPENSES_PREFIX + storeName; }
   
   function getStoreExpenses(storeName) {
     try {
       const arr = JSON.parse(localStorage.getItem(getExpensesKey(storeName)) || '[]');
       return Array.isArray(arr) ? arr : [];
     } catch (e) { return []; }
   }
   function saveStoreExpenses(storeName, arr) {
     localStorage.setItem(getExpensesKey(storeName), JSON.stringify(Array.isArray(arr) ? arr : []));
   }
   
   /* ------ Date helpers ------ */
   
   // reuse parseInvoiceDate (exists in your code) if available, otherwise lightweight parser:
   function parseAnyDate(d) {
     if (d == null) return null;
     if (typeof d === 'number') return new Date(d);
     if (typeof d === 'string') {
       // try numeric string
       const n = Number(d);
       if (isFinite(n)) return new Date(n);
       // try ISO or yyyy-mm-dd
       const s = d.replace(' ', 'T');
       const dt = new Date(s);
       if (!isNaN(dt.getTime())) return dt;
       // fallback
       return new Date(d);
     }
     return new Date(d);
   }
   
   function formatDateForInput(d) {
     const dt = d ? parseAnyDate(d) : new Date();
     const y = dt.getFullYear();
     const m = String(dt.getMonth() + 1).padStart(2, '0');
     const day = String(dt.getDate()).padStart(2, '0');
     return `${y}-${m}-${day}`;
   }
   
   /* -------------------------
      Period filtering for expenses
      ------------------------- */
   
   function getExpensesByPeriod(period = 'lifetime', storeName) {
     const all = getStoreExpenses(storeName) || [];
     if (period === 'lifetime') return all.slice();
   
     const now = new Date();
     let start = null;
     if (period === 'today' || period === 'live') {
       start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
     } else if (period === 'weekly') {
       start = new Date(now);
       start.setDate(now.getDate() - 6); // last 7 days including today
       start.setHours(0,0,0,0);
     } else if (period === 'monthly') {
       start = new Date(now.getFullYear(), now.getMonth(), 1);
     } else if (period === 'yearly') {
       start = new Date(now.getFullYear(), 0, 1);
     } else {
       return all.slice();
     }
   
     const end = now;
     return all.filter(exp => {
       const dt = parseAnyDate(exp.date);
       if (!dt) return false;
       return dt.getTime() >= start.getTime() && dt.getTime() <= end.getTime();
     });
   }
   
   /* -------------------------
      Render + UI wiring
      ------------------------- */
   
   function initExpensesFeature() {
     // top and card buttons both open modal
     const btnTop = document.getElementById('btnManageExpensesTop');
     const btn = document.getElementById('btnManageExpenses');
     const modal = document.getElementById('manageExpensesModal');
     const close = document.getElementById('closeExpensesModal');
     const openAdd = document.getElementById('openAddExpense');
     const showAllBtn = document.getElementById('showAllExpenses');
   
     if (!modal) return;
   
     if (btnTop) btnTop.addEventListener('click', () => openExpensesModal());
     if (btn) btn.addEventListener('click', () => openExpensesModal());
     close.addEventListener('click', () => closeExpensesModal());
     openAdd.addEventListener('click', () => showAddExpenseForm());
     showAllBtn.addEventListener('click', () => showSavedExpenses());
   
     // form controls
     document.getElementById('addExpenseRowBtn').addEventListener('click', () => addExpenseRow());
     document.getElementById('saveExpensesBtn').addEventListener('click', () => saveExpensesFromForm());
     document.getElementById('cancelExpensesBtn').addEventListener('click', () => {
       window.__editingExpenseId = null; // clear editing state if cancelled
       hideElement('expensesFormWrap'); showElement('expensesActions');
     });
   
     document.getElementById('closeSavedExpenses').addEventListener('click', () => {
       hideElement('savedExpensesListWrap'); showElement('expensesActions');
     });
   
     // close on backdrop click
     modal.addEventListener('click', (e) => {
       if (e.target === modal) closeExpensesModal();
     });
   
     // initial render of totals (if any)
     updateExpensesDisplay();
   }
   
   /* UI helpers */
   function showElement(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
   function hideElement(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
   
   /* open/close modal */
   function openExpensesModal() {
     const modal = document.getElementById('manageExpensesModal');
     if (!modal) return;
     modal.classList.remove('hidden');
     // show action buttons by default
     showElement('expensesActions');
     hideElement('expensesFormWrap');
     hideElement('savedExpensesListWrap');
     updateExpensesModalStatus();
   }
   
   function closeExpensesModal() {
     const modal = document.getElementById('manageExpensesModal');
     if (!modal) return;
     modal.classList.add('hidden');
     // clear editing state when modal closes
     window.__editingExpenseId = null;
   }
   
   /* Add Expense form handling */
   function showAddExpenseForm(prefillRows = []) {
     hideElement('expensesActions');
     showElement('expensesFormWrap');
     const rowsWrap = document.getElementById('expenseRows');
     rowsWrap.innerHTML = '';
   
     if (Array.isArray(prefillRows) && prefillRows.length) {
       prefillRows.forEach(r => createExpenseRow(r.name, r.total, r.id || null, r.date || null));
     } else {
       addExpenseRow();
     }
   }
   
   function addExpenseRow(name = '', total = '') {
     const idx = Date.now() + Math.floor(Math.random()*1000);
     createExpenseRow(name, total, idx, formatDateForInput(new Date()));
   }
   
   function createExpenseRow(name = '', total = '', idx = null, dateVal = null) {
     idx = idx || Date.now() + Math.floor(Math.random()*1000);
     const rowsWrap = document.getElementById('expenseRows');
     const row = document.createElement('div');
     // responsive: stack on mobile, grid on sm+
     row.className = 'grid grid-cols-12 gap-2 items-center';
     row.dataset.idx = idx;
   
     const dateValue = dateVal ? formatDateForInput(dateVal) : formatDateForInput(new Date());
   
     row.innerHTML = `
       <input type="text" name="expense_name" placeholder="Expense name" value="${escapeHtml(name)}"
         class="col-span-12 sm:col-span-5 px-2 py-1 border rounded" />
       <input type="number" min="0" step="0.01" name="expense_total" placeholder="Total" value="${escapeHtml(total)}"
         class="col-span-12 sm:col-span-3 px-2 py-1 border rounded" />
       <input type="date" name="expense_date" value="${escapeHtml(dateValue)}"
         class="col-span-12 sm:col-span-3 px-2 py-1 border rounded" />
       <button type="button" class="col-span-12 sm:col-span-1 px-2 py-1 bg-red-500 text-white rounded remove-expense-row">Remove</button>
     `;
     rowsWrap.appendChild(row);
   
     row.querySelector('.remove-expense-row').addEventListener('click', () => row.remove());
   }
   
   /* Save expenses from form */
   /* Handles both append (new) and edit (if window.__editingExpenseId is set) */
   function saveExpensesFromForm() {
     const user = getCurrentUser(); if (!user) return alert('Not logged in');
     const rowsWrap = document.getElementById('expenseRows');
     const rows = Array.from(rowsWrap.children);
     if (!rows.length) { alert('Add at least one expense row'); return; }
   
     const editingId = window.__editingExpenseId || null;
   
     // load existing
     const arr = getStoreExpenses(user.name) || [];
   
     if (editingId) {
       // editing mode - we expect a single row (we prefilled single row on edit)
       const r = rows[0];
       const name = (r.querySelector('input[name="expense_name"]')?.value || '').trim();
       const totRaw = (r.querySelector('input[name="expense_total"]')?.value || '').trim();
       const dateVal = (r.querySelector('input[name="expense_date"]')?.value || '').trim();
       const total = parseFloat(totRaw || '0') || 0;
       if (!name) { alert('Name required'); return; }
   
       const idx = arr.findIndex(x => x.id === editingId);
       if (idx === -1) { alert('Original expense not found (it may have been deleted)'); window.__editingExpenseId = null; return; }
   
       arr[idx].name = name;
       arr[idx].total = total;
       // store date as ISO string (store yyyy-mm-dd as ISO for safe parsing)
       arr[idx].date = (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString());
       saveStoreExpenses(user.name, arr);
   
       // clear editing state
       window.__editingExpenseId = null;
       document.getElementById('expensesStatus').textContent = `Expense updated.`;
     } else {
       // append mode - can save multiple rows
       let added = 0;
       for (const r of rows) {
         const name = (r.querySelector('input[name="expense_name"]')?.value || '').trim();
         const totRaw = (r.querySelector('input[name="expense_total"]')?.value || '').trim();
         const dateVal = (r.querySelector('input[name="expense_date"]')?.value || '').trim();
         const total = parseFloat(totRaw || '0') || 0;
         if (!name) continue; // skip empty name
         arr.push({
           id: Date.now() + Math.floor(Math.random()*1000),
           name,
           total,
           date: (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString())
         });
         added++;
       }
   
       if (!added) { alert('Please fill at least one valid expense (name + total)'); return; }
       saveStoreExpenses(user.name, arr);
       document.getElementById('expensesStatus').textContent = `${added} expense(s) saved.`;
     }
   
     // hide form, show actions
     hideElement('expensesFormWrap'); showElement('expensesActions');
     updateExpensesModalStatus();
     updateExpensesDisplay();
   
     // notify app
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   /* Render saved expenses list (manage) */
   function showSavedExpenses() {
     const user = getCurrentUser(); if (!user) return alert('Not logged in');
     hideElement('expensesFormWrap'); hideElement('expensesActions');
     showElement('savedExpensesListWrap');
   
     const listWrap = document.getElementById('savedExpensesList');
     listWrap.innerHTML = '';
     const arr = getStoreExpenses(user.name);
     if (!arr.length) { listWrap.innerHTML = '<div class="text-sm text-gray-500">No expenses saved.</div>'; return; }
   
     // sort descending by date (newest first)
     arr.sort((a,b) => (parseAnyDate(b.date)?.getTime() || 0) - (parseAnyDate(a.date)?.getTime() || 0));
   
     arr.forEach(exp => {
       const dStr = exp.date ? formatDateForInput(exp.date) : '';
       const row = document.createElement('div');
       row.className = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 border rounded';
       row.innerHTML = `
         <div>
           <div class="font-semibold">${escapeHtml(exp.name)}</div>
           <div class="text-sm text-gray-500">${fmtMoney(exp.total)} • ${escapeHtml(dStr)}</div>
         </div>
         <div class="flex gap-2 mt-2 sm:mt-0">
           <button class="px-2 py-1 bg-yellow-400 rounded edit-expense">Edit</button>
           <button class="px-2 py-1 bg-red-500 text-white rounded delete-expense">Delete</button>
         </div>
       `;
       // edit
       row.querySelector('.edit-expense').addEventListener('click', () => {
         // open form prefilled with this expense as single row for update
         showAddExpenseForm([{ name: exp.name, total: exp.total, id: exp.id, date: exp.date }]);
         // set editing id so save path updates the item instead of appending
         window.__editingExpenseId = exp.id;
       });
       // delete
       row.querySelector('.delete-expense').addEventListener('click', () => {
         if (!confirm('Delete this expense?')) return;
         deleteExpenseById(user.name, exp.id);
         showSavedExpenses(); // refresh list
         updateExpensesDisplay();
         window.dispatchEvent(new Event('dataUpdated'));
       });
   
       listWrap.appendChild(row);
     });
   }
   
   /* delete helper */
   function deleteExpenseById(storeName, id) {
     const arr = getStoreExpenses(storeName).filter(x => x.id !== id);
     saveStoreExpenses(storeName, arr);
   }
   
   /* Update modal status text */
   function updateExpensesModalStatus() {
     const user = getCurrentUser(); if (!user) return;
     const status = document.getElementById('expensesStatus');
     const arr = getStoreExpenses(user.name);
     const total = arr.reduce((s,x)=> s + (Number(x.total)||0), 0);
     status.textContent = `Saved expenses: ${arr.length} • Total (all time): ${fmtMoney(total)}`;
   }
   
 /* Update the dashboard TotalExpenses & TotalProfit cards (period aware) */
function updateExpensesDisplay() {
  const user = getCurrentUser();
  if (!user) return;

  const period = document.getElementById('dashboardPeriod')?.value || 'lifetime';

  // period-scoped expenses (uses the helper you already added)
  const expensesForPeriod = getExpensesByPeriod(period, user.name) || [];
  const totalExpenses = expensesForPeriod.reduce((s, x) => s + (Number(x.total) || 0), 0);

  // compute revenue for the same period (do locally to avoid recursion)
  const invoices = getInvoicesByPeriod(period) || [];
  // invoice total: prefer amount -> total -> fallback paid
  const totalRevenue = invoices.reduce((s, inv) => {
    return s + (Number(inv.amount) || Number(inv.total) || Number(inv.paid) || 0);
  }, 0);

  // update DOM
  const totalEl = document.getElementById('totalExpenses');
  if (totalEl) totalEl.textContent = fmtMoney(totalExpenses);

  const revEl = document.getElementById('totalRevenue');
  if (revEl) revEl.textContent = fmtMoney(totalRevenue);

  const profitEl = document.getElementById('totalProfit');
  if (profitEl) profitEl.textContent = fmtMoney(totalRevenue - totalExpenses);

  // update modal status if open
  updateExpensesModalStatus();
}

   /* helper to escape html inserted values */
   function escapeHtml(str) {
     if (str === null || str === undefined) return '';
     return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#39;');
   }
   
   /* wire init on DOM loaded */
   window.addEventListener('DOMContentLoaded', () => {
     try { initExpensesFeature(); } catch (e) { console.warn('Expenses init failed', e); }
   });
   
   



/* updateDashboardTotals now accepts a period filter */
function updateDashboardTotals(period = document.getElementById('dashboardPeriod')?.value || 'lifetime') {
  const user = getCurrentUser();
  if (!user) return;

  // invoices filtered by period
  const invoices = getInvoicesByPeriod(period);

  // products (no createdAt available in many setups) - show total products (global)
  const products = getStoreProducts(user.name);
  const totalProductsCount = Array.isArray(products) ? products.length : 0;

  // totals
  const totalInvoicesCount = invoices.length;
  const totalSalesPaid = invoices.reduce((s, inv) => s + (Number(inv.paid) || 0), 0);      // paid amounts
  const totalRevenue = invoices.reduce((s, inv) => s + (Number(inv.amount) || Number(inv.total) || 0), 0); // invoice totals

    // compute total expenses for current store and period (expenses are global / lifetime for now)
    const expensesArr = getStoreExpenses(user.name) || [];
    const totalExpenses = expensesArr.reduce((s, e) => s + (Number(e.total) || 0), 0);
  
    // update revenue DOM (unchanged — revenue is invoice sum)
    document.getElementById('totalRevenue') && (document.getElementById('totalRevenue').textContent = fmtMoney(totalRevenue));
  
    // update total expenses card
    document.getElementById('totalExpenses') && (document.getElementById('totalExpenses').textContent = fmtMoney(totalExpenses));
  
    // total profit = revenue - expenses (not lower than negative number allowed)
    const profit = totalRevenue - totalExpenses;
    document.getElementById('totalProfit') && (document.getElementById('totalProfit').textContent = fmtMoney(profit));
  
  // update DOM
  document.getElementById('totalInvoices') && (document.getElementById('totalInvoices').textContent = totalInvoicesCount);
  document.getElementById('totalProducts') && (document.getElementById('totalProducts').textContent = totalProductsCount);
  document.getElementById('totalSales') && (document.getElementById('totalSales').textContent = fmtMoney(totalSalesPaid));

  // chart
  const series = buildSalesSeries(invoices, period);
  renderSalesChart(series, period);
}

/* loadDashboard updated to wire period control & live behavior */
function loadDashboard() {
  const user = getCurrentUser();
  if (!user) return;
  authSection && authSection.classList.add('hidden');
  dashboardSection && dashboardSection.classList.remove('hidden');
  if (storeDisplayDesktop) {
    storeDisplayDesktop.textContent = user.name;
    // applyLanguage(lsGet(LS_APP_LANG, 'en')); // keep existing if used
  }

  // initial render
  const periodSel = document.getElementById('dashboardPeriod');
  const refreshBtn = document.getElementById('dashboardRefresh');

  function applyPeriodChange() {
    const p = periodSel?.value || 'lifetime';
    // clear any existing live interval
    if (dashboardLiveInterval) { 
      clearInterval(dashboardLiveInterval); 
      dashboardLiveInterval = null; 
    }
    updateDashboardTotals(p);      // update chart + invoices
    updateExpensesDisplay();       // update expenses + profit

    // if live, auto-refresh every 5 seconds
    if (p === 'live') {
      dashboardLiveInterval = setInterval(() => {
        updateDashboardTotals('today');
        updateExpensesDisplay();
      }, 5000);
    }
  }

  // wire events
  periodSel?.addEventListener('change', applyPeriodChange);
  refreshBtn?.addEventListener('click', () => applyPeriodChange());

  // when data updates elsewhere, refresh current period
  window.removeEventListener('dataUpdated', updateExpensesDisplay);
  window.removeEventListener('dataUpdated', updateDashboardTotals);
  window.addEventListener('dataUpdated', () => {
    updateDashboardTotals(periodSel?.value || 'lifetime');
    updateExpensesDisplay();
  });

  // initial apply
  applyPeriodChange();

  showSection && showSection('dashboardContent');
  setAuthVisibility && setAuthVisibility(false);

  // ensure settings cog exists and is visible
  try { window.AppSettings.createStoreSettingsBtn(); } catch (e) {}
}



 

// update when page script loads
window.addEventListener('DOMContentLoaded', () => {
  // create chart placeholder if Chart not loaded yet; chart creation will check Chart availability
  const canvas = document.getElementById('salesChart');
  if (canvas && typeof Chart === 'undefined') {
    // optionally load Chart.js if not available (do not auto-insert external scripts here to keep things offline)
    console.warn('Chart.js not found — include Chart.js library for charts to render.');
  }
});


//translation:

(function(){
  const LS_KEY = 'preferredLang';

  const translations = {
    en: {
      // Auth
      registrationTitle: "Supermarket Registration",
      regName: "Supermarket Name",
      regAddress: "Address",
      regPhone: "Phone",
      regEmail: "Email",
      regPassword: "Password",
      regConfirm: "Confirm Password",
      registerBtn: "Register",
      loginHere: "Login here",
      loginTitle: "Supermarket Login",
      loginBtn: "Login",
      registerHere: "Register here",
      logoutBtn: "Logout",

      // Dashboard / general
      viewLabel: "View:",
      dashboardPeriod: ["Lifetime","Today","Last 7 days","This month","This year","Live (auto)"],
      refresh: "Refresh",
      recycleBinTitle: "Recycle Bin",

      totalInvoices: "Total Invoices",
      totalProducts: "Total Products",
      productsNote: "Products are global (no created date)",
      totalSalesPaid: "Total Sales (Paid)",
      totalRevenue: "Total Revenue",
      revenueNote: "Sum of invoice totals (amount)",
      totalProfit: "Total Profit",
      profitNote: "Revenue minus expenses",
      totalExpenses: "Total Expenses",
      expensesNote: "Total of saved expenses",

      salesChart: "Sales chart",
      basedOnPeriod: "Based on selected period",

      // Invoices
      createInvoice: "+ Create Invoice",
      createInvoiceTitle: "Create Invoice",
      customerNameLabel: "Customer Name",
      customerPhoneLabel: "Customer Phone",
      invoiceDateLabel: "Invoice Date",
      customerNamePH: "e.g. Zakariye Salah",
      customerPhonePH: "e.g. 617125558",
      addItem: "+ Add Item",
      totalAmountLabel: "Total Amount",
      amountPaidLabel: "Amount Paid",
      statusLabel: "Status",
      statusOptions: { unpaid: "Unpaid", paid: "Paid" },
      saveInvoice: "Save Invoice",
      invoicesTitle: "Invoices",
      clearPaid: "Clear Paid",
      filterAll: "All",
      filterPaid: "Paid",
      filterUnpaid: "Unpaid",
      searchByNamePH: "Search by name...",
      reminderWA: "WhatsApp",
      reminderSMS: "SMS",
      sendAllReminders: "Send All Reminders",
      noInvoicesYet: "No invoices yet.",

      // Products
      searchProductsPH: "Search products...",
      addProductBtn: "",
      shoppingCartTitle: "Shopping Cart",
      cancelAll: "Cancel All",
      cancel: "Cancel",
      sellBtn: "Sell",
      invoiceModalTitle: "Invoice",
      backBtn: "Back",
      buyRecord: "Buy & Record Invoice",
      buyOnly: "Buy Only",
      emptyProductsTitle: "No products yet",
      emptyProductsDesc: 'Click "Add Product" to create your first one.',
      thName: "Product",
      thCost: "Original Price",
      thPrice: "Price",
      thQty: "Qty",
      thActions: "Actions",
      lblName: "Product Name *",
      lblCost: "Original Price",
      lblPrice: "Price *",
      lblQty: "Quantity *",
      saveProductBtn: "Save Product",
      productNamePH: "e.g. Rice 25kg",
      productCostPH: "0.00",
      productPricePH: "0.00",
      productQtyPH: "0",

      // Reports
      reportsTitle: "Reports",
      reportsSub: "Centralized sales records — live & exportable",
      reportsFilterLabel: "Filter:",
      reportsPeriod: ["All time","Daily","Weekly (7 days)","Monthly","Yearly"],
      reportsDateLabel: "Date:",
      reportsSearchPH: "Product or customer...",
      totalItemsLabel: "Total Items:",
      totalSalesLabel: "Total Sales:",
      reportsTable: {
        no: "#", products: "Products", qty: "Qty", total: "Total",
        paid: "Paid", due: "Due", status: "Status", customer: "Customer",
        phone: "Phone", timestamp: "Timestamp", actions: "Actions"
      },
      reportsEmpty: "No reports to show.",
      confirmDeleteReportsTitle: "Delete all reports?",
      confirmDeleteReportsText: "This will permanently remove all report records for this store.",
      confirmCancel: "Cancel",
      confirmDeleteAll: "Delete All",

      // Recycle bin
      recycleTitle: "Recycle Bin",
      restoreAll: "Restore All",
      rbDeleteAll: "Delete All",
      rbClose: "Close",
      rbInvoices: "Invoices",
      rbProducts: "Products",
      rbReports: "Reports",

      // Footer & bottom nav
      footerCopy: "All rights reserved.",
      navDashboard: "Dashboard",
      navInvoices: "Invoices",
      navProducts: "Products",
      navReports: "Reports"
    },

    so: {
      // Auth
      registrationTitle: "Diiwaangelinta Suuqa",
      regName: "Magaca Suuqa",
      regAddress: "Cinwaanka",
      regPhone: "Telefoon",
      regEmail: "Iimayl",
      regPassword: "Furaha",
      regConfirm: "Xaqiiji Furaha",
      registerBtn: "Diiwaangeli",
      loginHere: "Halkan Gali",
      loginTitle: "Geli Dukaan",
      loginBtn: "Gali",
      registerHere: "Diiwaangeli halkan",
      logoutBtn: "Ka Bax",

      // Dashboard / general
      viewLabel: "Fiiri:",
      refresh: "Cusboonaysii",
      recycleBinTitle: "Qashinka Dib-u-celinta",

      totalInvoices: "Wadarta Rasiidada",
      totalProducts: "Wadarta Alaabta",
      productsNote: "Alaabtu guud ayay tahay (ma jiro taariikh abuuris)",
      totalSalesPaid: "Wadarta Iib (La Bixiyay)",
      totalRevenue: "Wadarta Dakhliga",
      revenueNote: "Wadarta qiimaha rasiidyada (lacagta)",
      totalProfit: "Wadarta Faa'iido",
      profitNote: "Dakhliga ka jar kharashyada",
      totalExpenses: "Wadarta Kharashyada",
      expensesNote: "Wadarta kharashyada la keydiyey",

      expenseNamePH: "Magaca Kharashka",
      expenseAmountPH: "Qadarka",
      expenseCategoryDefault: "Qaybta",
      expenseCategories: ["Adeegyo","Kiro","Agabka","Mushahar"],
      addMore: "Kudar Inta Kale",
      closeBtn: "Xidh",

      salesChart: "Jaantuska Iibka",
      basedOnPeriod: "Iyada oo ku salaysan mudada la dooray",

      // Invoices
      createInvoice: "Abuur Rasiid",
      createInvoiceTitle: "Abuur Rasiid",
      customerNameLabel: "Magaca Macmiilka",
      customerPhoneLabel: "Telefoonka Macmiilka",
      invoiceDateLabel: "Taariikhda Rasiidka",
      customerNamePH: "tusaale: Zakariye Salah",
      customerPhonePH: "tusaale: 617125558",
      addItem: "Kudar Shay",
      totalAmountLabel: "Wadarta Lacagta",
      amountPaidLabel: "Lacagta La Bixiyay",
      statusLabel: "Xaaladda",
      statusOptions: { unpaid: "Lacag la'aan", paid: "La Bixiyay" },
      saveInvoice: "Keydi Rasiidka",
      invoicesTitle: "Rasiidada",
      clearPaid: "Nadiifi Bixiyaasha",
      filterAll: "Dhammaan",
      filterPaid: "La Bixiyay",
      filterUnpaid: "Lacag La'aan",
      searchByNamePH: "Ka raadi magaca...",
      reminderWA: "WhatsApp",
      reminderSMS: "SMS",
      sendAllReminders: "Dir Digniinaha oo dhan",
      noInvoicesYet: "Weli ma jiraan rasiidyo.",

      // Products
      searchProductsPH: "Raadi alaabta...",
      addProductBtn: " Kudar Alaab",
      shoppingCartTitle: "Gaadhiga Iibka",
      cancelAll: "Bixi Dhammaan",
      cancel: "Bax",
      sellBtn: "Iibso",
      invoiceModalTitle: "Rasiid",
      backBtn: "Dib u noqo",
      buyRecord: "Iibso & Diiwaangeli Rasiidka",
      buyOnly: "Iibso Kaliya",
      emptyProductsTitle: "Weli ma jiraan alaabo",
      emptyProductsDesc: 'Guji "Kudar Alaab" si aad u abuurto kii ugu horreeyay.',
      thName: "Alaabta",
      thCost: "Qiimaha Asalka",
      thPrice: "Qiimaha",
      thQty: "Tirada",
      thActions: "Ficillo",
      productModalTitle: "Kudar Alaab",
      lblName: "Magaca Alaabta *",
      lblCost: "Qiimaha Asalka",
      lblPrice: "Qiimo *",
      lblQty: "Tirada *",
      saveProductBtn: "Keydi Alaabta",
      productNamePH: "tusaale: Bariis 25kg",
      productCostPH: "0.00",
      productPricePH: "0.00",
      productQtyPH: "0",

      // Reports
      reportsTitle: "Warbixinno",
      reportsSub: "Diiwaanka iibka oo dhexe — nool & la dhoofin karo",
   
      reportsFilterLabel: "Sifee:",
      reportsPeriod: ["Waqtiga oo dhan","Maalinle","Toddobaadle (7 maalmood)","Bishii","Sannadle"],
      reportsDateLabel: "Taariikh:",
      reportsSearchPH: "Alaab ama macmiil...",
      totalItemsLabel: "Wadar Shay:",
      totalSalesLabel: "Wadar Iib:",
      reportsTable: {
        no: "#", products: "Alaabooyinka", qty: "Tirada", total: "Wadar",
        paid: "La bixiyay", due: "Lacag la bixin", status: "Xaalad", customer: "Macmiil",
        phone: "Telefoon", timestamp: "Waqtiga", actions: "Ficillo"
      },
      reportsEmpty: "Warbixin ma jiro.",
      confirmDeleteReportsTitle: "Miyaad rabtaa inaad tirtirto dhammaan warbixinada?",
      confirmDeleteReportsText: "Tani waxay si joogto ah u tirtiri doontaa dhammaan rikoorrada warbixinta ee dukaankan.",
      confirmCancel: "Bax",
      confirmDeleteAll: "Tirtir Dhammaan",

      // Recycle bin
      recycleTitle: "Qashinka Dib-u-celinta",
      restoreAll: "Soo Celin Dhammaan",
      rbDeleteAll: "Tirtir Dhammaan",
      rbClose: "Xidh",
      rbInvoices: "Rasiidada",
      rbProducts: "Alaabooyinka",
      rbReports: "Warbixinada",

      // Footer & bottom nav
      footerCopy: "Dhammaan xuquuqdu way kaydsan tahay.",
      navDashboard: "Guddiga",
      navInvoices: "Rasiidada",
      navProducts: "Alaabooyinka",
      navReports: "Warbixinada"
    }
  };

  // mapping DOM selectors -> translation keys and where to set
  const mapping = [
    // AUTH
    { sel: '#registrationForm h1', prop: 'text', key: 'registrationTitle' },
    { sel: '#regName', prop: 'placeholder', key: 'regName' },
    { sel: '#regAddress', prop: 'placeholder', key: 'regAddress' },
    { sel: '#regPhone', prop: 'placeholder', key: 'regPhone' },
    { sel: '#regEmail', prop: 'placeholder', key: 'regEmail' },
    { sel: '#regPassword', prop: 'placeholder', key: 'regPassword' },
    { sel: '#regConfirm', prop: 'placeholder', key: 'regConfirm' },
    { sel: '#registerBtn', prop: 'text', key: 'registerBtn' },
    { sel: '#registrationForm p .text-blue-600', prop: 'text', key: 'loginHere' },

    { sel: '#loginForm h1', prop: 'text', key: 'loginTitle' },
    { sel: '#loginName', prop: 'placeholder', key: 'regName' },
    { sel: '#loginPassword', prop: 'placeholder', key: 'regPassword' },
    { sel: '#loginBtn', prop: 'text', key: 'loginBtn' },
    { sel: '#loginForm p .text-blue-600', prop: 'text', key: 'registerHere' },

    // top header / settings / logout
    { sel: '#logoutBtn', prop: 'text', key: 'logoutBtn' },
    { sel: '#btnRecycleBinTop', prop: 'title', key: 'recycleBinTitle' },

    // dashboard controls
    { sel: 'label[data-i18n="viewLabel"], label.text-sm.text-gray-600', prop: 'textExact', key: 'viewLabel' },

    // Use data-i18n on the headings and notes (we annotate them on DOM ready)
    { sel: '[data-i18n="totalInvoices"]', prop: 'text', key: 'totalInvoices' },
    { sel: '[data-i18n="totalProducts"]', prop: 'text', key: 'totalProducts' },
    { sel: '[data-i18n="totalSalesPaid"]', prop: 'text', key: 'totalSalesPaid' },
    { sel: '[data-i18n="totalRevenue"]', prop: 'text', key: 'totalRevenue' },
    { sel: '[data-i18n="totalProfit"]', prop: 'text', key: 'totalProfit' },
    { sel: '[data-i18n="totalExpenses"]', prop: 'text', key: 'totalExpenses' },

    { sel: '[data-i18n="productsNote"]', prop: 'text', key: 'productsNote' },
    { sel: '[data-i18n="revenueNote"]', prop: 'text', key: 'revenueNote' },
    { sel: '[data-i18n="profitNote"]', prop: 'text', key: 'profitNote' },
    { sel: '[data-i18n="expensesNote"]', prop: 'text', key: 'expensesNote' },

    { sel: '[data-i18n="salesChart"]', prop: 'text', key: 'salesChart' },

    // manage expenses
    { sel: '#manageExpensesModal h4', prop: 'text', key: 'manageExpensesTitle' },
    { sel: '#openAddExpense', prop: 'text', key: 'addExpense' },
    { sel: '#showAllExpenses', prop: 'text', key: 'manageSaved' },
    { sel: '#expensesFormWrap input[type="text"]', prop: 'placeholder', key: 'expenseNamePH' },
    { sel: '#expensesFormWrap input[type="number"]', prop: 'placeholder', key: 'expenseAmountPH' },
    { sel: '#expensesFormWrap select option:first-child', prop: 'text', key: 'expenseCategoryDefault' },
    { sel: '#expensesFormWrap select option[value="utilities"]', prop: 'text', key: 'expenseCategories.0' },
    { sel: '#expensesFormWrap select option[value="rent"]', prop: 'text', key: 'expenseCategories.1' },
    { sel: '#expensesFormWrap select option[value="supplies"]', prop: 'text', key: 'expenseCategories.2' },
    { sel: '#expensesFormWrap select option[value="salary"]', prop: 'text', key: 'expenseCategories.3' },
    { sel: '#addExpenseRowBtn', prop: 'text', key: 'addMore' },
    { sel: '#saveExpensesBtn', prop: 'text', key: 'saveBtn' },
    { sel: '#cancelExpensesBtn', prop: 'text', key: 'cancelBtn' },
    { sel: '#closeSavedExpenses', prop: 'text', key: 'closeBtn' },

    // invoices UI
    { sel: '#createInvoiceBtn', prop: 'text', key: 'createInvoice' },
    { sel: '#createInvoiceSection h2', prop: 'text', key: 'createInvoiceTitle' },
    { sel: '#customerName', prop: 'placeholder', key: 'customerNamePH' },
    { sel: '#customerPhone', prop: 'placeholder', key: 'customerPhonePH' },
    { sel: '#addItemBtn', prop: 'text', key: 'addItem' },
    { sel: '#amount', prop: 'placeholder', key: 'totalAmountLabel' },
    { sel: '#paid', prop: 'placeholder', key: 'amountPaidLabel' },
    { sel: '#saveInvoiceBtn', prop: 'text', key: 'saveInvoice' },
    { sel: '#invoicesTitle', prop: 'text', key: 'invoicesTitle' },
    { sel: '#clearPaidBtn', prop: 'text', key: 'clearPaid' },
    { sel: '#filterStatus option[value="all"]', prop: 'text', key: 'filterAll' },
    { sel: '#filterStatus option[value="paid"]', prop: 'text', key: 'filterPaid' },
    { sel: '#filterStatus option[value="unpaid"]', prop: 'text', key: 'filterUnpaid' },
    { sel: '#searchName', prop: 'placeholder', key: 'searchByNamePH' },
    { sel: '#reminderMethod option[value="wa"]', prop: 'text', key: 'reminderWA' },
    { sel: '#reminderMethod option[value="sms"]', prop: 'text', key: 'reminderSMS' },
    { sel: '#sendAllReminders', prop: 'text', key: 'sendAllReminders' },
    { sel: '#emptyState', prop: 'text', key: 'noInvoicesYet' },

    // invoices table headers mapping left intact
    { sel: 'thead tr th', prop: 'textByOrderGeneric', key: ['reportsTable.no','tableInvoice','tableDate','tableCustomer','tablePhone','tableAmount','tablePaid','tableBalance','tableStatus','tableActions'] },

    // products section
    { sel: '#searchInput', prop: 'placeholder', key: 'searchProductsPH' },
    { sel: '#addProductBtn', prop: 'text', key: 'addProductBtn' },
    { sel: '#openCartHeader', prop: 'title', key: 'shoppingCartTitle' },
    { sel: '#clearCart', prop: 'text', key: 'cancelAll' },
    { sel: '#closeCart', prop: 'text', key: 'cancel' },
    { sel: '#sellCart', prop: 'text', key: 'sellBtn' },

    // empty products
    { sel: '#emptyTitle', prop: 'text', key: 'emptyProductsTitle' },
    { sel: '#emptyDesc', prop: 'text', key: 'emptyProductsDesc' },
    { sel: '#emptyAddBtn', prop: 'text', key: 'addProductBtn' },

    // product table headers
    { sel: '#thName', prop: 'text', key: 'thName' },
    { sel: '#thCost', prop: 'text', key: 'thCost' },
    { sel: '#thPrice', prop: 'text', key: 'thPrice' },
    { sel: '#thQty', prop: 'text', key: 'thQty' },
    { sel: '#thActions', prop: 'text', key: 'thActions' },

    // product modal
    { sel: '#modalTitle', prop: 'text', key: 'productModalTitle' },
    { sel: '#lblName', prop: 'text', key: 'lblName' },
    { sel: '#productName', prop: 'placeholder', key: 'productNamePH' },
    { sel: '#lblCost', prop: 'text', key: 'lblCost' },
    { sel: '#productCost', prop: 'placeholder', key: 'productCostPH' },
    { sel: '#lblPrice', prop: 'text', key: 'lblPrice' },
    { sel: '#productPrice', prop: 'placeholder', key: 'productPricePH' },
    { sel: '#lblQty', prop: 'text', key: 'lblQty' },
    { sel: '#productQty', prop: 'placeholder', key: 'productQtyPH' },
    { sel: '#cancelModal', prop: 'text', key: 'cancelBtn' },
    { sel: '#saveProductBtn', prop: 'text', key: 'saveProductBtn' },

    // reports
    { sel: '#reportsSection h1', prop: 'text', key: 'reportsTitle' },
    { sel: '#reportsSection p.text-sm', prop: 'text', key: 'reportsSub' },
    { sel: '#reportsExportPdf', prop: 'text', key: 'exportPdf' },
    { sel: '#reportsDeleteAll', prop: 'text', key: 'deleteAllReports' },
    { sel: '#reportsPeriod', prop: 'options', key: 'reportsPeriod' },
    { sel: '#reportsSearchInput', prop: 'placeholder', key: 'reportsSearchPH' },
    { sel: '#reportsTotalItems', prop: 'text', key: 'totalItemsLabel' },
    { sel: '#reportsTotalSales', prop: 'text', key: 'totalSalesLabel' },
    { sel: '#reportsEmptyMsg', prop: 'text', key: 'reportsEmpty' },

    // reports confirm modal
    { sel: '#reportsConfirmDeleteAll h3', prop: 'text', key: 'confirmDeleteReportsTitle' },
    { sel: '#reportsConfirmDeleteAll p', prop: 'text', key: 'confirmDeleteReportsText' },
    { sel: '#reportsCancelDeleteAll', prop: 'text', key: 'confirmCancel' },
    { sel: '#reportsConfirmDeleteAllBtn', prop: 'text', key: 'confirmDeleteAll' },

    // recycle modal
    { sel: '#recycleBinModal h4', prop: 'text', key: 'recycleTitle' },
    { sel: '#rbRestoreAll', prop: 'text', key: 'restoreAll' },
    { sel: '#rbDeleteAll', prop: 'text', key: 'rbDeleteAll' },
    { sel: '#closeRecycleBin', prop: 'text', key: 'rbClose' },
    { sel: '#rbInvoicesWrap h5', prop: 'text', key: 'rbInvoices' },
    { sel: '#rbProductsWrap h5', prop: 'text', key: 'rbProducts' },
    { sel: '#rbReportsWrap h5', prop: 'text', key: 'rbReports' },

    // footer
    { sel: 'footer .text-sm', prop: 'html', key: 'footerHtml' },

    // bottom nav
    { sel: 'nav#bottomNav button.navBtn:nth-child(1) span', prop: 'text', key: 'navDashboard' },
    { sel: 'nav#bottomNav button.navBtn:nth-child(2) span', prop: 'text', key: 'navInvoices' },
    { sel: 'nav#bottomNav button.navBtn:nth-child(3) span', prop: 'text', key: 'navProducts' },
    { sel: 'nav#bottomNav button.navBtn:nth-child(4) span', prop: 'text', key: 'navReports' }
  ];

  // --- helpers ---
  function getKey(obj, path){
    if (!path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts){
      if (cur === undefined || cur === null) return undefined;
      if (/^\d+$/.test(p)) cur = cur[Number(p)];
      else cur = cur[p];
    }
    return cur;
  }

  // Safe setter for text that preserves child elements (icons/buttons/event listeners).
  // If the target element already contains a dedicated child with attribute data-i18n-text we update it.
  // Otherwise we create a small <span data-i18n-text> and place it after any icon children, leaving other children intact.
  function setTextSafely(node, value){
    if (!node) return;
    // don't try to set text on non-text controls
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'canvas') {
      // these should be set via placeholder/value elsewhere, skip
      return;
    }

    // if element has an explicit child to hold i18n text, prefer that
    const existingHolder = node.querySelector && node.querySelector('[data-i18n-text]');
    if (existingHolder) {
      existingHolder.textContent = value;
      return;
    }

    // if element has no child elements, safe to set textContent
    if (!node.childElementCount) {
      node.textContent = value;
      return;
    }

    // Otherwise preserve existing child elements (icons etc.).
    // Find any text nodes that are direct children and remove them into a single span holder
    // so we can update text without destroying child elements/listeners.
    let holder = null;
    // first try to find a direct child span.i18n-text by class
    const byClass = Array.from(node.children).find(c => c.classList && c.classList.contains('i18n-text'));
    if (byClass) holder = byClass;

    if (!holder) {
      // create holder
      holder = document.createElement('span');
      holder.setAttribute('data-i18n-text','true');
      holder.className = 'i18n-text';
      // place holder after any <i> or svg icon children, but before interactive grandchildren that are purely structural.
      // heuristic: append as last child
      node.appendChild(holder);
    }

    holder.textContent = value;
  }

  function setProp(node, prop, value){
    if (!node) return;
    try {
      if (prop === 'text') setTextSafely(node, value);
      else if (prop === 'html') node.innerHTML = value;
      else if (prop === 'placeholder') {
        if ('placeholder' in node) node.placeholder = value;
      }
      else if (prop === 'title') node.title = value;
      else if (prop === 'value') node.value = value;
    } catch(e){ console.error('setProp error', e); }
  }

    // replace old applyOptions with this improved version
    function applyOptions(selectNode, arr, optsValues) {
      if (!selectNode) return;
      // preserve previous selected index (so switching language doesn't unexpectedly change selected option)
      const prevIndex = (typeof selectNode.selectedIndex === 'number') ? selectNode.selectedIndex : 0;
      selectNode.innerHTML = '';
      arr.forEach((label, i) => {
        const o = document.createElement('option');
        // if optsValues provided use that as the option value (canonical keys), otherwise use label (fallback)
        o.value = (optsValues && typeof optsValues[i] !== 'undefined') ? optsValues[i] : label;
        o.textContent = label;
        selectNode.appendChild(o);
      });
      // restore selection by index (clamped)
      selectNode.selectedIndex = Math.max(0, Math.min(prevIndex, selectNode.options.length - 1));
    }
  



  // Annotate fragile elements with data-i18n (BUT: annotate headings/labels, NOT numeric amounts)
  // Improvements:
  // - Chart annotation finds the canvas by id (#salesChart) and annotates nearby header/subtitle only.
  // - We won't query broad selectors that might pick the canvas or chart internals.
  function annotateKeyElements() {
    try {
      // Annotate dashboard card headings (h3 inside each card in the grid)
      const cardKeys = ['totalInvoices','totalProducts','totalSalesPaid','totalRevenue','totalProfit','totalExpenses'];
      const cardContainers = Array.from(document.querySelectorAll('#dashboardContent .grid > div'));
      cardContainers.forEach((cardEl, idx) => {
        const h3 = cardEl.querySelector('h3.text-lg, h3');
        if (h3 && cardKeys[idx]) {
          h3.setAttribute('data-i18n', cardKeys[idx]);
        }
        const noteEl = cardEl.querySelector('.text-xs');
        if (noteEl) {
          // map note keys sensibly by card index: products (1), revenue (3), profit (4), expenses (5)
          if (idx === 1) noteEl.setAttribute('data-i18n','productsNote');
          else if (idx === 3) noteEl.setAttribute('data-i18n','revenueNote');
          else if (idx === 4) noteEl.setAttribute('data-i18n','profitNote');
          else if (idx === 5) noteEl.setAttribute('data-i18n','expensesNote');
          else {
            // fallback: annotate if not yet annotated
            if (!document.querySelector('[data-i18n="productsNote"]')) noteEl.setAttribute('data-i18n','productsNote');
            else if (!document.querySelector('[data-i18n="revenueNote"]')) noteEl.setAttribute('data-i18n','revenueNote');
            else if (!document.querySelector('[data-i18n="profitNote"]')) noteEl.setAttribute('data-i18n','profitNote');
            else if (!document.querySelector('[data-i18n="expensesNote"]')) noteEl.setAttribute('data-i18n','expensesNote');
          }
        }
      });

      // Chart heading & subtitle: locate by canvas id to avoid selecting chart internals
      const canvas = document.getElementById('salesChart');
      if (canvas) {
        // walk up to the card that contains the canvas
        let candidate = canvas.closest('.mt-6') || canvas.parentElement;
        if (candidate) {
          // find the heading in that card (an h3) and the small subtitle
          const h3 = candidate.querySelector('h3.text-lg.font-semibold, h3.text-lg, h3');
          if (h3) h3.setAttribute('data-i18n','salesChart');
          const subtitle = candidate.querySelector('.text-sm');
          if (subtitle) subtitle.setAttribute('data-i18n','basedOnPeriod');
        }
      } else {
        // fallback: try previous selector but don't touch canvas itself
        const chartCard = document.querySelector('#dashboardContent .mt-6.bg-white, #dashboardContent .mt-6');
        if (chartCard) {
          const h3 = chartCard.querySelector('h3.text-lg.font-semibold, h3.text-lg, h3');
          if (h3) h3.setAttribute('data-i18n','salesChart');
          const smallText = chartCard.querySelector('.text-sm');
          if (smallText) smallText.setAttribute('data-i18n','basedOnPeriod');
        }
      }

      // Also ensure "View:" label gets a data-i18n attr if present
      const viewLabel = document.querySelector('label.text-sm.text-gray-600');
      if (viewLabel && !viewLabel.hasAttribute('data-i18n')) viewLabel.setAttribute('data-i18n','viewLabel');

    } catch(e) {
      console.warn('annotateKeyElements failed', e);
    }
  }

  // Apply translations using safe setter
  function applyTranslations(lang) {
    const dict = translations[lang] || translations.en;

    annotateKeyElements();

    mapping.forEach(item => {
      try {
        const nodes = Array.from(document.querySelectorAll(item.sel));
        if (!nodes.length) return;
        if (item.prop === 'text') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes.forEach(n => setProp(n, 'text', v));
        } else if (item.prop === 'html') {
          if (item.key === 'footerHtml') {
            const copy = dict.footerCopy || '';
            nodes.forEach(n => {
              const name = '<span class="font-semibold">Zakariye</span>';
              n.innerHTML = `&copy; 2025 ${name}. ${copy}`;
            });
          } else {
            const v = getKey(dict, item.key);
            if (v !== undefined) nodes.forEach(n => setProp(n, 'html', v));
          }
        } else if (item.prop === 'placeholder') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes.forEach(n => setProp(n, 'placeholder', v));
        } else if (item.prop === 'title') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes.forEach(n => setProp(n, 'title', v));
        } else if (item.prop === 'options') {
          const arr = getKey(dict, item.key) || [];
          // Special-case reportsPeriod: keep canonical option values for filtering logic
          if (item.key === 'reportsPeriod') {
            // canonical keys your filtering expects
            const canonical = ['lifetime','daily','weekly','monthly','yearly'];
            nodes.forEach(n => applyOptions(n, arr, canonical));
          } else {
            nodes.forEach(n => applyOptions(n, arr));
          }
        }
 else if (item.prop === 'textByIndex') {
          const arr = item.key;
          nodes.forEach((n, idx) => {
            const entry = arr[idx];
            if (!entry) return;
            const v = getKey(dict, entry.key);
            if (v !== undefined) setProp(n, 'text', v);
          });
        } else if (item.prop === 'textByOrder') {
          const list = item.key || [];
          list.forEach((entry, i) => {
            const el = nodes[i];
            if (!el) return;
            const v = getKey(dict, entry.key);
            if (v !== undefined) setProp(el, 'text', v);
          });
        } else if (item.prop === 'textByOrderGeneric') {
          const keys = item.key || [];
          nodes.forEach((n, i) => {
            const k = keys[i];
            if (!k) return;
            let v = getKey(dict, k);
            if (v === undefined) v = dict[k];
            if (v !== undefined) setProp(n, 'text', v);
          });
        } else if (item.prop === 'textExact') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes[0] && setProp(nodes[0], 'text', v);
        }
      } catch (e) {
        console.error('i18n mapping error', e, item);
      }
    });

    // status select options
    const statusSel = document.getElementById('status');
    if (statusSel) {
      const st = getKey(dict, 'statusOptions') || {};
      Array.from(statusSel.options).forEach(opt => {
        if (opt.value && st[opt.value]) opt.textContent = st[opt.value];
        else {
          const maybe = getKey(dict, `statusOptions.${opt.value}`);
          if (maybe) opt.textContent = maybe;
        }
      });
    }

    // reports table headers (if present)
    const reportsThead = document.querySelectorAll('#reportsTable thead th');
    if (reportsThead && reportsThead.length) {
      const rt = dict.reportsTable || {};
      const keys = ['no','products','qty','total','paid','due','status','customer','phone','timestamp','actions'];
      reportsThead.forEach((th, i) => {
        const k = keys[i];
        if (rt && rt[k]) th.textContent = rt[k];
      });
    }

    // bottom nav explicit
    const navMap = {
      'nav#bottomNav button.navBtn:nth-child(1) span': dict.navDashboard,
      'nav#bottomNav button.navBtn:nth-child(2) span': dict.navInvoices,
      'nav#bottomNav button.navBtn:nth-child(3) span': dict.navProducts,
      'nav#bottomNav button.navBtn:nth-child(4) span': dict.navReports
    };
    Object.entries(navMap).forEach(([sel, txt])=>{
      const el = document.querySelector(sel);
      if (el && txt) el.textContent = txt;
    });

    if (lang) localStorage.setItem(LS_KEY, lang);
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{
    const saved = localStorage.getItem(LS_KEY) || 'so';
    // Annotate once early (but apply translations after annotation)
    annotateKeyElements();
    applyTranslations(saved);

    // Expose helpers
    window.applyTranslations = applyTranslations;
    window.annotateI18nKeys = annotateKeyElements;
  });

  // Convenience setter
  window.setAppLanguage = function(lang){
    if (!lang) return;
    applyTranslations(lang);
  };

})();



/* =========================
   Recycle Bin (Trash) feature
   - Soft-delete items to per-store trash
   - Restore / Permanent delete / Purge older than 60 days
   ========================= */

   const LS_TRASH_PREFIX = 'store_trash_v1_'; // per-store key
   const TRASH_RETENTION_DAYS = 60;
   
   function getTrashKey(storeName) { return LS_TRASH_PREFIX + storeName; }
   
   function getStoreTrash(storeName) {
     try {
       const arr = JSON.parse(localStorage.getItem(getTrashKey(storeName)) || '[]');
       return Array.isArray(arr) ? arr : [];
     } catch (e) { return []; }
   }
   function saveStoreTrash(storeName, arr) {
     localStorage.setItem(getTrashKey(storeName), JSON.stringify(Array.isArray(arr) ? arr : []));
   }
   
   // move an item into trash. `type` = 'product' | 'invoice' | 'report' (free-form allowed)
   function moveToTrash(storeName, type, payload) {
     const trash = getStoreTrash(storeName);
     const id = payload?.id || (`trash_${Date.now()}_${Math.floor(Math.random()*1000)}`);
     const item = {
       id,                 // unique id (original id if present)
       type,
       payload,
       deletedAt: new Date().toISOString()
     };
     trash.push(item);
     saveStoreTrash(storeName, trash);
     // remove from original storage (best-effort)
     try {
       if (type === 'product' && typeof deleteProductById === 'function') {
         deleteProductById(storeName, payload.id);
       } else if (type === 'invoice' && typeof deleteInvoiceById === 'function') {
         deleteInvoiceById(storeName, payload.id);
       } else if (type === 'report' && typeof deleteReportById === 'function') {
         deleteReportById(storeName, payload.id);
       } else {
         // generic removal fallback: try common store functions
         tryRemoveOriginal(storeName, type, payload);
       }
     } catch(e) { console.warn('moveToTrash remove original error', e); }
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   // helper fallback to remove original item if specific delete functions not present
   function tryRemoveOriginal(storeName, type, payload) {
     if (!payload || !payload.id) return;
     // products
     if (type === 'product') {
       if (typeof getStoreProducts === 'function' && typeof saveStoreProducts === 'function') {
         const arr = getStoreProducts(storeName).filter(p => p.id !== payload.id);
         saveStoreProducts(storeName, arr);
         return;
       }
     }
     // invoices
     if (type === 'invoice') {
       if (typeof getStoreInvoices === 'function' && typeof saveStoreInvoices === 'function') {
         const arr = getStoreInvoices(storeName).filter(i => i.id !== payload.id);
         saveStoreInvoices(storeName, arr);
         return;
       }
     }
     // reports fallback (try 'reports_v1' localStorage)
     if (type === 'report') {
       try {
         const k = `reports_v1_${storeName}`;
         const arr = JSON.parse(localStorage.getItem(k) || '[]').filter(r => r.id !== payload.id);
         localStorage.setItem(k, JSON.stringify(arr));
       } catch (e) {}
     }
   }
   
   function getAllReports() {
    const storeName = getCurrentUser()?.name;
    if (!storeName) return [];
    return JSON.parse(localStorage.getItem(`reports_v1_${storeName}`) || '[]');
  }
  
  function saveAllReports(arr) {
    const storeName = getCurrentUser()?.name;
    if (!storeName) return;
    localStorage.setItem(`reports_v1_${storeName}`, JSON.stringify(Array.isArray(arr) ? arr : []));
  }
     // restore a trash item back into proper storage
// Robust restore that matches the app's storage conventions
function restoreFromTrash(storeName, trashId) {
  const trash = getStoreTrash(storeName);
  const idx = trash.findIndex(t => t.id === trashId);
  if (idx === -1) return false;

  const item = trash.splice(idx, 1)[0];
  const type = (item.type || '').toLowerCase();
  const payload = item.payload;

  try {
    if (type === 'invoice') {
      // Preferred helpers (most apps use these)
      if (typeof getAllInvoices === 'function' && typeof saveAllInvoices === 'function') {
        const arr = Array.isArray(getAllInvoices()) ? getAllInvoices() : [];
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1); // remove duplicate
        arr.push(payload);
        saveAllInvoices(arr);
      }
      // Alternate per-store helpers
      else if (typeof getStoreInvoices === 'function' && typeof saveStoreInvoices === 'function') {
        const arr = Array.isArray(getStoreInvoices(storeName)) ? getStoreInvoices(storeName) : [];
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        saveStoreInvoices(storeName, arr);
      }
      // Final fallback: use likely localStorage key `invoices_v1_${storeName}`
      else {
        const key = `invoices_v1_${storeName}`;
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        localStorage.setItem(key, JSON.stringify(arr));
      }

      // immediate UI refresh
      if (typeof renderInvoiceTable === 'function') renderInvoiceTable();
    }
    else if (type === 'product') {
      if (typeof getStoreProducts === 'function' && typeof saveStoreProducts === 'function') {
        const arr = Array.isArray(getStoreProducts(storeName)) ? getStoreProducts(storeName) : [];
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        saveStoreProducts(storeName, arr);
      } else {
        const key = `products_v1_${storeName}`;
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        localStorage.setItem(key, JSON.stringify(arr));
      }
      if (typeof renderProducts === 'function') renderProducts();
    }
    else if (type === 'report') {
      const key = `reports_v1_${storeName}`;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const i = arr.findIndex(x => String(x.id) === String(payload.id));
      if (i >= 0) arr.splice(i, 1);
      arr.push(payload);
      localStorage.setItem(key, JSON.stringify(arr));
      if (typeof renderReports === 'function') renderReports();
    }
    else {
      // Generic fallback: restore to a "restored_{type}_{store}" key so data isn't lost
      const key = `restored_${type}_${storeName}`;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const i = arr.findIndex(x => String(x.id) === String(payload.id));
      if (i >= 0) arr.splice(i, 1);
      arr.push(payload);
      localStorage.setItem(key, JSON.stringify(arr));
    }
  } catch (e) {
    console.warn('restoreFromTrash error', e);
  }

  // Save updated trash and refresh UI
  saveStoreTrash(storeName, trash);
  window.dispatchEvent(new Event('dataUpdated'));
  return true;
}



   
   // permanently delete a specific trash item
   function permanentlyDeleteFromTrash(storeName, trashId) {
     const trash = getStoreTrash(storeName);
     const idx = trash.findIndex(t => t.id === trashId);
     if (idx === -1) return false;
     trash.splice(idx,1);
     saveStoreTrash(storeName, trash);
     window.dispatchEvent(new Event('dataUpdated'));
     return true;
   }
   
   // delete all trash items permanently
   function permanentlyDeleteAllTrash(storeName) {
     saveStoreTrash(storeName, []);
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   // restore all trash items (attempt best-effort)
   function restoreAllTrash(storeName) {
     const trash = getStoreTrash(storeName);
     // iterate copy since restoreFromTrash mutates storage
     const ids = trash.map(t => t.id);
     ids.forEach(id => restoreFromTrash(storeName, id));
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   // purge old items older than retention (run on load)
   function purgeOldTrash(storeName) {
     const trash = getStoreTrash(storeName);
     const now = Date.now();
     const cutoff = now - (TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
     const remaining = trash.filter(t => {
       const dt = Date.parse(t.deletedAt || '') || 0;
       return dt >= cutoff;
     });
     if (remaining.length !== trash.length) {
       saveStoreTrash(storeName, remaining);
       window.dispatchEvent(new Event('dataUpdated'));
     }
   }
   
   /* ========== UI for Recycle Bin ========== */
   
   function initRecycleBinUI() {
     const openBtn = document.getElementById('btnRecycleBinTop');
     const modal = document.getElementById('recycleBinModal');
     const closeBtn = document.getElementById('closeRecycleBin');
     const restoreAllBtn = document.getElementById('rbRestoreAll');
     const deleteAllBtn = document.getElementById('rbDeleteAll');
   
     if (openBtn) openBtn.addEventListener('click', openRecycleBin);
     if (closeBtn) closeBtn.addEventListener('click', closeRecycleBin);
     if (restoreAllBtn) restoreAllBtn.addEventListener('click', () => {
       const user = getCurrentUser(); if (!user) return;
       if (!confirm('Restore ALL items from recycle bin?')) return;
       restoreAllTrash(user.name);
       renderRecycleBin();
     });
     if (deleteAllBtn) deleteAllBtn.addEventListener('click', () => {
       const user = getCurrentUser(); if (!user) return;
       if (!confirm('Permanently DELETE ALL items? This cannot be undone.')) return;
       permanentlyDeleteAllTrash(user.name);
       renderRecycleBin();
     });
   
     // close on backdrop
     modal?.addEventListener('click', (e) => { if (e.target === modal) closeRecycleBin(); });
   
     // initial purge & render (when app loads)
     window.addEventListener('DOMContentLoaded', () => {
       const user = getCurrentUser();
       if (user) {
         purgeOldTrash(user.name);
       }
     });
   
     // re-render when data updates
     window.addEventListener('dataUpdated', () => renderRecycleBin());
   }
   
   function openRecycleBin() {
     const modal = document.getElementById('recycleBinModal');
     if (!modal) return;
     modal.classList.remove('hidden');
     renderRecycleBin();
   }
   
   function closeRecycleBin() {
     const modal = document.getElementById('recycleBinModal');
     if (!modal) return;
     modal.classList.add('hidden');
   }
   
   // render recycle bin contents
   function renderRecycleBin() {
     const user = getCurrentUser(); if (!user) return;
     const trash = getStoreTrash(user.name);
   
     const invoicesWrap = document.getElementById('rbInvoices');
     const productsWrap = document.getElementById('rbProducts');
     const reportsWrap = document.getElementById('rbReports');
     const statusEl = document.getElementById('rbStatus');
   
     invoicesWrap && (invoicesWrap.innerHTML = '');
     productsWrap && (productsWrap.innerHTML = '');
     reportsWrap && (reportsWrap.innerHTML = '');
     statusEl && (statusEl.textContent = `Items in bin: ${trash.length} • Auto-permanent delete after ${TRASH_RETENTION_DAYS} days.`);
   
     if (!trash.length) {
       const emptyMsg = `<div class="text-sm text-gray-500">Recycle bin is empty.</div>`;
       invoicesWrap && (invoicesWrap.innerHTML = emptyMsg);
       productsWrap && (productsWrap.innerHTML = emptyMsg);
       reportsWrap && (reportsWrap.innerHTML = emptyMsg);
       return;
     }
   
     // grouping
     const byType = { invoice: [], product: [], report: [], other: [] };
     trash.forEach(t => {
       const key = (t.type || 'other').toLowerCase();
       if (byType[key]) byType[key].push(t); else byType.other.push(t);
     });
   
     // helper to build item node
     function makeTrashRow(t) {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between gap-2 p-2 border rounded';
    
      // 🔹 Choose display name based on type
      let displayName = '';
      if (t.type === 'invoice') {
        displayName = t.payload?.customer || "Invoice";   // show customer name
      } else if (t.type === 'report') {
        displayName = t.payload?.title || "Report";       // show report title
      } else {
        displayName = t.payload?.name || t.payload?.id || t.type;
      }
    
      // 🔹 Build short info (you can remove ID if you don’t want to show it)
      let shortInfo = `${t.type} • ${fmtDateTime(t.deletedAt)}`;
      if (t.type === 'product') {
        shortInfo = `${t.type} • ${t.payload?.id ?? ''} • ${fmtDateTime(t.deletedAt)}`;
      }
    
      div.innerHTML = `
        <div class="truncate" title="${escapeHtml(JSON.stringify(t.payload || {}))}">
          <div class="font-semibold">${escapeHtml(displayName)}</div>
          <div class="text-xs text-gray-500">${escapeHtml(shortInfo)}</div>
        </div>
        <div class="flex gap-2">
          <button class="px-2 py-1 bg-emerald-500 text-white rounded rb-restore" data-id="${t.id}">Restore</button>
          <button class="px-2 py-1 bg-red-600 text-white rounded rb-delete" data-id="${t.id}">Delete</button>
        </div>
      `;
    
      // wire actions
      div.querySelector('.rb-restore').addEventListener('click', () => {
        if (!confirm('Restore this item?')) return;
        restoreFromTrash(getCurrentUser().name, t.id);
        renderRecycleBin();
      });
      div.querySelector('.rb-delete').addEventListener('click', () => {
        if (!confirm('Permanently delete this item? This cannot be undone.')) return;
        permanentlyDeleteFromTrash(getCurrentUser().name, t.id);
        renderRecycleBin();
      });
    
      return div;
    }
    
   
     // populate each section sorted newest-first
     (byType.invoice || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => invoicesWrap.appendChild(makeTrashRow(t)));
     (byType.product || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => productsWrap.appendChild(makeTrashRow(t)));
     (byType.report || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => reportsWrap.appendChild(makeTrashRow(t)));
     (byType.other || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => {
       // append to reportsWrap as generic
       reportsWrap.appendChild(makeTrashRow(t));
     });
   }
   
   /* Initialize recycle bin UI */
   window.addEventListener('DOMContentLoaded', () => {
     try { initRecycleBinUI(); } catch (e) { console.warn('Recycle init failed', e); }
   });

   
/* =========================
   Page transition helper + updated showSection (all pages participate)
   ========================= */

/**
 * Animate transition between two section elements.
 * dir: 'left'   => old slides left, new comes from right
 * dir: 'right'  => old slides right, new comes from left
 * If dir is falsy -> no animation (instant swap)
 */
/* ===== Modern animateSectionTransition (soft scale + fade) ===== */
function animateSectionTransition(oldEl, newEl, dir = 'left') {
  return new Promise((resolve) => {
    if (!oldEl || !newEl || oldEl === newEl || !dir) {
      if (oldEl && oldEl !== newEl) oldEl.classList.add('hidden');
      if (newEl) newEl.classList.remove('hidden');
      return resolve();
    }

    const container = oldEl.parentElement;
    const prevPos = container.style.position || '';
    if (!prevPos) container.style.position = 'relative';

    // Save inline styles to restore after animation
    const save = el => ({
      position: el.style.position || '',
      inset: el.style.inset || '',
      transition: el.style.transition || '',
      transform: el.style.transform || '',
      opacity: el.style.opacity || '',
      zIndex: el.style.zIndex || '',
      willChange: el.style.willChange || ''
    });
    const sOld = save(oldEl), sNew = save(newEl);

    // overlay both elements
    [oldEl, newEl].forEach(el => {
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      // hint for GPU acceleration
      el.style.willChange = 'transform, opacity';
    });

    newEl.classList.remove('hidden');
    newEl.style.zIndex = '600';
    oldEl.style.zIndex = '500';

    const dur = 380;
    const easing = 'cubic-bezier(.22,.9,.28,1)';

    // initial
    if (dir === 'left') {
      oldEl.style.transform = 'translateX(0) scale(1)';
      newEl.style.transform = 'translateX(12%) scale(0.975)';
    } else {
      oldEl.style.transform = 'translateX(0) scale(1)';
      newEl.style.transform = 'translateX(-12%) scale(0.975)';
    }
    newEl.style.opacity = '0.6';

    // transitions
    oldEl.style.transition = `transform ${dur}ms ${easing}, opacity ${dur}ms ${easing}`;
    newEl.style.transition = `transform ${dur}ms ${easing}, opacity ${dur}ms ${easing}`;

    // force paint
    void oldEl.offsetWidth;

    // animate
    requestAnimationFrame(() => {
      if (dir === 'left') {
        oldEl.style.transform = 'translateX(-14%) scale(0.96)';
        newEl.style.transform = 'translateX(0) scale(1)';
      } else {
        oldEl.style.transform = 'translateX(14%) scale(0.96)';
        newEl.style.transform = 'translateX(0) scale(1)';
      }
      oldEl.style.opacity = '0.65';
      newEl.style.opacity = '1';
    });

    function finish(e) {
      // ensure we listen once
      newEl.removeEventListener('transitionend', finish);
      // hide old, restore inline styles
      try { oldEl.classList.add('hidden'); } catch(e) {}

      const restore = (el, s) => {
        el.style.position = s.position;
        el.style.inset = s.inset;
        el.style.transition = s.transition;
        el.style.transform = s.transform;
        el.style.opacity = s.opacity;
        el.style.zIndex = s.zIndex;
        el.style.willChange = s.willChange;
      };
      restore(oldEl, sOld);
      restore(newEl, sNew);

      if (!prevPos) container.style.position = '';
      resolve();
    }

    // safety fallback
    newEl.addEventListener('transitionend', finish);
    setTimeout(finish, dur + 120);
  });
}


/* Section list: ordering determines animation direction */
const SECTIONS = [
  'dashboardContent',
  'invoicesSection',
  'productsSection',
  'reportsSection'
];

/* keep track of last visible section id (optional) */

/* updated showSection that uses animateSectionTransition based on SECTIONS order */
function showSection(targetId) {
  // compute current visible element among known sections
  const currentVisible = SECTIONS.map(id => document.getElementById(id)).find(el => el && !el.classList.contains('hidden'));
  const targetEl = document.getElementById(targetId);

  // If target doesn't exist, fallback to instant hide/show and clear nav
  if (!targetEl) {
    SECTIONS.map(id => document.getElementById(id)).forEach(s => s && s.classList.add('hidden'));
    setActiveNav(null);
    return;
  }

  // If already visible, just update active state
  if (currentVisible === targetEl) {
    setActiveNav(targetId || null);
    return;
  }

  // Determine direction using index order in SECTIONS
  let dir = null;
  const fromIndex = currentVisible ? SECTIONS.indexOf(currentVisible.id) : -1;
  const toIndex = SECTIONS.indexOf(targetId);

  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
    dir = (toIndex > fromIndex) ? 'left' : 'right';
  } else {
    // if either index unknown, fall back to no animation (instant)
    dir = null;
  }

  // If animation is possible, run it
  if (dir && currentVisible) {
    animateSectionTransition(currentVisible, targetEl, dir).then(() => {
      // after animation, perform section-specific refreshes
      if (targetId === "dashboardContent") updateDashboardTotals();
      if (targetId === "invoicesSection") renderInvoiceTable();
      if (targetId === "productsSection") renderProductList(searchInput?.value || '');
      if (targetId === "reportsSection") renderReports();

      setActiveNav(targetId || null);
      document.getElementById('bottomNav')?.classList.remove('hidden');
      if (typeof authSection !== 'undefined' && authSection) authSection.classList.add('hidden');
      if (typeof setAuthVisibility === 'function') setAuthVisibility(false);
      lastVisibleSectionId = targetId;
    });
    return;
  }

  // No animation: instant replace (legacy behavior)
  SECTIONS.map(id => document.getElementById(id)).forEach(s => s && s.classList.add('hidden'));
  targetEl.classList.remove('hidden');

  // section-specific updates
  if (targetId === "dashboardContent") updateDashboardTotals();
  if (targetId === "invoicesSection") renderInvoiceTable();
  if (targetId === "productsSection") renderProductList(searchInput?.value || '');
  if (targetId === "reportsSection") renderReports();

  setActiveNav(targetId || null);
  document.getElementById('bottomNav')?.classList.remove('hidden');
  if (typeof authSection !== 'undefined' && authSection) authSection.classList.add('hidden');
  if (typeof setAuthVisibility === 'function') setAuthVisibility(false);

  lastVisibleSectionId = targetId;
}

/* highlight active button (accepts null to clear active state) */
function setActiveNav(targetId) {
  // navButtons assumed to be a NodeList/array of elements wired elsewhere
  navButtons.forEach(btn => {
    const isActive = targetId && btn.getAttribute('data-target') === targetId;
    btn.classList.toggle('text-blue-600', !!isActive);
    btn.classList.toggle('font-bold', !!isActive);
  });
}


/* =========================
   Mobile swipe navigation between SECTIONS
   (lightweight, non-invasive)
   ========================= */


  
/* =========================
   Show/hide auth (login/register) - improved
   ========================= */
   function showLoginForm() {
    // show auth container and login panel, hide dashboard/other app sections
    authSection?.classList.remove('hidden');
    registrationForm?.classList.add('hidden');
    loginForm?.classList.remove('hidden');
    dashboardSection?.classList.add('hidden');
  
    // hide bottom nav while on auth screens
    document.getElementById('bottomNav')?.classList.add('hidden');
  
    // mark nav as inactive and hide store/settings controls
    setActiveNav(null);
  
    // ensure settings button exists then hide it via setAuthVisibility
    try { window.AppSettings?.createStoreSettingsBtn?.(); } catch(e) {}
    setAuthVisibility(true);
  
    // disable swipe navigation while on auth screens (if available)
    try { if (typeof window.disableSectionSwipe === 'function') window.disableSectionSwipe(); } catch(e) {}
  }
  
  function showRegisterForm() {
    authSection?.classList.remove('hidden');
    registrationForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
    dashboardSection?.classList.add('hidden');
  
    document.getElementById('bottomNav')?.classList.add('hidden');
  
    setActiveNav(null);
  
    // ensure settings button exists then hide it via setAuthVisibility
    try { window.AppSettings?.createStoreSettingsBtn?.(); } catch(e) {}
    setAuthVisibility(true);
  
    // disable swipe navigation while on auth screens
    try { if (typeof window.disableSectionSwipe === 'function') window.disableSectionSwipe(); } catch(e) {}
  }
  
  /* existing wiring for nav buttons (with guard so nav is inert on auth screens) */
  navButtons.forEach(btn => btn.addEventListener('click', (ev) => {
    // Prevent navigation while auth (login/register) is visible
    if (authSection && !authSection.classList.contains('hidden')) {
      ev.preventDefault();
      return;
    }
    const target = btn.getAttribute('data-target');
    if (target) showSection(target);
  }));
  

  /* =========================
     CLOCK
     ========================= */
  function tickClock() { const now = new Date(); const hh = String(now.getHours()).padStart(2, '0'); const mm = String(now.getMinutes()).padStart(2, '0'); const ss = String(now.getSeconds()).padStart(2, '0'); currentTimeEl && (currentTimeEl.textContent = `${fmtDate(now)} ${hh}:${mm}:${ss}`); }
  setInterval(tickClock, 1000); tickClock();

  /* =========================
     PRODUCT UI & CART
     ========================= */
  // Make addProductBtn icon-only if present
  if (addProductBtn) { addProductBtn.innerHTML = '<i class="fa-solid fa-plus"></i>'; addProductBtn.title = 'Add product'; }

  function openProductModal(isEdit = false) {
    if (!productModal) return;
    productModal.classList.remove('hidden');
    productModalBackdrop && productModalBackdrop.classList.remove('hidden');
    if (!isEdit) try { productForm.reset(); } catch (e) { }
    modalTitle && (modalTitle.textContent = isEdit ? 'Edit Product' : 'Add Product');
  }
  function closeProductModal() {
    productModal && productModal.classList.add('hidden');
    productModalBackdrop && productModalBackdrop.classList.add('hidden');
  }

  addProductBtn?.addEventListener('click', () => { editingProductId = null; openProductModal(false); });
  emptyAddBtn?.addEventListener('click', () => { editingProductId = null; openProductModal(false); });
  closeModalBtn?.addEventListener('click', closeProductModal);
  cancelModalBtn?.addEventListener('click', closeProductModal);
  productModalBackdrop?.addEventListener('click', closeProductModal);

  productForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (productName?.value || '').trim();
    const cost = parseFloat(productCost?.value) || 0;
    const price = parseFloat(productPrice?.value) || 0;
    const qty = parseInt(productQty?.value) || 0;
    if (!name || price < 0 || qty < 0) { toast('Fill product fields correctly', 'error'); return; }
    const user = getCurrentUser(); if (!user) { toast('Login required', 'error'); return; }
    const all = getAllProducts();
    if (editingProductId) {
      const idx = all.findIndex(p => p.id === editingProductId && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase());
      if (idx >= 0) all[idx] = { ...all[idx], name, cost, price, qty };
    } else {
      const id = `PRD-${Date.now()}`; all.push({ id, store: user.name, name, cost, price, qty });
    }
    saveAllProducts(all);
    closeProductModal(); renderProductList(searchInput?.value || ''); window.dispatchEvent(new Event('dataUpdated')); toast('Product saved', 'success');
  });

  function renderProductList(filter = '') {
    const user = getCurrentUser();
    if (!user) return;
  
    // Get all products
    const all = getStoreProducts(user.name) || [];
  
    // Get trashed products IDs
    const trash = getStoreTrash(user.name);
    const trashedIds = trash.filter(t => t.type === 'product').map(t => t.payload?.id);
  
    // filter out trashed products
    const allActive = all.filter(p => !trashedIds.includes(p.id));
  
    // apply search filter
    const q = (filter || '').toString().toLowerCase().trim();
    const items = q ? allActive.filter(p => (p.name || '').toString().toLowerCase().includes(q)) : allActive;
  
    if (!productRows || !productCards) return;
    productRows.innerHTML = '';
    productCards.innerHTML = '';
  
    const emptyEl = document.getElementById('emptyState');
    if (!items.length) {
      emptyEl && emptyEl.classList.remove('hidden');
      return;
    } else {
      emptyEl && emptyEl.classList.add('hidden');
    }
  
    const mobile = window.matchMedia('(max-width:640px)').matches;
  
    // Desktop Table
    if (!mobile) {
      items.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b';
        tr.innerHTML = `
          <td class="p-2">${idx + 1}</td>
          <td class="p-2">${escapeHtml(p.name)}</td>
          <td class="p-2">${Number(p.cost||0).toFixed(2)}</td>
          <td class="p-2">${Number(p.price||0).toFixed(2)}</td>
          <td class="p-2">${p.qty}</td>
          <td class="p-2 no-print">
            <div class="flex gap-2">
              <button class="action-icon" data-action="buy" data-id="${p.id}" title="Add to cart"><i class="fa-solid fa-cart-shopping"></i></button>
              <button class="action-icon" data-action="edit" data-id="${p.id}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="action-icon text-red-600 rb-delete-product" data-id="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        productRows.appendChild(tr);
  
        tr.querySelector('.rb-delete-product').addEventListener('click', () => {
          if (!confirm('Move product to recycle bin?')) return;
          moveToTrash(user.name, 'product', p);
          renderProductList(filter);
        });
      });
    }
  
    // Mobile Cards
    items.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-4 shadow hover:shadow-lg transition flex flex-col gap-3 w-full';
      card.innerHTML = `
        <div class="flex justify-between items-center">
          <h4 class="font-semibold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(p.name)}</h4>
          <div class="text-emerald-600 font-semibold">$${Number(p.price||0).toFixed(2)}</div>
        </div>
  
        <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <div>Cost: $${Number(p.cost||0).toFixed(2)}</div>
          <div>Qty: ${p.qty}</div>
        </div>
  
        <div class="flex justify-start gap-2 mt-2">
          <button class="action-icon bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition" data-action="buy" data-id="${p.id}" title="Add to cart">
            <i class="fa-solid fa-cart-shopping"></i>
          </button>
          <button class="action-icon bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-lg transition" data-action="edit" data-id="${p.id}" title="Edit">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-icon bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition rb-delete-product-mobile" data-id="${p.id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      productCards.appendChild(card);
  
      card.querySelector('.rb-delete-product-mobile').addEventListener('click', () => {
        if (!confirm('Move product to recycle bin?')) return;
        moveToTrash(user.name, 'product', p);
        renderProductList(filter);
      });
    });
  }
  
  
  

  // search
  searchInput?.addEventListener('input', e => renderProductList(e.target.value));

  // product actions delegation
  productRows?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const act = btn.getAttribute('data-action'); const id = btn.getAttribute('data-id'); handleProductAction(act, id);
  });
  productCards?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const act = btn.getAttribute('data-action'); const id = btn.getAttribute('data-id'); handleProductAction(act, id);
  });

  function handleProductAction(action, id) {
    const user = getCurrentUser(); if (!user) return;
    const all = getAllProducts();
    const idx = all.findIndex(p => p.id === id && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase());
    if (action === 'edit' && idx >= 0) {
      const prod = all[idx]; editingProductId = id; modalTitle && (modalTitle.textContent = 'Edit Product'); productName.value = prod.name; productCost.value = prod.cost; productPrice.value = prod.price; productQty.value = prod.qty; openProductModal(true); return;
    }
    if (action === 'delete' && idx >= 0) {
      if (!confirm('Delete this product?')) return;
      all.splice(idx, 1); saveAllProducts(all); renderProductList(searchInput?.value || ''); window.dispatchEvent(new Event('dataUpdated')); toast('Product deleted', 'success'); return;
    }
    if (action === 'buy' && idx >= 0) { addToCart(id); return; }
  }

  /* CART */
  function addToCart(productId) {
    const user = getCurrentUser(); if (!user) return;
    const all = getAllProducts();
    const prod = all.find(p => p.id === productId && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase());
    if (!prod) return toast('Product not found.', 'error');
    const existing = cart.find(c => c.id === productId);
    const existingQty = existing ? existing.qty : 0;
    if (existingQty + 1 > prod.qty) return toast('Not enough stock.', 'error');
    if (existing) existing.qty += 1; else cart.push({ id: prod.id, name: prod.name, price: Number(prod.price), qty: 1 });
    renderCart();
    toast('Added to cart', 'success');
  }

  function renderCart() {
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = '';
    let totalCount = 0, totalAmount = 0;
    if (!cart.length) { cartItemsEl.innerHTML = '<p class="text-gray-500">Cart is empty.</p>'; }
    else {
      cart.forEach(item => {
        totalCount += item.qty; totalAmount += item.price * item.qty;
        const row = document.createElement('div'); row.className = 'flex justify-between items-center gap-3 p-2 border-b';
        row.innerHTML = `<div><div class="font-semibold">${escapeHtml(item.name)}</div><div class="text-sm">Price: ${fmtMoney(item.price)} | Qty: ${item.qty}</div></div>
          <div class="flex flex-col items-end gap-2"><div class="text-sm font-semibold">${fmtMoney(item.price * item.qty)}</div><div class="flex gap-1"><button class="px-2 py-1 bg-gray-200 rounded" data-decrease="${item.id}">-</button><button class="px-2 py-1 bg-gray-200 rounded" data-increase="${item.id}">+</button></div><button class="px-2 py-1 bg-red-500 text-white rounded mt-1" data-remove="${item.id}">Remove</button></div>`;
        cartItemsEl.appendChild(row);
      });
    }
    cartCountHeader && (cartCountHeader.textContent = totalCount);
    shopModal && (shopModal.dataset.total = totalAmount);
    // update invoice total if invoice modal open
    if (invoiceModal && !invoiceModal.classList.contains('hidden')) {
      const invoiceTotalEl = invoiceModal.querySelector('#invoiceTotal');
      if (invoiceTotalEl) invoiceTotalEl.textContent = fmtMoney(totalAmount);
    }
  }

  cartItemsEl?.addEventListener('click', e => {
    const idRemove = e.target.getAttribute('data-remove'); const idInc = e.target.getAttribute('data-increase'); const idDec = e.target.getAttribute('data-decrease');
    const user = getCurrentUser(); if (!user) return;
    const all = getAllProducts();
    if (idRemove) { cart = cart.filter(i => i.id !== idRemove); renderCart(); return; }
    if (idInc) {
      const prod = all.find(p => p.id === idInc && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase()); if (!prod) return toast('Product not found.', 'error');
      const it = cart.find(i => i.id === idInc); if (it.qty + 1 > prod.qty) return toast('Not enough stock.', 'error'); it.qty += 1; renderCart(); return;
    }
    if (idDec) {
      const it = cart.find(i => i.id === idDec); if (!it) return; it.qty = Math.max(0, it.qty - 1); if (it.qty === 0) cart = cart.filter(i => i.id !== idDec); renderCart(); return;
    }
  });

  openCartHeader?.addEventListener('click', () => { shopModal?.classList.remove('hidden'); shopBackdrop?.classList.remove('hidden'); renderCart(); });
  closeCartBtn?.addEventListener('click', () => { shopModal?.classList.add('hidden'); shopBackdrop?.classList.add('hidden'); });
  shopBackdrop?.addEventListener('click', () => { shopModal?.classList.add('hidden'); shopBackdrop?.classList.add('hidden'); });
  clearCartBtn?.addEventListener('click', () => { if (!confirm('Clear all items from cart?')) return; cart = []; renderCart(); });


  backToCartBtn?.addEventListener('click', () => { invoiceModal?.classList.add('hidden'); shopModal?.classList.remove('hidden'); shopBackdrop?.classList.remove('hidden'); });

/* ---------- Helper: set amountPaid readonly when status==paid + live status sync ---------- */
/* ---------- Helper: manage status/amount sync ---------- */
function applyStatusPaidBehavior(container, total) {
  if (!container) return;
  // support either #amountPaid or #paid
  const amountPaidInput = container.querySelector('#amountPaid') || container.querySelector('#paid');
  const statusSelect = container.querySelector('#status');
  const totalEl = container.querySelector('#invoiceTotal') || container.querySelector('#amount') || null;

  const ttl = Number(total || (totalEl ? Number(totalEl.textContent || totalEl.value || 0) : 0));
  let lastStatus = 'unpaid';

  // show total if element available
  if (totalEl && totalEl.tagName.toLowerCase() !== 'input') {
    totalEl.textContent = fmtMoney(ttl);
  } else if (totalEl && totalEl.tagName.toLowerCase() === 'input') {
    // keep input formatted (amountInput typically)
    totalEl.value = fmtMoney(ttl);
  }

  // ensure partial option exists
  if (statusSelect && !Array.from(statusSelect.options).some(o => o.value === 'partial')) {
    const opt = document.createElement('option');
    opt.value = 'partial';
    opt.textContent = 'partial';
    // put partial before paid/unpaid for clarity
    try { statusSelect.add(opt, statusSelect.options[1] || null); } catch (e) { statusSelect.appendChild(opt); }
  }

  // sync amount -> status
  function syncFromAmount(formatNow = true) {
    if (!amountPaidInput || !statusSelect) return;
    let val = Number((amountPaidInput.value || '').replace(/[^0-9.]/g, '')) || 0;
  
    if (val <= 0) {
      statusSelect.value = 'unpaid';
      lastStatus = 'unpaid';
    } else if (val >= ttl) {
      val = ttl; // clamp
      if (formatNow) amountPaidInput.value = fmtMoney(val);
      statusSelect.value = 'paid';
      lastStatus = 'paid';
    } else {
      if (formatNow) amountPaidInput.value = fmtMoney(val);
      statusSelect.value = 'partial';
      lastStatus = 'partial';
    }
  }
  

  // sync status -> amount
  function syncFromStatus() {
    if (!statusSelect || !amountPaidInput) return;
    const cur = statusSelect.value;

    if (cur === 'paid') {
      amountPaidInput.value = fmtMoney(ttl);
      lastStatus = 'paid';
    } else if (cur === 'unpaid') {
      amountPaidInput.value = '';
      lastStatus = 'unpaid';
    } else if (cur === 'partial') {
      // user should enter partial value manually — we don't auto-set a number
      if ((Number(amountPaidInput.value) || 0) <= 0) {
        // nothing entered yet — prompt user
        toast('Enter partial amount to set partial status.', 'warning');
        // revert selection to last status
        statusSelect.value = lastStatus || 'unpaid';
      } else {
        // keep lastStatus as partial
        lastStatus = 'partial';
      }
    }
  }

  // listeners (bind only once)
  if (amountPaidInput && !amountPaidInput._statusBound) {
    amountPaidInput.addEventListener('input', () => {
      // allow only numbers and dot
      const raw = (amountPaidInput.value || '').replace(/[^0-9.]/g, '');
      amountPaidInput.value = raw; // keep what user typed
      syncFromAmount(false);       // don't auto-format
    });
  
    // format nicely when focus leaves
    amountPaidInput.addEventListener('blur', () => {
      const val = Number((amountPaidInput.value || '').replace(/[^0-9.]/g, '')) || 0;
      amountPaidInput.value = val ? fmtMoney(val) : '';
      syncFromAmount(true);
    });
  
    amountPaidInput._statusBound = true;
  }
  

  // run initial sync
  syncFromAmount();
}



/* ----------------- SELL (open invoice modal) ----------------- */
sellCartBtn?.addEventListener('click', () => {
  if (!cart.length) return toast('Cart empty.', 'error');
  if (!invoiceModal) { toast('Invoice modal not found', 'error'); return; }

  const custInput = invoiceModal.querySelector('#customerName');
  const phoneInput = invoiceModal.querySelector('#customerPhone');
  const dateInput = invoiceModal.querySelector('#invoiceDate');
  const totalEl = invoiceModal.querySelector('#invoiceTotal');
  const amountPaidInput = invoiceModal.querySelector('#amountPaid');
  const statusSelectEl = invoiceModal.querySelector('#status');

  // keep previous customer if they typed one earlier, otherwise blank to allow entry
  // (user wanted ability to pass customer name; leave it editable)
  if (custInput && !custInput.value) custInput.value = '';
  if (phoneInput && !phoneInput.value) phoneInput.value = '+252';
  if (dateInput) dateInput.value = fmtDate(new Date());

  // compute total from current cart
  const total = Number(shopModal?.dataset.total || 0);
  if (totalEl) totalEl.textContent = fmtMoney(total);

  // default status to unpaid unless previously chosen
  if (statusSelectEl && !statusSelectEl.value) statusSelectEl.value = 'unpaid';

  // clear or set amountPaid depending on status (apply readonly behavior)
  if (amountPaidInput && (statusSelectEl?.value !== 'paid')) {
    // keep last value or default to empty
    if (!amountPaidInput.value) amountPaidInput.value = '';
    amountPaidInput.removeAttribute('readonly');
    amountPaidInput.classList.remove('bg-gray-100');
  }

  // apply paid behavior (this will set paid==total & readonly if status==paid)
  applyStatusPaidBehavior(invoiceModal, total);

  // show modal
  invoiceModal?.classList.remove('hidden');
  shopModal?.classList.add('hidden');
  shopBackdrop?.classList.add('hidden');
});

/* ----------------- BUY & RECORD (finalize invoice) ----------------- */
buyRecordBtn?.addEventListener('click', () => {
  if (!invoiceModal) return;
  const custEl = invoiceModal.querySelector('#customerName');
  const phoneEl = invoiceModal.querySelector('#customerPhone');
  const dateEl = invoiceModal.querySelector('#invoiceDate');
  const totalEl = invoiceModal.querySelector('#invoiceTotal');
  const amountPaidEl = invoiceModal.querySelector('#amountPaid');
  const statusEl = invoiceModal.querySelector('#status');

  const cust = custEl?.value.trim();
  const phone = phoneEl?.value.trim();
  const date = dateEl?.value || fmtDate(new Date());
  const total = Number((totalEl?.textContent || shopModal?.dataset.total) || 0);
  let paid = Number(amountPaidEl?.value || 0);
  const status = statusEl?.value || 'unpaid';

  // validations: customer + phone required
  if (!cust) { toast('Customer name required', 'error'); return; }
  if (!phone) { toast('Customer phone required', 'error'); return; }

  // stock check
  const allProducts = getAllProducts();
  for (const c of cart) {
    const prod = allProducts.find(p => p.id === c.id);
    if (!prod || prod.qty < c.qty) return toast(`Not enough stock for ${c.name}.`, 'error');
  }

  // if status is paid => override paid to total and set readonly (defensive)
  if (status === 'paid') {
    paid = Number(total);
    if (amountPaidEl) {
      amountPaidEl.value = String(Number(total).toFixed(2));
      amountPaidEl.setAttribute('readonly', 'true');
      amountPaidEl.classList.add('bg-gray-100');
    }
  } else {
    // if unpaid/partial: ensure paid is within 0..total
    if (paid < 0) { toast('Paid amount cannot be negative', 'error'); return; }
    if (paid > total) { toast('Paid cannot be greater than total', 'error'); return; }
    // allow editable
    if (amountPaidEl) amountPaidEl.removeAttribute('readonly');
  }

  // build invoice
  const invoiceItems = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, total: i.price * i.qty }));
  const invId = `INV-${Date.now()}`;
  const invoicePayload = { id: invId, store: getCurrentUser().name, date, customer: cust, phone, items: invoiceItems, amount: total, paid, status };
  const allInv = getAllInvoices(); allInv.push(invoicePayload); saveAllInvoices(allInv);

  // create report entry: use passed values
  createReportEntry({
    id: `RPT-${Date.now()}`,
    date,
    store: getCurrentUser().name,
    items: invoiceItems,
    amount: total,
    paid,
    status,
    customer: cust,
    phone
  });

  // update stock
  for (const c of cart) {
    const idx = allProducts.findIndex(p => p.id === c.id && String(p.store || '').toLowerCase() === String(getCurrentUser().name || '').toLowerCase());
    if (idx >= 0) allProducts[idx].qty = Math.max(0, allProducts[idx].qty - c.qty);
  }
  saveAllProducts(allProducts);

  // finalize
  cart = [];
  renderCart();
  renderProductList(searchInput?.value || '');
  invoiceModal?.classList.add('hidden');
  window.dispatchEvent(new Event('dataUpdated'));
  toast('Sold & recorded.', 'success');
  resetInvoiceForm();
});

/* ----------------- BUY ONLY (quick record) ----------------- */
/* ----------------- BUY ONLY (quick record) - updated to respect amountPaid if provided in modal ----------------- */
buyOnlyBtn?.addEventListener('click', () => {
  if (!cart.length) return toast('Cart empty', 'error');

  // try to read invoice modal fields if present, else use defaults
  const custInput = invoiceModal?.querySelector('#customerName');
  const phoneInput = invoiceModal?.querySelector('#customerPhone');
  const statusSelectEl = invoiceModal?.querySelector('#status');
  const amountPaidInput = invoiceModal?.querySelector('#amountPaid');

  const cust = custInput?.value?.trim() || 'Walk-in Customer';
  const phone = phoneInput?.value?.trim() || '+252000000000';
  const status = statusSelectEl?.value || 'unpaid';

  const total = Number(shopModal?.dataset.total || 0);
  const allProducts = getAllProducts();

  // stock check
  for (const c of cart) {
    const prod = allProducts.find(p => p.id === c.id);
    if (!prod || prod.qty < c.qty) return toast(`Not enough stock for ${c.name}.`, 'error');
  }

  // determine paid:
  // prefer explicit amountPaid input (if present), otherwise fallback to status === 'paid' => total, else 0
  let paid = 0;
  if (amountPaidInput && amountPaidInput.value !== '') {
    paid = Number(amountPaidInput.value) || 0;
  } else {
    paid = (status === 'paid') ? Number(total) : 0;
  }

  // enforce bounds
  if (paid < 0) return toast('Paid amount cannot be negative', 'error');
  if (paid > total) return toast('Paid cannot be greater than total', 'error');

  const invoiceItems = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, total: i.price * i.qty }));

  createReportEntry({
    id: `RPT-${Date.now()}`,
    date: fmtDate(new Date()),
    store: getCurrentUser().name,
    items: invoiceItems,
    amount: total,
    paid: paid,
    status: (status === 'partial' ? 'partial' : status),
    customer: cust,
    phone: phone
  });

  // reduce stock
  for (const c of cart) {
    const idx = allProducts.findIndex(p => p.id === c.id && String(p.store || '').toLowerCase() === String(getCurrentUser().name || '').toLowerCase());
    if (idx >= 0) allProducts[idx].qty = Math.max(0, allProducts[idx].qty - c.qty);
  }
  saveAllProducts(allProducts);

  cart = [];
  renderCart();
  renderProductList(searchInput?.value || '');
  // close modals if open
  invoiceModal?.classList.add('hidden');
  shopModal?.classList.add('hidden');
  shopBackdrop?.classList.add('hidden');
  window.dispatchEvent(new Event('dataUpdated'));
  toast('Recorded in Reports.', 'success');
  resetInvoiceForm()
});



  /* report helper */
  function createReportEntry({ id, date, store, items, amount, paid = 0, status = null, customer, phone, type = "sale" }) {
    const reports = getAllReports();
    const itemsArr = Array.isArray(items) ? items : (items ? [items] : []);
    const computedAmount = Number(amount) || itemsArr.reduce((s, it) => { const qty = Number(it?.qty ?? it?.quantity ?? 1); const line = Number(it?.total ?? (it?.price ? it.price * qty : 0)); return s + (isFinite(line) ? line : 0); }, 0);
    const paidNum = Number(paid || 0);
    const computedStatus = status || (paidNum >= computedAmount ? 'paid' : 'unpaid');
    const payload = { id: id || `RPT-${Date.now()}`, date: date || Date.now(), store: store || (getCurrentUser && getCurrentUser().name) || null, items: itemsArr, amount: Number(computedAmount), paid: paidNum, due: Number((computedAmount - paidNum) || 0), status: computedStatus, type, customer: customer || 'Walk-in Customer', phone: phone || '+252000000000' };
    reports.push(payload); saveAllReports(reports); window.dispatchEvent(new Event('dataUpdated'));
  }

   /* =========================
     INVOICES UI (create/edit/list/actions)
     ========================= */

     function makeItemRow(data = {}) {
      function escapeHtmlSafe(s) {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function parseNumberFromInput(s) {
        if (s == null) return 0;
        const cleaned = String(s).replace(/[^0-9.-]/g,'');
        const n = parseFloat(cleaned);
        return isFinite(n) ? n : 0;
      }
    
      const row = document.createElement('div');
      row.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 items-end';
    
      const safeName = (data.name || data.product || '').toString();
      const safePrice = Number(data.price ?? 0);
    
      row.innerHTML = `
        <div class="col-span-1 sm:col-span-2">
          <input class="item-name w-full border rounded-xl px-3 py-2" 
                 placeholder="Item name" 
                 value="${escapeHtmlSafe(safeName)}" 
                 aria-label="Item name">
        </div>
    
        <div class="flex gap-2 items-end">
          <input type="number" min="0" step="0.01" 
                 class="item-price border rounded-xl px-3 py-2 flex-1" 
                 placeholder="Price" 
                 value="${safePrice}" 
                 aria-label="Price">
          <button type="button" 
                  class="remove-item ml-1 inline-flex items-center justify-center w-9 h-9 rounded-full bg-red-500 text-white" 
                  title="Remove item" aria-label="Remove item">✕</button>
        </div>
      `;
    
      const priceEl = row.querySelector('.item-price');
      const removeBtn = row.querySelector('.remove-item');
      const nameEl = row.querySelector('.item-name');
    
      function updateTotals() {
        if (typeof recalcInvoiceTotals === 'function') recalcInvoiceTotals();
      }
    
      priceEl.addEventListener('input', () => {
        priceEl.value = (priceEl.value || '').toString().replace(/[^\d.]/g, '');
        updateTotals();
      });
    
      removeBtn.addEventListener('click', () => {
        row.remove();
        updateTotals();
      });
    
      nameEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          priceEl.focus();
        }
      });
    
      return row;
    }
    
    /* ---------- Simplified recalcInvoiceTotals ---------- */
    function recalcInvoiceTotals() {
      if (!invoiceItemsContainer) return;
      const priceEls = Array.from(invoiceItemsContainer.querySelectorAll('.item-price'));
      const total = priceEls.reduce((s, el) => s + parseFloat(String(el.value || '0').replace(/[^0-9.-]/g, '')) || 0, 0);
      
      if (amountInput) {
        if (typeof fmtMoney === 'function') amountInput.value = fmtMoney(total);
        else amountInput.value = Number(total).toFixed(2);
      }
    
      const paid = Number((paidInput?.value || '').toString().replace(/[^0-9.-]/g, '')) || 0;
      if (statusSelect) statusSelect.value = (paid >= total && total > 0) ? 'paid' : 'unpaid';
    }
    
    
    paidInput?.addEventListener('input', recalcInvoiceTotals);
  
    function resetInvoiceForm() {
      if (!editingInvoiceId) return;
      editingInvoiceId.value = '';
      customerNameInput.value = '';
      customerPhoneInput.value = '';
      invoiceDateInput.value = fmtDate(new Date());
      amountInput && (amountInput.value = '0.00');
      paidInput && (paidInput.value = '');
      if (statusSelect) statusSelect.value = 'unpaid';
      invoiceItemsContainer && (invoiceItemsContainer.innerHTML = '');
      invoiceItemsContainer && invoiceItemsContainer.appendChild(makeItemRow());
      formMsg && formMsg.classList.add('hidden');
      formMsg && (formMsg.textContent = '');
    }
  

//     // Example: when showing invoice create modal
// function openInvoiceCreateModal(totalAmount) {
//   const modal = document.getElementById('createInvoiceModal');
//   modal.classList.remove('hidden');

//   // Fill total
//   const totalEl = modal.querySelector('#invoiceTotal');
//   if (totalEl) totalEl.value = fmtMoney(totalAmount);

//   // Apply status behavior
//   applyStatusPaidBehavior(modal, totalAmount);
// }

    // create/open invoice toggle - hidden until clicked; createInvoiceSection has hidden-section default
    createInvoiceBtn?.addEventListener('click', () => {
      if (!createInvoiceSection) return;
      if (createInvoiceSection.classList.contains('hidden') || createInvoiceSection.classList.contains('hidden-section')) {
        resetInvoiceForm();
        createInvoiceSection.classList.remove('hidden', 'hidden-section');
      } else {
        createInvoiceSection.classList.add('hidden-section');
      }
    });
  
    addItemBtn?.addEventListener('click', () => { invoiceItemsContainer && invoiceItemsContainer.appendChild(makeItemRow()); recalcInvoiceTotals(); });
  



    saveInvoiceBtn?.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) { toast('You must be logged in.', 'error'); return; }
      const name = customerNameInput?.value.trim();
      const phone = customerPhoneInput?.value.trim();
      const date = invoiceDateInput?.value || fmtDate(new Date());
      // collect items
      const items = invoiceItemsContainer ? Array.from(invoiceItemsContainer.querySelectorAll('.grid')).map(r => {
        const nm = r.querySelector('.item-name')?.value.trim() || '';
        const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
        const qty = parseInt(r.querySelector('.item-qty')?.value) || 1;
        const total = price * (qty || 1);
        return { name: nm, price, total, qty: qty || 1 };
      }).filter(it => it.name && it.price > 0) : [];
    
      if (!items.length) { showFormError('Add at least one item with name and price.'); return; }
      const amount = Number(amountInput?.value) || 0;
      const paid = Number(paidInput?.value) || 0;
      // compute status automatically
      let status = 'unpaid';
      if (paid <= 0) status = 'unpaid';
      else if (paid >= amount) status = 'paid';
      else status = 'partial';
    
      if (!name) { showFormError('Customer name required'); return; }
      if (!phone) { showFormError('Customer phone required'); return; }
    
      const all = getAllInvoices();
      const id = editingInvoiceId?.value || `INV-${Date.now()}`;
      // keep prevPaid if partial to support toggling back
      const payload = { id, store: user.name, date, customer: name, phone, items, amount, paid, status };
      if (status === 'partial') payload.prevPaid = payload.paid; // store prevPaid for possible toggling
      const idx = all.findIndex(x => x.id === id);
      if (idx >= 0) all[idx] = payload; else all.push(payload);
      saveAllInvoices(all);
      resetInvoiceForm();
      createInvoiceSection.classList.add('hidden');
      renderInvoiceTable();
      window.dispatchEvent(new Event('dataUpdated'));
      toast('Invoice saved', 'success');
    });
    
  
    function showFormError(msg) { formMsg && (formMsg.textContent = msg, formMsg.classList.remove('hidden')); toast(msg, 'error'); }
  
    /* ============= INVOICE LIST & ACTIONS ============= */
    function filteredInvoicesForUI() {
      const user = getCurrentUser();
      if (!user) return [];
      const statusVal = filterStatus?.value || 'all';
      const searchVal = (searchName?.value || '').toLowerCase();
      return getStoreInvoices(user.name).filter(inv => {
        const statusOk = statusVal === 'all' ? true : inv.status === statusVal;
        const searchOk = !searchVal || (inv.customer && inv.customer.toLowerCase().includes(searchVal)) || (inv.phone && String(inv.phone).includes(searchVal)) || (inv.id && inv.id.toLowerCase().includes(searchVal));
        return statusOk && searchOk;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    function renderInvoiceTable() {
      if (!invoiceRows) return;
      const list = filteredInvoicesForUI();
      invoiceRows.innerHTML = '';
      if (!list.length) {
        emptyStateInv && emptyStateInv.classList.remove('hidden');
        return;
      } else {
        emptyStateInv && emptyStateInv.classList.add('hidden');
      }
    
      const mobile = window.matchMedia('(max-width:640px)').matches;
      const storeName = getCurrentUser()?.name || '';
    
      list.forEach((invObj, idx) => {
        const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
        const balanceColorClass = balance <= 0 ? 'text-emerald-600' : 'text-rose-600';
    
        let badgeClass = 'bg-amber-100 text-amber-700';
        let badgeText = escapeHtml(invObj.status || '');
        if (invObj.status === 'paid') {
          badgeClass = 'bg-emerald-100 text-emerald-700';
        } else if (invObj.status === 'partial') {
          badgeClass = 'bg-yellow-100 text-yellow-800';
        } else if (invObj.status === 'unpaid') {
          badgeClass = 'bg-rose-100 text-rose-700';
        }
    
        const toggleIcon = invObj.status === 'paid'
          ? '<i class="fas fa-check"></i>'
          : (invObj.status === 'partial' ? '<i class="fas fa-hourglass-half"></i>' : '<i class="fas fa-xmark"></i>');
    
        if (mobile) {
          const tr = document.createElement('tr');
          tr.className = 'border-b';
          tr.innerHTML = `
            <td colspan="10" class="p-2">
<div class="sm-card p-3 bg-gray-50 rounded-xl shadow-md">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold">
                    ${(storeName || 'S').slice(0, 2).toUpperCase()}
                  </div>
                  <div style="flex:1;">
                    <div class="font-semibold">Invoice ${escapeHtml(invObj.id)}</div>
                    <div class="text-sm text-gray-500">${fmtDate(invObj.date)} • ${escapeHtml(invObj.customer || '')}</div>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-between">
                  <div class="text-sm">${escapeHtml(invObj.phone || '')}</div>
                  <div class="text-right">
                    <div class="font-semibold">${fmtMoney(invObj.amount)}</div>
                    <div class="text-xs ${balanceColorClass}">
                      <span class="${badgeClass} px-2 py-1 rounded text-xs">${badgeText}</span>
                      &nbsp;•&nbsp;${fmtMoney(balance)}
                    </div>
                  </div>
                </div>
                <div class="mt-3 flex items-center gap-2 flex-wrap">
                  <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                  <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${toggleIcon}</button>
                  <button class="action-icon" data-action="wa" data-id="${invObj.id}" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
                  <button class="action-icon" data-action="sms" data-id="${invObj.id}" title="SMS"><i class="fas fa-sms"></i></button>
                  <button class="action-icon" data-action="call" data-id="${invObj.id}" title="Call"><i class="fas fa-phone"></i></button>
                  <button class="action-icon" data-action="print" data-id="${invObj.id}" title="Print"><i class="fas fa-print"></i></button>
                  <button class="action-icon text-red-600" data-action="delete" data-id="${invObj.id}" title="Delete"><i class="fas fa-trash"></i></button>
                  <button class="action-icon share-btn" data-action="share" data-id="${invObj.id}" title="Share"><i class="fas fa-share-nodes"></i></button>
                </div>
              </div>
            </td>
          `;
          invoiceRows.appendChild(tr);
        } else {
          const tr = document.createElement('tr');
          tr.className = 'border-b';
          tr.innerHTML = `
            <td class="p-2">${idx + 1}</td>
            <td class="p-2">${escapeHtml(invObj.id)}</td>
            <td class="p-2">${fmtDate(invObj.date)}</td>
            <td class="p-2">${escapeHtml(invObj.customer || '')}</td>
            <td class="p-2">${escapeHtml(invObj.phone || '')}</td>
            <td class="p-2 text-right">${fmtMoney(invObj.amount)}</td>
            <td class="p-2 text-right">${fmtMoney(invObj.paid)}</td>
            <td class="p-2 text-right ${balanceColorClass}">${fmtMoney(balance)}</td>
            <td class="p-2"><span class="${badgeClass} px-2 py-1 rounded text-xs">${badgeText}</span></td>
            <td class="p-2 no-print">
              <div class="flex gap-2">
                <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${toggleIcon}</button>
                <button class="action-icon" data-action="wa" data-id="${invObj.id}" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
                <button class="action-icon" data-action="sms" data-id="${invObj.id}" title="SMS"><i class="fas fa-sms"></i></button>
                <button class="action-icon" data-action="call" data-id="${invObj.id}" title="Call"><i class="fas fa-phone"></i></button>
                <button class="action-icon" data-action="print" data-id="${invObj.id}" title="Print"><i class="fas fa-print"></i></button>
                <button class="action-icon text-red-600" data-action="delete" data-id="${invObj.id}" title="Delete"><i class="fas fa-trash"></i></button>
                <button class="action-icon share-btn" data-action="share" data-id="${invObj.id}" title="Share"><i class="fas fa-share-nodes"></i></button>
              </div>
            </td>
          `;
          invoiceRows.appendChild(tr);
        }
      });
    }
    

  
    // invoice action listener
    invoiceRows?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const all = getAllInvoices();
      const idx = all.findIndex(x => x.id === id);
      if (idx < 0) return;
      const user = getCurrentUser();
      if (!user || String(all[idx].store || '').toLowerCase() !== String(user.name || '').toLowerCase()) { toast('Not allowed', 'error'); return; }
  
      if (action === 'delete') {
        if (confirm('Move this invoice to recycle bin?')) {
          // move a copy to recycle bin
          moveToTrash(user.name, 'invoice', all[idx]);
      
          // remove from the invoices array and save
          all.splice(idx, 1);
          saveAllInvoices(all);
      
          // update UI + global listeners
          renderInvoiceTable();
          window.dispatchEvent(new Event('dataUpdated'));
          toast('Invoice moved to recycle bin', 'success');
              }
      
      }
       else if (action === 'toggle') {
        const inv = all[idx];
        // toggling behavior:
        // - if not paid => mark paid (store prevPaid)
        // - if paid => restore prevPaid or set to unpaid
        if (inv.status !== 'paid') {
          // store previous paid state for undo
          inv.prevPaid = Number(inv.paid) || 0;
          inv.paid = Number(inv.amount) || 0;
          inv.status = 'paid';
        } else {
          // currently paid -> revert
          const prev = Number(inv.prevPaid) || 0;
          if (prev > 0 && prev < Number(inv.amount || 0)) {
            inv.paid = prev;
            inv.status = 'partial';
          } else {
            inv.paid = 0;
            inv.status = 'unpaid';
          }
          delete inv.prevPaid;
        }
        saveAllInvoices(all);
        renderInvoiceTable();
        window.dispatchEvent(new Event('dataUpdated'));
      }
      
       if (action === 'edit') {
        const invObj = all[idx];
        createInvoiceSection?.classList.remove('hidden', 'hidden-section');
        editingInvoiceId && (editingInvoiceId.value = invObj.id);
        customerNameInput && (customerNameInput.value = invObj.customer || '');
        customerPhoneInput && (customerPhoneInput.value = invObj.phone || '');
        invoiceDateInput && (invoiceDateInput.value = invObj.date || fmtDate(new Date()));
        amountInput && (amountInput.value = fmtMoney(invObj.amount || 0));
        paidInput && (paidInput.value = invObj.paid || 0);
        statusSelect && (statusSelect.value = invObj.status || 'unpaid');
        if (invoiceItemsContainer) {
          invoiceItemsContainer.innerHTML = '';
          (invObj.items || []).forEach(it => invoiceItemsContainer.appendChild(makeItemRow(it)));
          if ((invObj.items || []).length === 0) invoiceItemsContainer.appendChild(makeItemRow());
        }
      } else if (action === 'wa') {
        sendReminderFor(all[idx], 'wa');
      } else if (action === 'sms') {
        sendReminderFor(all[idx], 'sms');
      } else if (action === 'call') {
        const phone = cleanPhone(all[idx].phone || '');
        if (!phone) return toast('No phone provided', 'error');
        window.open(`tel:+${phone}`, '_self');
      } else if (action === 'print') {
        // print invoice (open printable new window and call print)
        printInvoice(all[idx]);
      } else if (action === 'share') {
        const card = btn.closest('.sm-card') || btn.closest('tr') || btn.parentElement;
        if (card) captureElementAsImage(card, `${all[idx].id}_${Date.now()}.png`);
        else toast('Cannot locate card to share.', 'error');
      }
    });
  
    /* =========================
       PRINT / CAPTURE
       ========================= */
   /* -------------------------
   1) printInvoice (localized title/labels read from page)
   ------------------------- */
function printInvoice(inv) {
  const balance = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
  const win = window.open('', 'PRINT', 'height=650,width=900');
  const store = getCurrentUser() || {};

  // get localized labels from DOM (fallback to english)
  const invoiceLabel = (document.querySelector('#createInvoiceSection h2')?.textContent || 'Invoice').trim();
  const storeLabel   = (document.querySelector('[data-i18n="storeLabel"]')?.textContent || 'Store').trim(); // optional element if you have one
  const dateLabel    = (document.querySelector('[data-i18n="invoiceDateLabel"]')?.textContent || 'Date').trim();
  const customerLabel = (document.querySelector('[data-i18n="customerNameLabel"]')?.textContent || 'Customer').trim();
  const phoneLabel   = (document.querySelector('[data-i18n="customerPhoneLabel"]')?.textContent || 'Phone').trim();
  const productHdr   = (document.querySelector('#thName')?.textContent || 'Product').trim();
  const qtyHdr       = (document.querySelector('#thQty')?.textContent || 'Qty').trim();
  const priceHdr     = (document.querySelector('#thPrice')?.textContent || 'Price').trim();
  const totalHdr     = (document.querySelector('#reportsTable thead th:nth-child(4)')?.textContent || 'Total').trim();

  const head = `
    <html><head><title>${escapeHtml(invoiceLabel)} ${escapeHtml(inv.id)}</title>
    <meta charset="utf-8">
    <style>
      body{font-family:sans-serif;padding:20px;color:#111}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{padding:8px;border:1px solid #ddd;text-align:left}
      th{background:#f4f4f4}
      h1{font-size:18px;margin-bottom:6px}
      .meta{color:#444;font-size:13px;margin-bottom:12px}
    </style>
    </head><body>
  `;
  const content = `
    <h1>${escapeHtml(invoiceLabel)} ${escapeHtml(inv.id)}</h1>
    <p class="meta">
      <strong>${escapeHtml(storeLabel)}:</strong> ${escapeHtml(store.name||'Supermarket')}<br/>
      <strong>${escapeHtml(dateLabel)}:</strong> ${fmtDate(inv.date)}<br/>
      <strong>${escapeHtml(customerLabel)}:</strong> ${escapeHtml(inv.customer||'Walk-in')}<br/>
      <strong>${escapeHtml(phoneLabel)}:</strong> ${escapeHtml(inv.phone||'')}
    </p>
    <table>
      <thead><tr>
        <th>${escapeHtml(productHdr)}</th>
        <th>${escapeHtml(qtyHdr)}</th>
        <th>${escapeHtml(priceHdr)}</th>
        <th>${escapeHtml(totalHdr)}</th>
      </tr></thead>
      <tbody>
        ${(inv.items||[]).map(it => `<tr>
          <td>${escapeHtml(it.name||it.product||'Item')}</td>
          <td>${escapeHtml(String(it.qty||1))}</td>
          <td>${fmtMoney(it.price||0)}</td>
          <td>${fmtMoney(it.total||((it.price||0)*(it.qty||1)))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="meta">
      <strong>${escapeHtml(document.querySelector('[data-i18n="totalAmountLabel"]')?.textContent || 'Amount')}:</strong> ${fmtMoney(inv.amount)}<br/>
      <strong>${escapeHtml(document.querySelector('[data-i18n="amountPaidLabel"]')?.textContent || 'Paid')}:</strong> ${fmtMoney(inv.paid)}<br/>
      <strong>${escapeHtml(document.querySelector('[data-i18n="balanceLabel"]')?.textContent || 'Balance')}:</strong> ${fmtMoney(balance)}<br/>
      <strong>${escapeHtml(document.querySelector('[data-i18n="statusLabel"]')?.textContent || 'Status')}:</strong> ${escapeHtml(inv.status || '')}
    </p>
  `;
  const footer = `</body></html>`;

  win.document.write(head + content + footer);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { toast('Print failed', 'error'); } }, 250);
}

  
    function captureElementAsImage(el, filename = 'capture.png') {
      if (!el) return toast('Nothing to capture', 'error');
      if (typeof html2canvas === 'undefined') {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = () => doCapture();
        s.onerror = () => toast('Failed to load capture library.', 'error');
        document.head.appendChild(s);
      } else doCapture();
      function doCapture() {
        // use html2canvas to get image
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
          const data = canvas.toDataURL('image/png');
          const a = document.createElement('a'); a.href = data; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        }).catch(err => { console.error(err); toast('Capture failed', 'error'); });
      }
    }
  
    /* =========================
       FILTERS / clear paid
       ========================= */
    filterStatus?.addEventListener('change', renderInvoiceTable);
    searchName?.addEventListener('input', renderInvoiceTable);
    clearPaidBtn?.addEventListener('click', () => {
      const user = getCurrentUser(); if (!user) return;
      if (!confirm('Clear all PAID invoices?')) return;
      let all = getAllInvoices();
      all = all.filter(inv => !(String(inv.store || '').toLowerCase() === String(user.name || '').toLowerCase() && inv.status === 'paid'));
      saveAllInvoices(all); renderInvoiceTable(); window.dispatchEvent(new Event('dataUpdated')); toast('Paid invoices removed', 'success');
    });
  

/* =========================
   REMINDERS / MESSAGING (status-aware, single-send immediate)
   ========================= */

/**
 * Build status-aware line for an invoice (Somali)
 * Example lines:
 *  - "Mahadsanid Zakariye, lacagtadii hore ee lagugu lahaay waa 100.00. Haraaga hadda waa 0.00. (Inv: I-1)"
 *  - "Zakariye, waxaa wali kugu dhiman 25.00. Lacagta guud ee lagu leeyahay waa 125.00. (Inv: I-2)"
 *  - "Zakariye, lacagta laguugu leeyahay waa 200.00. (Inv: I-3)"
 */
   
/* =========================
   REMINDERS / MESSAGING (status-aware, bulk flow with persistent modal)
   ========================= */

/* helper: build a status-aware line for a single invoice */
function buildInvoiceStatusLine(inv) {
  const customer = inv.customer || '';
  const amount = Number(inv.amount) || 0;
  const paid = Number(inv.paid) || 0;
  const balance = Math.max(0, amount - paid);
  const id = inv.id || '';

  if (inv.status === 'paid') {
    return ` ${customer}, Waxaad bixisay Lacag dhan: ${fmtMoney(amount)}. Haraaga hadda waa ${fmtMoney(balance)}. Mahadsanid`;
  }
  if (inv.status === 'partial') {
    return `${customer}, waxaa wali kugu dhiman lacag dhan ${fmtMoney(balance)}. Fadlan iska bixi lacagta kugu hartay. Mahadsanid`;
  }
  return `${customer}, lacagta laguugu leeyahay waa ${fmtMoney(amount)}. Fadlan iska bixi`;
}

/* single invoice message (immediate send behavior remains) */
function buildSingleReminderMessage(inv) {
  const storeName = getCurrentUser()?.name || '';
  const storePhone = getCurrentUser()?.phone || '';
  const line = buildInvoiceStatusLine(inv);
  const body = `${line}\n${storeName} (${storePhone}).`;
  return `Xasuusin: ${body}`;
}

/* Short grouped summary message */
function buildGroupedReminderMessage(group) {
  const storeName = getCurrentUser()?.name || '';
  const storePhone = getCurrentUser()?.phone || '';
  const customer = group.customer || '';
  const invoices = Array.isArray(group.invoices) ? group.invoices : [];

  const totalBalance = invoices.reduce((acc, inv) => {
    const a = Number(inv.amount) || 0;
    const p = Number(inv.paid) || 0;
    return acc + Math.max(0, a - p);
  }, 0);

  const ids = invoices.map(i => i.id).join(',') || '';
  // concise Somali summary
  return `Xasuusin: ${customer}, lacagta guud ee laguugu leeyahay waa ${fmtMoney(totalBalance)} (Invoices: ${ids}).\n${storeName} (${storePhone}). Mahadsanid.`;
}

/* ----------------------
   Bulk reminder modal (persistent)
   - Use for Send / Skip / Stop per-group
   - Keeps visible while user visits WA/SMS and returns
   ---------------------- */
/* Modern, responsive bulk reminder modal (buttons stay on one line even on mobile) */
function createBulkReminderModal() {
  let modal = document.getElementById('reminderBulkModal');
  if (modal) return modal;

  const html = `
    <div id="reminderBulkModal" class="hidden fixed inset-0 z-70 flex items-center justify-center p-4">
      <!-- modern translucent backdrop with blur (not plain gray) -->
      <div class="absolute inset-0" style="
        background: linear-gradient(180deg, rgba(2,6,23,0.10), rgba(2,6,23,0.45));
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      "></div>

      <!-- card -->
      <div class="relative w-full max-w-2xl mx-4 bg-white/95 dark:bg-[#071021]/95 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl p-4 sm:p-6">
        <!-- close btn -->
        <button id="reminderBulkClose" aria-label="Close" class="absolute right-3 top-3 text-gray-600 hover:text-gray-900 dark:text-gray-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <h3 id="reminderBulkHeader" class="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100"></h3>

        <div id="reminderBulkBody" class="mb-3 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200"></div>

        <div id="reminderBulkProgress" class="mb-4 text-xs text-gray-500 dark:text-gray-400"></div>

        <!-- ACTIONS: single horizontal line on all sizes; will scroll horizontally on very small screens -->
        <div class="flex flex-row gap-3 items-center justify-end flex-nowrap overflow-x-auto" style="padding-top:6px">
          <button id="reminderBulkSend" class="flex-shrink-0 min-w-[88px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition">
            Send
          </button>

          <button id="reminderBulkStop" class="flex-shrink-0 min-w-[88px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition">
            Stop
          </button>

          <button id="reminderBulkSkip" class="flex-shrink-0 min-w-[88px] px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black transition">
            Skip
          </button>
        </div>
      </div>
    </div>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  modal = document.getElementById('reminderBulkModal');

  // Wire the Close button to hide modal (keeps modal in DOM for reuse)
  const closeBtn = modal.querySelector('#reminderBulkClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Also hide modal when clicking the backdrop area
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) modal.classList.add('hidden');
  });

  return modal;
}

/**
 * Show interactive bulk confirmation for one group.
 * - group: { customer, phone, invoices }
 * - progressStr: like "2/5"
 * - messageText: preview message to send
 * - method: 'wa'|'sms'
 * Returns Promise resolving one of: 'send'|'skip'|'stop'
 *
 * Note: the Send button will open the WA/SMS link synchronously (user gesture),
 * preventing popup blocking. The modal remains visible until user acts.
 */
function showBulkConfirm(group, progressStr, messageText, method = 'wa') {
  return new Promise((resolve) => {
    const modal = createBulkReminderModal();
    const header = modal.querySelector('#reminderBulkHeader');
    const body = modal.querySelector('#reminderBulkBody');
    const progressEl = modal.querySelector('#reminderBulkProgress');
    const btnSend = modal.querySelector('#reminderBulkSend');
    const btnSkip = modal.querySelector('#reminderBulkSkip');
    const btnStop = modal.querySelector('#reminderBulkStop');

    // fill content
    header.textContent = `${progressStr} Xasuusin — ${group.customer || ''}`;
    body.textContent = messageText;
    progressEl.textContent = `Invoices: ${ (group.invoices || []).length } • Total: ${fmtMoney(group.totalBalance || 0) }`;

    // ensure visible
    modal.classList.remove('hidden');

    // clean previous handlers (safe)
    btnSend.replaceWith(btnSend.cloneNode(true));
    btnSkip.replaceWith(btnSkip.cloneNode(true));
    btnStop.replaceWith(btnStop.cloneNode(true));

    // re-select buttons
    const sendBtn = modal.querySelector('#reminderBulkSend');
    const skipBtn = modal.querySelector('#reminderBulkSkip');
    const stopBtn = modal.querySelector('#reminderBulkStop');

    // Compute phone and message (done here so send handler is simple)
    const phoneRaw = group.phone || (group.invoices && group.invoices[0] && group.invoices[0].phone) || '';
    const phone = cleanPhone(phoneRaw || '');
    const msg = encodeURIComponent(messageText);

    function cleanupAndResolve(result) {
      modal.classList.add('hidden');
      // keep modal in DOM for reuse but remove active listeners by replacing nodes (done above)
      resolve(result);
    }

    // Send handler: must call window.open synchronously
    sendBtn.addEventListener('click', function onSend(e) {
      // open the appropriate link and keep modal visible briefly (we will resolve)
      if (!phone) {
        toast('No phone available for this group', 'error');
        cleanupAndResolve('skip');
        return;
      }
      try {
        if (method === 'wa') {
          // WhatsApp uses wa.me with no '+' and prefilled text
          const url = `https://wa.me/${phone.replace(/^\+/, '')}?text=${msg}`;
          window.open(url, '_blank');
        } else {
          // SMS (open in new tab/window or use sms: scheme)
          const url = `sms:+${phone}?&body=${msg}`;
          window.open(url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open messaging URL', err);
        toast('Failed to open messaging app', 'error');
        cleanupAndResolve('skip');
        return;
      }
      // The action was user-initiated, count as send
      cleanupAndResolve('send');
    });

    skipBtn.addEventListener('click', function onSkip() {
      cleanupAndResolve('skip');
    });

    stopBtn.addEventListener('click', function onStop() {
      cleanupAndResolve('stop');
    });

    // also support keyboard Enter/Escape
    function onKey(e) {
      if (e.key === 'Escape') { cleanupAndResolve('stop'); }
      if (e.key === 'Enter') { /* treat Enter as send */ sendBtn.click(); }
    }
    document.addEventListener('keydown', onKey, { once: true });

    // focus the Send button for quick keyboard action
    sendBtn.focus();
  });
}

/* Final summary modal using bulk modal area (OK-only) */
function showFinalSummaryModal(total, sent, skipped) {
  return new Promise((resolve) => {
    const modal = createBulkReminderModal();
    const header = modal.querySelector('#reminderBulkHeader');
    const body = modal.querySelector('#reminderBulkBody');
    const progressEl = modal.querySelector('#reminderBulkProgress');
    const btnSend = modal.querySelector('#reminderBulkSend');
    const btnSkip = modal.querySelector('#reminderBulkSkip');
    const btnStop = modal.querySelector('#reminderBulkStop');

    // configure appearance for summary
    header.textContent = `Reminders Completed`;
    body.textContent = `Dhamaan ${total} macaamiil ayaa la tijaabiyey.\n\nDiray: ${sent}\nSkipped: ${skipped}`;
    progressEl.textContent = '';

    // Show only one OK button: reuse "Send" as OK visually
    btnSend.textContent = 'OK';
    btnSend.classList.remove('bg-emerald-600');
    btnSend.classList.add('bg-slate-700');
    btnSkip.style.display = 'none';
    btnStop.style.display = 'none';

    // show modal
    modal.classList.remove('hidden');

    function cleanup() {
      // restore skip/stop visibility for later use
      btnSkip.style.display = '';
      btnStop.style.display = '';
      btnSend.textContent = 'Send';
      btnSend.classList.remove('bg-slate-700');
      btnSend.classList.add('bg-emerald-600');
    }

    // ensure single click handler
    btnSend.replaceWith(btnSend.cloneNode(true));
    const okBtn = modal.querySelector('#reminderBulkSend');
    okBtn.addEventListener('click', () => {
      cleanup();
      modal.classList.add('hidden');
      resolve(true);
    });

    okBtn.focus();
  });
}

/* ---------- BULK FLOW using the interactive modal (no native confirm) ---------- */
/**
 * This flow shows a persistent modal for each group.
 * Buttons:
 *  - Send -> opens WA/SMS (synchronous) and marks sent
 *  - Skip -> skips current customer
 *  - Stop -> aborts the whole bulk flow
 *
 * At the end it shows a final summary modal with counts.
 */
async function sendAllRemindersFlow(method) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) return toast('Login required', 'error');

  const invoices = filteredInvoicesForUI().filter(inv => {
    const bal = (Number(inv.amount) || 0) - (Number(inv.paid) || 0);
    return bal > 0;
  });
  if (!invoices.length) return toast('No customers need reminders based on current filter/search.', 'info');

  // group by cleaned phone + customer
  const groupsMap = new Map();
  invoices.forEach(inv => {
    const rawPhone = inv.phone || '';
    const phoneKey = cleanPhone(rawPhone) || rawPhone || '';
    const customer = (inv.customer || '').trim();
    const key = `${phoneKey}||${customer}`;
    if (!groupsMap.has(key)) groupsMap.set(key, { customer, phone: phoneKey, totalBalance: 0, invoices: [] });
    const g = groupsMap.get(key);
    const bal = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
    g.totalBalance += bal;
    g.invoices.push(inv);
  });

  const groups = Array.from(groupsMap.values());
  if (!groups.length) return toast('No groups to remind', 'info');

  let sentCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const progressStr = `${i + 1}/${groups.length}`;
    const preview = buildGroupedReminderMessage(g);

    // pick effective phone
    const effectivePhone = cleanPhone(g.phone || '') || (g.invoices[0] && cleanPhone(g.invoices[0].phone || '')) || '';
    if (!effectivePhone) {
      console.warn('Skipping group (no phone):', g);
      toast(`Skipping ${g.customer || 'unknown'} - no phone number`, 'warn');
      skippedCount++;
      continue;
    }

    // show interactive modal and wait for user action
    const action = await showBulkConfirm(g, progressStr, preview, method);

    if (action === 'send') {
      sentCount++;
      // small polite delay so WA/SMS opens and modal is still usable on return
      await new Promise(r => setTimeout(r, 300));
      continue;
    }
    if (action === 'skip') {
      skippedCount++;
      toast(`Skipped ${g.customer || ''}`, 'info');
      continue;
    }
    if (action === 'stop') {
      // user aborted
      toast('Bulk reminders cancelled', 'info');
      break;
    }
  }

  // show final summary and wait for OK
  await showFinalSummaryModal(groups.length, sentCount, skippedCount);
}

/* ------------------- Wire "Send All Reminders" button ------------------- */
(function wireSendAllReminders() {
  const BUTTON_ID = 'sendAllReminders';
  const METHOD_IDS = ['reminderMethod', 'reminderMethodSelect', 'reminder-method', 'reminderMethodBtn'];

  function getMethodElement() {
    for (const id of METHOD_IDS) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    const sel = document.querySelector('select[name="reminderMethod"]');
    if (sel) return sel;
    return null;
  }
  function getSelectedMethod() {
    const el = getMethodElement();
    if (!el) return 'wa';
    return (el.value || 'wa').toLowerCase();
  }

  function attach() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      console.warn(`[reminders] Button #${BUTTON_ID} not found — bulk reminders unavailable.`);
      return;
    }
    if (btn.dataset.remindersWired === '1') return;
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const method = getSelectedMethod();
      try {
        await sendAllRemindersFlow(method);
      } catch (err) {
        console.error('[reminders] sendAllRemindersFlow error', err);
        toast('Failed to send all reminders', 'error');
      }
    });
    btn.dataset.remindersWired = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

  window.testSendAllReminders = window.testSendAllReminders || function (method = 'wa') {
    console.log('[reminders] manual test start (method=%s)', method);
    return sendAllRemindersFlow(method).then(() => console.log('[reminders] manual test complete')).catch(e => console.error('[reminders] manual test failed', e));
  };
})();

/* ------------------- Single/group send helpers (unchanged) ------------------- */

/* immediate single send (no confirmation modal) */
function sendReminderForSingle(invObj, method) {
  if (!invObj) return;
  const phone = cleanPhone(invObj.phone || '');
  if (!phone) {
    toast('No phone number for this invoice.', 'error');
    console.warn('sendReminderForSingle: missing phone', invObj);
    return;
  }
  const msg = buildSingleReminderMessage(invObj);
  if (method === 'wa') {
    window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
  } else {
    window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
  }
}

/* grouped send (called standalone, e.g., from row action) */
function sendReminderForGrouped(group, method) {
  if (!group) {
    console.warn('sendReminderForGrouped: invalid group', group);
    return;
  }
  let phone = cleanPhone(group.phone || '');
  if (!phone && Array.isArray(group.invoices) && group.invoices.length) {
    phone = cleanPhone(group.invoices[0].phone || '');
  }
  if (!phone) {
    toast('No phone available for this group.', 'error');
    return;
  }
  const msg = buildGroupedReminderMessage(group);
  if (method === 'wa') {
    window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
  } else {
    window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
  }
}

/* Dispatcher: call single or grouped send (keeps other code paths unchanged) */
function sendReminderFor(target, method) {
  if (!target) return toast('Invalid reminder target', 'error');
  if (target.id) {
    sendReminderForSingle(target, method);
    return;
  }
  if (Array.isArray(target.invoices)) {
    const preview = buildGroupedReminderMessage(target);
    // show async modal (existing function kept elsewhere) or directly call grouped send
    showReminderConfirmCompatModal(target, `1/1`, preview).then(ok => {
      if (ok) sendReminderForGrouped(target, method);
    }).catch(err => {
      console.error('showReminderConfirm failed', err);
      toast('Could not show confirmation', 'error');
    });
    return;
  }
  if (Array.isArray(target)) {
    const group = { customer: '', phone: '', invoices: target, totalBalance: target.reduce((s,i)=> s + Math.max(0,(Number(i.amount)||0)-(Number(i.paid)||0)),0) };
    const preview = buildGroupedReminderMessage(group);
    showReminderConfirmCompatModal(group, `1/1`, preview).then(ok => {
      if (ok) sendReminderForGrouped(group, method);
    });
    return;
  }
  toast('Invalid reminder target', 'error');
}

/* =========================
     REPORTS: filters, rendering, export, delete
     ========================= */

  // helper to filter by period
  function getReportsFiltered(period = 'lifetime', dateStr = '', search = '') {
    const all = getAllReports() || [];
    let filtered = all.slice();
    const now = new Date();
    if (period === 'daily') {
      filtered = filtered.filter(r => {
        const d = new Date(r.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      });
    } else if (period === 'weekly') {
      const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
      filtered = filtered.filter(r => new Date(r.date) >= weekAgo);
    } else if (period === 'monthly') {
      filtered = filtered.filter(r => { const d = new Date(r.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    } else if (period === 'yearly') {
      filtered = filtered.filter(r => { const d = new Date(r.date); return d.getFullYear() === now.getFullYear(); });
    }
    // dateStr override (specific date)
    if (dateStr) {
      try {
        const target = new Date(dateStr);
        filtered = filtered.filter(r => {
          const d = new Date(r.date);
          return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
        });
      } catch (e) {}
    }
    // search across products, customer, phone
    const sq = (search || '').toString().toLowerCase().trim();
    if (sq) {
      filtered = filtered.filter(r => {
        const prodStr = (r.items || []).map(it => (it.name || '')).join(' ').toLowerCase();
        return (r.customer || '').toLowerCase().includes(sq) || (r.phone || '').toLowerCase().includes(sq) || prodStr.includes(sq) || (r.id||'').toLowerCase().includes(sq);
      });
    }
    // only reports for current store
    const user = getCurrentUser();
    if (user) filtered = filtered.filter(r => String(r.store || '').toLowerCase() === String(user.name || '').toLowerCase());
    // newest first
    filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
    return filtered;
  }

  // render reports into table (desktop) or cards (mobile)
  function renderReports() {
    if (!reportsRows) return;
    const period = (reportsPeriod?.value) || 'lifetime';
    const dateStr = (reportsDate?.value) || '';
    const search = (reportsSearchInput?.value || '').toLowerCase();
    const list = getReportsFiltered(period, dateStr, search);

    reportsRows.innerHTML = '';

    // summary counts
    reportsTotalItems && (reportsTotalItems.textContent = list.reduce((s, r) => s + (Array.isArray(r.items) ? r.items.length : 0), 0));
    reportsTotalSales && (reportsTotalSales.textContent = fmtMoney(list.reduce((s, r) => s + (Number(r.amount) || 0), 0)));

    // empty message
    if (!list.length) {
      document.getElementById('reportsEmptyMsg')?.classList.remove('hidden');
    } else {
      document.getElementById('reportsEmptyMsg')?.classList.add('hidden');
    }

    const mobile = window.matchMedia('(max-width:640px)').matches;

    // toggle table header if present
    const thead = document.querySelector('#reportsTable thead');
    if (thead) {
      if (mobile) thead.classList.add('hidden');
      else thead.classList.remove('hidden');
    }

    if (mobile) {
      // hide thead
      const wrapper = document.querySelector('#reportsReportContent .overflow-x-auto');
      if (wrapper) wrapper.style.overflowX = 'hidden';
    
      list.forEach((rpt, i) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b';
    
        const products = (rpt.items || []).map(it => escapeHtml(it.name || '')).join(', ');
        const qty = (rpt.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
    
        tr.innerHTML = `
          <td colspan="11" class="p-2">
            <div class="p-3 bg-white rounded-xl shadow space-y-2">
              <!-- Header -->
              <div class="flex justify-between items-center">
                <div class="font-semibold">#${i + 1} • ${products}</div>
                <div class="text-xs text-gray-500">${fmtDateTime(rpt.date)}</div>
              </div>
    
              <!-- Details grid -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span class="font-medium">Qty:</span> ${qty}</div>
                <div><span class="font-medium">Total:</span> ${fmtMoney(rpt.amount)}</div>
                <div><span class="font-medium">Paid:</span> ${fmtMoney(rpt.paid)}</div>
                <div><span class="font-medium">Due:</span> ${fmtMoney(rpt.due || 0)}</div>
                <div><span class="font-medium">Status:</span> 
                  <span class="${rpt.status === 'paid' ? 'text-emerald-600' : 'text-rose-600'}">
                    ${escapeHtml(rpt.status)}
                  </span>
                </div>
                <div><span class="font-medium">Customer:</span> ${escapeHtml(rpt.customer || '')}</div>
                <div><span class="font-medium">Phone:</span> ${escapeHtml(rpt.phone || '')}</div>
              </div>
    
              <!-- Actions -->
              <div class="mt-2 flex gap-2">
                <button class="action-icon" data-action="print-report" data-id="${rpt.id}" title="Print">
                  <i class="fa-solid fa-print"></i>
                </button>
                <button class="action-icon text-red-600" data-action="delete-report" data-id="${rpt.id}" title="Delete">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </td>
        `;
    
        reportsRows.appendChild(tr);
      });
    }
    else {
      // Desktop: show rows with columns
      list.forEach((rpt, idx) => {
        const tr = document.createElement('tr');
        const products = (rpt.items || []).map(it => escapeHtml(it.name || '')).join(', ');
        tr.innerHTML = `
          <td class="p-2">${idx + 1}</td>
          <td class="p-2">${products}</td>
          <td class="p-2">${(rpt.items || []).reduce((s,it)=>s + (Number(it.qty)||0),0)}</td>
          <td class="p-2">${fmtMoney(rpt.amount)}</td>
          <td class="p-2">${fmtMoney(rpt.paid)}</td>
          <td class="p-2">${fmtMoney(rpt.due||0)}</td>
          <td class="p-2">${escapeHtml(rpt.status)}</td>
          <td class="p-2">${escapeHtml(rpt.customer||'')}</td>
          <td class="p-2">${escapeHtml(rpt.phone||'')}</td>
          <td class="p-2">${fmtDateTime(rpt.date)}</td>
          <td class="p-2 no-print">
            <div class="flex gap-2">
              <button class="action-icon" data-action="print-report" data-id="${rpt.id}" title="Print"><i class="fa-solid fa-print"></i></button>
              <button class="action-icon text-red-600" data-action="delete-report" data-id="${rpt.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        reportsRows.appendChild(tr);
      });

      // ensure wrapper horizontal scroll visible on desktop
      const wrapper = document.querySelector('#reportsReportContent .overflow-x-auto');
      if (wrapper) wrapper.style.overflowX = '';
    }
  }

/* ---------- Helper: status label (localized) ---------- */
function getStatusLabel(status) {
  if (!status) return '';
  // prefer whatever text the #status select shows (so switching language updates labels)
  const statusSel = document.getElementById('status');
  if (statusSel) {
    const opt = Array.from(statusSel.options).find(o => String(o.value) === String(status));
    if (opt && opt.textContent) return opt.textContent.trim();
  }
  // fallback mapping for en/so
  const lang = localStorage.getItem('preferredLang') || 'en';
  const FALLBACK = {
    en: { unpaid: 'Unpaid', paid: 'Paid', partial: 'Partial' },
    so: { unpaid: 'La Bixnin', paid: 'Bixixyay', partial: 'Qeyb la bixixyay' }
  };
  return (FALLBACK[lang] && FALLBACK[lang][status]) || String(status);
}



  // hook search input so it updates results live
  reportsSearchInput?.addEventListener('input', renderReports);
  reportsPeriod?.addEventListener('change', renderReports);
  reportsDate?.addEventListener('change', renderReports);



  
  // reports action delegation (print/delete)
  reportsRows?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const reports = getAllReports() || [];
    const idx = reports.findIndex(r => r.id === id);
    if (idx < 0) return;
  
    if (action === 'delete-report') {
      if (!confirm('Move this report to recycle bin?')) return;
      const rpt = reports[idx];
  
      // use helper (like invoices) to move to trash
      moveToTrash(getCurrentUser().name, 'report', rpt);
  
      // remove from active reports list
      reports.splice(idx, 1);
      saveAllReports(reports);
  
      renderReports();
      toast('Report moved to recycle bin', 'success');
    } 

   
/* -------------------------
   3) print-report branch (single report print) - localized labels
   ------------------------- */
   else if (action === 'print-report') {
    const rpt = reports[idx];
    const win = window.open('', 'PRINT', 'height=650,width=900');
  
    // get localized header labels from DOM (thead if present)
    const headerNodes = document.querySelectorAll('#reportsTable thead th');
    const productsHdr = headerNodes && headerNodes[1] ? headerNodes[1].textContent.trim() : 'Products';
    const qtyHdr      = headerNodes && headerNodes[2] ? headerNodes[2].textContent.trim() : 'Qty';
    const totalHdr    = headerNodes && headerNodes[3] ? headerNodes[3].textContent.trim() : 'Total';
    // Paid column label (if exists)
    const paidHdr     = headerNodes && headerNodes[4] ? headerNodes[4].textContent.trim() : 'Paid';
    const statusHdr   = (document.querySelector('[data-i18n="statusLabel"]')?.textContent) || 'Status';
    const reportLabel = (document.querySelector('#reportsSection h1')?.textContent || 'Report').trim();
  
    // compute product totals sum, paid, balance
    const items = Array.isArray(rpt.items) ? rpt.items : [];
    const sumProducts = items.reduce((s, it) => {
      const price = Number(it.price || 0);
      const qty = Number(it.qty || 1);
      const total = (it.total != null) ? Number(it.total) : (price * qty);
      return s + (isFinite(total) ? total : 0);
    }, 0);
    const paid = Number(rpt.paid || 0);
    const balance = Math.max(0, sumProducts - paid);
  
    // localized status label
    const statusLabel = getStatusLabel(rpt.status);
  
    const head = `
      <html><head><meta charset="utf-8"><title>${escapeHtml(reportLabel)} ${escapeHtml(rpt.id)}</title>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;padding:20px;color:#111}
        h1{font-size:18px;margin-bottom:6px}
        p.meta{margin:0 0 12px 0;color:#444;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
        th{background:#f4f4f4;font-weight:600}
        tfoot td { font-weight:700; text-align:right; }
        .status-paid { color: #059669; }      /* emerald-600 */
        .status-partial { color: #b45309; }   /* yellow-ish */
        .status-unpaid { color: #dc2626; }    /* rose-600 */
      </style></head><body>
    `;
  
    const rowsHtml = items.map(it => {
      const name = escapeHtml(it.name || it.product || '');
      const qty = escapeHtml(String(it.qty || 1));
      const rowTotal = Number(it.total != null ? it.total : ((Number(it.price||0) * Number(it.qty||1)) || 0));
      return `<tr>
        <td>${name}</td>
        <td style="text-align:right">${qty}</td>
        <td style="text-align:right">${fmtMoney(rowTotal)}</td>
        <td style="text-align:right">${fmtMoney(rpt.paid != null ? rpt.paid : 0)}</td>
      </tr>`;
    }).join('');
  
    // status css class
    let statusClass = 'status-unpaid';
    if (rpt.status === 'paid') statusClass = 'status-paid';
    else if (rpt.status === 'partial') statusClass = 'status-partial';
  
    const content = `
      <h1>${escapeHtml(reportLabel)} ${escapeHtml(rpt.id)}</h1>
      <p class="meta">${escapeHtml(fmtDateTime(rpt.date))} • ${escapeHtml(rpt.customer||'')}</p>
  
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(productsHdr)}</th>
            <th style="text-align:right">${escapeHtml(qtyHdr)}</th>
            <th style="text-align:right">${escapeHtml(totalHdr)}</th>
            <th style="text-align:right">${escapeHtml(paidHdr)}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">Total Amount:</td>
            <td style="text-align:right">${fmtMoney(sumProducts)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">Paid:</td>
            <td style="text-align:right">${fmtMoney(paid)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">Balance:</td>
            <td style="text-align:right">${fmtMoney(balance)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">${escapeHtml(statusHdr)}:</td>
            <td style="text-align:right"><span class="${statusClass}">${escapeHtml(statusLabel)}</span></td>
          </tr>
        </tfoot>
      </table>
    `;
  
    win.document.write(head + content + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(()=>{ try { win.print(); } catch(e) { toast('Print failed','error'); } }, 250);
  }
  });

  // reports export all / delete all controls
/* -------------------------
   2) reportsExportPdf (use visible labels + option text)
   ------------------------- */
   reportsExportPdf?.addEventListener('click', async () => {
    const list = getReportsFiltered(
      reportsPeriod?.value || 'lifetime',
      reportsDate?.value || '',
      reportsSearchInput?.value || ''
    );
    if (!list.length) {
      toast((document.getElementById('reportsEmptyMsg')?.textContent || 'No reports to export'), 'error');
      return;
    }
  
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
  
      const reportsTitleLabel = (document.querySelector('#reportsSection h1')?.textContent || 'Reports').trim();
      const periodLabelText = (reportsPeriod?.options && reportsPeriod.options[reportsPeriod.selectedIndex]) ? reportsPeriod.options[reportsPeriod.selectedIndex].text : (reportsPeriod?.value || 'lifetime');
  
      doc.setFontSize(14);
      doc.text(`${reportsTitleLabel} (${periodLabelText}) - ${fmtDate(new Date())}`, 10, 10);
  
      const headerNodes = document.querySelectorAll('#reportsTable thead th');
      const colLabels = headerNodes && headerNodes.length ? Array.from(headerNodes).map(th => th.textContent.trim()) : ['#','Products','Qty','Total','Paid','Due','Status','Customer','Phone','Timestamp'];
  
      const columns = [
        { key: 'no',        label: colLabels[0] || '#',        width: 7,   align: 'right' },
        { key: 'products',  label: colLabels[1] || 'Products', width: 40,  align: 'left'  },
        { key: 'qty',       label: colLabels[2] || 'Qty',      width: 12,  align: 'right' },
        { key: 'total',     label: colLabels[3] || 'Total',    width: 20,  align: 'right' },
        { key: 'paid',      label: colLabels[4] || 'Paid',     width: 20,  align: 'right' },
        { key: 'due',       label: colLabels[5] || 'Due',      width: 20,  align: 'right' },
        { key: 'status',    label: colLabels[6] || 'Status',   width: 20,  align: 'left'  },
        { key: 'customer',  label: colLabels[7] || 'Customer', width: 30,  align: 'left'  },
        { key: 'phone',     label: colLabels[8] || 'Phone',    width: 22,  align: 'left'  },
        { key: 'time',      label: colLabels[9] || 'Timestamp',width: 36,  align: 'left'  },
      ];
  
      const marginLeft = 10;
      const marginTop  = 16;
      const lineH = 6;
      let x = marginLeft;
      columns.forEach(col => { col.x = x; x += col.width; });
  
      function drawHeaders(y) {
        doc.setFontSize(11);
        columns.forEach(col => drawText(col.label, col, y));
      }
      function drawText(text, col, y) {
        const maxW = col.width - 1;
        const lines = doc.splitTextToSize(String(text ?? ''), maxW);
        const textWidth = doc.getTextWidth(lines[0] || '');
        let tx = col.x + 1;
        if (col.align === 'right') tx = col.x + col.width - 1 - textWidth;
        doc.text(lines, tx, y);
        return lines.length;
      }
      function drawRow(rowValues, y) {
        let maxLines = 1;
        doc.setFontSize(10);
        columns.forEach(col => {
          const lines = doc.splitTextToSize(String(rowValues[col.key] ?? ''), col.width - 1);
          maxLines = Math.max(maxLines, lines.length);
        });
        columns.forEach(col => drawText(rowValues[col.key], col, y));
        return maxLines * lineH;
      }
  
      let y = marginTop + 4;
      drawHeaders(y);
      y += lineH;
  
      list.forEach((r, i) => {
        // <<=== KEY CHANGE: do NOT truncate the products array; show the full list
        const allProductNames = (Array.isArray(r.items) ? r.items.map(it => it?.name).filter(Boolean) : []);
        const productsFull = allProductNames.join(', ');
  
        const row = {
          no: i + 1,
          products: productsFull,                                  // <-- full list, no .slice()
          qty: (Array.isArray(r.items) ? r.items.reduce((a,it)=>a + (Number(it.qty)||0),0) : (Number(r.qty)||0)),
          total: fmtMoney(Number(r.total != null ? r.total : r.amount || 0)),
          paid: fmtMoney(Number(r.paid || 0)),
          due: fmtMoney(Math.max(0, (Number(r.total != null ? r.total : r.amount || 0)) - Number(r.paid || 0))),
          status: r.status || '',
          customer: r.customer || '',
          phone: r.phone || '',
          time: fmtDateTime(r.date)
        };
  
        // page break estimate
        let maxLines = 1;
        doc.setFontSize(10);
        columns.forEach(col => {
          const lines = doc.splitTextToSize(String(row[col.key] ?? ''), col.width - 1);
          maxLines = Math.max(maxLines, lines.length);
        });
        const rowH = Math.max(lineH, maxLines * lineH);
        if (y + rowH > 285) {
          doc.addPage();
          y = marginTop + 4;
          drawHeaders(y);
          y += lineH;
        }
        y += drawRow(row, y);
      });
  
      doc.save(`reports_${Date.now()}.pdf`);
      toast((document.getElementById('reportsExportPdf')?.textContent || 'PDF exported') , 'success');
    } else {
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `reports_${Date.now()}.json`;
      a.click();
      toast('Reports exported as JSON', 'success');
    }
  });
  

  reportsDeleteAll?.addEventListener('click', () => {
    if (!confirm('Delete all reports for this store?')) return;
    const user = getCurrentUser(); if (!user) return;
    let reports = getAllReports() || [];
    reports = reports.filter(r => String(r.store || '').toLowerCase() !== String(user.name || '').toLowerCase());
    saveAllReports(reports);
    renderReports();
    toast('Reports deleted for this store', 'success');
  });

  /* =========================
     INITS
     ========================= */

// -------------------------
// initAfterLoad: called on DOMContentLoaded
// -------------------------
function initAfterLoad() {
  // show/hide nav on auth screens depending on current user
  const user = getCurrentUser();
  if (!user) {
    authSection && authSection.classList.remove('hidden');
    dashboardSection && dashboardSection.classList.add('hidden');
    showLoginForm();
    // ensure nav/settings hidden while on auth
    setAuthVisibility(true);
  } else {
    // user present -> load dashboard
    loadDashboard();
  }

  // prepare initial product rendering
  try { renderProductList(searchInput?.value || ''); } catch(e) {}
  // prepare reports listing
  try { renderReports(); } catch(e) {}

  // Ensure createInvoiceSection is hidden by default (HTML may already have class hidden)
  if (createInvoiceSection && !createInvoiceSection.classList.contains('hidden')) {
    createInvoiceSection.classList.add('hidden');
  }

  // ensure settings cog next to store (if button exists but class missing)
  ensureSettingsBtnClass();
}
document.addEventListener('DOMContentLoaded', initAfterLoad);




  /* =========================
   Settings + Drive Backup Module (mobile friendly + Help + Daily reminders)
   Replace your previous setupSettingsModuleWithDrive() with this block.
   Client ID (user-provided): 246612771655-cehl69jg1g3hj5u0mjouuum3pvu0cc1t.apps.googleusercontent.com
   ========================= */
   (function setupSettingsModuleWithDrive_v2(){

    const DRIVE_CLIENT_ID = '246612771655-cehl69jg1g3hj5u0mjouuum3pvu0cc1t.apps.googleusercontent.com';
    const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
    const LS_MSG_TPL = 'msg_templates_v1';
    const LS_NOTICES = 'notices_v1';
    const LS_SETTINGS = 'app_settings_v1';
    const BACKUP_NAME_PREFIX = 'supermarket_backup_';
  
    // helpers
    function lsGet(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return localStorage.getItem(k); } }
    function lsSet(k,v){ try { if (v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.error(e); } }
    function now(){ return Date.now(); }
    function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    // ensure Notices API exists (fallback)
    if (!window.Notices) {
      window.Notices = {
        add: ({title, body}) => {
          const all = lsGet(LS_NOTICES) || [];
          const payload = { id: `N-${Date.now()}`, title: title||'Notice', body: body||'', created: Date.now() };
          all.unshift(payload);
          lsSet(LS_NOTICES, all);
          return payload;
        },
        list: () => lsGet(LS_NOTICES) || []
      };
    }
  
    // toast fallback (non-blocking)
    if (typeof window.toast !== 'function') {
      window.toast = function(msg='', type='info') {
        try {
          const id = 'app-toast';
          const ex = document.getElementById(id);
          if (ex) ex.remove();
          const el = document.createElement('div');
          el.id = id;
          el.textContent = msg;
          el.style.position = 'fixed';
          el.style.right = '16px';
          el.style.bottom = '16px';
          el.style.zIndex = 1100;
          el.style.padding = '10px 14px';
          el.style.borderRadius = '10px';
          el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
          el.style.background = type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#eef2ff');
          el.style.color = '#0f172a';
          document.body.appendChild(el);
          setTimeout(()=> el.style.opacity = '0', 2200);
          setTimeout(()=> el.remove(), 2600);
        } catch(e){ console.log(msg); }
      };
    }
  
    // spinner overlay (mobile-friendly)
    function ensureSpinner(){
      let sp = document.getElementById('driveSpinnerOverlay');
      if (sp) return sp;
      sp = document.createElement('div');
      sp.id = 'driveSpinnerOverlay';
      sp.className = 'hidden fixed inset-0 z-100 flex items-center justify-center';
      sp.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.5)"></div>
        <div role="status" style="z-index:9999; background:var(--bg,#fff); padding:14px 16px; border-radius:12px; display:flex; gap:12px; align-items:center; max-width:92%; width:320px;">
          <svg width="36" height="36" viewBox="0 0 50 50" style="transform-origin:center" aria-hidden>
            <circle cx="25" cy="25" r="20" stroke="#0ea5e9" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="31.4 31.4">
              <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
          <div style="min-width:140px">
            <div id="driveSpinnerMsg" style="font-weight:600">Working...</div>
            <div id="driveSpinnerSub" style="font-size:12px;color:#6b7280;margin-top:6px">Please wait</div>
          </div>
        </div>
      `;
      document.body.appendChild(sp);
      return sp;
    }
    function showSpinner(msg='Working...', sub=''){ const sp = ensureSpinner(); sp.classList.remove('hidden'); document.getElementById('driveSpinnerMsg').textContent = msg; document.getElementById('driveSpinnerSub').textContent = sub; }
    function hideSpinner(){ const sp = document.getElementById('driveSpinnerOverlay'); if (sp) sp.classList.add('hidden'); }
  
    // seed defaults (safe)
    (function seed(){
      try {
        if (!lsGet(LS_NOTICES)) lsSet(LS_NOTICES, [{ id:`N-${Date.now()}`, title:'Welcome', body:'Welcome — your data is stored locally. Use Drive backup to save to Google Drive.', created: Date.now() }]);
      } catch(e){}
      try {
        if (!lsGet(LS_MSG_TPL)) lsSet(LS_MSG_TPL, { reminder_wa:'Hello {customer}, your invoice {id} has balance {balance}. - {store}', reminder_sms:'Hello {customer}, invoice {id} balance {balance}.' });
      } catch(e){}
      try {
        if (!lsGet(LS_SETTINGS)) lsSet(LS_SETTINGS, { autoRestoreOnLogin:false, autoBackup:{ enabled:false, days:7 }, lastAutoBackup:0, lastDailyReminderByStore:{} });
      } catch(e){}
    })();
  
    // Google libraries init
    let driveTokenClient = null;
    let gapiClientLoaded = false;
    function initGisIfNeeded() {
      if (driveTokenClient) return;
      if (!window.google || !google.accounts || !google.accounts.oauth2) { console.warn('GSI not loaded'); return; }
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPES,
        callback: (tokenResp) => {} // set per-call
      });
    }
    function initGapiIfNeeded(){
      if (gapiClientLoaded) return Promise.resolve();
      return new Promise((resolve,reject)=>{
        if (!window.gapi) return reject(new Error('gapi not loaded'));
        try {
          gapi.load('client', async () => {
            try { await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] }); gapiClientLoaded = true; resolve(); }
            catch(err){ reject(err); }
          });
        } catch(err){ reject(err); }
      });
    }
    function requestDriveToken(cb){
      initGisIfNeeded();
      if (!driveTokenClient) { toast('Google Identity not available', 'error'); return; }
      driveTokenClient.callback = (resp) => {
        if (resp.error) { console.error(resp); toast('Drive auth error', 'error'); return; }
        cb(resp.access_token);
      };
      try { driveTokenClient.requestAccessToken({ prompt: '' }); } catch(e){ console.error(e); toast('Drive token request failed', 'error'); }
    }
  // Updated openSettingsModal with animated help notice, expanded help content, and non-gray palette
// ========================
// Robust openSettingsModal (keeps your original content + translations)
// ========================
function openSettingsModal(){
  let modal = document.getElementById('appSettingsModal');

  // Inject small CSS for help notice animation once
  if (!document.getElementById('appSettingsModal-styles')) {
    const style = document.createElement('style');
    style.id = 'appSettingsModal-styles';
    style.innerHTML = `
      /* Help notice entrance */
      .help-notice-enter { opacity: 0; transform: translateY(-10px) scale(.98); }
      .help-notice-enter.help-notice-enter-active { opacity: 1; transform: translateY(0) scale(1); transition: all 360ms cubic-bezier(.2,.9,.25,1); }
      /* subtle shadow for modern card */
      .help-notice-card { box-shadow: 0 8px 28px rgba(14, 165, 233, 0.08); }
      /* replace some default gray hover classes fallback if developer used them elsewhere */
      .no-gray-bg { background-color: transparent !important; }
    `;
    document.head.appendChild(style);
  }

/* -------------------------
   Ensure settings cog/button exists + helper
   ------------------------- */
   function ensureSettingsBtnClass() {
    try {
      const btn = document.getElementById('storeSettingsBtn');
      if (btn && !btn.classList.contains('storeSettingsBtn')) {
        btn.classList.add('storeSettingsBtn');
      }
    } catch (e) { /* ignore */ }
  }
  
  // Idempotent creator for the store settings button (won't duplicate)
  function createStoreSettingsBtn() {
    try {
      let btn = document.getElementById('storeSettingsBtn');
      if (!btn) {
        const target = document.getElementById('storeDisplayDesktop');
        btn = document.createElement('button');
        btn.id = 'storeSettingsBtn';
        btn.className = 'storeSettingsBtn ml-2 px-2 py-1 rounded bg-emerald-600 text-white';
        btn.title = 'Settings';
        btn.innerHTML = '<i class="fa-solid fa-cog"></i>';
        if (target && target.parentNode) target.parentNode.insertBefore(btn, target.nextSibling);
        else document.body.appendChild(btn);
        // wire click to open settings modal (if function is available)
        btn.addEventListener('click', () => { try { openSettingsModal(); } catch(e){ console.error(e); } });
      } else {
        // ensure it has the expected class and a click handler
        if (!btn.classList.contains('storeSettingsBtn')) btn.classList.add('storeSettingsBtn');
        if (!btn.onclick) btn.addEventListener('click', () => { try { openSettingsModal(); } catch(e){} });
      }
    } catch (e) { console.error('createStoreSettingsBtn failed', e); }
  }
  // expose it for other code to call
  window.AppSettings = window.AppSettings || {};
  window.AppSettings.createStoreSettingsBtn = createStoreSettingsBtn;
  
  /* -------------------------
     Robust setAuthVisibility (hides nav and settings reliably)
     ------------------------- */
  function setAuthVisibility(isAuthScreen) {
    try {
      // nav buttons (your existing class)
      document.querySelectorAll('.navBtn').forEach(el => {
        if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
      });
  
      // explicit settings button selectors (id + class)
      const btnById = document.getElementById('storeSettingsBtn');
      if (btnById) {
        if (isAuthScreen) btnById.classList.add('hidden'); else btnById.classList.remove('hidden');
      }
      document.querySelectorAll('.storeSettingsBtn').forEach(el => {
        if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
      });
    } catch (e) { console.warn('setAuthVisibility error', e); }
  }
  
  // If modal already exists -> refresh UI and show (this is the fix)
  if (modal) {
    // make sure we operate on the current modal reference
    modal = document.getElementById('appSettingsModal');

    // fill templates into textareas (if any)
    const tpl = lsGet(LS_MSG_TPL) || {};
    modal.querySelector('#settingsWaTpl') && (modal.querySelector('#settingsWaTpl').value = tpl.reminder_wa || '');
    modal.querySelector('#settingsSmsTpl') && (modal.querySelector('#settingsSmsTpl').value = tpl.reminder_sms || '');

    // ensure notices and translations are refreshed if functions exist
    try { renderNoticesUI && renderNoticesUI(); } catch(e) {}
    try { 
      const saved = localStorage.getItem('preferredLang') || 'en';
      if (typeof applyLanguage === 'function') applyLanguage(saved, false);
      else if (typeof applyLangToModal === 'function') applyLangToModal(saved);
    } catch(e){}

    // unhide and ensure panels default to helpNotice if none visible
    modal.classList.remove('hidden');
    const activePanel = modal.querySelector('.settings-panel[style*="display: block"]');
    if (!activePanel) {
      modal.querySelectorAll('.settings-panel').forEach(p => p.style.display = p.dataset.panel === 'helpNotice' ? 'block' : 'none');
      modal.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('bg-sky-50','dark:bg-sky-800'));
      const btn = modal.querySelector(`.settings-tab[data-tab="helpNotice"]`);
      if (btn) btn.classList.add('bg-sky-50');
    }

    // replay help card animation so it looks "alive" each open
    const helpCard = modal.querySelector('#helpNoticeCard');
    if (helpCard) {
      helpCard.classList.remove('help-notice-enter','help-notice-enter-active');
      void helpCard.offsetWidth;
      helpCard.classList.add('help-notice-enter');
      setTimeout(()=> { helpCard.classList.add('help-notice-enter-active'); }, 20);
      setTimeout(()=> { helpCard.classList.remove('help-notice-enter','help-notice-enter-active'); }, 420);
    }

    // ensure nav is visible on small screens (small delay to wait for modal DOM paint)
    setTimeout(ensureSettingsNavVisible, 80);
    return;
  }

  // --- Modal not present: create it (your original markup + wiring preserved) ---
  modal = document.createElement('div');
  modal.id = 'appSettingsModal';
  modal.className = 'hidden fixed inset-0 z-90 flex items-start justify-center p-4';
  modal.innerHTML = `
    <div id="appSettingsModalBackdrop" class="absolute inset-0 bg-black/60"></div>

    <div class="relative w-full max-w-3xl bg-white dark:bg-sky-900/6 rounded-lg shadow-lg overflow-auto max-h-[92vh]">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-sky-100 dark:border-sky-800">
        <div class="flex items-center gap-4">
          <h2 id="settingsTitle" class="text-lg font-semibold text-sky-800 dark:text-sky-100">Settings & Utilities</h2>

          <!-- Modern language pill toggle (sky) -->
          <div id="langToggle" class="inline-flex items-center bg-sky-50 dark:bg-sky-900/10 rounded-full p-1">
            <button id="langEnBtn" class="px-3 py-1 rounded-full text-xs font-semibold">EN</button>
            <button id="langSoBtn" class="px-3 py-1 rounded-full text-xs font-semibold">SO</button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button id="settingsHelpOpen" title="Help" class="p-2 rounded bg-sky-50 dark:bg-sky-900/10 text-sky-700"><i class="fa-solid fa-question"></i></button>
          <button id="settingsCloseBtn" class="px-3 py-1 rounded bg-sky-100 dark:bg-sky-800 text-sky-800 dark:text-sky-100">Close</button>
        </div>
      </div>

      <div class="md:flex md:gap-4">
        <!-- Left nav (sidebar on md+) -->
        <nav id="settingsNav" class="md:w-56 p-3 border-r border-sky-100 hidden md:block">
          <ul class="space-y-2 text-sm">
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="helpNotice"><i class="fa-solid fa-lightbulb mr-2 text-amber-500"></i> Help Notice</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="messages"><i class="fa-solid fa-message mr-2 text-sky-500"></i> Messages</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="helpNav"><i class="fa-solid fa-circle-info mr-2 text-emerald-500"></i> Help</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="notices"><i class="fa-solid fa-bell mr-2 text-amber-600"></i> Notices</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="export"><i class="fa-solid fa-download mr-2 text-indigo-600"></i> Export</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="drive"><i class="fa-brands fa-google-drive mr-2 text-emerald-600"></i> Drive Backup</button></li>
          </ul>
        </nav>

        <!-- Content -->
        <div id="settingsContent" class="p-4 md:flex-1">
          <!-- Help Notice panel (modern animated card) -->
          <div class="settings-panel" data-panel="helpNotice" style="display:none">
            <div id="helpNoticeCard" class="help-notice-card flex items-start gap-3 p-4 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800">
              <div class="text-2xl">💡</div>
              <div class="flex-1">
                <div class="flex items-start justify-between">
                  <div>
                    <h4 id="helpNoticeTitle" class="font-semibold text-lg text-sky-800 dark:text-sky-100">Quick Tips</h4>
                    <div id="helpNoticeBody" class="text-sm text-sky-600 dark:text-sky-200 mt-1">Short helpful context appears here.</div>
                  </div>
                  <div class="ml-3">
                    <button id="dismissHelpNotice" class="text-xs px-2 py-1 rounded bg-white/90 dark:bg-sky-800 text-sky-700">Dismiss</button>
                  </div>
                </div>
                <div class="mt-3 flex gap-2">
                  <button id="moreHelpBtn" class="px-3 py-1 bg-sky-600 text-white rounded text-sm"><i class="fa-solid fa-book-open mr-1"></i> Full Guide</button>
                  <button id="showHelpPanelBtn" class="px-3 py-1 bg-sky-100 rounded text-sm text-sky-800">Open Help</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Messages -->
          <div class="settings-panel" data-panel="messages" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">WhatsApp / SMS Templates</h4>
            <div class="text-sm mb-2 text-sky-600 dark:text-sky-200">Placeholders: <code>{customer}</code> <code>{id}</code> <code>{balance}</code> <code>{store}</code></div>
            <div class="space-y-2">
              <textarea id="settingsWaTpl" rows="3" class="w-full border rounded p-2"></textarea>
              <textarea id="settingsSmsTpl" rows="3" class="w-full border rounded p-2"></textarea>
              <div class="flex gap-2 mt-2">
                <button id="settingsSaveMsgBtn" class="px-3 py-2 bg-sky-600 text-white rounded">Save</button>
                <button id="settingsResetMsgBtn" class="px-3 py-2 bg-sky-100 text-sky-800 rounded">Reset</button>
                <div id="settingsMsgStatus" class="text-sm text-sky-600 hidden ml-2">Saved</div>
              </div>
            </div>
          </div>

          <!-- Full Help -->
          <div class="settings-panel" data-panel="helpNav" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">Help & Full Guide</h4>
            <div class="space-y-3 text-sm">
              <div id="helpFullContent" class="prose max-w-none text-sm text-sky-600 dark:text-sky-200">
                <div id="helpIntro"><!-- localized HTML filled later --></div>

                <h5 class="text-sky-700">Invoices</h5>
                <ol class="text-sky-600">
                  <li>Create Invoice → Add customer name & phone → add items (choose product or type) → set qty & price.</li>
                  <li>Set Amount Paid and Status (Paid / Unpaid). Save to add to Reports.</li>
                  <li>To send invoice: use WhatsApp or SMS from invoice row (buttons appear on invoice actions) — ensures phone formatting (+252) when available.</li>
                </ol>

                <h5 class="text-sky-700">Send Messages / Call</h5>
                <ul class="text-sky-600">
                  <li><b>WhatsApp:</b> Click the WhatsApp icon on an invoice — it opens WhatsApp Web/mobile with the templated message. Customize templates in Settings → Messages.</li>
                  <li><b>SMS:</b> Click SMS to copy or open an SMS composer (depends on device/browser).</li>
                  <li><b>Call:</b> Use the phone icon to initiate a call on devices that support tel: links.</li>
                </ul>

                <h5 class="text-sky-700">Products</h5>
                <ul class="text-sky-600">
                  <li>Add Product → set Name, Price, Quantity. Products are available when creating invoices.</li>
                  <li>Edit stock directly from the product list. Use search to quickly find items.</li>
                </ul>

                <h5 class="text-sky-700">Dashboard & Reports</h5>
                <ul class="text-sky-600">
                  <li>Dashboard shows totals (Invoices, Products, Sales, Revenue, Profit, Expenses) — change period (Today / Weekly / Monthly / Yearly / Live).</li>
                  <li>Reports lists all saved invoices and can be exported to PDF/CSV or printed.</li>
                  <li>Use Drive Backup to snapshot your localStorage so you can restore later.</li>
                </ul>
              </div>

              <div class="mt-3 text-xs text-sky-500 dark:text-sky-400">
                Tip: On mobile, use the <b>Help</b> button (top-right) for quick access. Rotate to landscape for wider tables.
              </div>
            </div>
          </div>

          <!-- Notices -->
          <div class="settings-panel" data-panel="notices" style="display:none">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold text-sky-800 dark:text-sky-100">Notices</h4>
              <div class="flex items-center gap-2">
                <button id="translateProgrammaticNotices" class="px-2 py-1 text-xs rounded bg-sky-100 text-sky-800">Translate Notices</button>
                <button id="clearNoticesBtn" class="px-2 py-1 text-xs rounded bg-red-600 text-white">Clear All</button>
              </div>
            </div>
            <div id="settingsNotices" class="space-y-2 max-h-56 overflow-auto p-1"></div>
          </div>

          <!-- Export -->
          <div class="settings-panel" data-panel="export" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">Export</h4>
            <div class="flex gap-2 flex-wrap">
              <button id="exportInvoicesPdf" class="px-3 py-2 bg-sky-600 text-white rounded"><i class="fa-solid fa-file-pdf mr-1"></i> PDF</button>
              <button id="exportInvoicesExcel" class="px-3 py-2 bg-emerald-600 text-white rounded"><i class="fa-solid fa-file-csv mr-1"></i> CSV</button>
            </div>
          </div>

          <!-- Drive -->
          <div class="settings-panel" data-panel="drive" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">Google Drive Backup</h4>
            <div class="text-sm mb-2 text-sky-600 dark:text-sky-200">Requires Google OAuth (GSI) & acceptance as test user. Backups store a JSON snapshot of localStorage.</div>
            <div class="space-y-2">
              <label class="flex items-center gap-2"><input id="optAutoRestoreLogin" type="checkbox"> Auto-check Drive on login (opt-in)</label>
              <label class="flex items-center gap-2">
                <input id="optAutoBackupEnabled" type="checkbox"> Auto backup every
                <input id="optAutoBackupDays" type="number" min="1" value="7" style="width:64px;margin-left:6px"> days
              </label>
              <div class="text-xs text-sky-500 dark:text-sky-400">Auto backups run while the app is open (background timers). Last run stored in settings.</div>
              <div class="flex gap-2 mt-2 flex-wrap">
                <button id="driveBackupBtn" class="px-3 py-2 bg-indigo-600 text-white rounded"><i class="fa-brands fa-google-drive mr-1"></i> Backup to Drive</button>
                <button id="driveRefreshBtn" class="px-3 py-2 bg-amber-500 text-white rounded"><i class="fa-solid fa-refresh mr-1"></i> Refresh List</button>
                <button id="driveRestoreLatestBtn" class="px-3 py-2 bg-red-600 text-white rounded"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Restore Latest</button>
              </div>
              <div id="driveStatus" class="mt-2 text-sm text-sky-600 dark:text-sky-200">Drive: not initialized</div>
              <div id="driveBackupList" class="mt-3 space-y-2 max-h-48 overflow-auto"></div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  // after appending modal
ensureSettingsBtnClass();       // makes sure CSS class exists (helps other logic)
createStoreSettingsBtn();       // ensure the settings cog/button exists & wired
setTimeout(ensureSettingsNavVisible, 60); // you already do this at bottom too


  /* -------------------------
     Translations + language logic
     ------------------------- */
  const LS_LANG_KEY = 'preferredLang';
  const translations = {
    en: {
      settingsTitle: "Settings & Utilities",
      closeBtn: "Close",
      helpBtnTitle: "Help",
      tabs: { helpNotice: "Help Notice", messages: "Messages", helpNav: "Help", notices: "Notices", export: "Export", drive: "Drive Backup" },
      helpNoticeTitle: "Quick Tips",
      helpNoticeBody: "Need a quick refresher? Use 'Create Invoice' to start, 'Add Product' to populate stock, and 'Drive Backup' to protect your data.",
      helpFullIntro: "<strong>Getting started:</strong> Add products, create invoices, send reminders, and export reports. Below are step-by-step help items.",
      tplDefaults: {
        reminder_wa: "Reminder: {customer}, your balance is {balance}. Please pay at {store} ({phone}).",
        reminder_sms: "Reminder: {customer}, your balance is {balance}."
      },
      savedText: "Saved",
      exportPdf: "PDF",
      exportCsv: "CSV",
      driveNotInit: "Drive: not initialized",
      noticesEmpty: "No notices.",
      programmaticNotices: {
        backup_done: { title: "Backup complete", body: "Your backup was saved to Drive." },
        restore_done: { title: "Restore complete", body: "Data restored from Drive successfully." },
        welcome: { title: "Welcome", body: "Welcome to your supermarket dashboard — quick tips available in Settings." }
      },
      translateNoticesBtn: "Translate Notices",
      clearNoticesBtn: "Clear All"
    },
    so: {
      settingsTitle: "Dejimaha & Adeegyada",
      closeBtn: "Xidh",
      helpBtnTitle: "Caawimo",
      tabs: { helpNotice: "Ogeysiis Caawimo", messages: "Fariimaha", helpNav: "Caawimo", notices: "Ogeysiisyo", export: "Dhoofin", drive: "Kaydin Drive" },
      helpNoticeTitle: "Talooyin Degdeg ah",
      helpNoticeBody: "U baahan tahay xasuusin kooban? Isticmaal 'Abuur Rasiid' si aad u bilowdo, 'Kudar Alaab' si aad u buuxiso kaydka, iyo 'Kaydin Drive' si aad xogta u ilaaliso.",
      helpFullIntro: "<strong>Sida loo bilaabo:</strong> Kudar alaabo, abuuro rasiidyo, dir xasuusin, oo dhoofso warbixinno. Hoos ka hel tallabo-tallabo caawimo.",
      tplDefaults: {
        reminder_wa: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).",
        reminder_sms: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}."
      },
      savedText: "La keydiyey",
      exportPdf: "PDF",
      exportCsv: "CSV",
      driveNotInit: "Drive: lama diyaarin",
      noticesEmpty: "Ogeysiis ma jiro.",
      programmaticNotices: {
        backup_done: { title: "Kaydin dhameystiran", body: "Kaydintaada waxaa lagu badbaadiyey Drive." },
        restore_done: { title: "Soo celin dhameystiran", body: "Xogta si guul leh ayaa looga soo celiyey Drive." },
        welcome: { title: "Soo Dhawoow", body: "Ku soo dhawoow guddiga suuqa — talooyin kooban ka hel Dejimaha." }
      },
      translateNoticesBtn: "Tarjum Ogeysiisyada",
      clearNoticesBtn: "Masax Dhammaan"
    }
  };

  /* apply translations into modal */
  function applyLangToModal(lang) {
    const t = translations[lang] || translations.en;
    document.getElementById('settingsTitle') && (document.getElementById('settingsTitle').textContent = t.settingsTitle);
    document.getElementById('settingsCloseBtn') && (document.getElementById('settingsCloseBtn').textContent = t.closeBtn);
    document.getElementById('settingsHelpOpen') && (document.getElementById('settingsHelpOpen').title = t.helpBtnTitle);

    // tabs
    Object.entries(t.tabs).forEach(([k, v]) => {
      const el = modal.querySelector(`.settings-tab[data-tab="${k}"]`);
      if (el) {
        const icon = el.querySelector('i') ? el.querySelector('i').outerHTML + ' ' : '';
        el.innerHTML = icon + v;
      }
    });

    // help content
    document.getElementById('helpNoticeTitle') && (document.getElementById('helpNoticeTitle').textContent = t.helpNoticeTitle);
    document.getElementById('helpNoticeBody') && (document.getElementById('helpNoticeBody').innerHTML = t.helpNoticeBody);
    document.getElementById('helpIntro') && (document.getElementById('helpIntro').innerHTML = t.helpFullIntro);

    // messages templates default
    const tpl = lsGet(LS_MSG_TPL) || {};
    if (!tpl.reminder_wa && !tpl.reminder_sms) {
      lsSet(LS_MSG_TPL, { reminder_wa: t.tplDefaults.reminder_wa, reminder_sms: t.tplDefaults.reminder_sms });
    }
    const storedTpl = lsGet(LS_MSG_TPL) || {};
    modal.querySelector('#settingsWaTpl') && (modal.querySelector('#settingsWaTpl').value = storedTpl.reminder_wa || t.tplDefaults.reminder_wa);
    modal.querySelector('#settingsSmsTpl') && (modal.querySelector('#settingsSmsTpl').value = storedTpl.reminder_sms || t.tplDefaults.reminder_sms);

    // export & notices UI
    modal.querySelector('#exportInvoicesPdf') && (modal.querySelector('#exportInvoicesPdf').innerHTML = `<i class="fa-solid fa-file-pdf mr-1"></i> ${t.exportPdf}`);
    modal.querySelector('#exportInvoicesExcel') && (modal.querySelector('#exportInvoicesExcel').innerHTML = `<i class="fa-solid fa-file-csv mr-1"></i> ${t.exportCsv}`);
    modal.querySelector('#driveStatus') && (modal.querySelector('#driveStatus').textContent = t.driveNotInit);
    modal.querySelector('#translateProgrammaticNotices') && (modal.querySelector('#translateProgrammaticNotices').textContent = t.translateNoticesBtn);
    modal.querySelector('#clearNoticesBtn') && (modal.querySelector('#clearNoticesBtn').textContent = t.clearNoticesBtn);

    if (lang) localStorage.setItem(LS_LANG_KEY, lang);
  }

  function setActiveLangButton(lang) {
    const en = document.getElementById('langEnBtn'), so = document.getElementById('langSoBtn');
    if (!en || !so) return;
    en.classList.remove('bg-sky-600','text-white','shadow');
    so.classList.remove('bg-sky-600','text-white','shadow');
    if (lang === 'so') so.classList.add('bg-sky-600','text-white','shadow'); else en.classList.add('bg-sky-600','text-white','shadow');
  }

  function applyLanguage(lang, save = true) {
    if (!lang) lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    if (save) localStorage.setItem(LS_LANG_KEY, lang);
    setActiveLangButton(lang);
    applyLangToModal(lang);
    try { renderNoticesUI(); } catch(e) {}
    try { if (typeof window.applyTranslations === 'function') window.applyTranslations(lang); } catch(e) {}
  }

  // wire language buttons
  modal.querySelector('#langEnBtn')?.addEventListener('click', () => applyLanguage('en', true));
  modal.querySelector('#langSoBtn')?.addEventListener('click', () => applyLanguage('so', true));

  /* -------------------------
     Panels/tab wiring & helpers
     ------------------------- */
  function showTab(name){
    modal.querySelectorAll('.settings-panel').forEach(p => p.dataset.panel === name ? (p.style.display='block') : (p.style.display='none'));
    modal.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('bg-sky-50','dark:bg-sky-800'));
    const btn = modal.querySelector(`.settings-tab[data-tab="${name}"]`);
    if (btn) btn.classList.add('bg-sky-50');
  }
  modal.querySelectorAll('.settings-tab').forEach(tb => tb.addEventListener('click', function(){
    showTab(this.dataset.tab);
  }));

  // close/backdrop
  modal.querySelector('#settingsCloseBtn')?.addEventListener('click', ()=> modal.classList.add('hidden'));
  modal.addEventListener('click', (e)=> { if (e.target === modal || e.target.id === 'appSettingsModalBackdrop') modal.classList.add('hidden'); });

  /* -------------------------
     Messages save/reset
     ------------------------- */
  modal.querySelector('#settingsSaveMsgBtn')?.addEventListener('click', ()=>{
    const wa = (document.getElementById('settingsWaTpl')||{}).value || '';
    const sms = (document.getElementById('settingsSmsTpl')||{}).value || '';
    lsSet(LS_MSG_TPL, { reminder_wa: wa, reminder_sms: sms });
    const s = document.getElementById('settingsMsgStatus'); if (s){ s.classList.remove('hidden'); setTimeout(()=> s.classList.add('hidden'), 1200); }
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const msg = (translations[lang] && translations[lang].savedText) ? translations[lang].savedText : 'Saved';
    toast(msg, 'success');
  });
  modal.querySelector('#settingsResetMsgBtn')?.addEventListener('click', ()=>{
    if (!confirm('Reset message templates to defaults?')) return;
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const t = translations[lang] || translations.en;
    lsSet(LS_MSG_TPL, { reminder_wa: t.tplDefaults.reminder_wa, reminder_sms: t.tplDefaults.reminder_sms });
    const tpl = lsGet(LS_MSG_TPL) || {};
    document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
    document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');
    toast(t.savedText || 'Saved', 'success');
  });

  /* -------------------------
     Export wiring (unchanged)
     ------------------------- */
  modal.querySelector('#exportInvoicesPdf')?.addEventListener('click', ()=>{
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user) { toast('Login required','error'); return; }
    const inv = (typeof getStoreInvoices === 'function') ? getStoreInvoices(user.name) : [];
    if (!inv || !inv.length) { toast('No invoices','error'); return; }
    if (!window.jspdf) { alert('jsPDF required'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`${user.name} - Invoices`, 14, 16);
    if (doc.autoTable) {
      doc.autoTable({ head: [['ID','Date','Customer','Phone','Amount','Paid','Status']], body: inv.map(i => [i.id, i.date, i.customer, i.phone, i.amount, i.paid, i.status]), startY: 22 });
    } else {
      let y = 22;
      inv.forEach(i => { doc.text(`${i.id} ${i.date} ${i.customer} ${i.amount}`, 14, y); y+=8; });
    }
    doc.save(`invoices_${user.name}_${Date.now()}.pdf`);
    toast('PDF exported','success');
  });
  modal.querySelector('#exportInvoicesExcel')?.addEventListener('click', ()=>{
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user) { toast('Login required','error'); return; }
    const inv = (typeof getStoreInvoices === 'function') ? getStoreInvoices(user.name) : [];
    if (!inv || !inv.length) { toast('No invoices','error'); return; }
    const rows = [['ID','Date','Customer','Phone','Amount','Paid','Status']]; inv.forEach(i => rows.push([i.id, i.date, i.customer, i.phone, i.amount, i.paid, i.status]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `invoices_${user.name}_${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove();
    toast('CSV exported','success');
  });

  /* -------------------------
     Notices UI (with programmatic i18n support)
     ------------------------- */
  function renderNoticesUI() {
    const notices = lsGet(LS_NOTICES) || [];
    const noticesEl = document.getElementById('settingsNotices');
    if (!noticesEl) return;
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const progI18n = (translations[lang] && translations[lang].programmaticNotices) ? translations[lang].programmaticNotices : {};

    if (!notices.length) {
      const t = translations[lang] || translations.en;
      noticesEl.innerHTML = `<div class="text-sm text-slate-600 dark:text-slate-400">${t.noticesEmpty}</div>`;
      return;
    }

    noticesEl.innerHTML = notices.map(n => {
      let title = escapeHtml(n.title || '');
      let body = escapeHtml(n.body || '');
      if (n.i18nKey && progI18n[n.i18nKey]) {
        title = escapeHtml(progI18n[n.i18nKey].title || title);
        body = escapeHtml(progI18n[n.i18nKey].body || body);
      }
      return `
        <div class="rounded-lg p-3 bg-white dark:bg-sky-900/6 shadow-sm border border-sky-100">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-sm text-slate-900 dark:text-slate-100">${title}</div>
              <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">${body}</div>
            </div>
            <div class="text-xs text-slate-400">${new Date(n.created||Date.now()).toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.Notices = {
    add: function({ title = 'Notice', body = '', i18nKey = null } = {}) {
      const all = lsGet(LS_NOTICES) || [];
      const payload = { id: `N-${Date.now()}-${Math.floor(Math.random()*9000)}`, title: String(title), body: String(body), created: Date.now() };
      if (i18nKey) payload.i18nKey = i18nKey;
      all.unshift(payload);
      lsSet(LS_NOTICES, all);
      try { renderNoticesUI(); } catch (e) {}
      try { window.dispatchEvent(new Event('noticesUpdated')); } catch (e) {}
      try { localStorage.setItem('__notices_sync', Date.now().toString()); } catch (e) {}
      return payload;
    },
    list: function() { return lsGet(LS_NOTICES) || []; },
    clear: function() { lsSet(LS_NOTICES, []); renderNoticesUI(); }
  };

  function ensureProgrammaticNotices() {
    const programmatic = Array.isArray(window.PROGRAMMATIC_NOTICES) ? window.PROGRAMMATIC_NOTICES
                      : Array.isArray(window.GLOBAL_NOTICES) ? window.GLOBAL_NOTICES
                      : [];
    if (!programmatic.length) return;
    const existing = lsGet(LS_NOTICES) || [];
    let changed = false;
    programmatic.forEach(item => {
      if (!item) return;
      const id = item.id ? String(item.id) : null;
      const i18nKey = item.i18nKey || item.key || null;
      const found = id ? existing.find(n => n.id === id) : (i18nKey ? existing.find(n => n.i18nKey === i18nKey) : null);
      if (!found) {
        const payload = {
          id: id || `N-${Date.now()}-${Math.floor(Math.random()*9000)}`,
          title: item.title || (i18nKey ? i18nKey : 'Notice'),
          body: item.body || '',
          created: item.created ? Number(item.created) : Date.now(),
          i18nKey: i18nKey || null
        };
        existing.unshift(payload);
        changed = true;
      }
    });
    if (changed) {
      lsSet(LS_NOTICES, existing);
      try { renderNoticesUI(); } catch(e) {}
      try { window.dispatchEvent(new Event('noticesUpdated')); } catch(e) {}
      try { localStorage.setItem('__notices_sync', Date.now().toString()); } catch(e) {}
    }
  }

  renderNoticesUI();
  try { ensureProgrammaticNotices(); } catch(e){ console.error('ensureProgrammaticNotices failed', e); }

  window.addEventListener('storage', (ev) => {
    if (!ev) return;
    if (ev.key === LS_NOTICES || ev.key === '__notices_sync') {
      setTimeout(()=> { try { renderNoticesUI(); } catch(e){} }, 50);
    }
  });
  window.addEventListener('noticesUpdated', () => { try { renderNoticesUI(); } catch(e){} });
  window.renderNoticesUI = renderNoticesUI;

  modal.querySelector('#translateProgrammaticNotices')?.addEventListener('click', () => {
    renderNoticesUI();
    toast('Notices translated', 'success');
  });
  modal.querySelector('#clearNoticesBtn')?.addEventListener('click', () => {
    if (!confirm('Clear all notices?')) return;
    window.Notices.clear();
    toast('Notices cleared','success');
  });

  // example manual notice trigger
  const someRemindBtn = document.getElementById('someRemindBtn');
  if (someRemindBtn) {
    someRemindBtn.addEventListener('click', () => {
      window.Notices.add({ i18nKey: 'welcome' });
      toast('Notice added', 'success');
    });
  }

  /* -------------------------
     Drive settings wiring
     ------------------------- */
  const s = lsGet(LS_SETTINGS) || {};
  const optRestore = document.getElementById('optAutoRestoreLogin');
  const optAutoEnabled = document.getElementById('optAutoBackupEnabled');
  const optAutoDays = document.getElementById('optAutoBackupDays');
  if (optRestore) optRestore.checked = Boolean(s.autoRestoreOnLogin);
  if (optAutoEnabled) optAutoEnabled.checked = Boolean(s.autoBackup && s.autoBackup.enabled);
  if (optAutoDays) optAutoDays.value = (s.autoBackup && s.autoBackup.days) ? s.autoBackup.days : 7;

  initGisIfNeeded();
  initGapiIfNeeded().then(()=> { setDriveStatus && setDriveStatus('Drive: ready'); }).catch(()=> { setDriveStatus && setDriveStatus('Drive: client not ready'); });

  modal.querySelector('#driveBackupBtn')?.addEventListener('click', driveBackup);
  modal.querySelector('#driveRefreshBtn')?.addEventListener('click', driveListBackups);
  modal.querySelector('#driveRestoreLatestBtn')?.addEventListener('click', driveRestoreLatest);

  function persistDriveSettings(){
    const cur = lsGet(LS_SETTINGS) || {};
    cur.autoRestoreOnLogin = Boolean(document.getElementById('optAutoRestoreLogin')?.checked);
    cur.autoBackup = { enabled: Boolean(document.getElementById('optAutoBackupEnabled')?.checked), days: Number(document.getElementById('optAutoBackupDays')?.value) || 7 };
    lsSet(LS_SETTINGS, cur);
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const msg = (translations[lang] && translations[lang].savedText) ? translations[lang].savedText : 'Saved';
    toast(msg,'success');
    if (cur.autoBackup && cur.autoBackup.enabled) scheduleAutoBackup(); else cancelAutoBackup();
  }
  document.getElementById('optAutoRestoreLogin')?.addEventListener('change', persistDriveSettings);
  document.getElementById('optAutoBackupEnabled')?.addEventListener('change', persistDriveSettings);
  document.getElementById('optAutoBackupDays')?.addEventListener('change', persistDriveSettings);

  /* -------------------------
     Show modal + animate help notice
     ------------------------- */
  modal.classList.remove('hidden');
  modal.querySelectorAll('.settings-panel').forEach(p => p.style.display = p.dataset.panel === 'helpNotice' ? 'block' : 'none');

  (function initLangOnModalOpen(){
    const saved = localStorage.getItem(LS_LANG_KEY) || 'en';
    setActiveLangButton(saved);
    applyLangToModal(saved);

    // wire language buttons to also call global applyTranslations
    document.getElementById('langEnBtn')?.addEventListener('click', ()=> {
      localStorage.setItem(LS_LANG_KEY,'en');
      try { if (typeof window.applyTranslations === 'function') window.applyTranslations('en'); } catch(e){}
      applyLanguage('en', true);
    });
    document.getElementById('langSoBtn')?.addEventListener('click', ()=> {
      localStorage.setItem(LS_LANG_KEY,'so');
      try { if (typeof window.applyTranslations === 'function') window.applyTranslations('so'); } catch(e){}
      applyLanguage('so', true);
    });

    // help controls (dismiss, open full help)
    document.getElementById('dismissHelpNotice')?.addEventListener('click', ()=> {
      document.getElementById('helpNoticeCard')?.classList.add('hidden');
    });
    document.getElementById('moreHelpBtn')?.addEventListener('click', ()=> {
      showTab('helpNav');
    });
    document.getElementById('showHelpPanelBtn')?.addEventListener('click', ()=> {
      showTab('helpNav');
    });

    // animate the help notice entrance
    const helpCard = document.getElementById('helpNoticeCard');
    if (helpCard) {
      helpCard.classList.add('help-notice-enter');
      // next tick -> active
      setTimeout(()=> {
        helpCard.classList.add('help-notice-enter-active');
      }, 20);
      // remove the enter classes after animation so it can play again later
      setTimeout(()=> {
        helpCard.classList.remove('help-notice-enter','help-notice-enter-active');
      }, 420);
    }
  })();

  // fill templates into textareas (if any) - initial fill
  const tpl = lsGet(LS_MSG_TPL) || {};
  document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
  document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');

  // helper: escapeHtml (kept local)
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // expose applyLanguage helper globally for other UI
  window.applySettingsModalLanguage = function(lang){
    try { if (typeof applyLanguage === 'function') applyLanguage(lang, true); } catch(e){}
  };

  // ensure nav visible on initial create
  setTimeout(ensureSettingsNavVisible, 60);

} // end openSettingsModal


// ==========================
// Settings button attach (resilient / delegated) - replaces btn.onclick
// ==========================
(function attachSettingsButton(){
  // create a button if absent (same as before)
  let btn = document.getElementById('storeSettingsBtn');
  if (!btn) {
    const target = document.getElementById('storeDisplayDesktop');
    btn = document.createElement('button');
    btn.id = 'storeSettingsBtn';
    btn.className = 'ml-2 px-2 py-1 rounded bg-emerald-600 text-white';
    btn.title = 'Settings';
    btn.innerHTML = '<i class="fa-solid fa-cog"></i>';
    if (target && target.parentNode) target.parentNode.insertBefore(btn, target.nextSibling);
    else document.body.appendChild(btn);
  }

  // Delegated click handler attached once on document — resilient if the button is re-created by other code
  if (!document._settingsBtnDelegationInstalled) {
    document.addEventListener('click', function (e) {
      const el = e.target.closest && e.target.closest('#storeSettingsBtn');
      if (el) {
        try { openSettingsModal(); } catch (err) { console.error('openSettingsModal error', err); }
      }
    }, { capture: false, passive: true });
    document._settingsBtnDelegationInstalled = true;
  }
})();



    // small helper to set drive status element
    function setDriveStatus(msg, isError){
      const el = document.getElementById('driveStatus');
      if (el) { el.textContent = msg; el.style.color = isError ? '#b91c1c' : '#065f46'; }
    }
  
    // Drive implementations: list, backup, download, restore, latest
    async function driveListBackups(){
      setDriveStatus('Listing backups...');
      initGisIfNeeded();
      try { await initGapiIfNeeded(); } catch(e){ setDriveStatus('gapi init failed', true); console.error(e); return; }
      showSpinner('Listing backups...');
      requestDriveToken(async (token) => {
        try {
          const q = `name contains '${BACKUP_NAME_PREFIX}' and trashed=false and mimeType='application/json'`;
          const params = `?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=50`;
          const res = await fetch('https://www.googleapis.com/drive/v3/files' + params, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('List failed', true); hideSpinner(); return; }
          const data = await res.json();
          const listEl = document.getElementById('driveBackupList');
          if (!listEl) { hideSpinner(); return; }
          listEl.innerHTML = '';
          if (!data.files || !data.files.length) { listEl.innerHTML = '<div class="text-sm text-gray-500">No backups found</div>'; setDriveStatus('No backups'); hideSpinner(); return; }
          data.files.forEach(file => {
            const wrap = document.createElement('div');
            wrap.className = 'p-2 border rounded bg-white flex items-center justify-between gap-2';
            const left = document.createElement('div');
            left.style.flex = '1';
            left.innerHTML = `<div style="font-weight:600;word-break:break-word">${escapeHtml(file.name)}</div><div style="font-size:12px;color:#6b7280">${new Date(file.createdTime).toLocaleString()} • ${file.size ? (Math.round(file.size/1024) + ' KB') : ''}</div>`;
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '6px';
            const btnRestore = document.createElement('button'); btnRestore.className = 'px-2 py-1 bg-green-600 text-white rounded text-sm'; btnRestore.textContent = 'Restore';
            const btnDownload = document.createElement('button'); btnDownload.className = 'px-2 py-1 bg-gray-200 rounded text-sm'; btnDownload.textContent = 'Download';
            btnRestore.onclick = () => driveRestore(file.id, file.name);
            btnDownload.onclick = () => driveDownload(file.id, file.name);
            right.appendChild(btnRestore); right.appendChild(btnDownload);
            wrap.appendChild(left); wrap.appendChild(right);
            listEl.appendChild(wrap);
          });
          setDriveStatus('Backups listed (' + data.files.length + ')');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Error listing', true); hideSpinner(); }
      });
    }
  
    async function driveBackup(){
      setDriveStatus('Preparing backup...');
      // create snapshot of localStorage
      const snapshot = {};
      for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); snapshot[k] = localStorage.getItem(k); }
      const payload = JSON.stringify(snapshot, null, 2);
      showSpinner('Uploading backup...','Preparing data');
      requestDriveToken(async (token) => {
        try {
          const metadata = { name: `${BACKUP_NAME_PREFIX}${Date.now()}.json`, mimeType: 'application/json' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', new Blob([payload], { type: 'application/json' }));
          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: form
          });
          if (!res.ok) { const t = await res.text(); console.error('upload failed', t); setDriveStatus('Backup failed', true); hideSpinner(); return; }
          const json = await res.json();
          const settings = lsGet(LS_SETTINGS) || {}; settings.lastAutoBackup = now(); lsSet(LS_SETTINGS, settings);
          setDriveStatus('Backup saved: ' + json.name);
          toast('Backup saved to Drive', 'success');
          hideSpinner();
          driveListBackups();
        } catch(err){ console.error(err); setDriveStatus('Backup error', true); hideSpinner(); }
      });
    }
  
    async function driveDownload(fileId, fileName){
      setDriveStatus('Downloading ' + fileName + '...');
      showSpinner('Downloading backup...', fileName);
      requestDriveToken(async (token) => {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Download failed', true); hideSpinner(); return; }
          const text = await res.text();
          const blob = new Blob([text], { type:'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
          setDriveStatus('Downloaded ' + fileName);
          toast('Backup downloaded', 'success');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Download error', true); hideSpinner(); }
      });
    }
  
    async function driveRestore(fileId, fileName){
      if (!confirm(`Restore "${fileName}"? This will overwrite local data stored in this browser.`)) return;
      setDriveStatus('Restoring ' + fileName + '...');
      showSpinner('Restoring backup...', fileName);
      requestDriveToken(async (token) => {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Restore failed', true); hideSpinner(); return; }
          const text = await res.text();
          let obj;
          try { obj = JSON.parse(text); } catch(e){ setDriveStatus('Invalid JSON in backup', true); hideSpinner(); return; }
          localStorage.clear();
          Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
          // re-render app pieces (non-intrusive)
          try { window.dispatchEvent(new Event('dataUpdated')); } catch(e){}
          try { if (typeof renderProductList === 'function') renderProductList(); } catch(e){}
          try { if (typeof renderInvoiceTable === 'function') renderInvoiceTable(); } catch(e){}
          try { if (typeof renderReports === 'function') renderReports(); } catch(e){}
          try { if (typeof updateDashboardTotals === 'function') updateDashboardTotals(); } catch(e){}
          setDriveStatus('Restore complete');
          toast('Backup restored', 'success');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Restore error', true); hideSpinner(); }
      });
    }
  
    async function driveRestoreLatest(){
      setDriveStatus('Fetching latest backup...');
      showSpinner('Fetching latest backup...');
      requestDriveToken(async (token) => {
        try {
          const q = `name contains '${BACKUP_NAME_PREFIX}' and trashed=false and mimeType='application/json'`;
          const params = `?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=1`;
          const res = await fetch('https://www.googleapis.com/drive/v3/files' + params, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Failed to fetch latest', true); hideSpinner(); return; }
          const data = await res.json();
          if (!data.files || !data.files.length) { setDriveStatus('No backups found'); hideSpinner(); return; }
          const latest = data.files[0];
          if (!confirm(`Restore latest backup "${latest.name}"? This will overwrite local data.`)) { hideSpinner(); return; }
          // download & restore
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, { headers: { Authorization: 'Bearer ' + token }});
          if (!r.ok) { setDriveStatus('Failed to download latest', true); hideSpinner(); return; }
          const txt = await r.text();
          let obj; try { obj = JSON.parse(txt); } catch(e){ setDriveStatus('Latest backup invalid', true); hideSpinner(); return; }
          localStorage.clear();
          Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
          try { window.dispatchEvent(new Event('dataUpdated')); } catch(e){}
          try { if (typeof renderProductList === 'function') renderProductList(); } catch(e){}
          try { if (typeof renderInvoiceTable === 'function') renderInvoiceTable(); } catch(e){}
          try { if (typeof renderReports === 'function') renderReports(); } catch(e){}
          try { if (typeof updateDashboardTotals === 'function') updateDashboardTotals(); } catch(e){}
          setDriveStatus('Latest backup restored: ' + latest.name);
          toast('Latest backup restored','success');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Error restoring latest', true); hideSpinner(); }
      });
    }
  
    // Expose functions for wiring (they map to internal names in your app too)
    window.driveBackup = driveBackup;
    window.driveListBackups = driveListBackups;
    window.driveRestoreLatest = driveRestoreLatest;
  
    // // Settings button attach (safe: will not override if exists)
    // (function attachSettingsButton(){
    //   let btn = document.getElementById('storeSettingsBtn');
    //   if (!btn) {
    //     const target = document.getElementById('storeDisplayDesktop');
    //     btn = document.createElement('button');
    //     btn.id = 'storeSettingsBtn';
    //     btn.className = 'ml-2 px-2 py-1 rounded bg-emerald-600 text-white';
    //     btn.title = 'Settings';
    //     btn.innerHTML = '<i class="fa-solid fa-cog"></i>';
    //     if (target && target.parentNode) target.parentNode.insertBefore(btn, target.nextSibling);
    //     else document.body.appendChild(btn);
    //   }
    //   btn.onclick = openSettingsModal;
    // })();
  
    // ===========================
    // Auto-backup scheduling (timers while app is open)
    // ===========================
    let autoBackupTimer = null;
    function scheduleAutoBackup(){
      const s = lsGet(LS_SETTINGS) || {};
      if (!s.autoBackup || !s.autoBackup.enabled) return cancelAutoBackup();
      const days = Number(s.autoBackup.days) || 7;
      const ms = days * 24 * 60 * 60 * 1000;
      cancelAutoBackup();
      // quick immediate run if overdue
      const last = Number(s.lastAutoBackup || 0);
      if (!last || (now() - last >= ms)) {
        try { driveBackup(); } catch(e){ console.error(e); }
      }
      autoBackupTimer = setInterval(()=> {
        try { driveBackup(); } catch(e){ console.error(e); }
      }, ms);
    }
    function cancelAutoBackup(){ if (autoBackupTimer){ clearInterval(autoBackupTimer); autoBackupTimer = null; } }
    // init schedule if enabled
    (function initAuto(){
      const s = lsGet(LS_SETTINGS) || {};
      if (s && s.autoBackup && s.autoBackup.enabled) setTimeout(scheduleAutoBackup, 800);
    })();
  
    // ===========================
    // Auto-restore prompt on login (opt-in)
    // Attach a hook to setCurrentUser if available
    // ===========================
    (function attachLoginHook(){
      if (typeof window.setCurrentUser === 'function') {
        const _orig = window.setCurrentUser;
        window.setCurrentUser = function(user){
          _orig(user);
          try { window.dispatchEvent(new CustomEvent('app:userLoggedIn', { detail:{ user } })); } catch(e){ console.warn(e); }
        };
      }
      window.addEventListener('app:userLoggedIn', ev => { try { handleAutoRestorePrompt(ev.detail.user); } catch(e){ console.error(e); } });
      document.addEventListener('DOMContentLoaded', ()=> {
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (user) handleAutoRestorePrompt(user);
      });
    })();
  
    async function handleAutoRestorePrompt(user){
      try {
        const settings = lsGet(LS_SETTINGS) || {};
        if (!settings.autoRestoreOnLogin) return;
        if (!user) return;
        initGisIfNeeded();
        try { await initGapiIfNeeded(); } catch(e){ console.warn('gapi not ready', e); }
        showSpinner('Checking Drive for backups...');
        requestDriveToken(async (token) => {
          try {
            const q = `name contains '${BACKUP_NAME_PREFIX}' and trashed=false and mimeType='application/json'`;
            const params = `?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=1`;
            const res = await fetch('https://www.googleapis.com/drive/v3/files' + params, { headers: { Authorization: 'Bearer ' + token }});
            hideSpinner();
            if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Failed to check Drive', true); return; }
            const data = await res.json();
            if (!data.files || !data.files.length) { setDriveStatus('No backups found', false); return; }
            const latest = data.files[0];
            const confirmRestore = confirm(`A Drive backup exists: "${latest.name}" (${new Date(latest.createdTime).toLocaleString()}). Restore now?`);
            if (!confirmRestore) return;
            showSpinner('Restoring latest backup...', latest.name);
            requestDriveToken(async (tk) => {
              try {
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, { headers: { Authorization: 'Bearer ' + tk }});
                if (!r.ok) { setDriveStatus('Failed to download latest', true); hideSpinner(); return; }
                const txt = await r.text();
                let obj; try { obj = JSON.parse(txt); } catch(e){ setDriveStatus('Backup JSON invalid', true); hideSpinner(); return; }
                localStorage.clear();
                Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
                try { window.dispatchEvent(new Event('dataUpdated')); } catch(e){}
                try { if (typeof renderProductList === 'function') renderProductList(); } catch(e){}
                try { if (typeof renderInvoiceTable === 'function') renderInvoiceTable(); } catch(e){}
                try { if (typeof renderReports === 'function') renderReports(); } catch(e){}
                try { if (typeof updateDashboardTotals === 'function') updateDashboardTotals(); } catch(e){}
                setDriveStatus('Backup restored: ' + latest.name);
                toast('Drive backup restored', 'success');
                hideSpinner();
              } catch(err){ console.error(err); setDriveStatus('Restore failed', true); hideSpinner(); }
            });
          } catch(err){ console.error(err); hideSpinner(); setDriveStatus('Error while checking Drive', true); }
        });
      } catch(e){ console.error(e); }
    }
  
    // ===========================
    // Daily backup reminder: create a notice per store once per day
    // ===========================
    function dailyBackupReminder(){
      try {
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (!user || !user.name) return;
        const s = lsGet(LS_SETTINGS) || {};
        const lastByStore = s.lastDailyReminderByStore || {};
        const todayKey = new Date().toISOString().slice(0,10); // YYYY-MM-DD
        if (lastByStore[user.id] === todayKey) return; // already reminded today
        // create notice
        const title = `Backup Reminder — ${user.name}`;
        const body = `Hi ${user.name}. Remember to backup your supermarket data to Google Drive to protect against device loss. Open Settings → Drive Backup to save your data.`;
        try {
          window.Notices && typeof window.Notices.add === 'function' ? window.Notices.add({ title, body }) : lsSet(LS_NOTICES, [{ id:`N-${Date.now()}`, title, body, created: Date.now() }].concat(lsGet(LS_NOTICES)||[]));
        } catch(e){ console.error(e); }
        // mark reminder done for today
        lastByStore[user.id] = todayKey;
        s.lastDailyReminderByStore = lastByStore;
        lsSet(LS_SETTINGS, s);
      } catch(e){ console.error(e); }
    }
    // call on load and after login
    document.addEventListener('DOMContentLoaded', ()=> dailyBackupReminder());
    window.addEventListener('app:userLoggedIn', ()=> dailyBackupReminder());
    window.addEventListener('dataUpdated', ()=> dailyBackupReminder());
  
    // attach public API
    window.AppSettings = window.AppSettings || {};
    window.AppSettings.open = openSettingsModal;
    window.AppSettings.driveBackup = driveBackup;
    window.AppSettings.driveListBackups = driveListBackups;
    window.AppSettings.driveRestoreLatest = driveRestoreLatest;
  
    // ensure spinner exists
    ensureSpinner();
  
    console.info('Settings + Drive v2 loaded');
  
  })(); // end module
  
  (function adjustSettingsModalForMobileAndDarkmode(){
    // small CSS overrides to improve modal background, cards, spinner and mobile nav behavior
    const css = `
      /* modal container background + text that respects dark mode */
      #appSettingsModal .relative { background: #f8fafc; color: #0f172a; }
      .dark #appSettingsModal .relative { background: #0b1220; color: #e6eef8; }
  
      /* make the inner cards use subtle backgrounds in both modes */
      #appSettingsModal .bg-white { background: #ffffff; color: inherit; }
      .dark #appSettingsModal .bg-white { background: #071021; color: inherit; }
  
      /* spinner panel color */
      #driveSpinnerOverlay [role="status"] { background: #ffffff; color: inherit; }
      .dark #driveSpinnerOverlay [role="status"] { background: #071021; color: #e6eef8; }
  
      /* make the left nav visible on mobile as a horizontal scroll row;
         on md+ screens it becomes the vertical column as before */
      #appSettingsModal nav#settingsNav { display: flex !important; flex-direction: row; gap: 8px; overflow-x: auto; padding: 8px; border-right: none; -webkit-overflow-scrolling: touch; }
      @media (min-width: 768px) {
        #appSettingsModal nav#settingsNav { display: block !important; flex-direction: column; border-right: 1px solid rgba(0,0,0,0.06); padding: 12px; }
      }
  
      /* ensure settings-tab buttons are compact and readable on narrow screens */
      #appSettingsModal .settings-tab { white-space: nowrap; border-radius: 8px; padding-left:10px; padding-right:10px; }
      #appSettingsModal .settings-tab.bg-gray-100 { background-color: rgba(255,255,255,0.06) !important; }
  
      /* small improvements for backup list items */
      #driveBackupList .p-2 { background: var(--card-bg,#fff); }
      .dark #driveBackupList .p-2 { background: #071021; }
  
      /* ensure modal scroll area uses proper color */
      #appSettingsModal .settings-panel { color: inherit; }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-for','settings-modal-fixes');
    s.textContent = css;
    document.head.appendChild(s);
  
    // helper to ensure nav is visible and styled when modal created/opened
    function ensureSettingsNavVisible() {
      const nav = document.getElementById('settingsNav');
      if (!nav) return;
      // remove any 'hidden' that your module may have put on desktop-only nav
      nav.classList.remove('hidden');
      // apply flexible mobile layout
      nav.style.display = 'flex';
      nav.style.flexDirection = 'row';
      nav.style.gap = '8px';
      nav.style.padding = '8px';
      nav.style.borderRight = 'none';
      // make tabs easy to tap
      nav.querySelectorAll('.settings-tab').forEach(tb => {
        tb.style.whiteSpace = 'nowrap';
        tb.style.flex = '0 0 auto';
      });
    }
  
    // call on DOMContentLoaded & also each time settings modal might be opened
    document.addEventListener('DOMContentLoaded', ensureSettingsNavVisible);
    // call when settings button clicked (works both for original button and dynamically created one)
    document.addEventListener('click', function(e){
      const btn = e.target.closest('#storeSettingsBtn, #settingsHelpOpen, #settingsCloseBtn');
      if (btn) {
        // scheduled to allow modal markup to be created first
        setTimeout(ensureSettingsNavVisible, 120);
      }
    });
  
    // small MutationObserver: if modal is inserted later, ensure nav fixed
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n && n.querySelector && n.querySelector('#appSettingsModal')) {
            setTimeout(ensureSettingsNavVisible, 40);
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  
    // Update spinner CSS variable if page uses `dark` class (improve immediate spinner colors)
    function applySpinnerTheme(){
      const root = document.documentElement;
      const isDark = root.classList.contains('dark') || window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const spinnerPanel = document.querySelector('#driveSpinnerOverlay [role="status"]');
      if (spinnerPanel) {
        spinnerPanel.style.background = isDark ? '#071021' : '#ffffff';
        spinnerPanel.style.color = isDark ? '#e6eef8' : '#0f172a';
      }
    }
    document.addEventListener('DOMContentLoaded', applySpinnerTheme);
    // react on theme toggles if your page toggles the 'dark' class
    const themeObserver = new MutationObserver(applySpinnerTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  
  })();
    /* =========================
       small utilities exposed
       ========================= */
    window._supermarket_helpers = {
      lsGet, lsSet, getAllProducts, getAllInvoices, getAllReports
    };
  
  })(); // end auth.js
  


(function () {
  'use strict';

  /* =========================
     STORAGE KEYS & HELPERS
     ========================= */
  const LS_USERS = "supermarket_users_v2";
  const LS_CURRENT_USER = "currentSupermarket_v2";
  const LS_INVOICES = "invoices_v2";
  const LS_PRODUCTS = "products_v2";
  const LS_REPORTS = "reports_v2";
  const LS_MSG_TPL = "msg_templates_v2";
  const LS_NOTICES = "notices_v2";
  const LS_APP_LANG = "app_lang_v2";
  const LS_DARK = "app_dark_mode_v2";

  function lsGet(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error("lsSet failed", e); }
  }
  function lsRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  /* seed templates/notices if none */
  if (!lsGet(LS_MSG_TPL)) {
    lsSet(LS_MSG_TPL, {
      reminder_wa: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}.\nFadlan iska bixi dukaanka {store} ({phone}).",
      reminder_sms: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone})."
    });
  }
  if (!lsGet(LS_NOTICES)) {
    lsSet(LS_NOTICES, [{ id: `N-${Date.now()}`, title: "Welcome", body: "Welcome to the supermarket invoicing app.", pinned: true, created: Date.now() }]);
  }
  (function initStorage() {
    const FIRST_RUN_KEY = "__netlifyFirstRun";
  
    // 1) First load on Netlify → wipe everything once
    if (!localStorage.getItem(FIRST_RUN_KEY)) {
      console.log("🚀 First run on Netlify, clearing localStorage...");
      localStorage.clear();
      localStorage.setItem(FIRST_RUN_KEY, "true");
  
      // Show a toast/notice
      if (window.Notices && typeof window.Notices.add === "function") {
        window.Notices.add({
          title: "Storage Reset",
          body: "Local data was reset for a fresh start on first load."
        });
      }
    }
  
    // 2) Safe getter with auto-repair for Gmail JSON
    function safeGet(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn("⚠️ Corrupted storage for", key, "- resetting...");
        localStorage.removeItem(key);
  
        // Show notice for corrupted Gmail only
        if (key === "gmailBackup" && window.Notices) {
          window.Notices.add({
            title: "Storage Repair",
            body: "Your Gmail data was corrupted and has been reset."
          });
        }
  
        return fallback;
      }
    }
  
    // Example usage: auto-fix Gmail backup JSON
    const gmailData = safeGet("gmailBackup", []); 
    if (!Array.isArray(gmailData)) {
      localStorage.setItem("gmailBackup", JSON.stringify([]));
    }
  
    // expose helper globally if you want
    window.safeGet = safeGet;
  })();
  
  
  /* small helpers */
  function fmtMoney(n) { const num = Number(n) || 0; return num.toFixed(2); }
  function fmtDate(d) { const date = d ? new Date(d) : new Date(); const yyyy = date.getFullYear(); const mm = String(date.getMonth() + 1).padStart(2, '0'); const dd = String(date.getDate()).padStart(2, '0'); return `${yyyy}-${mm}-${dd}`; }
  function fmtDateTime(ts) { const d = new Date(ts); if (isNaN(d)) return String(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function escapeHtml(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cleanPhone(phone) { if (!phone) return ''; let p = String(phone).replace(/\D/g, ''); if (!p) return ''; if (p.startsWith('252')) return p; if (p.startsWith('0')) p = p.slice(1); if (!p.startsWith('252')) p = '252' + p; return p; }
  function ensureId(prefix = 'U') { return `${prefix}-${Date.now()}-${Math.floor(Math.random()*900000)}`; }

  /* storage wrappers */
  function getUsers() { return lsGet(LS_USERS, []); }
  function saveUsers(u) { lsSet(LS_USERS, u); }
  function getCurrentUser() { return lsGet(LS_CURRENT_USER, null); }
  function setCurrentUser(u) { lsSet(LS_CURRENT_USER, u); }
  function clearCurrentUser() { lsRemove(LS_CURRENT_USER); }

  function getAllInvoices() { return lsGet(LS_INVOICES, []); }
  function saveAllInvoices(arr) { lsSet(LS_INVOICES, arr); }
  function getStoreInvoices(storeName) { if (!storeName) return []; return getAllInvoices().filter(i => String(i.store || '').toLowerCase() === String(storeName || '').toLowerCase()); }

  function getAllProducts() { return lsGet(LS_PRODUCTS, []); }
  function saveAllProducts(arr) { lsSet(LS_PRODUCTS, arr); }
  function getStoreProducts(storeName) { if (!storeName) return []; return getAllProducts().filter(p => String(p.store || '').toLowerCase() === String(storeName || '').toLowerCase()); }

  function getAllReports() { return lsGet(LS_REPORTS, []); }
  function saveAllReports(arr) { lsSet(LS_REPORTS, arr); }

  /* =========================
     MIGRATION: ensure stable user IDs
     ========================= */
  function migrateLegacyData() {
    try {
      // Add id for any existing v2 users missing id
      const users = getUsers() || [];
      let changed = false;
      users.forEach(u => {
        if (u && !u.id) { u.id = ensureId('U'); changed = true; }
      });
      if (changed) saveUsers(users);

      // legacy keys migration (if present)
      const legacy = lsGet('supermarket_users') || lsGet('supermarket_users_v1');
      if (legacy && Array.isArray(legacy) && legacy.length) {
        const existing = getUsers() || [];
        legacy.forEach(u => {
          if (!u) return;
          if (!u.id) u.id = ensureId('U');
          const exists = existing.find(e => e.id === u.id || (e.email && u.email && e.email.toLowerCase() === u.email.toLowerCase()));
          if (!exists) existing.push(u);
        });
        saveUsers(existing);
        toast('Migrated legacy users', 'success', 1800);
      }
    } catch (e) { console.warn('Migration failed', e); }
  }
  migrateLegacyData();

  /* =========================
     NOTIFICATIONS / TOASTS (replace alert)
     ========================= */
  (function createToasts() {
    if (document.getElementById('appToasts')) return;
    const div = document.createElement('div');
    div.id = 'appToasts';
    div.style.position = 'fixed';
    div.style.right = '16px';
    div.style.top = '16px';
    div.style.zIndex = 9999;
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.gap = '8px';
    document.body.appendChild(div);
  })();
  function toast(msg, type = 'info', ms = 3000) {
    const wrap = document.getElementById('appToasts');
    if (!wrap) { alert(msg); return; }
    const el = document.createElement('div');
    el.className = 'shadow rounded p-3 text-sm max-w-xs';
    el.style.background = type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#e6f0ff');
    el.style.color = type === 'error' ? '#991b1b' : (type === 'success' ? '#065f46' : '#0f172a');
    el.style.border = '1px solid rgba(0,0,0,0.04)';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity 220ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, ms);
  }

  // /* small polyfills for optional libs */
  // function ensureLib(url, globalName) {
  //   return new Promise((res, rej) => {
  //     if (globalName && window[globalName]) return res(true);
  //     const s = document.createElement('script');
  //     s.src = url;
  //     s.onload = () => res(true);
  //     s.onerror = () => rej(new Error('Failed to load ' + url));
  //     document.head.appendChild(s);
  //   });
  // }


  /* =========================
     BASIC UI LOOKUPS
     ========================= */
  const authSection = document.getElementById("authSection");
  const dashboardSection = document.getElementById("dashboardSection");

  // auth
  const registrationForm = document.getElementById("registrationForm");
  const regName = document.getElementById("regName");
  const regAddress = document.getElementById("regAddress");
  const regPhone = document.getElementById("regPhone");
  const regEmail = document.getElementById("regEmail");
  const regPassword = document.getElementById("regPassword");
  const regConfirm = document.getElementById("regConfirm");
  const registerBtn = document.getElementById("registerBtn");

  const loginForm = document.getElementById("loginForm");
  const loginName = document.getElementById("loginName");
  const loginPassword = document.getElementById("loginPassword");
  const loginBtn = document.getElementById("loginBtn");

  const showLoginBtn = document.getElementById("showLogin");
  const showRegisterBtn = document.getElementById("showRegister");
  const logoutBtn = document.getElementById("logoutBtn");

  const storeDisplayDesktop = document.getElementById("storeDisplayDesktop");
  const totalInvoicesEl = document.getElementById("totalInvoices");
  const totalProductsEl = document.getElementById("totalProducts");
  const totalSalesEl = document.getElementById("totalSales");

  const navButtons = Array.from(document.querySelectorAll(".navBtn"));
  const dashboardContent = document.getElementById("dashboardContent");
  const invoicesSection = document.getElementById("invoicesSection");
  const productsSection = document.getElementById("productsSection");
  const reportsSection = document.getElementById("reportsSection");

  // invoices scope (some elements are in products/invoices area)
  const invArea = invoicesSection;
  const createInvoiceBtn = invArea?.querySelector('#createInvoiceBtn');
  const currentTimeEl = invArea?.querySelector('#currentTime');
  const createInvoiceSection = invArea?.querySelector('#createInvoiceSection');
  const editingInvoiceId = invArea?.querySelector('#editingInvoiceId');
  const customerNameInput = invArea?.querySelector('#customerName');
  const customerPhoneInput = invArea?.querySelector('#customerPhone');
  const invoiceDateInput = invArea?.querySelector('#invoiceDate');
  const invoiceItemsContainer = invArea?.querySelector('#invoiceItemsContainer');
  const addItemBtn = invArea?.querySelector('#addItemBtn');
  const amountInput = invArea?.querySelector('#amount');
  const paidInput = invArea?.querySelector('#paid');
  const statusSelect = invArea?.querySelector('#status');
  const saveInvoiceBtn = invArea?.querySelector('#saveInvoiceBtn');
  const formMsg = invArea?.querySelector('#formMsg');
  const invoiceRows = invArea?.querySelector('#invoiceRows');
  const emptyStateInv = invArea?.querySelector('#emptyState');
  const clearPaidBtn = invArea?.querySelector('#clearPaidBtn');
  const filterStatus = invArea?.querySelector('#filterStatus');
  const searchName = invArea?.querySelector('#searchName');
  const reminderMethod = invArea?.querySelector('#reminderMethod');
  const sendAllRemindersBtn = invArea?.querySelector('#sendAllReminders');

  // products scope
  const prodSection = productsSection;
  const addProductBtn = document.getElementById('addProductBtn');
  const productModal = document.getElementById('productModal');
  const productModalBackdrop = document.getElementById('productModalBackdrop');
  const closeModalBtn = document.getElementById('closeModal');
  const cancelModalBtn = document.getElementById('cancelModal');
  const productForm = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  const productName = document.getElementById('productName');
  const productCost = document.getElementById('productCost');
  const productPrice = document.getElementById('productPrice');
  const productQty = document.getElementById('productQty');
  const productRows = document.getElementById('productRows');
  const productCards = document.getElementById('productCards');
  const searchInput = document.getElementById('searchInput');
  const emptyAddBtn = document.getElementById('emptyAddBtn');

  const shopModal = document.getElementById('shopModal');
  const shopBackdrop = document.getElementById('shopBackdrop');
  const cartItemsEl = document.getElementById('cartItems');
  const openCartHeader = document.getElementById('openCartHeader');
  const cartCountHeader = document.getElementById('cartCountHeader');
  const clearCartBtn = document.getElementById('clearCart');
  const closeCartBtn = document.getElementById('closeCart');
  const sellCartBtn = document.getElementById('sellCart');

  const invoiceModal = document.getElementById('invoiceModal');
  // inside invoiceModal we will query modal-specific inputs to avoid duplicate-id confusion
  const invoiceForm = document.getElementById('invoiceForm');
  const backToCartBtn = document.getElementById('backToCart');
  const buyRecordBtn = document.getElementById('buyRecord');
  const buyOnlyBtn = document.getElementById('buyOnly');

  // reports
  const reportsRows = document.getElementById('reportsRows');
  const reportsTotalItems = document.getElementById('reportsTotalItems');
  const reportsTotalSales = document.getElementById('reportsTotalSales');
  const reportsExportPdf = document.getElementById('reportsExportPdf');
  const reportsDeleteAll = document.getElementById('reportsDeleteAll');
  const reportsPeriod = document.getElementById('reportsPeriod') || document.getElementById('reportsTimeFilter') || document.getElementById('reportsPeriod');
  const reportsDate = document.getElementById('reportsDate');
  const reportsSearchInput = document.getElementById('reportsSearchInput') || document.getElementById('reportsSearch');

  let editingProductId = null;
  let cart = [];

  /* =========================
     UI: hide nav/settings while on auth
     ========================= */
     function setAuthVisibility(isAuthScreen) {
      // hide nav buttons and settings cog while on login/register
      // support both .navBtn and #storeSettingsBtn / .storeSettingsBtn
      document.querySelectorAll('.navBtn').forEach(el => {
        if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
      });
      // support id and class selectors for settings button(s)
      const settingsEls = Array.from(document.querySelectorAll('#storeSettingsBtn, .storeSettingsBtn'));
      settingsEls.forEach(el => {
        if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
      });
    }
    

  /* =========================
     SETTINGS COG + SETTINGS MODAL (drop-in replacement)
     Creates AppSettings.open() etc.
     ========================= */
  // lightweight ensure button + modal builder
 



  /* =========================
     AUTH (registration/login/logout) - updated to use stable ids
     ========================= */
  function showLoginForm() { registrationForm?.classList.add('hidden'); loginForm?.classList.remove('hidden'); setAuthVisibility(true); }
  function showRegisterForm() { registrationForm?.classList.remove('hidden'); loginForm?.classList.add('hidden'); setAuthVisibility(true); }

  showLoginBtn?.addEventListener('click', showLoginForm);
  showRegisterBtn?.addEventListener('click', showRegisterForm);

  // registration: create stable id, firstTime flag
  registerBtn?.addEventListener('click', () => {
    const name = regName.value.trim();
    const address = regAddress.value.trim();
    const phone = regPhone.value.trim();
    const email = regEmail.value.trim();
    const password = regPassword.value;
    const confirm = regConfirm.value;
    if (!name || !address || !phone || !email || !password || !confirm) { toast('Please fill in all fields.', 'error'); return; }
    if (password !== confirm) { toast('Passwords do not match.', 'error'); return; }
    const users = getUsers() || [];
    if (users.find(u => u && u.name && u.name.toLowerCase() === name.toLowerCase())) { toast('Supermarket name taken.', 'error'); return; }
    if (users.find(u => u && u.email && u.email.toLowerCase() === email.toLowerCase())) { toast('Email already registered.', 'error'); return; }
    const id = ensureId('U');
    const newUser = { id, name, address, phone, email, password, createdAt: Date.now(), firstTime: true };
    users.push(newUser);
    saveUsers(users);
    toast('Registered successfully. Please login.', 'success');
    regName.value = regAddress.value = regPhone.value = regEmail.value = regPassword.value = regConfirm.value = '';
    showLoginForm();
  });

  // login: allow name or email; open settings modal on first time
  loginBtn?.addEventListener('click', () => {
    const nameOrEmail = loginName.value.trim();
    const pwd = loginPassword.value;
    if (!nameOrEmail || !pwd) { toast('Enter supermarket name & password', 'error'); return; }

    const users = getUsers() || [];
    const targetLower = nameOrEmail.toLowerCase();
    // allow login by supermarket name OR email
    const user = users.find(u =>
      u && u.password === pwd && (
        (u.name && u.name.toLowerCase() === targetLower) ||
        (u.email && u.email.toLowerCase() === targetLower)
      )
    );
    if (!user) { toast('Invalid credentials', 'error'); return; }

    setCurrentUser(user);
    toast('Logged in', 'success');

    // if firstTime show settings modal and clear flag
    if (user.firstTime) {
      // clear flag persistently
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        users[idx] = { ...users[idx], firstTime: false };
        saveUsers(users);
      }
      loadDashboard();
      setTimeout(() => {
        if (typeof openSettingsModal === 'function') openSettingsModal();
        window.AppSettings?.createStoreSettingsBtn?.();
      }, 380);
      return;
    }

    loadDashboard();
    setTimeout(() => window.AppSettings?.createStoreSettingsBtn?.(), 200);
  });



  logoutBtn?.addEventListener('click', () => {
    if (!confirm('Are you sure you want to logout?')) return;
  
    try {
      // stop any dashboard live refresh interval (if used)
      if (typeof dashboardLiveInterval !== 'undefined' && dashboardLiveInterval) {
        clearInterval(dashboardLiveInterval);
        dashboardLiveInterval = null;
      }
    } catch (e) { /* ignore */ }
  
    // clear user & UI
    clearCurrentUser?.();
    authSection?.classList.remove('hidden');
    dashboardSection?.classList.add('hidden');
    showLoginForm?.();
    setAuthVisibility?.(true);
  
    // hide settings cog (slight delay to let UI update)
    setTimeout(() => {
      const b = document.querySelector('.storeSettingsBtn');
      if (b) b.style.display = 'none';
    }, 50);
  
    // feedback
    if (typeof toast === 'function') toast('Logged out', 'success');
  });
  


  

  /* =========================
    /* ---------- Dashboard: totals, filtering and charts ---------- */

let dashboardChart = null;
let dashboardLiveInterval = null;

// parse invoice date robustly; invoices may store timestamp or string
function parseInvoiceDate(d) {
  if (d == null) return null;
  if (typeof d === 'number') return new Date(d);
  if (typeof d === 'string') {
    // try ISO / timestamp / custom "YYYY-MM-DD hh:mm"
    const n = Number(d);
    if (isFinite(n)) return new Date(n);
    // replace space between date and time -> T to help Date parse
    const s = d.replace(' ', 'T');
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt;
  }
  return new Date(d);
}

// returns invoices filtered by period
function getInvoicesByPeriod(period = 'lifetime') {
  const user = getCurrentUser();
  if (!user) return [];
  const all = getStoreInvoices(user.name) || [];
  if (!all.length) return [];

  if (period === 'lifetime') return all;

  const now = new Date();
  // start times
  let start = null;
  if (period === 'today' || period === 'live') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
  } else if (period === 'weekly') {
    // last 7 days (including today)
    start = new Date(now);
    start.setDate(now.getDate() - 6); // 7-day window
    start.setHours(0,0,0,0);
  } else if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'yearly') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    // unknown -> lifetime
    return all;
  }

  return all.filter(inv => {
    const dt = parseInvoiceDate(inv.date);
    if (!dt) return false;
    return dt.getTime() >= start.getTime() && dt.getTime() <= now.getTime();
  });
}

// bucket invoices into chart series depending on period
function buildSalesSeries(invoices, period = 'lifetime') {
  // returns { labels: [], data: [] }
  if (!Array.isArray(invoices)) invoices = [];

  const now = new Date();

  if (period === 'lifetime') {
    // simple: monthly totals by year-month (last 12 months)
    const map = new Map();
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      const amt = Number(inv.paid) || 0;
      map.set(key, (map.get(key)||0) + amt);
    });
    // order keys ascending
    const keys = Array.from(map.keys()).sort();
    const labels = keys;
    const data = keys.map(k => map.get(k) || 0);
    return { labels, data };
  }

  if (period === 'today' || period === 'live') {
    // hourly buckets 0..23 for today
    const labels = Array.from({length:24}, (_,i) => `${i}:00`);
    const arr = Array(24).fill(0);
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      const h = dt.getHours();
      arr[h] += Number(inv.paid) || 0;
    });
    return { labels, data: arr };
  }

  if (period === 'weekly') {
    // last 7 days labels
    const days = [];
    const totals = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0,0,0,0);
      days.push(d);
      totals.push(0);
    }
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      // find matching day index
      for (let idx=0; idx<days.length; idx++) {
        const d = days[idx];
        if (dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth() && dt.getDate() === d.getDate()) {
          totals[idx] += Number(inv.paid) || 0;
          break;
        }
      }
    });
    const labels = days.map(d => `${d.getDate()}/${d.getMonth()+1}`);
    return { labels, data: totals };
  }

  if (period === 'monthly') {
    // days in current month
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const labels = Array.from({length: daysInMonth}, (_, i) => String(i+1));
    const totals = Array(daysInMonth).fill(0);
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        totals[dt.getDate()-1] += Number(inv.paid) || 0;
      }
    });
    return { labels, data: totals };
  }

  if (period === 'yearly') {
    // month buckets Jan..Dec
    const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const totals = Array(12).fill(0);
    const year = now.getFullYear();
    invoices.forEach(inv => {
      const dt = parseInvoiceDate(inv.date);
      if (!dt) return;
      if (dt.getFullYear() === year) {
        totals[dt.getMonth()] += Number(inv.paid) || 0;
      }
    });
    return { labels, data: totals };
  }

  // fallback
  return { labels: [], data: [] };
}

function renderSalesChart(series, period = 'lifetime') {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (dashboardChart) {
    try { dashboardChart.destroy(); } catch (e) {}
    dashboardChart = null;
  }

  // normalize series
  series = series || { labels: [], data: [] };
  series.labels = Array.isArray(series.labels) ? series.labels : [];
  series.data = Array.isArray(series.data) ? series.data.map(v => Number(v) || 0) : [];

  // max + empty detection
  const maxData = series.data.length ? Math.max(...series.data) : 0;
  const allZero = maxData === 0;

  // step chooser for non-zero values
  const candidateSteps = [1,5,10,50,100,500,1000,5000,10000,50000,100000,500000,1000000];
  function chooseStepAndMax(val) {
    if (!isFinite(val) || val <= 0) return { step: 1, max: 1 };
    for (let i = 0; i < candidateSteps.length; i++) {
      const step = candidateSteps[i];
      const stepsNeeded = Math.ceil(val / step);
      if (stepsNeeded <= 10) {
        const niceMax = step * Math.ceil(val / step);
        return { step, max: niceMax };
      }
    }
    const pow = Math.pow(10, Math.floor(Math.log10(val)));
    let step = pow;
    while (Math.ceil(val / step) > 10) step *= 10;
    const niceMax = step * Math.ceil(val / step);
    return { step, max: niceMax };
  }

  const { step: autoStep, max: autoMax } = chooseStepAndMax(maxData);
  const stepSize = allZero ? 1 : autoStep;
  const niceMax = allZero ? 1 : autoMax;

  // aspect ratio: compact when empty, flexible otherwise
  const aspectRatio = allZero ? 2.6 : Math.min(4, Math.max(1.2, (series.labels.length || 1) / 6));

  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Paid Sales',
        data: series.data,
        fill: false,
        borderWidth: 1,
        barPercentage: 0.75,
        categoryPercentage: 0.85,
        maxBarThickness: 60,
        backgroundColor: allZero ? 'rgba(15,23,42,0.06)' : undefined
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: aspectRatio,
      scales: {
        y: {
          beginAtZero: true,
          max: niceMax,
          grid: { display: !allZero },
          ticks: {
            stepSize: stepSize,
            callback: function(v) { return fmtMoney(v); }
          }
        },
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(ctx) { return fmtMoney(ctx.parsed.y ?? ctx.parsed); }
          }
        },
        legend: { display: false },
        subtitle: {
          display: allZero,
          text: allZero ? 'No sales in selected period' : '',
          align: 'center',
          font: { size: 12 },
          padding: { bottom: 6 }
        }
      }
    }
  });

  // adjust wrapper height a little when empty to keep UI compact
  try {
    const wrapper = canvas.closest('.chart-canvas-wrap') || canvas.parentElement;
    if (wrapper) wrapper.style.height = allZero ? '180px' : '220px';
  } catch (e) {}
}


/* =========================
   Expenses: storage keys & helpers (time-scoped)
   ========================= */

   const LS_EXPENSES_PREFIX = 'store_expenses_v1_'; // will append store name

   function getExpensesKey(storeName) { return LS_EXPENSES_PREFIX + storeName; }
   
   function getStoreExpenses(storeName) {
     try {
       const arr = JSON.parse(localStorage.getItem(getExpensesKey(storeName)) || '[]');
       return Array.isArray(arr) ? arr : [];
     } catch (e) { return []; }
   }
   function saveStoreExpenses(storeName, arr) {
     localStorage.setItem(getExpensesKey(storeName), JSON.stringify(Array.isArray(arr) ? arr : []));
   }
   
   /* ------ Date helpers ------ */
   
   // reuse parseInvoiceDate (exists in your code) if available, otherwise lightweight parser:
   function parseAnyDate(d) {
     if (d == null) return null;
     if (typeof d === 'number') return new Date(d);
     if (typeof d === 'string') {
       // try numeric string
       const n = Number(d);
       if (isFinite(n)) return new Date(n);
       // try ISO or yyyy-mm-dd
       const s = d.replace(' ', 'T');
       const dt = new Date(s);
       if (!isNaN(dt.getTime())) return dt;
       // fallback
       return new Date(d);
     }
     return new Date(d);
   }
   
   function formatDateForInput(d) {
     const dt = d ? parseAnyDate(d) : new Date();
     const y = dt.getFullYear();
     const m = String(dt.getMonth() + 1).padStart(2, '0');
     const day = String(dt.getDate()).padStart(2, '0');
     return `${y}-${m}-${day}`;
   }
   
   /* -------------------------
      Period filtering for expenses
      ------------------------- */
   
   function getExpensesByPeriod(period = 'lifetime', storeName) {
     const all = getStoreExpenses(storeName) || [];
     if (period === 'lifetime') return all.slice();
   
     const now = new Date();
     let start = null;
     if (period === 'today' || period === 'live') {
       start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
     } else if (period === 'weekly') {
       start = new Date(now);
       start.setDate(now.getDate() - 6); // last 7 days including today
       start.setHours(0,0,0,0);
     } else if (period === 'monthly') {
       start = new Date(now.getFullYear(), now.getMonth(), 1);
     } else if (period === 'yearly') {
       start = new Date(now.getFullYear(), 0, 1);
     } else {
       return all.slice();
     }
   
     const end = now;
     return all.filter(exp => {
       const dt = parseAnyDate(exp.date);
       if (!dt) return false;
       return dt.getTime() >= start.getTime() && dt.getTime() <= end.getTime();
     });
   }
   
   /* -------------------------
      Render + UI wiring
      ------------------------- */
   
   function initExpensesFeature() {
     // top and card buttons both open modal
     const btnTop = document.getElementById('btnManageExpensesTop');
     const btn = document.getElementById('btnManageExpenses');
     const modal = document.getElementById('manageExpensesModal');
     const close = document.getElementById('closeExpensesModal');
     const openAdd = document.getElementById('openAddExpense');
     const showAllBtn = document.getElementById('showAllExpenses');
   
     if (!modal) return;
   
     if (btnTop) btnTop.addEventListener('click', () => openExpensesModal());
     if (btn) btn.addEventListener('click', () => openExpensesModal());
     close.addEventListener('click', () => closeExpensesModal());
     openAdd.addEventListener('click', () => showAddExpenseForm());
     showAllBtn.addEventListener('click', () => showSavedExpenses());
   
     // form controls
     document.getElementById('addExpenseRowBtn').addEventListener('click', () => addExpenseRow());
     document.getElementById('saveExpensesBtn').addEventListener('click', () => saveExpensesFromForm());
     document.getElementById('cancelExpensesBtn').addEventListener('click', () => {
       window.__editingExpenseId = null; // clear editing state if cancelled
       hideElement('expensesFormWrap'); showElement('expensesActions');
     });
   
     document.getElementById('closeSavedExpenses').addEventListener('click', () => {
       hideElement('savedExpensesListWrap'); showElement('expensesActions');
     });
   
     // close on backdrop click
     modal.addEventListener('click', (e) => {
       if (e.target === modal) closeExpensesModal();
     });
   
     // initial render of totals (if any)
     updateExpensesDisplay();
   }
   
   /* UI helpers */
   function showElement(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
   function hideElement(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
   
   /* open/close modal */
   function openExpensesModal() {
     const modal = document.getElementById('manageExpensesModal');
     if (!modal) return;
     modal.classList.remove('hidden');
     // show action buttons by default
     showElement('expensesActions');
     hideElement('expensesFormWrap');
     hideElement('savedExpensesListWrap');
     updateExpensesModalStatus();
   }
   
   function closeExpensesModal() {
     const modal = document.getElementById('manageExpensesModal');
     if (!modal) return;
     modal.classList.add('hidden');
     // clear editing state when modal closes
     window.__editingExpenseId = null;
   }
   
   /* Add Expense form handling */
   function showAddExpenseForm(prefillRows = []) {
     hideElement('expensesActions');
     showElement('expensesFormWrap');
     const rowsWrap = document.getElementById('expenseRows');
     rowsWrap.innerHTML = '';
   
     if (Array.isArray(prefillRows) && prefillRows.length) {
       prefillRows.forEach(r => createExpenseRow(r.name, r.total, r.id || null, r.date || null));
     } else {
       addExpenseRow();
     }
   }
   
   function addExpenseRow(name = '', total = '') {
     const idx = Date.now() + Math.floor(Math.random()*1000);
     createExpenseRow(name, total, idx, formatDateForInput(new Date()));
   }
   
   function createExpenseRow(name = '', total = '', idx = null, dateVal = null) {
     idx = idx || Date.now() + Math.floor(Math.random()*1000);
     const rowsWrap = document.getElementById('expenseRows');
     const row = document.createElement('div');
     // responsive: stack on mobile, grid on sm+
     row.className = 'grid grid-cols-12 gap-2 items-center';
     row.dataset.idx = idx;
   
     const dateValue = dateVal ? formatDateForInput(dateVal) : formatDateForInput(new Date());
   
     row.innerHTML = `
       <input type="text" name="expense_name" placeholder="Expense name" value="${escapeHtml(name)}"
         class="col-span-12 sm:col-span-5 px-2 py-1 border rounded" />
       <input type="number" min="0" step="0.01" name="expense_total" placeholder="Total" value="${escapeHtml(total)}"
         class="col-span-12 sm:col-span-3 px-2 py-1 border rounded" />
       <input type="date" name="expense_date" value="${escapeHtml(dateValue)}"
         class="col-span-12 sm:col-span-3 px-2 py-1 border rounded" />
       <button type="button" class="col-span-12 sm:col-span-1 px-2 py-1 bg-red-500 text-white rounded remove-expense-row">Remove</button>
     `;
     rowsWrap.appendChild(row);
   
     row.querySelector('.remove-expense-row').addEventListener('click', () => row.remove());
   }
   
   /* Save expenses from form */
   /* Handles both append (new) and edit (if window.__editingExpenseId is set) */
   function saveExpensesFromForm() {
     const user = getCurrentUser(); if (!user) return alert('Not logged in');
     const rowsWrap = document.getElementById('expenseRows');
     const rows = Array.from(rowsWrap.children);
     if (!rows.length) { alert('Add at least one expense row'); return; }
   
     const editingId = window.__editingExpenseId || null;
   
     // load existing
     const arr = getStoreExpenses(user.name) || [];
   
     if (editingId) {
       // editing mode - we expect a single row (we prefilled single row on edit)
       const r = rows[0];
       const name = (r.querySelector('input[name="expense_name"]')?.value || '').trim();
       const totRaw = (r.querySelector('input[name="expense_total"]')?.value || '').trim();
       const dateVal = (r.querySelector('input[name="expense_date"]')?.value || '').trim();
       const total = parseFloat(totRaw || '0') || 0;
       if (!name) { alert('Name required'); return; }
   
       const idx = arr.findIndex(x => x.id === editingId);
       if (idx === -1) { alert('Original expense not found (it may have been deleted)'); window.__editingExpenseId = null; return; }
   
       arr[idx].name = name;
       arr[idx].total = total;
       // store date as ISO string (store yyyy-mm-dd as ISO for safe parsing)
       arr[idx].date = (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString());
       saveStoreExpenses(user.name, arr);
   
       // clear editing state
       window.__editingExpenseId = null;
       document.getElementById('expensesStatus').textContent = `Expense updated.`;
     } else {
       // append mode - can save multiple rows
       let added = 0;
       for (const r of rows) {
         const name = (r.querySelector('input[name="expense_name"]')?.value || '').trim();
         const totRaw = (r.querySelector('input[name="expense_total"]')?.value || '').trim();
         const dateVal = (r.querySelector('input[name="expense_date"]')?.value || '').trim();
         const total = parseFloat(totRaw || '0') || 0;
         if (!name) continue; // skip empty name
         arr.push({
           id: Date.now() + Math.floor(Math.random()*1000),
           name,
           total,
           date: (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString())
         });
         added++;
       }
   
       if (!added) { alert('Please fill at least one valid expense (name + total)'); return; }
       saveStoreExpenses(user.name, arr);
       document.getElementById('expensesStatus').textContent = `${added} expense(s) saved.`;
     }
   
     // hide form, show actions
     hideElement('expensesFormWrap'); showElement('expensesActions');
     updateExpensesModalStatus();
     updateExpensesDisplay();
   
     // notify app
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   /* Render saved expenses list (manage) */
   function showSavedExpenses() {
     const user = getCurrentUser(); if (!user) return alert('Not logged in');
     hideElement('expensesFormWrap'); hideElement('expensesActions');
     showElement('savedExpensesListWrap');
   
     const listWrap = document.getElementById('savedExpensesList');
     listWrap.innerHTML = '';
     const arr = getStoreExpenses(user.name);
     if (!arr.length) { listWrap.innerHTML = '<div class="text-sm text-gray-500">No expenses saved.</div>'; return; }
   
     // sort descending by date (newest first)
     arr.sort((a,b) => (parseAnyDate(b.date)?.getTime() || 0) - (parseAnyDate(a.date)?.getTime() || 0));
   
     arr.forEach(exp => {
       const dStr = exp.date ? formatDateForInput(exp.date) : '';
       const row = document.createElement('div');
       row.className = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 border rounded';
       row.innerHTML = `
         <div>
           <div class="font-semibold">${escapeHtml(exp.name)}</div>
           <div class="text-sm text-gray-500">${fmtMoney(exp.total)} • ${escapeHtml(dStr)}</div>
         </div>
         <div class="flex gap-2 mt-2 sm:mt-0">
           <button class="px-2 py-1 bg-yellow-400 rounded edit-expense">Edit</button>
           <button class="px-2 py-1 bg-red-500 text-white rounded delete-expense">Delete</button>
         </div>
       `;
       // edit
       row.querySelector('.edit-expense').addEventListener('click', () => {
         // open form prefilled with this expense as single row for update
         showAddExpenseForm([{ name: exp.name, total: exp.total, id: exp.id, date: exp.date }]);
         // set editing id so save path updates the item instead of appending
         window.__editingExpenseId = exp.id;
       });
       // delete
       row.querySelector('.delete-expense').addEventListener('click', () => {
         if (!confirm('Delete this expense?')) return;
         deleteExpenseById(user.name, exp.id);
         showSavedExpenses(); // refresh list
         updateExpensesDisplay();
         window.dispatchEvent(new Event('dataUpdated'));
       });
   
       listWrap.appendChild(row);
     });
   }
   
   /* delete helper */
   function deleteExpenseById(storeName, id) {
     const arr = getStoreExpenses(storeName).filter(x => x.id !== id);
     saveStoreExpenses(storeName, arr);
   }
   
   /* Update modal status text */
   function updateExpensesModalStatus() {
     const user = getCurrentUser(); if (!user) return;
     const status = document.getElementById('expensesStatus');
     const arr = getStoreExpenses(user.name);
     const total = arr.reduce((s,x)=> s + (Number(x.total)||0), 0);
     status.textContent = `Saved expenses: ${arr.length} • Total (all time): ${fmtMoney(total)}`;
   }
   
 /* Update the dashboard TotalExpenses & TotalProfit cards (period aware) */
function updateExpensesDisplay() {
  const user = getCurrentUser();
  if (!user) return;

  const period = document.getElementById('dashboardPeriod')?.value || 'lifetime';

  // period-scoped expenses (uses the helper you already added)
  const expensesForPeriod = getExpensesByPeriod(period, user.name) || [];
  const totalExpenses = expensesForPeriod.reduce((s, x) => s + (Number(x.total) || 0), 0);

  // compute revenue for the same period (do locally to avoid recursion)
  const invoices = getInvoicesByPeriod(period) || [];
  // invoice total: prefer amount -> total -> fallback paid
  const totalRevenue = invoices.reduce((s, inv) => {
    return s + (Number(inv.amount) || Number(inv.total) || Number(inv.paid) || 0);
  }, 0);

  // update DOM
  const totalEl = document.getElementById('totalExpenses');
  if (totalEl) totalEl.textContent = fmtMoney(totalExpenses);

  const revEl = document.getElementById('totalRevenue');
  if (revEl) revEl.textContent = fmtMoney(totalRevenue);

  const profitEl = document.getElementById('totalProfit');
  if (profitEl) profitEl.textContent = fmtMoney(totalRevenue - totalExpenses);

  // update modal status if open
  updateExpensesModalStatus();
}

   /* helper to escape html inserted values */
   function escapeHtml(str) {
     if (str === null || str === undefined) return '';
     return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#39;');
   }
   
   /* wire init on DOM loaded */
   window.addEventListener('DOMContentLoaded', () => {
     try { initExpensesFeature(); } catch (e) { console.warn('Expenses init failed', e); }
   });
   
   



/* updateDashboardTotals now accepts a period filter */
function updateDashboardTotals(period = document.getElementById('dashboardPeriod')?.value || 'lifetime') {
  const user = getCurrentUser();
  if (!user) return;

  // invoices filtered by period
  const invoices = getInvoicesByPeriod(period);

  // products (no createdAt available in many setups) - show total products (global)
  const products = getStoreProducts(user.name);
  const totalProductsCount = Array.isArray(products) ? products.length : 0;

  // totals
  const totalInvoicesCount = invoices.length;
  const totalSalesPaid = invoices.reduce((s, inv) => s + (Number(inv.paid) || 0), 0);      // paid amounts
  const totalRevenue = invoices.reduce((s, inv) => s + (Number(inv.amount) || Number(inv.total) || 0), 0); // invoice totals

    // compute total expenses for current store and period (expenses are global / lifetime for now)
    const expensesArr = getStoreExpenses(user.name) || [];
    const totalExpenses = expensesArr.reduce((s, e) => s + (Number(e.total) || 0), 0);
  
    // update revenue DOM (unchanged — revenue is invoice sum)
    document.getElementById('totalRevenue') && (document.getElementById('totalRevenue').textContent = fmtMoney(totalRevenue));
  
    // update total expenses card
    document.getElementById('totalExpenses') && (document.getElementById('totalExpenses').textContent = fmtMoney(totalExpenses));
  
    // total profit = revenue - expenses (not lower than negative number allowed)
    const profit = totalRevenue - totalExpenses;
    document.getElementById('totalProfit') && (document.getElementById('totalProfit').textContent = fmtMoney(profit));
  
  // update DOM
  document.getElementById('totalInvoices') && (document.getElementById('totalInvoices').textContent = totalInvoicesCount);
  document.getElementById('totalProducts') && (document.getElementById('totalProducts').textContent = totalProductsCount);
  document.getElementById('totalSales') && (document.getElementById('totalSales').textContent = fmtMoney(totalSalesPaid));

  // chart
  const series = buildSalesSeries(invoices, period);
  renderSalesChart(series, period);
}

/* loadDashboard updated to wire period control & live behavior */
function loadDashboard() {
  const user = getCurrentUser();
  if (!user) return;
  authSection && authSection.classList.add('hidden');
  dashboardSection && dashboardSection.classList.remove('hidden');
  if (storeDisplayDesktop) {
    storeDisplayDesktop.textContent = user.name;
    // applyLanguage(lsGet(LS_APP_LANG, 'en')); // keep existing if used
  }

  // initial render
  const periodSel = document.getElementById('dashboardPeriod');
  const refreshBtn = document.getElementById('dashboardRefresh');

  function applyPeriodChange() {
    const p = periodSel?.value || 'lifetime';
    // clear any existing live interval
    if (dashboardLiveInterval) { 
      clearInterval(dashboardLiveInterval); 
      dashboardLiveInterval = null; 
    }
    updateDashboardTotals(p);      // update chart + invoices
    updateExpensesDisplay();       // update expenses + profit

    // if live, auto-refresh every 5 seconds
    if (p === 'live') {
      dashboardLiveInterval = setInterval(() => {
        updateDashboardTotals('today');
        updateExpensesDisplay();
      }, 5000);
    }
  }

  // wire events
  periodSel?.addEventListener('change', applyPeriodChange);
  refreshBtn?.addEventListener('click', () => applyPeriodChange());

  // when data updates elsewhere, refresh current period
  window.removeEventListener('dataUpdated', updateExpensesDisplay);
  window.removeEventListener('dataUpdated', updateDashboardTotals);
  window.addEventListener('dataUpdated', () => {
    updateDashboardTotals(periodSel?.value || 'lifetime');
    updateExpensesDisplay();
  });

  // initial apply
  applyPeriodChange();

  showSection && showSection('dashboardContent');
  setAuthVisibility && setAuthVisibility(false);

  // ensure settings cog exists and is visible
  try { window.AppSettings.createStoreSettingsBtn(); } catch (e) {}
}



 

// update when page script loads
window.addEventListener('DOMContentLoaded', () => {
  // create chart placeholder if Chart not loaded yet; chart creation will check Chart availability
  const canvas = document.getElementById('salesChart');
  if (canvas && typeof Chart === 'undefined') {
    // optionally load Chart.js if not available (do not auto-insert external scripts here to keep things offline)
    console.warn('Chart.js not found — include Chart.js library for charts to render.');
  }
});


//translation:

(function(){
  const LS_KEY = 'preferredLang';

  const translations = {
    en: {
      // Auth
      registrationTitle: "Supermarket Registration",
      regName: "Supermarket Name",
      regAddress: "Address",
      regPhone: "Phone",
      regEmail: "Email",
      regPassword: "Password",
      regConfirm: "Confirm Password",
      registerBtn: "Register",
      loginHere: "Login here",
      loginTitle: "Supermarket Login",
      loginBtn: "Login",
      registerHere: "Register here",
      logoutBtn: "Logout",

      // Dashboard / general
      viewLabel: "View:",
      dashboardPeriod: ["Lifetime","Today","Last 7 days","This month","This year","Live (auto)"],
      refresh: "Refresh",
      recycleBinTitle: "Recycle Bin",

      totalInvoices: "Total Invoices",
      totalProducts: "Total Products",
      productsNote: "Products are global (no created date)",
      totalSalesPaid: "Total Sales (Paid)",
      totalRevenue: "Total Revenue",
      revenueNote: "Sum of invoice totals (amount)",
      totalProfit: "Total Profit",
      profitNote: "Revenue minus expenses",
      totalExpenses: "Total Expenses",
      expensesNote: "Total of saved expenses",

      salesChart: "Sales chart",
      basedOnPeriod: "Based on selected period",

      // Invoices
      createInvoice: "+ Create Invoice",
      createInvoiceTitle: "Create Invoice",
      customerNameLabel: "Customer Name",
      customerPhoneLabel: "Customer Phone",
      invoiceDateLabel: "Invoice Date",
      customerNamePH: "e.g. Zakariye Salah",
      customerPhonePH: "e.g. 617125558",
      addItem: "+ Add Item",
      totalAmountLabel: "Total Amount",
      amountPaidLabel: "Amount Paid",
      statusLabel: "Status",
      statusOptions: { unpaid: "Unpaid", paid: "Paid" },
      saveInvoice: "Save Invoice",
      invoicesTitle: "Invoices",
      clearPaid: "Clear Paid",
      filterAll: "All",
      filterPaid: "Paid",
      filterUnpaid: "Unpaid",
      searchByNamePH: "Search by name...",
      reminderWA: "WhatsApp",
      reminderSMS: "SMS",
      sendAllReminders: "Send All Reminders",
      noInvoicesYet: "No invoices yet.",

      // Products
      searchProductsPH: "Search products...",
      addProductBtn: "",
      shoppingCartTitle: "Shopping Cart",
      cancelAll: "Cancel All",
      cancel: "Cancel",
      sellBtn: "Sell",
      invoiceModalTitle: "Invoice",
      backBtn: "Back",
      buyRecord: "Buy & Record Invoice",
      buyOnly: "Buy Only",
      emptyProductsTitle: "No products yet",
      emptyProductsDesc: 'Click "Add Product" to create your first one.',
      thName: "Product",
      thCost: "Original Price",
      thPrice: "Price",
      thQty: "Qty",
      thActions: "Actions",
      lblName: "Product Name *",
      lblCost: "Original Price",
      lblPrice: "Price *",
      lblQty: "Quantity *",
      saveProductBtn: "Save Product",
      productNamePH: "e.g. Rice 25kg",
      productCostPH: "0.00",
      productPricePH: "0.00",
      productQtyPH: "0",

      // Reports
      reportsTitle: "Reports",
      reportsSub: "Centralized sales records — live & exportable",
      reportsFilterLabel: "Filter:",
      reportsPeriod: ["All time","Daily","Weekly (7 days)","Monthly","Yearly"],
      reportsDateLabel: "Date:",
      reportsSearchPH: "Product or customer...",
      totalItemsLabel: "Total Items:",
      totalSalesLabel: "Total Sales:",
      reportsTable: {
        no: "#", products: "Products", qty: "Qty", total: "Total",
        paid: "Paid", due: "Due", status: "Status", customer: "Customer",
        phone: "Phone", timestamp: "Timestamp", actions: "Actions"
      },
      reportsEmpty: "No reports to show.",
      confirmDeleteReportsTitle: "Delete all reports?",
      confirmDeleteReportsText: "This will permanently remove all report records for this store.",
      confirmCancel: "Cancel",
      confirmDeleteAll: "Delete All",

      // Recycle bin
      recycleTitle: "Recycle Bin",
      restoreAll: "Restore All",
      rbDeleteAll: "Delete All",
      rbClose: "Close",
      rbInvoices: "Invoices",
      rbProducts: "Products",
      rbReports: "Reports",

      // Footer & bottom nav
      footerCopy: "All rights reserved.",
      navDashboard: "Dashboard",
      navInvoices: "Invoices",
      navProducts: "Products",
      navReports: "Reports"
    },

    so: {
      // Auth
      registrationTitle: "Diiwaangelinta Suuqa",
      regName: "Magaca Suuqa",
      regAddress: "Cinwaanka",
      regPhone: "Telefoon",
      regEmail: "Iimayl",
      regPassword: "Furaha",
      regConfirm: "Xaqiiji Furaha",
      registerBtn: "Diiwaangeli",
      loginHere: "Halkan Gali",
      loginTitle: "Geli Dukaan",
      loginBtn: "Gali",
      registerHere: "Diiwaangeli halkan",
      logoutBtn: "Ka Bax",

      // Dashboard / general
      viewLabel: "Fiiri:",
      refresh: "Cusboonaysii",
      recycleBinTitle: "Qashinka Dib-u-celinta",

      totalInvoices: "Wadarta Rasiidada",
      totalProducts: "Wadarta Alaabta",
      productsNote: "Alaabtu guud ayay tahay (ma jiro taariikh abuuris)",
      totalSalesPaid: "Wadarta Iib (La Bixiyay)",
      totalRevenue: "Wadarta Dakhliga",
      revenueNote: "Wadarta qiimaha rasiidyada (lacagta)",
      totalProfit: "Wadarta Faa'iido",
      profitNote: "Dakhliga ka jar kharashyada",
      totalExpenses: "Wadarta Kharashyada",
      expensesNote: "Wadarta kharashyada la keydiyey",

      expenseNamePH: "Magaca Kharashka",
      expenseAmountPH: "Qadarka",
      expenseCategoryDefault: "Qaybta",
      expenseCategories: ["Adeegyo","Kiro","Agabka","Mushahar"],
      addMore: "Kudar Inta Kale",
      closeBtn: "Xidh",

      salesChart: "Jaantuska Iibka",
      basedOnPeriod: "Iyada oo ku salaysan mudada la dooray",

      // Invoices
      createInvoice: "Abuur Rasiid",
      createInvoiceTitle: "Abuur Rasiid",
      customerNameLabel: "Magaca Macmiilka",
      customerPhoneLabel: "Telefoonka Macmiilka",
      invoiceDateLabel: "Taariikhda Rasiidka",
      customerNamePH: "tusaale: Zakariye Salah",
      customerPhonePH: "tusaale: 617125558",
      addItem: "Kudar Shay",
      totalAmountLabel: "Wadarta Lacagta",
      amountPaidLabel: "Lacagta La Bixiyay",
      statusLabel: "Xaaladda",
      statusOptions: { unpaid: "Lacag la'aan", paid: "La Bixiyay" },
      saveInvoice: "Keydi Rasiidka",
      invoicesTitle: "Rasiidada",
      clearPaid: "Nadiifi Bixiyaasha",
      filterAll: "Dhammaan",
      filterPaid: "La Bixiyay",
      filterUnpaid: "Lacag La'aan",
      searchByNamePH: "Ka raadi magaca...",
      reminderWA: "WhatsApp",
      reminderSMS: "SMS",
      sendAllReminders: "Dir Digniinaha oo dhan",
      noInvoicesYet: "Weli ma jiraan rasiidyo.",

      // Products
      searchProductsPH: "Raadi alaabta...",
      addProductBtn: " Kudar Alaab",
      shoppingCartTitle: "Gaadhiga Iibka",
      cancelAll: "Bixi Dhammaan",
      cancel: "Bax",
      sellBtn: "Iibso",
      invoiceModalTitle: "Rasiid",
      backBtn: "Dib u noqo",
      buyRecord: "Iibso & Diiwaangeli Rasiidka",
      buyOnly: "Iibso Kaliya",
      emptyProductsTitle: "Weli ma jiraan alaabo",
      emptyProductsDesc: 'Guji "Kudar Alaab" si aad u abuurto kii ugu horreeyay.',
      thName: "Alaabta",
      thCost: "Qiimaha Asalka",
      thPrice: "Qiimaha",
      thQty: "Tirada",
      thActions: "Ficillo",
      productModalTitle: "Kudar Alaab",
      lblName: "Magaca Alaabta *",
      lblCost: "Qiimaha Asalka",
      lblPrice: "Qiimo *",
      lblQty: "Tirada *",
      saveProductBtn: "Keydi Alaabta",
      productNamePH: "tusaale: Bariis 25kg",
      productCostPH: "0.00",
      productPricePH: "0.00",
      productQtyPH: "0",

      // Reports
      reportsTitle: "Warbixinno",
      reportsSub: "Diiwaanka iibka oo dhexe — nool & la dhoofin karo",
   
      reportsFilterLabel: "Sifee:",
      reportsPeriod: ["Waqtiga oo dhan","Maalinle","Toddobaadle (7 maalmood)","Bishii","Sannadle"],
      reportsDateLabel: "Taariikh:",
      reportsSearchPH: "Alaab ama macmiil...",
      totalItemsLabel: "Wadar Shay:",
      totalSalesLabel: "Wadar Iib:",
      reportsTable: {
        no: "#", products: "Alaabooyinka", qty: "Tirada", total: "Wadar",
        paid: "La bixiyay", due: "Lacag la bixin", status: "Xaalad", customer: "Macmiil",
        phone: "Telefoon", timestamp: "Waqtiga", actions: "Ficillo"
      },
      reportsEmpty: "Warbixin ma jiro.",
      confirmDeleteReportsTitle: "Miyaad rabtaa inaad tirtirto dhammaan warbixinada?",
      confirmDeleteReportsText: "Tani waxay si joogto ah u tirtiri doontaa dhammaan rikoorrada warbixinta ee dukaankan.",
      confirmCancel: "Bax",
      confirmDeleteAll: "Tirtir Dhammaan",

      // Recycle bin
      recycleTitle: "Qashinka Dib-u-celinta",
      restoreAll: "Soo Celin Dhammaan",
      rbDeleteAll: "Tirtir Dhammaan",
      rbClose: "Xidh",
      rbInvoices: "Rasiidada",
      rbProducts: "Alaabooyinka",
      rbReports: "Warbixinada",

      // Footer & bottom nav
      footerCopy: "Dhammaan xuquuqdu way kaydsan tahay.",
      navDashboard: "Guddiga",
      navInvoices: "Rasiidada",
      navProducts: "Alaabooyinka",
      navReports: "Warbixinada"
    }
  };

  // mapping DOM selectors -> translation keys and where to set
  const mapping = [
    // AUTH
    { sel: '#registrationForm h1', prop: 'text', key: 'registrationTitle' },
    { sel: '#regName', prop: 'placeholder', key: 'regName' },
    { sel: '#regAddress', prop: 'placeholder', key: 'regAddress' },
    { sel: '#regPhone', prop: 'placeholder', key: 'regPhone' },
    { sel: '#regEmail', prop: 'placeholder', key: 'regEmail' },
    { sel: '#regPassword', prop: 'placeholder', key: 'regPassword' },
    { sel: '#regConfirm', prop: 'placeholder', key: 'regConfirm' },
    { sel: '#registerBtn', prop: 'text', key: 'registerBtn' },
    { sel: '#registrationForm p .text-blue-600', prop: 'text', key: 'loginHere' },

    { sel: '#loginForm h1', prop: 'text', key: 'loginTitle' },
    { sel: '#loginName', prop: 'placeholder', key: 'regName' },
    { sel: '#loginPassword', prop: 'placeholder', key: 'regPassword' },
    { sel: '#loginBtn', prop: 'text', key: 'loginBtn' },
    { sel: '#loginForm p .text-blue-600', prop: 'text', key: 'registerHere' },

    // top header / settings / logout
    { sel: '#logoutBtn', prop: 'text', key: 'logoutBtn' },
    { sel: '#btnRecycleBinTop', prop: 'title', key: 'recycleBinTitle' },

    // dashboard controls
    { sel: 'label[data-i18n="viewLabel"], label.text-sm.text-gray-600', prop: 'textExact', key: 'viewLabel' },

    // Use data-i18n on the headings and notes (we annotate them on DOM ready)
    { sel: '[data-i18n="totalInvoices"]', prop: 'text', key: 'totalInvoices' },
    { sel: '[data-i18n="totalProducts"]', prop: 'text', key: 'totalProducts' },
    { sel: '[data-i18n="totalSalesPaid"]', prop: 'text', key: 'totalSalesPaid' },
    { sel: '[data-i18n="totalRevenue"]', prop: 'text', key: 'totalRevenue' },
    { sel: '[data-i18n="totalProfit"]', prop: 'text', key: 'totalProfit' },
    { sel: '[data-i18n="totalExpenses"]', prop: 'text', key: 'totalExpenses' },

    { sel: '[data-i18n="productsNote"]', prop: 'text', key: 'productsNote' },
    { sel: '[data-i18n="revenueNote"]', prop: 'text', key: 'revenueNote' },
    { sel: '[data-i18n="profitNote"]', prop: 'text', key: 'profitNote' },
    { sel: '[data-i18n="expensesNote"]', prop: 'text', key: 'expensesNote' },

    { sel: '[data-i18n="salesChart"]', prop: 'text', key: 'salesChart' },

    // manage expenses
    { sel: '#manageExpensesModal h4', prop: 'text', key: 'manageExpensesTitle' },
    { sel: '#openAddExpense', prop: 'text', key: 'addExpense' },
    { sel: '#showAllExpenses', prop: 'text', key: 'manageSaved' },
    { sel: '#expensesFormWrap input[type="text"]', prop: 'placeholder', key: 'expenseNamePH' },
    { sel: '#expensesFormWrap input[type="number"]', prop: 'placeholder', key: 'expenseAmountPH' },
    { sel: '#expensesFormWrap select option:first-child', prop: 'text', key: 'expenseCategoryDefault' },
    { sel: '#expensesFormWrap select option[value="utilities"]', prop: 'text', key: 'expenseCategories.0' },
    { sel: '#expensesFormWrap select option[value="rent"]', prop: 'text', key: 'expenseCategories.1' },
    { sel: '#expensesFormWrap select option[value="supplies"]', prop: 'text', key: 'expenseCategories.2' },
    { sel: '#expensesFormWrap select option[value="salary"]', prop: 'text', key: 'expenseCategories.3' },
    { sel: '#addExpenseRowBtn', prop: 'text', key: 'addMore' },
    { sel: '#saveExpensesBtn', prop: 'text', key: 'saveBtn' },
    { sel: '#cancelExpensesBtn', prop: 'text', key: 'cancelBtn' },
    { sel: '#closeSavedExpenses', prop: 'text', key: 'closeBtn' },

    // invoices UI
    { sel: '#createInvoiceBtn', prop: 'text', key: 'createInvoice' },
    { sel: '#createInvoiceSection h2', prop: 'text', key: 'createInvoiceTitle' },
    { sel: '#customerName', prop: 'placeholder', key: 'customerNamePH' },
    { sel: '#customerPhone', prop: 'placeholder', key: 'customerPhonePH' },
    { sel: '#addItemBtn', prop: 'text', key: 'addItem' },
    { sel: '#amount', prop: 'placeholder', key: 'totalAmountLabel' },
    { sel: '#paid', prop: 'placeholder', key: 'amountPaidLabel' },
    { sel: '#saveInvoiceBtn', prop: 'text', key: 'saveInvoice' },
    { sel: '#invoicesTitle', prop: 'text', key: 'invoicesTitle' },
    { sel: '#clearPaidBtn', prop: 'text', key: 'clearPaid' },
    { sel: '#filterStatus option[value="all"]', prop: 'text', key: 'filterAll' },
    { sel: '#filterStatus option[value="paid"]', prop: 'text', key: 'filterPaid' },
    { sel: '#filterStatus option[value="unpaid"]', prop: 'text', key: 'filterUnpaid' },
    { sel: '#searchName', prop: 'placeholder', key: 'searchByNamePH' },
    { sel: '#reminderMethod option[value="wa"]', prop: 'text', key: 'reminderWA' },
    { sel: '#reminderMethod option[value="sms"]', prop: 'text', key: 'reminderSMS' },
    { sel: '#sendAllReminders', prop: 'text', key: 'sendAllReminders' },
    { sel: '#emptyState', prop: 'text', key: 'noInvoicesYet' },

    // invoices table headers mapping left intact
    { sel: 'thead tr th', prop: 'textByOrderGeneric', key: ['reportsTable.no','tableInvoice','tableDate','tableCustomer','tablePhone','tableAmount','tablePaid','tableBalance','tableStatus','tableActions'] },

    // products section
    { sel: '#searchInput', prop: 'placeholder', key: 'searchProductsPH' },
    { sel: '#addProductBtn', prop: 'text', key: 'addProductBtn' },
    { sel: '#openCartHeader', prop: 'title', key: 'shoppingCartTitle' },
    { sel: '#clearCart', prop: 'text', key: 'cancelAll' },
    { sel: '#closeCart', prop: 'text', key: 'cancel' },
    { sel: '#sellCart', prop: 'text', key: 'sellBtn' },

    // empty products
    { sel: '#emptyTitle', prop: 'text', key: 'emptyProductsTitle' },
    { sel: '#emptyDesc', prop: 'text', key: 'emptyProductsDesc' },
    { sel: '#emptyAddBtn', prop: 'text', key: 'addProductBtn' },

    // product table headers
    { sel: '#thName', prop: 'text', key: 'thName' },
    { sel: '#thCost', prop: 'text', key: 'thCost' },
    { sel: '#thPrice', prop: 'text', key: 'thPrice' },
    { sel: '#thQty', prop: 'text', key: 'thQty' },
    { sel: '#thActions', prop: 'text', key: 'thActions' },

    // product modal
    { sel: '#modalTitle', prop: 'text', key: 'productModalTitle' },
    { sel: '#lblName', prop: 'text', key: 'lblName' },
    { sel: '#productName', prop: 'placeholder', key: 'productNamePH' },
    { sel: '#lblCost', prop: 'text', key: 'lblCost' },
    { sel: '#productCost', prop: 'placeholder', key: 'productCostPH' },
    { sel: '#lblPrice', prop: 'text', key: 'lblPrice' },
    { sel: '#productPrice', prop: 'placeholder', key: 'productPricePH' },
    { sel: '#lblQty', prop: 'text', key: 'lblQty' },
    { sel: '#productQty', prop: 'placeholder', key: 'productQtyPH' },
    { sel: '#cancelModal', prop: 'text', key: 'cancelBtn' },
    { sel: '#saveProductBtn', prop: 'text', key: 'saveProductBtn' },

    // reports
    { sel: '#reportsSection h1', prop: 'text', key: 'reportsTitle' },
    { sel: '#reportsSection p.text-sm', prop: 'text', key: 'reportsSub' },
    { sel: '#reportsExportPdf', prop: 'text', key: 'exportPdf' },
    { sel: '#reportsDeleteAll', prop: 'text', key: 'deleteAllReports' },
    { sel: '#reportsPeriod', prop: 'options', key: 'reportsPeriod' },
    { sel: '#reportsSearchInput', prop: 'placeholder', key: 'reportsSearchPH' },
    { sel: '#reportsTotalItems', prop: 'text', key: 'totalItemsLabel' },
    { sel: '#reportsTotalSales', prop: 'text', key: 'totalSalesLabel' },
    { sel: '#reportsEmptyMsg', prop: 'text', key: 'reportsEmpty' },

    // reports confirm modal
    { sel: '#reportsConfirmDeleteAll h3', prop: 'text', key: 'confirmDeleteReportsTitle' },
    { sel: '#reportsConfirmDeleteAll p', prop: 'text', key: 'confirmDeleteReportsText' },
    { sel: '#reportsCancelDeleteAll', prop: 'text', key: 'confirmCancel' },
    { sel: '#reportsConfirmDeleteAllBtn', prop: 'text', key: 'confirmDeleteAll' },

    // recycle modal
    { sel: '#recycleBinModal h4', prop: 'text', key: 'recycleTitle' },
    { sel: '#rbRestoreAll', prop: 'text', key: 'restoreAll' },
    { sel: '#rbDeleteAll', prop: 'text', key: 'rbDeleteAll' },
    { sel: '#closeRecycleBin', prop: 'text', key: 'rbClose' },
    { sel: '#rbInvoicesWrap h5', prop: 'text', key: 'rbInvoices' },
    { sel: '#rbProductsWrap h5', prop: 'text', key: 'rbProducts' },
    { sel: '#rbReportsWrap h5', prop: 'text', key: 'rbReports' },

    // footer
    { sel: 'footer .text-sm', prop: 'html', key: 'footerHtml' },

    // bottom nav
    { sel: 'nav#bottomNav button.navBtn:nth-child(1) span', prop: 'text', key: 'navDashboard' },
    { sel: 'nav#bottomNav button.navBtn:nth-child(2) span', prop: 'text', key: 'navInvoices' },
    { sel: 'nav#bottomNav button.navBtn:nth-child(3) span', prop: 'text', key: 'navProducts' },
    { sel: 'nav#bottomNav button.navBtn:nth-child(4) span', prop: 'text', key: 'navReports' }
  ];

  // --- helpers ---
  function getKey(obj, path){
    if (!path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts){
      if (cur === undefined || cur === null) return undefined;
      if (/^\d+$/.test(p)) cur = cur[Number(p)];
      else cur = cur[p];
    }
    return cur;
  }

  // Safe setter for text that preserves child elements (icons/buttons/event listeners).
  // If the target element already contains a dedicated child with attribute data-i18n-text we update it.
  // Otherwise we create a small <span data-i18n-text> and place it after any icon children, leaving other children intact.
  function setTextSafely(node, value){
    if (!node) return;
    // don't try to set text on non-text controls
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'canvas') {
      // these should be set via placeholder/value elsewhere, skip
      return;
    }

    // if element has an explicit child to hold i18n text, prefer that
    const existingHolder = node.querySelector && node.querySelector('[data-i18n-text]');
    if (existingHolder) {
      existingHolder.textContent = value;
      return;
    }

    // if element has no child elements, safe to set textContent
    if (!node.childElementCount) {
      node.textContent = value;
      return;
    }

    // Otherwise preserve existing child elements (icons etc.).
    // Find any text nodes that are direct children and remove them into a single span holder
    // so we can update text without destroying child elements/listeners.
    let holder = null;
    // first try to find a direct child span.i18n-text by class
    const byClass = Array.from(node.children).find(c => c.classList && c.classList.contains('i18n-text'));
    if (byClass) holder = byClass;

    if (!holder) {
      // create holder
      holder = document.createElement('span');
      holder.setAttribute('data-i18n-text','true');
      holder.className = 'i18n-text';
      // place holder after any <i> or svg icon children, but before interactive grandchildren that are purely structural.
      // heuristic: append as last child
      node.appendChild(holder);
    }

    holder.textContent = value;
  }

  function setProp(node, prop, value){
    if (!node) return;
    try {
      if (prop === 'text') setTextSafely(node, value);
      else if (prop === 'html') node.innerHTML = value;
      else if (prop === 'placeholder') {
        if ('placeholder' in node) node.placeholder = value;
      }
      else if (prop === 'title') node.title = value;
      else if (prop === 'value') node.value = value;
    } catch(e){ console.error('setProp error', e); }
  }

    // replace old applyOptions with this improved version
    function applyOptions(selectNode, arr, optsValues) {
      if (!selectNode) return;
      // preserve previous selected index (so switching language doesn't unexpectedly change selected option)
      const prevIndex = (typeof selectNode.selectedIndex === 'number') ? selectNode.selectedIndex : 0;
      selectNode.innerHTML = '';
      arr.forEach((label, i) => {
        const o = document.createElement('option');
        // if optsValues provided use that as the option value (canonical keys), otherwise use label (fallback)
        o.value = (optsValues && typeof optsValues[i] !== 'undefined') ? optsValues[i] : label;
        o.textContent = label;
        selectNode.appendChild(o);
      });
      // restore selection by index (clamped)
      selectNode.selectedIndex = Math.max(0, Math.min(prevIndex, selectNode.options.length - 1));
    }
  



  // Annotate fragile elements with data-i18n (BUT: annotate headings/labels, NOT numeric amounts)
  // Improvements:
  // - Chart annotation finds the canvas by id (#salesChart) and annotates nearby header/subtitle only.
  // - We won't query broad selectors that might pick the canvas or chart internals.
  function annotateKeyElements() {
    try {
      // Annotate dashboard card headings (h3 inside each card in the grid)
      const cardKeys = ['totalInvoices','totalProducts','totalSalesPaid','totalRevenue','totalProfit','totalExpenses'];
      const cardContainers = Array.from(document.querySelectorAll('#dashboardContent .grid > div'));
      cardContainers.forEach((cardEl, idx) => {
        const h3 = cardEl.querySelector('h3.text-lg, h3');
        if (h3 && cardKeys[idx]) {
          h3.setAttribute('data-i18n', cardKeys[idx]);
        }
        const noteEl = cardEl.querySelector('.text-xs');
        if (noteEl) {
          // map note keys sensibly by card index: products (1), revenue (3), profit (4), expenses (5)
          if (idx === 1) noteEl.setAttribute('data-i18n','productsNote');
          else if (idx === 3) noteEl.setAttribute('data-i18n','revenueNote');
          else if (idx === 4) noteEl.setAttribute('data-i18n','profitNote');
          else if (idx === 5) noteEl.setAttribute('data-i18n','expensesNote');
          else {
            // fallback: annotate if not yet annotated
            if (!document.querySelector('[data-i18n="productsNote"]')) noteEl.setAttribute('data-i18n','productsNote');
            else if (!document.querySelector('[data-i18n="revenueNote"]')) noteEl.setAttribute('data-i18n','revenueNote');
            else if (!document.querySelector('[data-i18n="profitNote"]')) noteEl.setAttribute('data-i18n','profitNote');
            else if (!document.querySelector('[data-i18n="expensesNote"]')) noteEl.setAttribute('data-i18n','expensesNote');
          }
        }
      });

      // Chart heading & subtitle: locate by canvas id to avoid selecting chart internals
      const canvas = document.getElementById('salesChart');
      if (canvas) {
        // walk up to the card that contains the canvas
        let candidate = canvas.closest('.mt-6') || canvas.parentElement;
        if (candidate) {
          // find the heading in that card (an h3) and the small subtitle
          const h3 = candidate.querySelector('h3.text-lg.font-semibold, h3.text-lg, h3');
          if (h3) h3.setAttribute('data-i18n','salesChart');
          const subtitle = candidate.querySelector('.text-sm');
          if (subtitle) subtitle.setAttribute('data-i18n','basedOnPeriod');
        }
      } else {
        // fallback: try previous selector but don't touch canvas itself
        const chartCard = document.querySelector('#dashboardContent .mt-6.bg-white, #dashboardContent .mt-6');
        if (chartCard) {
          const h3 = chartCard.querySelector('h3.text-lg.font-semibold, h3.text-lg, h3');
          if (h3) h3.setAttribute('data-i18n','salesChart');
          const smallText = chartCard.querySelector('.text-sm');
          if (smallText) smallText.setAttribute('data-i18n','basedOnPeriod');
        }
      }

      // Also ensure "View:" label gets a data-i18n attr if present
      const viewLabel = document.querySelector('label.text-sm.text-gray-600');
      if (viewLabel && !viewLabel.hasAttribute('data-i18n')) viewLabel.setAttribute('data-i18n','viewLabel');

    } catch(e) {
      console.warn('annotateKeyElements failed', e);
    }
  }

  // Apply translations using safe setter
  function applyTranslations(lang) {
    const dict = translations[lang] || translations.en;

    annotateKeyElements();

    mapping.forEach(item => {
      try {
        const nodes = Array.from(document.querySelectorAll(item.sel));
        if (!nodes.length) return;
        if (item.prop === 'text') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes.forEach(n => setProp(n, 'text', v));
        } else if (item.prop === 'html') {
          if (item.key === 'footerHtml') {
            const copy = dict.footerCopy || '';
            nodes.forEach(n => {
              const name = '<span class="font-semibold">Zakariye</span>';
              n.innerHTML = `&copy; 2025 ${name}. ${copy}`;
            });
          } else {
            const v = getKey(dict, item.key);
            if (v !== undefined) nodes.forEach(n => setProp(n, 'html', v));
          }
        } else if (item.prop === 'placeholder') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes.forEach(n => setProp(n, 'placeholder', v));
        } else if (item.prop === 'title') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes.forEach(n => setProp(n, 'title', v));
        } else if (item.prop === 'options') {
          const arr = getKey(dict, item.key) || [];
          // Special-case reportsPeriod: keep canonical option values for filtering logic
          if (item.key === 'reportsPeriod') {
            // canonical keys your filtering expects
            const canonical = ['lifetime','daily','weekly','monthly','yearly'];
            nodes.forEach(n => applyOptions(n, arr, canonical));
          } else {
            nodes.forEach(n => applyOptions(n, arr));
          }
        }
 else if (item.prop === 'textByIndex') {
          const arr = item.key;
          nodes.forEach((n, idx) => {
            const entry = arr[idx];
            if (!entry) return;
            const v = getKey(dict, entry.key);
            if (v !== undefined) setProp(n, 'text', v);
          });
        } else if (item.prop === 'textByOrder') {
          const list = item.key || [];
          list.forEach((entry, i) => {
            const el = nodes[i];
            if (!el) return;
            const v = getKey(dict, entry.key);
            if (v !== undefined) setProp(el, 'text', v);
          });
        } else if (item.prop === 'textByOrderGeneric') {
          const keys = item.key || [];
          nodes.forEach((n, i) => {
            const k = keys[i];
            if (!k) return;
            let v = getKey(dict, k);
            if (v === undefined) v = dict[k];
            if (v !== undefined) setProp(n, 'text', v);
          });
        } else if (item.prop === 'textExact') {
          const v = getKey(dict, item.key);
          if (v !== undefined) nodes[0] && setProp(nodes[0], 'text', v);
        }
      } catch (e) {
        console.error('i18n mapping error', e, item);
      }
    });

    // status select options
    const statusSel = document.getElementById('status');
    if (statusSel) {
      const st = getKey(dict, 'statusOptions') || {};
      Array.from(statusSel.options).forEach(opt => {
        if (opt.value && st[opt.value]) opt.textContent = st[opt.value];
        else {
          const maybe = getKey(dict, `statusOptions.${opt.value}`);
          if (maybe) opt.textContent = maybe;
        }
      });
    }

    // reports table headers (if present)
    const reportsThead = document.querySelectorAll('#reportsTable thead th');
    if (reportsThead && reportsThead.length) {
      const rt = dict.reportsTable || {};
      const keys = ['no','products','qty','total','paid','due','status','customer','phone','timestamp','actions'];
      reportsThead.forEach((th, i) => {
        const k = keys[i];
        if (rt && rt[k]) th.textContent = rt[k];
      });
    }

    // bottom nav explicit
    const navMap = {
      'nav#bottomNav button.navBtn:nth-child(1) span': dict.navDashboard,
      'nav#bottomNav button.navBtn:nth-child(2) span': dict.navInvoices,
      'nav#bottomNav button.navBtn:nth-child(3) span': dict.navProducts,
      'nav#bottomNav button.navBtn:nth-child(4) span': dict.navReports
    };
    Object.entries(navMap).forEach(([sel, txt])=>{
      const el = document.querySelector(sel);
      if (el && txt) el.textContent = txt;
    });

    if (lang) localStorage.setItem(LS_KEY, lang);
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{
    const saved = localStorage.getItem(LS_KEY) || 'so';
    // Annotate once early (but apply translations after annotation)
    annotateKeyElements();
    applyTranslations(saved);

    // Expose helpers
    window.applyTranslations = applyTranslations;
    window.annotateI18nKeys = annotateKeyElements;
  });

  // Convenience setter
  window.setAppLanguage = function(lang){
    if (!lang) return;
    applyTranslations(lang);
  };

})();



/* =========================
   Recycle Bin (Trash) feature
   - Soft-delete items to per-store trash
   - Restore / Permanent delete / Purge older than 60 days
   ========================= */

   const LS_TRASH_PREFIX = 'store_trash_v1_'; // per-store key
   const TRASH_RETENTION_DAYS = 60;
   
   function getTrashKey(storeName) { return LS_TRASH_PREFIX + storeName; }
   
   function getStoreTrash(storeName) {
     try {
       const arr = JSON.parse(localStorage.getItem(getTrashKey(storeName)) || '[]');
       return Array.isArray(arr) ? arr : [];
     } catch (e) { return []; }
   }
   function saveStoreTrash(storeName, arr) {
     localStorage.setItem(getTrashKey(storeName), JSON.stringify(Array.isArray(arr) ? arr : []));
   }
   
   // move an item into trash. `type` = 'product' | 'invoice' | 'report' (free-form allowed)
   function moveToTrash(storeName, type, payload) {
     const trash = getStoreTrash(storeName);
     const id = payload?.id || (`trash_${Date.now()}_${Math.floor(Math.random()*1000)}`);
     const item = {
       id,                 // unique id (original id if present)
       type,
       payload,
       deletedAt: new Date().toISOString()
     };
     trash.push(item);
     saveStoreTrash(storeName, trash);
     // remove from original storage (best-effort)
     try {
       if (type === 'product' && typeof deleteProductById === 'function') {
         deleteProductById(storeName, payload.id);
       } else if (type === 'invoice' && typeof deleteInvoiceById === 'function') {
         deleteInvoiceById(storeName, payload.id);
       } else if (type === 'report' && typeof deleteReportById === 'function') {
         deleteReportById(storeName, payload.id);
       } else {
         // generic removal fallback: try common store functions
         tryRemoveOriginal(storeName, type, payload);
       }
     } catch(e) { console.warn('moveToTrash remove original error', e); }
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   // helper fallback to remove original item if specific delete functions not present
   function tryRemoveOriginal(storeName, type, payload) {
     if (!payload || !payload.id) return;
     // products
     if (type === 'product') {
       if (typeof getStoreProducts === 'function' && typeof saveStoreProducts === 'function') {
         const arr = getStoreProducts(storeName).filter(p => p.id !== payload.id);
         saveStoreProducts(storeName, arr);
         return;
       }
     }
     // invoices
     if (type === 'invoice') {
       if (typeof getStoreInvoices === 'function' && typeof saveStoreInvoices === 'function') {
         const arr = getStoreInvoices(storeName).filter(i => i.id !== payload.id);
         saveStoreInvoices(storeName, arr);
         return;
       }
     }
     // reports fallback (try 'reports_v1' localStorage)
     if (type === 'report') {
       try {
         const k = `reports_v1_${storeName}`;
         const arr = JSON.parse(localStorage.getItem(k) || '[]').filter(r => r.id !== payload.id);
         localStorage.setItem(k, JSON.stringify(arr));
       } catch (e) {}
     }
   }
   
   function getAllReports() {
    const storeName = getCurrentUser()?.name;
    if (!storeName) return [];
    return JSON.parse(localStorage.getItem(`reports_v1_${storeName}`) || '[]');
  }
  
  function saveAllReports(arr) {
    const storeName = getCurrentUser()?.name;
    if (!storeName) return;
    localStorage.setItem(`reports_v1_${storeName}`, JSON.stringify(Array.isArray(arr) ? arr : []));
  }
     // restore a trash item back into proper storage
// Robust restore that matches the app's storage conventions
function restoreFromTrash(storeName, trashId) {
  const trash = getStoreTrash(storeName);
  const idx = trash.findIndex(t => t.id === trashId);
  if (idx === -1) return false;

  const item = trash.splice(idx, 1)[0];
  const type = (item.type || '').toLowerCase();
  const payload = item.payload;

  try {
    if (type === 'invoice') {
      // Preferred helpers (most apps use these)
      if (typeof getAllInvoices === 'function' && typeof saveAllInvoices === 'function') {
        const arr = Array.isArray(getAllInvoices()) ? getAllInvoices() : [];
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1); // remove duplicate
        arr.push(payload);
        saveAllInvoices(arr);
      }
      // Alternate per-store helpers
      else if (typeof getStoreInvoices === 'function' && typeof saveStoreInvoices === 'function') {
        const arr = Array.isArray(getStoreInvoices(storeName)) ? getStoreInvoices(storeName) : [];
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        saveStoreInvoices(storeName, arr);
      }
      // Final fallback: use likely localStorage key `invoices_v1_${storeName}`
      else {
        const key = `invoices_v1_${storeName}`;
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        localStorage.setItem(key, JSON.stringify(arr));
      }

      // immediate UI refresh
      if (typeof renderInvoiceTable === 'function') renderInvoiceTable();
    }
    else if (type === 'product') {
      if (typeof getStoreProducts === 'function' && typeof saveStoreProducts === 'function') {
        const arr = Array.isArray(getStoreProducts(storeName)) ? getStoreProducts(storeName) : [];
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        saveStoreProducts(storeName, arr);
      } else {
        const key = `products_v1_${storeName}`;
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const i = arr.findIndex(x => String(x.id) === String(payload.id));
        if (i >= 0) arr.splice(i, 1);
        arr.push(payload);
        localStorage.setItem(key, JSON.stringify(arr));
      }
      if (typeof renderProducts === 'function') renderProducts();
    }
    else if (type === 'report') {
      const key = `reports_v1_${storeName}`;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const i = arr.findIndex(x => String(x.id) === String(payload.id));
      if (i >= 0) arr.splice(i, 1);
      arr.push(payload);
      localStorage.setItem(key, JSON.stringify(arr));
      if (typeof renderReports === 'function') renderReports();
    }
    else {
      // Generic fallback: restore to a "restored_{type}_{store}" key so data isn't lost
      const key = `restored_${type}_${storeName}`;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const i = arr.findIndex(x => String(x.id) === String(payload.id));
      if (i >= 0) arr.splice(i, 1);
      arr.push(payload);
      localStorage.setItem(key, JSON.stringify(arr));
    }
  } catch (e) {
    console.warn('restoreFromTrash error', e);
  }

  // Save updated trash and refresh UI
  saveStoreTrash(storeName, trash);
  window.dispatchEvent(new Event('dataUpdated'));
  return true;
}



   
   // permanently delete a specific trash item
   function permanentlyDeleteFromTrash(storeName, trashId) {
     const trash = getStoreTrash(storeName);
     const idx = trash.findIndex(t => t.id === trashId);
     if (idx === -1) return false;
     trash.splice(idx,1);
     saveStoreTrash(storeName, trash);
     window.dispatchEvent(new Event('dataUpdated'));
     return true;
   }
   
   // delete all trash items permanently
   function permanentlyDeleteAllTrash(storeName) {
     saveStoreTrash(storeName, []);
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   // restore all trash items (attempt best-effort)
   function restoreAllTrash(storeName) {
     const trash = getStoreTrash(storeName);
     // iterate copy since restoreFromTrash mutates storage
     const ids = trash.map(t => t.id);
     ids.forEach(id => restoreFromTrash(storeName, id));
     window.dispatchEvent(new Event('dataUpdated'));
   }
   
   // purge old items older than retention (run on load)
   function purgeOldTrash(storeName) {
     const trash = getStoreTrash(storeName);
     const now = Date.now();
     const cutoff = now - (TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
     const remaining = trash.filter(t => {
       const dt = Date.parse(t.deletedAt || '') || 0;
       return dt >= cutoff;
     });
     if (remaining.length !== trash.length) {
       saveStoreTrash(storeName, remaining);
       window.dispatchEvent(new Event('dataUpdated'));
     }
   }
   
   /* ========== UI for Recycle Bin ========== */
   
   function initRecycleBinUI() {
     const openBtn = document.getElementById('btnRecycleBinTop');
     const modal = document.getElementById('recycleBinModal');
     const closeBtn = document.getElementById('closeRecycleBin');
     const restoreAllBtn = document.getElementById('rbRestoreAll');
     const deleteAllBtn = document.getElementById('rbDeleteAll');
   
     if (openBtn) openBtn.addEventListener('click', openRecycleBin);
     if (closeBtn) closeBtn.addEventListener('click', closeRecycleBin);
     if (restoreAllBtn) restoreAllBtn.addEventListener('click', () => {
       const user = getCurrentUser(); if (!user) return;
       if (!confirm('Restore ALL items from recycle bin?')) return;
       restoreAllTrash(user.name);
       renderRecycleBin();
     });
     if (deleteAllBtn) deleteAllBtn.addEventListener('click', () => {
       const user = getCurrentUser(); if (!user) return;
       if (!confirm('Permanently DELETE ALL items? This cannot be undone.')) return;
       permanentlyDeleteAllTrash(user.name);
       renderRecycleBin();
     });
   
     // close on backdrop
     modal?.addEventListener('click', (e) => { if (e.target === modal) closeRecycleBin(); });
   
     // initial purge & render (when app loads)
     window.addEventListener('DOMContentLoaded', () => {
       const user = getCurrentUser();
       if (user) {
         purgeOldTrash(user.name);
       }
     });
   
     // re-render when data updates
     window.addEventListener('dataUpdated', () => renderRecycleBin());
   }
   
   function openRecycleBin() {
     const modal = document.getElementById('recycleBinModal');
     if (!modal) return;
     modal.classList.remove('hidden');
     renderRecycleBin();
   }
   
   function closeRecycleBin() {
     const modal = document.getElementById('recycleBinModal');
     if (!modal) return;
     modal.classList.add('hidden');
   }
   
   // render recycle bin contents
   function renderRecycleBin() {
     const user = getCurrentUser(); if (!user) return;
     const trash = getStoreTrash(user.name);
   
     const invoicesWrap = document.getElementById('rbInvoices');
     const productsWrap = document.getElementById('rbProducts');
     const reportsWrap = document.getElementById('rbReports');
     const statusEl = document.getElementById('rbStatus');
   
     invoicesWrap && (invoicesWrap.innerHTML = '');
     productsWrap && (productsWrap.innerHTML = '');
     reportsWrap && (reportsWrap.innerHTML = '');
     statusEl && (statusEl.textContent = `Items in bin: ${trash.length} • Auto-permanent delete after ${TRASH_RETENTION_DAYS} days.`);
   
     if (!trash.length) {
       const emptyMsg = `<div class="text-sm text-gray-500">Recycle bin is empty.</div>`;
       invoicesWrap && (invoicesWrap.innerHTML = emptyMsg);
       productsWrap && (productsWrap.innerHTML = emptyMsg);
       reportsWrap && (reportsWrap.innerHTML = emptyMsg);
       return;
     }
   
     // grouping
     const byType = { invoice: [], product: [], report: [], other: [] };
     trash.forEach(t => {
       const key = (t.type || 'other').toLowerCase();
       if (byType[key]) byType[key].push(t); else byType.other.push(t);
     });
   
     // helper to build item node
     function makeTrashRow(t) {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between gap-2 p-2 border rounded';
    
      // 🔹 Choose display name based on type
      let displayName = '';
      if (t.type === 'invoice') {
        displayName = t.payload?.customer || "Invoice";   // show customer name
      } else if (t.type === 'report') {
        displayName = t.payload?.title || "Report";       // show report title
      } else {
        displayName = t.payload?.name || t.payload?.id || t.type;
      }
    
      // 🔹 Build short info (you can remove ID if you don’t want to show it)
      let shortInfo = `${t.type} • ${fmtDateTime(t.deletedAt)}`;
      if (t.type === 'product') {
        shortInfo = `${t.type} • ${t.payload?.id ?? ''} • ${fmtDateTime(t.deletedAt)}`;
      }
    
      div.innerHTML = `
        <div class="truncate" title="${escapeHtml(JSON.stringify(t.payload || {}))}">
          <div class="font-semibold">${escapeHtml(displayName)}</div>
          <div class="text-xs text-gray-500">${escapeHtml(shortInfo)}</div>
        </div>
        <div class="flex gap-2">
          <button class="px-2 py-1 bg-emerald-500 text-white rounded rb-restore" data-id="${t.id}">Restore</button>
          <button class="px-2 py-1 bg-red-600 text-white rounded rb-delete" data-id="${t.id}">Delete</button>
        </div>
      `;
    
      // wire actions
      div.querySelector('.rb-restore').addEventListener('click', () => {
        if (!confirm('Restore this item?')) return;
        restoreFromTrash(getCurrentUser().name, t.id);
        renderRecycleBin();
      });
      div.querySelector('.rb-delete').addEventListener('click', () => {
        if (!confirm('Permanently delete this item? This cannot be undone.')) return;
        permanentlyDeleteFromTrash(getCurrentUser().name, t.id);
        renderRecycleBin();
      });
    
      return div;
    }
    
   
     // populate each section sorted newest-first
     (byType.invoice || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => invoicesWrap.appendChild(makeTrashRow(t)));
     (byType.product || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => productsWrap.appendChild(makeTrashRow(t)));
     (byType.report || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => reportsWrap.appendChild(makeTrashRow(t)));
     (byType.other || []).sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt)).forEach(t => {
       // append to reportsWrap as generic
       reportsWrap.appendChild(makeTrashRow(t));
     });
   }
   
   /* Initialize recycle bin UI */
   window.addEventListener('DOMContentLoaded', () => {
     try { initRecycleBinUI(); } catch (e) { console.warn('Recycle init failed', e); }
   });

   
/* =========================
   Page transition helper + updated showSection (all pages participate)
   ========================= */

/**
 * Animate transition between two section elements.
 * dir: 'left'   => old slides left, new comes from right
 * dir: 'right'  => old slides right, new comes from left
 * If dir is falsy -> no animation (instant swap)
 */
/* ===== Modern animateSectionTransition (soft scale + fade) ===== */
function animateSectionTransition(oldEl, newEl, dir = 'left') {
  return new Promise((resolve) => {
    if (!oldEl || !newEl || oldEl === newEl || !dir) {
      if (oldEl && oldEl !== newEl) oldEl.classList.add('hidden');
      if (newEl) newEl.classList.remove('hidden');
      return resolve();
    }

    const container = oldEl.parentElement;
    const prevPos = container.style.position || '';
    if (!prevPos) container.style.position = 'relative';

    // Save inline styles to restore after animation
    const save = el => ({
      position: el.style.position || '',
      inset: el.style.inset || '',
      transition: el.style.transition || '',
      transform: el.style.transform || '',
      opacity: el.style.opacity || '',
      zIndex: el.style.zIndex || '',
      willChange: el.style.willChange || ''
    });
    const sOld = save(oldEl), sNew = save(newEl);

    // overlay both elements
    [oldEl, newEl].forEach(el => {
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      // hint for GPU acceleration
      el.style.willChange = 'transform, opacity';
    });

    newEl.classList.remove('hidden');
    newEl.style.zIndex = '600';
    oldEl.style.zIndex = '500';

    const dur = 380;
    const easing = 'cubic-bezier(.22,.9,.28,1)';

    // initial
    if (dir === 'left') {
      oldEl.style.transform = 'translateX(0) scale(1)';
      newEl.style.transform = 'translateX(12%) scale(0.975)';
    } else {
      oldEl.style.transform = 'translateX(0) scale(1)';
      newEl.style.transform = 'translateX(-12%) scale(0.975)';
    }
    newEl.style.opacity = '0.6';

    // transitions
    oldEl.style.transition = `transform ${dur}ms ${easing}, opacity ${dur}ms ${easing}`;
    newEl.style.transition = `transform ${dur}ms ${easing}, opacity ${dur}ms ${easing}`;

    // force paint
    void oldEl.offsetWidth;

    // animate
    requestAnimationFrame(() => {
      if (dir === 'left') {
        oldEl.style.transform = 'translateX(-14%) scale(0.96)';
        newEl.style.transform = 'translateX(0) scale(1)';
      } else {
        oldEl.style.transform = 'translateX(14%) scale(0.96)';
        newEl.style.transform = 'translateX(0) scale(1)';
      }
      oldEl.style.opacity = '0.65';
      newEl.style.opacity = '1';
    });

    function finish(e) {
      // ensure we listen once
      newEl.removeEventListener('transitionend', finish);
      // hide old, restore inline styles
      try { oldEl.classList.add('hidden'); } catch(e) {}

      const restore = (el, s) => {
        el.style.position = s.position;
        el.style.inset = s.inset;
        el.style.transition = s.transition;
        el.style.transform = s.transform;
        el.style.opacity = s.opacity;
        el.style.zIndex = s.zIndex;
        el.style.willChange = s.willChange;
      };
      restore(oldEl, sOld);
      restore(newEl, sNew);

      if (!prevPos) container.style.position = '';
      resolve();
    }

    // safety fallback
    newEl.addEventListener('transitionend', finish);
    setTimeout(finish, dur + 120);
  });
}

/* ===== Improved swipe navigation with live drag (modern feel) ===== */
function enableSectionSwipeNavigation(opts = {}) {
  const threshold = opts.threshold || 60; // px to trigger change
  const maxVerticalRatio = opts.maxVerticalRatio || 0.6;
  const minViewportWidth = typeof opts.minViewportWidth === 'number' ? opts.minViewportWidth : 0;
  const onlyTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!onlyTouch) return () => {}; // noop disable

  const firstSection = document.getElementById(SECTIONS[0]);
  const container = (firstSection && firstSection.parentElement) || document.body;
  let startX = 0, startY = 0, startTime = 0;
  let isDragging = false, dragged = false;
  let currentIndex = -1;
  let curEl = null, nextEl = null, prevEl = null;
  const saved = new WeakMap();
  const width = () => container.clientWidth || window.innerWidth || 360;

  function canNavigate() {
    // keep your previous modal/select checks
    if (document.querySelector('.modal, [role="dialog"], #reminderBulkModal:not(.hidden)')) return false;
    return true;
  }

  function saveInline(el) {
    if (!el || saved.has(el)) return;
    saved.set(el, {
      position: el.style.position || '',
      inset: el.style.inset || '',
      transition: el.style.transition || '',
      transform: el.style.transform || '',
      opacity: el.style.opacity || '',
      zIndex: el.style.zIndex || '',
      willChange: el.style.willChange || ''
    });
  }
  function restoreInline(el) {
    if (!el || !saved.has(el)) return;
    const s = saved.get(el);
    el.style.position = s.position;
    el.style.inset = s.inset;
    el.style.transition = s.transition;
    el.style.transform = s.transform;
    el.style.opacity = s.opacity;
    el.style.zIndex = s.zIndex;
    el.style.willChange = s.willChange;
    saved.delete(el);
  }

  function getCurrentVisibleIndex() {
    const cur = SECTIONS.map(id => document.getElementById(id)).find(el => el && !el.classList.contains('hidden'));
    return cur ? SECTIONS.indexOf(cur.id) : -1;
  }

  function prepareForDrag() {
    currentIndex = getCurrentVisibleIndex();
    if (currentIndex < 0) return false;
    curEl = document.getElementById(SECTIONS[currentIndex]);
    nextEl = document.getElementById(SECTIONS[Math.min(SECTIONS.length - 1, currentIndex + 1)]);
    prevEl = document.getElementById(SECTIONS[Math.max(0, currentIndex - 1)]);
    // save inline styles and put in overlay mode
    [curEl, nextEl, prevEl].forEach(el => {
      if (!el) return;
      saveInline(el);
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.willChange = 'transform, opacity';
      el.style.transition = 'none';
      el.style.zIndex = el === curEl ? 500 : 480;
      // ensure visible (don't hide)
      el.classList.remove('hidden');
    });
    // initial positions (next to the right, prev to the left)
    const w = width();
    if (nextEl) nextEl.style.transform = `translateX(${w}px) scale(0.98)`, nextEl.style.opacity = '0.9';
    if (prevEl) prevEl.style.transform = `translateX(${-w}px) scale(0.98)`, prevEl.style.opacity = '0.9';
    if (curEl) curEl.style.transform = 'translateX(0) scale(1)', curEl.style.opacity = '1';
    return true;
  }

  function onTouchStart(e) {
    if (!canNavigate()) return;
    if (minViewportWidth > 0 && window.innerWidth > minViewportWidth) return;
    if (!e.touches || e.touches.length !== 1) return;
    // ignore start over form controls
    const tag = (e.target && e.target.tagName && e.target.tagName.toLowerCase()) || '';
    if (['input','textarea','select','button'].includes(tag)) return;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    isDragging = false;
    dragged = false;
    // prepare DOM only lazily when we detect enough horizontal movement (cheap)
  }

  function onTouchMove(e) {
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // early cancel if vertical dominance
    if (!isDragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // begin horizontal drag
      if (!prepareForDrag()) { startX = 0; startY = 0; return; }
      isDragging = true;
      // prevent scroll
      e.preventDefault && e.preventDefault();
    }

    if (!isDragging) return;

    dragged = true;
    e.preventDefault && e.preventDefault();

    const w = width();
    // compute capped dx for resistance at edges
    let cappedDx = dx;
    const atLeftEdge = (dx > 0 && !prevEl);
    const atRightEdge = (dx < 0 && !nextEl);
    if (atLeftEdge || atRightEdge) {
      // resistance (rubber-band)
      const sign = Math.sign(dx);
      cappedDx = sign * (Math.pow(Math.abs(dx), 0.85));
    }

    // apply transforms: current moves with finger, neighbor follows
    const percent = cappedDx / w;
    // subtle scale effect based on distance
    const curScale = Math.max(0.95, 1 - Math.abs(percent) * 0.05);
    curEl.style.transform = `translateX(${cappedDx}px) scale(${curScale})`;
    curEl.style.opacity = `${Math.max(0.6, 1 - Math.abs(percent) * 0.5)}`;

    if (cappedDx < 0 && nextEl) {
      // dragging to left -> reveal next (from right)
      const nextX = w + cappedDx; // starts at +w
      const nextScale = Math.min(1, 0.98 + Math.abs(percent) * 0.02);
      nextEl.style.transform = `translateX(${nextX}px) scale(${nextScale})`;
      nextEl.style.opacity = `${Math.min(1, 0.9 + Math.abs(percent) * 0.1)}`;
    } else if (cappedDx > 0 && prevEl) {
      // dragging to right -> reveal prev (from left)
      const prevX = -w + cappedDx; // starts at -w
      const prevScale = Math.min(1, 0.98 + Math.abs(percent) * 0.02);
      prevEl.style.transform = `translateX(${prevX}px) scale(${prevScale})`;
      prevEl.style.opacity = `${Math.min(1, 0.9 + Math.abs(percent) * 0.1)}`;
    }
  }

  function finishDragCommit(dir) {
    // dir: 'left' means move to next (swiped left), 'right' means move prev
    let targetId = null;
    if (dir === 'left' && nextEl) targetId = SECTIONS[currentIndex + 1];
    if (dir === 'right' && prevEl) targetId = SECTIONS[currentIndex - 1];

    // If we have a target, run the animated transition using existing function (keeps behavior consistent)
    if (targetId) {
      // restore inline for elements we don't want to animate double (animateSectionTransition will manage overlays)
      [curEl, nextEl, prevEl].forEach(el => {
        if (!el) return;
        // quick cleanup: remove inline transitions to let animateSectionTransition handle it
        el.style.transition = '';
      });
      // call showSection because it triggers animateSectionTransition and refresh hooks
      showSection(targetId);
    } else {
      // no target (edge) -> revert visually to original
      revertDrag(); // triggers small revert animation then cleanup
    }
    // cleanup will be handled by showSection or revertDrag
  }

  function revertDrag() {
    const dur = 280;
    const easing = 'cubic-bezier(.22,.9,.28,1)';
    // restore with a short transition
    [curEl, nextEl, prevEl].forEach(el => {
      if (!el || !saved.has(el)) return;
      el.style.transition = `transform ${dur}ms ${easing}, opacity ${dur}ms ${easing}`;
      const s = saved.get(el);
      // request frame to ensure transition takes effect
      requestAnimationFrame(() => {
        el.style.transform = s.transform || '';
        el.style.opacity = s.opacity || '';
      });
    });

    // cleanup after transition
    setTimeout(() => {
      [curEl, nextEl, prevEl].forEach(el => restoreInline(el));
      curEl = nextEl = prevEl = null;
      isDragging = false;
      dragged = false;
    }, dur + 40);
  }

  function onTouchEnd(e) {
    if (!startTime) return;
    const touch = (e.changedTouches && e.changedTouches[0]) || null;
    if (!touch) { startTime = 0; return; }
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    startTime = 0;

    // If we never entered dragging, ignore
    if (!dragged || !isDragging || !curEl) {
      isDragging = false;
      dragged = false;
      return;
    }

    const absDx = Math.abs(dx);
    // If movement passes threshold and horizontal dominates -> commit; otherwise revert
    if (absDx >= threshold && Math.abs(dy) <= Math.abs(dx) * (1 / maxVerticalRatio)) {
      // decide direction based on sign
      if (dx < 0) {
        // swipe left => go to next
        if (nextEl) {
          finishDragCommit('left');
        } else {
          revertDrag();
        }
      } else {
        // swipe right => go to prev
        if (prevEl) {
          finishDragCommit('right');
        } else {
          revertDrag();
        }
      }
    } else {
      // not enough movement -> revert
      revertDrag();
    }
  }

  // attach with appropriate passive flags
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

  // return disable function
  return function disableSwipe() {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
  };
}

// Example enable (update params as you like)
const disableSectionSwipe = enableSectionSwipeNavigation({
  threshold: 60,
  maxVerticalRatio: 0.6,
  minViewportWidth: 1024 // keep your current behavior (only enable when viewport <= 1024)
});

/* Section list: ordering determines animation direction */
const SECTIONS = [
  'dashboardContent',
  'invoicesSection',
  'productsSection',
  'reportsSection'
];

/* keep track of last visible section id (optional) */
let lastVisibleSectionId = null;

/* updated showSection that uses animateSectionTransition based on SECTIONS order */
function showSection(targetId) {
  // compute current visible element among known sections
  const currentVisible = SECTIONS.map(id => document.getElementById(id)).find(el => el && !el.classList.contains('hidden'));
  const targetEl = document.getElementById(targetId);

  // If target doesn't exist, fallback to instant hide/show and clear nav
  if (!targetEl) {
    SECTIONS.map(id => document.getElementById(id)).forEach(s => s && s.classList.add('hidden'));
    setActiveNav(null);
    return;
  }

  // If already visible, just update active state
  if (currentVisible === targetEl) {
    setActiveNav(targetId || null);
    return;
  }

  // Determine direction using index order in SECTIONS
  let dir = null;
  const fromIndex = currentVisible ? SECTIONS.indexOf(currentVisible.id) : -1;
  const toIndex = SECTIONS.indexOf(targetId);

  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
    dir = (toIndex > fromIndex) ? 'left' : 'right';
  } else {
    // if either index unknown, fall back to no animation (instant)
    dir = null;
  }

  // If animation is possible, run it
  if (dir && currentVisible) {
    animateSectionTransition(currentVisible, targetEl, dir).then(() => {
      // after animation, perform section-specific refreshes
      if (targetId === "dashboardContent") updateDashboardTotals();
      if (targetId === "invoicesSection") renderInvoiceTable();
      if (targetId === "productsSection") renderProductList(searchInput?.value || '');
      if (targetId === "reportsSection") renderReports();

      setActiveNav(targetId || null);
      document.getElementById('bottomNav')?.classList.remove('hidden');
      if (typeof authSection !== 'undefined' && authSection) authSection.classList.add('hidden');
      if (typeof setAuthVisibility === 'function') setAuthVisibility(false);
      lastVisibleSectionId = targetId;
    });
    return;
  }

  // No animation: instant replace (legacy behavior)
  SECTIONS.map(id => document.getElementById(id)).forEach(s => s && s.classList.add('hidden'));
  targetEl.classList.remove('hidden');

  // section-specific updates
  if (targetId === "dashboardContent") updateDashboardTotals();
  if (targetId === "invoicesSection") renderInvoiceTable();
  if (targetId === "productsSection") renderProductList(searchInput?.value || '');
  if (targetId === "reportsSection") renderReports();

  setActiveNav(targetId || null);
  document.getElementById('bottomNav')?.classList.remove('hidden');
  if (typeof authSection !== 'undefined' && authSection) authSection.classList.add('hidden');
  if (typeof setAuthVisibility === 'function') setAuthVisibility(false);

  lastVisibleSectionId = targetId;
}

/* highlight active button (accepts null to clear active state) */
function setActiveNav(targetId) {
  // navButtons assumed to be a NodeList/array of elements wired elsewhere
  navButtons.forEach(btn => {
    const isActive = targetId && btn.getAttribute('data-target') === targetId;
    btn.classList.toggle('text-blue-600', !!isActive);
    btn.classList.toggle('font-bold', !!isActive);
  });
}

/* existing wiring for nav buttons (unchanged) */
navButtons.forEach(btn => btn.addEventListener('click', () => {
  const target = btn.getAttribute('data-target');
  if (target) showSection(target);
}));

/* =========================
   Mobile swipe navigation between SECTIONS
   (lightweight, non-invasive)
   ========================= */


  
// /* =========================
//    Show/hide auth (login/register)
//    ========================= */
// function showLoginForm() {
//   // show auth container and login panel, hide dashboard/other app sections
//   authSection?.classList.remove('hidden');
//   registrationForm?.classList.add('hidden');
//   loginForm?.classList.remove('hidden');
//   dashboardSection?.classList.add('hidden');

//   // hide bottom nav while on auth screens
//   document.getElementById('bottomNav')?.classList.add('hidden');

//   // mark nav as inactive
//   setActiveNav(null);
//   setAuthVisibility(true);
// }

// function showRegisterForm() {
//   authSection?.classList.remove('hidden');
//   registrationForm?.classList.remove('hidden');
//   loginForm?.classList.add('hidden');
//   dashboardSection?.classList.add('hidden');

//   document.getElementById('bottomNav')?.classList.add('hidden');

//   setActiveNav(null);
//   setAuthVisibility(true);
// }


  /* =========================
     CLOCK
     ========================= */
  function tickClock() { const now = new Date(); const hh = String(now.getHours()).padStart(2, '0'); const mm = String(now.getMinutes()).padStart(2, '0'); const ss = String(now.getSeconds()).padStart(2, '0'); currentTimeEl && (currentTimeEl.textContent = `${fmtDate(now)} ${hh}:${mm}:${ss}`); }
  setInterval(tickClock, 1000); tickClock();

  /* =========================
     PRODUCT UI & CART
     ========================= */
  // Make addProductBtn icon-only if present
  if (addProductBtn) { addProductBtn.innerHTML = '<i class="fa-solid fa-plus"></i>'; addProductBtn.title = 'Add product'; }

  function openProductModal(isEdit = false) {
    if (!productModal) return;
    productModal.classList.remove('hidden');
    productModalBackdrop && productModalBackdrop.classList.remove('hidden');
    if (!isEdit) try { productForm.reset(); } catch (e) { }
    modalTitle && (modalTitle.textContent = isEdit ? 'Edit Product' : 'Add Product');
  }
  function closeProductModal() {
    productModal && productModal.classList.add('hidden');
    productModalBackdrop && productModalBackdrop.classList.add('hidden');
  }

  addProductBtn?.addEventListener('click', () => { editingProductId = null; openProductModal(false); });
  emptyAddBtn?.addEventListener('click', () => { editingProductId = null; openProductModal(false); });
  closeModalBtn?.addEventListener('click', closeProductModal);
  cancelModalBtn?.addEventListener('click', closeProductModal);
  productModalBackdrop?.addEventListener('click', closeProductModal);

  productForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (productName?.value || '').trim();
    const cost = parseFloat(productCost?.value) || 0;
    const price = parseFloat(productPrice?.value) || 0;
    const qty = parseInt(productQty?.value) || 0;
    if (!name || price < 0 || qty < 0) { toast('Fill product fields correctly', 'error'); return; }
    const user = getCurrentUser(); if (!user) { toast('Login required', 'error'); return; }
    const all = getAllProducts();
    if (editingProductId) {
      const idx = all.findIndex(p => p.id === editingProductId && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase());
      if (idx >= 0) all[idx] = { ...all[idx], name, cost, price, qty };
    } else {
      const id = `PRD-${Date.now()}`; all.push({ id, store: user.name, name, cost, price, qty });
    }
    saveAllProducts(all);
    closeProductModal(); renderProductList(searchInput?.value || ''); window.dispatchEvent(new Event('dataUpdated')); toast('Product saved', 'success');
  });

  function renderProductList(filter = '') {
    const user = getCurrentUser();
    if (!user) return;
  
    // Get all products
    const all = getStoreProducts(user.name) || [];
  
    // Get trashed products IDs
    const trash = getStoreTrash(user.name);
    const trashedIds = trash.filter(t => t.type === 'product').map(t => t.payload?.id);
  
    // filter out trashed products
    const allActive = all.filter(p => !trashedIds.includes(p.id));
  
    // apply search filter
    const q = (filter || '').toString().toLowerCase().trim();
    const items = q ? allActive.filter(p => (p.name || '').toString().toLowerCase().includes(q)) : allActive;
  
    if (!productRows || !productCards) return;
    productRows.innerHTML = '';
    productCards.innerHTML = '';
  
    const emptyEl = document.getElementById('emptyState');
    if (!items.length) {
      emptyEl && emptyEl.classList.remove('hidden');
      return;
    } else {
      emptyEl && emptyEl.classList.add('hidden');
    }
  
    const mobile = window.matchMedia('(max-width:640px)').matches;
  
    // Desktop Table
    if (!mobile) {
      items.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b';
        tr.innerHTML = `
          <td class="p-2">${idx + 1}</td>
          <td class="p-2">${escapeHtml(p.name)}</td>
          <td class="p-2">${Number(p.cost||0).toFixed(2)}</td>
          <td class="p-2">${Number(p.price||0).toFixed(2)}</td>
          <td class="p-2">${p.qty}</td>
          <td class="p-2 no-print">
            <div class="flex gap-2">
              <button class="action-icon" data-action="buy" data-id="${p.id}" title="Add to cart"><i class="fa-solid fa-cart-shopping"></i></button>
              <button class="action-icon" data-action="edit" data-id="${p.id}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="action-icon text-red-600 rb-delete-product" data-id="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        productRows.appendChild(tr);
  
        tr.querySelector('.rb-delete-product').addEventListener('click', () => {
          if (!confirm('Move product to recycle bin?')) return;
          moveToTrash(user.name, 'product', p);
          renderProductList(filter);
        });
      });
    }
  
    // Mobile Cards
    items.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-4 shadow hover:shadow-lg transition flex flex-col gap-3 w-full';
      card.innerHTML = `
        <div class="flex justify-between items-center">
          <h4 class="font-semibold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(p.name)}</h4>
          <div class="text-emerald-600 font-semibold">$${Number(p.price||0).toFixed(2)}</div>
        </div>
  
        <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300">
          <div>Cost: $${Number(p.cost||0).toFixed(2)}</div>
          <div>Qty: ${p.qty}</div>
        </div>
  
        <div class="flex justify-start gap-2 mt-2">
          <button class="action-icon bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition" data-action="buy" data-id="${p.id}" title="Add to cart">
            <i class="fa-solid fa-cart-shopping"></i>
          </button>
          <button class="action-icon bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-lg transition" data-action="edit" data-id="${p.id}" title="Edit">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-icon bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition rb-delete-product-mobile" data-id="${p.id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      productCards.appendChild(card);
  
      card.querySelector('.rb-delete-product-mobile').addEventListener('click', () => {
        if (!confirm('Move product to recycle bin?')) return;
        moveToTrash(user.name, 'product', p);
        renderProductList(filter);
      });
    });
  }
  
  
  

  // search
  searchInput?.addEventListener('input', e => renderProductList(e.target.value));

  // product actions delegation
  productRows?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const act = btn.getAttribute('data-action'); const id = btn.getAttribute('data-id'); handleProductAction(act, id);
  });
  productCards?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const act = btn.getAttribute('data-action'); const id = btn.getAttribute('data-id'); handleProductAction(act, id);
  });

  function handleProductAction(action, id) {
    const user = getCurrentUser(); if (!user) return;
    const all = getAllProducts();
    const idx = all.findIndex(p => p.id === id && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase());
    if (action === 'edit' && idx >= 0) {
      const prod = all[idx]; editingProductId = id; modalTitle && (modalTitle.textContent = 'Edit Product'); productName.value = prod.name; productCost.value = prod.cost; productPrice.value = prod.price; productQty.value = prod.qty; openProductModal(true); return;
    }
    if (action === 'delete' && idx >= 0) {
      if (!confirm('Delete this product?')) return;
      all.splice(idx, 1); saveAllProducts(all); renderProductList(searchInput?.value || ''); window.dispatchEvent(new Event('dataUpdated')); toast('Product deleted', 'success'); return;
    }
    if (action === 'buy' && idx >= 0) { addToCart(id); return; }
  }

  /* CART */
  function addToCart(productId) {
    const user = getCurrentUser(); if (!user) return;
    const all = getAllProducts();
    const prod = all.find(p => p.id === productId && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase());
    if (!prod) return toast('Product not found.', 'error');
    const existing = cart.find(c => c.id === productId);
    const existingQty = existing ? existing.qty : 0;
    if (existingQty + 1 > prod.qty) return toast('Not enough stock.', 'error');
    if (existing) existing.qty += 1; else cart.push({ id: prod.id, name: prod.name, price: Number(prod.price), qty: 1 });
    renderCart();
    toast('Added to cart', 'success');
  }

  function renderCart() {
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = '';
    let totalCount = 0, totalAmount = 0;
    if (!cart.length) { cartItemsEl.innerHTML = '<p class="text-gray-500">Cart is empty.</p>'; }
    else {
      cart.forEach(item => {
        totalCount += item.qty; totalAmount += item.price * item.qty;
        const row = document.createElement('div'); row.className = 'flex justify-between items-center gap-3 p-2 border-b';
        row.innerHTML = `<div><div class="font-semibold">${escapeHtml(item.name)}</div><div class="text-sm">Price: ${fmtMoney(item.price)} | Qty: ${item.qty}</div></div>
          <div class="flex flex-col items-end gap-2"><div class="text-sm font-semibold">${fmtMoney(item.price * item.qty)}</div><div class="flex gap-1"><button class="px-2 py-1 bg-gray-200 rounded" data-decrease="${item.id}">-</button><button class="px-2 py-1 bg-gray-200 rounded" data-increase="${item.id}">+</button></div><button class="px-2 py-1 bg-red-500 text-white rounded mt-1" data-remove="${item.id}">Remove</button></div>`;
        cartItemsEl.appendChild(row);
      });
    }
    cartCountHeader && (cartCountHeader.textContent = totalCount);
    shopModal && (shopModal.dataset.total = totalAmount);
    // update invoice total if invoice modal open
    if (invoiceModal && !invoiceModal.classList.contains('hidden')) {
      const invoiceTotalEl = invoiceModal.querySelector('#invoiceTotal');
      if (invoiceTotalEl) invoiceTotalEl.textContent = fmtMoney(totalAmount);
    }
  }

  cartItemsEl?.addEventListener('click', e => {
    const idRemove = e.target.getAttribute('data-remove'); const idInc = e.target.getAttribute('data-increase'); const idDec = e.target.getAttribute('data-decrease');
    const user = getCurrentUser(); if (!user) return;
    const all = getAllProducts();
    if (idRemove) { cart = cart.filter(i => i.id !== idRemove); renderCart(); return; }
    if (idInc) {
      const prod = all.find(p => p.id === idInc && String(p.store || '').toLowerCase() === String(user.name || '').toLowerCase()); if (!prod) return toast('Product not found.', 'error');
      const it = cart.find(i => i.id === idInc); if (it.qty + 1 > prod.qty) return toast('Not enough stock.', 'error'); it.qty += 1; renderCart(); return;
    }
    if (idDec) {
      const it = cart.find(i => i.id === idDec); if (!it) return; it.qty = Math.max(0, it.qty - 1); if (it.qty === 0) cart = cart.filter(i => i.id !== idDec); renderCart(); return;
    }
  });

  openCartHeader?.addEventListener('click', () => { shopModal?.classList.remove('hidden'); shopBackdrop?.classList.remove('hidden'); renderCart(); });
  closeCartBtn?.addEventListener('click', () => { shopModal?.classList.add('hidden'); shopBackdrop?.classList.add('hidden'); });
  shopBackdrop?.addEventListener('click', () => { shopModal?.classList.add('hidden'); shopBackdrop?.classList.add('hidden'); });
  clearCartBtn?.addEventListener('click', () => { if (!confirm('Clear all items from cart?')) return; cart = []; renderCart(); });


  backToCartBtn?.addEventListener('click', () => { invoiceModal?.classList.add('hidden'); shopModal?.classList.remove('hidden'); shopBackdrop?.classList.remove('hidden'); });

/* ---------- Helper: set amountPaid readonly when status==paid + live status sync ---------- */
/* ---------- Helper: manage status/amount sync ---------- */
function applyStatusPaidBehavior(container, total) {
  if (!container) return;
  // support either #amountPaid or #paid
  const amountPaidInput = container.querySelector('#amountPaid') || container.querySelector('#paid');
  const statusSelect = container.querySelector('#status');
  const totalEl = container.querySelector('#invoiceTotal') || container.querySelector('#amount') || null;

  const ttl = Number(total || (totalEl ? Number(totalEl.textContent || totalEl.value || 0) : 0));
  let lastStatus = 'unpaid';

  // show total if element available
  if (totalEl && totalEl.tagName.toLowerCase() !== 'input') {
    totalEl.textContent = fmtMoney(ttl);
  } else if (totalEl && totalEl.tagName.toLowerCase() === 'input') {
    // keep input formatted (amountInput typically)
    totalEl.value = fmtMoney(ttl);
  }

  // ensure partial option exists
  if (statusSelect && !Array.from(statusSelect.options).some(o => o.value === 'partial')) {
    const opt = document.createElement('option');
    opt.value = 'partial';
    opt.textContent = 'partial';
    // put partial before paid/unpaid for clarity
    try { statusSelect.add(opt, statusSelect.options[1] || null); } catch (e) { statusSelect.appendChild(opt); }
  }

  // sync amount -> status
  function syncFromAmount(formatNow = true) {
    if (!amountPaidInput || !statusSelect) return;
    let val = Number((amountPaidInput.value || '').replace(/[^0-9.]/g, '')) || 0;
  
    if (val <= 0) {
      statusSelect.value = 'unpaid';
      lastStatus = 'unpaid';
    } else if (val >= ttl) {
      val = ttl; // clamp
      if (formatNow) amountPaidInput.value = fmtMoney(val);
      statusSelect.value = 'paid';
      lastStatus = 'paid';
    } else {
      if (formatNow) amountPaidInput.value = fmtMoney(val);
      statusSelect.value = 'partial';
      lastStatus = 'partial';
    }
  }
  

  // sync status -> amount
  function syncFromStatus() {
    if (!statusSelect || !amountPaidInput) return;
    const cur = statusSelect.value;

    if (cur === 'paid') {
      amountPaidInput.value = fmtMoney(ttl);
      lastStatus = 'paid';
    } else if (cur === 'unpaid') {
      amountPaidInput.value = '';
      lastStatus = 'unpaid';
    } else if (cur === 'partial') {
      // user should enter partial value manually — we don't auto-set a number
      if ((Number(amountPaidInput.value) || 0) <= 0) {
        // nothing entered yet — prompt user
        toast('Enter partial amount to set partial status.', 'warning');
        // revert selection to last status
        statusSelect.value = lastStatus || 'unpaid';
      } else {
        // keep lastStatus as partial
        lastStatus = 'partial';
      }
    }
  }

  // listeners (bind only once)
  if (amountPaidInput && !amountPaidInput._statusBound) {
    amountPaidInput.addEventListener('input', () => {
      // allow only numbers and dot
      const raw = (amountPaidInput.value || '').replace(/[^0-9.]/g, '');
      amountPaidInput.value = raw; // keep what user typed
      syncFromAmount(false);       // don't auto-format
    });
  
    // format nicely when focus leaves
    amountPaidInput.addEventListener('blur', () => {
      const val = Number((amountPaidInput.value || '').replace(/[^0-9.]/g, '')) || 0;
      amountPaidInput.value = val ? fmtMoney(val) : '';
      syncFromAmount(true);
    });
  
    amountPaidInput._statusBound = true;
  }
  

  // run initial sync
  syncFromAmount();
}



/* ----------------- SELL (open invoice modal) ----------------- */
sellCartBtn?.addEventListener('click', () => {
  if (!cart.length) return toast('Cart empty.', 'error');
  if (!invoiceModal) { toast('Invoice modal not found', 'error'); return; }

  const custInput = invoiceModal.querySelector('#customerName');
  const phoneInput = invoiceModal.querySelector('#customerPhone');
  const dateInput = invoiceModal.querySelector('#invoiceDate');
  const totalEl = invoiceModal.querySelector('#invoiceTotal');
  const amountPaidInput = invoiceModal.querySelector('#amountPaid');
  const statusSelectEl = invoiceModal.querySelector('#status');

  // keep previous customer if they typed one earlier, otherwise blank to allow entry
  // (user wanted ability to pass customer name; leave it editable)
  if (custInput && !custInput.value) custInput.value = '';
  if (phoneInput && !phoneInput.value) phoneInput.value = '+252';
  if (dateInput) dateInput.value = fmtDate(new Date());

  // compute total from current cart
  const total = Number(shopModal?.dataset.total || 0);
  if (totalEl) totalEl.textContent = fmtMoney(total);

  // default status to unpaid unless previously chosen
  if (statusSelectEl && !statusSelectEl.value) statusSelectEl.value = 'unpaid';

  // clear or set amountPaid depending on status (apply readonly behavior)
  if (amountPaidInput && (statusSelectEl?.value !== 'paid')) {
    // keep last value or default to empty
    if (!amountPaidInput.value) amountPaidInput.value = '';
    amountPaidInput.removeAttribute('readonly');
    amountPaidInput.classList.remove('bg-gray-100');
  }

  // apply paid behavior (this will set paid==total & readonly if status==paid)
  applyStatusPaidBehavior(invoiceModal, total);

  // show modal
  invoiceModal?.classList.remove('hidden');
  shopModal?.classList.add('hidden');
  shopBackdrop?.classList.add('hidden');
});

/* ----------------- BUY & RECORD (finalize invoice) ----------------- */
buyRecordBtn?.addEventListener('click', () => {
  if (!invoiceModal) return;
  const custEl = invoiceModal.querySelector('#customerName');
  const phoneEl = invoiceModal.querySelector('#customerPhone');
  const dateEl = invoiceModal.querySelector('#invoiceDate');
  const totalEl = invoiceModal.querySelector('#invoiceTotal');
  const amountPaidEl = invoiceModal.querySelector('#amountPaid');
  const statusEl = invoiceModal.querySelector('#status');

  const cust = custEl?.value.trim();
  const phone = phoneEl?.value.trim();
  const date = dateEl?.value || fmtDate(new Date());
  const total = Number((totalEl?.textContent || shopModal?.dataset.total) || 0);
  let paid = Number(amountPaidEl?.value || 0);
  const status = statusEl?.value || 'unpaid';

  // validations: customer + phone required
  if (!cust) { toast('Customer name required', 'error'); return; }
  if (!phone) { toast('Customer phone required', 'error'); return; }

  // stock check
  const allProducts = getAllProducts();
  for (const c of cart) {
    const prod = allProducts.find(p => p.id === c.id);
    if (!prod || prod.qty < c.qty) return toast(`Not enough stock for ${c.name}.`, 'error');
  }

  // if status is paid => override paid to total and set readonly (defensive)
  if (status === 'paid') {
    paid = Number(total);
    if (amountPaidEl) {
      amountPaidEl.value = String(Number(total).toFixed(2));
      amountPaidEl.setAttribute('readonly', 'true');
      amountPaidEl.classList.add('bg-gray-100');
    }
  } else {
    // if unpaid/partial: ensure paid is within 0..total
    if (paid < 0) { toast('Paid amount cannot be negative', 'error'); return; }
    if (paid > total) { toast('Paid cannot be greater than total', 'error'); return; }
    // allow editable
    if (amountPaidEl) amountPaidEl.removeAttribute('readonly');
  }

  // build invoice
  const invoiceItems = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, total: i.price * i.qty }));
  const invId = `INV-${Date.now()}`;
  const invoicePayload = { id: invId, store: getCurrentUser().name, date, customer: cust, phone, items: invoiceItems, amount: total, paid, status };
  const allInv = getAllInvoices(); allInv.push(invoicePayload); saveAllInvoices(allInv);

  // create report entry: use passed values
  createReportEntry({
    id: `RPT-${Date.now()}`,
    date,
    store: getCurrentUser().name,
    items: invoiceItems,
    amount: total,
    paid,
    status,
    customer: cust,
    phone
  });

  // update stock
  for (const c of cart) {
    const idx = allProducts.findIndex(p => p.id === c.id && String(p.store || '').toLowerCase() === String(getCurrentUser().name || '').toLowerCase());
    if (idx >= 0) allProducts[idx].qty = Math.max(0, allProducts[idx].qty - c.qty);
  }
  saveAllProducts(allProducts);

  // finalize
  cart = [];
  renderCart();
  renderProductList(searchInput?.value || '');
  invoiceModal?.classList.add('hidden');
  window.dispatchEvent(new Event('dataUpdated'));
  toast('Sold & recorded.', 'success');
  resetInvoiceForm();
});

/* ----------------- BUY ONLY (quick record) ----------------- */
/* ----------------- BUY ONLY (quick record) - updated to respect amountPaid if provided in modal ----------------- */
buyOnlyBtn?.addEventListener('click', () => {
  if (!cart.length) return toast('Cart empty', 'error');

  // try to read invoice modal fields if present, else use defaults
  const custInput = invoiceModal?.querySelector('#customerName');
  const phoneInput = invoiceModal?.querySelector('#customerPhone');
  const statusSelectEl = invoiceModal?.querySelector('#status');
  const amountPaidInput = invoiceModal?.querySelector('#amountPaid');

  const cust = custInput?.value?.trim() || 'Walk-in Customer';
  const phone = phoneInput?.value?.trim() || '+252000000000';
  const status = statusSelectEl?.value || 'unpaid';

  const total = Number(shopModal?.dataset.total || 0);
  const allProducts = getAllProducts();

  // stock check
  for (const c of cart) {
    const prod = allProducts.find(p => p.id === c.id);
    if (!prod || prod.qty < c.qty) return toast(`Not enough stock for ${c.name}.`, 'error');
  }

  // determine paid:
  // prefer explicit amountPaid input (if present), otherwise fallback to status === 'paid' => total, else 0
  let paid = 0;
  if (amountPaidInput && amountPaidInput.value !== '') {
    paid = Number(amountPaidInput.value) || 0;
  } else {
    paid = (status === 'paid') ? Number(total) : 0;
  }

  // enforce bounds
  if (paid < 0) return toast('Paid amount cannot be negative', 'error');
  if (paid > total) return toast('Paid cannot be greater than total', 'error');

  const invoiceItems = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, total: i.price * i.qty }));

  createReportEntry({
    id: `RPT-${Date.now()}`,
    date: fmtDate(new Date()),
    store: getCurrentUser().name,
    items: invoiceItems,
    amount: total,
    paid: paid,
    status: (status === 'partial' ? 'partial' : status),
    customer: cust,
    phone: phone
  });

  // reduce stock
  for (const c of cart) {
    const idx = allProducts.findIndex(p => p.id === c.id && String(p.store || '').toLowerCase() === String(getCurrentUser().name || '').toLowerCase());
    if (idx >= 0) allProducts[idx].qty = Math.max(0, allProducts[idx].qty - c.qty);
  }
  saveAllProducts(allProducts);

  cart = [];
  renderCart();
  renderProductList(searchInput?.value || '');
  // close modals if open
  invoiceModal?.classList.add('hidden');
  shopModal?.classList.add('hidden');
  shopBackdrop?.classList.add('hidden');
  window.dispatchEvent(new Event('dataUpdated'));
  toast('Recorded in Reports.', 'success');
  resetInvoiceForm()
});



  /* report helper */
  function createReportEntry({ id, date, store, items, amount, paid = 0, status = null, customer, phone, type = "sale" }) {
    const reports = getAllReports();
    const itemsArr = Array.isArray(items) ? items : (items ? [items] : []);
    const computedAmount = Number(amount) || itemsArr.reduce((s, it) => { const qty = Number(it?.qty ?? it?.quantity ?? 1); const line = Number(it?.total ?? (it?.price ? it.price * qty : 0)); return s + (isFinite(line) ? line : 0); }, 0);
    const paidNum = Number(paid || 0);
    const computedStatus = status || (paidNum >= computedAmount ? 'paid' : 'unpaid');
    const payload = { id: id || `RPT-${Date.now()}`, date: date || Date.now(), store: store || (getCurrentUser && getCurrentUser().name) || null, items: itemsArr, amount: Number(computedAmount), paid: paidNum, due: Number((computedAmount - paidNum) || 0), status: computedStatus, type, customer: customer || 'Walk-in Customer', phone: phone || '+252000000000' };
    reports.push(payload); saveAllReports(reports); window.dispatchEvent(new Event('dataUpdated'));
  }

   /* =========================
     INVOICES UI (create/edit/list/actions)
     ========================= */

     function makeItemRow(data = {}) {
      function escapeHtmlSafe(s) {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function parseNumberFromInput(s) {
        if (s == null) return 0;
        const cleaned = String(s).replace(/[^0-9.-]/g,'');
        const n = parseFloat(cleaned);
        return isFinite(n) ? n : 0;
      }
    
      const row = document.createElement('div');
      row.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 items-end';
    
      const safeName = (data.name || data.product || '').toString();
      const safePrice = Number(data.price ?? 0);
    
      row.innerHTML = `
        <div class="col-span-1 sm:col-span-2">
          <input class="item-name w-full border rounded-xl px-3 py-2" 
                 placeholder="Item name" 
                 value="${escapeHtmlSafe(safeName)}" 
                 aria-label="Item name">
        </div>
    
        <div class="flex gap-2 items-end">
          <input type="number" min="0" step="0.01" 
                 class="item-price border rounded-xl px-3 py-2 flex-1" 
                 placeholder="Price" 
                 value="${safePrice}" 
                 aria-label="Price">
          <button type="button" 
                  class="remove-item ml-1 inline-flex items-center justify-center w-9 h-9 rounded-full bg-red-500 text-white" 
                  title="Remove item" aria-label="Remove item">✕</button>
        </div>
      `;
    
      const priceEl = row.querySelector('.item-price');
      const removeBtn = row.querySelector('.remove-item');
      const nameEl = row.querySelector('.item-name');
    
      function updateTotals() {
        if (typeof recalcInvoiceTotals === 'function') recalcInvoiceTotals();
      }
    
      priceEl.addEventListener('input', () => {
        priceEl.value = (priceEl.value || '').toString().replace(/[^\d.]/g, '');
        updateTotals();
      });
    
      removeBtn.addEventListener('click', () => {
        row.remove();
        updateTotals();
      });
    
      nameEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          priceEl.focus();
        }
      });
    
      return row;
    }
    
    /* ---------- Simplified recalcInvoiceTotals ---------- */
    function recalcInvoiceTotals() {
      if (!invoiceItemsContainer) return;
      const priceEls = Array.from(invoiceItemsContainer.querySelectorAll('.item-price'));
      const total = priceEls.reduce((s, el) => s + parseFloat(String(el.value || '0').replace(/[^0-9.-]/g, '')) || 0, 0);
      
      if (amountInput) {
        if (typeof fmtMoney === 'function') amountInput.value = fmtMoney(total);
        else amountInput.value = Number(total).toFixed(2);
      }
    
      const paid = Number((paidInput?.value || '').toString().replace(/[^0-9.-]/g, '')) || 0;
      if (statusSelect) statusSelect.value = (paid >= total && total > 0) ? 'paid' : 'unpaid';
    }
    
    
    paidInput?.addEventListener('input', recalcInvoiceTotals);
  
    function resetInvoiceForm() {
      if (!editingInvoiceId) return;
      editingInvoiceId.value = '';
      customerNameInput.value = '';
      customerPhoneInput.value = '';
      invoiceDateInput.value = fmtDate(new Date());
      amountInput && (amountInput.value = '0.00');
      paidInput && (paidInput.value = '');
      if (statusSelect) statusSelect.value = 'unpaid';
      invoiceItemsContainer && (invoiceItemsContainer.innerHTML = '');
      invoiceItemsContainer && invoiceItemsContainer.appendChild(makeItemRow());
      formMsg && formMsg.classList.add('hidden');
      formMsg && (formMsg.textContent = '');
    }
  

//     // Example: when showing invoice create modal
// function openInvoiceCreateModal(totalAmount) {
//   const modal = document.getElementById('createInvoiceModal');
//   modal.classList.remove('hidden');

//   // Fill total
//   const totalEl = modal.querySelector('#invoiceTotal');
//   if (totalEl) totalEl.value = fmtMoney(totalAmount);

//   // Apply status behavior
//   applyStatusPaidBehavior(modal, totalAmount);
// }

    // create/open invoice toggle - hidden until clicked; createInvoiceSection has hidden-section default
    createInvoiceBtn?.addEventListener('click', () => {
      if (!createInvoiceSection) return;
      if (createInvoiceSection.classList.contains('hidden') || createInvoiceSection.classList.contains('hidden-section')) {
        resetInvoiceForm();
        createInvoiceSection.classList.remove('hidden', 'hidden-section');
      } else {
        createInvoiceSection.classList.add('hidden-section');
      }
    });
  
    addItemBtn?.addEventListener('click', () => { invoiceItemsContainer && invoiceItemsContainer.appendChild(makeItemRow()); recalcInvoiceTotals(); });
  



    saveInvoiceBtn?.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) { toast('You must be logged in.', 'error'); return; }
      const name = customerNameInput?.value.trim();
      const phone = customerPhoneInput?.value.trim();
      const date = invoiceDateInput?.value || fmtDate(new Date());
      // collect items
      const items = invoiceItemsContainer ? Array.from(invoiceItemsContainer.querySelectorAll('.grid')).map(r => {
        const nm = r.querySelector('.item-name')?.value.trim() || '';
        const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
        const qty = parseInt(r.querySelector('.item-qty')?.value) || 1;
        const total = price * (qty || 1);
        return { name: nm, price, total, qty: qty || 1 };
      }).filter(it => it.name && it.price > 0) : [];
    
      if (!items.length) { showFormError('Add at least one item with name and price.'); return; }
      const amount = Number(amountInput?.value) || 0;
      const paid = Number(paidInput?.value) || 0;
      // compute status automatically
      let status = 'unpaid';
      if (paid <= 0) status = 'unpaid';
      else if (paid >= amount) status = 'paid';
      else status = 'partial';
    
      if (!name) { showFormError('Customer name required'); return; }
      if (!phone) { showFormError('Customer phone required'); return; }
    
      const all = getAllInvoices();
      const id = editingInvoiceId?.value || `INV-${Date.now()}`;
      // keep prevPaid if partial to support toggling back
      const payload = { id, store: user.name, date, customer: name, phone, items, amount, paid, status };
      if (status === 'partial') payload.prevPaid = payload.paid; // store prevPaid for possible toggling
      const idx = all.findIndex(x => x.id === id);
      if (idx >= 0) all[idx] = payload; else all.push(payload);
      saveAllInvoices(all);
      resetInvoiceForm();
      createInvoiceSection.classList.add('hidden');
      renderInvoiceTable();
      window.dispatchEvent(new Event('dataUpdated'));
      toast('Invoice saved', 'success');
    });
    
  
    function showFormError(msg) { formMsg && (formMsg.textContent = msg, formMsg.classList.remove('hidden')); toast(msg, 'error'); }
  
    /* ============= INVOICE LIST & ACTIONS ============= */
    function filteredInvoicesForUI() {
      const user = getCurrentUser();
      if (!user) return [];
      const statusVal = filterStatus?.value || 'all';
      const searchVal = (searchName?.value || '').toLowerCase();
      return getStoreInvoices(user.name).filter(inv => {
        const statusOk = statusVal === 'all' ? true : inv.status === statusVal;
        const searchOk = !searchVal || (inv.customer && inv.customer.toLowerCase().includes(searchVal)) || (inv.phone && String(inv.phone).includes(searchVal)) || (inv.id && inv.id.toLowerCase().includes(searchVal));
        return statusOk && searchOk;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    function renderInvoiceTable() {
      if (!invoiceRows) return;
      const list = filteredInvoicesForUI();
      invoiceRows.innerHTML = '';
      if (!list.length) {
        emptyStateInv && emptyStateInv.classList.remove('hidden');
        return;
      } else {
        emptyStateInv && emptyStateInv.classList.add('hidden');
      }
    
      const mobile = window.matchMedia('(max-width:640px)').matches;
      const storeName = getCurrentUser()?.name || '';
    
      list.forEach((invObj, idx) => {
        const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
        const balanceColorClass = balance <= 0 ? 'text-emerald-600' : 'text-rose-600';
    
        let badgeClass = 'bg-amber-100 text-amber-700';
        let badgeText = escapeHtml(invObj.status || '');
        if (invObj.status === 'paid') {
          badgeClass = 'bg-emerald-100 text-emerald-700';
        } else if (invObj.status === 'partial') {
          badgeClass = 'bg-yellow-100 text-yellow-800';
        } else if (invObj.status === 'unpaid') {
          badgeClass = 'bg-rose-100 text-rose-700';
        }
    
        const toggleIcon = invObj.status === 'paid'
          ? '<i class="fas fa-check"></i>'
          : (invObj.status === 'partial' ? '<i class="fas fa-hourglass-half"></i>' : '<i class="fas fa-xmark"></i>');
    
        if (mobile) {
          const tr = document.createElement('tr');
          tr.className = 'border-b';
          tr.innerHTML = `
            <td colspan="10" class="p-2">
<div class="sm-card p-3 bg-gray-50 rounded-xl shadow-md">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold">
                    ${(storeName || 'S').slice(0, 2).toUpperCase()}
                  </div>
                  <div style="flex:1;">
                    <div class="font-semibold">Invoice ${escapeHtml(invObj.id)}</div>
                    <div class="text-sm text-gray-500">${fmtDate(invObj.date)} • ${escapeHtml(invObj.customer || '')}</div>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-between">
                  <div class="text-sm">${escapeHtml(invObj.phone || '')}</div>
                  <div class="text-right">
                    <div class="font-semibold">${fmtMoney(invObj.amount)}</div>
                    <div class="text-xs ${balanceColorClass}">
                      <span class="${badgeClass} px-2 py-1 rounded text-xs">${badgeText}</span>
                      &nbsp;•&nbsp;${fmtMoney(balance)}
                    </div>
                  </div>
                </div>
                <div class="mt-3 flex items-center gap-2 flex-wrap">
                  <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                  <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${toggleIcon}</button>
                  <button class="action-icon" data-action="wa" data-id="${invObj.id}" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
                  <button class="action-icon" data-action="sms" data-id="${invObj.id}" title="SMS"><i class="fas fa-sms"></i></button>
                  <button class="action-icon" data-action="call" data-id="${invObj.id}" title="Call"><i class="fas fa-phone"></i></button>
                  <button class="action-icon" data-action="print" data-id="${invObj.id}" title="Print"><i class="fas fa-print"></i></button>
                  <button class="action-icon text-red-600" data-action="delete" data-id="${invObj.id}" title="Delete"><i class="fas fa-trash"></i></button>
                  <button class="action-icon share-btn" data-action="share" data-id="${invObj.id}" title="Share"><i class="fas fa-share-nodes"></i></button>
                </div>
              </div>
            </td>
          `;
          invoiceRows.appendChild(tr);
        } else {
          const tr = document.createElement('tr');
          tr.className = 'border-b';
          tr.innerHTML = `
            <td class="p-2">${idx + 1}</td>
            <td class="p-2">${escapeHtml(invObj.id)}</td>
            <td class="p-2">${fmtDate(invObj.date)}</td>
            <td class="p-2">${escapeHtml(invObj.customer || '')}</td>
            <td class="p-2">${escapeHtml(invObj.phone || '')}</td>
            <td class="p-2 text-right">${fmtMoney(invObj.amount)}</td>
            <td class="p-2 text-right">${fmtMoney(invObj.paid)}</td>
            <td class="p-2 text-right ${balanceColorClass}">${fmtMoney(balance)}</td>
            <td class="p-2"><span class="${badgeClass} px-2 py-1 rounded text-xs">${badgeText}</span></td>
            <td class="p-2 no-print">
              <div class="flex gap-2">
                <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${toggleIcon}</button>
                <button class="action-icon" data-action="wa" data-id="${invObj.id}" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
                <button class="action-icon" data-action="sms" data-id="${invObj.id}" title="SMS"><i class="fas fa-sms"></i></button>
                <button class="action-icon" data-action="call" data-id="${invObj.id}" title="Call"><i class="fas fa-phone"></i></button>
                <button class="action-icon" data-action="print" data-id="${invObj.id}" title="Print"><i class="fas fa-print"></i></button>
                <button class="action-icon text-red-600" data-action="delete" data-id="${invObj.id}" title="Delete"><i class="fas fa-trash"></i></button>
                <button class="action-icon share-btn" data-action="share" data-id="${invObj.id}" title="Share"><i class="fas fa-share-nodes"></i></button>
              </div>
            </td>
          `;
          invoiceRows.appendChild(tr);
        }
      });
    }
    

  
    // invoice action listener
    invoiceRows?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const all = getAllInvoices();
      const idx = all.findIndex(x => x.id === id);
      if (idx < 0) return;
      const user = getCurrentUser();
      if (!user || String(all[idx].store || '').toLowerCase() !== String(user.name || '').toLowerCase()) { toast('Not allowed', 'error'); return; }
  
      if (action === 'delete') {
        if (confirm('Move this invoice to recycle bin?')) {
          // move a copy to recycle bin
          moveToTrash(user.name, 'invoice', all[idx]);
      
          // remove from the invoices array and save
          all.splice(idx, 1);
          saveAllInvoices(all);
      
          // update UI + global listeners
          renderInvoiceTable();
          window.dispatchEvent(new Event('dataUpdated'));
          toast('Invoice moved to recycle bin', 'success');
              }
      
      }
       else if (action === 'toggle') {
        const inv = all[idx];
        // toggling behavior:
        // - if not paid => mark paid (store prevPaid)
        // - if paid => restore prevPaid or set to unpaid
        if (inv.status !== 'paid') {
          // store previous paid state for undo
          inv.prevPaid = Number(inv.paid) || 0;
          inv.paid = Number(inv.amount) || 0;
          inv.status = 'paid';
        } else {
          // currently paid -> revert
          const prev = Number(inv.prevPaid) || 0;
          if (prev > 0 && prev < Number(inv.amount || 0)) {
            inv.paid = prev;
            inv.status = 'partial';
          } else {
            inv.paid = 0;
            inv.status = 'unpaid';
          }
          delete inv.prevPaid;
        }
        saveAllInvoices(all);
        renderInvoiceTable();
        window.dispatchEvent(new Event('dataUpdated'));
      }
      
       if (action === 'edit') {
        const invObj = all[idx];
        createInvoiceSection?.classList.remove('hidden', 'hidden-section');
        editingInvoiceId && (editingInvoiceId.value = invObj.id);
        customerNameInput && (customerNameInput.value = invObj.customer || '');
        customerPhoneInput && (customerPhoneInput.value = invObj.phone || '');
        invoiceDateInput && (invoiceDateInput.value = invObj.date || fmtDate(new Date()));
        amountInput && (amountInput.value = fmtMoney(invObj.amount || 0));
        paidInput && (paidInput.value = invObj.paid || 0);
        statusSelect && (statusSelect.value = invObj.status || 'unpaid');
        if (invoiceItemsContainer) {
          invoiceItemsContainer.innerHTML = '';
          (invObj.items || []).forEach(it => invoiceItemsContainer.appendChild(makeItemRow(it)));
          if ((invObj.items || []).length === 0) invoiceItemsContainer.appendChild(makeItemRow());
        }
      } else if (action === 'wa') {
        sendReminderFor(all[idx], 'wa');
      } else if (action === 'sms') {
        sendReminderFor(all[idx], 'sms');
      } else if (action === 'call') {
        const phone = cleanPhone(all[idx].phone || '');
        if (!phone) return toast('No phone provided', 'error');
        window.open(`tel:+${phone}`, '_self');
      } else if (action === 'print') {
        // print invoice (open printable new window and call print)
        printInvoice(all[idx]);
      } else if (action === 'share') {
        const card = btn.closest('.sm-card') || btn.closest('tr') || btn.parentElement;
        if (card) captureElementAsImage(card, `${all[idx].id}_${Date.now()}.png`);
        else toast('Cannot locate card to share.', 'error');
      }
    });
  
    /* =========================
       PRINT / CAPTURE
       ========================= */
   /* -------------------------
   1) printInvoice (localized title/labels read from page)
   ------------------------- */
function printInvoice(inv) {
  const balance = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
  const win = window.open('', 'PRINT', 'height=650,width=900');
  const store = getCurrentUser() || {};

  // get localized labels from DOM (fallback to english)
  const invoiceLabel = (document.querySelector('#createInvoiceSection h2')?.textContent || 'Invoice').trim();
  const storeLabel   = (document.querySelector('[data-i18n="storeLabel"]')?.textContent || 'Store').trim(); // optional element if you have one
  const dateLabel    = (document.querySelector('[data-i18n="invoiceDateLabel"]')?.textContent || 'Date').trim();
  const customerLabel = (document.querySelector('[data-i18n="customerNameLabel"]')?.textContent || 'Customer').trim();
  const phoneLabel   = (document.querySelector('[data-i18n="customerPhoneLabel"]')?.textContent || 'Phone').trim();
  const productHdr   = (document.querySelector('#thName')?.textContent || 'Product').trim();
  const qtyHdr       = (document.querySelector('#thQty')?.textContent || 'Qty').trim();
  const priceHdr     = (document.querySelector('#thPrice')?.textContent || 'Price').trim();
  const totalHdr     = (document.querySelector('#reportsTable thead th:nth-child(4)')?.textContent || 'Total').trim();

  const head = `
    <html><head><title>${escapeHtml(invoiceLabel)} ${escapeHtml(inv.id)}</title>
    <meta charset="utf-8">
    <style>
      body{font-family:sans-serif;padding:20px;color:#111}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{padding:8px;border:1px solid #ddd;text-align:left}
      th{background:#f4f4f4}
      h1{font-size:18px;margin-bottom:6px}
      .meta{color:#444;font-size:13px;margin-bottom:12px}
    </style>
    </head><body>
  `;
  const content = `
    <h1>${escapeHtml(invoiceLabel)} ${escapeHtml(inv.id)}</h1>
    <p class="meta">
      <strong>${escapeHtml(storeLabel)}:</strong> ${escapeHtml(store.name||'Supermarket')}<br/>
      <strong>${escapeHtml(dateLabel)}:</strong> ${fmtDate(inv.date)}<br/>
      <strong>${escapeHtml(customerLabel)}:</strong> ${escapeHtml(inv.customer||'Walk-in')}<br/>
      <strong>${escapeHtml(phoneLabel)}:</strong> ${escapeHtml(inv.phone||'')}
    </p>
    <table>
      <thead><tr>
        <th>${escapeHtml(productHdr)}</th>
        <th>${escapeHtml(qtyHdr)}</th>
        <th>${escapeHtml(priceHdr)}</th>
        <th>${escapeHtml(totalHdr)}</th>
      </tr></thead>
      <tbody>
        ${(inv.items||[]).map(it => `<tr>
          <td>${escapeHtml(it.name||it.product||'Item')}</td>
          <td>${escapeHtml(String(it.qty||1))}</td>
          <td>${fmtMoney(it.price||0)}</td>
          <td>${fmtMoney(it.total||((it.price||0)*(it.qty||1)))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="meta">
      <strong>${escapeHtml(document.querySelector('[data-i18n="totalAmountLabel"]')?.textContent || 'Amount')}:</strong> ${fmtMoney(inv.amount)}<br/>
      <strong>${escapeHtml(document.querySelector('[data-i18n="amountPaidLabel"]')?.textContent || 'Paid')}:</strong> ${fmtMoney(inv.paid)}<br/>
      <strong>${escapeHtml(document.querySelector('[data-i18n="balanceLabel"]')?.textContent || 'Balance')}:</strong> ${fmtMoney(balance)}<br/>
      <strong>${escapeHtml(document.querySelector('[data-i18n="statusLabel"]')?.textContent || 'Status')}:</strong> ${escapeHtml(inv.status || '')}
    </p>
  `;
  const footer = `</body></html>`;

  win.document.write(head + content + footer);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { toast('Print failed', 'error'); } }, 250);
}

  
    function captureElementAsImage(el, filename = 'capture.png') {
      if (!el) return toast('Nothing to capture', 'error');
      if (typeof html2canvas === 'undefined') {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = () => doCapture();
        s.onerror = () => toast('Failed to load capture library.', 'error');
        document.head.appendChild(s);
      } else doCapture();
      function doCapture() {
        // use html2canvas to get image
        html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
          const data = canvas.toDataURL('image/png');
          const a = document.createElement('a'); a.href = data; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        }).catch(err => { console.error(err); toast('Capture failed', 'error'); });
      }
    }
  
    /* =========================
       FILTERS / clear paid
       ========================= */
    filterStatus?.addEventListener('change', renderInvoiceTable);
    searchName?.addEventListener('input', renderInvoiceTable);
    clearPaidBtn?.addEventListener('click', () => {
      const user = getCurrentUser(); if (!user) return;
      if (!confirm('Clear all PAID invoices?')) return;
      let all = getAllInvoices();
      all = all.filter(inv => !(String(inv.store || '').toLowerCase() === String(user.name || '').toLowerCase() && inv.status === 'paid'));
      saveAllInvoices(all); renderInvoiceTable(); window.dispatchEvent(new Event('dataUpdated')); toast('Paid invoices removed', 'success');
    });
  

/* =========================
   REMINDERS / MESSAGING (status-aware, single-send immediate)
   ========================= */

/**
 * Build status-aware line for an invoice (Somali)
 * Example lines:
 *  - "Mahadsanid Zakariye, lacagtadii hore ee lagugu lahaay waa 100.00. Haraaga hadda waa 0.00. (Inv: I-1)"
 *  - "Zakariye, waxaa wali kugu dhiman 25.00. Lacagta guud ee lagu leeyahay waa 125.00. (Inv: I-2)"
 *  - "Zakariye, lacagta laguugu leeyahay waa 200.00. (Inv: I-3)"
 */
   
/* =========================
   REMINDERS / MESSAGING (status-aware, bulk flow with persistent modal)
   ========================= */

/* helper: build a status-aware line for a single invoice */
function buildInvoiceStatusLine(inv) {
  const customer = inv.customer || '';
  const amount = Number(inv.amount) || 0;
  const paid = Number(inv.paid) || 0;
  const balance = Math.max(0, amount - paid);
  const id = inv.id || '';

  if (inv.status === 'paid') {
    return ` ${customer}, Waxaad bixisay Lacag dhan: ${fmtMoney(amount)}. Haraaga hadda waa ${fmtMoney(balance)}. Mahadsanid`;
  }
  if (inv.status === 'partial') {
    return `${customer}, waxaa wali kugu dhiman lacag dhan ${fmtMoney(balance)}. Fadlan iska bixi lacagta kugu hartay. Mahadsanid`;
  }
  return `${customer}, lacagta laguugu leeyahay waa ${fmtMoney(amount)}. Fadlan iska bixi`;
}

/* single invoice message (immediate send behavior remains) */
function buildSingleReminderMessage(inv) {
  const storeName = getCurrentUser()?.name || '';
  const storePhone = getCurrentUser()?.phone || '';
  const line = buildInvoiceStatusLine(inv);
  const body = `${line}\n${storeName} (${storePhone}).`;
  return `Xasuusin: ${body}`;
}

/* Short grouped summary message */
function buildGroupedReminderMessage(group) {
  const storeName = getCurrentUser()?.name || '';
  const storePhone = getCurrentUser()?.phone || '';
  const customer = group.customer || '';
  const invoices = Array.isArray(group.invoices) ? group.invoices : [];

  const totalBalance = invoices.reduce((acc, inv) => {
    const a = Number(inv.amount) || 0;
    const p = Number(inv.paid) || 0;
    return acc + Math.max(0, a - p);
  }, 0);

  const ids = invoices.map(i => i.id).join(',') || '';
  // concise Somali summary
  return `Xasuusin: ${customer}, lacagta guud ee laguugu leeyahay waa ${fmtMoney(totalBalance)} (Invoices: ${ids}).\n${storeName} (${storePhone}). Mahadsanid.`;
}

/* ----------------------
   Bulk reminder modal (persistent)
   - Use for Send / Skip / Stop per-group
   - Keeps visible while user visits WA/SMS and returns
   ---------------------- */
/* Modern, responsive bulk reminder modal (buttons stay on one line even on mobile) */
function createBulkReminderModal() {
  let modal = document.getElementById('reminderBulkModal');
  if (modal) return modal;

  const html = `
    <div id="reminderBulkModal" class="hidden fixed inset-0 z-70 flex items-center justify-center p-4">
      <!-- modern translucent backdrop with blur (not plain gray) -->
      <div class="absolute inset-0" style="
        background: linear-gradient(180deg, rgba(2,6,23,0.10), rgba(2,6,23,0.45));
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      "></div>

      <!-- card -->
      <div class="relative w-full max-w-2xl mx-4 bg-white/95 dark:bg-[#071021]/95 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl p-4 sm:p-6">
        <!-- close btn -->
        <button id="reminderBulkClose" aria-label="Close" class="absolute right-3 top-3 text-gray-600 hover:text-gray-900 dark:text-gray-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <h3 id="reminderBulkHeader" class="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100"></h3>

        <div id="reminderBulkBody" class="mb-3 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200"></div>

        <div id="reminderBulkProgress" class="mb-4 text-xs text-gray-500 dark:text-gray-400"></div>

        <!-- ACTIONS: single horizontal line on all sizes; will scroll horizontally on very small screens -->
        <div class="flex flex-row gap-3 items-center justify-end flex-nowrap overflow-x-auto" style="padding-top:6px">
          <button id="reminderBulkSend" class="flex-shrink-0 min-w-[88px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition">
            Send
          </button>

          <button id="reminderBulkStop" class="flex-shrink-0 min-w-[88px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition">
            Stop
          </button>

          <button id="reminderBulkSkip" class="flex-shrink-0 min-w-[88px] px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black transition">
            Skip
          </button>
        </div>
      </div>
    </div>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  modal = document.getElementById('reminderBulkModal');

  // Wire the Close button to hide modal (keeps modal in DOM for reuse)
  const closeBtn = modal.querySelector('#reminderBulkClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Also hide modal when clicking the backdrop area
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) modal.classList.add('hidden');
  });

  return modal;
}

/**
 * Show interactive bulk confirmation for one group.
 * - group: { customer, phone, invoices }
 * - progressStr: like "2/5"
 * - messageText: preview message to send
 * - method: 'wa'|'sms'
 * Returns Promise resolving one of: 'send'|'skip'|'stop'
 *
 * Note: the Send button will open the WA/SMS link synchronously (user gesture),
 * preventing popup blocking. The modal remains visible until user acts.
 */
function showBulkConfirm(group, progressStr, messageText, method = 'wa') {
  return new Promise((resolve) => {
    const modal = createBulkReminderModal();
    const header = modal.querySelector('#reminderBulkHeader');
    const body = modal.querySelector('#reminderBulkBody');
    const progressEl = modal.querySelector('#reminderBulkProgress');
    const btnSend = modal.querySelector('#reminderBulkSend');
    const btnSkip = modal.querySelector('#reminderBulkSkip');
    const btnStop = modal.querySelector('#reminderBulkStop');

    // fill content
    header.textContent = `${progressStr} Xasuusin — ${group.customer || ''}`;
    body.textContent = messageText;
    progressEl.textContent = `Invoices: ${ (group.invoices || []).length } • Total: ${fmtMoney(group.totalBalance || 0) }`;

    // ensure visible
    modal.classList.remove('hidden');

    // clean previous handlers (safe)
    btnSend.replaceWith(btnSend.cloneNode(true));
    btnSkip.replaceWith(btnSkip.cloneNode(true));
    btnStop.replaceWith(btnStop.cloneNode(true));

    // re-select buttons
    const sendBtn = modal.querySelector('#reminderBulkSend');
    const skipBtn = modal.querySelector('#reminderBulkSkip');
    const stopBtn = modal.querySelector('#reminderBulkStop');

    // Compute phone and message (done here so send handler is simple)
    const phoneRaw = group.phone || (group.invoices && group.invoices[0] && group.invoices[0].phone) || '';
    const phone = cleanPhone(phoneRaw || '');
    const msg = encodeURIComponent(messageText);

    function cleanupAndResolve(result) {
      modal.classList.add('hidden');
      // keep modal in DOM for reuse but remove active listeners by replacing nodes (done above)
      resolve(result);
    }

    // Send handler: must call window.open synchronously
    sendBtn.addEventListener('click', function onSend(e) {
      // open the appropriate link and keep modal visible briefly (we will resolve)
      if (!phone) {
        toast('No phone available for this group', 'error');
        cleanupAndResolve('skip');
        return;
      }
      try {
        if (method === 'wa') {
          // WhatsApp uses wa.me with no '+' and prefilled text
          const url = `https://wa.me/${phone.replace(/^\+/, '')}?text=${msg}`;
          window.open(url, '_blank');
        } else {
          // SMS (open in new tab/window or use sms: scheme)
          const url = `sms:+${phone}?&body=${msg}`;
          window.open(url, '_blank');
        }
      } catch (err) {
        console.error('Failed to open messaging URL', err);
        toast('Failed to open messaging app', 'error');
        cleanupAndResolve('skip');
        return;
      }
      // The action was user-initiated, count as send
      cleanupAndResolve('send');
    });

    skipBtn.addEventListener('click', function onSkip() {
      cleanupAndResolve('skip');
    });

    stopBtn.addEventListener('click', function onStop() {
      cleanupAndResolve('stop');
    });

    // also support keyboard Enter/Escape
    function onKey(e) {
      if (e.key === 'Escape') { cleanupAndResolve('stop'); }
      if (e.key === 'Enter') { /* treat Enter as send */ sendBtn.click(); }
    }
    document.addEventListener('keydown', onKey, { once: true });

    // focus the Send button for quick keyboard action
    sendBtn.focus();
  });
}

/* Final summary modal using bulk modal area (OK-only) */
function showFinalSummaryModal(total, sent, skipped) {
  return new Promise((resolve) => {
    const modal = createBulkReminderModal();
    const header = modal.querySelector('#reminderBulkHeader');
    const body = modal.querySelector('#reminderBulkBody');
    const progressEl = modal.querySelector('#reminderBulkProgress');
    const btnSend = modal.querySelector('#reminderBulkSend');
    const btnSkip = modal.querySelector('#reminderBulkSkip');
    const btnStop = modal.querySelector('#reminderBulkStop');

    // configure appearance for summary
    header.textContent = `Reminders Completed`;
    body.textContent = `Dhamaan ${total} macaamiil ayaa la tijaabiyey.\n\nDiray: ${sent}\nSkipped: ${skipped}`;
    progressEl.textContent = '';

    // Show only one OK button: reuse "Send" as OK visually
    btnSend.textContent = 'OK';
    btnSend.classList.remove('bg-emerald-600');
    btnSend.classList.add('bg-slate-700');
    btnSkip.style.display = 'none';
    btnStop.style.display = 'none';

    // show modal
    modal.classList.remove('hidden');

    function cleanup() {
      // restore skip/stop visibility for later use
      btnSkip.style.display = '';
      btnStop.style.display = '';
      btnSend.textContent = 'Send';
      btnSend.classList.remove('bg-slate-700');
      btnSend.classList.add('bg-emerald-600');
    }

    // ensure single click handler
    btnSend.replaceWith(btnSend.cloneNode(true));
    const okBtn = modal.querySelector('#reminderBulkSend');
    okBtn.addEventListener('click', () => {
      cleanup();
      modal.classList.add('hidden');
      resolve(true);
    });

    okBtn.focus();
  });
}

/* ---------- BULK FLOW using the interactive modal (no native confirm) ---------- */
/**
 * This flow shows a persistent modal for each group.
 * Buttons:
 *  - Send -> opens WA/SMS (synchronous) and marks sent
 *  - Skip -> skips current customer
 *  - Stop -> aborts the whole bulk flow
 *
 * At the end it shows a final summary modal with counts.
 */
async function sendAllRemindersFlow(method) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) return toast('Login required', 'error');

  const invoices = filteredInvoicesForUI().filter(inv => {
    const bal = (Number(inv.amount) || 0) - (Number(inv.paid) || 0);
    return bal > 0;
  });
  if (!invoices.length) return toast('No customers need reminders based on current filter/search.', 'info');

  // group by cleaned phone + customer
  const groupsMap = new Map();
  invoices.forEach(inv => {
    const rawPhone = inv.phone || '';
    const phoneKey = cleanPhone(rawPhone) || rawPhone || '';
    const customer = (inv.customer || '').trim();
    const key = `${phoneKey}||${customer}`;
    if (!groupsMap.has(key)) groupsMap.set(key, { customer, phone: phoneKey, totalBalance: 0, invoices: [] });
    const g = groupsMap.get(key);
    const bal = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
    g.totalBalance += bal;
    g.invoices.push(inv);
  });

  const groups = Array.from(groupsMap.values());
  if (!groups.length) return toast('No groups to remind', 'info');

  let sentCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const progressStr = `${i + 1}/${groups.length}`;
    const preview = buildGroupedReminderMessage(g);

    // pick effective phone
    const effectivePhone = cleanPhone(g.phone || '') || (g.invoices[0] && cleanPhone(g.invoices[0].phone || '')) || '';
    if (!effectivePhone) {
      console.warn('Skipping group (no phone):', g);
      toast(`Skipping ${g.customer || 'unknown'} - no phone number`, 'warn');
      skippedCount++;
      continue;
    }

    // show interactive modal and wait for user action
    const action = await showBulkConfirm(g, progressStr, preview, method);

    if (action === 'send') {
      sentCount++;
      // small polite delay so WA/SMS opens and modal is still usable on return
      await new Promise(r => setTimeout(r, 300));
      continue;
    }
    if (action === 'skip') {
      skippedCount++;
      toast(`Skipped ${g.customer || ''}`, 'info');
      continue;
    }
    if (action === 'stop') {
      // user aborted
      toast('Bulk reminders cancelled', 'info');
      break;
    }
  }

  // show final summary and wait for OK
  await showFinalSummaryModal(groups.length, sentCount, skippedCount);
}

/* ------------------- Wire "Send All Reminders" button ------------------- */
(function wireSendAllReminders() {
  const BUTTON_ID = 'sendAllReminders';
  const METHOD_IDS = ['reminderMethod', 'reminderMethodSelect', 'reminder-method', 'reminderMethodBtn'];

  function getMethodElement() {
    for (const id of METHOD_IDS) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    const sel = document.querySelector('select[name="reminderMethod"]');
    if (sel) return sel;
    return null;
  }
  function getSelectedMethod() {
    const el = getMethodElement();
    if (!el) return 'wa';
    return (el.value || 'wa').toLowerCase();
  }

  function attach() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      console.warn(`[reminders] Button #${BUTTON_ID} not found — bulk reminders unavailable.`);
      return;
    }
    if (btn.dataset.remindersWired === '1') return;
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const method = getSelectedMethod();
      try {
        await sendAllRemindersFlow(method);
      } catch (err) {
        console.error('[reminders] sendAllRemindersFlow error', err);
        toast('Failed to send all reminders', 'error');
      }
    });
    btn.dataset.remindersWired = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

  window.testSendAllReminders = window.testSendAllReminders || function (method = 'wa') {
    console.log('[reminders] manual test start (method=%s)', method);
    return sendAllRemindersFlow(method).then(() => console.log('[reminders] manual test complete')).catch(e => console.error('[reminders] manual test failed', e));
  };
})();

/* ------------------- Single/group send helpers (unchanged) ------------------- */

/* immediate single send (no confirmation modal) */
function sendReminderForSingle(invObj, method) {
  if (!invObj) return;
  const phone = cleanPhone(invObj.phone || '');
  if (!phone) {
    toast('No phone number for this invoice.', 'error');
    console.warn('sendReminderForSingle: missing phone', invObj);
    return;
  }
  const msg = buildSingleReminderMessage(invObj);
  if (method === 'wa') {
    window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
  } else {
    window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
  }
}

/* grouped send (called standalone, e.g., from row action) */
function sendReminderForGrouped(group, method) {
  if (!group) {
    console.warn('sendReminderForGrouped: invalid group', group);
    return;
  }
  let phone = cleanPhone(group.phone || '');
  if (!phone && Array.isArray(group.invoices) && group.invoices.length) {
    phone = cleanPhone(group.invoices[0].phone || '');
  }
  if (!phone) {
    toast('No phone available for this group.', 'error');
    return;
  }
  const msg = buildGroupedReminderMessage(group);
  if (method === 'wa') {
    window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
  } else {
    window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
  }
}

/* Dispatcher: call single or grouped send (keeps other code paths unchanged) */
function sendReminderFor(target, method) {
  if (!target) return toast('Invalid reminder target', 'error');
  if (target.id) {
    sendReminderForSingle(target, method);
    return;
  }
  if (Array.isArray(target.invoices)) {
    const preview = buildGroupedReminderMessage(target);
    // show async modal (existing function kept elsewhere) or directly call grouped send
    showReminderConfirmCompatModal(target, `1/1`, preview).then(ok => {
      if (ok) sendReminderForGrouped(target, method);
    }).catch(err => {
      console.error('showReminderConfirm failed', err);
      toast('Could not show confirmation', 'error');
    });
    return;
  }
  if (Array.isArray(target)) {
    const group = { customer: '', phone: '', invoices: target, totalBalance: target.reduce((s,i)=> s + Math.max(0,(Number(i.amount)||0)-(Number(i.paid)||0)),0) };
    const preview = buildGroupedReminderMessage(group);
    showReminderConfirmCompatModal(group, `1/1`, preview).then(ok => {
      if (ok) sendReminderForGrouped(group, method);
    });
    return;
  }
  toast('Invalid reminder target', 'error');
}

/* =========================
     REPORTS: filters, rendering, export, delete
     ========================= */

  // helper to filter by period
  function getReportsFiltered(period = 'lifetime', dateStr = '', search = '') {
    const all = getAllReports() || [];
    let filtered = all.slice();
    const now = new Date();
    if (period === 'daily') {
      filtered = filtered.filter(r => {
        const d = new Date(r.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      });
    } else if (period === 'weekly') {
      const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
      filtered = filtered.filter(r => new Date(r.date) >= weekAgo);
    } else if (period === 'monthly') {
      filtered = filtered.filter(r => { const d = new Date(r.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    } else if (period === 'yearly') {
      filtered = filtered.filter(r => { const d = new Date(r.date); return d.getFullYear() === now.getFullYear(); });
    }
    // dateStr override (specific date)
    if (dateStr) {
      try {
        const target = new Date(dateStr);
        filtered = filtered.filter(r => {
          const d = new Date(r.date);
          return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
        });
      } catch (e) {}
    }
    // search across products, customer, phone
    const sq = (search || '').toString().toLowerCase().trim();
    if (sq) {
      filtered = filtered.filter(r => {
        const prodStr = (r.items || []).map(it => (it.name || '')).join(' ').toLowerCase();
        return (r.customer || '').toLowerCase().includes(sq) || (r.phone || '').toLowerCase().includes(sq) || prodStr.includes(sq) || (r.id||'').toLowerCase().includes(sq);
      });
    }
    // only reports for current store
    const user = getCurrentUser();
    if (user) filtered = filtered.filter(r => String(r.store || '').toLowerCase() === String(user.name || '').toLowerCase());
    // newest first
    filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
    return filtered;
  }

  // render reports into table (desktop) or cards (mobile)
  function renderReports() {
    if (!reportsRows) return;
    const period = (reportsPeriod?.value) || 'lifetime';
    const dateStr = (reportsDate?.value) || '';
    const search = (reportsSearchInput?.value || '').toLowerCase();
    const list = getReportsFiltered(period, dateStr, search);

    reportsRows.innerHTML = '';

    // summary counts
    reportsTotalItems && (reportsTotalItems.textContent = list.reduce((s, r) => s + (Array.isArray(r.items) ? r.items.length : 0), 0));
    reportsTotalSales && (reportsTotalSales.textContent = fmtMoney(list.reduce((s, r) => s + (Number(r.amount) || 0), 0)));

    // empty message
    if (!list.length) {
      document.getElementById('reportsEmptyMsg')?.classList.remove('hidden');
    } else {
      document.getElementById('reportsEmptyMsg')?.classList.add('hidden');
    }

    const mobile = window.matchMedia('(max-width:640px)').matches;

    // toggle table header if present
    const thead = document.querySelector('#reportsTable thead');
    if (thead) {
      if (mobile) thead.classList.add('hidden');
      else thead.classList.remove('hidden');
    }

    if (mobile) {
      // hide thead
      const wrapper = document.querySelector('#reportsReportContent .overflow-x-auto');
      if (wrapper) wrapper.style.overflowX = 'hidden';
    
      list.forEach((rpt, i) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b';
    
        const products = (rpt.items || []).map(it => escapeHtml(it.name || '')).join(', ');
        const qty = (rpt.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
    
        tr.innerHTML = `
          <td colspan="11" class="p-2">
            <div class="p-3 bg-white rounded-xl shadow space-y-2">
              <!-- Header -->
              <div class="flex justify-between items-center">
                <div class="font-semibold">#${i + 1} • ${products}</div>
                <div class="text-xs text-gray-500">${fmtDateTime(rpt.date)}</div>
              </div>
    
              <!-- Details grid -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span class="font-medium">Qty:</span> ${qty}</div>
                <div><span class="font-medium">Total:</span> ${fmtMoney(rpt.amount)}</div>
                <div><span class="font-medium">Paid:</span> ${fmtMoney(rpt.paid)}</div>
                <div><span class="font-medium">Due:</span> ${fmtMoney(rpt.due || 0)}</div>
                <div><span class="font-medium">Status:</span> 
                  <span class="${rpt.status === 'paid' ? 'text-emerald-600' : 'text-rose-600'}">
                    ${escapeHtml(rpt.status)}
                  </span>
                </div>
                <div><span class="font-medium">Customer:</span> ${escapeHtml(rpt.customer || '')}</div>
                <div><span class="font-medium">Phone:</span> ${escapeHtml(rpt.phone || '')}</div>
              </div>
    
              <!-- Actions -->
              <div class="mt-2 flex gap-2">
                <button class="action-icon" data-action="print-report" data-id="${rpt.id}" title="Print">
                  <i class="fa-solid fa-print"></i>
                </button>
                <button class="action-icon text-red-600" data-action="delete-report" data-id="${rpt.id}" title="Delete">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </td>
        `;
    
        reportsRows.appendChild(tr);
      });
    }
    else {
      // Desktop: show rows with columns
      list.forEach((rpt, idx) => {
        const tr = document.createElement('tr');
        const products = (rpt.items || []).map(it => escapeHtml(it.name || '')).join(', ');
        tr.innerHTML = `
          <td class="p-2">${idx + 1}</td>
          <td class="p-2">${products}</td>
          <td class="p-2">${(rpt.items || []).reduce((s,it)=>s + (Number(it.qty)||0),0)}</td>
          <td class="p-2">${fmtMoney(rpt.amount)}</td>
          <td class="p-2">${fmtMoney(rpt.paid)}</td>
          <td class="p-2">${fmtMoney(rpt.due||0)}</td>
          <td class="p-2">${escapeHtml(rpt.status)}</td>
          <td class="p-2">${escapeHtml(rpt.customer||'')}</td>
          <td class="p-2">${escapeHtml(rpt.phone||'')}</td>
          <td class="p-2">${fmtDateTime(rpt.date)}</td>
          <td class="p-2 no-print">
            <div class="flex gap-2">
              <button class="action-icon" data-action="print-report" data-id="${rpt.id}" title="Print"><i class="fa-solid fa-print"></i></button>
              <button class="action-icon text-red-600" data-action="delete-report" data-id="${rpt.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        reportsRows.appendChild(tr);
      });

      // ensure wrapper horizontal scroll visible on desktop
      const wrapper = document.querySelector('#reportsReportContent .overflow-x-auto');
      if (wrapper) wrapper.style.overflowX = '';
    }
  }

/* ---------- Helper: status label (localized) ---------- */
function getStatusLabel(status) {
  if (!status) return '';
  // prefer whatever text the #status select shows (so switching language updates labels)
  const statusSel = document.getElementById('status');
  if (statusSel) {
    const opt = Array.from(statusSel.options).find(o => String(o.value) === String(status));
    if (opt && opt.textContent) return opt.textContent.trim();
  }
  // fallback mapping for en/so
  const lang = localStorage.getItem('preferredLang') || 'en';
  const FALLBACK = {
    en: { unpaid: 'Unpaid', paid: 'Paid', partial: 'Partial' },
    so: { unpaid: 'La Bixnin', paid: 'Bixixyay', partial: 'Qeyb la bixixyay' }
  };
  return (FALLBACK[lang] && FALLBACK[lang][status]) || String(status);
}



  // hook search input so it updates results live
  reportsSearchInput?.addEventListener('input', renderReports);
  reportsPeriod?.addEventListener('change', renderReports);
  reportsDate?.addEventListener('change', renderReports);



  
  // reports action delegation (print/delete)
  reportsRows?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const reports = getAllReports() || [];
    const idx = reports.findIndex(r => r.id === id);
    if (idx < 0) return;
  
    if (action === 'delete-report') {
      if (!confirm('Move this report to recycle bin?')) return;
      const rpt = reports[idx];
  
      // use helper (like invoices) to move to trash
      moveToTrash(getCurrentUser().name, 'report', rpt);
  
      // remove from active reports list
      reports.splice(idx, 1);
      saveAllReports(reports);
  
      renderReports();
      toast('Report moved to recycle bin', 'success');
    } 

   
/* -------------------------
   3) print-report branch (single report print) - localized labels
   ------------------------- */
   else if (action === 'print-report') {
    const rpt = reports[idx];
    const win = window.open('', 'PRINT', 'height=650,width=900');
  
    // get localized header labels from DOM (thead if present)
    const headerNodes = document.querySelectorAll('#reportsTable thead th');
    const productsHdr = headerNodes && headerNodes[1] ? headerNodes[1].textContent.trim() : 'Products';
    const qtyHdr      = headerNodes && headerNodes[2] ? headerNodes[2].textContent.trim() : 'Qty';
    const totalHdr    = headerNodes && headerNodes[3] ? headerNodes[3].textContent.trim() : 'Total';
    // Paid column label (if exists)
    const paidHdr     = headerNodes && headerNodes[4] ? headerNodes[4].textContent.trim() : 'Paid';
    const statusHdr   = (document.querySelector('[data-i18n="statusLabel"]')?.textContent) || 'Status';
    const reportLabel = (document.querySelector('#reportsSection h1')?.textContent || 'Report').trim();
  
    // compute product totals sum, paid, balance
    const items = Array.isArray(rpt.items) ? rpt.items : [];
    const sumProducts = items.reduce((s, it) => {
      const price = Number(it.price || 0);
      const qty = Number(it.qty || 1);
      const total = (it.total != null) ? Number(it.total) : (price * qty);
      return s + (isFinite(total) ? total : 0);
    }, 0);
    const paid = Number(rpt.paid || 0);
    const balance = Math.max(0, sumProducts - paid);
  
    // localized status label
    const statusLabel = getStatusLabel(rpt.status);
  
    const head = `
      <html><head><meta charset="utf-8"><title>${escapeHtml(reportLabel)} ${escapeHtml(rpt.id)}</title>
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;padding:20px;color:#111}
        h1{font-size:18px;margin-bottom:6px}
        p.meta{margin:0 0 12px 0;color:#444;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
        th{background:#f4f4f4;font-weight:600}
        tfoot td { font-weight:700; text-align:right; }
        .status-paid { color: #059669; }      /* emerald-600 */
        .status-partial { color: #b45309; }   /* yellow-ish */
        .status-unpaid { color: #dc2626; }    /* rose-600 */
      </style></head><body>
    `;
  
    const rowsHtml = items.map(it => {
      const name = escapeHtml(it.name || it.product || '');
      const qty = escapeHtml(String(it.qty || 1));
      const rowTotal = Number(it.total != null ? it.total : ((Number(it.price||0) * Number(it.qty||1)) || 0));
      return `<tr>
        <td>${name}</td>
        <td style="text-align:right">${qty}</td>
        <td style="text-align:right">${fmtMoney(rowTotal)}</td>
        <td style="text-align:right">${fmtMoney(rpt.paid != null ? rpt.paid : 0)}</td>
      </tr>`;
    }).join('');
  
    // status css class
    let statusClass = 'status-unpaid';
    if (rpt.status === 'paid') statusClass = 'status-paid';
    else if (rpt.status === 'partial') statusClass = 'status-partial';
  
    const content = `
      <h1>${escapeHtml(reportLabel)} ${escapeHtml(rpt.id)}</h1>
      <p class="meta">${escapeHtml(fmtDateTime(rpt.date))} • ${escapeHtml(rpt.customer||'')}</p>
  
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(productsHdr)}</th>
            <th style="text-align:right">${escapeHtml(qtyHdr)}</th>
            <th style="text-align:right">${escapeHtml(totalHdr)}</th>
            <th style="text-align:right">${escapeHtml(paidHdr)}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">Total Amount:</td>
            <td style="text-align:right">${fmtMoney(sumProducts)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">Paid:</td>
            <td style="text-align:right">${fmtMoney(paid)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">Balance:</td>
            <td style="text-align:right">${fmtMoney(balance)}</td>
          </tr>
          <tr>
            <td colspan="2"></td>
            <td style="text-align:right">${escapeHtml(statusHdr)}:</td>
            <td style="text-align:right"><span class="${statusClass}">${escapeHtml(statusLabel)}</span></td>
          </tr>
        </tfoot>
      </table>
    `;
  
    win.document.write(head + content + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(()=>{ try { win.print(); } catch(e) { toast('Print failed','error'); } }, 250);
  }
  });

  // reports export all / delete all controls
/* -------------------------
   2) reportsExportPdf (use visible labels + option text)
   ------------------------- */
   reportsExportPdf?.addEventListener('click', async () => {
    const list = getReportsFiltered(
      reportsPeriod?.value || 'lifetime',
      reportsDate?.value || '',
      reportsSearchInput?.value || ''
    );
    if (!list.length) {
      toast((document.getElementById('reportsEmptyMsg')?.textContent || 'No reports to export'), 'error');
      return;
    }
  
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
  
      const reportsTitleLabel = (document.querySelector('#reportsSection h1')?.textContent || 'Reports').trim();
      const periodLabelText = (reportsPeriod?.options && reportsPeriod.options[reportsPeriod.selectedIndex]) ? reportsPeriod.options[reportsPeriod.selectedIndex].text : (reportsPeriod?.value || 'lifetime');
  
      doc.setFontSize(14);
      doc.text(`${reportsTitleLabel} (${periodLabelText}) - ${fmtDate(new Date())}`, 10, 10);
  
      const headerNodes = document.querySelectorAll('#reportsTable thead th');
      const colLabels = headerNodes && headerNodes.length ? Array.from(headerNodes).map(th => th.textContent.trim()) : ['#','Products','Qty','Total','Paid','Due','Status','Customer','Phone','Timestamp'];
  
      const columns = [
        { key: 'no',        label: colLabels[0] || '#',        width: 7,   align: 'right' },
        { key: 'products',  label: colLabels[1] || 'Products', width: 40,  align: 'left'  },
        { key: 'qty',       label: colLabels[2] || 'Qty',      width: 12,  align: 'right' },
        { key: 'total',     label: colLabels[3] || 'Total',    width: 20,  align: 'right' },
        { key: 'paid',      label: colLabels[4] || 'Paid',     width: 20,  align: 'right' },
        { key: 'due',       label: colLabels[5] || 'Due',      width: 20,  align: 'right' },
        { key: 'status',    label: colLabels[6] || 'Status',   width: 20,  align: 'left'  },
        { key: 'customer',  label: colLabels[7] || 'Customer', width: 30,  align: 'left'  },
        { key: 'phone',     label: colLabels[8] || 'Phone',    width: 22,  align: 'left'  },
        { key: 'time',      label: colLabels[9] || 'Timestamp',width: 36,  align: 'left'  },
      ];
  
      const marginLeft = 10;
      const marginTop  = 16;
      const lineH = 6;
      let x = marginLeft;
      columns.forEach(col => { col.x = x; x += col.width; });
  
      function drawHeaders(y) {
        doc.setFontSize(11);
        columns.forEach(col => drawText(col.label, col, y));
      }
      function drawText(text, col, y) {
        const maxW = col.width - 1;
        const lines = doc.splitTextToSize(String(text ?? ''), maxW);
        const textWidth = doc.getTextWidth(lines[0] || '');
        let tx = col.x + 1;
        if (col.align === 'right') tx = col.x + col.width - 1 - textWidth;
        doc.text(lines, tx, y);
        return lines.length;
      }
      function drawRow(rowValues, y) {
        let maxLines = 1;
        doc.setFontSize(10);
        columns.forEach(col => {
          const lines = doc.splitTextToSize(String(rowValues[col.key] ?? ''), col.width - 1);
          maxLines = Math.max(maxLines, lines.length);
        });
        columns.forEach(col => drawText(rowValues[col.key], col, y));
        return maxLines * lineH;
      }
  
      let y = marginTop + 4;
      drawHeaders(y);
      y += lineH;
  
      list.forEach((r, i) => {
        // <<=== KEY CHANGE: do NOT truncate the products array; show the full list
        const allProductNames = (Array.isArray(r.items) ? r.items.map(it => it?.name).filter(Boolean) : []);
        const productsFull = allProductNames.join(', ');
  
        const row = {
          no: i + 1,
          products: productsFull,                                  // <-- full list, no .slice()
          qty: (Array.isArray(r.items) ? r.items.reduce((a,it)=>a + (Number(it.qty)||0),0) : (Number(r.qty)||0)),
          total: fmtMoney(Number(r.total != null ? r.total : r.amount || 0)),
          paid: fmtMoney(Number(r.paid || 0)),
          due: fmtMoney(Math.max(0, (Number(r.total != null ? r.total : r.amount || 0)) - Number(r.paid || 0))),
          status: r.status || '',
          customer: r.customer || '',
          phone: r.phone || '',
          time: fmtDateTime(r.date)
        };
  
        // page break estimate
        let maxLines = 1;
        doc.setFontSize(10);
        columns.forEach(col => {
          const lines = doc.splitTextToSize(String(row[col.key] ?? ''), col.width - 1);
          maxLines = Math.max(maxLines, lines.length);
        });
        const rowH = Math.max(lineH, maxLines * lineH);
        if (y + rowH > 285) {
          doc.addPage();
          y = marginTop + 4;
          drawHeaders(y);
          y += lineH;
        }
        y += drawRow(row, y);
      });
  
      doc.save(`reports_${Date.now()}.pdf`);
      toast((document.getElementById('reportsExportPdf')?.textContent || 'PDF exported') , 'success');
    } else {
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `reports_${Date.now()}.json`;
      a.click();
      toast('Reports exported as JSON', 'success');
    }
  });
  

  reportsDeleteAll?.addEventListener('click', () => {
    if (!confirm('Delete all reports for this store?')) return;
    const user = getCurrentUser(); if (!user) return;
    let reports = getAllReports() || [];
    reports = reports.filter(r => String(r.store || '').toLowerCase() !== String(user.name || '').toLowerCase());
    saveAllReports(reports);
    renderReports();
    toast('Reports deleted for this store', 'success');
  });

  /* =========================
     INITS
     ========================= */
  function initAfterLoad() {
    // show/hide nav on auth screens
    const user = getCurrentUser();
    if (!user) {
      authSection && authSection.classList.remove('hidden');
      dashboardSection && dashboardSection.classList.add('hidden');
      showLoginForm();
      setAuthVisibility(true);
    } else {
      loadDashboard();
    }
    // prepare initial product rendering
    renderProductList(searchInput?.value || '');
    // prepare reports listing
    renderReports();

    // Ensure createInvoiceSection is hidden by default (already class hidden-section in HTML)
    if (createInvoiceSection && !createInvoiceSection.classList.contains('hidden')) createInvoiceSection.classList.add('hidden');

    // ensure settings cog next to store
  }
  document.addEventListener('DOMContentLoaded', initAfterLoad);


  /* =========================
   Settings + Drive Backup Module (mobile friendly + Help + Daily reminders)
   Replace your previous setupSettingsModuleWithDrive() with this block.
   Client ID (user-provided): 246612771655-cehl69jg1g3hj5u0mjouuum3pvu0cc1t.apps.googleusercontent.com
   ========================= */
   (function setupSettingsModuleWithDrive_v2(){

    const DRIVE_CLIENT_ID = '246612771655-cehl69jg1g3hj5u0mjouuum3pvu0cc1t.apps.googleusercontent.com';
    const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
    const LS_MSG_TPL = 'msg_templates_v1';
    const LS_NOTICES = 'notices_v1';
    const LS_SETTINGS = 'app_settings_v1';
    const BACKUP_NAME_PREFIX = 'supermarket_backup_';
  
    // helpers
    function lsGet(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return localStorage.getItem(k); } }
    function lsSet(k,v){ try { if (v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.error(e); } }
    function now(){ return Date.now(); }
    function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    // ensure Notices API exists (fallback)
    if (!window.Notices) {
      window.Notices = {
        add: ({title, body}) => {
          const all = lsGet(LS_NOTICES) || [];
          const payload = { id: `N-${Date.now()}`, title: title||'Notice', body: body||'', created: Date.now() };
          all.unshift(payload);
          lsSet(LS_NOTICES, all);
          return payload;
        },
        list: () => lsGet(LS_NOTICES) || []
      };
    }
  
    // toast fallback (non-blocking)
    if (typeof window.toast !== 'function') {
      window.toast = function(msg='', type='info') {
        try {
          const id = 'app-toast';
          const ex = document.getElementById(id);
          if (ex) ex.remove();
          const el = document.createElement('div');
          el.id = id;
          el.textContent = msg;
          el.style.position = 'fixed';
          el.style.right = '16px';
          el.style.bottom = '16px';
          el.style.zIndex = 1100;
          el.style.padding = '10px 14px';
          el.style.borderRadius = '10px';
          el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
          el.style.background = type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#eef2ff');
          el.style.color = '#0f172a';
          document.body.appendChild(el);
          setTimeout(()=> el.style.opacity = '0', 2200);
          setTimeout(()=> el.remove(), 2600);
        } catch(e){ console.log(msg); }
      };
    }
  
    // spinner overlay (mobile-friendly)
    function ensureSpinner(){
      let sp = document.getElementById('driveSpinnerOverlay');
      if (sp) return sp;
      sp = document.createElement('div');
      sp.id = 'driveSpinnerOverlay';
      sp.className = 'hidden fixed inset-0 z-100 flex items-center justify-center';
      sp.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.5)"></div>
        <div role="status" style="z-index:9999; background:var(--bg,#fff); padding:14px 16px; border-radius:12px; display:flex; gap:12px; align-items:center; max-width:92%; width:320px;">
          <svg width="36" height="36" viewBox="0 0 50 50" style="transform-origin:center" aria-hidden>
            <circle cx="25" cy="25" r="20" stroke="#0ea5e9" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="31.4 31.4">
              <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
          <div style="min-width:140px">
            <div id="driveSpinnerMsg" style="font-weight:600">Working...</div>
            <div id="driveSpinnerSub" style="font-size:12px;color:#6b7280;margin-top:6px">Please wait</div>
          </div>
        </div>
      `;
      document.body.appendChild(sp);
      return sp;
    }
    function showSpinner(msg='Working...', sub=''){ const sp = ensureSpinner(); sp.classList.remove('hidden'); document.getElementById('driveSpinnerMsg').textContent = msg; document.getElementById('driveSpinnerSub').textContent = sub; }
    function hideSpinner(){ const sp = document.getElementById('driveSpinnerOverlay'); if (sp) sp.classList.add('hidden'); }
  
    // seed defaults (safe)
    (function seed(){
      try {
        if (!lsGet(LS_NOTICES)) lsSet(LS_NOTICES, [{ id:`N-${Date.now()}`, title:'Welcome', body:'Welcome — your data is stored locally. Use Drive backup to save to Google Drive.', created: Date.now() }]);
      } catch(e){}
      try {
        if (!lsGet(LS_MSG_TPL)) lsSet(LS_MSG_TPL, { reminder_wa:'Hello {customer}, your invoice {id} has balance {balance}. - {store}', reminder_sms:'Hello {customer}, invoice {id} balance {balance}.' });
      } catch(e){}
      try {
        if (!lsGet(LS_SETTINGS)) lsSet(LS_SETTINGS, { autoRestoreOnLogin:false, autoBackup:{ enabled:false, days:7 }, lastAutoBackup:0, lastDailyReminderByStore:{} });
      } catch(e){}
    })();
  
    // Google libraries init
    let driveTokenClient = null;
    let gapiClientLoaded = false;
    function initGisIfNeeded() {
      if (driveTokenClient) return;
      if (!window.google || !google.accounts || !google.accounts.oauth2) { console.warn('GSI not loaded'); return; }
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPES,
        callback: (tokenResp) => {} // set per-call
      });
    }
    function initGapiIfNeeded(){
      if (gapiClientLoaded) return Promise.resolve();
      return new Promise((resolve,reject)=>{
        if (!window.gapi) return reject(new Error('gapi not loaded'));
        try {
          gapi.load('client', async () => {
            try { await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] }); gapiClientLoaded = true; resolve(); }
            catch(err){ reject(err); }
          });
        } catch(err){ reject(err); }
      });
    }
    function requestDriveToken(cb){
      initGisIfNeeded();
      if (!driveTokenClient) { toast('Google Identity not available', 'error'); return; }
      driveTokenClient.callback = (resp) => {
        if (resp.error) { console.error(resp); toast('Drive auth error', 'error'); return; }
        cb(resp.access_token);
      };
      try { driveTokenClient.requestAccessToken({ prompt: '' }); } catch(e){ console.error(e); toast('Drive token request failed', 'error'); }
    }
  // Updated openSettingsModal with animated help notice, expanded help content, and non-gray palette
// ========================
// Robust openSettingsModal (keeps your original content + translations)
// ========================
function openSettingsModal(){
  let modal = document.getElementById('appSettingsModal');

  // Inject small CSS for help notice animation once
  if (!document.getElementById('appSettingsModal-styles')) {
    const style = document.createElement('style');
    style.id = 'appSettingsModal-styles';
    style.innerHTML = `
      /* Help notice entrance */
      .help-notice-enter { opacity: 0; transform: translateY(-10px) scale(.98); }
      .help-notice-enter.help-notice-enter-active { opacity: 1; transform: translateY(0) scale(1); transition: all 360ms cubic-bezier(.2,.9,.25,1); }
      /* subtle shadow for modern card */
      .help-notice-card { box-shadow: 0 8px 28px rgba(14, 165, 233, 0.08); }
      /* replace some default gray hover classes fallback if developer used them elsewhere */
      .no-gray-bg { background-color: transparent !important; }
    `;
    document.head.appendChild(style);
  }

  // Helper to ensure nav visible on mobile small-screen
  function ensureSettingsNavVisible() {
    const nav = document.getElementById('settingsNav');
    if (!nav) return;
    nav.classList.remove('hidden');
    nav.style.display = 'flex';
    nav.style.flexDirection = 'row';
    nav.style.gap = '8px';
    nav.style.padding = '8px';
    nav.style.borderRight = 'none';
    nav.querySelectorAll('.settings-tab').forEach(tb => {
      tb.style.whiteSpace = 'nowrap';
      tb.style.flex = '0 0 auto';
    });
  }

  // If modal already exists -> refresh UI and show (this is the fix)
  if (modal) {
    // make sure we operate on the current modal reference
    modal = document.getElementById('appSettingsModal');

    // fill templates into textareas (if any)
    const tpl = lsGet(LS_MSG_TPL) || {};
    modal.querySelector('#settingsWaTpl') && (modal.querySelector('#settingsWaTpl').value = tpl.reminder_wa || '');
    modal.querySelector('#settingsSmsTpl') && (modal.querySelector('#settingsSmsTpl').value = tpl.reminder_sms || '');

    // ensure notices and translations are refreshed if functions exist
    try { renderNoticesUI && renderNoticesUI(); } catch(e) {}
    try { 
      const saved = localStorage.getItem('preferredLang') || 'en';
      if (typeof applyLanguage === 'function') applyLanguage(saved, false);
      else if (typeof applyLangToModal === 'function') applyLangToModal(saved);
    } catch(e){}

    // unhide and ensure panels default to helpNotice if none visible
    modal.classList.remove('hidden');
    const activePanel = modal.querySelector('.settings-panel[style*="display: block"]');
    if (!activePanel) {
      modal.querySelectorAll('.settings-panel').forEach(p => p.style.display = p.dataset.panel === 'helpNotice' ? 'block' : 'none');
      modal.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('bg-sky-50','dark:bg-sky-800'));
      const btn = modal.querySelector(`.settings-tab[data-tab="helpNotice"]`);
      if (btn) btn.classList.add('bg-sky-50');
    }

    // replay help card animation so it looks "alive" each open
    const helpCard = modal.querySelector('#helpNoticeCard');
    if (helpCard) {
      helpCard.classList.remove('help-notice-enter','help-notice-enter-active');
      void helpCard.offsetWidth;
      helpCard.classList.add('help-notice-enter');
      setTimeout(()=> { helpCard.classList.add('help-notice-enter-active'); }, 20);
      setTimeout(()=> { helpCard.classList.remove('help-notice-enter','help-notice-enter-active'); }, 420);
    }

    // ensure nav is visible on small screens (small delay to wait for modal DOM paint)
    setTimeout(ensureSettingsNavVisible, 80);
    return;
  }

  // --- Modal not present: create it (your original markup + wiring preserved) ---
  modal = document.createElement('div');
  modal.id = 'appSettingsModal';
  modal.className = 'hidden fixed inset-0 z-90 flex items-start justify-center p-4';
  modal.innerHTML = `
    <div id="appSettingsModalBackdrop" class="absolute inset-0 bg-black/60"></div>

    <div class="relative w-full max-w-3xl bg-white dark:bg-sky-900/6 rounded-lg shadow-lg overflow-auto max-h-[92vh]">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-sky-100 dark:border-sky-800">
        <div class="flex items-center gap-4">
          <h2 id="settingsTitle" class="text-lg font-semibold text-sky-800 dark:text-sky-100">Settings & Utilities</h2>

          <!-- Modern language pill toggle (sky) -->
          <div id="langToggle" class="inline-flex items-center bg-sky-50 dark:bg-sky-900/10 rounded-full p-1">
            <button id="langEnBtn" class="px-3 py-1 rounded-full text-xs font-semibold">EN</button>
            <button id="langSoBtn" class="px-3 py-1 rounded-full text-xs font-semibold">SO</button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button id="settingsHelpOpen" title="Help" class="p-2 rounded bg-sky-50 dark:bg-sky-900/10 text-sky-700"><i class="fa-solid fa-question"></i></button>
          <button id="settingsCloseBtn" class="px-3 py-1 rounded bg-sky-100 dark:bg-sky-800 text-sky-800 dark:text-sky-100">Close</button>
        </div>
      </div>

      <div class="md:flex md:gap-4">
        <!-- Left nav (sidebar on md+) -->
        <nav id="settingsNav" class="md:w-56 p-3 border-r border-sky-100 hidden md:block">
          <ul class="space-y-2 text-sm">
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="helpNotice"><i class="fa-solid fa-lightbulb mr-2 text-amber-500"></i> Help Notice</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="messages"><i class="fa-solid fa-message mr-2 text-sky-500"></i> Messages</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="helpNav"><i class="fa-solid fa-circle-info mr-2 text-emerald-500"></i> Help</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="notices"><i class="fa-solid fa-bell mr-2 text-amber-600"></i> Notices</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="export"><i class="fa-solid fa-download mr-2 text-indigo-600"></i> Export</button></li>
            <li><button class="settings-tab w-full text-left px-3 py-2 rounded hover:bg-sky-50 dark:hover:bg-sky-800 text-sky-700" data-tab="drive"><i class="fa-brands fa-google-drive mr-2 text-emerald-600"></i> Drive Backup</button></li>
          </ul>
        </nav>

        <!-- Content -->
        <div id="settingsContent" class="p-4 md:flex-1">
          <!-- Help Notice panel (modern animated card) -->
          <div class="settings-panel" data-panel="helpNotice" style="display:none">
            <div id="helpNoticeCard" class="help-notice-card flex items-start gap-3 p-4 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800">
              <div class="text-2xl">💡</div>
              <div class="flex-1">
                <div class="flex items-start justify-between">
                  <div>
                    <h4 id="helpNoticeTitle" class="font-semibold text-lg text-sky-800 dark:text-sky-100">Quick Tips</h4>
                    <div id="helpNoticeBody" class="text-sm text-sky-600 dark:text-sky-200 mt-1">Short helpful context appears here.</div>
                  </div>
                  <div class="ml-3">
                    <button id="dismissHelpNotice" class="text-xs px-2 py-1 rounded bg-white/90 dark:bg-sky-800 text-sky-700">Dismiss</button>
                  </div>
                </div>
                <div class="mt-3 flex gap-2">
                  <button id="moreHelpBtn" class="px-3 py-1 bg-sky-600 text-white rounded text-sm"><i class="fa-solid fa-book-open mr-1"></i> Full Guide</button>
                  <button id="showHelpPanelBtn" class="px-3 py-1 bg-sky-100 rounded text-sm text-sky-800">Open Help</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Messages -->
          <div class="settings-panel" data-panel="messages" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">WhatsApp / SMS Templates</h4>
            <div class="text-sm mb-2 text-sky-600 dark:text-sky-200">Placeholders: <code>{customer}</code> <code>{id}</code> <code>{balance}</code> <code>{store}</code></div>
            <div class="space-y-2">
              <textarea id="settingsWaTpl" rows="3" class="w-full border rounded p-2"></textarea>
              <textarea id="settingsSmsTpl" rows="3" class="w-full border rounded p-2"></textarea>
              <div class="flex gap-2 mt-2">
                <button id="settingsSaveMsgBtn" class="px-3 py-2 bg-sky-600 text-white rounded">Save</button>
                <button id="settingsResetMsgBtn" class="px-3 py-2 bg-sky-100 text-sky-800 rounded">Reset</button>
                <div id="settingsMsgStatus" class="text-sm text-sky-600 hidden ml-2">Saved</div>
              </div>
            </div>
          </div>

          <!-- Full Help -->
          <div class="settings-panel" data-panel="helpNav" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">Help & Full Guide</h4>
            <div class="space-y-3 text-sm">
              <div id="helpFullContent" class="prose max-w-none text-sm text-sky-600 dark:text-sky-200">
                <div id="helpIntro"><!-- localized HTML filled later --></div>

                <h5 class="text-sky-700">Invoices</h5>
                <ol class="text-sky-600">
                  <li>Create Invoice → Add customer name & phone → add items (choose product or type) → set qty & price.</li>
                  <li>Set Amount Paid and Status (Paid / Unpaid). Save to add to Reports.</li>
                  <li>To send invoice: use WhatsApp or SMS from invoice row (buttons appear on invoice actions) — ensures phone formatting (+252) when available.</li>
                </ol>

                <h5 class="text-sky-700">Send Messages / Call</h5>
                <ul class="text-sky-600">
                  <li><b>WhatsApp:</b> Click the WhatsApp icon on an invoice — it opens WhatsApp Web/mobile with the templated message. Customize templates in Settings → Messages.</li>
                  <li><b>SMS:</b> Click SMS to copy or open an SMS composer (depends on device/browser).</li>
                  <li><b>Call:</b> Use the phone icon to initiate a call on devices that support tel: links.</li>
                </ul>

                <h5 class="text-sky-700">Products</h5>
                <ul class="text-sky-600">
                  <li>Add Product → set Name, Price, Quantity. Products are available when creating invoices.</li>
                  <li>Edit stock directly from the product list. Use search to quickly find items.</li>
                </ul>

                <h5 class="text-sky-700">Dashboard & Reports</h5>
                <ul class="text-sky-600">
                  <li>Dashboard shows totals (Invoices, Products, Sales, Revenue, Profit, Expenses) — change period (Today / Weekly / Monthly / Yearly / Live).</li>
                  <li>Reports lists all saved invoices and can be exported to PDF/CSV or printed.</li>
                  <li>Use Drive Backup to snapshot your localStorage so you can restore later.</li>
                </ul>
              </div>

              <div class="mt-3 text-xs text-sky-500 dark:text-sky-400">
                Tip: On mobile, use the <b>Help</b> button (top-right) for quick access. Rotate to landscape for wider tables.
              </div>
            </div>
          </div>

          <!-- Notices -->
          <div class="settings-panel" data-panel="notices" style="display:none">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold text-sky-800 dark:text-sky-100">Notices</h4>
              <div class="flex items-center gap-2">
                <button id="translateProgrammaticNotices" class="px-2 py-1 text-xs rounded bg-sky-100 text-sky-800">Translate Notices</button>
                <button id="clearNoticesBtn" class="px-2 py-1 text-xs rounded bg-red-600 text-white">Clear All</button>
              </div>
            </div>
            <div id="settingsNotices" class="space-y-2 max-h-56 overflow-auto p-1"></div>
          </div>

          <!-- Export -->
          <div class="settings-panel" data-panel="export" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">Export</h4>
            <div class="flex gap-2 flex-wrap">
              <button id="exportInvoicesPdf" class="px-3 py-2 bg-sky-600 text-white rounded"><i class="fa-solid fa-file-pdf mr-1"></i> PDF</button>
              <button id="exportInvoicesExcel" class="px-3 py-2 bg-emerald-600 text-white rounded"><i class="fa-solid fa-file-csv mr-1"></i> CSV</button>
            </div>
          </div>

          <!-- Drive -->
          <div class="settings-panel" data-panel="drive" style="display:none">
            <h4 class="font-semibold mb-2 text-sky-800 dark:text-sky-100">Google Drive Backup</h4>
            <div class="text-sm mb-2 text-sky-600 dark:text-sky-200">Requires Google OAuth (GSI) & acceptance as test user. Backups store a JSON snapshot of localStorage.</div>
            <div class="space-y-2">
              <label class="flex items-center gap-2"><input id="optAutoRestoreLogin" type="checkbox"> Auto-check Drive on login (opt-in)</label>
              <label class="flex items-center gap-2">
                <input id="optAutoBackupEnabled" type="checkbox"> Auto backup every
                <input id="optAutoBackupDays" type="number" min="1" value="7" style="width:64px;margin-left:6px"> days
              </label>
              <div class="text-xs text-sky-500 dark:text-sky-400">Auto backups run while the app is open (background timers). Last run stored in settings.</div>
              <div class="flex gap-2 mt-2 flex-wrap">
                <button id="driveBackupBtn" class="px-3 py-2 bg-indigo-600 text-white rounded"><i class="fa-brands fa-google-drive mr-1"></i> Backup to Drive</button>
                <button id="driveRefreshBtn" class="px-3 py-2 bg-amber-500 text-white rounded"><i class="fa-solid fa-refresh mr-1"></i> Refresh List</button>
                <button id="driveRestoreLatestBtn" class="px-3 py-2 bg-red-600 text-white rounded"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Restore Latest</button>
              </div>
              <div id="driveStatus" class="mt-2 text-sm text-sky-600 dark:text-sky-200">Drive: not initialized</div>
              <div id="driveBackupList" class="mt-3 space-y-2 max-h-48 overflow-auto"></div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  /* -------------------------
     Translations + language logic
     ------------------------- */
  const LS_LANG_KEY = 'preferredLang';
  const translations = {
    en: {
      settingsTitle: "Settings & Utilities",
      closeBtn: "Close",
      helpBtnTitle: "Help",
      tabs: { helpNotice: "Help Notice", messages: "Messages", helpNav: "Help", notices: "Notices", export: "Export", drive: "Drive Backup" },
      helpNoticeTitle: "Quick Tips",
      helpNoticeBody: "Need a quick refresher? Use 'Create Invoice' to start, 'Add Product' to populate stock, and 'Drive Backup' to protect your data.",
      helpFullIntro: "<strong>Getting started:</strong> Add products, create invoices, send reminders, and export reports. Below are step-by-step help items.",
      tplDefaults: {
        reminder_wa: "Reminder: {customer}, your balance is {balance}. Please pay at {store} ({phone}).",
        reminder_sms: "Reminder: {customer}, your balance is {balance}."
      },
      savedText: "Saved",
      exportPdf: "PDF",
      exportCsv: "CSV",
      driveNotInit: "Drive: not initialized",
      noticesEmpty: "No notices.",
      programmaticNotices: {
        backup_done: { title: "Backup complete", body: "Your backup was saved to Drive." },
        restore_done: { title: "Restore complete", body: "Data restored from Drive successfully." },
        welcome: { title: "Welcome", body: "Welcome to your supermarket dashboard — quick tips available in Settings." }
      },
      translateNoticesBtn: "Translate Notices",
      clearNoticesBtn: "Clear All"
    },
    so: {
      settingsTitle: "Dejimaha & Adeegyada",
      closeBtn: "Xidh",
      helpBtnTitle: "Caawimo",
      tabs: { helpNotice: "Ogeysiis Caawimo", messages: "Fariimaha", helpNav: "Caawimo", notices: "Ogeysiisyo", export: "Dhoofin", drive: "Kaydin Drive" },
      helpNoticeTitle: "Talooyin Degdeg ah",
      helpNoticeBody: "U baahan tahay xasuusin kooban? Isticmaal 'Abuur Rasiid' si aad u bilowdo, 'Kudar Alaab' si aad u buuxiso kaydka, iyo 'Kaydin Drive' si aad xogta u ilaaliso.",
      helpFullIntro: "<strong>Sida loo bilaabo:</strong> Kudar alaabo, abuuro rasiidyo, dir xasuusin, oo dhoofso warbixinno. Hoos ka hel tallabo-tallabo caawimo.",
      tplDefaults: {
        reminder_wa: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).",
        reminder_sms: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}."
      },
      savedText: "La keydiyey",
      exportPdf: "PDF",
      exportCsv: "CSV",
      driveNotInit: "Drive: lama diyaarin",
      noticesEmpty: "Ogeysiis ma jiro.",
      programmaticNotices: {
        backup_done: { title: "Kaydin dhameystiran", body: "Kaydintaada waxaa lagu badbaadiyey Drive." },
        restore_done: { title: "Soo celin dhameystiran", body: "Xogta si guul leh ayaa looga soo celiyey Drive." },
        welcome: { title: "Soo Dhawoow", body: "Ku soo dhawoow guddiga suuqa — talooyin kooban ka hel Dejimaha." }
      },
      translateNoticesBtn: "Tarjum Ogeysiisyada",
      clearNoticesBtn: "Masax Dhammaan"
    }
  };

  /* apply translations into modal */
  function applyLangToModal(lang) {
    const t = translations[lang] || translations.en;
    document.getElementById('settingsTitle') && (document.getElementById('settingsTitle').textContent = t.settingsTitle);
    document.getElementById('settingsCloseBtn') && (document.getElementById('settingsCloseBtn').textContent = t.closeBtn);
    document.getElementById('settingsHelpOpen') && (document.getElementById('settingsHelpOpen').title = t.helpBtnTitle);

    // tabs
    Object.entries(t.tabs).forEach(([k, v]) => {
      const el = modal.querySelector(`.settings-tab[data-tab="${k}"]`);
      if (el) {
        const icon = el.querySelector('i') ? el.querySelector('i').outerHTML + ' ' : '';
        el.innerHTML = icon + v;
      }
    });

    // help content
    document.getElementById('helpNoticeTitle') && (document.getElementById('helpNoticeTitle').textContent = t.helpNoticeTitle);
    document.getElementById('helpNoticeBody') && (document.getElementById('helpNoticeBody').innerHTML = t.helpNoticeBody);
    document.getElementById('helpIntro') && (document.getElementById('helpIntro').innerHTML = t.helpFullIntro);

    // messages templates default
    const tpl = lsGet(LS_MSG_TPL) || {};
    if (!tpl.reminder_wa && !tpl.reminder_sms) {
      lsSet(LS_MSG_TPL, { reminder_wa: t.tplDefaults.reminder_wa, reminder_sms: t.tplDefaults.reminder_sms });
    }
    const storedTpl = lsGet(LS_MSG_TPL) || {};
    modal.querySelector('#settingsWaTpl') && (modal.querySelector('#settingsWaTpl').value = storedTpl.reminder_wa || t.tplDefaults.reminder_wa);
    modal.querySelector('#settingsSmsTpl') && (modal.querySelector('#settingsSmsTpl').value = storedTpl.reminder_sms || t.tplDefaults.reminder_sms);

    // export & notices UI
    modal.querySelector('#exportInvoicesPdf') && (modal.querySelector('#exportInvoicesPdf').innerHTML = `<i class="fa-solid fa-file-pdf mr-1"></i> ${t.exportPdf}`);
    modal.querySelector('#exportInvoicesExcel') && (modal.querySelector('#exportInvoicesExcel').innerHTML = `<i class="fa-solid fa-file-csv mr-1"></i> ${t.exportCsv}`);
    modal.querySelector('#driveStatus') && (modal.querySelector('#driveStatus').textContent = t.driveNotInit);
    modal.querySelector('#translateProgrammaticNotices') && (modal.querySelector('#translateProgrammaticNotices').textContent = t.translateNoticesBtn);
    modal.querySelector('#clearNoticesBtn') && (modal.querySelector('#clearNoticesBtn').textContent = t.clearNoticesBtn);

    if (lang) localStorage.setItem(LS_LANG_KEY, lang);
  }

  function setActiveLangButton(lang) {
    const en = document.getElementById('langEnBtn'), so = document.getElementById('langSoBtn');
    if (!en || !so) return;
    en.classList.remove('bg-sky-600','text-white','shadow');
    so.classList.remove('bg-sky-600','text-white','shadow');
    if (lang === 'so') so.classList.add('bg-sky-600','text-white','shadow'); else en.classList.add('bg-sky-600','text-white','shadow');
  }

  function applyLanguage(lang, save = true) {
    if (!lang) lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    if (save) localStorage.setItem(LS_LANG_KEY, lang);
    setActiveLangButton(lang);
    applyLangToModal(lang);
    try { renderNoticesUI(); } catch(e) {}
    try { if (typeof window.applyTranslations === 'function') window.applyTranslations(lang); } catch(e) {}
  }

  // wire language buttons
  modal.querySelector('#langEnBtn')?.addEventListener('click', () => applyLanguage('en', true));
  modal.querySelector('#langSoBtn')?.addEventListener('click', () => applyLanguage('so', true));

  /* -------------------------
     Panels/tab wiring & helpers
     ------------------------- */
  function showTab(name){
    modal.querySelectorAll('.settings-panel').forEach(p => p.dataset.panel === name ? (p.style.display='block') : (p.style.display='none'));
    modal.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('bg-sky-50','dark:bg-sky-800'));
    const btn = modal.querySelector(`.settings-tab[data-tab="${name}"]`);
    if (btn) btn.classList.add('bg-sky-50');
  }
  modal.querySelectorAll('.settings-tab').forEach(tb => tb.addEventListener('click', function(){
    showTab(this.dataset.tab);
  }));

  // close/backdrop
  modal.querySelector('#settingsCloseBtn')?.addEventListener('click', ()=> modal.classList.add('hidden'));
  modal.addEventListener('click', (e)=> { if (e.target === modal || e.target.id === 'appSettingsModalBackdrop') modal.classList.add('hidden'); });

  /* -------------------------
     Messages save/reset
     ------------------------- */
  modal.querySelector('#settingsSaveMsgBtn')?.addEventListener('click', ()=>{
    const wa = (document.getElementById('settingsWaTpl')||{}).value || '';
    const sms = (document.getElementById('settingsSmsTpl')||{}).value || '';
    lsSet(LS_MSG_TPL, { reminder_wa: wa, reminder_sms: sms });
    const s = document.getElementById('settingsMsgStatus'); if (s){ s.classList.remove('hidden'); setTimeout(()=> s.classList.add('hidden'), 1200); }
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const msg = (translations[lang] && translations[lang].savedText) ? translations[lang].savedText : 'Saved';
    toast(msg, 'success');
  });
  modal.querySelector('#settingsResetMsgBtn')?.addEventListener('click', ()=>{
    if (!confirm('Reset message templates to defaults?')) return;
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const t = translations[lang] || translations.en;
    lsSet(LS_MSG_TPL, { reminder_wa: t.tplDefaults.reminder_wa, reminder_sms: t.tplDefaults.reminder_sms });
    const tpl = lsGet(LS_MSG_TPL) || {};
    document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
    document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');
    toast(t.savedText || 'Saved', 'success');
  });

  /* -------------------------
     Export wiring (unchanged)
     ------------------------- */
  modal.querySelector('#exportInvoicesPdf')?.addEventListener('click', ()=>{
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user) { toast('Login required','error'); return; }
    const inv = (typeof getStoreInvoices === 'function') ? getStoreInvoices(user.name) : [];
    if (!inv || !inv.length) { toast('No invoices','error'); return; }
    if (!window.jspdf) { alert('jsPDF required'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`${user.name} - Invoices`, 14, 16);
    if (doc.autoTable) {
      doc.autoTable({ head: [['ID','Date','Customer','Phone','Amount','Paid','Status']], body: inv.map(i => [i.id, i.date, i.customer, i.phone, i.amount, i.paid, i.status]), startY: 22 });
    } else {
      let y = 22;
      inv.forEach(i => { doc.text(`${i.id} ${i.date} ${i.customer} ${i.amount}`, 14, y); y+=8; });
    }
    doc.save(`invoices_${user.name}_${Date.now()}.pdf`);
    toast('PDF exported','success');
  });
  modal.querySelector('#exportInvoicesExcel')?.addEventListener('click', ()=>{
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user) { toast('Login required','error'); return; }
    const inv = (typeof getStoreInvoices === 'function') ? getStoreInvoices(user.name) : [];
    if (!inv || !inv.length) { toast('No invoices','error'); return; }
    const rows = [['ID','Date','Customer','Phone','Amount','Paid','Status']]; inv.forEach(i => rows.push([i.id, i.date, i.customer, i.phone, i.amount, i.paid, i.status]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `invoices_${user.name}_${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove();
    toast('CSV exported','success');
  });

  /* -------------------------
     Notices UI (with programmatic i18n support)
     ------------------------- */
  function renderNoticesUI() {
    const notices = lsGet(LS_NOTICES) || [];
    const noticesEl = document.getElementById('settingsNotices');
    if (!noticesEl) return;
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const progI18n = (translations[lang] && translations[lang].programmaticNotices) ? translations[lang].programmaticNotices : {};

    if (!notices.length) {
      const t = translations[lang] || translations.en;
      noticesEl.innerHTML = `<div class="text-sm text-slate-600 dark:text-slate-400">${t.noticesEmpty}</div>`;
      return;
    }

    noticesEl.innerHTML = notices.map(n => {
      let title = escapeHtml(n.title || '');
      let body = escapeHtml(n.body || '');
      if (n.i18nKey && progI18n[n.i18nKey]) {
        title = escapeHtml(progI18n[n.i18nKey].title || title);
        body = escapeHtml(progI18n[n.i18nKey].body || body);
      }
      return `
        <div class="rounded-lg p-3 bg-white dark:bg-sky-900/6 shadow-sm border border-sky-100">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-sm text-slate-900 dark:text-slate-100">${title}</div>
              <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">${body}</div>
            </div>
            <div class="text-xs text-slate-400">${new Date(n.created||Date.now()).toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.Notices = {
    add: function({ title = 'Notice', body = '', i18nKey = null } = {}) {
      const all = lsGet(LS_NOTICES) || [];
      const payload = { id: `N-${Date.now()}-${Math.floor(Math.random()*9000)}`, title: String(title), body: String(body), created: Date.now() };
      if (i18nKey) payload.i18nKey = i18nKey;
      all.unshift(payload);
      lsSet(LS_NOTICES, all);
      try { renderNoticesUI(); } catch (e) {}
      try { window.dispatchEvent(new Event('noticesUpdated')); } catch (e) {}
      try { localStorage.setItem('__notices_sync', Date.now().toString()); } catch (e) {}
      return payload;
    },
    list: function() { return lsGet(LS_NOTICES) || []; },
    clear: function() { lsSet(LS_NOTICES, []); renderNoticesUI(); }
  };

  function ensureProgrammaticNotices() {
    const programmatic = Array.isArray(window.PROGRAMMATIC_NOTICES) ? window.PROGRAMMATIC_NOTICES
                      : Array.isArray(window.GLOBAL_NOTICES) ? window.GLOBAL_NOTICES
                      : [];
    if (!programmatic.length) return;
    const existing = lsGet(LS_NOTICES) || [];
    let changed = false;
    programmatic.forEach(item => {
      if (!item) return;
      const id = item.id ? String(item.id) : null;
      const i18nKey = item.i18nKey || item.key || null;
      const found = id ? existing.find(n => n.id === id) : (i18nKey ? existing.find(n => n.i18nKey === i18nKey) : null);
      if (!found) {
        const payload = {
          id: id || `N-${Date.now()}-${Math.floor(Math.random()*9000)}`,
          title: item.title || (i18nKey ? i18nKey : 'Notice'),
          body: item.body || '',
          created: item.created ? Number(item.created) : Date.now(),
          i18nKey: i18nKey || null
        };
        existing.unshift(payload);
        changed = true;
      }
    });
    if (changed) {
      lsSet(LS_NOTICES, existing);
      try { renderNoticesUI(); } catch(e) {}
      try { window.dispatchEvent(new Event('noticesUpdated')); } catch(e) {}
      try { localStorage.setItem('__notices_sync', Date.now().toString()); } catch(e) {}
    }
  }

  renderNoticesUI();
  try { ensureProgrammaticNotices(); } catch(e){ console.error('ensureProgrammaticNotices failed', e); }

  window.addEventListener('storage', (ev) => {
    if (!ev) return;
    if (ev.key === LS_NOTICES || ev.key === '__notices_sync') {
      setTimeout(()=> { try { renderNoticesUI(); } catch(e){} }, 50);
    }
  });
  window.addEventListener('noticesUpdated', () => { try { renderNoticesUI(); } catch(e){} });
  window.renderNoticesUI = renderNoticesUI;

  modal.querySelector('#translateProgrammaticNotices')?.addEventListener('click', () => {
    renderNoticesUI();
    toast('Notices translated', 'success');
  });
  modal.querySelector('#clearNoticesBtn')?.addEventListener('click', () => {
    if (!confirm('Clear all notices?')) return;
    window.Notices.clear();
    toast('Notices cleared','success');
  });

  // example manual notice trigger
  const someRemindBtn = document.getElementById('someRemindBtn');
  if (someRemindBtn) {
    someRemindBtn.addEventListener('click', () => {
      window.Notices.add({ i18nKey: 'welcome' });
      toast('Notice added', 'success');
    });
  }

  /* -------------------------
     Drive settings wiring
     ------------------------- */
  const s = lsGet(LS_SETTINGS) || {};
  const optRestore = document.getElementById('optAutoRestoreLogin');
  const optAutoEnabled = document.getElementById('optAutoBackupEnabled');
  const optAutoDays = document.getElementById('optAutoBackupDays');
  if (optRestore) optRestore.checked = Boolean(s.autoRestoreOnLogin);
  if (optAutoEnabled) optAutoEnabled.checked = Boolean(s.autoBackup && s.autoBackup.enabled);
  if (optAutoDays) optAutoDays.value = (s.autoBackup && s.autoBackup.days) ? s.autoBackup.days : 7;

  initGisIfNeeded();
  initGapiIfNeeded().then(()=> { setDriveStatus && setDriveStatus('Drive: ready'); }).catch(()=> { setDriveStatus && setDriveStatus('Drive: client not ready'); });

  modal.querySelector('#driveBackupBtn')?.addEventListener('click', driveBackup);
  modal.querySelector('#driveRefreshBtn')?.addEventListener('click', driveListBackups);
  modal.querySelector('#driveRestoreLatestBtn')?.addEventListener('click', driveRestoreLatest);

  function persistDriveSettings(){
    const cur = lsGet(LS_SETTINGS) || {};
    cur.autoRestoreOnLogin = Boolean(document.getElementById('optAutoRestoreLogin')?.checked);
    cur.autoBackup = { enabled: Boolean(document.getElementById('optAutoBackupEnabled')?.checked), days: Number(document.getElementById('optAutoBackupDays')?.value) || 7 };
    lsSet(LS_SETTINGS, cur);
    const lang = localStorage.getItem(LS_LANG_KEY) || 'en';
    const msg = (translations[lang] && translations[lang].savedText) ? translations[lang].savedText : 'Saved';
    toast(msg,'success');
    if (cur.autoBackup && cur.autoBackup.enabled) scheduleAutoBackup(); else cancelAutoBackup();
  }
  document.getElementById('optAutoRestoreLogin')?.addEventListener('change', persistDriveSettings);
  document.getElementById('optAutoBackupEnabled')?.addEventListener('change', persistDriveSettings);
  document.getElementById('optAutoBackupDays')?.addEventListener('change', persistDriveSettings);

  /* -------------------------
     Show modal + animate help notice
     ------------------------- */
  modal.classList.remove('hidden');
  modal.querySelectorAll('.settings-panel').forEach(p => p.style.display = p.dataset.panel === 'helpNotice' ? 'block' : 'none');

  (function initLangOnModalOpen(){
    const saved = localStorage.getItem(LS_LANG_KEY) || 'en';
    setActiveLangButton(saved);
    applyLangToModal(saved);

    // wire language buttons to also call global applyTranslations
    document.getElementById('langEnBtn')?.addEventListener('click', ()=> {
      localStorage.setItem(LS_LANG_KEY,'en');
      try { if (typeof window.applyTranslations === 'function') window.applyTranslations('en'); } catch(e){}
      applyLanguage('en', true);
    });
    document.getElementById('langSoBtn')?.addEventListener('click', ()=> {
      localStorage.setItem(LS_LANG_KEY,'so');
      try { if (typeof window.applyTranslations === 'function') window.applyTranslations('so'); } catch(e){}
      applyLanguage('so', true);
    });

    // help controls (dismiss, open full help)
    document.getElementById('dismissHelpNotice')?.addEventListener('click', ()=> {
      document.getElementById('helpNoticeCard')?.classList.add('hidden');
    });
    document.getElementById('moreHelpBtn')?.addEventListener('click', ()=> {
      showTab('helpNav');
    });
    document.getElementById('showHelpPanelBtn')?.addEventListener('click', ()=> {
      showTab('helpNav');
    });

    // animate the help notice entrance
    const helpCard = document.getElementById('helpNoticeCard');
    if (helpCard) {
      helpCard.classList.add('help-notice-enter');
      // next tick -> active
      setTimeout(()=> {
        helpCard.classList.add('help-notice-enter-active');
      }, 20);
      // remove the enter classes after animation so it can play again later
      setTimeout(()=> {
        helpCard.classList.remove('help-notice-enter','help-notice-enter-active');
      }, 420);
    }
  })();

  // fill templates into textareas (if any) - initial fill
  const tpl = lsGet(LS_MSG_TPL) || {};
  document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
  document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');

  // helper: escapeHtml (kept local)
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // expose applyLanguage helper globally for other UI
  window.applySettingsModalLanguage = function(lang){
    try { if (typeof applyLanguage === 'function') applyLanguage(lang, true); } catch(e){}
  };

  // ensure nav visible on initial create
  setTimeout(ensureSettingsNavVisible, 60);

} // end openSettingsModal


// ==========================
// Settings button attach (resilient / delegated) - replaces btn.onclick
// ==========================
(function attachSettingsButton(){
  // create a button if absent (same as before)
  let btn = document.getElementById('storeSettingsBtn');
  if (!btn) {
    const target = document.getElementById('storeDisplayDesktop');
    btn = document.createElement('button');
    btn.id = 'storeSettingsBtn';
    btn.className = 'ml-2 px-2 py-1 rounded bg-emerald-600 text-white';
    btn.title = 'Settings';
    btn.innerHTML = '<i class="fa-solid fa-cog"></i>';
    if (target && target.parentNode) target.parentNode.insertBefore(btn, target.nextSibling);
    else document.body.appendChild(btn);
  }

  // Delegated click handler attached once on document — resilient if the button is re-created by other code
  if (!document._settingsBtnDelegationInstalled) {
    document.addEventListener('click', function (e) {
      const el = e.target.closest && e.target.closest('#storeSettingsBtn');
      if (el) {
        try { openSettingsModal(); } catch (err) { console.error('openSettingsModal error', err); }
      }
    }, { capture: false, passive: true });
    document._settingsBtnDelegationInstalled = true;
  }
})();



    // small helper to set drive status element
    function setDriveStatus(msg, isError){
      const el = document.getElementById('driveStatus');
      if (el) { el.textContent = msg; el.style.color = isError ? '#b91c1c' : '#065f46'; }
    }
  
    // Drive implementations: list, backup, download, restore, latest
    async function driveListBackups(){
      setDriveStatus('Listing backups...');
      initGisIfNeeded();
      try { await initGapiIfNeeded(); } catch(e){ setDriveStatus('gapi init failed', true); console.error(e); return; }
      showSpinner('Listing backups...');
      requestDriveToken(async (token) => {
        try {
          const q = `name contains '${BACKUP_NAME_PREFIX}' and trashed=false and mimeType='application/json'`;
          const params = `?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=50`;
          const res = await fetch('https://www.googleapis.com/drive/v3/files' + params, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('List failed', true); hideSpinner(); return; }
          const data = await res.json();
          const listEl = document.getElementById('driveBackupList');
          if (!listEl) { hideSpinner(); return; }
          listEl.innerHTML = '';
          if (!data.files || !data.files.length) { listEl.innerHTML = '<div class="text-sm text-gray-500">No backups found</div>'; setDriveStatus('No backups'); hideSpinner(); return; }
          data.files.forEach(file => {
            const wrap = document.createElement('div');
            wrap.className = 'p-2 border rounded bg-white flex items-center justify-between gap-2';
            const left = document.createElement('div');
            left.style.flex = '1';
            left.innerHTML = `<div style="font-weight:600;word-break:break-word">${escapeHtml(file.name)}</div><div style="font-size:12px;color:#6b7280">${new Date(file.createdTime).toLocaleString()} • ${file.size ? (Math.round(file.size/1024) + ' KB') : ''}</div>`;
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '6px';
            const btnRestore = document.createElement('button'); btnRestore.className = 'px-2 py-1 bg-green-600 text-white rounded text-sm'; btnRestore.textContent = 'Restore';
            const btnDownload = document.createElement('button'); btnDownload.className = 'px-2 py-1 bg-gray-200 rounded text-sm'; btnDownload.textContent = 'Download';
            btnRestore.onclick = () => driveRestore(file.id, file.name);
            btnDownload.onclick = () => driveDownload(file.id, file.name);
            right.appendChild(btnRestore); right.appendChild(btnDownload);
            wrap.appendChild(left); wrap.appendChild(right);
            listEl.appendChild(wrap);
          });
          setDriveStatus('Backups listed (' + data.files.length + ')');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Error listing', true); hideSpinner(); }
      });
    }
  
    async function driveBackup(){
      setDriveStatus('Preparing backup...');
      // create snapshot of localStorage
      const snapshot = {};
      for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); snapshot[k] = localStorage.getItem(k); }
      const payload = JSON.stringify(snapshot, null, 2);
      showSpinner('Uploading backup...','Preparing data');
      requestDriveToken(async (token) => {
        try {
          const metadata = { name: `${BACKUP_NAME_PREFIX}${Date.now()}.json`, mimeType: 'application/json' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', new Blob([payload], { type: 'application/json' }));
          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: form
          });
          if (!res.ok) { const t = await res.text(); console.error('upload failed', t); setDriveStatus('Backup failed', true); hideSpinner(); return; }
          const json = await res.json();
          const settings = lsGet(LS_SETTINGS) || {}; settings.lastAutoBackup = now(); lsSet(LS_SETTINGS, settings);
          setDriveStatus('Backup saved: ' + json.name);
          toast('Backup saved to Drive', 'success');
          hideSpinner();
          driveListBackups();
        } catch(err){ console.error(err); setDriveStatus('Backup error', true); hideSpinner(); }
      });
    }
  
    async function driveDownload(fileId, fileName){
      setDriveStatus('Downloading ' + fileName + '...');
      showSpinner('Downloading backup...', fileName);
      requestDriveToken(async (token) => {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Download failed', true); hideSpinner(); return; }
          const text = await res.text();
          const blob = new Blob([text], { type:'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
          setDriveStatus('Downloaded ' + fileName);
          toast('Backup downloaded', 'success');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Download error', true); hideSpinner(); }
      });
    }
  
    async function driveRestore(fileId, fileName){
      if (!confirm(`Restore "${fileName}"? This will overwrite local data stored in this browser.`)) return;
      setDriveStatus('Restoring ' + fileName + '...');
      showSpinner('Restoring backup...', fileName);
      requestDriveToken(async (token) => {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Restore failed', true); hideSpinner(); return; }
          const text = await res.text();
          let obj;
          try { obj = JSON.parse(text); } catch(e){ setDriveStatus('Invalid JSON in backup', true); hideSpinner(); return; }
          localStorage.clear();
          Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
          // re-render app pieces (non-intrusive)
          try { window.dispatchEvent(new Event('dataUpdated')); } catch(e){}
          try { if (typeof renderProductList === 'function') renderProductList(); } catch(e){}
          try { if (typeof renderInvoiceTable === 'function') renderInvoiceTable(); } catch(e){}
          try { if (typeof renderReports === 'function') renderReports(); } catch(e){}
          try { if (typeof updateDashboardTotals === 'function') updateDashboardTotals(); } catch(e){}
          setDriveStatus('Restore complete');
          toast('Backup restored', 'success');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Restore error', true); hideSpinner(); }
      });
    }
  
    async function driveRestoreLatest(){
      setDriveStatus('Fetching latest backup...');
      showSpinner('Fetching latest backup...');
      requestDriveToken(async (token) => {
        try {
          const q = `name contains '${BACKUP_NAME_PREFIX}' and trashed=false and mimeType='application/json'`;
          const params = `?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=1`;
          const res = await fetch('https://www.googleapis.com/drive/v3/files' + params, { headers: { Authorization: 'Bearer ' + token }});
          if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Failed to fetch latest', true); hideSpinner(); return; }
          const data = await res.json();
          if (!data.files || !data.files.length) { setDriveStatus('No backups found'); hideSpinner(); return; }
          const latest = data.files[0];
          if (!confirm(`Restore latest backup "${latest.name}"? This will overwrite local data.`)) { hideSpinner(); return; }
          // download & restore
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, { headers: { Authorization: 'Bearer ' + token }});
          if (!r.ok) { setDriveStatus('Failed to download latest', true); hideSpinner(); return; }
          const txt = await r.text();
          let obj; try { obj = JSON.parse(txt); } catch(e){ setDriveStatus('Latest backup invalid', true); hideSpinner(); return; }
          localStorage.clear();
          Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
          try { window.dispatchEvent(new Event('dataUpdated')); } catch(e){}
          try { if (typeof renderProductList === 'function') renderProductList(); } catch(e){}
          try { if (typeof renderInvoiceTable === 'function') renderInvoiceTable(); } catch(e){}
          try { if (typeof renderReports === 'function') renderReports(); } catch(e){}
          try { if (typeof updateDashboardTotals === 'function') updateDashboardTotals(); } catch(e){}
          setDriveStatus('Latest backup restored: ' + latest.name);
          toast('Latest backup restored','success');
          hideSpinner();
        } catch(err){ console.error(err); setDriveStatus('Error restoring latest', true); hideSpinner(); }
      });
    }
  
    // Expose functions for wiring (they map to internal names in your app too)
    window.driveBackup = driveBackup;
    window.driveListBackups = driveListBackups;
    window.driveRestoreLatest = driveRestoreLatest;
  
    // // Settings button attach (safe: will not override if exists)
    // (function attachSettingsButton(){
    //   let btn = document.getElementById('storeSettingsBtn');
    //   if (!btn) {
    //     const target = document.getElementById('storeDisplayDesktop');
    //     btn = document.createElement('button');
    //     btn.id = 'storeSettingsBtn';
    //     btn.className = 'ml-2 px-2 py-1 rounded bg-emerald-600 text-white';
    //     btn.title = 'Settings';
    //     btn.innerHTML = '<i class="fa-solid fa-cog"></i>';
    //     if (target && target.parentNode) target.parentNode.insertBefore(btn, target.nextSibling);
    //     else document.body.appendChild(btn);
    //   }
    //   btn.onclick = openSettingsModal;
    // })();
  
    // ===========================
    // Auto-backup scheduling (timers while app is open)
    // ===========================
    let autoBackupTimer = null;
    function scheduleAutoBackup(){
      const s = lsGet(LS_SETTINGS) || {};
      if (!s.autoBackup || !s.autoBackup.enabled) return cancelAutoBackup();
      const days = Number(s.autoBackup.days) || 7;
      const ms = days * 24 * 60 * 60 * 1000;
      cancelAutoBackup();
      // quick immediate run if overdue
      const last = Number(s.lastAutoBackup || 0);
      if (!last || (now() - last >= ms)) {
        try { driveBackup(); } catch(e){ console.error(e); }
      }
      autoBackupTimer = setInterval(()=> {
        try { driveBackup(); } catch(e){ console.error(e); }
      }, ms);
    }
    function cancelAutoBackup(){ if (autoBackupTimer){ clearInterval(autoBackupTimer); autoBackupTimer = null; } }
    // init schedule if enabled
    (function initAuto(){
      const s = lsGet(LS_SETTINGS) || {};
      if (s && s.autoBackup && s.autoBackup.enabled) setTimeout(scheduleAutoBackup, 800);
    })();
  
    // ===========================
    // Auto-restore prompt on login (opt-in)
    // Attach a hook to setCurrentUser if available
    // ===========================
    (function attachLoginHook(){
      if (typeof window.setCurrentUser === 'function') {
        const _orig = window.setCurrentUser;
        window.setCurrentUser = function(user){
          _orig(user);
          try { window.dispatchEvent(new CustomEvent('app:userLoggedIn', { detail:{ user } })); } catch(e){ console.warn(e); }
        };
      }
      window.addEventListener('app:userLoggedIn', ev => { try { handleAutoRestorePrompt(ev.detail.user); } catch(e){ console.error(e); } });
      document.addEventListener('DOMContentLoaded', ()=> {
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (user) handleAutoRestorePrompt(user);
      });
    })();
  
    async function handleAutoRestorePrompt(user){
      try {
        const settings = lsGet(LS_SETTINGS) || {};
        if (!settings.autoRestoreOnLogin) return;
        if (!user) return;
        initGisIfNeeded();
        try { await initGapiIfNeeded(); } catch(e){ console.warn('gapi not ready', e); }
        showSpinner('Checking Drive for backups...');
        requestDriveToken(async (token) => {
          try {
            const q = `name contains '${BACKUP_NAME_PREFIX}' and trashed=false and mimeType='application/json'`;
            const params = `?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=1`;
            const res = await fetch('https://www.googleapis.com/drive/v3/files' + params, { headers: { Authorization: 'Bearer ' + token }});
            hideSpinner();
            if (!res.ok) { const t = await res.text(); console.error(t); setDriveStatus('Failed to check Drive', true); return; }
            const data = await res.json();
            if (!data.files || !data.files.length) { setDriveStatus('No backups found', false); return; }
            const latest = data.files[0];
            const confirmRestore = confirm(`A Drive backup exists: "${latest.name}" (${new Date(latest.createdTime).toLocaleString()}). Restore now?`);
            if (!confirmRestore) return;
            showSpinner('Restoring latest backup...', latest.name);
            requestDriveToken(async (tk) => {
              try {
                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, { headers: { Authorization: 'Bearer ' + tk }});
                if (!r.ok) { setDriveStatus('Failed to download latest', true); hideSpinner(); return; }
                const txt = await r.text();
                let obj; try { obj = JSON.parse(txt); } catch(e){ setDriveStatus('Backup JSON invalid', true); hideSpinner(); return; }
                localStorage.clear();
                Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
                try { window.dispatchEvent(new Event('dataUpdated')); } catch(e){}
                try { if (typeof renderProductList === 'function') renderProductList(); } catch(e){}
                try { if (typeof renderInvoiceTable === 'function') renderInvoiceTable(); } catch(e){}
                try { if (typeof renderReports === 'function') renderReports(); } catch(e){}
                try { if (typeof updateDashboardTotals === 'function') updateDashboardTotals(); } catch(e){}
                setDriveStatus('Backup restored: ' + latest.name);
                toast('Drive backup restored', 'success');
                hideSpinner();
              } catch(err){ console.error(err); setDriveStatus('Restore failed', true); hideSpinner(); }
            });
          } catch(err){ console.error(err); hideSpinner(); setDriveStatus('Error while checking Drive', true); }
        });
      } catch(e){ console.error(e); }
    }
  
    // ===========================
    // Daily backup reminder: create a notice per store once per day
    // ===========================
    function dailyBackupReminder(){
      try {
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (!user || !user.name) return;
        const s = lsGet(LS_SETTINGS) || {};
        const lastByStore = s.lastDailyReminderByStore || {};
        const todayKey = new Date().toISOString().slice(0,10); // YYYY-MM-DD
        if (lastByStore[user.id] === todayKey) return; // already reminded today
        // create notice
        const title = `Backup Reminder — ${user.name}`;
        const body = `Hi ${user.name}. Remember to backup your supermarket data to Google Drive to protect against device loss. Open Settings → Drive Backup to save your data.`;
        try {
          window.Notices && typeof window.Notices.add === 'function' ? window.Notices.add({ title, body }) : lsSet(LS_NOTICES, [{ id:`N-${Date.now()}`, title, body, created: Date.now() }].concat(lsGet(LS_NOTICES)||[]));
        } catch(e){ console.error(e); }
        // mark reminder done for today
        lastByStore[user.id] = todayKey;
        s.lastDailyReminderByStore = lastByStore;
        lsSet(LS_SETTINGS, s);
      } catch(e){ console.error(e); }
    }
    // call on load and after login
    document.addEventListener('DOMContentLoaded', ()=> dailyBackupReminder());
    window.addEventListener('app:userLoggedIn', ()=> dailyBackupReminder());
    window.addEventListener('dataUpdated', ()=> dailyBackupReminder());
  
    // attach public API
    window.AppSettings = window.AppSettings || {};
    window.AppSettings.open = openSettingsModal;
    window.AppSettings.driveBackup = driveBackup;
    window.AppSettings.driveListBackups = driveListBackups;
    window.AppSettings.driveRestoreLatest = driveRestoreLatest;
  
    // ensure spinner exists
    ensureSpinner();
  
    console.info('Settings + Drive v2 loaded');
  
  })(); // end module
  
  (function adjustSettingsModalForMobileAndDarkmode(){
    // small CSS overrides to improve modal background, cards, spinner and mobile nav behavior
    const css = `
      /* modal container background + text that respects dark mode */
      #appSettingsModal .relative { background: #f8fafc; color: #0f172a; }
      .dark #appSettingsModal .relative { background: #0b1220; color: #e6eef8; }
  
      /* make the inner cards use subtle backgrounds in both modes */
      #appSettingsModal .bg-white { background: #ffffff; color: inherit; }
      .dark #appSettingsModal .bg-white { background: #071021; color: inherit; }
  
      /* spinner panel color */
      #driveSpinnerOverlay [role="status"] { background: #ffffff; color: inherit; }
      .dark #driveSpinnerOverlay [role="status"] { background: #071021; color: #e6eef8; }
  
      /* make the left nav visible on mobile as a horizontal scroll row;
         on md+ screens it becomes the vertical column as before */
      #appSettingsModal nav#settingsNav { display: flex !important; flex-direction: row; gap: 8px; overflow-x: auto; padding: 8px; border-right: none; -webkit-overflow-scrolling: touch; }
      @media (min-width: 768px) {
        #appSettingsModal nav#settingsNav { display: block !important; flex-direction: column; border-right: 1px solid rgba(0,0,0,0.06); padding: 12px; }
      }
  
      /* ensure settings-tab buttons are compact and readable on narrow screens */
      #appSettingsModal .settings-tab { white-space: nowrap; border-radius: 8px; padding-left:10px; padding-right:10px; }
      #appSettingsModal .settings-tab.bg-gray-100 { background-color: rgba(255,255,255,0.06) !important; }
  
      /* small improvements for backup list items */
      #driveBackupList .p-2 { background: var(--card-bg,#fff); }
      .dark #driveBackupList .p-2 { background: #071021; }
  
      /* ensure modal scroll area uses proper color */
      #appSettingsModal .settings-panel { color: inherit; }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-for','settings-modal-fixes');
    s.textContent = css;
    document.head.appendChild(s);
  
    // helper to ensure nav is visible and styled when modal created/opened
    function ensureSettingsNavVisible() {
      const nav = document.getElementById('settingsNav');
      if (!nav) return;
      // remove any 'hidden' that your module may have put on desktop-only nav
      nav.classList.remove('hidden');
      // apply flexible mobile layout
      nav.style.display = 'flex';
      nav.style.flexDirection = 'row';
      nav.style.gap = '8px';
      nav.style.padding = '8px';
      nav.style.borderRight = 'none';
      // make tabs easy to tap
      nav.querySelectorAll('.settings-tab').forEach(tb => {
        tb.style.whiteSpace = 'nowrap';
        tb.style.flex = '0 0 auto';
      });
    }
  
    // call on DOMContentLoaded & also each time settings modal might be opened
    document.addEventListener('DOMContentLoaded', ensureSettingsNavVisible);
    // call when settings button clicked (works both for original button and dynamically created one)
    document.addEventListener('click', function(e){
      const btn = e.target.closest('#storeSettingsBtn, #settingsHelpOpen, #settingsCloseBtn');
      if (btn) {
        // scheduled to allow modal markup to be created first
        setTimeout(ensureSettingsNavVisible, 120);
      }
    });
  
    // small MutationObserver: if modal is inserted later, ensure nav fixed
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n && n.querySelector && n.querySelector('#appSettingsModal')) {
            setTimeout(ensureSettingsNavVisible, 40);
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  
    // Update spinner CSS variable if page uses `dark` class (improve immediate spinner colors)
    function applySpinnerTheme(){
      const root = document.documentElement;
      const isDark = root.classList.contains('dark') || window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const spinnerPanel = document.querySelector('#driveSpinnerOverlay [role="status"]');
      if (spinnerPanel) {
        spinnerPanel.style.background = isDark ? '#071021' : '#ffffff';
        spinnerPanel.style.color = isDark ? '#e6eef8' : '#0f172a';
      }
    }
    document.addEventListener('DOMContentLoaded', applySpinnerTheme);
    // react on theme toggles if your page toggles the 'dark' class
    const themeObserver = new MutationObserver(applySpinnerTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  
  })();
    /* =========================
       small utilities exposed
       ========================= */
    window._supermarket_helpers = {
      lsGet, lsSet, getAllProducts, getAllInvoices, getAllReports
    };
  
  })(); // end auth.js
  



