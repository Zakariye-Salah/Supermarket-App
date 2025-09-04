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

  /* small polyfills for optional libs */
  function ensureLib(url, globalName) {
    return new Promise((res, rej) => {
      if (globalName && window[globalName]) return res(true);
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => res(true);
      s.onerror = () => rej(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
  }

  /* =========================
     TRANSLATION (minimal)
     ========================= */
  const I18N = {
    en: { dashboard: "" },
    so: { dashboard: "" }
  };
  function applyLanguage(lang) {
    if (!lang) lang = lsGet(LS_APP_LANG, 'en') || 'en';
    lsSet(LS_APP_LANG, lang);
    const storeEl = document.getElementById('storeDisplayDesktop');
    if (storeEl) {
      const name = storeEl.textContent || getCurrentUser()?.name || '';
      const base = (I18N[lang] && I18N[lang].dashboard) || '';
      const h = storeEl.closest && storeEl.closest('h1');
      if (h) h.textContent = `${base} - ${name}`;
    }
  }
  applyLanguage(lsGet(LS_APP_LANG, 'en'));

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
    document.querySelectorAll('.navBtn, .storeSettingsBtn').forEach(el => {
      if (isAuthScreen) el.classList.add('hidden'); else el.classList.remove('hidden');
    });
  }

  /* =========================
     SETTINGS COG + SETTINGS MODAL (drop-in replacement)
     Creates AppSettings.open() etc.
     ========================= */
  // lightweight ensure button + modal builder
  function ensureSettingsBtn() {
    // if already created do nothing (but update visibility)
    let btn = document.querySelector('.storeSettingsBtn');
    if (!btn) {
      const target = document.querySelector('#storeDisplayDesktop') ||
                     document.querySelector('.store-display') ||
                     document.querySelector('.store-name') ||
                     document.querySelector('[data-store-name]');
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'storeSettingsBtn inline-flex items-center gap-2 ml-2 px-2 py-1 rounded bg-emerald-600 text-white';
      btn.title = 'Settings';
      btn.setAttribute('aria-label', 'Open settings');
      btn.innerHTML = '<i class="fa-solid fa-cog"></i>';
      btn.style.cursor = 'pointer';
      // click opens modal
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openSettingsModal();
      });
      // insert near target if exists
      if (target && target.parentNode) {
        try { target.insertAdjacentElement('afterend', btn); } catch (e) { target.parentNode.appendChild(btn); }
      } else {
        btn.classList.add('fixed', 'right-4', 'top-4', 'z-60');
        document.body.appendChild(btn);
      }
    }

    // Update visibility based on logged-in state
    function updateVisibility() {
      const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!btn) return;
      if (user) btn.style.display = ''; else btn.style.display = 'none';
    }

    updateVisibility();
    window.addEventListener('dataUpdated', updateVisibility);
    document.addEventListener('DOMContentLoaded', updateVisibility);

    return btn;
  }

  // openSettingsModal: creates modal if missing, wires up behaviors
  function openSettingsModal() {
    let modal = document.getElementById('appSettingsModal');

    if (!modal) {
      const html = `
      <div id="appSettingsModal" class="hidden fixed inset-0 z-70 flex items-start justify-center p-4">
        <div id="appSettingsModalBackdrop" class="absolute inset-0 bg-black/50"></div>
        <div class="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-auto max-h-[90vh]">
          <div class="flex items-center justify-between p-4 border-b">
            <h2 id="settingsTitle" class="text-lg font-semibold">Settings & Utilities</h2>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-2 text-sm"><input id="settingsDarkMode" type="checkbox"> Dark</label>
              <button id="settingsCloseBtn" class="px-3 py-1 rounded bg-gray-200">Close</button>
            </div>
          </div>
          <div class="flex gap-4 p-4">
            <nav id="settingsNav" class="w-56">
              <ul class="space-y-2">
                <li><button class="settings-tab w-full text-left px-3 py-2 rounded" data-tab="messages">Messages</button></li>
                <li><button class="settings-tab w-full text-left px-3 py-2 rounded" data-tab="help">Help</button></li>
                <li><button class="settings-tab w-full text-left px-3 py-2 rounded" data-tab="export">Export</button></li>
              </ul>
            </nav>
            <div class="flex-1" id="settingsContent">
              <div class="settings-panel hidden" data-panel="user">
                <h3 class="font-semibold mb-2">Edit User</h3>
                <form id="settingsEditUserForm" class="space-y-2 p-2">
                  <div><label class="block text-sm">Supermarket Name</label><input id="settingsUserName" class="border rounded px-2 py-1 w-full"></div>
                  <div><label class="block text-sm">Phone</label><input id="settingsUserPhone" class="border rounded px-2 py-1 w-full"></div>
                  <div><label class="block text-sm">Address</label><input id="settingsUserAddress" class="border rounded px-2 py-1 w-full"></div>
                  <div><label class="block text-sm">Email</label><input id="settingsUserEmail" class="border rounded px-2 py-1 w-full"></div>
                  <div class="grid grid-cols-2 gap-2">
                    <div><label class="block text-sm">Password</label><input id="settingsUserPassword" type="password" class="border rounded px-2 py-1 w-full"></div>
                    <div><label class="block text-sm">Confirm</label><input id="settingsUserPasswordConfirm" type="password" class="border rounded px-2 py-1 w-full"></div>
                  </div>
                  <div class="flex gap-2">
                    <button id="settingsSaveUserBtn" class="px-3 py-2 bg-emerald-600 text-white rounded">Save Changes</button>
                    <button id="settingsCancelUserBtn" type="button" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                  </div>
                  <div id="settingsUserMsg" class="text-sm text-red-600 hidden"></div>
                </form>
              </div>

              <div class="settings-panel hidden" data-panel="messages">
                <h3 class="font-semibold mb-2">WhatsApp / SMS Templates</h3>
                <p class="text-sm mb-2">Use placeholders: <code>{customer}</code>, <code>{id}</code>, <code>{balance}</code>, <code>{store}</code>, <code>{phone}</code></p>
                <div class="space-y-2 p-2">
                  <div>
                    <label class="block text-sm">WhatsApp Template</label>
                    <textarea id="settingsWaTpl" rows="3" class="w-full border rounded p-2"></textarea>
                  </div>
                  <div>
                    <label class="block text-sm">SMS Template</label>
                    <textarea id="settingsSmsTpl" rows="3" class="w-full border rounded p-2"></textarea>
                  </div>
                  <div class="flex gap-2">
                    <button id="settingsSaveMsgBtn" class="px-3 py-2 bg-blue-600 text-white rounded">Save</button>
                    <button id="settingsResetMsgBtn" class="px-3 py-2 bg-gray-200 rounded">Reset Defaults</button>
                  </div>
                  <div id="settingsMsgStatus" class="text-sm text-green-600 hidden"></div>
                </div>
              </div>

              <div class="settings-panel hidden" data-panel="help">
                <h3 class="font-semibold mb-2">Help & Guidance</h3>
                <div class="prose max-w-none p-2">
                  <h4>Invoices</h4>
                  <ul>
                    <li>To create an invoice, open the invoice form and add items (name & price). Save to add it to the list.</li>
                    <li>Mark as paid/unpaid using the toggle button on each invoice row.</li>
                    <li>Use the action icons to call, WhatsApp, SMS, print, or share an invoice card.</li>
                  </ul>
                </div>
              </div>

              <div class="settings-panel hidden" data-panel="export">
                <h3 class="font-semibold mb-2">Export / Download</h3>
                <p class="text-sm mb-2">Download invoices as JSON or CSV (local data).</p>
                <div class="flex gap-2 mb-4 p-2">
                  <button id="exportInvoicesJson" class="px-3 py-2 bg-blue-600 text-white rounded">Download JSON</button>
                  <button id="exportInvoicesCsv" class="px-3 py-2 bg-gray-700 text-white rounded">Download CSV</button>
                </div>
                <div id="settingsExportMsg" class="text-sm text-green-600 hidden"></div>
              </div>

            </div>
          </div>
        </div>
      </div>
      `;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);
      modal = document.getElementById('appSettingsModal');

      // tabs wiring
      modal.querySelectorAll('.settings-tab').forEach(tb => tb.addEventListener('click', () => {
        const name = tb.dataset.tab;
        modal.querySelectorAll('.settings-panel').forEach(p => p.dataset.panel === name ? p.classList.remove('hidden') : p.classList.add('hidden'));
        modal.querySelectorAll('.settings-tab').forEach(tt => tt.classList.toggle('bg-gray-100', tt === tb));
      }));

      // close/backdrop
      modal.querySelector('#settingsCloseBtn')?.addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.id === 'appSettingsModalBackdrop') modal.classList.add('hidden'); });

      // dark toggle wiring
      modal.querySelector('#settingsDarkMode')?.addEventListener('change', (e) => {
        const on = !!e.target.checked; lsSet(LS_DARK, on);
        if (on) document.body.classList.add('dark'); else document.body.classList.remove('dark');
        toast('Dark mode updated', 'success');
      });

      // save user (IMPORTANT: match by id, not name)
      modal.querySelector('#settingsSaveUserBtn')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        const msgEl = document.getElementById('settingsUserMsg');
        msgEl.classList.add('hidden'); msgEl.textContent = '';
        const name = document.getElementById('settingsUserName').value.trim();
        const phone = document.getElementById('settingsUserPhone').value.trim();
        const address = document.getElementById('settingsUserAddress').value.trim();
        const email = document.getElementById('settingsUserEmail').value.trim();
        const pass = document.getElementById('settingsUserPassword').value;
        const pass2 = document.getElementById('settingsUserPasswordConfirm').value;
        if (!name || !phone || !address || !email) { msgEl.textContent = 'All fields required'; msgEl.classList.remove('hidden'); return; }
        if (pass || pass2) { if (pass !== pass2) { msgEl.textContent = 'Passwords do not match'; msgEl.classList.remove('hidden'); return; } if (pass.length < 4) { msgEl.textContent = 'Password too short'; msgEl.classList.remove('hidden'); return; } }
        const users = getUsers();
        const current = getCurrentUser();
        if (!current) { msgEl.textContent = 'No logged-in user'; msgEl.classList.remove('hidden'); return; }
        // match by id (stable)
        const idx = users.findIndex(u => u.id === current.id);
        if (idx === -1) { msgEl.textContent = 'User not found'; msgEl.classList.remove('hidden'); return; }
        // only update fields provided, keep others intact
        const updated = { ...users[idx] };
        updated.name = name;
        updated.phone = phone;
        updated.address = address;
        updated.email = email;
        if (pass) updated.password = pass;
        users[idx] = updated;
        saveUsers(users);
        setCurrentUser(updated);
        // update UI label immediately
        if (document.getElementById('storeDisplayDesktop')) document.getElementById('storeDisplayDesktop').textContent = updated.name;
        msgEl.textContent = 'Saved.'; msgEl.classList.remove('hidden'); msgEl.style.color = 'green';
        toast('User settings saved', 'success');
        setTimeout(() => { msgEl.classList.add('hidden'); msgEl.style.color = ''; }, 1500);
      });

      // cancel reload
      modal.querySelector('#settingsCancelUserBtn')?.addEventListener('click', () => {
        const current = getCurrentUser() || {};
        document.getElementById('settingsUserName') && (document.getElementById('settingsUserName').value = current.name || '');
        document.getElementById('settingsUserPhone') && (document.getElementById('settingsUserPhone').value = current.phone || '');
        document.getElementById('settingsUserAddress') && (document.getElementById('settingsUserAddress').value = current.address || '');
        document.getElementById('settingsUserEmail') && (document.getElementById('settingsUserEmail').value = current.email || '');
      });

      // messages save/reset
      modal.querySelector('#settingsSaveMsgBtn')?.addEventListener('click', () => {
        const wa = document.getElementById('settingsWaTpl').value.trim();
        const sms = document.getElementById('settingsSmsTpl').value.trim();
        lsSet(LS_MSG_TPL, { reminder_wa: wa, reminder_sms: sms });
        const s = document.getElementById('settingsMsgStatus'); s.textContent = 'Saved'; s.classList.remove('hidden'); setTimeout(()=>s.classList.add('hidden'),1400);
        toast('Templates saved', 'success');
      });
      modal.querySelector('#settingsResetMsgBtn')?.addEventListener('click', () => {
        if (!confirm('Reset message templates to defaults?')) return;
        lsSet(LS_MSG_TPL, {
          reminder_wa: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}.\nFadlan iska bixi dukaanka {store} ({phone}).",
          reminder_sms: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone})."
        });
        toast('Templates reset to defaults', 'success');
      });

      // exports
      modal.querySelector('#exportInvoicesJson')?.addEventListener('click', () => {
        const user = getCurrentUser(); if (!user) { toast('Login required','error'); return; }
        const inv = getStoreInvoices(user.name) || [];
        const blob = new Blob([JSON.stringify(inv, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `invoices_${user.name}_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); toast('Invoices JSON exported','success');
      });
      modal.querySelector('#exportInvoicesCsv')?.addEventListener('click', () => {
        const user = getCurrentUser(); if (!user) { toast('Login required','error'); return; }
        const inv = getStoreInvoices(user.name) || [];
        const rows = [['id','date','customer','phone','amount','paid','status','items']];
        inv.forEach(i => rows.push([i.id, i.date, `"${(i.customer||'').replace(/"/g,'""')}"`, i.phone, i.amount, i.paid, i.status, `"${(i.items||[]).map(it=>it.name).join('|')}"`]));
        const csv = rows.map(r => r.map(c => String(c).replace(/\n/g,' ')).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `invoices_${user.name}_${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove(); toast('Invoices CSV exported','success');
      });

    } // end modal creation

    // show it and populate fields
    modal.classList.remove('hidden');
    const current = getCurrentUser() || {};
    const langSelect = document.getElementById('settingsLangSelect');
    if (langSelect) langSelect.value = lsGet(LS_APP_LANG, 'en') || 'en';
    document.getElementById('settingsUserName') && (document.getElementById('settingsUserName').value = current.name || '');
    document.getElementById('settingsUserPhone') && (document.getElementById('settingsUserPhone').value = current.phone || '');
    document.getElementById('settingsUserAddress') && (document.getElementById('settingsUserAddress').value = current.address || '');
    document.getElementById('settingsUserEmail') && (document.getElementById('settingsUserEmail').value = current.email || '');
    const tpl = lsGet(LS_MSG_TPL) || {};
    document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
    document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');
    const dark = lsGet(LS_DARK) || false;
    const darkToggle = document.getElementById('settingsDarkMode');
    if (dark) document.body.classList.add('dark'); else document.body.classList.remove('dark');
    if (darkToggle) darkToggle.checked = !!dark;
    // default to user panel
    modal.querySelectorAll('.settings-panel').forEach(p => p.dataset.panel === 'user' ? p.classList.remove('hidden') : p.classList.add('hidden'));
  }

  // expose AppSettings helpers
  window.AppSettings = {
    open: openSettingsModal,
    close: () => { const m = document.getElementById('appSettingsModal'); if (m) m.classList.add('hidden'); },
    getTemplates: () => lsGet(LS_MSG_TPL),
    applyLanguage: (lang) => { lsSet(LS_APP_LANG, lang); applyLanguage(lang); },
    createStoreSettingsBtn: function () { const b = ensureSettingsBtn(); if (b) b.style.display = ''; },
    ensure: ensureSettingsBtn
  };

  // ensure button exists now
  ensureSettingsBtn();

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
  const ctx = document.getElementById('salesChart').getContext('2d');
  if (dashboardChart) {
    try { dashboardChart.destroy(); } catch(e){}
    dashboardChart = null;
  }

  // compute max from data
  const maxData = Array.isArray(series.data) && series.data.length ? Math.max(...series.data.map(v => Number(v) || 0)) : 0;

  // candidate step sizes (covers your requested behavior)
  const candidateSteps = [1,5,10,50,100,500,1000,5000,10000,50000,100000,500000,1000000];

  // choose smallest step such that number of steps <= 10 (keeps bars readable)
  function chooseStepAndMax(val) {
    if (!isFinite(val) || val <= 0) return { step: 1, max: 10 };
    for (let i = 0; i < candidateSteps.length; i++) {
      const step = candidateSteps[i];
      const stepsNeeded = Math.ceil(val / step);
      if (stepsNeeded <= 10) {
        const niceMax = step * Math.ceil(val / step); // round up to multiple of step
        return { step, max: niceMax };
      }
    }
    // fallback for very large numbers: use power-of-10 step scaled so steps <= 10
    const pow = Math.pow(10, Math.floor(Math.log10(val)));
    let step = pow;
    while (Math.ceil(val / step) > 10) step *= 10;
    const niceMax = step * Math.ceil(val / step);
    return { step, max: niceMax };
  }

  const { step: stepSize, max: niceMax } = chooseStepAndMax(maxData);

  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Paid Sales',
        data: series.data.map(v => Number(v) || 0),
        fill: false,
        borderWidth: 1,
        barPercentage: 0.75,
        categoryPercentage: 0.85
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: niceMax,
          ticks: {
            stepSize: stepSize,
            callback: function(v) { return fmtMoney(v); }
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(ctx) { return fmtMoney(ctx.parsed.y ?? ctx.parsed); }
          }
        },
        legend: { display: false }
      }
    }
  });
}



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

  // update DOM
  document.getElementById('totalInvoices') && (document.getElementById('totalInvoices').textContent = totalInvoicesCount);
  document.getElementById('totalProducts') && (document.getElementById('totalProducts').textContent = totalProductsCount);
  document.getElementById('totalSales') && (document.getElementById('totalSales').textContent = fmtMoney(totalSalesPaid));
  document.getElementById('totalRevenue') && (document.getElementById('totalRevenue').textContent = fmtMoney(totalRevenue));

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
    if (dashboardLiveInterval) { clearInterval(dashboardLiveInterval); dashboardLiveInterval = null; }
    updateDashboardTotals(p);
    // if live, auto-refresh every 5 seconds
    if (p === 'live') {
      dashboardLiveInterval = setInterval(() => updateDashboardTotals('today'), 5000);
    }
  }

  // wire events
  periodSel?.addEventListener('change', applyPeriodChange);
  refreshBtn?.addEventListener('click', () => applyPeriodChange());

  // when data updates elsewhere, refresh current period
  window.removeEventListener('dataUpdated', updateDashboardTotals); // avoid duplicate
  window.addEventListener('dataUpdated', () => updateDashboardTotals(periodSel?.value || 'lifetime'));

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

  /* =========================
    /* =========================
   NAV / showSection (single consolidated version)
   ========================= */
function showSection(targetId) {
  // hide main sections
  [dashboardContent, invoicesSection, productsSection, reportsSection].forEach(s => s && s.classList.add('hidden'));

  // show requested section (if it exists)
  const el = document.getElementById(targetId);
  if (el) el.classList.remove('hidden');

  // section-specific updates
  if (targetId === "dashboardContent") updateDashboardTotals();
  if (targetId === "invoicesSection") renderInvoiceTable();
  if (targetId === "productsSection") renderProductList(searchInput?.value || '');
  if (targetId === "reportsSection") renderReports();

  // mark active nav button (pass null/empty to clear all)
  setActiveNav(targetId || null);

  // ensure bottom nav is visible when on app pages (hide on auth)
  document.getElementById('bottomNav')?.classList.remove('hidden');

  // when showing an app section, make sure auth UI is hidden
  if (authSection) authSection.classList.add('hidden');
  setAuthVisibility(false);
}

// highlight active button (accepts null to clear active state)
function setActiveNav(targetId) {
  navButtons.forEach(btn => {
    const isActive = targetId && btn.getAttribute('data-target') === targetId;
    btn.classList.toggle('text-blue-600', !!isActive);
    btn.classList.toggle('font-bold', !!isActive);
  });
}

// single wiring for nav buttons (only once)
navButtons.forEach(btn => btn.addEventListener('click', () => {
  const target = btn.getAttribute('data-target');
  if (target) showSection(target);
}));

/* =========================
   Show/hide auth (login/register)
   ========================= */
function showLoginForm() {
  // show auth container and login panel, hide dashboard/other app sections
  authSection?.classList.remove('hidden');
  registrationForm?.classList.add('hidden');
  loginForm?.classList.remove('hidden');
  dashboardSection?.classList.add('hidden');

  // hide bottom nav while on auth screens
  document.getElementById('bottomNav')?.classList.add('hidden');

  // mark nav as inactive
  setActiveNav(null);
  setAuthVisibility(true);
}

function showRegisterForm() {
  authSection?.classList.remove('hidden');
  registrationForm?.classList.remove('hidden');
  loginForm?.classList.add('hidden');
  dashboardSection?.classList.add('hidden');

  document.getElementById('bottomNav')?.classList.add('hidden');

  setActiveNav(null);
  setAuthVisibility(true);
}


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
  
    const all = getStoreProducts(user.name);
    const q = (filter || '').toString().toLowerCase().trim();
    const items = q ? all.filter(p => (p.name || '').toString().toLowerCase().includes(q)) : all;
  
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
              <button class="action-icon text-red-600" data-action="delete" data-id="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        productRows.appendChild(tr);
      });
    }
// Mobile Cards - Icons Only
items.forEach((p, idx) => {
  const card = document.createElement('div');
  card.className = 'bg-white dark:bg-gray-800 rounded-2xl p-4 shadow hover:shadow-lg transition flex flex-col gap-3 w-full';
  card.innerHTML = `
    <!-- Product Name + Price -->
    <div class="flex justify-between items-center">
      <h4 class="font-semibold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(p.name)}</h4>
      <div class="text-emerald-600 font-semibold">$${Number(p.price||0).toFixed(2)}</div>
    </div>

    <!-- Cost + Quantity -->
    <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300">
      <div>Cost: $${Number(p.cost||0).toFixed(2)}</div>
      <div>Qty: ${p.qty}</div>
    </div>

    <!-- Actions (Icons only) -->
    <div class="flex justify-start gap-2 mt-2">
      <button class="action-icon bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition" data-action="buy" data-id="${p.id}" title="Add to cart">
        <i class="fa-solid fa-cart-shopping"></i>
      </button>
      <button class="action-icon bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-lg transition" data-action="edit" data-id="${p.id}" title="Edit">
        <i class="fa-solid fa-pen-to-square"></i>
      </button>
      <button class="action-icon bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition" data-action="delete" data-id="${p.id}" title="Delete">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `;
  productCards.appendChild(card);
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
function applyStatusPaidBehavior(invoiceModal, total) {
  if (!invoiceModal) return;
  const amountPaidInput = invoiceModal.querySelector('#amountPaid');
  const statusSelect = invoiceModal.querySelector('#status');
  const totalEl = invoiceModal.querySelector('#invoiceTotal');

  const ttl = Number(total || 0);
  let lastStatus = 'unpaid';

  // show total
  if (totalEl) totalEl.textContent = fmtMoney(ttl);

  // ensure partial option exists
  if (statusSelect && !Array.from(statusSelect.options).some(o => o.value === 'partial')) {
    const opt = document.createElement('option');
    opt.value = 'partial';
    opt.textContent = 'partial paid';
    statusSelect.add(opt, statusSelect.options[1] || null);
  }

  // validate + sync from amount input
  function syncFromAmount() {
    if (!amountPaidInput || !statusSelect) return;
    let val = Number(amountPaidInput.value || 0);
    if (isNaN(val)) val = 0;

    if (val <= 0) {
      statusSelect.value = 'unpaid';
      lastStatus = 'unpaid';
    } else if (val >= ttl) {
      val = ttl; // clamp
      amountPaidInput.value = val.toFixed(2);
      statusSelect.value = 'paid';
      lastStatus = 'paid';
    } else {
      amountPaidInput.value = val.toFixed(2);
      statusSelect.value = 'partial';
      lastStatus = 'partial';
    }
  }

  // validate + sync from status dropdown
  function syncFromStatus() {
    if (!statusSelect || !amountPaidInput) return;
    const cur = statusSelect.value;

    if (cur === 'paid') {
      amountPaidInput.value = ttl.toFixed(2);
      lastStatus = 'paid';
    } else if (cur === 'unpaid') {
      amountPaidInput.value = '';
      lastStatus = 'unpaid';
    } else if (cur === 'partial') {
      // prevent manual partial selection
      toast('Please enter an amount paid to set partial status.', 'warning');
      statusSelect.value = lastStatus; // revert
    }
  }

  // listeners
  if (amountPaidInput && !amountPaidInput._listenerBound) {
    amountPaidInput.addEventListener('input', () => {
      let raw = amountPaidInput.value.replace(/[^0-9.]/g, '');
      amountPaidInput.value = raw;
      syncFromAmount();
    });
    amountPaidInput._listenerBound = true;
  }

  if (statusSelect && !statusSelect._listenerBound) {
    statusSelect.addEventListener('change', syncFromStatus);
    statusSelect._listenerBound = true;
  }

  // initial run
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
      const row = document.createElement('div');
      row.className = 'grid sm:grid-cols-4 gap-2 mb-2 items-end';
      const safeName = (data.name || data.product || '').toString().replace(/"/g, '&quot;');
      const safePrice = Number(data.price ?? data.total ?? 0);
      row.innerHTML = `
        <input class="col-span-2 item-name border rounded-xl px-3 py-2" placeholder="Item name" value="${escapeHtml(safeName)}">
        <input type="number" min="0" step="0.01" class="item-price border rounded-xl px-3 py-2" placeholder="Price" value="${safePrice}">
        <div class="flex items-center gap-2">
          <input readonly class="item-total flex-1 border rounded-xl px-3 py-2 bg-gray-50" value="${fmtMoney(safePrice)}">
          <button type="button" class="remove-item px-3 py-2 rounded bg-red-500 text-white">✕</button>
        </div>
      `;
      const priceEl = row.querySelector('.item-price');
      const totalEl = row.querySelector('.item-total');
      function recalc() { const p = parseFloat(priceEl.value) || 0; totalEl.value = fmtMoney(p); recalcInvoiceTotals(); }
      priceEl.addEventListener('input', recalc);
      row.querySelector('.remove-item').addEventListener('click', () => { row.remove(); recalcInvoiceTotals(); });
      return row;
    }
  
    function recalcInvoiceTotals() {
      if (!invoiceItemsContainer) return;
      const rows = Array.from(invoiceItemsContainer.querySelectorAll('.item-total'));
      const total = rows.reduce((s, el) => s + (Number(el.value) || 0), 0);
      amountInput && (amountInput.value = fmtMoney(total));
      const paid = Number(paidInput?.value) || 0;
      if (statusSelect) statusSelect.value = paid >= total && total > 0 ? 'paid' : 'unpaid';
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
      // collect items robustly
      const items = invoiceItemsContainer ? Array.from(invoiceItemsContainer.querySelectorAll('.grid')).map(r => {
        const nm = r.querySelector('.item-name')?.value.trim() || '';
        const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
        return { name: nm, price, total: price, qty: 1 };
      }).filter(it => it.name && it.price > 0) : [];
  
      if (!items.length) { showFormError('Add at least one item with name and price.'); return; }
      const amount = Number(amountInput?.value) || 0;
      const paid = Number(paidInput?.value) || 0;
      const status = statusSelect?.value || 'unpaid';
  
      if (!name) { showFormError('Customer name required'); return; }
      if (!phone) { showFormError('Customer phone required'); return; }
  
      const all = getAllInvoices();
      const id = editingInvoiceId?.value || `INV-${Date.now()}`;
      const payload = { id, store: user.name, date, customer: name, phone, items, amount, paid, status };
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
        emptyStateInv && emptyStateInv.classList.remove('hidden'); return;
      } else {
        emptyStateInv && emptyStateInv.classList.add('hidden');
      }
      const mobile = window.matchMedia('(max-width:640px)').matches;
      const storeName = getCurrentUser()?.name || '';
      list.forEach((invObj, idx) => {
        const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
        const balanceColorClass = balance <= 0 ? 'text-emerald-600' : 'text-rose-600';
        if (mobile) {
          const tr = document.createElement('tr');
          tr.className = 'border-b';
          tr.innerHTML = `
            <td colspan="10" class="p-2">
              <div class="sm-card p-3 bg-white rounded-xl shadow-sm">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold">${(storeName || 'S').slice(0, 2).toUpperCase()}</div>
                  <div style="flex:1;">
                    <div class="font-semibold">Invoice ${escapeHtml(invObj.id)}</div>
                    <div class="text-sm text-gray-500">${fmtDate(invObj.date)} • ${escapeHtml(invObj.customer || '')}</div>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-between">
                  <div class="text-sm">${escapeHtml(invObj.phone || '')}</div>
                  <div class="text-right">
                    <div class="font-semibold">${fmtMoney(invObj.amount)}</div>
                    <div class="text-xs ${balanceColorClass}">${escapeHtml(invObj.status)} • ${fmtMoney(balance)}</div>
                  </div>
                </div>
                <div class="mt-3 flex items-center gap-2 flex-wrap">
                  <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                  <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${invObj.status === 'paid' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-xmark"></i>'}</button>
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
            <td class="p-2"><span class="${invObj.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} px-2 py-1 rounded text-xs">${escapeHtml(invObj.status)}</span></td>
            <td class="p-2 no-print">
              <div class="flex gap-2">
                <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${invObj.status === 'paid' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-xmark"></i>'}</button>
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
        if (confirm('Delete this invoice?')) {
          all.splice(idx, 1); saveAllInvoices(all); renderInvoiceTable(); window.dispatchEvent(new Event('dataUpdated')); toast('Invoice deleted', 'success');
        }
      } else if (action === 'toggle') {
        if (all[idx].status === 'unpaid') {
          all[idx].prevPaid = all[idx].paid;
          all[idx].status = 'paid';
          all[idx].paid = Number(all[idx].amount) || 0;
        } else {
          all[idx].status = 'unpaid';
          all[idx].paid = all[idx].prevPaid || 0;
        }
        saveAllInvoices(all); renderInvoiceTable(); window.dispatchEvent(new Event('dataUpdated'));
      } else if (action === 'edit') {
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
    function printInvoice(inv) {
      const balance = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
      const win = window.open('', 'PRINT', 'height=650,width=900');
      const store = getCurrentUser() || {};
      const head = `
        <html><head><title>Invoice ${escapeHtml(inv.id)}</title>
        <style>
          body{font-family:sans-serif;padding:20px;color:#111}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          td,th{border:1px solid #ddd;padding:8px}
          th{background:#f4f4f4}
        </style>
        </head><body>`;
      const footer = `</body></html>`;
      const content = `
        <h1>Invoice ${escapeHtml(inv.id)}</h1>
        <p><strong>Store:</strong> ${escapeHtml(store.name||'Supermarket')}<br/>
        <strong>Date:</strong> ${fmtDate(inv.date)}<br/>
        <strong>Customer:</strong> ${escapeHtml(inv.customer||'Walk-in')}<br/>
        <strong>Phone:</strong> ${escapeHtml(inv.phone||'')}</p>
        <table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
        ${(inv.items||[]).map(it => `<tr><td>${escapeHtml(it.name||it.product||'Item')}</td><td>${it.qty||1}</td><td>${fmtMoney(it.price||0)}</td><td>${fmtMoney(it.total||((it.price||0)*(it.qty||1)))}</td></tr>`).join('')}
        </tbody></table>
        <p><strong>Amount:</strong> ${fmtMoney(inv.amount)}<br/>
        <strong>Paid:</strong> ${fmtMoney(inv.paid)}<br/>
        <strong>Balance:</strong> ${fmtMoney(balance)}<br/>
        <strong>Status:</strong> ${escapeHtml(inv.status)}</p>
      `;
      win.document.write(head + content + footer);
      win.document.close();
      win.focus();
      // small delay to ensure render
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
       REMINDERS / MESSAGING
       ========================= */
    function sendReminderForSingle(invObj, method) {
      if (!invObj) return;
      const phone = cleanPhone(invObj.phone || '');
      if (!phone) return toast('No phone number for this invoice.', 'error');
      const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
      const tpl = lsGet(LS_MSG_TPL, {});
      const defaultWa = tpl.reminder_wa || "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).";
      const defaultSms = tpl.reminder_sms || defaultWa;
      const template = method === 'wa' ? defaultWa : defaultSms;
      const storeName = getCurrentUser()?.name || '';
      const storePhone = (getCurrentUser()?.phone) || '';
      const msg = template.replace(/\{customer\}/gi, invObj.customer || '')
        .replace(/\{id\}/gi, invObj.id || '')
        .replace(/\{balance\}/gi, fmtMoney(balance))
        .replace(/\{store\}/gi, storeName)
        .replace(/\{phone\}/gi, storePhone);
      if (method === 'wa') {
        window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
      } else {
        window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
      }
    }
  
    function sendReminderForGrouped(group, method) {
      const phone = cleanPhone(group.phone || '');
      if (!phone) return toast('No phone for group.', 'error');
      const tpl = lsGet(LS_MSG_TPL, {});
      const defaultWa = tpl.reminder_wa || "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).";
      const defaultSms = tpl.reminder_sms || defaultWa;
      const template = method === 'wa' ? defaultWa : defaultSms;
      const storeName = getCurrentUser()?.name || '';
      const storePhone = (getCurrentUser()?.phone) || '';
      const ids = group.invoices.map(i => i.id).join(',');
      const msg = template.replace(/\{customer\}/gi, group.customer || '')
        .replace(/\{id\}/gi, ids)
        .replace(/\{balance\}/gi, fmtMoney(group.totalBalance || 0))
        .replace(/\{store\}/gi, storeName)
        .replace(/\{phone\}/gi, storePhone);
      if (method === 'wa') {
        window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
      } else {
        window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
      }
    }
  
    /* confirmation modal for reminders */
    function createReminderConfirmModal() {
      let modal = document.getElementById('reminderConfirmModal');
      if (modal) return modal;
      const html = `
        <div id="reminderConfirmModal" class="hidden fixed inset-0 z-60 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/50"></div>
          <div class="relative max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 id="reminderConfirmHeader" class="text-lg font-semibold mb-2"></h3>
            <div id="reminderConfirmBody" class="mb-4 whitespace-pre-line"></div>
            <div class="flex justify-end gap-2">
              <button id="reminderCancelBtn" class="px-3 py-2 rounded bg-gray-200">Cancel</button>
              <button id="reminderOkBtn" class="px-3 py-2 rounded bg-emerald-600 text-white">OK</button>
            </div>
          </div>
        </div>
      `;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);
      return document.getElementById('reminderConfirmModal');
    }
  
    function showReminderConfirm(group, progressStr, messageText) {
      return new Promise((resolve) => {
        const modal = createReminderConfirmModal();
        const header = modal.querySelector('#reminderConfirmHeader');
        const body = modal.querySelector('#reminderConfirmBody');
        const okBtn = modal.querySelector('#reminderOkBtn');
        const cancelBtn = modal.querySelector('#reminderCancelBtn');
        header.textContent = `${progressStr} Xasuusin ${group.customer || ''}`;
        body.textContent = messageText;
        function cleanup() { modal.classList.add('hidden'); okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); }
        function onOk() { cleanup(); resolve(true); }
        function onCancel() { cleanup(); resolve(false); }
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.classList.remove('hidden');
        okBtn.focus();
      });
    }
  
    async function sendAllRemindersFlow(method) {
      const user = getCurrentUser();
      if (!user) return toast('Login required', 'error');
  
      // gather invoices that owe money and have phone
      const invoices = filteredInvoicesForUI().filter(inv => {
        const bal = (Number(inv.amount) || 0) - (Number(inv.paid) || 0);
        return inv.phone && bal > 0;
      });
      if (!invoices.length) return toast('No customers need reminders based on current filter/search.', 'info');
  
      // group by phone + customer
      const groupsMap = new Map();
      invoices.forEach(inv => {
        const phone = cleanPhone(inv.phone || '');
        const customer = (inv.customer || '').trim();
        const key = `${phone}||${customer}`;
        const bal = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
        if (!groupsMap.has(key)) groupsMap.set(key, { customer, phone, totalBalance: 0, invoices: [] });
        const g = groupsMap.get(key);
        g.totalBalance += bal;
        g.invoices.push(inv);
      });
  
      const groups = Array.from(groupsMap.values());
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const progressStr = `${i + 1}/${groups.length}`;
        const storeName = user.name || '';
        const storePhone = user.phone || '';
        const preview = `Xasuusin: ${g.customer}\nLacagta lagugu leeyahay waa: ${fmtMoney(g.totalBalance)}\nFadlan iska bixi dukaanka ${storeName} (${storePhone})`;
        const confirmed = await showReminderConfirm(g, progressStr, preview);
        if (!confirmed) return;
        sendReminderForGrouped(g, method);
        await new Promise(res => setTimeout(res, 300));
      }
    }
  
    sendAllRemindersBtn?.addEventListener('click', async () => {
      const method = (reminderMethod?.value) || 'wa';
      await sendAllRemindersFlow(method);
    });
  
    /* single invoice reminder */
    function sendReminderFor(invObj, method) {
      const phone = cleanPhone(invObj.phone || '');
      if (!phone) return toast('No phone provided', 'error');
      const storeName = getCurrentUser()?.name || '';
      const storePhone = getCurrentUser()?.phone || '';
      const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
      const preview = `Xasuusin: ${invObj.customer}\nLacagta lagugu leeyahay waa: ${fmtMoney(balance)}\nFadlan iska bixi dukaanka ${storeName} (${storePhone})`;
      showReminderConfirm({ customer: invObj.customer, phone: invObj.phone, invoices: [invObj], totalBalance: balance }, `1/1`, preview).then(ok => {
        if (ok) sendReminderForSingle(invObj, method);
      });
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
      if (!confirm('Delete this report?')) return;
      reports.splice(idx, 1); saveAllReports(reports); renderReports(); toast('Report deleted', 'success');
    } else if (action === 'print-report') {
      const rpt = reports[idx];
    
      // open print window
      const win = window.open('', 'PRINT', 'height=650,width=900');
      const head = `
        <html>
          <head>
            <title>Report ${escapeHtml(rpt.id)}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; padding: 20px; color: #111; }
              h1 { font-size: 18px; margin-bottom: 6px; }
              p.meta { margin: 0 0 12px 0; color: #444; font-size: 13px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
              th { background: #f4f4f4; font-weight: 600; }
              tfoot th { background: #fff; font-weight: 700; text-align: right; }
              .summary-label { text-align: right; }
            </style>
          </head>
          <body>
      `;
    
      // build product rows
      const rowsHtml = (rpt.items || []).map(it => {
        const name = escapeHtml(it.name || '');
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        const total = (Number(it.total) || (price * qty)) || 0;
        return `<tr>
          <td>${name}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${fmtMoney(price)}</td>
          <td style="text-align:right">${fmtMoney(total)}</td>
        </tr>`;
      }).join('');
    
      // compute totals (safe fallbacks)
      const sumItemsTotal = (rpt.items || []).reduce((s, it) => {
        const qty = Number(it.qty) || 1;
        const price = Number(it.price) || 0;
        const total = Number(it.total);
        return s + (isFinite(total) && total > 0 ? total : (price * qty));
      }, 0);
    
      const totalAmount = Number(rpt.amount) || sumItemsTotal || 0;
      const paidAmount = Number(rpt.paid) || 0;
      const dueAmount = Number((totalAmount - paidAmount).toFixed(2));
    
      // updated status logic: unpaid / partial paid / paid / overpaid
      let status = '';
      if (rpt.status && String(rpt.status).trim()) {
        status = escapeHtml(rpt.status);
      } else {
        if (paidAmount <= 0) status = 'unpaid';
        else if (paidAmount >= totalAmount && totalAmount > 0) status = 'paid';
        else if (paidAmount > 0 && paidAmount < totalAmount) status = 'partial paid';
        else if (totalAmount === 0 && paidAmount > 0) status = 'paid';
        else status = 'unpaid';
        // optional: mark overpaid explicitly
        if (paidAmount > totalAmount) status = 'overpaid';
      }
    
      // content with table + footer summary
      const content = `
        <h1>Report ${escapeHtml(rpt.id)}</h1>
        <p class="meta">${fmtDateTime(rpt.date)}${rpt.customer ? ' | ' + escapeHtml(rpt.customer) : ''}${rpt.phone ? ' | ' + escapeHtml(rpt.phone) : ''}</p>
    
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Price</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <th class="summary-label" colspan="3">Total Amount</th>
              <th style="text-align:right">${fmtMoney(totalAmount)}</th>
            </tr>
            <tr>
              <th class="summary-label" colspan="3">Paid Amount</th>
              <th style="text-align:right">${fmtMoney(paidAmount)}</th>
            </tr>
            <tr>
              <th class="summary-label" colspan="3">Due / Balance</th>
              <th style="text-align:right">${fmtMoney(dueAmount)}</th>
            </tr>
            <tr>
              <th class="summary-label" colspan="3">Status</th>
              <th style="text-align:right">${escapeHtml(status)}</th>
            </tr>
          </tfoot>
        </table>
      `;
    
      // write and print
      win.document.write(head + content + '</body></html>');
      win.document.close();
      setTimeout(()=> {
        try { win.print(); } catch(e) { toast('Print failed','error'); console.error(e); }
      }, 300);
    }
    
  });

  // reports export all / delete all controls
  reportsExportPdf?.addEventListener('click', async () => {
    const list = getReportsFiltered(
      reportsPeriod?.value || 'lifetime',
      reportsDate?.value || '',
      reportsSearchInput?.value || ''
    );
    if (!list.length) {
      toast('No reports to export', 'error');
      return;
    }
  
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
  
      // Helpers
      const money = v => fmtMoney(Number(v || 0));
      const sumQty = r => (Array.isArray(r.items) ? r.items.reduce((a, it) => a + (Number(it.qty) || 0), 0) : (Number(r.qty) || 0));
      const totalOf = r => (r.total != null ? Number(r.total) : (r.amount != null ? Number(r.amount) : 0));
      const paidOf  = r => Number(r.paid || 0);
      const dueOf   = r => Math.max(0, totalOf(r) - paidOf(r));
      const productsOf = r => {
        const names = Array.isArray(r.items) ? r.items.map(it => it?.name).filter(Boolean) : [];
        if (names.length === 0 && r.product) return String(r.product);
        if (names.length <= 2) return names.join(', ');
        return `${names[0]}, ${names[1]} +${names.length - 2}`;
      };
      const statusOf = r => (r.status ? String(r.status) : (dueOf(r) > 0 ? 'due' : 'paid'));
      const phoneOf  = r => (r.phone ? String(r.phone) : '');
      const timeOf   = r => fmtDateTime(r.date);
  
      // Title
      doc.setFontSize(14);
      doc.text(`Reports (${reportsPeriod?.value || 'lifetime'}) - ${fmtDate(new Date())}`, 10, 10);
  
      // Column layout (A4 portrait, mm)
      // widths sum = 174 mm, fits inside 190 mm usable area (10 mm margins)
      const columns = [
        { key: 'no',        label: '#',         width: 7,   align: 'right' },
        { key: 'products',  label: 'Products',  width: 28,  align: 'left'  },
        { key: 'qty',       label: 'Qty',       width: 8,   align: 'right' },
        { key: 'total',     label: 'Total',     width: 17,  align: 'right' },
        { key: 'paid',      label: 'Paid',      width: 17,  align: 'right' },
        { key: 'due',       label: 'Due',       width: 17,  align: 'right' },
        { key: 'status',    label: 'Status',    width: 17,  align: 'left'  },
        { key: 'customer',  label: 'Customer',  width: 24,  align: 'left'  },
        { key: 'phone',     label: 'Phone',     width: 15,  align: 'left'  },
        { key: 'time',      label: 'Timestamp', width: 24,  align: 'left'  },
      ];
  
      const marginLeft = 10;
      const marginTop  = 16;
      const lineH = 6;
  
      // Precompute x positions
      let x = marginLeft;
      columns.forEach(col => { col.x = x; x += col.width; });
  
      function drawHeaders(y) {
        doc.setFontSize(11);
        columns.forEach(col => {
          drawText(col.label, col, y, /*isHeader*/true);
        });
      }
  
      function drawText(text, col, y, isHeader = false) {
        const maxW = col.width - 1; // small padding
        const lines = doc.splitTextToSize(String(text ?? ''), maxW);
        const textWidth = doc.getTextWidth(lines[0] || '');
        let tx = col.x + 1; // left padding
        if (col.align === 'right') tx = col.x + col.width - 1 - textWidth;
        doc.text(lines, tx, y);
        return lines.length;
      }
  
      function drawRow(rowValues, y) {
        // wrap-aware row height
        let maxLines = 1;
        doc.setFontSize(10);
        columns.forEach(col => {
          const lines = doc.splitTextToSize(String(rowValues[col.key] ?? ''), col.width - 1);
          maxLines = Math.max(maxLines, lines.length);
        });
        // draw cells
        columns.forEach(col => {
          drawText(rowValues[col.key], col, y);
        });
        return maxLines * lineH;
      }
  
      // Start
      let y = marginTop + 4;
      drawHeaders(y);
      y += lineH;
  
      // Rows
      list.forEach((r, i) => {
        const row = {
          no: i + 1,
          products: productsOf(r),
          qty: sumQty(r),
          total: money(totalOf(r)),
          paid: money(paidOf(r)),
          due: money(dueOf(r)),
          status: statusOf(r),
          customer: r.customer || '',
          phone: phoneOf(r),
          time: timeOf(r),
        };
  
        // page break check (estimate height by wrapping)
        // compute row height first without drawing
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
  
        // draw the row for real
        y += drawRow(row, y);
      });
  
      doc.save(`reports_${Date.now()}.pdf`);
      toast('PDF exported', 'success');
    } else {
      // fallback JSON
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
    ensureSettingsBtn();
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

  // UI Modal builder (mobile friendly)
  function openSettingsModal(){
    let modal = document.getElementById('appSettingsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'appSettingsModal';
      modal.className = 'hidden fixed inset-0 z-90 flex items-start justify-center p-4';
      modal.innerHTML = `
        <div id="appSettingsModalBackdrop" class="absolute inset-0 bg-black/60"></div>
        <div class="relative w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-auto max-h-[92vh]">
          <div class="flex items-center justify-between p-3 border-b">
            <h2 id="settingsTitle" class="text-lg font-semibold">Settings & Utilities</h2>
            <div class="flex items-center gap-2">
              <button id="settingsHelpOpen" title="Help" class="px-3 py-1 rounded bg-gray-100"><i class="fa-solid fa-question"></i></button>
              <button id="settingsCloseBtn" class="px-3 py-1 rounded bg-gray-200">Close</button>
            </div>
          </div>

          <div class="md:flex md:gap-4">
            <nav id="settingsNav" class="md:w-56 p-3 border-r hidden md:block">
              <ul class="space-y-2 text-sm">
                <li><button class="settings-tab w-full text-left px-2 py-2 rounded" data-tab="messages"><i class="fa-solid fa-message mr-2"></i> Messages</button></li>
                <li><button class="settings-tab w-full text-left px-2 py-2 rounded" data-tab="helpNav"><i class="fa-solid fa-circle-info mr-2"></i> Help</button></li>
                <li><button class="settings-tab w-full text-left px-2 py-2 rounded" data-tab="notices"><i class="fa-solid fa-bell mr-2"></i> Notices</button></li>
                <li><button class="settings-tab w-full text-left px-2 py-2 rounded" data-tab="export"><i class="fa-solid fa-download mr-2"></i> Export</button></li>
                <li><button class="settings-tab w-full text-left px-2 py-2 rounded" data-tab="drive"><i class="fa-brands fa-google-drive mr-2"></i> Drive Backup</button></li>
              </ul>
            </nav>

            <div id="settingsContent" class="p-3 md:flex-1">
              <!-- Panels stack for mobile -->
              <div class="settings-panel" data-panel="messages" style="display:none">
                <h4 class="font-semibold mb-2">WhatsApp / SMS Templates</h4>
                <div class="text-sm mb-2">Placeholders: <code>{customer}</code> <code>{id}</code> <code>{balance}</code> <code>{store}</code></div>
                <div class="space-y-2">
                  <textarea id="settingsWaTpl" rows="3" class="w-full border rounded p-2"></textarea>
                  <textarea id="settingsSmsTpl" rows="3" class="w-full border rounded p-2"></textarea>
                  <div class="flex gap-2 mt-2">
                    <button id="settingsSaveMsgBtn" class="px-3 py-2 bg-blue-600 text-white rounded">Save</button>
                    <button id="settingsResetMsgBtn" class="px-3 py-2 bg-gray-200 rounded">Reset</button>
                    <div id="settingsMsgStatus" class="text-sm text-green-600 hidden ml-2">Saved</div>
                  </div>
                </div>
              </div>

           <div class="settings-panel" data-panel="helpNav" style="display:none">
  <h4 class="font-semibold mb-2">Help & Full Guide (All Buttons)</h4>
  <div class="space-y-3 text-sm">

    <div>
      <i class="fa-solid fa-plus mr-2"></i>
      <b>Add Product</b> — Click <span class="px-2 bg-gray-100 rounded text-xs">Add Product</span> to open the product form. Fill:
      <ul class="ml-5 list-disc mt-1">
        <li><b>Product Name</b> — readable name (e.g. Rice 25kg)</li>
        <li><b>Original Price/Cost</b> — optional, for margins</li>
        <li><b>Price</b> — selling price (required)</li>
        <li><b>Quantity</b> — current stock (required)</li>
      </ul>
      After filling press <b>Save Product</b>. The product will show in the list and be available when creating invoices.
    </div>

    <div>
      <i class="fa-solid fa-file-invoice-dollar mr-2"></i>
      <b>Create Invoice</b> — Click <span class="px-2 bg-gray-100 rounded text-xs">Create Invoice</span>.
      <ol class="ml-5 list-decimal mt-1">
        <li>Add customer name and phone (phone cleans to +252 format automatically).</li>
        <li>Add items: choose a product or type name, set quantity and price.</li>
        <li>Amount (total) is calculated automatically. Enter amount paid and set status (Paid/Unpaid).</li>
        <li>Click <b>Save Invoice</b> to record the sale into Reports & localStorage.</li>
      </ol>
    </div>

    <div>
      <i class="fa-solid fa-pen mr-2"></i>
      <b>Edit Invoice / Product</b> — Use the Edit icon on the invoice or product row. Update fields and click Save. Edits change localStorage immediately and update totals/charts.
    </div>

    <div>
      <i class="fa-solid fa-trash mr-2"></i>
      <b>Delete</b> — Use Delete action on products or reports. Deletions remove the item from localStorage on this device. ⚠️ Deletion is permanent unless you have a backup that contains the deleted item.
    </div>

    <div>
      <i class="fa-solid fa-file-export mr-2"></i>
      <b>Export / Print</b> — Use the Settings → Export options:
      <ul class="ml-5 list-disc mt-1">
        <li><b>PDF</b> — exports invoices to PDF using jsPDF.</li>
        <li><b>CSV</b> — CSV/Excel style export for spreadsheets.</li>
        <li><b>Print</b> — Use the print icon on invoice cards to print a single invoice.</li>
      </ul>
    </div>

    <div>
      <i class="fa-brands fa-google-drive mr-2"></i>
      <b>Backup & Restore (Google Drive)</b> —
      <ul class="ml-5 list-disc mt-1">
        <li><b>Backup</b> saves a full snapshot of your <code>localStorage</code> as a JSON file to your Google Drive (filename starts with <code>supermarket_backup_</code>).</li>
        <li><b>Restore</b> downloads a snapshot and <b>overwrites localStorage</b> on this browser/device — that means all invoices, products, reports, users, and app settings will be replaced by what's in the backup file.</li>
        <li><b>What is restored?</b> — everything stored in localStorage keys (invoices, products, reports, users, templates, notices, settings). If a report/product was deleted after the backup was made, and the backup still contains it, that deleted item will reappear after restoring.</li>
        <li><b>What is not restored?</b> — anything stored elsewhere (server-side, other browser profiles) or outside localStorage on this browser.</li>
        <li><b>Tip</b>: Before restoring, export current data (Settings → Export) so you have a fallback copy in case you want to return to the current state.</li>
      </ul>
    </div>

    <div>
      <i class="fa-solid fa-clock-rotate-left mr-2"></i>
      <b>Auto backup & Auto-restore</b> —
      <ul class="ml-5 list-disc mt-1">
        <li><b>Auto backup every X days</b> (opt-in) — runs while the app is open and saves a Drive snapshot.</li>
        <li><b>Auto-restore on login</b> (opt-in) — on login the app will check Drive for the latest backup and ask if you'd like to restore it.</li>
        <li><b>Scheduling note</b> — auto-backups are triggered by timers in the browser; they run only while the app page is open in a tab.</li>
      </ul>
    </div>

    <div>
      <i class="fa-solid fa-chart-line mr-2"></i>
      <b>Sales / Revenue / Totals (Dashboard)</b> —
      <ul class="ml-5 list-disc mt-1">
        <li><b>Sales (Paid)</b> — sum of the <code>paid</code> values from invoices (what customers already paid).</li>
        <li><b>Revenue</b> — sum of invoice totals (<code>amount</code> or <code>total</code>) regardless of paid/unpaid.</li>
        <li><b>Period filter</b> — choose Live/Today/Weekly/Monthly/Yearly to change buckets used in the chart and totals. If chart looks empty, check invoice dates / timezone / malformed dates.</li>
      </ul>
    </div>

    <div>
      <i class="fa-solid fa-print mr-2"></i>
      <b>Printing & Layout Tips</b> —
      <ul class="ml-5 list-disc mt-1">
        <li>Use the print icon on invoices for a concise print layout.</li>
        <li>On mobile, rotate to landscape for wider tables or export Reports and open on desktop for printing.</li>
      </ul>
    </div>

    <div>
      <i class="fa-solid fa-lightbulb mr-2"></i>
      <b>Troubleshooting</b> —
      <ul class="ml-5 list-disc mt-1">
        <li>If charts are wrong: ensure invoices have valid <code>date</code> fields (ISO or timestamp). Wrong date formats can push data out of the selected period.</li>
        <li>If a button is missing: refresh the page. If the settings cog disappears on mobile ensure you are logged in (the cog only shows when a user is logged in).</li>
        <li>If Drive backups fail: verify your Google OAuth client, add the test user on the OAuth consent screen, and allow the Drive scope. Check browser popup blockers.</li>
        <li>If data seems lost: do not overwrite with a new restore — export current state first, then try to restore older backup.</li>
      </ul>
    </div>
    <div>
      <i class="fa-solid fa-shield-halved mr-2"></i>
      <b>Security & Privacy</b> —
      <ul class="ml-5 list-disc mt-1">
        <li>Backups are stored in your Google Drive under your account — the app does not send data to any third-party server.</li>
        <li>Be careful with shared Drive accounts. If multiple people use the same Drive account they can access the backups.</li>
        <li>Treat your OAuth client secret and Drive access carefully — keep them private.</li>
      </ul>
    </div>

    <div>
      <i class="fa-solid fa-headset mr-2"></i>
      <b>If something still fails</b> —
      <ol class="ml-5 list-decimal mt-1">
        <li>Refresh the page, and test on desktop (browser devtools console may show errors).</li>
        <li>Export your current invoices (Settings → Export) to keep a copy.</li>
        <li>Check that your Google test user is added under OAuth consent screen (for Drive access during testing).</li>
        <li>Contact support with a screenshot of console errors and steps to reproduce.</li>
      </ol>
    </div>

  </div>

  <div class="mt-3 text-xs text-gray-500">
    Tip: On mobile, use the <b>Help</b> button in the settings modal (top-right) for quick access. Rotate to landscape for wider tables.
  </div>
</div>


              <div class="settings-panel" data-panel="notices" style="display:none">
                <h4 class="font-semibold mb-2">Notices</h4>
                <div id="settingsNotices" class="space-y-2 max-h-56 overflow-auto p-1"></div>
              </div>

              <div class="settings-panel" data-panel="export" style="display:none">
                <h4 class="font-semibold mb-2">Export</h4>
                <div class="flex gap-2 flex-wrap">
                  <button id="exportInvoicesPdf" class="px-3 py-2 bg-blue-600 text-white rounded"><i class="fa-solid fa-file-pdf mr-1"></i> PDF</button>
                  <button id="exportInvoicesExcel" class="px-3 py-2 bg-green-600 text-white rounded"><i class="fa-solid fa-file-csv mr-1"></i> CSV</button>
                </div>
              </div>

              <div class="settings-panel" data-panel="drive" style="display:none">
                <h4 class="font-semibold mb-2">Google Drive Backup</h4>
                <div class="text-sm text-gray-600 mb-2">Requires Google OAuth (GSI) & acceptance as test user. Backups store a JSON snapshot of localStorage.</div>

                <div class="space-y-2">
                  <label class="flex items-center gap-2"><input id="optAutoRestoreLogin" type="checkbox"> Auto-check Drive on login (opt-in)</label>
                  <label class="flex items-center gap-2">
                    <input id="optAutoBackupEnabled" type="checkbox"> Auto backup every
                    <input id="optAutoBackupDays" type="number" min="1" value="7" style="width:64px;margin-left:6px"> days
                  </label>
                  <div class="text-xs text-gray-500">Auto backups run while the app is open (background timers). Last run stored in settings.</div>

                  <div class="flex gap-2 mt-2 flex-wrap">
                    <button id="driveBackupBtn" class="px-3 py-2 bg-indigo-600 text-white rounded"><i class="fa-brands fa-google-drive mr-1"></i> Backup to Drive</button>
                    <button id="driveRefreshBtn" class="px-3 py-2 bg-amber-500 text-white rounded"><i class="fa-solid fa-refresh mr-1"></i> Refresh List</button>
                    <button id="driveRestoreLatestBtn" class="px-3 py-2 bg-red-600 text-white rounded"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Restore Latest</button>
                  </div>

                  <div id="driveStatus" class="mt-2 text-sm text-gray-700">Drive: not initialized</div>
                  <div id="driveBackupList" class="mt-3 space-y-2 max-h-48 overflow-auto"></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // tab wiring (works on mobile & desktop)
      function showTab(name){
        modal.querySelectorAll('.settings-panel').forEach(p => p.dataset.panel === name ? (p.style.display='block') : (p.style.display='none'));
      }
      modal.querySelectorAll('.settings-tab').forEach(tb => tb.addEventListener('click', function(){
        showTab(this.dataset.tab);
        // small visual selection for md sidebar
        modal.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('bg-gray-100'));
        this.classList.add('bg-gray-100');
      }));

      // close/backdrop
      modal.querySelector('#settingsCloseBtn')?.addEventListener('click', ()=> modal.classList.add('hidden'));
      modal.addEventListener('click', (e)=> { if (e.target === modal || e.target.id === 'appSettingsModalBackdrop') modal.classList.add('hidden'); });

      // messages save/reset
      modal.querySelector('#settingsSaveMsgBtn')?.addEventListener('click', ()=>{
        const wa = (document.getElementById('settingsWaTpl')||{}).value || '';
        const sms = (document.getElementById('settingsSmsTpl')||{}).value || '';
        lsSet(LS_MSG_TPL, { reminder_wa: wa, reminder_sms: sms });
        const s = document.getElementById('settingsMsgStatus'); if (s){ s.classList.remove('hidden'); setTimeout(()=> s.classList.add('hidden'), 1200); }
        toast('Templates saved', 'success');
      });
      modal.querySelector('#settingsResetMsgBtn')?.addEventListener('click', ()=>{
        if (!confirm('Reset message templates to defaults?')) return;
        lsSet(LS_MSG_TPL, { reminder_wa: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).", reminder_sms: "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}." });
        const tpl = lsGet(LS_MSG_TPL) || {};
        document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
        document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');
        toast('Templates reset', 'success');
      });

      // export wiring
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

      // Drive controls (internal functions defined below)
      const driveBackupBtn = modal.querySelector('#driveBackupBtn');
      const driveRefreshBtn = modal.querySelector('#driveRefreshBtn');
      const driveRestoreLatestBtn = modal.querySelector('#driveRestoreLatestBtn');
      // wire after functions defined

      // Add quick-access help button for mobile: opens help panel
      modal.querySelector('#settingsHelpOpen')?.addEventListener('click', ()=> {
        // on mobile show help content inside modal
        showTab('helpNav');
      });

      // when modal opens show messages tab by default
      // (we rely on showTab when opening)
    } // end create modal

    // populate and show
    modal = document.getElementById('appSettingsModal');
    // fill templates
    const tpl = lsGet(LS_MSG_TPL) || {};
    document.getElementById('settingsWaTpl') && (document.getElementById('settingsWaTpl').value = tpl.reminder_wa || '');
    document.getElementById('settingsSmsTpl') && (document.getElementById('settingsSmsTpl').value = tpl.reminder_sms || '');


    // ---------- Notices UI + programmatic helpers (auto-insert programmatic notices, no edit/delete) ----------
(function setupNoticesUI() {
  // render the notices area (call when modal opens or notices change)
  function renderNoticesUI() {
    const notices = lsGet(LS_NOTICES) || [];
    const noticesEl = document.getElementById('settingsNotices');
    if (!noticesEl) return;
    if (!notices.length) {
      noticesEl.innerHTML = '<div class="text-sm text-gray-500">No notices.</div>';
      return;
    }
    noticesEl.innerHTML = notices.map(n => `
      <div class="border rounded p-2 bg-gray-50">
        <div class="flex justify-between items-center mb-1">
          <div class="font-semibold text-sm">${escapeHtml(n.title)}</div>
          <div class="text-xs text-gray-400">${new Date(n.created||Date.now()).toLocaleDateString()}</div>
        </div>
        <div class="text-sm text-gray-700">${escapeHtml(n.body)}</div>
      </div>
    `).join('');
  }

  // Provide a minimal Notices API: add + list
  window.Notices = {
    add: function({ title = 'Notice', body = '' } = {}) {
      const all = lsGet(LS_NOTICES) || [];
      const payload = { id: `N-${Date.now()}-${Math.floor(Math.random()*9000)}`, title: String(title), body: String(body), created: Date.now() };
      all.unshift(payload);
      lsSet(LS_NOTICES, all);
      // update UI and notify other tabs
      try { renderNoticesUI(); } catch (e) { /* ignore */ }
      try { window.dispatchEvent(new Event('noticesUpdated')); } catch (e) { /* ignore */ }
      try { localStorage.setItem('__notices_sync', Date.now().toString()); } catch (e) { /* ignore */ }
      return payload;
    },
    list: function() {
      return lsGet(LS_NOTICES) || [];
    }
  };

  // ensure programmatic notices exist (adds if not present)
  function ensureProgrammaticNotices() {
    // Accept notices from either of these globals (you can set them before this script runs):
    const programmatic = Array.isArray(window.PROGRAMMATIC_NOTICES) ? window.PROGRAMMATIC_NOTICES
                      : Array.isArray(window.GLOBAL_NOTICES) ? window.GLOBAL_NOTICES
                      : [];
    if (!programmatic.length) return;

    const existing = lsGet(LS_NOTICES) || [];
    let changed = false;

    programmatic.forEach(item => {
      if (!item) return;
      const id = item.id ? String(item.id) : null;
      const title = item.title ? String(item.title) : null;
      // check by id (preferred) then by exact title to avoid duplicates
      const found = id ? existing.find(n => n.id === id) : (title ? existing.find(n => n.title === title) : null);
      if (!found) {
        const payload = {
          id: id || `N-${Date.now()}-${Math.floor(Math.random()*9000)}`,
          title: title || 'Notice',
          body: item.body ? String(item.body) : '',
          created: item.created ? Number(item.created) : Date.now()
        };
        existing.unshift(payload);
        changed = true;
      }
    });

    if (changed) {
      lsSet(LS_NOTICES, existing);
      try { renderNoticesUI(); } catch(e) { /* ignore */ }
      try { window.dispatchEvent(new Event('noticesUpdated')); } catch(e) { /* ignore */ }
      try { localStorage.setItem('__notices_sync', Date.now().toString()); } catch(e) { /* ignore */ }
    }
  }

  // Initial render on modal open / script run
  renderNoticesUI();

  // Immediately ensure any programmatic notices are present (so they appear after a refresh)
  try { ensureProgrammaticNotices(); } catch(e){ console.error('ensureProgrammaticNotices failed', e); }

  // When other tabs change notices via localStorage, refresh UI (cross-tab sync)
  window.addEventListener('storage', (ev) => {
    if (!ev) return;
    if (ev.key === LS_NOTICES || ev.key === '__notices_sync') {
      // small delay to let the value be written
      setTimeout(()=> { try { renderNoticesUI(); } catch(e){} }, 50);
    }
  });

  // Also re-render when an app-level event is fired
  window.addEventListener('noticesUpdated', () => { try { renderNoticesUI(); } catch(e){} });

  // Provide a helper so other code can re-render after they add notices
  window.renderNoticesUI = renderNoticesUI;

  // Example: if you still have a manual button (optional), wire it
  const someRemindBtn = document.getElementById('someRemindBtn');
  if (someRemindBtn) {
    someRemindBtn.addEventListener('click', () => {
      window.Notices.add({
        title: 'Manual reminder',
        body: 'This was created by clicking the reminder button.'
      });
      toast('Notice added', 'success');
    });
  }
})();
window.Notices.add({ title: 'New', body: 'Something important' });


    // populate drive settings toggles
    const s = lsGet(LS_SETTINGS) || {};
    const optRestore = document.getElementById('optAutoRestoreLogin');
    const optAutoEnabled = document.getElementById('optAutoBackupEnabled');
    const optAutoDays = document.getElementById('optAutoBackupDays');
    if (optRestore) optRestore.checked = Boolean(s.autoRestoreOnLogin);
    if (optAutoEnabled) optAutoEnabled.checked = Boolean(s.autoBackup && s.autoBackup.enabled);
    if (optAutoDays) optAutoDays.value = (s.autoBackup && s.autoBackup.days) ? s.autoBackup.days : 7;

    // setup drive init (non-blocking)
    initGisIfNeeded();
    initGapiIfNeeded().then(()=> { setDriveStatus('Drive: ready'); }).catch(()=> { setDriveStatus('Drive: client not ready'); });

    // show the modal
    modal.classList.remove('hidden');
    // default panel: messages
    modal.querySelectorAll('.settings-panel').forEach(p => p.style.display = p.dataset.panel === 'messages' ? 'block' : 'none');

    // wire save of drive settings
    function persistDriveSettings(){
      const cur = lsGet(LS_SETTINGS) || {};
      cur.autoRestoreOnLogin = Boolean(document.getElementById('optAutoRestoreLogin')?.checked);
      cur.autoBackup = { enabled: Boolean(document.getElementById('optAutoBackupEnabled')?.checked), days: Number(document.getElementById('optAutoBackupDays')?.value) || 7 };
      lsSet(LS_SETTINGS, cur);
      toast('Backup settings saved','success');
      if (cur.autoBackup && cur.autoBackup.enabled) scheduleAutoBackup(); else cancelAutoBackup();
    }
    document.getElementById('optAutoRestoreLogin')?.addEventListener('change', persistDriveSettings);
    document.getElementById('optAutoBackupEnabled')?.addEventListener('change', persistDriveSettings);
    document.getElementById('optAutoBackupDays')?.addEventListener('change', persistDriveSettings);

    // wire Drive buttons now
    document.getElementById('driveBackupBtn')?.addEventListener('click', driveBackup);
    document.getElementById('driveRefreshBtn')?.addEventListener('click', driveListBackups);
    document.getElementById('driveRestoreLatestBtn')?.addEventListener('click', driveRestoreLatest);

    // initial list load
    driveListBackups();
  } // end openSettingsModal

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

  // Settings button attach (safe: will not override if exists)
  (function attachSettingsButton(){
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
    btn.onclick = openSettingsModal;
  })();

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
 /* =========================
     INVOICES UI (create/edit/list/actions)
     ========================= */

  function makeItemRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'grid sm:grid-cols-4 gap-2 mb-2 items-end';
    const safeName = (data.name || data.product || '').toString().replace(/"/g, '&quot;');
    const safePrice = Number(data.price ?? data.total ?? 0);
    row.innerHTML = `
      <input class="col-span-2 item-name border rounded-xl px-3 py-2" placeholder="Item name" value="${escapeHtml(safeName)}">
      <input type="number" min="0" step="0.01" class="item-price border rounded-xl px-3 py-2" placeholder="Price" value="${safePrice}">
      <div class="flex items-center gap-2">
        <input readonly class="item-total flex-1 border rounded-xl px-3 py-2 bg-gray-50" value="${fmtMoney(safePrice)}">
        <button type="button" class="remove-item px-3 py-2 rounded bg-red-500 text-white">✕</button>
      </div>
    `;
    const priceEl = row.querySelector('.item-price');
    const totalEl = row.querySelector('.item-total');
    function recalc() { const p = parseFloat(priceEl.value) || 0; totalEl.value = fmtMoney(p); recalcInvoiceTotals(); }
    priceEl.addEventListener('input', recalc);
    row.querySelector('.remove-item').addEventListener('click', () => { row.remove(); recalcInvoiceTotals(); });
    return row;
  }

  function recalcInvoiceTotals() {
    if (!invoiceItemsContainer) return;
    const rows = Array.from(invoiceItemsContainer.querySelectorAll('.item-total'));
    const total = rows.reduce((s, el) => s + (Number(el.value) || 0), 0);
    amountInput && (amountInput.value = fmtMoney(total));
    const paid = Number(paidInput?.value) || 0;
    if (statusSelect) statusSelect.value = paid >= total && total > 0 ? 'paid' : 'unpaid';
  }
  // paidInput?.addEventListener('input', recalcInvoiceTotals);

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
    // collect items robustly
    const items = invoiceItemsContainer ? Array.from(invoiceItemsContainer.querySelectorAll('.grid')).map(r => {
      const nm = r.querySelector('.item-name')?.value.trim() || '';
      const price = parseFloat(r.querySelector('.item-price')?.value) || 0;
      return { name: nm, price, total: price, qty: 1 };
    }).filter(it => it.name && it.price > 0) : [];

    if (!items.length) { showFormError('Add at least one item with name and price.'); return; }
    const amount = Number(amountInput?.value) || 0;
    const paid = Number(paidInput?.value) || 0;
    const status = statusSelect?.value || 'unpaid';

    if (!name) { showFormError('Customer name required'); return; }
    if (!phone) { showFormError('Customer phone required'); return; }

    const all = getAllInvoices();
    const id = editingInvoiceId?.value || `INV-${Date.now()}`;
    const payload = { id, store: user.name, date, customer: name, phone, items, amount, paid, status };
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
      emptyStateInv && emptyStateInv.classList.remove('hidden'); return;
    } else {
      emptyStateInv && emptyStateInv.classList.add('hidden');
    }
    const mobile = window.matchMedia('(max-width:640px)').matches;
    const storeName = getCurrentUser()?.name || '';
    list.forEach((invObj, idx) => {
      const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
      const balanceColorClass = balance <= 0 ? 'text-emerald-600' : 'text-rose-600';
      if (mobile) {
        const tr = document.createElement('tr');
        tr.className = 'border-b';
        tr.innerHTML = `
          <td colspan="10" class="p-2">
            <div class="sm-card p-3 bg-white rounded-xl shadow-sm">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold">${(storeName || 'S').slice(0, 2).toUpperCase()}</div>
                <div style="flex:1;">
                  <div class="font-semibold">Invoice ${escapeHtml(invObj.id)}</div>
                  <div class="text-sm text-gray-500">${fmtDate(invObj.date)} • ${escapeHtml(invObj.customer || '')}</div>
                </div>
              </div>
              <div class="mt-3 flex items-center justify-between">
                <div class="text-sm">${escapeHtml(invObj.phone || '')}</div>
                <div class="text-right">
                  <div class="font-semibold">${fmtMoney(invObj.amount)}</div>
                  <div class="text-xs ${balanceColorClass}">${escapeHtml(invObj.status)} • ${fmtMoney(balance)}</div>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-2 flex-wrap">
                <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${invObj.status === 'paid' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-xmark"></i>'}</button>
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
          <td class="p-2"><span class="${invObj.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} px-2 py-1 rounded text-xs">${escapeHtml(invObj.status)}</span></td>
          <td class="p-2 no-print">
            <div class="flex gap-2">
              <button class="action-icon" data-action="edit" data-id="${invObj.id}" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="action-icon" data-action="toggle" data-id="${invObj.id}" title="Toggle">${invObj.status === 'paid' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-xmark"></i>'}</button>
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
      if (confirm('Delete this invoice?')) {
        all.splice(idx, 1); saveAllInvoices(all); renderInvoiceTable(); window.dispatchEvent(new Event('dataUpdated')); toast('Invoice deleted', 'success');
      }
    } else if (action === 'toggle') {
      if (all[idx].status === 'unpaid') {
        all[idx].prevPaid = all[idx].paid;
        all[idx].status = 'paid';
        all[idx].paid = Number(all[idx].amount) || 0;
      } else {
        all[idx].status = 'unpaid';
        all[idx].paid = all[idx].prevPaid || 0;
      }
      saveAllInvoices(all); renderInvoiceTable(); window.dispatchEvent(new Event('dataUpdated'));
    } else if (action === 'edit') {
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
  function printInvoice(inv) {
    const balance = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
    const win = window.open('', 'PRINT', 'height=650,width=900');
    const store = getCurrentUser() || {};
    const head = `
      <html><head><title>Invoice ${escapeHtml(inv.id)}</title>
      <style>
        body{font-family:sans-serif;padding:20px;color:#111}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        td,th{border:1px solid #ddd;padding:8px}
        th{background:#f4f4f4}
      </style>
      </head><body>`;
    const footer = `</body></html>`;
    const content = `
      <h1>Invoice ${escapeHtml(inv.id)}</h1>
      <p><strong>Store:</strong> ${escapeHtml(store.name||'Supermarket')}<br/>
      <strong>Date:</strong> ${fmtDate(inv.date)}<br/>
      <strong>Customer:</strong> ${escapeHtml(inv.customer||'Walk-in')}<br/>
      <strong>Phone:</strong> ${escapeHtml(inv.phone||'')}</p>
      <table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>
      ${(inv.items||[]).map(it => `<tr><td>${escapeHtml(it.name||it.product||'Item')}</td><td>${it.qty||1}</td><td>${fmtMoney(it.price||0)}</td><td>${fmtMoney(it.total||((it.price||0)*(it.qty||1)))}</td></tr>`).join('')}
      </tbody></table>
      <p><strong>Amount:</strong> ${fmtMoney(inv.amount)}<br/>
      <strong>Paid:</strong> ${fmtMoney(inv.paid)}<br/>
      <strong>Balance:</strong> ${fmtMoney(balance)}<br/>
      <strong>Status:</strong> ${escapeHtml(inv.status)}</p>
    `;
    win.document.write(head + content + footer);
    win.document.close();
    win.focus();
    // small delay to ensure render
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
     REMINDERS / MESSAGING
     ========================= */
  function sendReminderForSingle(invObj, method) {
    if (!invObj) return;
    const phone = cleanPhone(invObj.phone || '');
    if (!phone) return toast('No phone number for this invoice.', 'error');
    const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
    const tpl = lsGet(LS_MSG_TPL, {});
    const defaultWa = tpl.reminder_wa || "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).";
    const defaultSms = tpl.reminder_sms || defaultWa;
    const template = method === 'wa' ? defaultWa : defaultSms;
    const storeName = getCurrentUser()?.name || '';
    const storePhone = (getCurrentUser()?.phone) || '';
    const msg = template.replace(/\{customer\}/gi, invObj.customer || '')
      .replace(/\{id\}/gi, invObj.id || '')
      .replace(/\{balance\}/gi, fmtMoney(balance))
      .replace(/\{store\}/gi, storeName)
      .replace(/\{phone\}/gi, storePhone);
    if (method === 'wa') {
      window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
    }
  }

  function sendReminderForGrouped(group, method) {
    const phone = cleanPhone(group.phone || '');
    if (!phone) return toast('No phone for group.', 'error');
    const tpl = lsGet(LS_MSG_TPL, {});
    const defaultWa = tpl.reminder_wa || "Xasuusin: {customer}, lacagta lagugu leeyahay waa: {balance}. Fadlan iska bixi dukaanka {store} ({phone}).";
    const defaultSms = tpl.reminder_sms || defaultWa;
    const template = method === 'wa' ? defaultWa : defaultSms;
    const storeName = getCurrentUser()?.name || '';
    const storePhone = (getCurrentUser()?.phone) || '';
    const ids = group.invoices.map(i => i.id).join(',');
    const msg = template.replace(/\{customer\}/gi, group.customer || '')
      .replace(/\{id\}/gi, ids)
      .replace(/\{balance\}/gi, fmtMoney(group.totalBalance || 0))
      .replace(/\{store\}/gi, storeName)
      .replace(/\{phone\}/gi, storePhone);
    if (method === 'wa') {
      window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`sms:+${phone}?&body=${encodeURIComponent(msg)}`, '_blank');
    }
  }

  /* confirmation modal for reminders */
  function createReminderConfirmModal() {
    let modal = document.getElementById('reminderConfirmModal');
    if (modal) return modal;
    const html = `
      <div id="reminderConfirmModal" class="hidden fixed inset-0 z-60 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50"></div>
        <div class="relative max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 id="reminderConfirmHeader" class="text-lg font-semibold mb-2"></h3>
          <div id="reminderConfirmBody" class="mb-4 whitespace-pre-line"></div>
          <div class="flex justify-end gap-2">
            <button id="reminderCancelBtn" class="px-3 py-2 rounded bg-gray-200">Cancel</button>
            <button id="reminderOkBtn" class="px-3 py-2 rounded bg-emerald-600 text-white">OK</button>
          </div>
        </div>
      </div>
    `;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    return document.getElementById('reminderConfirmModal');
  }

  function showReminderConfirm(group, progressStr, messageText) {
    return new Promise((resolve) => {
      const modal = createReminderConfirmModal();
      const header = modal.querySelector('#reminderConfirmHeader');
      const body = modal.querySelector('#reminderConfirmBody');
      const okBtn = modal.querySelector('#reminderOkBtn');
      const cancelBtn = modal.querySelector('#reminderCancelBtn');
      header.textContent = `${progressStr} Xasuusin ${group.customer || ''}`;
      body.textContent = messageText;
      function cleanup() { modal.classList.add('hidden'); okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.classList.remove('hidden');
      okBtn.focus();
    });
  }

  async function sendAllRemindersFlow(method) {
    const user = getCurrentUser();
    if (!user) return toast('Login required', 'error');

    // gather invoices that owe money and have phone
    const invoices = filteredInvoicesForUI().filter(inv => {
      const bal = (Number(inv.amount) || 0) - (Number(inv.paid) || 0);
      return inv.phone && bal > 0;
    });
    if (!invoices.length) return toast('No customers need reminders based on current filter/search.', 'info');

    // group by phone + customer
    const groupsMap = new Map();
    invoices.forEach(inv => {
      const phone = cleanPhone(inv.phone || '');
      const customer = (inv.customer || '').trim();
      const key = `${phone}||${customer}`;
      const bal = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paid) || 0));
      if (!groupsMap.has(key)) groupsMap.set(key, { customer, phone, totalBalance: 0, invoices: [] });
      const g = groupsMap.get(key);
      g.totalBalance += bal;
      g.invoices.push(inv);
    });

    const groups = Array.from(groupsMap.values());
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const progressStr = `${i + 1}/${groups.length}`;
      const storeName = user.name || '';
      const storePhone = user.phone || '';
      const preview = `Xasuusin: ${g.customer}\nLacagta lagugu leeyahay waa: ${fmtMoney(g.totalBalance)}\nFadlan iska bixi dukaanka ${storeName} (${storePhone})`;
      const confirmed = await showReminderConfirm(g, progressStr, preview);
      if (!confirmed) return;
      sendReminderForGrouped(g, method);
      await new Promise(res => setTimeout(res, 300));
    }
  }

  // sendAllRemindersBtn?.addEventListener('click', async () => {
  //   const method = (reminderMethod?.value) || 'wa';
  //   await sendAllRemindersFlow(method);
  // });

  /* single invoice reminder */
  function sendReminderFor(invObj, method) {
    const phone = cleanPhone(invObj.phone || '');
    if (!phone) return toast('No phone provided', 'error');
    const storeName = getCurrentUser()?.name || '';
    const storePhone = getCurrentUser()?.phone || '';
    const balance = Math.max(0, (Number(invObj.amount) || 0) - (Number(invObj.paid) || 0));
    const preview = `Xasuusin: ${invObj.customer}\nLacagta lagugu leeyahay waa: ${fmtMoney(balance)}\nFadlan iska bixi dukaanka ${storeName} (${storePhone})`;
    showReminderConfirm({ customer: invObj.customer, phone: invObj.phone, invoices: [invObj], totalBalance: balance }, `1/1`, preview).then(ok => {
      if (ok) sendReminderForSingle(invObj, method);
    });
  }
