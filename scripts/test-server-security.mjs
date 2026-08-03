import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sockets = new Set();

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolvePort(port));
    });
  });
}

function get(pathname, port, method = 'GET') {
  return new Promise((resolveResponse, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: pathname, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolveResponse({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.once('error', reject);
    req.end();
  });
}

class Inbox {
  constructor(ws) {
    this.ws = ws;
    this.messages = [];
    this.waiters = [];
    ws.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      const index = this.waiters.findIndex(waiter => waiter.predicate(message));
      if (index === -1) this.messages.push(message);
      else {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
  }

  next(predicate = () => true, timeoutMs = 1500) {
    const index = this.messages.findIndex(predicate);
    if (index !== -1) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolveMessage, reject) => {
      const waiter = { predicate, resolve: resolveMessage, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const waiterIndex = this.waiters.indexOf(waiter);
        if (waiterIndex !== -1) this.waiters.splice(waiterIndex, 1);
        reject(new Error('message timeout'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
}

function connect(port) {
  return new Promise((resolveSocket, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.add(ws);
    ws.on('error', () => {});
    ws.once('open', () => resolveSocket({ ws, inbox: new Inbox(ws) }));
    ws.once('error', reject);
  });
}

function waitForClose(ws, timeoutMs = 2000) {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolveClose, reject) => {
    const timer = setTimeout(() => reject(new Error('close timeout')), timeoutMs);
    ws.once('close', () => {
      clearTimeout(timer);
      resolveClose();
    });
  });
}

async function expectNoMessage(inbox, predicate, timeoutMs = 250) {
  try {
    const message = await inbox.next(predicate, timeoutMs);
    assert.fail(`unexpected message: ${JSON.stringify(message)}`);
  } catch (error) {
    if (error?.message !== 'message timeout') throw error;
  }
}

function closeAllSockets() {
  for (const ws of sockets) {
    try { ws.close(); } catch {}
  }
}

const port = await reservePort();
const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOutput = '';
child.stdout.on('data', chunk => { serverOutput += chunk; });
child.stderr.on('data', chunk => { serverOutput += chunk; });

try {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server start timeout\n${serverOutput}`)), 3000);
    const check = chunk => {
      serverOutput += chunk.toString();
      if (serverOutput.includes('Game server on port')) {
        clearTimeout(timeout);
        child.stdout.off('data', check);
        resolveReady();
      }
    };
    child.stdout.on('data', check);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited early (${code})\n${serverOutput}`));
    });
  });

  const index = await get('/', port);
  assert.equal(index.status, 200, 'index should remain available');
  assert.match(index.headers['content-type'], /^text\/html/);
  const head = await get('/', port, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');

  const traversalPaths = [
    '/../server.js',
    '/%2e%2e/server.js',
    '/%252e%252e/server.js',
    '/..%2fserver.js',
    '/%2e%2e%5cserver.js',
    '/%00server.js',
    '/bad%zzpath'
  ];
  for (const pathname of traversalPaths) {
    const response = await get(pathname, port);
    assert.ok(response.status >= 400, `${pathname} should be rejected`);
    assert.doesNotMatch(response.body, /WebSocketServer|createServer/);
  }
  const privateFile = await get('/server.js', port);
  assert.equal(privateFile.status, 404);
  assert.doesNotMatch(privateFile.body, /WebSocketServer|createServer/);

  // Primitive, array and malformed JSON payloads must not poison the connection.
  const host = await connect(port);
  host.ws.send('null');
  host.ws.send('[]');
  host.ws.send('1');
  host.ws.send('{bad json');
  host.ws.send(JSON.stringify({ type: 'create', name: '房主', maxPlayers: 4 }));
  const hostWelcome = await host.inbox.next(message => message.type === 'welcome');
  assert.equal(hostWelcome.isHost, true);
  assert.match(hostWelcome.roomId, /^[A-Z2-9]{6}$/);

  // A socket can own only one lobby/session.
  host.ws.send(JSON.stringify({ type: 'create', name: '重复创建', maxPlayers: 4 }));
  const duplicateError = await host.inbox.next(message => message.type === 'error' && /已经加入/.test(message.msg));
  assert.ok(duplicateError);

  const guest = await connect(port);
  guest.ws.send(JSON.stringify({ type: 'join', room: hostWelcome.roomId.toLowerCase(), name: '访客' }));
  const guestWelcome = await guest.inbox.next(message => message.type === 'welcome');
  assert.notEqual(guestWelcome.id, hostWelcome.id);
  const playerList = await host.inbox.next(message => message.type === 'playerList' && message.list.length === 2);
  assert.equal(new Set(playerList.list.map(player => player.id)).size, 2);

  guest.ws.send(JSON.stringify({ type: 'join', room: hostWelcome.roomId, name: '重复加入' }));
  await guest.inbox.next(message => message.type === 'error' && /已经加入/.test(message.msg));

  host.ws.send(JSON.stringify({ type: 'setMax', maxPlayers: 3 }));
  await host.inbox.next(message => message.type === 'playerList' && message.maxPlayers === 3);
  await guest.inbox.next(message => message.type === 'playerList' && message.maxPlayers === 3);

  // A waiting-room host transfer must promote the remaining client.
  const transferOwner = await connect(port);
  transferOwner.ws.send(JSON.stringify({ type: 'create', name: '旧房主', maxPlayers: 3 }));
  const transferOwnerWelcome = await transferOwner.inbox.next(message => message.type === 'welcome');
  const transferMember = await connect(port);
  transferMember.ws.send(JSON.stringify({ type: 'join', room: transferOwnerWelcome.roomId, name: '新房主' }));
  const transferMemberWelcome = await transferMember.inbox.next(message => message.type === 'welcome');
  await transferOwner.inbox.next(message => message.type === 'playerList' && message.list.length === 2);
  await transferMember.inbox.next(message => message.type === 'playerList' && message.list.length === 2);
  transferOwner.ws.close();
  await waitForClose(transferOwner.ws);
  const transferredList = await transferMember.inbox.next(message => message.type === 'playerList' && message.list.length === 1);
  assert.equal(transferredList.hostId, transferMemberWelcome.id);
  assert.equal(transferredList.list[0].isHost, true);

  // A disconnected restart voter must be removed before unanimity is checked.
  const voteOwner = await connect(port);
  voteOwner.ws.send(JSON.stringify({ type: 'create', name: '投票房主', maxPlayers: 3 }));
  const voteOwnerWelcome = await voteOwner.inbox.next(message => message.type === 'welcome');
  const voteA = await connect(port);
  voteA.ws.send(JSON.stringify({ type: 'join', room: voteOwnerWelcome.roomId, name: '投票A' }));
  await voteA.inbox.next(message => message.type === 'welcome');
  const voteB = await connect(port);
  voteB.ws.send(JSON.stringify({ type: 'join', room: voteOwnerWelcome.roomId, name: '投票B' }));
  await voteB.inbox.next(message => message.type === 'welcome');
  await voteOwner.inbox.next(message => message.type === 'playerList' && message.list.length === 3);
  await voteA.inbox.next(message => message.type === 'playerList' && message.list.length === 3);
  await voteB.inbox.next(message => message.type === 'playerList' && message.list.length === 3);
  voteOwner.ws.send(JSON.stringify({ type: 'start' }));
  await voteOwner.inbox.next(message => message.type === 'gameStart');
  await voteA.inbox.next(message => message.type === 'gameStart');
  await voteB.inbox.next(message => message.type === 'gameStart');
  voteB.ws.send(JSON.stringify({ type: 'restart' }));
  await voteOwner.inbox.next(message => message.type === 'restartVote' && message.votes === 1);
  await voteA.inbox.next(message => message.type === 'restartVote' && message.votes === 1);
  await voteB.inbox.next(message => message.type === 'restartVote' && message.votes === 1);
  voteB.ws.close();
  await waitForClose(voteB.ws);
  await voteOwner.inbox.next(message => message.type === 'restartVote' && message.votes === 0 && message.total === 2);
  await voteA.inbox.next(message => message.type === 'restartVote' && message.votes === 0 && message.total === 2);
  voteOwner.ws.send(JSON.stringify({ type: 'restart' }));
  voteA.ws.send(JSON.stringify({ type: 'restart' }));
  await voteOwner.inbox.next(message => message.type === 'gameStart');
  await voteA.inbox.next(message => message.type === 'gameStart');
  voteA.ws.close();
  await waitForClose(voteA.ws);
  await voteOwner.inbox.next(message => message.type === 'leave');
  voteOwner.ws.send(JSON.stringify({ type: 'restart' }));
  await voteOwner.inbox.next(message => message.type === 'error' && /至少需要2名/.test(message.msg));
  await expectNoMessage(voteOwner.inbox, message => message.type === 'gameStart');

  host.ws.send(JSON.stringify({ type: 'start' }));
  const hostStart = await host.inbox.next(message => message.type === 'gameStart');
  const guestStart = await guest.inbox.next(message => message.type === 'gameStart');

  // Bad field types/ranges and role spoofing are dropped; the valid protocol remains usable.
  host.ws.send(JSON.stringify({ type: 'pos', x: 'NaN', z: 0, yaw: 0, hp: 100, role: hostStart.myRole }));
  host.ws.send(JSON.stringify({ type: 'pos', x: 0, z: 0, yaw: 0, hp: 9999, role: hostStart.myRole }));
  host.ws.send(JSON.stringify({
    type: 'pos', x: 0, z: 0, yaw: 0, hp: 100,
    role: hostStart.myRole === 'clown' ? 'police' : 'clown'
  }));
  await expectNoMessage(guest.inbox, message => message.type === 'pos');

  host.ws.send(JSON.stringify({ type: 'pos', x: 2, z: -3, yaw: 0.5, hp: 100, role: hostStart.myRole }));
  const validPosition = await guest.inbox.next(message => message.type === 'pos');
  assert.deepEqual(
    { id: validPosition.id, x: validPosition.x, z: validPosition.z, hp: validPosition.hp, role: validPosition.role },
    { id: hostWelcome.id, x: 2, z: -3, hp: 100, role: hostStart.myRole }
  );

  host.ws.send(JSON.stringify({ type: 'attack', targetId: {}, role: hostStart.myRole, damage: 25 }));
  host.ws.send(JSON.stringify({ type: 'wallet', wi: '0', wc: 1 }));
  await expectNoMessage(guest.inbox, message => message.type === 'attack' || message.type === 'wallet');

  const hostIsClown = hostStart.myRole === 'clown';
  const attacker = hostIsClown ? host : guest;
  const victim = hostIsClown ? guest : host;
  const attackerStart = hostIsClown ? hostStart : guestStart;
  const victimWelcome = hostIsClown ? guestWelcome : hostWelcome;
  const attack = {
    type: 'attack', targetId: victimWelcome.id, role: attackerStart.myRole
  };
  if (attackerStart.myRole === 'police') attack.damage = 25;
  attacker.ws.send(JSON.stringify(attack));
  const relayedAttack = await victim.inbox.next(message => message.type === 'attack');
  assert.equal(relayedAttack.targetId, victimWelcome.id);
  assert.equal(relayedAttack.role, attackerStart.myRole);

  const clown = hostIsClown ? host : guest;
  clown.ws.send(JSON.stringify({ type: 'wallet', wi: 0, wc: 1 }));
  const hostWallet = await host.inbox.next(message => message.type === 'wallet' && message.wi === 0);
  const guestWallet = await guest.inbox.next(message => message.type === 'wallet' && message.wi === 0);
  assert.equal(hostWallet.wc, 1);
  assert.equal(guestWallet.wc, 1);

  // A syntactically valid high-frequency stream proves the rate limiter itself
  // closes abuse; these messages would otherwise be harmless before joining.
  const flooder = await connect(port);
  for (let i = 0; i < 60; i++) flooder.ws.send(JSON.stringify({ type: 'pos', x: 0, z: 0, yaw: 0, hp: 100, role: 'police' }));
  await waitForClose(flooder.ws);

  // ws maxPayload rejects oversized frames and the process remains healthy.
  const oversized = await connect(port);
  oversized.ws.send(JSON.stringify({ type: 'create', name: 'X'.repeat(20_000), maxPlayers: 4 }));
  await waitForClose(oversized.ws);

  const ids = new Set([hostWelcome.id, guestWelcome.id]);
  const roomIds = new Set([hostWelcome.roomId]);
  for (let i = 0; i < 12; i++) {
    const connection = await connect(port);
    connection.ws.send(JSON.stringify({ type: 'create', name: `ID-${i}`, maxPlayers: 2 }));
    const welcome = await connection.inbox.next(message => message.type === 'welcome');
    assert.ok(!ids.has(welcome.id), 'player IDs must be unique');
    assert.ok(!roomIds.has(welcome.roomId), 'room IDs must be unique');
    ids.add(welcome.id);
    roomIds.add(welcome.roomId);
  }

  const stillHealthy = await get('/', port);
  assert.equal(stillHealthy.status, 200, 'server should survive all malicious inputs');
  assert.equal(child.exitCode, null, `server unexpectedly exited\n${serverOutput}`);
  console.log(`server security tests passed (${traversalPaths.length} traversal cases, ${ids.size} unique players)`);
} finally {
  closeAllSockets();
  child.kill('SIGTERM');
  await new Promise(resolveExit => {
    if (child.exitCode !== null) resolveExit();
    else {
      child.once('exit', resolveExit);
      setTimeout(() => { child.kill('SIGKILL'); resolveExit(); }, 1000).unref();
    }
  });
}
