const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const SUPPORTED = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA'];

const clients = new Map();
const prices = {};
for (const sym of SUPPORTED) {
  prices[sym] = 100 + Math.random() * 200;
}

const publicDir = path.join(__dirname, '..', 'public');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=UTF-8';
    case '.js': return 'application/javascript; charset=UTF-8';
    case '.css': return 'text/css; charset=UTF-8';
    case '.json': return 'application/json; charset=UTF-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

const server = http.createServer((req, res) => {
  let reqPath = req.url || '/';
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(publicDir, path.normalize(reqPath));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function send(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch (_) {}
}

function subscribersFor(symbol) {
  const emails = [];
  for (const [ws, rec] of clients.entries()) {
    if (rec.subscriptions.has(symbol) && rec.email) emails.push(rec.email);
  }
  return emails;
}

function broadcastSubscribers(symbol) {
  const payload = { type: 'subscribers', symbol, emails: subscribersFor(symbol) };
  for (const [ws] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) send(ws, payload);
  }
}

wss.on('connection', (ws) => {
  clients.set(ws, { email: null, subscriptions: new Set() });

  send(ws, { type: 'supported', symbols: SUPPORTED });
  for (const sym of SUPPORTED) {
    send(ws, { type: 'subscribers', symbol: sym, emails: subscribersFor(sym) });
  }

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }

    if (data.type === 'login' && typeof data.email === 'string') {
      const rec = clients.get(ws);
      if (rec) rec.email = data.email.trim().toLowerCase();
      send(ws, { type: 'login_ok', email: rec.email });
    }

    if (data.type === 'subscribe' && typeof data.symbol === 'string') {
      const sym = data.symbol.toUpperCase();
      if (!SUPPORTED.includes(sym)) {
        send(ws, { type: 'error', message: `Unsupported symbol: ${sym}` });
        return;
      }
      const rec = clients.get(ws);
      rec.subscriptions.add(sym);
      send(ws, { type: 'price', symbol: sym, price: Number(prices[sym].toFixed(2)), ts: Date.now() });
      broadcastSubscribers(sym);
    }

    if (data.type === 'unsubscribe' && typeof data.symbol === 'string') {
      const sym = data.symbol.toUpperCase();
      const rec = clients.get(ws);
      rec.subscriptions.delete(sym);
      send(ws, { type: 'unsubscribed', symbol: sym });
      broadcastSubscribers(sym);
    }

    if (data.type === 'list_subscribers') {
      if (typeof data.symbol === 'string') {
        const sym = data.symbol.toUpperCase();
        if (!SUPPORTED.includes(sym)) {
          send(ws, { type: 'error', message: `Unsupported symbol: ${sym}` });
        } else {
          send(ws, { type: 'subscribers', symbol: sym, emails: subscribersFor(sym) });
        }
      } else {
        for (const sym of SUPPORTED) {
          send(ws, { type: 'subscribers', symbol: sym, emails: subscribersFor(sym) });
        }
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

setInterval(() => {
  for (const sym of SUPPORTED) {
    const base = prices[sym];
    const change = (Math.random() - 0.5) * 2;
    const next = Math.max(1, base + change);
    prices[sym] = next;
    const payload = { type: 'price', symbol: sym, price: Number(next.toFixed(2)), ts: Date.now() };

    for (const [ws, rec] of clients.entries()) {
      if (rec.subscriptions.has(sym) && ws.readyState === WebSocket.OPEN) {
        send(ws, payload);
      }
    }
  }
}, 1000);

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`Server running at ${url}`);
});
