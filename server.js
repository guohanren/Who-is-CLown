import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, 'dist');
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff' };

const httpServer = createServer((req, res) => {
  // 只在有 dist 目录时提供静态文件（生产环境）
  if (!existsSync(DIST)) { res.writeHead(404); res.end('Not built'); return; }
  let filePath = join(DIST, req.url === '/' ? 'index.html' : req.url);
  if (!existsSync(filePath)) filePath = join(DIST, 'index.html'); // SPA fallback
  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});

const wss = new WebSocketServer({ server: httpServer });
const rooms = {};

function genId() { return Math.random().toString(36).substr(2, 6).toUpperCase(); }

function broadcast(roomId, exceptId, msg) {
  const room = rooms[roomId]; if (!room) return;
  const data = JSON.stringify(msg);
  Object.entries(room.players).forEach(([id, p]) => {
    if (id !== exceptId && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  });
}
function broadcastAll(roomId, msg) {
  const room = rooms[roomId]; if (!room) return;
  const data = JSON.stringify(msg);
  Object.values(room.players).forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data); });
}

// 把等待中的玩家列表推送给房间所有人
function pushPlayerList(roomId) {
  const room = rooms[roomId]; if (!room) return;
  const list = Object.entries(room.players).map(([id, p]) => ({
    id, name: p.name, isHost: id === room.hostId
  }));
  broadcastAll(roomId, { type: 'playerList', list, maxPlayers: room.maxPlayers, hostId: room.hostId });
}

wss.on('connection', (ws) => {
  let myId = null, myRoom = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    // ===== 创建房间 =====
    if (msg.type === 'create') {
      const roomId = genId();
      myId = genId();
      myRoom = roomId;
      rooms[roomId] = {
        players: {}, wals: Array(6).fill(false), wc: 0,
        started: false, hostId: myId,
        maxPlayers: Math.min(8, Math.max(2, msg.maxPlayers || 4))
      };
      rooms[roomId].players[myId] = { ws, name: msg.name || 'Player', role: null, hp: 100, x: 0, z: 0, yaw: 0, alive: true };
      ws.send(JSON.stringify({ type: 'welcome', id: myId, roomId, isHost: true }));
      pushPlayerList(roomId);
      console.log(`[${roomId}] created by ${msg.name}, max=${rooms[roomId].maxPlayers}`);
    }

    // ===== 加入房间 =====
    else if (msg.type === 'join') {
      const roomId = msg.room?.toUpperCase();
      if (!rooms[roomId]) { ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' })); return; }
      if (rooms[roomId].started) { ws.send(JSON.stringify({ type: 'error', msg: '游戏已开始' })); return; }
      const room = rooms[roomId];
      if (Object.keys(room.players).length >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: 'error', msg: '房间已满' })); return;
      }
      myId = genId(); myRoom = roomId;
      room.players[myId] = { ws, name: msg.name || 'Player', role: null, hp: 100, x: 0, z: 0, yaw: 0, alive: true };
      ws.send(JSON.stringify({ type: 'welcome', id: myId, roomId, isHost: false }));
      pushPlayerList(roomId);
      console.log(`[${roomId}] ${msg.name} joined (${Object.keys(room.players).length}/${room.maxPlayers})`);
    }

    // ===== 房主修改人数上限 =====
    else if (msg.type === 'setMax') {
      if (!myRoom || !rooms[myRoom] || rooms[myRoom].hostId !== myId) return;
      rooms[myRoom].maxPlayers = Math.min(8, Math.max(2, msg.maxPlayers));
      pushPlayerList(myRoom);
    }

    // ===== 房主开始游戏 =====
    else if (msg.type === 'start') {
      if (!myRoom || !rooms[myRoom] || rooms[myRoom].hostId !== myId) return;
      const room = rooms[myRoom];
      if (room.started) return;
      const ids = Object.keys(room.players);
      if (ids.length < 2) { ws.send(JSON.stringify({ type: 'error', msg: '至少需要2名玩家' })); return; }
      room.started = true;
      const clownId = ids[Math.floor(Math.random() * ids.length)];
      ids.forEach(id => { room.players[id].role = id === clownId ? 'clown' : 'police'; });
      ids.forEach(id => {
        const p = room.players[id];
        const others = ids.filter(i => i !== id).map(i => ({
          id: i, name: room.players[i].name, role: room.players[i].role,
          x: room.players[i].x, z: room.players[i].z, yaw: room.players[i].yaw
        }));
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({ type: 'gameStart', myRole: p.role, players: others, wals: room.wals, wc: room.wc }));
        }
      });
      console.log(`[${myRoom}] game started, clown=${room.players[clownId].name}`);
    }

    // ===== 以下是游戏中消息，仅started后有效 =====
    else if (msg.type === 'pos') {
      if (!myRoom || !rooms[myRoom] || !rooms[myRoom].started) return;
      const p = rooms[myRoom].players[myId];
      if (p) { p.x = msg.x; p.z = msg.z; p.yaw = msg.yaw; p.hp = msg.hp; }
      broadcast(myRoom, myId, { type: 'pos', id: myId, x: msg.x, z: msg.z, yaw: msg.yaw, hp: msg.hp, role: msg.role });
    }

    else if (msg.type === 'attack') {
      if (!myRoom || !rooms[myRoom] || !rooms[myRoom].started) return;
      broadcast(myRoom, myId, { type: 'attack', attId: myId, targetId: msg.targetId, role: msg.role, damage: msg.damage || 0 });
    }

    else if (msg.type === 'wallet') {
      if (!myRoom || !rooms[myRoom] || !rooms[myRoom].started) return;
      const room = rooms[myRoom];
      if (msg.wi >= 0 && msg.wi < room.wals.length && !room.wals[msg.wi]) {
        room.wals[msg.wi] = true; room.wc++;
        broadcastAll(myRoom, { type: 'wallet', wi: msg.wi, wc: room.wc, byId: myId });
      }
    }

    else if (msg.type === 'die') {
      if (!myRoom || !rooms[myRoom]) return;
      const p = rooms[myRoom].players[myId];
      if (p) p.alive = false;
      broadcast(myRoom, myId, { type: 'die', id: myId });
    }

    else if (msg.type === 'respawn') {
      if (!myRoom || !rooms[myRoom]) return;
      const p = rooms[myRoom].players[myId];
      if (p) { p.alive = true; p.role = 'police'; p.hp = 50; }
      broadcast(myRoom, myId, { type: 'respawn', id: myId });
    }

    // ===== 重开投票 =====
    else if (msg.type === 'restart') {
      if (!myRoom || !rooms[myRoom]) return;
      const room = rooms[myRoom];
      if (!room.restartVotes) room.restartVotes = new Set();
      room.restartVotes.add(myId);
      broadcastAll(myRoom, { type: 'restartVote', votes: room.restartVotes.size, total: Object.keys(room.players).length });
      if (room.restartVotes.size >= Object.keys(room.players).length) {
        room.restartVotes = null;
        room.started = true;
        room.wals = Array(6).fill(false);
        room.wc = 0;
        const ids = Object.keys(room.players);
        const clownId = ids[Math.floor(Math.random() * ids.length)];
        ids.forEach(id => {
          room.players[id].role = id === clownId ? 'clown' : 'police';
          room.players[id].hp = 100; room.players[id].alive = true;
          room.players[id].x = 0; room.players[id].z = 0;
        });
        ids.forEach(id => {
          const p = room.players[id];
          const others = ids.filter(i => i !== id).map(i => ({
            id: i, name: room.players[i].name, role: room.players[i].role
          }));
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({ type: 'gameStart', myRole: p.role, players: others, wals: room.wals, wc: room.wc }));
          }
        });
        console.log(`[${myRoom}] restarted, clown=${room.players[clownId].name}`);
      }
    }
  });

  ws.on('close', () => {
    if (!myRoom || !rooms[myRoom]) return;
    const room = rooms[myRoom];
    delete room.players[myId];
    if (Object.keys(room.players).length === 0) {
      delete rooms[myRoom]; console.log(`[${myRoom}] closed`); return;
    }
    if (room.hostId === myId) {
      room.hostId = Object.keys(room.players)[0];
      console.log(`[${myRoom}] host transferred to ${room.players[room.hostId].name}`);
    }
    if (!room.started) {
      pushPlayerList(myRoom);
    } else {
      broadcast(myRoom, myId, { type: 'leave', id: myId });
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Game server on port ${PORT}`));
