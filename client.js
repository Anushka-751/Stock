(() => {
  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const loginStatus = document.getElementById('login-status');
  const controls = document.getElementById('controls');
  const dashboard = document.getElementById('dashboard');
  const userBadge = document.getElementById('user-badge');
  const symbolSelect = document.getElementById('symbol-select');
  const subscribeForm = document.getElementById('subscribe-form');
  const pricesBody = document.getElementById('prices-body');
  const subsDiv = document.getElementById('subs');
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const toastEl = document.getElementById('toast');

  let ws = null;
  let currentEmail = '';
  const subscribed = new Set();
  const rows = new Map();

  function setActiveSection(target) {
    if (!controls || !dashboard) return;
    if (target === 'dashboard') {
      dashboard.classList.remove('hidden');
      controls.classList.add('hidden');
    } else if (target === 'subscriptions') {
      controls.classList.remove('hidden');
      dashboard.classList.add('hidden');
    }
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.target === target));
  }

  navLinks.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (!userBadge || userBadge.textContent === 'Guest') {
        showToast('Please login to use navigation');
        return;
      }
      setActiveSection(a.dataset.target);
    });
  });

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      loginStatus.textContent = 'Connected';
      if (currentEmail) {
        send({ type: 'login', email: currentEmail });
        Array.from(subscribed).forEach(sym => send({ type: 'subscribe', symbol: sym }));
      }
    });

    ws.addEventListener('error', (ev) => {
      showToast('Connection error');
    });

    ws.addEventListener('message', (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.type === 'supported' && Array.isArray(data.symbols)) {
        if (symbolSelect) {
          symbolSelect.innerHTML = '';
          for (const sym of data.symbols) {
            const opt = document.createElement('option');
            opt.value = sym;
            opt.textContent = sym;
            symbolSelect.appendChild(opt);
          }
        }
      }
      if (data.type === 'login_ok') {
        if (controls) controls.classList.remove('hidden');
        if (dashboard) dashboard.classList.remove('hidden');
        loginStatus.textContent = `Logged in as ${data.email}`;
        userBadge.textContent = data.email;
        const auth = document.getElementById('auth');
        if (auth) auth.classList.add('hidden');
        setActiveSection('dashboard');
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
      setTimeout(() => connect(), 1200);
    });
  }

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
      tr.appendChild(tdSym);
      tr.appendChild(tdPrice);
      tr.appendChild(tdTs);
      tr.appendChild(tdActions);
      rows.set(symbol, tr);
      pricesBody.appendChild(tr);
    }
    const [tdSym, tdPrice, tdTs] = tr.querySelectorAll('td');
    tdSym.textContent = symbol;
    tdPrice.textContent = `$${Number(price).toFixed(2)}`;
    tdPrice.classList.remove('pulse');
    void tdPrice.offsetWidth;
    tdPrice.classList.add('pulse');
    tdTs.textContent = new Date(ts).toLocaleTimeString();
  }

  function renderSubs() {
    if (!subsDiv) return;
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

  function showToast(message) {
    if (!toastEl) return alert(message);
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  window.addEventListener('error', (e) => {
    showToast(e.message || 'Unexpected error');
  });

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
    if (!symbol || subscribed.has(symbol)) return;
    if (!currentEmail) { showToast('Login first'); return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
      send({ type: 'subscribe', symbol });
      subscribed.add(symbol);
      renderSubs();
    }
  });
})();
