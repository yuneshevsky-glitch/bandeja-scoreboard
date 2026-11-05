const express = require('express');
const http = require('http');
const os = require('os');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const ScoreEngine = require('./public/score-engine.js');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const NUM_COURTS = 8;
const MAX_HISTORY = 30;
const SAVE_INTERVAL = 30000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- State ---

let courts = {};
// Название этапа для шапки табло (задаётся в админке).
let eventInfo = { title: process.env.EVENT_TITLE || '' };

const EMPTY_PLAYERS = () => ({ playersA: [null, null], playersB: [null, null] });

// Игроки на корте и подающий игрок хранятся прямо в состоянии матча,
// чтобы ТВ получал их вместе со счётом.
function withPlayers(state, source) {
  const next = state;
  const src = source || {};
  next.playersA = Array.isArray(src.playersA) ? src.playersA.slice(0, 2) : (next.playersA || [null, null]);
  next.playersB = Array.isArray(src.playersB) ? src.playersB.slice(0, 2) : (next.playersB || [null, null]);
  next.servingPlayer = src.servingPlayer || next.servingPlayer || { A: 0, B: 0 };
  return next;
}

function initCourts() {
  for (let i = 1; i <= NUM_COURTS; i++) {
    courts[i] = {
      settings: { format: 'A', teamA: '', teamB: '', server: 'A', deuceMode: 'advantage', ...EMPTY_PLAYERS() },
      matchState: withPlayers(ScoreEngine.createMatch()),
      history: []
    };
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (data && data.courts) {
        courts = data.courts;
        if (data.eventInfo) eventInfo = data.eventInfo;
        for (const id of Object.keys(courts)) withPlayers(courts[id].matchState);
        console.log('State restored from', STATE_FILE);
        return;
      }
    }
  } catch (e) {
    console.error('Failed to load state:', e.message);
  }
  initCourts();
}

function saveState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ courts, eventInfo, savedAt: Date.now() }));
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

loadState();
setInterval(saveState, SAVE_INTERVAL);

// Сохраняем вскоре после каждого изменения, а не только раз в 30 секунд:
// перезапуск сервера не должен откатывать счёт.
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveState();
  }, 1000);
}

// Порядковый номер состояния корта. Растёт с каждым изменением; табло по нему
// понимает, что пришло следующее действие (а не повтор при переподключении).
function bumpSeq(courtId) {
  const court = courts[courtId];
  court.seq = (court.seq || 0) + 1;
  scheduleSave();
  return court.seq;
}

function courtPayload(courtId) {
  const court = courts[courtId];
  return {
    courtId,
    state: court.matchState,
    historyLength: court.history.length,
    seq: court.seq || 0,
    event: eventInfo,
    timestamp: Date.now()
  };
}

function broadcastCourt(courtId) {
  const payload = courtPayload(courtId);
  io.to(`court-${courtId}`).emit('state-update', payload);
  io.emit('court-summary-update', {
    courtId,
    matchState: payload.state,
    historyLength: payload.historyLength,
    seq: payload.seq,
    timestamp: payload.timestamp
  });
}

// --- Network helpers ---

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// --- HTTP Routes ---

app.get('/links', (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const base = `http://${host}`;
  const courtsHtml = [];
  for (let i = 1; i <= NUM_COURTS; i++) {
    courtsHtml.push(`
      <tr>
        <td><strong>Корт ${i}</strong></td>
        <td><a href="${base}/#/court/${i}/control" target="_blank">Судейский контроль</a></td>
        <td><a href="${base}/#/court/${i}/display" target="_blank">ТВ-экран</a></td>
      </tr>`);
  }

  const ips = getLocalIPs();
  const hostname = os.hostname().replace(/\.local$/, '') + '.local';
  const altUrls = [
    `http://${hostname}:${PORT}`,
    ...ips.map(ip => `http://${ip}:${PORT}`)
  ];

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Bandeja — Все ссылки</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1A1A1A; color: #F0F0F0; max-width: 900px; margin: 0 auto; padding: 24px; }
  h1 { color: #DB3A2D; font-size: 28px; }
  h2 { color: #D5BB8F; font-size: 18px; margin-top: 32px; text-transform: uppercase; letter-spacing: 1px; }
  a { color: #D5BB8F; text-decoration: none; }
  a:hover { color: #DB3A2D; text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  td { padding: 12px; border-bottom: 1px solid #333; }
  .big { font-size: 18px; }
  .box { background: #282828; border: 1px solid #333; padding: 16px; border-radius: 4px; margin: 16px 0; }
  .alt { background: #282828; padding: 10px 14px; border-radius: 4px; margin: 6px 0; font-family: monospace; }
  .btn { display: inline-block; background: #DB3A2D; color: white; padding: 10px 20px; border-radius: 4px; margin: 4px 4px 4px 0; font-weight: 600; }
  .note { color: #9A9A9A; font-size: 13px; margin-top: 8px; }
</style>
</head>
<body>
  <h1>🎾 Bandeja Scoreboard — Все ссылки</h1>
  <p class="note">Вы открыли эту страницу по адресу: <strong>${host}</strong></p>

  <div class="box">
    <a href="${base}" class="btn">📊 Дашборд</a>
    <a href="${base}/#/admin" class="btn">🔐 Админ-панель</a>
    <p class="note">PIN по умолчанию: <strong>1234</strong></p>
  </div>

  <h2>Корты</h2>
  <table>
    <thead>
      <tr><th style="text-align:left">#</th><th style="text-align:left">Судье (телефон)</th><th style="text-align:left">ТВ-экран</th></tr>
    </thead>
    <tbody>
      ${courtsHtml.join('')}
    </tbody>
  </table>

  <h2>Альтернативные адреса</h2>
  <p class="note">Эти ссылки работают с любого устройства в одной Wi-Fi сети. Если один адрес не открывается — пробуйте другой.</p>
  ${altUrls.map(u => `<div class="alt"><a href="${u}">${u}</a></div>`).join('')}

  <h2>Как поделиться</h2>
  <p class="note">Скопируйте и отправьте судье прямую ссылку на его корт из таблицы выше. Или откройте админ-панель и покажите QR-код судье, чтобы он отсканировал камерой телефона.</p>
</body>
</html>`);
});

app.get('/health', (req, res) => {
  const clientCounts = {};
  for (let i = 1; i <= NUM_COURTS; i++) {
    const room = io.sockets.adapter.rooms.get(`court-${i}`);
    clientCounts[i] = room ? room.size : 0;
  }
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    courts: NUM_COURTS,
    clients: clientCounts,
    totalClients: io.sockets.sockets.size
  });
});

// Резервный канал для ТВ: если сокет не поднимается, табло опрашивает этот адрес.
app.get('/court/:id/state', (req, res) => {
  const courtId = Number(req.params.id);
  if (!courts[courtId]) return res.status(404).json({ error: 'Invalid court' });
  res.set('Cache-Control', 'no-store');
  res.json(courtPayload(courtId));
});

app.post('/admin/verify-pin', (req, res) => {
  res.json({ valid: req.body.pin === ADMIN_PIN });
});

app.get('/admin/state', (req, res) => {
  res.json({ courts, savedAt: Date.now() });
});

// --- Socket.io ---

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-court', ({ courtId, mode }) => {
    if (!courts[courtId]) return;
    const room = `court-${courtId}`;
    socket.join(room);
    socket.courtId = courtId;
    socket.mode = mode;
    socket.emit('state-update', courtPayload(courtId));
  });

  socket.on('get-all-courts', () => {
    const summary = {};
    for (let i = 1; i <= NUM_COURTS; i++) {
      summary[i] = {
        matchState: courts[i].matchState,
        historyLength: courts[i].history.length
      };
    }
    socket.emit('all-courts-update', { courts: summary, timestamp: Date.now() });
  });

  socket.on('score-action', ({ courtId, action, payload }) => {
    if (!courts[courtId]) {
      socket.emit('action-ack', { success: false, error: 'Invalid court' });
      return;
    }

    const court = courts[courtId];
    let newState;

    try {
      switch (action) {
        case 'POINT_TEAM_A':
          pushHistory(court);
          newState = ScoreEngine.scorePoint(court.matchState, 'A');
          break;

        case 'POINT_TEAM_B':
          pushHistory(court);
          newState = ScoreEngine.scorePoint(court.matchState, 'B');
          break;

        case 'UNDO':
          if (court.history.length > 0) {
            newState = court.history.pop();
          } else {
            socket.emit('action-ack', { success: false, error: 'No history' });
            return;
          }
          break;

        case 'SET_SERVER':
          newState = ScoreEngine.deepClone(court.matchState);
          newState.server = payload.server;
          break;

        // Судья тапает конкретного подающего игрока.
        case 'SET_SERVING_PLAYER': {
          const team = payload.team === 'B' ? 'B' : 'A';
          const index = payload.index === 1 ? 1 : 0;
          newState = ScoreEngine.deepClone(court.matchState);
          newState.server = team;
          newState.servingPlayer = { ...(newState.servingPlayer || { A: 0, B: 0 }), [team]: index };
          break;
        }

        case 'TOGGLE_SERVICE':
          newState = ScoreEngine.deepClone(court.matchState);
          newState.server = newState.server === 'A' ? 'B' : 'A';
          break;

        case 'RESET_MATCH':
          court.history = [];
          newState = withPlayers(ScoreEngine.createMatch(court.settings), court.settings);
          break;

        case 'UPDATE_SETTINGS':
          newState = withPlayers(ScoreEngine.updateSettings(court.matchState, payload), payload);
          court.settings = { ...court.settings, ...payload };
          break;

        case 'START_MATCH':
          newState = ScoreEngine.startMatch(court.matchState);
          break;

        default:
          socket.emit('action-ack', { success: false, error: 'Unknown action' });
          return;
      }

      court.matchState = newState;
      bumpSeq(courtId);
      socket.emit('action-ack', { success: true, timestamp: Date.now() });
      broadcastCourt(courtId);
    } catch (e) {
      console.error(`Error processing action ${action} for court ${courtId}:`, e);
      socket.emit('action-ack', { success: false, error: e.message });
    }
  });

  socket.on('reset-court', ({ courtId, pin }) => {
    if (pin !== ADMIN_PIN) {
      socket.emit('action-ack', { success: false, error: 'Invalid PIN' });
      return;
    }
    if (!courts[courtId]) return;
    courts[courtId].history = [];
    courts[courtId].matchState = withPlayers(ScoreEngine.createMatch());
    courts[courtId].settings = { format: 'A', teamA: '', teamB: '', server: 'A', deuceMode: 'advantage', ...EMPTY_PLAYERS() };
    bumpSeq(courtId);
    broadcastCourt(courtId);
    socket.emit('action-ack', { success: true });
  });

  socket.on('get-event', () => socket.emit('event-update', eventInfo));

  socket.on('set-event', ({ pin, title }) => {
    if (pin !== ADMIN_PIN) {
      socket.emit('action-ack', { success: false, error: 'Invalid PIN' });
      return;
    }
    eventInfo = { ...eventInfo, title: String(title || '').slice(0, 120) };
    scheduleSave();
    io.emit('event-update', eventInfo);
    socket.emit('action-ack', { success: true });
  });

  socket.on('reset-all-courts', ({ pin }) => {
    if (pin !== ADMIN_PIN) {
      socket.emit('action-ack', { success: false, error: 'Invalid PIN' });
      return;
    }
    const prevSeq = {};
    for (let i = 1; i <= NUM_COURTS; i++) prevSeq[i] = courts[i].seq || 0;
    initCourts();
    for (let i = 1; i <= NUM_COURTS; i++) {
      courts[i].seq = prevSeq[i];
      bumpSeq(i);
      io.to(`court-${i}`).emit('state-update', courtPayload(i));
    }
    io.emit('all-courts-update', { courts: getAllCourtsSummary(), timestamp: Date.now() });
    socket.emit('action-ack', { success: true });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

function pushHistory(court) {
  court.history.push(ScoreEngine.deepClone(court.matchState));
  if (court.history.length > MAX_HISTORY) {
    court.history.shift();
  }
}

function getAllCourtsSummary() {
  const summary = {};
  for (let i = 1; i <= NUM_COURTS; i++) {
    summary[i] = {
      matchState: courts[i].matchState,
      historyLength: courts[i].history.length
    };
  }
  return summary;
}

server.listen(PORT, () => {
  const ips = getLocalIPs();
  const hostname = os.hostname().replace(/\.local$/, '') + '.local';
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║          🎾  BANDEJA SCOREBOARD запущен            ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Admin PIN: ${ADMIN_PIN}`);
  console.log('');
  console.log('  📍 Открой на этом компьютере:');
  console.log(`     http://localhost:${PORT}`);
  console.log('');
  console.log('  📱 Открой с других устройств в той же Wi-Fi:');
  console.log(`     http://${hostname}:${PORT}      ← постоянный адрес (рекомендуется)`);
  ips.forEach(ip => {
    console.log(`     http://${ip}:${PORT}`);
  });
  console.log('');
  console.log('  🔗 Страница со всеми ссылками для судей:');
  console.log(`     http://localhost:${PORT}/links`);
  console.log('');
});
