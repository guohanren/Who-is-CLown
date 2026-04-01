import { useState, useEffect, useRef } from "react";
import * as THREE from "three";

const CFG={MAP:60,WALK:4,SPRINT:7,AI:8,TIME:240,RAGE_T:60,AR:3.5,AD:100,ACD:1.2,WHP:50,MHP:200,SENS:.004,PSR:9,PSD:25,PSCD:1.2,PMK:30,WIN_W:5,COL_T:3};
const BD=[[-8,-8,6,5,8],[8,-10,8,4,6],[-12,8,5,6,5],[10,6,7,4,7],[0,15,10,3,4],[-18,-2,4,5,10],[18,-3,5,4,8],[0,-18,12,3,5],[-22,16,6,4,6],[22,14,5,5,5],[-20,-16,7,3,7],[20,-16,6,4,6]];
const WP=[[-25,-22],[25,-20],[-24,22],[24,20],[0,-26],[0,26]];
const px=c=>new THREE.MeshLambertMaterial({color:c,flatShading:true});

function mkMC(skin,shirt,pants,shoe){const g=new THREE.Group();
const h=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),px(skin));h.position.set(0,1.65,0);g.add(h);
const b=new THREE.Mesh(new THREE.BoxGeometry(.5,.65,.3),px(shirt));b.position.set(0,1.125,0);g.add(b);
const la=new THREE.Mesh(new THREE.BoxGeometry(.2,.6,.2),px(shirt));la.position.set(-.37,1.1,0);g.add(la);
const ra=new THREE.Mesh(new THREE.BoxGeometry(.2,.6,.2),px(shirt));ra.position.set(.37,1.1,0);g.add(ra);
const ll=new THREE.Mesh(new THREE.BoxGeometry(.22,.6,.22),px(pants));ll.position.set(-.14,.5,0);g.add(ll);
const rl=new THREE.Mesh(new THREE.BoxGeometry(.22,.6,.22),px(pants));rl.position.set(.14,.5,0);g.add(rl);
const ls=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,.28),px(shoe));ls.position.set(-.14,.2,.02);g.add(ls);
const rs=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,.28),px(shoe));rs.position.set(.14,.2,.02);g.add(rs);
g.userData={la,ra,ll,rl,head:h};return g;}

function mkClown(sc){const g=mkMC(0xffcc99,0xcc2222,0x2244aa,0x442200);
const n=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.12),px(0xff0000));n.position.set(0,1.62,.28);g.add(n);
const ht=new THREE.Mesh(new THREE.BoxGeometry(.55,.2,.55),px(0x884422));ht.position.set(0,2,0);g.add(ht);
const ht2=new THREE.Mesh(new THREE.BoxGeometry(.35,.25,.35),px(0x993322));ht2.position.set(0,2.15,0);g.add(ht2);
if(sc)sc.add(g);return g;}

function mkCop(sc){const g=mkMC(0xffddb3,0x1a3355,0x112244,0x111111);
const hm=new THREE.Mesh(new THREE.BoxGeometry(.55,.2,.55),px(0x0a0a22));hm.position.set(0,1.97,0);g.add(hm);
const vi=new THREE.Mesh(new THREE.BoxGeometry(.45,.1,.05),px(0x334488));vi.position.set(0,1.85,.26);g.add(vi);
const gn=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.4),px(0x333333));gn.position.set(.42,1,.15);g.add(gn);
if(sc)sc.add(g);return g;}

function mkWal(sc){const g=new THREE.Group();
const b=new THREE.Mesh(new THREE.BoxGeometry(.5,.35,.35),px(0x8B6914));b.position.set(0,.38,0);g.add(b);
const l=new THREE.Mesh(new THREE.BoxGeometry(.52,.1,.37),px(0x9B7924));l.position.set(0,.58,0);g.add(l);
const k=new THREE.Mesh(new THREE.BoxGeometry(.08,.1,.04),px(0xDAA520));k.position.set(0,.5,.18);g.add(k);
sc.add(g);return g;}

// 名字标签
function mkLabel(sc, name, role){
  const g=new THREE.Group();
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=32;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=role==='clown'?'rgba(255,50,50,0.85)':'rgba(50,100,255,0.85)';
  ctx.fillRect(0,0,128,32);
  ctx.fillStyle='#fff';ctx.font='bold 16px monospace';ctx.textAlign='center';
  ctx.fillText(name,64,22);
  const tex=new THREE.CanvasTexture(canvas);
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthTest:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.3),mat);
  mesh.position.set(0,2.4,0);
  g.add(mesh);
  if(sc)sc.add(g);
  return {g,mesh};
}

function aW(m,t,s){const d=m.userData;if(!d||!d.la)return;const v=Math.sin(t*s*2.5)*.3;d.la.rotation.x=v;d.ra.rotation.x=-v;d.ll.rotation.x=-v*.5;d.rl.rotation.x=v*.5;}
function aI(m,t){const d=m.userData;if(!d||!d.la)return;d.la.rotation.x=0;d.ra.rotation.x=0;d.ll.rotation.x=0;d.rl.rotation.x=0;if(d.head)d.head.rotation.y=Math.sin(t*.8)*.25;}

function buildWorld(sc,bx){
const grass=new THREE.Mesh(new THREE.BoxGeometry(CFG.MAP,.5,CFG.MAP),px(0x5B8731));grass.position.set(0,-.25,0);sc.add(grass);
const dirt=new THREE.Mesh(new THREE.BoxGeometry(CFG.MAP,.5,CFG.MAP),px(0x8B6914));dirt.position.set(0,-.75,0);sc.add(dirt);
const BC=[0x888888,0x777777,0x999999,0x7a7a7a,0x8a8a8a,0x6a6a6a,0x9a9a9a,0x808080];
BD.forEach(([x,z,w,h,d],i)=>{
const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),px(BC[i%BC.length]));m.position.set(x,h/2,z);sc.add(m);
const e=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:0x444444}));e.position.set(x,h/2,z);sc.add(e);
const r=new THREE.Mesh(new THREE.BoxGeometry(w+.4,.3,d+.4),px(0x555555));r.position.set(x,h+.15,z);sc.add(r);
const p=.55;bx.push({x1:x-w/2-p,x2:x+w/2+p,z1:z-d/2-p,z2:z+d/2+p});});
for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2,r=8+Math.random()*22,tx=Math.cos(a)*r,tz=Math.sin(a)*r;
if(!bx.some(b=>tx>b.x1-1&&tx<b.x2+1&&tz>b.z1-1&&tz<b.z2+1)){
const th=2+Math.random()*2;const tr=new THREE.Mesh(new THREE.BoxGeometry(.4,th,.4),px(0x6B4226));tr.position.set(tx,th/2,tz);sc.add(tr);
for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(Math.random()>.2){const lf=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),px(0x2D6B1E));lf.position.set(tx+dx*.7,th+.5+Math.random()*.5,tz+dz*.7);sc.add(lf);}
const tp=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),px(0x3A8A28));tp.position.set(tx,th+1.3,tz);sc.add(tp);}}
for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2,r=12+Math.random()*10,lx=Math.cos(a)*r,lz=Math.sin(a)*r;
if(!bx.some(b=>lx>b.x1&&lx<b.x2&&lz>b.z1&&lz<b.z2)){
const st=new THREE.Mesh(new THREE.BoxGeometry(.1,1,.1),px(0x8B6914));st.position.set(lx,1,lz);sc.add(st);
const fl=new THREE.Mesh(new THREE.BoxGeometry(.15,.2,.15),new THREE.MeshBasicMaterial({color:0xff8800}));fl.position.set(lx,1.6,lz);sc.add(fl);
const pl=new THREE.PointLight(0xffaa44,.4,8);pl.position.set(lx,2,lz);sc.add(pl);}}}

export default function MultiplayerGame({ onBack }) {
  const [screen, setScreen] = useState('lobby');   // lobby | game | over | switched | waiting
  const [lobbyMode, setLobbyMode] = useState('');  // '' | 'create' | 'join'
  const [roomInput, setRoomInput] = useState('');
  const [nameInput, setNameInput] = useState('玩家' + Math.floor(Math.random()*999+1));
  const [maxPlayersInput, setMaxPlayersInput] = useState(4);
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [playerList, setPlayerList] = useState([]); // [{id, name, isHost}]
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [connErr, setConnErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [hud, setHud] = useState({});
  const [info, setInfo] = useState({});
  const [restartState, setRestartState] = useState(null); // {voted, votes, total}

  const mountRef = useRef(null);
  const gRef = useRef(null);
  const frameRef = useRef(0);
  const wsRef = useRef(null);
  const knobRef = useRef(null);
  const mmRef = useRef(null);
  const jtId = useRef(null), jcR = useRef({ x: 0, y: 0 });
  const ltId = useRef(null), llR = useRef({ x: 0, y: 0 });
  const keysR = useRef({});
  const needInit = useRef(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const handleServerMsgRef = useRef(null);

  useEffect(() => {
    if (screen === 'game' && !(gRef.current && gRef.current.alive)) needInit.current = true;
  }, [screen]);

  useEffect(() => {
    let id;
    function ck() {
      if (needInit.current && mountRef.current) { needInit.current = false; try { initGame(); } catch (e) { setConnErr('' + e.message); } }
      id = requestAnimationFrame(ck);
    }
    id = requestAnimationFrame(ck);
    return () => cancelAnimationFrame(id);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (gRef.current) { gRef.current.alive = false; try { gRef.current.ren.dispose(); } catch (e) {} }
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function connectWS(onCreate) {
    setConnErr('');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_URL = import.meta.env.VITE_WS_URL || (location.port ? `${proto}//${location.hostname}:3001` : `${proto}//${location.host}`);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (onCreate) {
        ws.send(JSON.stringify({ type: 'create', name: nameInput, maxPlayers: maxPlayersInput }));
      } else {
        ws.send(JSON.stringify({ type: 'join', room: roomInput.toUpperCase(), name: nameInput }));
      }
    };

    ws.onerror = () => { setConnErr('连接服务器失败，请检查服务器是否启动'); setScreen('lobby'); };
    ws.onclose = () => {
      if (screenRef.current === 'game') { setConnErr('与服务器断开连接'); setScreen('lobby'); }
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (handleServerMsgRef.current) handleServerMsgRef.current(msg);
    };
  }

  handleServerMsgRef.current = handleServerMsg;
  function handleServerMsg(msg) {
    const G = gRef.current;

    if (msg.type === 'error') { setConnErr(msg.msg); setScreen('lobby'); return; }

    if (msg.type === 'welcome') {
      setRoomId(msg.roomId);
      setIsHost(msg.isHost);
      if (wsRef.current) wsRef.current._myId = msg.id;
      setScreen('waiting');
      return;
    }

    if (msg.type === 'playerList') {
      setPlayerList(msg.list);
      setMaxPlayers(msg.maxPlayers);
      return;
    }

    if (msg.type === 'gameStart') {
      // 服务器分配了角色（首次或重开），存下来进游戏
      setRestartState(null);
      if (wsRef.current) wsRef.current._welcome = { ...msg, id: wsRef.current._myId };
      setScreen('game');
      return;
    }

    if (msg.type === 'restartVote') {
      setRestartState(prev => ({ ...(prev || {}), votes: msg.votes, total: msg.total }));
      return;
    }

    if (!G || !G.alive) return;

    if (msg.type === 'join') {
      const sp = G.fS(6);
      const m = msg.role === 'clown' ? mkClown(G.sc) : mkCop(G.sc);
      m.position.set(sp.x, 0, sp.z);
      // 不加名字标签，避免暴露身份
      G.otherPlayers[msg.id] = { m, p: new THREE.Vector3(sp.x, 0, sp.z), role: msg.role, hp: 100, name: msg.name, alive: true };
      G.af('👤 有玩家加入了游戏', '#48f');
    }

    if (msg.type === 'pos') {
      const op = G.otherPlayers[msg.id];
      if (op && op.alive) {
        op.p.set(msg.x, 0, msg.z);
        op.m.position.set(msg.x, 0, msg.z);
        op.m.rotation.y = msg.yaw;
        op.role = msg.role;
        op.hp = msg.hp;
        aW(op.m, G.gameT, 2);
      }
    }

    if (msg.type === 'attack') {
      if (msg.targetId !== G.myId) return;
      const attacker = G.otherPlayers[msg.attId];
      // 触发方向指示器
      if (attacker) {
        const dx = attacker.p.x - G.pos.x, dz = attacker.p.z - G.pos.z;
        G.hitFlash = { angle: Math.atan2(dx, dz) * 180 / Math.PI - G.yaw * 180 / Math.PI, alpha: 1 };
      }
      if (msg.role === 'clown') {
        // 小丑近战一击必杀（信任发送方的距离校验）
        G.hp = 0;
        G.bigHit = { msg: '💀 被小丑击杀！', sub: (attacker?.name || '???') + ' 击杀了你', col: '#f44', alpha: 1 };
        G.af('💀 ' + (attacker?.name || '???') + ' 击杀了你', '#f44');
        wsRef.current?.send(JSON.stringify({ type: 'die' }));
        G.alive = false;
        setInfo({ w: false, t: '💀 DEFEAT', d: '你阵亡了' });
        setScreen('over');
      } else {
        // 警察开枪
        const dmg = msg.damage || CFG.PSD;
        G.hp -= dmg;
        G.bigHit = { msg: `💥 -${dmg}HP`, sub: (attacker?.name || '???') + ' 击中你！', col: '#ff6b35', alpha: 1 };
        G.af('🔫 ' + (attacker?.name || '???') + ' [-' + dmg + 'HP]', '#e74c3c');
        if (G.hp <= 0) {
          wsRef.current?.send(JSON.stringify({ type: 'die' }));
          G.alive = false;
          setInfo({ w: false, t: '💀 DEFEAT', d: '你阵亡了' });
          setScreen('over');
        }
      }
    }

    if (msg.type === 'wallet') {
      // 其他人占领了钱包
      if (msg.wi >= 0 && msg.wi < G.wals.length) {
        G.wals[msg.wi].tk = true;
        G.wals[msg.wi].m.visible = false;
        G.wc = msg.wc;
        G.al = '⚠️ 钱包被占！'; G.at = 2;
        G.af('💰 钱包被占领 [' + msg.wc + '/' + CFG.WIN_W + ']', '#cc8800');
        if (G.wc >= CFG.WIN_W) {
          G.alive = false;
          // 判断本地角色
          if (G.role === 'police') { setInfo({ w: false, t: '💀 DEFEAT', d: '钱包被占满！' }); setScreen('over'); }
          else { setInfo({ w: true, t: '🎉 CLOWN WIN', d: '占领5个钱包！' }); setScreen('over'); }
        }
      }
    }

    if (msg.type === 'die') {
      const op = G.otherPlayers[msg.id];
      if (op) {
        op.alive = false; op.m.visible = false;
        if (op.role === 'clown' && G.role === 'police') {
          G.alive = false;
          setInfo({ w: true, t: '🎉 POLICE WIN', d: '真小丑已被消灭！' });
          setScreen('over');
          return;
        }
        if (op.role === 'police' && G.role === 'clown') {
          // 检查是否所有警察都死了
          const anyPoliceAlive = Object.values(G.otherPlayers).some(p => p.role === 'police' && p.alive);
          if (!anyPoliceAlive) {
            G.alive = false;
            setInfo({ w: true, t: '🎉 CLOWN WIN', d: '警察全灭！' });
            setScreen('over');
            return;
          }
        }
      }
      G.af('💀 有玩家阵亡', '#888');
    }

    if (msg.type === 'respawn') {
      const op = G.otherPlayers[msg.id];
      if (op) { op.alive = true; op.role = 'police'; op.hp = 50; op.m.visible = true; }
    }

    if (msg.type === 'leave') {
      const op = G.otherPlayers[msg.id];
      if (op) { G.sc.remove(op.m); delete G.otherPlayers[msg.id]; }
      G.af('👤 有玩家离开了游戏', '#888');
    }
  }

  function initGame() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (gRef.current) { gRef.current.alive = false; try { gRef.current.ren.dispose(); } catch (e) {} }
    const ct = mountRef.current;
    while (ct && ct.firstChild) ct.removeChild(ct.firstChild);

    const welcome = wsRef.current?._welcome || {};
    const myId = welcome.id || 'local';
    const myRole = welcome.myRole || 'police';
    const initPlayers = welcome.players || [];
    const initWals = welcome.wals || [];

    const W = window.innerWidth, H = window.innerHeight;
    const ren = new THREE.WebGLRenderer({ antialias: false });
    ren.setSize(W, H); ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    ct.appendChild(ren.domElement);

    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x7CB7F2);
    sc.fog = new THREE.FogExp2(0x7CB7F2, .01);
    const cam = new THREE.PerspectiveCamera(65, W / H, .1, 120);
    sc.add(new THREE.AmbientLight(0xffffff, .65));
    const sun = new THREE.DirectionalLight(0xfff8e7, .85); sun.position.set(20, 35, 15); sc.add(sun);
    sc.add(new THREE.HemisphereLight(0x7CB7F2, 0x5B8731, .4));

    const bx = [];
    buildWorld(sc, bx);

    function inB(x, z) { return bx.some(v => x > v.x1 && x < v.x2 && z > v.z1 && z < v.z2); }
    function rC(p) {
      for (const b of bx) {
        if (p.x > b.x1 && p.x < b.x2 && p.z > b.z1 && p.z < b.z2) {
          const d = [p.x - b.x1, b.x2 - p.x, p.z - b.z1, b.z2 - p.z], n = Math.min(...d), i = d.indexOf(n);
          if (i === 0) p.x = b.x1; else if (i === 1) p.x = b.x2; else if (i === 2) p.z = b.z1; else p.z = b.z2;
        }
      }
      const h = CFG.MAP / 2 - 1; p.x = Math.max(-h, Math.min(h, p.x)); p.z = Math.max(-h, Math.min(h, p.z));
    }
    function fS(mr) {
      const h = CFG.MAP / 2 - 3;
      for (let i = 0; i < 100; i++) { const x = (Math.random() - .5) * h * 2, z = (Math.random() - .5) * h * 2; if (!inB(x, z) && (!mr || Math.sqrt(x * x + z * z) > mr)) return { x, z }; }
      return { x: 2, z: 2 };
    }

    // AI小丑（仅游荡，不抢钱包不攻击）
    const ais = [];
    for (let i = 0; i < CFG.AI; i++) {
      const s = fS(0); const m = mkClown(sc); m.position.set(s.x, 0, s.z);
      ais.push({ m, p: new THREE.Vector3(s.x, 0, s.z), t: null, sp: 1 + Math.random() * 1.2, a: true, beh: 'wander', behT: 2, phase: Math.random() * Math.PI * 2, zigAmp: .3, zigFreq: 3, lookDir: 0 });
    }

    // 钱包
    const wals = [];
    WP.forEach(([wx, wz], i) => {
      let x = wx, z = wz;
      if (inB(x, z)) { const s = fS(4); x = s.x; z = s.z; }
      const m = mkWal(sc); m.position.set(x, 0, z);
      const taken = initWals[i] || false;
      if (taken) m.visible = false;
      wals.push({ m, p: new THREE.Vector3(x, 0, z), tk: taken, wi: i });
    });

    // 其他玩家（不加名字标签）
    const otherPlayers = {};
    initPlayers.forEach(op => {
      const sp = fS(6);
      const m = op.role === 'clown' ? mkClown(sc) : mkCop(sc);
      m.position.set(op.x || sp.x, 0, op.z || sp.z);
      otherPlayers[op.id] = { m, p: new THREE.Vector3(op.x || sp.x, 0, op.z || sp.z), role: op.role, hp: op.hp || 100, name: op.name, alive: op.alive !== false };
    });

    const startPos = fS(5);
    const feed = [];
    function af(msg, col) { feed.push({ msg, col, t: 4 }); if (feed.length > 5) feed.shift(); }

    const G = {
      sc, cam, ren, bx, ais, wals, otherPlayers, myId,
      pos: new THREE.Vector3(startPos.x, 0, startPos.z),
      yaw: 0, pitch: 0,
      hp: 100,
      mhp: 100,
      role: myRole,
      wc: welcome.wc || 0,
      tm: CFG.TIME,
      rage: false, spr: false, col: null, cp: 0,
      jx: 0, jy: 0, acd: 0, al: '', at: 0,
      clk: new THREE.Clock(), alive: true,
      gameT: 0, fS, rC, af, feed, posSyncT: 0,
      hitFlash: { angle: 0, alpha: 0 }, bigHit: null
    };
    gRef.current = G;
    G.clk.start();

    // AI游荡更新（多人模式：只游荡，不抢钱包，不攻击）
    function uAI(c, dt) {
      if (!c.a) return;
      c.behT -= dt;
      const now = G.gameT;
      if (c.behT <= 0) {
        const r = Math.random();
        if (r < .2) { c.beh = 'idle'; c.behT = 1 + Math.random() * 2; c.t = null; }
        else if (r < .6) { c.beh = 'wander'; c.behT = 2 + Math.random() * 4; const s2 = fS(0); c.t = new THREE.Vector3(s2.x, 0, s2.z); }
        else if (r < .8) { c.beh = 'zigzag'; c.behT = 2 + Math.random() * 3; const s2 = fS(0); c.t = new THREE.Vector3(s2.x, 0, s2.z); c.zigAmp = Math.random() * .5 + .2; c.zigFreq = 2 + Math.random() * 3; }
        else { c.beh = 'lookaround'; c.behT = 1.5 + Math.random() * 2; c.lookDir = c.m.rotation.y + (Math.random() - .5) * Math.PI; c.t = null; }
      }
      if (c.beh === 'idle') { aI(c.m, now + c.phase); }
      else if (c.beh === 'lookaround') { c.m.rotation.y += (c.lookDir - c.m.rotation.y) * 2 * dt; aI(c.m, now + c.phase); }
      else if (c.beh === 'wander' || c.beh === 'zigzag') {
        if (!c.t || c.p.distanceTo(c.t) < 1.5) { c.beh = 'idle'; c.behT = .5 + Math.random(); return; }
        const d = new THREE.Vector3().subVectors(c.t, c.p).normalize();
        if (c.beh === 'zigzag') { const pp = new THREE.Vector3(-d.z, 0, d.x); d.x += pp.x * Math.sin(now * c.zigFreq + c.phase) * c.zigAmp; d.z += pp.z * Math.sin(now * c.zigFreq + c.phase) * c.zigAmp; d.normalize(); }
        const sp = c.sp;
        c.p.x += d.x * sp * dt; c.p.z += d.z * sp * dt;
        rC(c.p);
        c.m.position.copy(c.p); c.m.rotation.y = Math.atan2(d.x, d.z);
        aW(c.m, now + c.phase, sp);
      }
    }

    function drawMM() {
      const cv = mmRef.current; if (!cv) return;
      try {
        const ctx = cv.getContext('2d'), S = 100, M = CFG.MAP, s = S / M;
        ctx.fillStyle = '#7CB86B'; ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = '#888'; BD.forEach(([x, z, w, , d]) => { ctx.fillRect((x - w / 2 + M / 2) * s, (z - d / 2 + M / 2) * s, w * s, d * s); });
        wals.forEach(w => {
          const wx = (w.p.x + M / 2) * s, wz = (w.p.z + M / 2) * s;
          if (w.tk) { ctx.fillStyle = 'rgba(218,165,32,.3)'; ctx.fillRect(wx - 3, wz - 3, 6, 6); }
          else { ctx.fillStyle = '#DAA520'; ctx.fillRect(wx - 3, wz - 3, 6, 6); }
        });
        const ppx = (G.pos.x + M / 2) * s, pz = (G.pos.z + M / 2) * s;
        ctx.fillStyle = G.role === 'clown' ? '#0c6' : '#49d';
        ctx.fillRect(ppx - 3, pz - 3, 6, 6);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ppx, pz); ctx.lineTo(ppx - Math.sin(G.yaw) * 9, pz - Math.cos(G.yaw) * 9); ctx.stroke();
      } catch (e) {}
    }

    function tick() {
      if (!G.alive) return;
      frameRef.current = requestAnimationFrame(tick);
      const dt = Math.min(G.clk.getDelta(), .05);
      G.gameT = (G.gameT || 0) + dt;

      // 输入
      const k = keysR.current;
      if (jtId.current === null) { G.jx = 0; G.jy = 0; if (k.a || k.arrowleft) G.jx = -1; if (k.d || k.arrowright) G.jx = 1; if (k.w || k.arrowup) G.jy = -1; if (k.s || k.arrowdown) G.jy = 1; }
      const spd = G.spr ? CFG.SPRINT : CFG.WALK;
      if (G.jx || G.jy) {
        const l = Math.min(Math.hypot(G.jx, G.jy), 1), nx = G.jx / l, ny = -G.jy / l, sY = Math.sin(G.yaw), cY = Math.cos(G.yaw);
        G.pos.x += (nx * cY - ny * sY) * spd * l * dt;
        G.pos.z += (-nx * sY - ny * cY) * spd * l * dt;
      }
      rC(G.pos);
      cam.position.set(G.pos.x, 1.6, G.pos.z);
      cam.rotation.order = 'YXZ'; cam.rotation.y = G.yaw; cam.rotation.x = G.pitch;
      G.acd = Math.max(0, G.acd - dt);
      G.tm -= dt;

      // 小丑抢钱包逻辑（只有玩家自己可以占领）
      if (G.role === 'clown') {
        if (G.col) {
          if (G.pos.distanceTo(G.col.p) > 2.5) { G.col = null; G.cp = 0; }
          else {
            G.cp += dt;
            if (G.cp >= CFG.COL_T) {
              G.col.tk = true; G.col.m.visible = false; G.wc++;
              wsRef.current?.send(JSON.stringify({ type: 'wallet', wi: G.col.wi, wc: G.wc }));
              G.col = null; G.cp = 0;
              G.hp = Math.min(CFG.MHP, G.hp + CFG.WHP); G.mhp = Math.max(G.mhp, G.hp);
              G.al = '💰 +1！'; G.at = 2;
              af('💰 占领钱包 [' + G.wc + '/' + CFG.WIN_W + ']', '#cc8800');
            }
          }
        } else {
          for (const w of wals) {
            if (!w.tk && G.pos.distanceTo(w.p) < 2) { G.col = w; G.cp = 0; break; }
          }
        }
      }

      // AI更新
      ais.forEach(c => uAI(c, dt));

      // 击中特效衰减
      if (G.hitFlash.alpha > 0) G.hitFlash.alpha = Math.max(0, G.hitFlash.alpha - dt * 1.2);
      if (G.bigHit && G.bigHit.alpha > 0) G.bigHit.alpha = Math.max(0, G.bigHit.alpha - dt * 0.7);

      // 位置同步（30fps = 每~33ms）
      G.posSyncT = (G.posSyncT || 0) + dt;
      if (G.posSyncT >= 1 / 30) {
        G.posSyncT = 0;
        wsRef.current?.send(JSON.stringify({ type: 'pos', x: G.pos.x, z: G.pos.z, yaw: G.yaw, hp: G.hp, role: G.role }));
      }

      if (G.at > 0) { G.at -= dt; if (G.at <= 0) G.al = ''; }
      for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) feed.splice(i, 1); }

      wals.forEach(w => { if (!w.tk) { w.m.position.y = Math.sin(Date.now() * .002 + w.p.x) * .08; w.m.rotation.y += .008; } });

      // 胜负判定
      if (G.role === 'clown' && G.wc >= CFG.WIN_W) { G.alive = false; setInfo({ w: true, t: '🎉 CLOWN WIN', d: '占领5个钱包！' }); setScreen('over'); return; }
      if (G.tm <= 0) { G.alive = false; setInfo(G.role === 'clown' ? { w: false, t: '💀 TIME UP', d: '失败' } : { w: true, t: '🎉 POLICE WIN', d: '守住了！' }); setScreen('over'); return; }

      drawMM();
      const mn = Math.floor(Math.max(0, G.tm) / 60), s2 = Math.floor(Math.max(0, G.tm) % 60);
      let st = G.role === 'clown' ? (G.spr ? '💨 疾跑' : G.col ? '💰 占领中' : '🤡 潜行中') : '👮 搜索中';
      const pCount = Object.values(otherPlayers).filter(p => p.alive).length;
      setHud({ hp: G.hp, mhp: G.mhp, wc: G.wc, pc: pCount, tm: mn + ':' + String(s2).padStart(2, '0'), rl: G.role, st, spr: G.spr, al: G.al, cp: G.col ? G.cp / CFG.COL_T : -1, fd: feed.map(f => ({ msg: f.msg, col: f.col })), hitFlash: G.hitFlash.alpha > 0.01 ? { ...G.hitFlash } : null, bigHit: G.bigHit?.alpha > 0.01 ? { ...G.bigHit } : null });
      ren.render(sc, cam);
    }

    G.tick = tick;
    // 立刻发送第一次位置同步
    wsRef.current?.send(JSON.stringify({ type: 'pos', x: G.pos.x, z: G.pos.z, yaw: G.yaw, hp: G.hp, role: G.role }));
    frameRef.current = requestAnimationFrame(tick);
    af('🎮 游戏开始！房间：' + roomId, '#2ed573');
    af('你是 ' + (myRole === 'clown' ? '🤡 小丑！偷钱包！' : '👮 警察！找小丑！'), myRole === 'clown' ? '#f44' : '#48f');
  }

  function doAtk() {
    const G = gRef.current; if (!G || G.acd > 0 || !G.alive) return;
    G.acd = CFG.ACD;
    if (G.role === 'clown') {
      // 小丑：近战攻击附近警察玩家
      let hit = null, md = CFG.AR;
      Object.entries(G.otherPlayers).forEach(([id, op]) => {
        if (!op.alive || op.role !== 'police') return;
        const d = G.pos.distanceTo(op.p);
        if (d < md) { md = d; hit = { id, op }; }
      });
      if (hit) {
        wsRef.current?.send(JSON.stringify({ type: 'attack', targetId: hit.id, role: 'clown' }));
        G.al = '⚔️ 攻击！'; G.at = 1.5;
        G.af('⚔️ 攻击 ' + hit.op.name, '#f44');
      } else { G.al = '⚔️ MISS'; G.at = 1; }
    } else {
      // 警察：射击前方目标（投影到水平面避免pitch影响）
      const dir = new THREE.Vector3(); G.cam.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
      let hit = null, hd2 = Infinity, hitAI = null;
      // 检查真人小丑
      Object.entries(G.otherPlayers).forEach(([id, op]) => {
        if (!op.alive || op.role !== 'clown') return;
        const d = G.pos.distanceTo(op.p);
        if (d < 30 && d < hd2) {
          const tc = new THREE.Vector3().subVectors(op.p, G.pos); tc.y = 0; tc.normalize();
          if (tc.dot(dir) > .65) { hit = { id, op }; hd2 = d; }
        }
      });
      // 检查AI小丑
      G.ais.forEach((c, i) => {
        if (!c.a) return;
        const d = G.pos.distanceTo(c.p);
        if (d < 30 && d < hd2) {
          const tc = new THREE.Vector3().subVectors(c.p, G.pos); tc.y = 0; tc.normalize();
          if (tc.dot(dir) > .65) { hit = null; hitAI = { idx: i, c }; hd2 = d; }
        }
      });
      if (hit) {
        wsRef.current?.send(JSON.stringify({ type: 'attack', targetId: hit.id, role: 'police', damage: CFG.PSD }));
        G.al = '🔫 命中！-' + CFG.PSD + 'HP'; G.at = 1.5;
        G.af('🔫 命中目标 [-' + CFG.PSD + 'HP]', '#2ed573');
      } else if (hitAI) {
        // 打了假小丑，假小丑打不死，只有自己扣血
        G.hp -= CFG.PMK;
        G.al = '❌ 打错了！-' + CFG.PMK + 'HP'; G.at = 2.5;
        G.af('❌ 那不是真小丑！[-' + CFG.PMK + 'HP]', '#e74c3c');
        G.bigHit = { msg: '❌ 打错了！-' + CFG.PMK + 'HP', sub: '那不是真小丑！', col: '#e74c3c', alpha: 1 };
        if (G.hp <= 0) {
          wsRef.current?.send(JSON.stringify({ type: 'die' }));
          G.alive = false;
          setInfo({ w: false, t: '💀 DEFEAT', d: '误杀过多阵亡' });
          setScreen('over');
        }
      } else { G.al = '🔫 MISS'; G.at = 1; }
    }
  }

  function doRespawn() {
    const G = gRef.current; if (!G) return;
    G.role = 'police';
    const s = G.fS(8); G.pos.set(s.x, 0, s.z);
    G.hp = 50; G.mhp = 100; G.col = null; G.cp = 0;
    G.al = '👮 RESPAWN'; G.at = 3;
    G.jx = 0; G.jy = 0; G.spr = false;
    jtId.current = null; ltId.current = null;
    if (knobRef.current) knobRef.current.style.transform = 'translate(0,0)';
    wsRef.current?.send(JSON.stringify({ type: 'respawn' }));
    G.alive = true; G.clk.getDelta(); G.clk.start();
    G.af('🔄 重生为警察！', '#3498db');
    setScreen('game');
    frameRef.current = requestAnimationFrame(G.tick);
  }

  function handleLeave() {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (gRef.current) { gRef.current.alive = false; try { gRef.current.ren.dispose(); } catch (e) {} gRef.current = null; }
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
    onBack();
  }

  // 键盘
  useEffect(() => {
    const kd = e => { keysR.current[e.key.toLowerCase()] = true; if (e.key === ' ') doAtk(); };
    const ku = e => { keysR.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  // 鼠标视角
  useEffect(() => {
    let d = false, lx = 0, ly = 0;
    const md = e => { d = true; lx = e.clientX; ly = e.clientY; };
    const mm = e => { if (d && gRef.current) { gRef.current.yaw -= (e.clientX - lx) * CFG.SENS; gRef.current.pitch = Math.max(-1, Math.min(1, gRef.current.pitch - (e.clientY - ly) * CFG.SENS)); lx = e.clientX; ly = e.clientY; } };
    const mu = () => { d = false; };
    window.addEventListener('mousedown', md); window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    return () => { window.removeEventListener('mousedown', md); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  }, []);

  useEffect(() => {
    const fn = () => { const G = gRef.current; if (G && G.ren) { G.cam.aspect = innerWidth / innerHeight; G.cam.updateProjectionMatrix(); G.ren.setSize(innerWidth, innerHeight); } };
    window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn);
  }, []);

  // 触控
  const onJS = e => { e.preventDefault(); if (jtId.current !== null) return; const t = e.changedTouches[0]; jtId.current = t.identifier; const b = e.currentTarget.querySelector('[data-jb]'); if (b) { const r = b.getBoundingClientRect(); jcR.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } };
  const onJM = e => { e.preventDefault(); const G = gRef.current; if (!G) return; for (const t of e.changedTouches) { if (t.identifier === jtId.current) { let dx = t.clientX - jcR.current.x, dy = t.clientY - jcR.current.y; const ds = Math.hypot(dx, dy), M = 36; if (ds > M) { dx = dx / ds * M; dy = dy / ds * M; } if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px,${dy}px)`; G.jx = dx / M; G.jy = dy / M; } } };
  const onJE = e => { for (const t of e.changedTouches) { if (t.identifier === jtId.current) { jtId.current = null; if (knobRef.current) knobRef.current.style.transform = 'translate(0,0)'; if (gRef.current) { gRef.current.jx = 0; gRef.current.jy = 0; } } } };
  const onLS = e => { e.preventDefault(); if (ltId.current !== null) return; const t = e.changedTouches[0]; ltId.current = t.identifier; llR.current = { x: t.clientX, y: t.clientY }; };
  const onLM = e => { e.preventDefault(); const G = gRef.current; if (!G) return; for (const t of e.changedTouches) { if (t.identifier === ltId.current) { G.yaw -= (t.clientX - llR.current.x) * CFG.SENS; G.pitch = Math.max(-1, Math.min(1, G.pitch - (t.clientY - llR.current.y) * CFG.SENS)); llR.current = { x: t.clientX, y: t.clientY }; } } };
  const onLE = e => { for (const t of e.changedTouches) { if (t.identifier === ltId.current) ltId.current = null; } };

  const bxS = { background: 'rgba(0,0,0,.5)', padding: '4px 8px', color: '#fff', fontSize: 10, border: '2px solid rgba(255,255,255,.15)' };
  const ov = { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 300, color: '#fff', textAlign: 'center', padding: 20 };
  const mcB = { padding: '14px 36px', borderRadius: 0, border: '3px solid #555', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'Courier New',monospace", color: '#fff', letterSpacing: 1, width: 220, textAlign: 'center' };
  const inpS = { background: 'rgba(0,0,0,.5)', border: '2px solid #555', color: '#fff', padding: '10px 14px', fontSize: 14, width: 220, fontFamily: "'Courier New',monospace", outline: 'none', marginBottom: 10 };

  const pl = screen === 'game', h = hud;

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', background: '#000', overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', fontFamily: "'Courier New','Monaco',monospace" }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ===== 大厅 ===== */}
      {screen === 'lobby' && <div style={ov}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>🌐</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#48f', letterSpacing: 2, marginBottom: 16 }}>多人模式</h2>
        {connErr && <div style={{ color: '#f44', fontSize: 11, marginBottom: 12, border: '1px solid #f44', padding: '6px 12px', maxWidth: 280 }}>{connErr}</div>}

        {lobbyMode === '' && <>
          <input style={inpS} placeholder="你的名字" value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={12} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <button style={{ ...mcB, background: 'linear-gradient(180deg,#4a4,#383)' }} onClick={() => setLobbyMode('create')}>🏠 创建房间</button>
            <button style={{ ...mcB, background: 'linear-gradient(180deg,#48f,#36c)' }} onClick={() => setLobbyMode('join')}>🚪 加入房间</button>
            <button style={{ ...mcB, background: 'linear-gradient(180deg,#555,#444)', marginTop: 4 }} onClick={handleLeave}>← 返回</button>
          </div>
        </>}

        {lobbyMode === 'create' && <>
          <p style={{ color: '#aaa', fontSize: 11, marginBottom: 10 }}>游戏开始后随机分配小丑</p>
          <div style={{ marginBottom: 12, textAlign: 'center' }}>
            <div style={{ color: '#aaa', fontSize: 10, marginBottom: 6 }}>房间人数上限</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {[2,3,4,5,6].map(n => (
                <button key={n} style={{ width: 36, height: 36, border: '2px solid ' + (maxPlayersInput===n?'#4a4':'#555'), background: maxPlayersInput===n?'rgba(0,200,0,.2)':'rgba(0,0,0,.3)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setMaxPlayersInput(n)}>{n}</button>
              ))}
            </div>
          </div>
          <button style={{ ...mcB, background: 'linear-gradient(180deg,#4a4,#383)' }} onClick={() => connectWS(true)}>▶ 创建房间</button>
          <button style={{ ...mcB, background: 'linear-gradient(180deg,#555,#444)', marginTop: 8 }} onClick={() => setLobbyMode('')}>← 返回</button>
        </>}

        {lobbyMode === 'join' && <>
          <input style={inpS} placeholder="房间号（6位大写字母）" value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())} maxLength={6} />
          <button style={{ ...mcB, background: 'linear-gradient(180deg,#48f,#36c)' }} onClick={() => connectWS(false)}>▶ 加入</button>
          <button style={{ ...mcB, background: 'linear-gradient(180deg,#555,#444)', marginTop: 8 }} onClick={() => setLobbyMode('')}>← 返回</button>
        </>}
      </div>}

      {/* ===== 等待室 ===== */}
      {screen === 'waiting' && <div style={ov}>
        <div style={{ fontSize: 14, color: '#aaa', letterSpacing: 2, marginBottom: 6 }}>🌐 多人对战 · 等待中</div>

        {/* 房间号大显示 */}
        <div style={{ background: 'rgba(0,80,200,.15)', border: '2px solid #48f', padding: '12px 24px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>房间号（分享给朋友）</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#ff8', letterSpacing: 6 }}>{roomId}</div>
          <button style={{ marginTop: 8, background: copied?'rgba(0,200,0,.2)':'rgba(255,255,255,.05)', border: '1px solid ' + (copied?'#4f4':'#555'), color: copied?'#4f4':'#aaa', fontSize: 10, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => { navigator.clipboard?.writeText(roomId); setCopied(true); setTimeout(()=>setCopied(false), 2000); }}>
            {copied ? '✓ 已复制' : '📋 复制房间号'}
          </button>
        </div>

        {/* 玩家列表 */}
        <div style={{ width: 240, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 6 }}>玩家 ({playerList.length}/{maxPlayers})</div>
          {playerList.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.04)', border: '1px solid #333', marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>{p.isHost ? '👑' : '👤'}</span>
              <span style={{ flex: 1, fontSize: 12, color: '#fff' }}>{p.name}</span>
              <span style={{ fontSize: 9, color: p.isHost ? '#fa0' : '#888' }}>{p.isHost ? '房主' : '成员'}</span>
            </div>
          ))}
          {/* 空位 */}
          {Array(Math.max(0, maxPlayers - playerList.length)).fill(0).map((_, i) => (
            <div key={'empty'+i} style={{ padding: '6px 10px', background: 'rgba(255,255,255,.02)', border: '1px dashed #333', marginBottom: 4, color: '#444', fontSize: 11 }}>等待加入...</div>
          ))}
        </div>

        {/* 房主：人数设置 + 开始按钮 */}
        {isHost ? <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: '#aaa' }}>人数上限</span>
            {[2,3,4,5,6].map(n => (
              <button key={n} style={{ width: 30, height: 30, border: '2px solid ' + (maxPlayers===n?'#4a4':'#444'), background: maxPlayers===n?'rgba(0,200,0,.2)':'transparent', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => { setMaxPlayers(n); wsRef.current?.send(JSON.stringify({ type: 'setMax', maxPlayers: n })); }}>{n}</button>
            ))}
          </div>
          <button
            style={{ ...mcB, background: playerList.length >= 2 ? 'linear-gradient(180deg,#4a4,#383)' : 'linear-gradient(180deg,#333,#222)', color: playerList.length >= 2 ? '#fff' : '#555', cursor: playerList.length >= 2 ? 'pointer' : 'default' }}
            onClick={() => { if (playerList.length >= 2) wsRef.current?.send(JSON.stringify({ type: 'start' })); }}>
            {playerList.length >= 2 ? '▶ 开始游戏' : `⏳ 等待玩家 (${playerList.length}/${2})`}
          </button>
        </> : (
          <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>⏳ 等待房主开始游戏...</div>
        )}

        <button style={{ ...mcB, background: 'linear-gradient(180deg,#555,#444)', marginTop: 10, fontSize: 12, padding: '10px 24px' }} onClick={() => { if(wsRef.current){wsRef.current.close();wsRef.current=null;} setScreen('lobby'); setPlayerList([]); }}>← 离开房间</button>
      </div>}

      {/* ===== 游戏HUD ===== */}
      {pl && h.rl && <>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 8px', display: 'flex', justifyContent: 'space-between', zIndex: 10, pointerEvents: 'none' }}>
          <div style={bxS}>
            <div style={{ color: '#aaa', fontSize: 8 }}>HP</div>
            <div style={{ width: 65, height: 4, background: '#333', marginTop: 1 }}><div style={{ height: '100%', width: Math.max(0, (h.hp / h.mhp) * 100) + '%', background: h.rl === 'clown' ? '#f44' : '#48f' }} /></div>
            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 2, color: h.rl === 'clown' ? '#4f4' : '#8cf' }}>{h.st}</div>
          </div>
          <div style={{ ...bxS, textAlign: 'center', minWidth: 44 }}>
            <div style={{ color: '#aaa', fontSize: 8 }}>TIME</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#ff8' }}>{h.tm}</div>
            <div style={{ fontSize: 8, color: '#48f' }}>🌐 {roomId}</div>
          </div>
          <div style={{ ...bxS, textAlign: 'right' }}>
            <div style={{ color: '#aaa', fontSize: 8 }}>WALLET</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fa0' }}>{h.wc}/5</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 1 }}>👥{h.pc + 1}人</div>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none', padding: '1px 10px', border: '2px solid ' + (h.rl === 'clown' ? '#f44' : '#48f'), background: 'rgba(0,0,0,.6)', fontSize: 10, fontWeight: 700, color: '#fff' }}>{h.rl === 'clown' ? '🤡 CLOWN' : '👮 POLICE'}</div>
        {h.al && <div style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)', background: 'rgba(200,0,0,.85)', color: '#fff', padding: '3px 12px', border: '2px solid #f44', fontSize: 10, fontWeight: 700, zIndex: 30, pointerEvents: 'none', whiteSpace: 'nowrap' }}>{h.al}</div>}
        {h.fd && h.fd.length > 0 && <div style={{ position: 'absolute', top: 72, left: 8, zIndex: 12, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>{h.fd.map((f, i) => <div key={i} style={{ background: 'rgba(0,0,0,.6)', padding: '2px 6px', fontSize: 9, fontWeight: 600, color: f.col, borderLeft: '3px solid ' + f.col, whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden' }}>{f.msg}</div>)}</div>}
        <div style={{ position: 'absolute', top: 72, right: 6, zIndex: 12, pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,.5)', padding: '3px 5px', border: '2px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontSize: 7, color: '#aaa', marginBottom: 2 }}>PROGRESS</div>
            <div style={{ display: 'flex', gap: 2 }}>{[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: 12, height: 12, background: i < (h.wc || 0) ? '#fa0' : '#333', border: '1px solid ' + (i < (h.wc || 0) ? '#fa0' : '#555'), fontSize: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i < (h.wc || 0) ? '✓' : ''}</div>)}</div>
          </div>
          <div style={{ marginTop: 3, background: 'rgba(0,0,0,.5)', padding: 2, border: '2px solid rgba(255,255,255,.1)' }}>
            <canvas ref={mmRef} width={100} height={100} style={{ width: 100, height: 100, display: 'block', imageRendering: 'pixelated' }} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 2, fontSize: 6, color: '#aaa' }}><span style={{ color: '#0c6' }}>■YOU</span><span style={{ color: '#da5' }}>■WAL</span></div>
          </div>
        </div>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 10, pointerEvents: 'none', width: 18, height: 18 }}>
          <div style={{ width: 2, height: 18, background: 'rgba(255,255,255,.5)', position: 'absolute', left: 8 }} />
          <div style={{ width: 18, height: 2, background: 'rgba(255,255,255,.5)', position: 'absolute', top: 8 }} />
        </div>

        {/* CF 风格方向光锥 */}
        {h.hitFlash && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* 屏幕边缘红色渐变 */}
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, transparent 55%, rgba(220,30,0,${h.hitFlash.alpha * 0.45}) 100%)` }} />
          {/* 方向弧形指示器 */}
          <div style={{
            position: 'absolute', width: 180, height: 180,
            border: '5px solid transparent',
            borderTopColor: `rgba(255,60,0,${h.hitFlash.alpha})`,
            borderRadius: '50%', boxSizing: 'border-box',
            transform: `rotate(${h.hitFlash.angle}deg)`,
            filter: `drop-shadow(0 -3px 8px rgba(255,80,0,${h.hitFlash.alpha * 0.9}))`
          }} />
          {/* 两侧小弧 */}
          <div style={{
            position: 'absolute', width: 200, height: 200,
            border: '3px solid transparent',
            borderTopColor: `rgba(255,120,0,${h.hitFlash.alpha * 0.5})`,
            borderRadius: '50%', boxSizing: 'border-box',
            transform: `rotate(${h.hitFlash.angle - 15}deg)`
          }} />
          <div style={{
            position: 'absolute', width: 200, height: 200,
            border: '3px solid transparent',
            borderTopColor: `rgba(255,120,0,${h.hitFlash.alpha * 0.5})`,
            borderRadius: '50%', boxSizing: 'border-box',
            transform: `rotate(${h.hitFlash.angle + 15}deg)`
          }} />
        </div>}

        {/* 被击中大字提示 */}
        {h.bigHit && <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 46, pointerEvents: 'none', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: h.bigHit.col, textShadow: `0 0 12px ${h.bigHit.col}`, opacity: h.bigHit.alpha, letterSpacing: 2 }}>{h.bigHit.msg}</div>
          <div style={{ fontSize: 13, color: '#fff', opacity: h.bigHit.alpha * 0.85, marginTop: 4, textShadow: '1px 1px 4px #000' }}>{h.bigHit.sub}</div>
        </div>}
        {h.cp >= 0 && <div style={{ position: 'absolute', bottom: 190, left: '50%', transform: 'translateX(-50%)', width: 130, zIndex: 10, pointerEvents: 'none', textAlign: 'center' }}><div style={{ color: '#ff8', fontSize: 9, marginBottom: 2 }}>CAPTURING...</div><div style={{ width: '100%', height: 5, background: '#333', border: '1px solid #555' }}><div style={{ height: '100%', background: '#fa0', width: Math.min(100, h.cp * 100) + '%' }} /></div></div>}
        <button style={{ position: 'absolute', top: 8, left: '50%', marginLeft: -40, zIndex: 30, background: 'rgba(100,0,0,.6)', border: '1px solid #555', color: '#888', fontSize: 9, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleLeave}>✕ 离开</button>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50%', height: 260, zIndex: 20 }} onTouchStart={onJS} onTouchMove={onJM} onTouchEnd={onJE} onTouchCancel={onJE}><div data-jb="1" style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.05)', border: '2px solid rgba(255,255,255,.12)', bottom: 60, left: '50%', marginLeft: -65 }}><div ref={knobRef} style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,.15)', border: '2px solid rgba(255,255,255,.2)', position: 'absolute', top: '50%', left: '50%', marginTop: -24, marginLeft: -24 }} /></div></div>
        <div style={{ position: 'absolute', top: 70, bottom: 0, right: 0, width: '50%', zIndex: 15 }} onTouchStart={onLS} onTouchMove={onLM} onTouchEnd={onLE} onTouchCancel={onLE} />
        <div style={{ position: 'absolute', bottom: 30, right: 14, zIndex: 25, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button style={{ width: 90, height: 90, borderRadius: 16, border: '3px solid ' + (h.spr ? '#fa0' : 'rgba(255,255,255,.2)'), background: h.spr ? 'rgba(255,165,0,.25)' : 'rgba(0,0,0,.35)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }} onTouchStart={e => { e.preventDefault(); e.stopPropagation(); if (gRef.current) gRef.current.spr = !gRef.current.spr; }} onClick={() => { if (gRef.current) gRef.current.spr = !gRef.current.spr; }}><span style={{ fontSize: 30 }}>💨</span><span>RUN</span></button>
          <button style={{ width: 90, height: 90, borderRadius: 16, border: '3px solid rgba(255,255,255,.2)', background: 'rgba(0,0,0,.35)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }} onTouchStart={e => { e.preventDefault(); e.stopPropagation(); doAtk(); }} onClick={doAtk}><span style={{ fontSize: 30 }}>{h.rl === 'clown' ? '⚔️' : '🔫'}</span><span>{h.rl === 'clown' ? 'ATK' : 'FIRE'}</span></button>
        </div>
      </>}

      {/* ===== 死亡变警察 ===== */}
      {screen === 'switched' && <div style={ov}>
        <div style={{ fontSize: 48, marginBottom: 6 }}>💀</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#f44', letterSpacing: 2, marginBottom: 4 }}>YOU DIED!</h2>
        <p style={{ color: '#888', fontSize: 11, lineHeight: 1.6, marginBottom: 14, maxWidth: 240 }}>重生为警察继续战斗</p>
        <button style={{ ...mcB, background: 'linear-gradient(180deg,#48f,#36c)' }} onClick={doRespawn} onTouchEnd={e => { e.preventDefault(); doRespawn(); }}>👮 RESPAWN AS POLICE</button>
        <button style={{ ...mcB, background: 'linear-gradient(180deg,#555,#444)', marginTop: 8 }} onClick={handleLeave}>← 退出游戏</button>
      </div>}

      {/* ===== 游戏结束 ===== */}
      {screen === 'over' && <div style={ov}>
        <div style={{ fontSize: 48, marginBottom: 6 }}>{info.w ? '🏆' : '💀'}</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: info.w ? '#4f4' : '#f44', letterSpacing: 2, marginBottom: 4 }}>{info.t}</h1>
        <p style={{ color: '#888', fontSize: 11, marginBottom: 14 }}>{info.d}</p>
        {restartState?.voted ? (
          <div style={{ color: '#aaa', fontSize: 12, marginBottom: 14, border: '1px solid #555', padding: '8px 16px' }}>
            ⏳ 等待对方确认重开... ({restartState.votes}/{restartState.total})
          </div>
        ) : (
          <button style={{ ...mcB, background: 'linear-gradient(180deg,#4a4,#383)' }} onClick={() => {
            wsRef.current?.send(JSON.stringify({ type: 'restart' }));
            setRestartState(prev => ({ ...(prev || {}), voted: true }));
          }}>🔄 重开一局</button>
        )}
        <button style={{ ...mcB, background: 'linear-gradient(180deg,#555,#444)', marginTop: 8 }} onClick={handleLeave}>← 返回大厅</button>
      </div>}

      {/* ===== 死亡变警察(多人不用这个，但保留给小丑死后) ===== */}
    </div>
  );
}
