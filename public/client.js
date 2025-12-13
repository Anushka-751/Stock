(() => {
  const toastEl = document.getElementById('toast');
  const sessionsEl = document.getElementById('sessions');
  const addUserBtn = document.getElementById('add-user');
  const overviewBody = document.getElementById('overview-body');
  const supportedSyms = new Set();
  const subsOverview = new Map();

  function renderOverview() {
    if (!overviewBody) return;
    overviewBody.innerHTML = '';
    const syms = supportedSyms.size ? Array.from(supportedSyms) : Array.from(subsOverview.keys());
    syms.forEach(sym => {
      const tr = document.createElement('tr');
      const tdSym = document.createElement('td');
      const tdSubs = document.createElement('td');
      tdSym.textContent = sym;
      const emails = subsOverview.get(sym) || [];
      tdSubs.textContent = emails.length ? emails.join(', ') : '—';
      tr.appendChild(tdSym);
      tr.appendChild(tdSubs);
      overviewBody.appendChild(tr);
    });
  }
  const globalAuth = document.getElementById('auth');
  const globalControls = document.getElementById('controls');
  const globalDashboard = document.getElementById('dashboard');
  const globalLogout = document.getElementById('logout-btn');
  if (globalAuth) globalAuth.classList.add('hidden');
  if (globalControls) globalControls.classList.add('hidden');
  if (globalDashboard) globalDashboard.classList.add('hidden');
  if (globalLogout) globalLogout.classList.add('hidden');

  function showToast(message) {
    if (!toastEl) return alert(message);
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  function createSession() {
    const card = document.createElement('section');
    card.className = 'card';

    const headerWrap = document.createElement('div');
    headerWrap.style = 'display:flex; align-items:center; justify-content:space-between; gap:12px;';
    const title = document.createElement('h2');
    title.textContent = 'Guest';
    headerWrap.appendChild(title);
    card.appendChild(headerWrap);

    const authDiv = document.createElement('div');
    const loginForm = document.createElement('form');
    loginForm.className = 'session-login-form';
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Enter email';
    emailInput.required = true;
    const loginBtn = document.createElement('button');
    loginBtn.type = 'submit';
    loginBtn.textContent = 'Login';
    const loginStatus = document.createElement('div');
    loginStatus.className = 'muted';
    loginForm.appendChild(emailInput);
    loginForm.appendChild(loginBtn);
    authDiv.appendChild(loginForm);
    authDiv.appendChild(loginStatus);

    const controls = document.createElement('div');
    controls.className = 'hidden';
    const controlsTitle = document.createElement('h3');
    controlsTitle.textContent = 'Subscribe to Stocks';
    const subscribeForm = document.createElement('form');
    const symbolSelect = document.createElement('select');
    symbolSelect.disabled = true;
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = 'Select a symbol';
    symbolSelect.appendChild(placeholderOpt);
    const subscribeBtn = document.createElement('button');
    subscribeBtn.type = 'submit';
    subscribeBtn.textContent = 'Subscribe';
    subscribeBtn.disabled = true;
    subscribeForm.appendChild(symbolSelect);
    subscribeForm.appendChild(subscribeBtn);
    const subsDiv = document.createElement('div');
    subsDiv.className = 'chip-list';
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    logoutBtn.className = 'hidden';
    controls.appendChild(controlsTitle);
    controls.appendChild(subscribeForm);
    controls.appendChild(subsDiv);
    controls.appendChild(logoutBtn);

    const dashboard = document.createElement('div');
    dashboard.className = 'hidden';
    const dashTitle = document.createElement('h3');
    dashTitle.textContent = 'Prices';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['User','Symbol','Price','Updated',''].forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);
    dashboard.appendChild(dashTitle);
    dashboard.appendChild(table);

    card.appendChild(authDiv);
    card.appendChild(controls);
    card.appendChild(dashboard);
    sessionsEl.appendChild(card);

    let ws = null;
    let currentEmail = '';
    const subscribed = new Set();
    const rows = new Map();
    let shouldReconnect = true;

    function send(obj) {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
      } catch (e) {
        showToast('Send failed');
      }
    }

    function upsertRow(symbol, price, ts) {
      let tr = rows.get(symbol);
      if (!tr) {
        tr = document.createElement('tr');
        const tdUser = document.createElement('td');
        const tdSym = document.createElement('td');
        const tdPrice = document.createElement('td');
        const tdTs = document.createElement('td');
        const tdActions = document.createElement('td');
        const btnUnsub = document.createElement('button');
        btnUnsub.textContent = 'Unsubscribe';
        btnUnsub.addEventListener('click', () => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
          }
        });
        tdActions.appendChild(btnUnsub);
        tr.appendChild(tdUser);
        tr.appendChild(tdSym);
        tr.appendChild(tdPrice);
        tr.appendChild(tdTs);
        tr.appendChild(tdActions);
        rows.set(symbol, tr);
        tbody.appendChild(tr);
      }
      const [tdUser, tdSym, tdPrice, tdTs] = tr.querySelectorAll('td');
      tdUser.textContent = currentEmail || 'Unknown';
      tdSym.textContent = symbol;
      tdPrice.textContent = `$${Number(price).toFixed(2)}`;
      tdPrice.classList.remove('pulse');
      void tdPrice.offsetWidth;
      tdPrice.classList.add('pulse');
      tdTs.textContent = new Date(ts).toLocaleTimeString();
    }

    function renderSubs() {
      subsDiv.innerHTML = '';
      Array.from(subscribed).forEach(sym => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = sym;
        const rm = document.createElement('button');
        rm.className = 'remove';
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'unsubscribe', symbol: sym }));
          }
        });
        chip.appendChild(rm);
        subsDiv.appendChild(chip);
      });
    }

    function connect() {
      shouldReconnect = true;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}`);

      ws.addEventListener('open', () => {
        loginStatus.textContent = 'Connected';
        if (currentEmail) {
          send({ type: 'login', email: currentEmail });
          Array.from(subscribed).forEach(sym => send({ type: 'subscribe', symbol: sym }));
        }
        subscribeBtn.disabled = false;
      });

      ws.addEventListener('error', () => {
        showToast('Connection error');
      });

      ws.addEventListener('message', (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch { return; }
        if (data.type === 'supported' && Array.isArray(data.symbols)) {
          symbolSelect.innerHTML = '';
          const ph = document.createElement('option');
          ph.value = '';
          ph.textContent = 'Select a symbol';
          symbolSelect.appendChild(ph);
          for (const sym of data.symbols) {
            const opt = document.createElement('option');
            opt.value = sym;
            opt.textContent = sym;
            symbolSelect.appendChild(opt);
          }
          data.symbols.forEach(s => supportedSyms.add(s));
          symbolSelect.disabled = false;
          renderOverview();
        }
        if (data.type === 'subscribers' && typeof data.symbol === 'string' && Array.isArray(data.emails)) {
          subsOverview.set(data.symbol, data.emails);
          renderOverview();
        }
        if (data.type === 'login_ok') {
          controls.classList.remove('hidden');
          dashboard.classList.remove('hidden');
          loginStatus.textContent = `Logged in as ${data.email}`;
          const auth = authDiv;
          if (auth) auth.classList.add('hidden');
          if (logoutBtn) logoutBtn.classList.remove('hidden');
          title.textContent = data.email;
          subscribeBtn.disabled = false;
        }
        if (data.type === 'price') {
          const { symbol, price, ts } = data;
          upsertRow(symbol, price, ts);
        }
        if (data.type === 'unsubscribed') {
          const { symbol } = data;
          subscribed.delete(symbol);
          const tr = rows.get(symbol);
          if (tr) {
            tr.remove();
            rows.delete(symbol);
          }
          renderSubs();
        }
        if (data.type === 'error') {
          alert(data.message);
        }
      });

      ws.addEventListener('close', () => {
        loginStatus.textContent = 'Disconnected';
        if (shouldReconnect) setTimeout(() => connect(), 1200);
        subscribeBtn.disabled = true;
      });
    }

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      if (!email) return;
      currentEmail = email;
      if (!ws || ws.readyState === WebSocket.CLOSED) connect();
      const sendLogin = () => send({ type: 'login', email });
      if (ws.readyState === WebSocket.OPEN) sendLogin();
      else ws.addEventListener('open', sendLogin, { once: true });
    });

    subscribeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const symbol = symbolSelect.value;
      if (!symbol) { showToast('Choose a symbol'); return; }
      if (subscribed.has(symbol)) return;
      if (!currentEmail) { showToast('Login first'); return; }
      if (!ws || ws.readyState === WebSocket.CLOSED) connect();
      const doSubscribe = () => {
        send({ type: 'subscribe', symbol });
        subscribed.add(symbol);
        renderSubs();
      };
      if (ws && ws.readyState === WebSocket.OPEN) doSubscribe();
      else ws.addEventListener('open', doSubscribe, { once: true });
    });

    function resetState() {
      currentEmail = '';
      Array.from(rows.values()).forEach(tr => tr.remove());
      rows.clear();
      subscribed.clear();
      subsDiv.innerHTML = '';
      controls.classList.add('hidden');
      dashboard.classList.add('hidden');
      authDiv.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      loginStatus.textContent = 'Logged out';
      title.textContent = 'Guest';
    }

    logoutBtn.addEventListener('click', () => {
      shouldReconnect = false;
      try { if (ws) ws.close(); } catch (_) {}
      ws = null;
      resetState();
    });
  }

  window.addEventListener('error', (e) => {
    showToast(e.message || 'Unexpected error');
  });

  if (addUserBtn) addUserBtn.addEventListener('click', () => createSession());
  if (sessionsEl) { createSession(); createSession(); }
})();
