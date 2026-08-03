import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { randomBytes } from 'crypto';
import { extname, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(__dirname, 'dist');
const MAX_PAYLOAD = 16 * 1024;
const MAX_BUFFERED_BYTES = 256 * 1024;
const HEARTBEAT_MS = 30_000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

function sendHttpError(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(message);
}

function decodePath(value) {
  let decoded = value;
  // Decode twice so double-encoded traversal cannot become dangerous later.
  for (let i = 0; i < 2; i++) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function containsTraversal(pathname) {
  return pathname.includes('\0') || pathname.includes('\\') ||
    pathname.split(/[\\/]+/).some(part => part === '..');
}

function isInside(basePath, candidatePath) {
  const rel = relative(basePath, candidatePath);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
}

function resolveStaticRequest(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) return null;

  // Inspect the unnormalised request target first. WHATWG URL parsing normalises
  // dot segments, which would otherwise hide the fact that traversal was tried.
  const rawPath = rawUrl.split(/[?#]/, 1)[0];
  const decodedRaw = decodePath(rawPath);
  if (containsTraversal(decodedRaw)) return null;

  const parsed = new URL(rawUrl, 'http://localhost');
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const pathname = decodePath(parsed.pathname);
  if (containsTraversal(pathname)) return null;

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(DIST, relativePath);
  return isInside(DIST, candidate) ? { candidate, pathname } : null;
}

function safeExistingFile(candidate) {
  if (!existsSync(candidate)) return null;
  const distReal = realpathSync(DIST);
  const fileReal = realpathSync(candidate);
  if (!isInside(distReal, fileReal) || !statSync(fileReal).isFile()) return null;
  return fileReal;
}

const httpServer = createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendHttpError(res, 405, 'Method not allowed');
      return;
    }
    if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
      sendHttpError(res, 404, 'Not built');
      return;
    }

    const request = resolveStaticRequest(req.url);
    if (!request) {
      sendHttpError(res, 400, 'Bad request');
      return;
    }

    let filePath = safeExistingFile(request.candidate);
    // Preserve SPA routing, but never return index.html for a missing asset.
    if (!filePath && extname(request.pathname) === '') {
      filePath = safeExistingFile(resolve(DIST, 'index.html'));
    }
    if (!filePath) {
      sendHttpError(res, 404, 'Not found');
      return;
    }

    const data = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    if (!res.headersSent) sendHttpError(res, 404, 'Not found');
    else res.destroy();
  }
});

httpServer.on('clientError', (_error, socket) => {
  try {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  } catch {}
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_PAYLOAD,
  perMessageDeflate: false
});
const rooms = new Map();
const allocatedPlayerIds = new Set();
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MESSAGE_TYPES = new Set([
  'create', 'join', 'setMax', 'start', 'pos', 'attack',
  'wallet', 'die', 'respawn', 'restart'
]);

wss.on('error', error => {
  console.error(`WebSocket server error: ${error.message}`);
});

function randomId() {
  const bytes = randomBytes(6);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

function allocateUniqueId(isTaken) {
  for (let i = 0; i < 128; i++) {
    const id = randomId();
    if (!isTaken(id)) return id;
  }
  throw new Error('Unable to allocate a unique identifier');
}

function allocateRoomId() {
  return allocateUniqueId(id => rooms.has(id));
}

function allocatePlayerId() {
  const id = allocateUniqueId(candidate => allocatedPlayerIds.has(candidate));
  allocatedPlayerIds.add(id);
  return id;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function isFiniteNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function cleanName(value) {
  if (value === undefined || value === '') return 'Player';
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name) return 'Player';
  if ([...name].length > 24 || Buffer.byteLength(name, 'utf8') > 96 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function cleanRoomCode(value) {
  if (typeof value !== 'string') return null;
  const roomId = value.trim().toUpperCase();
  return /^[A-Z2-9]{6}$/.test(roomId) ? roomId : null;
}

function cleanRole(value) {
  return value === 'clown' || value === 'police' ? value : null;
}

function normaliseAngle(value) {
  if (!isFiniteNumber(value, -10_000, 10_000)) return null;
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function safeTerminate(ws) {
  try { ws.terminate(); } catch {}
}

function safeSend(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    safeTerminate(ws);
    return false;
  }
  try {
    ws.send(JSON.stringify(message), () => {});
    return true;
  } catch {
    return false;
  }
}

function broadcast(roomId, exceptId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [id, player] of room.players) {
    if (id !== exceptId) safeSend(player.ws, message);
  }
}

function broadcastAll(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const player of room.players.values()) safeSend(player.ws, message);
}

function pushPlayerList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const list = [...room.players].map(([id, player]) => ({
    id,
    name: player.name,
    isHost: id === room.hostId
  }));
  broadcastAll(roomId, { type: 'playerList', list, maxPlayers: room.maxPlayers, hostId: room.hostId });
}

function consumeWindow(state, key, limit, windowMs) {
  const now = Date.now();
  const current = state.rateWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    state.rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count++;
  return current.count <= limit;
}

function rateAllowed(state, type) {
  if (type === 'pos') return consumeWindow(state, 'pos', 45, 1000);
  if (type === 'attack') return consumeWindow(state, 'attack', 12, 1000);
  if (type === 'wallet') return consumeWindow(state, 'wallet', 8, 1000);
  return consumeWindow(state, `type:${type}`, 12, 1000);
}

function recordViolation(ws, state, reason = '消息格式无效') {
  const now = Date.now();
  if (now - state.violationWindowStarted >= 60_000) {
    state.violationWindowStarted = now;
    state.violations = 0;
  }
  state.violations++;
  if (now - state.lastErrorAt > 1000) {
    state.lastErrorAt = now;
    safeSend(ws, { type: 'error', msg: reason });
  }
  if (state.violations >= 12 && ws.readyState === WebSocket.OPEN) {
    try { ws.close(1008, 'Too many invalid messages'); } catch { safeTerminate(ws); }
  }
}

function getSessionRoom(state) {
  if (!state.roomId || !state.playerId) return null;
  const room = rooms.get(state.roomId);
  const player = room?.players.get(state.playerId);
  return player?.ws === state.ws ? room : null;
}

function beginGame(roomId, room) {
  const ids = [...room.players.keys()];
  room.started = true;
  room.restartVotes = null;
  const clownId = ids[Math.floor(Math.random() * ids.length)];
  for (const id of ids) {
    const player = room.players.get(id);
    player.role = id === clownId ? 'clown' : 'police';
  }
  for (const id of ids) {
    const player = room.players.get(id);
    const others = ids.filter(otherId => otherId !== id).map(otherId => {
      const other = room.players.get(otherId);
      return { id: otherId, name: other.name, role: other.role, x: other.x, z: other.z, yaw: other.yaw };
    });
    safeSend(player.ws, { type: 'gameStart', myRole: player.role, players: others, wals: room.wals, wc: room.wc });
  }
  console.log(`[${roomId}] game started, clown=${room.players.get(clownId).name}`);
}

function restartGame(roomId, room) {
  room.restartVotes = null;
  room.wals = Array(6).fill(false);
  room.wc = 0;
  for (const player of room.players.values()) {
    player.hp = 100;
    player.alive = true;
    player.x = 0;
    player.z = 0;
    player.yaw = 0;
  }
  beginGame(roomId, room);
}

function handleMessage(ws, state, msg) {
  if (!MESSAGE_TYPES.has(msg.type)) {
    recordViolation(ws, state, '未知消息类型');
    return;
  }

  if (msg.type === 'create') {
    if (state.roomId || state.playerId) {
      safeSend(ws, { type: 'error', msg: '当前连接已经加入房间' });
      return;
    }
    const name = cleanName(msg.name);
    const maxPlayers = msg.maxPlayers === undefined ? 4 : msg.maxPlayers;
    if (name === null || !isInteger(maxPlayers, 2, 8)) {
      recordViolation(ws, state);
      return;
    }

    const roomId = allocateRoomId();
    const playerId = allocatePlayerId();
    const room = {
      players: new Map(),
      wals: Array(6).fill(false),
      wc: 0,
      started: false,
      hostId: playerId,
      maxPlayers,
      restartVotes: null
    };
    room.players.set(playerId, { ws, name, role: null, hp: 100, x: 0, z: 0, yaw: 0, alive: true });
    rooms.set(roomId, room);
    state.playerId = playerId;
    state.roomId = roomId;
    safeSend(ws, { type: 'welcome', id: playerId, roomId, isHost: true });
    pushPlayerList(roomId);
    console.log(`[${roomId}] created by ${name}, max=${maxPlayers}`);
    return;
  }

  if (msg.type === 'join') {
    if (state.roomId || state.playerId) {
      safeSend(ws, { type: 'error', msg: '当前连接已经加入房间' });
      return;
    }
    const roomId = cleanRoomCode(msg.room);
    const name = cleanName(msg.name);
    if (!roomId || name === null) {
      recordViolation(ws, state);
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      safeSend(ws, { type: 'error', msg: '房间不存在' });
      return;
    }
    if (room.started) {
      safeSend(ws, { type: 'error', msg: '游戏已开始' });
      return;
    }
    if (room.players.size >= room.maxPlayers) {
      safeSend(ws, { type: 'error', msg: '房间已满' });
      return;
    }

    const playerId = allocatePlayerId();
    room.players.set(playerId, { ws, name, role: null, hp: 100, x: 0, z: 0, yaw: 0, alive: true });
    state.playerId = playerId;
    state.roomId = roomId;
    safeSend(ws, { type: 'welcome', id: playerId, roomId, isHost: false });
    pushPlayerList(roomId);
    console.log(`[${roomId}] ${name} joined (${room.players.size}/${room.maxPlayers})`);
    return;
  }

  const room = getSessionRoom(state);
  if (!room) return;
  const player = room.players.get(state.playerId);

  if (msg.type === 'setMax') {
    if (room.hostId !== state.playerId || room.started) return;
    if (!isInteger(msg.maxPlayers, 2, 8)) {
      recordViolation(ws, state);
      return;
    }
    room.maxPlayers = Math.max(room.players.size, msg.maxPlayers);
    pushPlayerList(state.roomId);
    return;
  }

  if (msg.type === 'start') {
    if (room.hostId !== state.playerId || room.started) return;
    if (room.players.size < 2) {
      safeSend(ws, { type: 'error', msg: '至少需要2名玩家' });
      return;
    }
    beginGame(state.roomId, room);
    return;
  }

  if (!room.started) return;

  if (msg.type === 'pos') {
    const yaw = normaliseAngle(msg.yaw);
    const role = cleanRole(msg.role);
    if (!isFiniteNumber(msg.x, -64, 64) || !isFiniteNumber(msg.z, -64, 64) ||
        yaw === null || !isFiniteNumber(msg.hp, 0, 200) || role === null || role !== player.role) {
      recordViolation(ws, state);
      return;
    }
    if (!player.alive) return;
    player.x = msg.x;
    player.z = msg.z;
    player.yaw = yaw;
    player.hp = msg.hp;
    broadcast(state.roomId, state.playerId, {
      type: 'pos', id: state.playerId, x: player.x, z: player.z,
      yaw: player.yaw, hp: player.hp, role: player.role
    });
    return;
  }

  if (msg.type === 'attack') {
    const role = cleanRole(msg.role);
    const damage = msg.damage === undefined ? 0 : msg.damage;
    const target = typeof msg.targetId === 'string' ? room.players.get(msg.targetId) : null;
    if (role === null || role !== player.role || !target || target === player || !target.alive ||
        target.role === player.role || !isFiniteNumber(damage, 0, 100)) {
      recordViolation(ws, state);
      return;
    }
    broadcast(state.roomId, state.playerId, {
      type: 'attack', attId: state.playerId, targetId: msg.targetId,
      role: player.role, damage
    });
    return;
  }

  if (msg.type === 'wallet') {
    if (!isInteger(msg.wi, 0, room.wals.length - 1) ||
        (msg.wc !== undefined && !isInteger(msg.wc, 0, room.wals.length)) || player.role !== 'clown') {
      recordViolation(ws, state);
      return;
    }
    if (!room.wals[msg.wi]) {
      room.wals[msg.wi] = true;
      room.wc++;
      broadcastAll(state.roomId, { type: 'wallet', wi: msg.wi, wc: room.wc, byId: state.playerId });
    }
    return;
  }

  if (msg.type === 'die') {
    if (!player.alive) return;
    player.alive = false;
    broadcast(state.roomId, state.playerId, { type: 'die', id: state.playerId });
    return;
  }

  if (msg.type === 'respawn') {
    if (player.alive) return;
    player.alive = true;
    player.role = 'police';
    player.hp = 50;
    broadcast(state.roomId, state.playerId, { type: 'respawn', id: state.playerId });
    return;
  }

  if (msg.type === 'restart') {
    if (room.players.size < 2) {
      safeSend(ws, { type: 'error', msg: '至少需要2名玩家才能重开' });
      return;
    }
    if (!room.restartVotes) room.restartVotes = new Set();
    room.restartVotes.add(state.playerId);
    broadcastAll(state.roomId, {
      type: 'restartVote', votes: room.restartVotes.size, total: room.players.size
    });
    if (room.restartVotes.size >= room.players.size) restartGame(state.roomId, room);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  const state = {
    ws,
    playerId: null,
    roomId: null,
    rateWindows: new Map(),
    violations: 0,
    violationWindowStarted: Date.now(),
    lastErrorAt: 0,
    cleanedUp: false
  };

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});

  ws.on('message', (raw, isBinary) => {
    try {
      if (!consumeWindow(state, 'all', 100, 1000)) {
        recordViolation(ws, state, '消息发送过于频繁');
        return;
      }
      if (isBinary) {
        recordViolation(ws, state);
        return;
      }
      const msg = JSON.parse(raw.toString('utf8'));
      if (!isPlainObject(msg) || typeof msg.type !== 'string' || msg.type.length > 24) {
        recordViolation(ws, state);
        return;
      }
      if (!rateAllowed(state, msg.type)) {
        recordViolation(ws, state, '消息发送过于频繁');
        return;
      }
      handleMessage(ws, state, msg);
    } catch {
      recordViolation(ws, state);
    }
  });

  ws.on('close', () => {
    if (state.cleanedUp) return;
    state.cleanedUp = true;
    const room = getSessionRoom(state);
    if (!room) return;

    room.players.delete(state.playerId);
    allocatedPlayerIds.delete(state.playerId);
    if (room.players.size === 0) {
      rooms.delete(state.roomId);
      console.log(`[${state.roomId}] closed`);
      return;
    }
    if (room.hostId === state.playerId) {
      room.hostId = room.players.keys().next().value;
      console.log(`[${state.roomId}] host transferred to ${room.players.get(room.hostId).name}`);
    }
    room.restartVotes?.delete(state.playerId);
    if (!room.started) pushPlayerList(state.roomId);
    else {
      broadcast(state.roomId, state.playerId, { type: 'leave', id: state.playerId });
      if (room.players.size < 2) room.restartVotes = null;
      else if (room.restartVotes) {
        if (room.restartVotes.size >= room.players.size) restartGame(state.roomId, room);
        else broadcastAll(state.roomId, {
          type: 'restartVote', votes: room.restartVotes.size, total: room.players.size
        });
      }
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      safeTerminate(ws);
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch { safeTerminate(ws); }
  }
}, HEARTBEAT_MS);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => console.log(`Game server on port ${PORT}`));
