const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const BACKUP_FILE = path.join(__dirname, '..', 'session-backup.json');

// ── In-memory session store ──
// { sessionCode: { participants: Map<id, data>, createdAt } }
const sessions = new Map();

// Restore from backup if exists
try {
  if (fs.existsSync(BACKUP_FILE)) {
    const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
    for (const [code, data] of Object.entries(backup)) {
      sessions.set(code, {
        participants: new Map(Object.entries(data.participants || {})),
        createdAt: data.createdAt
      });
    }
    console.log(`Restored ${sessions.size} session(s) from backup`);
  }
} catch (e) {
  console.warn('Could not restore backup:', e.message);
}

// Periodic backup every 30s
setInterval(() => {
  const out = {};
  for (const [code, session] of sessions) {
    out[code] = {
      participants: Object.fromEntries(session.participants),
      createdAt: session.createdAt
    };
  }
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(out), 'utf8');
}, 30000);

// ── Static files ──
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── QR code endpoint ──
app.get('/api/qr', async (req, res) => {
  const session = req.query.session || 'LIVE';
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/?s=${encodeURIComponent(session)}`;
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 2,
      color: { dark: '#1a1a2e', light: '#00000000' }
    });
    res.type('svg').send(svg);
  } catch (e) {
    res.status(500).send('QR generation failed');
  }
});

// ── API: get session stats (for presenter embed) ──
app.get('/api/stats/:session', (req, res) => {
  const session = sessions.get(req.params.session);
  if (!session) return res.json({ total: 0, zones: {} });

  const zones = {};
  for (const [, data] of session.participants) {
    if (data.position) {
      zones[data.position] = (zones[data.position] || 0) + 1;
    }
  }
  res.json({ total: session.participants.size, zones });
});

// ── Socket.io ──
io.on('connection', (socket) => {
  let currentSession = null;
  let currentParticipant = null;

  socket.on('join-session', ({ sessionCode, participantId }) => {
    currentSession = sessionCode || 'LIVE';
    currentParticipant = participantId;

    if (!sessions.has(currentSession)) {
      sessions.set(currentSession, {
        participants: new Map(),
        createdAt: Date.now()
      });
    }

    const session = sessions.get(currentSession);
    if (!session.participants.has(participantId)) {
      session.participants.set(participantId, { joinedAt: Date.now() });
    }

    socket.join(currentSession);
    socket.join(`${currentSession}-presenter`);

    // Send current count to presenter
    broadcastStats(currentSession);
  });

  socket.on('phase1-complete', ({ participantId, position, costCount, assetCount }) => {
    if (!currentSession) return;
    const session = sessions.get(currentSession);
    if (!session) return;

    const existing = session.participants.get(participantId) || {};
    session.participants.set(participantId, {
      ...existing,
      position,
      costCount: costCount || 0,
      assetCount: assetCount || 0,
      completedAt: Date.now()
    });

    // Broadcast new dot to presenter
    io.to(currentSession).emit('new-dot', {
      position,
      timestamp: Date.now()
    });

    broadcastStats(currentSession);
  });

  socket.on('join-presenter', ({ sessionCode }) => {
    currentSession = sessionCode || 'LIVE';
    socket.join(currentSession);

    if (!sessions.has(currentSession)) {
      sessions.set(currentSession, {
        participants: new Map(),
        createdAt: Date.now()
      });
    }

    // Send full state to presenter on join
    broadcastStats(currentSession);

    // Send all existing dots
    const session = sessions.get(currentSession);
    for (const [, data] of session.participants) {
      if (data.position) {
        socket.emit('new-dot', {
          position: data.position,
          timestamp: data.completedAt || Date.now()
        });
      }
    }
  });

  socket.on('presenter-reset', ({ sessionCode }) => {
    const code = sessionCode || currentSession;
    if (code && sessions.has(code)) {
      sessions.get(code).participants.clear();
      io.to(code).emit('reset');
      broadcastStats(code);
    }
  });

  socket.on('disconnect', () => {
    if (currentSession) broadcastStats(currentSession);
  });
});

function broadcastStats(sessionCode) {
  const session = sessions.get(sessionCode);
  if (!session) return;

  const zones = {};
  let completed = 0;
  for (const [, data] of session.participants) {
    if (data.position) {
      zones[data.position] = (zones[data.position] || 0) + 1;
      completed++;
    }
  }

  io.to(sessionCode).emit('stats-update', {
    total: session.participants.size,
    completed,
    zones
  });
}

server.listen(PORT, () => {
  console.log(`Minimap server running on port ${PORT}`);
  console.log(`Participant app: http://localhost:${PORT}`);
  console.log(`Presenter view:  http://localhost:${PORT}/presenter.html`);
  console.log(`QR code:         http://localhost:${PORT}/qr.html`);
});
