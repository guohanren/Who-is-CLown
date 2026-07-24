import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { aI, aW, mkClown, mkCop } from "./characters";
import { createCombatFx, createFirstPersonWeapons, createGameAudio } from "./fpsPresentation";

const CFG={MAP:60,WALK:4,SPRINT:7,AI:10,COPS:3,WIN_W:5,COL_T:3,TIME:240,RAGE_T:60,PV:12,PA:Math.PI*.55,PC:5,PP:2.5,PSR:9,PSD:20,PSCD:1.2,PMK:30,AR:3.5,AD:100,ACD:.8,WHP:50,MHP:200,SENS:.004};
const BD=[[-8,-8,6,5,8],[8,-10,8,4,6],[-12,8,5,6,5],[10,6,7,4,7],[0,15,10,3,4],[-18,-2,4,5,10],[18,-3,5,4,8],[0,-18,12,3,5],[-22,16,6,4,6],[22,14,5,5,5],[-20,-16,7,3,7],[20,-16,6,4,6]];
const WP=[[-25,-22],[25,-20],[-24,22],[24,20],[0,-26],[0,26]];
const CN=['Alpha','Bravo','Charlie'];
const px=(c,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:.78,metalness:.04,...extra});

function enableShadows(g){g.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});}

function mkWal(sc){const g=new THREE.Group();
const ring=new THREE.Mesh(new THREE.TorusGeometry(.55,.035,6,24),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:.72}));ring.rotation.x=Math.PI/2;ring.position.y=.08;g.add(ring);
const b=new THREE.Mesh(new THREE.BoxGeometry(.58,.38,.38),px(0x7a421f,{roughness:.5}));b.position.set(0,.42,0);g.add(b);
const l=new THREE.Mesh(new THREE.BoxGeometry(.6,.11,.4),px(0xb9792d,{roughness:.45}));l.position.set(0,.63,0);g.add(l);
const k=new THREE.Mesh(new THREE.BoxGeometry(.1,.12,.045),px(0xffc928,{metalness:.65,roughness:.28}));k.position.set(0,.53,.21);g.add(k);
const glow=new THREE.PointLight(0xffb52e,1.1,5,2);glow.position.set(0,.7,0);g.add(glow);
enableShadows(g);sc.add(g);return g;}

function mkGroundTex(){
const cv=document.createElement('canvas');cv.width=256;cv.height=256;const ctx=cv.getContext('2d');
const grd=ctx.createLinearGradient(0,0,256,256);grd.addColorStop(0,'#6d9c48');grd.addColorStop(1,'#4f7d35');ctx.fillStyle=grd;ctx.fillRect(0,0,256,256);
for(let i=0;i<850;i++){const a=.12+Math.random()*.2;ctx.fillStyle=Math.random()>.5?`rgba(34,83,28,${a})`:`rgba(151,184,85,${a})`;const s=1+Math.random()*2;ctx.fillRect(Math.random()*256,Math.random()*256,s,s);}
const tex=new THREE.CanvasTexture(cv);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(10,10);tex.anisotropy=4;return tex;}

function mkWindowTex(){
const cv=document.createElement('canvas');cv.width=128;cv.height=128;const ctx=cv.getContext('2d');
ctx.fillStyle='#343a42';ctx.fillRect(0,0,128,128);
for(let r=0;r<3;r++)for(let c=0;c<3;c++){const lit=Math.random()>.42;ctx.fillStyle=lit?'#e7ba65':'#29384a';ctx.fillRect(8+c*41,8+r*41,30,29);ctx.fillStyle=lit?'rgba(255,244,190,.28)':'rgba(103,145,181,.12)';ctx.fillRect(11+c*41,11+r*41,24,8);}
const tex=new THREE.CanvasTexture(cv);tex.magFilter=THREE.NearestFilter;return tex;}

function buildWorld(sc,bx){
const grass=new THREE.Mesh(new THREE.BoxGeometry(CFG.MAP,.5,CFG.MAP),new THREE.MeshStandardMaterial({map:mkGroundTex(),roughness:1}));grass.position.set(0,-.25,0);grass.receiveShadow=true;sc.add(grass);
const dirt=new THREE.Mesh(new THREE.BoxGeometry(CFG.MAP+2,.55,CFG.MAP+2),px(0x624936));dirt.position.set(0,-.77,0);dirt.receiveShadow=true;sc.add(dirt);

// 主路、支路和道路标线，让地图从一块草坪变成有空间层次的小镇。
const roadMat=px(0x444a50,{roughness:.96});const curbMat=px(0xb6b2a8,{roughness:.9});
[[0,0,5.2,CFG.MAP],[0,0,CFG.MAP,5.2],[-16,0,3.3,CFG.MAP],[17,0,3.3,CFG.MAP]].forEach(([x,z,w,d])=>{const rd=new THREE.Mesh(new THREE.BoxGeometry(w,.08,d),roadMat);rd.position.set(x,.015,z);rd.receiveShadow=true;sc.add(rd);});
const onRoad=(x,z)=>Math.abs(x)<3.5||Math.abs(z)<3.5||Math.abs(x+16)<2.1||Math.abs(x-17)<2.1;
for(let q=-27;q<=27;q+=4){const mz=new THREE.Mesh(new THREE.BoxGeometry(.12,.015,1.7),px(0xe7d99e,{emissive:0x312a12}));mz.position.set(0,.065,q);sc.add(mz);const mx=new THREE.Mesh(new THREE.BoxGeometry(1.7,.015,.12),px(0xe7d99e,{emissive:0x312a12}));mx.position.set(q,.065,0);sc.add(mx);}
[-2.8,2.8].forEach(x=>{const c=new THREE.Mesh(new THREE.BoxGeometry(.18,.14,CFG.MAP),curbMat);c.position.set(x,.07,0);c.receiveShadow=true;sc.add(c);});
[-2.8,2.8].forEach(z=>{const c=new THREE.Mesh(new THREE.BoxGeometry(CFG.MAP,.14,.18),curbMat);c.position.set(0,.07,z);c.receiveShadow=true;sc.add(c);});

const BC=[0x8f8274,0x6d7e88,0xa08d78,0x7d7268,0x8b7568,0x687987,0x9a8e80,0x786f68];
const windowTex=mkWindowTex(),windowMat=new THREE.MeshBasicMaterial({map:windowTex,toneMapped:false});
BD.forEach(([x,z,w,h,d],i)=>{
const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),px(BC[i%BC.length]));m.position.set(x,h/2,z);m.castShadow=true;m.receiveShadow=true;sc.add(m);
const e=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:0x343434,transparent:true,opacity:.45}));e.position.set(x,h/2,z);sc.add(e);
const r=new THREE.Mesh(new THREE.BoxGeometry(w+.55,.3,d+.55),px(0x393d40,{roughness:.72}));r.position.set(x,h+.15,z);r.castShadow=true;sc.add(r);
const winH=Math.min(2.8,h*.55),winW=Math.min(3.8,w*.68);
const wf=new THREE.Mesh(new THREE.PlaneGeometry(winW,winH),windowMat);wf.position.set(x,h*.57,z-d/2-.011);wf.rotation.y=Math.PI;sc.add(wf);
const wb=wf.clone();wb.position.z=z+d/2+.011;wb.rotation.y=0;sc.add(wb);
const sideW=Math.min(3.2,d*.62);const wl=new THREE.Mesh(new THREE.PlaneGeometry(sideW,winH),windowMat);wl.position.set(x-w/2-.011,h*.57,z);wl.rotation.y=-Math.PI/2;sc.add(wl);
const wr=wl.clone();wr.position.x=x+w/2+.011;wr.rotation.y=Math.PI/2;sc.add(wr);
const door=new THREE.Mesh(new THREE.PlaneGeometry(.85,1.45),px(0x302923,{roughness:.62}));door.position.set(x-.2,.73,z-d/2-.02);door.rotation.y=Math.PI;sc.add(door);
const awning=new THREE.Mesh(new THREE.BoxGeometry(1.45,.12,.7),px(i%2?0x315d78:0x8c3538));awning.position.set(x-.2,1.55,z-d/2-.3);awning.castShadow=true;sc.add(awning);
if(i%3===0){const ac=new THREE.Mesh(new THREE.BoxGeometry(1,.55,.8),px(0x667078,{metalness:.25}));ac.position.set(x,h+.55,z);ac.castShadow=true;sc.add(ac);}
const p=.55;bx.push({x1:x-w/2-p,x2:x+w/2+p,z1:z-d/2-p,z2:z+d/2+p});});
for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,r=8+Math.random()*21,tx=Math.cos(a)*r,tz=Math.sin(a)*r;
if(!onRoad(tx,tz)&&!bx.some(b=>tx>b.x1-1&&tx<b.x2+1&&tz>b.z1-1&&tz<b.z2+1)){
const th=2.4+Math.random()*1.8;const tr=new THREE.Mesh(new THREE.CylinderGeometry(.18,.28,th,7),px(0x59391f));tr.position.set(tx,th/2,tz);tr.castShadow=true;sc.add(tr);
const lc=[0x2f6f31,0x3f8439,0x28622d];for(let j=0;j<3;j++){const lf=new THREE.Mesh(new THREE.ConeGeometry(1.2-j*.16,1.65,7),px(lc[j]));lf.position.set(tx,th+.15+j*.62,tz);lf.castShadow=true;sc.add(lf);}}}
for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2,r=11+Math.random()*12,lx=Math.cos(a)*r,lz=Math.sin(a)*r;
if(!bx.some(b=>lx>b.x1&&lx<b.x2&&lz>b.z1&&lz<b.z2)){
const st=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,3,8),px(0x252a2d,{metalness:.7,roughness:.4}));st.position.set(lx,1.5,lz);st.castShadow=true;sc.add(st);
const arm=new THREE.Mesh(new THREE.BoxGeometry(.65,.07,.07),px(0x252a2d,{metalness:.7}));arm.position.set(lx+.3,2.95,lz);sc.add(arm);
const fl=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshBasicMaterial({color:0xffd889}));fl.position.set(lx+.62,2.86,lz);sc.add(fl);
const pl=new THREE.PointLight(0xffc66d,.8,8,2);pl.position.copy(fl.position);sc.add(pl);}}
for(let i=0;i<16;i++){const x=(Math.random()-.5)*52,z=(Math.random()-.5)*52;if(!onRoad(x,z)&&!bx.some(b=>x>b.x1-1&&x<b.x2+1&&z>b.z1-1&&z<b.z2+1)){const crate=new THREE.Mesh(new THREE.BoxGeometry(.7,.7,.7),px(0x86572f));crate.position.set(x,.35,z);crate.rotation.y=Math.random()*Math.PI;crate.castShadow=true;crate.receiveShadow=true;sc.add(crate);}}
}

export default function Game({onMultiplayer}){
const[screen,setScreen]=useState("menu");const[info,setInfo]=useState({});const[hud,setHud]=useState({});const[err,setErr]=useState("");
const mountRef=useRef(null);const gRef=useRef(null);const frameRef=useRef(0);const knobRef=useRef(null);const mmRef=useRef(null);
const jtId=useRef(null),jcR=useRef({x:0,y:0});const ltId=useRef(null),llR=useRef({x:0,y:0});const keysR=useRef({});const needInit=useRef(false);

useEffect(()=>{if(screen==="play"&&!(gRef.current&&gRef.current.alive))needInit.current=true;},[screen]);
useEffect(()=>{let id;function ck(){if(needInit.current&&mountRef.current){needInit.current=false;try{initGame();}catch(e){setErr(""+e.message);setScreen("menu");}}id=requestAnimationFrame(ck);}id=requestAnimationFrame(ck);return()=>cancelAnimationFrame(id);},[]);

function initGame(){
if(frameRef.current)cancelAnimationFrame(frameRef.current);
if(gRef.current){gRef.current.alive=false;try{gRef.current.weapons?.dispose();gRef.current.ren.dispose();}catch(e){}}
const ct=mountRef.current;while(ct&&ct.firstChild)ct.removeChild(ct.firstChild);
const W=window.innerWidth,H=window.innerHeight;
const ren=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});ren.setSize(W,H);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
ren.shadowMap.enabled=true;ren.shadowMap.type=THREE.PCFSoftShadowMap;ren.toneMapping=THREE.ACESFilmicToneMapping;ren.toneMappingExposure=1.08;
if('outputEncoding' in ren)ren.outputEncoding=THREE.sRGBEncoding;ct.appendChild(ren.domElement);
const sc=new THREE.Scene();sc.fog=new THREE.FogExp2(0xa9cdec,.0095);
const skyGeo=new THREE.SphereGeometry(110,20,14);
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{topColor:{value:new THREE.Color(0x367cc2)},bottomColor:{value:new THREE.Color(0xe8d9bd)},offset:{value:12},exponent:{value:.72}},vertexShader:'varying vec3 vWorldPos; void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorldPos=wp.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;varying vec3 vWorldPos;void main(){float h=normalize(vWorldPos+offset).y;gl_FragColor=vec4(mix(bottomColor,topColor,pow(max(h,0.0),exponent)),1.0);}'});
sc.add(new THREE.Mesh(skyGeo,skyMat));
const cam=new THREE.PerspectiveCamera(65,W/H,.1,140);
sc.add(cam);
sc.add(new THREE.AmbientLight(0xb9c9dc,.38));const sun=new THREE.DirectionalLight(0xffe3b2,1.15);sun.position.set(24,38,18);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=34;sun.shadow.camera.bottom=-34;sun.shadow.camera.near=1;sun.shadow.camera.far=85;sun.shadow.bias=-.0015;sc.add(sun);
sc.add(new THREE.HemisphereLight(0x90c9ff,0x4d6d35,.48));
const bx=[];buildWorld(sc,bx);
const weapons=createFirstPersonWeapons(cam),pfx=createCombatFx(sc),audio=createGameAudio();

function inB(x,z){return bx.some(v=>x>v.x1&&x<v.x2&&z>v.z1&&z<v.z2);}
function rC(p){for(const b of bx){if(p.x>b.x1&&p.x<b.x2&&p.z>b.z1&&p.z<b.z2){const d=[p.x-b.x1,b.x2-p.x,p.z-b.z1,b.z2-p.z],n=Math.min(...d),i=d.indexOf(n);if(i===0)p.x=b.x1;else if(i===1)p.x=b.x2;else if(i===2)p.z=b.z1;else p.z=b.z2;}}const h=CFG.MAP/2-1;p.x=Math.max(-h,Math.min(h,p.x));p.z=Math.max(-h,Math.min(h,p.z));}
function fS(mr){const h=CFG.MAP/2-3;for(let i=0;i<100;i++){const x=(Math.random()-.5)*h*2,z=(Math.random()-.5)*h*2;if(!inB(x,z)&&(!mr||Math.sqrt(x*x+z*z)>mr))return{x,z};}return{x:2,z:2};}

const ais=[];for(let i=0;i<CFG.AI;i++){const s=fS(0);const m=mkClown(sc);m.position.set(s.x,0,s.z);ais.push({m,p:new THREE.Vector3(s.x,0,s.z),t:null,sp:1+Math.random()*1.2,w:Math.random()*3,a:true,beh:'wander',behT:2,lookDir:0,zigAmp:.3,zigFreq:3,phase:Math.random()*Math.PI*2,isReal:i<3,capProg:0,capTarget:null,chp:i<3?100:30,atkCop:null});}
const cops=[];for(let i=0;i<CFG.COPS;i++){const s=fS(12);const m=mkCop(sc);m.position.set(s.x,0,s.z);const wp=[];for(let j=0;j<4;j++){const q=fS(4);wp.push(new THREE.Vector3(q.x,0,q.z));}cops.push({m,p:new THREE.Vector3(s.x,0,s.z),r:0,hp:100,mhp:100,st:'patrol',wp,wi:0,cd:0,a:true,su:0,nm:CN[i],huntTarget:null,huntCD:0});}
const wals=[];WP.forEach(([wx,wz])=>{let x=wx,z=wz;if(inB(x,z)){const s=fS(4);x=s.x;z=s.z;}const m=mkWal(sc);m.position.set(x,0,z);wals.push({m,p:new THREE.Vector3(x,0,z),tk:false});});

const feed=[];function af(msg,col){feed.push({msg,col,t:4});if(feed.length>5)feed.shift();}
const G={sc,cam,ren,bx,ais,cops,wals,weapons,pfx,audio,pos:new THREE.Vector3(0,0,0),yaw:0,pitch:0,hp:100,mhp:100,role:'clown',wc:0,tm:CFG.TIME,rage:false,spr:false,col:null,cp:0,jx:0,jy:0,acd:0,al:'',at:0,clk:new THREE.Clock(),alive:true,fS,rC,af,feed,gameT:0,ammo:12,reserve:48,reloadT:0,reloadMax:1.35,hitFlash:0,shake:0,stepT:0};
gRef.current=G;G.clk.start();setErr("");

function pickWT(c){const o=wals.filter(w=>!w.tk);if(!o.length)return null;let b=null,bd=Infinity;o.forEach(w=>{const d=c.p.distanceTo(w.p);if(d<bd){bd=d;b=w;}});return b;}
function pickCT(c){const a=cops.filter(p=>p.a);if(!a.length)return null;let b=null,bd=Infinity;a.forEach(p=>{const d=c.p.distanceTo(p.p);if(d<bd){bd=d;b=p;}});return b;}

function uAI(c,dt){if(!c.a)return;c.behT-=dt;
if(c.isReal&&c.beh!=='steal'&&c.beh!=='capturing'&&c.beh!=='hunt_cop'&&c.behT<=0){const r=Math.random(),sc2=.15,ac=.10;if(r<sc2){const wt=pickWT(c);if(wt){c.beh='steal';c.behT=15;c.t=wt.p.clone();c.capTarget=wt;c.capProg=0;}}else if(r<sc2+ac){const ct2=pickCT(c);if(ct2){c.beh='hunt_cop';c.behT=10;c.atkCop=ct2;}}}
if(c.behT<=0&&c.beh!=='capturing'&&c.beh!=='hunt_cop'){const r=Math.random();if(r<.25){c.beh='idle';c.behT=1+Math.random()*3;c.t=null;}else if(r<.55){c.beh='wander';c.behT=2+Math.random()*4;const s2=fS(0);c.t=new THREE.Vector3(s2.x,0,s2.z);}else if(r<.75){c.beh='zigzag';c.behT=2+Math.random()*3;const s2=fS(0);c.t=new THREE.Vector3(s2.x,0,s2.z);c.zigAmp=Math.random()*.6+.2;c.zigFreq=2+Math.random()*4;}else{c.beh='lookaround';c.behT=1.5+Math.random()*2;c.lookDir=c.m.rotation.y+(Math.random()-.5)*Math.PI;c.t=null;}}
const now=G.gameT;
if(c.beh==='capturing'){if(!c.capTarget||c.capTarget.tk){c.beh='idle';c.behT=1;return;}c.capProg+=dt;aI(c.m,now+c.phase);if(c.capProg>=CFG.COL_T){c.capTarget.tk=true;c.capTarget.m.visible=false;G.wc++;c.capProg=0;c.capTarget=null;c.beh='idle';c.behT=1+Math.random()*2;af('💰 小丑占领钱包 ['+G.wc+'/'+CFG.WIN_W+']','#cc8800');G.al='⚠️ 钱包被占！';G.at=2;}return;}
if(c.beh==='steal'){if(!c.capTarget||c.capTarget.tk){c.beh='idle';c.behT=1;return;}if(c.p.distanceTo(c.capTarget.p)<1.8){c.beh='capturing';c.capProg=0;return;}const d=new THREE.Vector3().subVectors(c.capTarget.p,c.p).normalize();const pp=new THREE.Vector3(-d.z,0,d.x);d.x+=pp.x*Math.sin(now*2+c.phase)*.15;d.z+=pp.z*Math.sin(now*2+c.phase)*.15;d.normalize();const sp=c.sp*1.1,ox=c.p.x,oz=c.p.z;c.p.x+=d.x*sp*dt;c.p.z+=d.z*sp*dt;rC(c.p);if(Math.abs(c.p.x-ox)+Math.abs(c.p.z-oz)<.005){c.stuckT=(c.stuckT||0)+dt;if(c.stuckT>.8){c.beh='wander';c.behT=2;const s2=fS(0);c.t=new THREE.Vector3(s2.x,0,s2.z);c.stuckT=0;}}else c.stuckT=0;c.m.position.copy(c.p);c.m.rotation.y=Math.atan2(d.x,d.z);aW(c.m,now+c.phase,sp);return;}
if(c.beh==='hunt_cop'){if(!c.atkCop||!c.atkCop.a){c.beh='idle';c.behT=1;c.atkCop=null;return;}const dist=c.p.distanceTo(c.atkCop.p);if(dist<2){c.atkCop.hp=0;c.atkCop.a=false;c.atkCop.m.visible=false;af('🤡💀 小丑击杀 '+c.atkCop.nm+'！','#ff4757');G.al='💀 '+c.atkCop.nm+' 被击杀！';G.at=2;c.atkCop=null;c.beh='idle';c.behT=1+Math.random()*2;return;}const d=new THREE.Vector3().subVectors(c.atkCop.p,c.p).normalize();const pp=new THREE.Vector3(-d.z,0,d.x);d.x+=pp.x*Math.sin(now*1.8+c.phase)*.2;d.z+=pp.z*Math.sin(now*1.8+c.phase)*.2;d.normalize();const sp=c.sp*1.3,ox=c.p.x,oz=c.p.z;c.p.x+=d.x*sp*dt;c.p.z+=d.z*sp*dt;rC(c.p);if(Math.abs(c.p.x-ox)+Math.abs(c.p.z-oz)<.005){c.stuckT=(c.stuckT||0)+dt;if(c.stuckT>.8){c.beh='wander';c.behT=2;c.stuckT=0;}}else c.stuckT=0;c.m.position.copy(c.p);c.m.rotation.y=Math.atan2(d.x,d.z);aW(c.m,now+c.phase,sp);return;}
if(c.beh==='idle'){aI(c.m,now+c.phase);if(c.m.userData.head)c.m.userData.head.rotation.y=Math.sin(now*.7+c.phase)*.4;}
else if(c.beh==='lookaround'){c.m.rotation.y+=(c.lookDir-c.m.rotation.y)*2*dt;aI(c.m,now+c.phase);}
else if(c.beh==='wander'||c.beh==='zigzag'){if(!c.t||c.p.distanceTo(c.t)<1.5){c.beh='idle';c.behT=.5+Math.random();return;}const ox=c.p.x,oz=c.p.z,d=new THREE.Vector3().subVectors(c.t,c.p).normalize();let sp=G.rage?c.sp*1.5:c.sp;if(c.beh==='zigzag'){const pp=new THREE.Vector3(-d.z,0,d.x);d.x+=pp.x*Math.sin(now*c.zigFreq+c.phase)*c.zigAmp;d.z+=pp.z*Math.sin(now*c.zigFreq+c.phase)*c.zigAmp;d.normalize();}c.p.x+=d.x*sp*dt;c.p.z+=d.z*sp*dt;rC(c.p);if(Math.abs(c.p.x-ox)+Math.abs(c.p.z-oz)<.005){c.stuckT=(c.stuckT||0)+dt;if(c.stuckT>.5){const s2=fS(0);c.t=new THREE.Vector3(s2.x,0,s2.z);c.stuckT=0;c.beh='wander';c.behT=2+Math.random()*3;}}else c.stuckT=0;c.m.position.copy(c.p);c.m.rotation.y=Math.atan2(d.x,d.z);aW(c.m,now+c.phase,sp);}}

function drawMM(){const cv=mmRef.current;if(!cv)return;try{const ctx=cv.getContext('2d'),S=100,M=CFG.MAP,s=S/M;ctx.fillStyle='#7CB86B';ctx.fillRect(0,0,S,S);ctx.fillStyle='#888';BD.forEach(([x,z,w,,d])=>{ctx.fillRect((x-w/2+M/2)*s,(z-d/2+M/2)*s,w*s,d*s);});wals.forEach(w=>{const wx=(w.p.x+M/2)*s,wz=(w.p.z+M/2)*s;if(w.tk){ctx.fillStyle='rgba(218,165,32,.3)';ctx.fillRect(wx-3,wz-3,6,6);ctx.strokeStyle='#8B6914';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(wx-2,wz-2);ctx.lineTo(wx+2,wz+2);ctx.moveTo(wx+2,wz-2);ctx.lineTo(wx-2,wz+2);ctx.stroke();}else{ctx.fillStyle='#DAA520';ctx.fillRect(wx-3,wz-3,6,6);ctx.strokeStyle='#8B6914';ctx.lineWidth=1;ctx.strokeRect(wx-3,wz-3,6,6);}});const ppx=(G.pos.x+M/2)*s,pz=(G.pos.z+M/2)*s;ctx.fillStyle=G.role==='clown'?'#0c6':'#49d';ctx.fillRect(ppx-3,pz-3,6,6);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ppx,pz);ctx.lineTo(ppx-Math.sin(G.yaw)*9,pz-Math.cos(G.yaw)*9);ctx.stroke();}catch(e){}}

function tick(){if(!G.alive)return;frameRef.current=requestAnimationFrame(tick);const dt=Math.min(G.clk.getDelta(),.05);G.gameT=(G.gameT||0)+dt;
const k=keysR.current;if(jtId.current===null){G.jx=0;G.jy=0;if(k.a||k.arrowleft)G.jx=-1;if(k.d||k.arrowright)G.jx=1;if(k.w||k.arrowup)G.jy=-1;if(k.s||k.arrowdown)G.jy=1;}
const spd=G.spr?CFG.SPRINT:CFG.WALK,moving=!!(G.jx||G.jy);if(moving){const l=Math.min(Math.hypot(G.jx,G.jy),1),nx=G.jx/l,ny=-G.jy/l,sY=Math.sin(G.yaw),cY=Math.cos(G.yaw);G.pos.x+=(nx*cY-ny*sY)*spd*l*dt;G.pos.z+=(-nx*sY-ny*cY)*spd*l*dt;}
rC(G.pos);const bob=moving?Math.abs(Math.sin(G.gameT*(G.spr?12:8)))*(G.spr ? .045 : .025):0,shake=G.shake>0?(Math.random()-.5)*G.shake:0;
cam.position.set(G.pos.x+shake,1.6+bob+shake*.35,G.pos.z+shake);cam.rotation.order='YXZ';cam.rotation.y=G.yaw+shake*.025;cam.rotation.x=G.pitch+shake*.018;
const targetFov=G.spr&&moving?72:65;if(Math.abs(cam.fov-targetFov)>.02){cam.fov+=(targetFov-cam.fov)*Math.min(1,dt*7);cam.updateProjectionMatrix();}
G.acd=Math.max(0,G.acd-dt);G.tm-=dt;G.hitFlash=Math.max(0,G.hitFlash-dt*1.7);G.shake=Math.max(0,G.shake-dt*2.6);
if(G.reloadT>0){G.reloadT=Math.max(0,G.reloadT-dt);if(G.reloadT===0){const load=Math.min(12-G.ammo,G.reserve);G.ammo+=load;G.reserve-=load;G.al='✅ READY';G.at=.8;}}
G.stepT-=dt;if(moving&&G.stepT<=0){G.audio.step();G.stepT=G.spr ? .27 : .42;}
G.weapons.update(dt,{role:G.role,moving,sprinting:G.spr,time:G.gameT,reloading:G.reloadT>0});G.pfx.update(dt);
if(G.role==='clown'){if(G.col){if(G.pos.distanceTo(G.col.p)>2.5){G.col=null;G.cp=0;}else{G.cp+=dt;if(G.cp>=CFG.COL_T){G.col.tk=true;G.col.m.visible=false;G.wc++;G.pfx.pickup(G.col.p);G.audio.pickup();G.col=null;G.cp=0;G.hp=Math.min(CFG.MHP,G.hp+CFG.WHP);G.mhp=Math.max(G.mhp,G.hp);G.al='💰 +1！';G.at=2;af('💰 占领钱包 ['+G.wc+'/'+CFG.WIN_W+']','#cc8800');}}}else{for(const w of wals){if(!w.tk&&G.pos.distanceTo(w.p)<2){G.col=w;G.cp=0;break;}}}}
ais.forEach(c=>uAI(c,dt));
cops.forEach(p=>{if(!p.a)return;p.cd=Math.max(0,p.cd-dt);p.huntCD=(p.huntCD||0)-dt;
const fg=p.m.getObjectByName('fg');if(fg){const r2=p.hp/p.mhp;fg.scale.x=Math.max(.01,r2);fg.position.x=-(1-r2)*.35;}const bg=p.m.getObjectByName('bg');if(bg)bg.lookAt(cam.position);if(fg)fg.lookAt(cam.position);
const dist=p.p.distanceTo(G.pos),dirP=new THREE.Vector3().subVectors(G.pos,p.p).normalize(),fa=Math.atan2(dirP.x,dirP.z);let ad=fa-p.r;while(ad>Math.PI)ad-=Math.PI*2;while(ad<-Math.PI)ad+=Math.PI*2;const seeP=dist<CFG.PV&&Math.abs(ad)<CFG.PA/2;
if(G.role==='police'&&(p.st==='chase'||p.st==='sus'))p.st='patrol';
if(p.st==='patrol'&&p.huntCD<=0&&!p.huntTarget){p.huntCD=2+Math.random()*3;let bC=null,bD=Infinity;ais.forEach(c=>{if(!c.a)return;const cd=p.p.distanceTo(c.p);if(cd<CFG.PV*.9){const dc=new THREE.Vector3().subVectors(c.p,p.p).normalize(),fac=Math.atan2(dc.x,dc.z);let adc=fac-p.r;while(adc>Math.PI)adc-=Math.PI*2;while(adc<-Math.PI)adc+=Math.PI*2;if(Math.abs(adc)<CFG.PA/2&&cd<bD){bD=cd;bC=c;}}});if(bC){const iS=bC.isReal&&(bC.beh==='steal'||bC.beh==='capturing'||bC.beh==='hunt_cop');if(Math.random()<(iS?.7:.15)){p.huntTarget=bC;p.st='hunt_clown';}}}
if(p.st==='patrol'){if(G.role==='clown'&&seeP&&G.spr&&dist<CFG.PV*.8){p.st='chase';G.al='⚠️ 被发现！';G.at=2;af('⚠️ '+p.nm+' 发现你！','#e74c3c');}else if(G.role==='clown'&&seeP&&G.col&&dist<CFG.PV*.6){p.st='sus';p.su=2;}else{const wp=p.wp[p.wi];if(p.p.distanceTo(wp)<2)p.wi=(p.wi+1)%p.wp.length;const ox=p.p.x,oz=p.p.z,d2=new THREE.Vector3().subVectors(wp,p.p).normalize();p.p.x+=d2.x*CFG.PP*dt;p.p.z+=d2.z*CFG.PP*dt;p.r=Math.atan2(d2.x,d2.z);rC(p.p);if(Math.abs(p.p.x-ox)+Math.abs(p.p.z-oz)<.005){p.stk=(p.stk||0)+dt;if(p.stk>.5){p.wi=(p.wi+1)%p.wp.length;p.stk=0;}}else p.stk=0;aW(p.m,G.gameT,CFG.PP);}}
else if(p.st==='sus'){p.su-=dt;p.r+=(fa-p.r)*3*dt;if(seeP&&(G.spr||G.col)){p.st='chase';G.al='⚠️ 锁定！';G.at=2;}if(p.su<=0)p.st='patrol';aI(p.m,G.gameT);}
else if(p.st==='chase'){if(G.role==='police'){p.st='patrol';}else{const cd2=new THREE.Vector3().subVectors(G.pos,p.p).normalize();p.p.x+=cd2.x*CFG.PC*dt;p.p.z+=cd2.z*CFG.PC*dt;p.r=Math.atan2(cd2.x,cd2.z);if(dist<CFG.PSR&&p.cd<=0){G.hp-=CFG.PSD;p.cd=CFG.PSCD;G.hitFlash=1;G.shake=.22;G.audio.hurt();G.al='💥 击中！';G.at=1.5;af('🔫 '+p.nm+' 击中你','#e74c3c');}if(dist>CFG.PV*1.5)p.st='patrol';aW(p.m,G.gameT,CFG.PC);}}
else if(p.st==='hunt_clown'){if(!p.huntTarget||!p.huntTarget.a){p.huntTarget=null;p.st='patrol';}else{const ht=p.huntTarget,hD=p.p.distanceTo(ht.p),hDir=new THREE.Vector3().subVectors(ht.p,p.p).normalize();p.p.x+=hDir.x*CFG.PC*.9*dt;p.p.z+=hDir.z*CFG.PC*.9*dt;p.r=Math.atan2(hDir.x,hDir.z);if(hD<CFG.PSR&&p.cd<=0){p.cd=CFG.PSCD;if(ht.isReal){ht.chp=(ht.chp===undefined?100:ht.chp);ht.chp-=50;if(ht.chp<=0){ht.a=false;ht.m.visible=false;af('👮 '+p.nm+' 击杀真小丑！','#2ed573');}else af('👮 '+p.nm+' 命中目标','#ffa502');p.huntTarget=null;p.st='patrol';}else{ht.a=false;ht.m.visible=false;p.hp-=CFG.PMK;af('👮 '+p.nm+' 误杀AI [-'+CFG.PMK+']','#e74c3c');if(p.hp<=0){p.a=false;p.m.visible=false;af('💀 '+p.nm+' 误杀阵亡！','#ff4757');}p.huntTarget=null;p.st='patrol';}}if(hD>CFG.PV*1.8){p.huntTarget=null;p.st='patrol';}rC(p.p);aW(p.m,G.gameT,CFG.PC*.9);}}
rC(p.p);p.m.position.copy(p.p);p.m.rotation.y=p.r;});
wals.forEach(w=>{if(!w.tk){w.m.position.y=Math.sin(Date.now()*.002+w.p.x)*.08;w.m.rotation.y+=.008;}});
if(!G.rage&&G.tm<=CFG.RAGE_T){G.rage=true;G.al='⚡ 疯狂时刻！';G.at=3;af('⚡ 疯狂时刻！','#ff6b6b');for(let i=0;i<8;i++){const s2=fS(0);const m2=mkClown(sc);m2.position.set(s2.x,0,s2.z);ais.push({m:m2,p:new THREE.Vector3(s2.x,0,s2.z),t:null,sp:2.5+Math.random()*1.5,w:0,a:true,beh:'zigzag',behT:3+Math.random()*3,lookDir:0,zigAmp:.5,zigFreq:3+Math.random()*3,phase:Math.random()*Math.PI*2,isReal:i<3,capProg:0,capTarget:null,chp:i<3?100:30,atkCop:null});}}
if(G.at>0){G.at-=dt;if(G.at<=0)G.al='';}for(let i=feed.length-1;i>=0;i--){feed[i].t-=dt;if(feed[i].t<=0)feed.splice(i,1);}
if(G.role==='clown'){if(G.wc>=CFG.WIN_W){G.alive=false;setInfo({w:true,t:'🎉 CLOWN WIN',d:'占领5个钱包！'});setScreen('over');return;}if(cops.every(c=>!c.a)){G.alive=false;setInfo({w:true,t:'🎉 CLOWN WIN',d:'警察全灭！'});setScreen('over');return;}if(G.hp<=0){G.alive=false;af('💀 你被消灭了','#e74c3c');setScreen('switched');return;}}
else{if(G.wc>=CFG.WIN_W){G.alive=false;setInfo({w:false,t:'💀 DEFEAT',d:'钱包被占满！'});setScreen('over');return;}if(G.hp<=0){G.alive=false;setInfo({w:false,t:'💀 DEFEAT',d:'你阵亡了'});setScreen('over');return;}if(ais.filter(c=>c.isReal&&c.a).length===0){G.alive=false;setInfo({w:true,t:'🎉 POLICE WIN',d:'真小丑全灭！'});setScreen('over');return;}}
if(G.tm<=0){G.alive=false;setInfo(G.role==='clown'?{w:false,t:'💀 TIME UP',d:'失败'}:{w:true,t:'🎉 POLICE WIN',d:'守住了！'});setScreen('over');return;}
drawMM();const mn=Math.floor(Math.max(0,G.tm)/60),s2=Math.floor(Math.max(0,G.tm)%60);let st='🤡 潜行中';if(G.role==='police')st='👮 搜索中';else if(G.spr)st='💨 疾跑';else if(G.col)st='💰 占领中';
setHud({hp:G.hp,mhp:G.mhp,wc:G.wc,ac:ais.filter(c=>c.a).length,pc:cops.filter(c=>c.a).length,tm:mn+':'+String(s2).padStart(2,'0'),rl:G.role,st,spr:G.spr,al:G.al,cp:G.col?G.cp/CFG.COL_T:-1,fd:feed.map(f=>({msg:f.msg,col:f.col,t:f.t})),ammo:G.ammo,reserve:G.reserve,reload:G.reloadT>0,hitFlash:G.hitFlash});ren.render(sc,cam);}
G.tick=tick;frameRef.current=requestAnimationFrame(tick);}

function doSwitch(){const G=gRef.current;if(!G)return;G.audio.unlock();G.role='police';const s=G.fS(8);G.pos.set(s.x,0,s.z);G.hp=50;G.mhp=100;G.col=null;G.cp=0;G.ammo=12;G.reserve=48;G.reloadT=0;G.al='👮 RESPAWN';G.at=3;G.jx=0;G.jy=0;G.spr=false;jtId.current=null;ltId.current=null;if(knobRef.current)knobRef.current.style.transform='translate(0,0)';G.alive=true;G.clk.getDelta();G.clk.start();G.af('🔄 变成警察！','#3498db');setScreen('play');frameRef.current=requestAnimationFrame(G.tick);}

function startReload(){const G=gRef.current;if(!G||!G.alive||G.role!=='police'||G.reloadT>0||G.ammo>=12||G.reserve<=0)return;G.audio.unlock();G.audio.reload();G.reloadT=G.reloadMax;G.al='↻ RELOADING';G.at=G.reloadMax;G.af('↻ 换弹中...','#74b9ff');}

function doAtk(){const G=gRef.current;if(!G||G.acd>0||!G.alive)return;G.audio.unlock();
if(G.role==='clown'){G.acd=CFG.ACD;G.weapons.fire('clown');G.audio.slash();let n=null,md=CFG.AR;G.cops.forEach(p=>{if(!p.a)return;const d=G.pos.distanceTo(p.p);if(d<md){md=d;n=p;}});if(n){n.hp=0;n.a=false;n.m.visible=false;G.pfx.hit(n.p);G.audio.hit();G.shake=.1;G.al='💀 ONE HIT!';G.at=2;G.af('💀 击杀 '+n.nm+'！','#2ed573');G.cops.forEach(p=>{if(p.a&&p.p.distanceTo(G.pos)<14)p.st='chase';});}else{G.al='⚔️ MISS';G.at=1;}}
else{if(G.reloadT>0)return;if(G.ammo<=0){G.audio.empty();startReload();return;}G.acd=CFG.ACD;G.ammo--;G.weapons.fire('police');G.audio.shoot();G.shake=.09;const dir=new THREE.Vector3();G.cam.getWorldDirection(dir);let hit=null,hd2=Infinity;G.ais.forEach(c=>{if(!c.a)return;const d=G.pos.distanceTo(c.p);if(d<CFG.PSR&&d<hd2){const tc=new THREE.Vector3().subVectors(c.p,G.pos).normalize();if(tc.dot(dir)>.82){hit=c;hd2=d;}}});if(hit){G.pfx.hit(hit.p);G.audio.hit();if(hit.isReal){hit.chp=(hit.chp===undefined?100:hit.chp);hit.chp-=50;if(hit.chp<=0){hit.a=false;hit.m.visible=false;G.al='✅ KILLED!';G.at=2;G.af('✅ 击杀真小丑！','#2ed573');}else{G.al='🔫 HIT!';G.at=1.5;G.af('🔫 命中 [-50HP]','#ffa502');}}else{hit.a=false;hit.m.visible=false;G.hp-=CFG.PMK;G.hitFlash=.55;G.al='❌ FRIENDLY -'+CFG.PMK;G.at=2;G.af('❌ 误杀AI [-'+CFG.PMK+']','#e74c3c');}}else{G.pfx.miss(G.pos.clone().add(dir.multiplyScalar(7)).add(new THREE.Vector3(0,1.2,0)));G.al='🔫 MISS';G.at=1;}if(G.ammo===0&&G.reserve>0)setTimeout(startReload,220);}}

useEffect(()=>{const kd=e=>{const key=e.key.toLowerCase();keysR.current[key]=true;if(e.key===' ')doAtk();if(key==='r')startReload();};const ku=e=>{keysR.current[e.key.toLowerCase()]=false;};window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);return()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);};},[]);
useEffect(()=>{let d=false,lx=0,ly=0;const md=e=>{d=true;lx=e.clientX;ly=e.clientY;};const mm=e=>{if(d&&gRef.current){gRef.current.yaw-=(e.clientX-lx)*CFG.SENS;gRef.current.pitch=Math.max(-1,Math.min(1,gRef.current.pitch-(e.clientY-ly)*CFG.SENS));lx=e.clientX;ly=e.clientY;}};const mu=()=>{d=false;};window.addEventListener('mousedown',md);window.addEventListener('mousemove',mm);window.addEventListener('mouseup',mu);return()=>{window.removeEventListener('mousedown',md);window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',mu);};},[]);
useEffect(()=>{const fn=()=>{const G=gRef.current;if(G&&G.ren){G.cam.aspect=innerWidth/innerHeight;G.cam.updateProjectionMatrix();G.ren.setSize(innerWidth,innerHeight);}};window.addEventListener('resize',fn);return()=>window.removeEventListener('resize',fn);},[]);

const onJS=e=>{e.preventDefault();if(jtId.current!==null)return;const t=e.changedTouches[0];jtId.current=t.identifier;const b=e.currentTarget.querySelector('[data-jb]');if(b){const r=b.getBoundingClientRect();jcR.current={x:r.left+r.width/2,y:r.top+r.height/2};}};
const onJM=e=>{e.preventDefault();const G=gRef.current;if(!G)return;for(const t of e.changedTouches){if(t.identifier===jtId.current){let dx=t.clientX-jcR.current.x,dy=t.clientY-jcR.current.y;const ds=Math.hypot(dx,dy),M=36;if(ds>M){dx=dx/ds*M;dy=dy/ds*M;}if(knobRef.current)knobRef.current.style.transform=`translate(${dx}px,${dy}px)`;G.jx=dx/M;G.jy=dy/M;}}};
const onJE=e=>{for(const t of e.changedTouches){if(t.identifier===jtId.current){jtId.current=null;if(knobRef.current)knobRef.current.style.transform='translate(0,0)';if(gRef.current){gRef.current.jx=0;gRef.current.jy=0;}}}};
const onLS=e=>{e.preventDefault();if(ltId.current!==null)return;const t=e.changedTouches[0];ltId.current=t.identifier;llR.current={x:t.clientX,y:t.clientY};};
const onLM=e=>{e.preventDefault();const G=gRef.current;if(!G)return;for(const t of e.changedTouches){if(t.identifier===ltId.current){G.yaw-=(t.clientX-llR.current.x)*CFG.SENS;G.pitch=Math.max(-1,Math.min(1,G.pitch-(t.clientY-llR.current.y)*CFG.SENS));llR.current={x:t.clientX,y:t.clientY};}}};
const onLE=e=>{for(const t of e.changedTouches){if(t.identifier===ltId.current)ltId.current=null;}};

const bxS={background:'rgba(0,0,0,.5)',padding:'4px 8px',color:'#fff',fontSize:10,border:'2px solid rgba(255,255,255,.15)'};
const ov={position:'absolute',inset:0,background:'rgba(0,0,0,.92)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:300,color:'#fff',textAlign:'center',padding:20};
const mcB={padding:'14px 36px',borderRadius:0,border:'3px solid #555',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Courier New',monospace",color:'#fff',letterSpacing:1,width:220,textAlign:'center'};
const pl=screen==='play',h=hud;

return(
<div style={{width:'100vw',height:'100dvh',position:'relative',background:'#000',overflow:'hidden',touchAction:'none',userSelect:'none',WebkitUserSelect:'none',fontFamily:"'Courier New','Monaco',monospace"}}>
<div ref={mountRef} style={{position:'absolute',inset:0,zIndex:0}}/>
{err&&<div style={{position:'absolute',top:80,left:'50%',transform:'translateX(-50%)',background:'#c00',color:'#fff',padding:'8px 16px',zIndex:999,fontSize:12,border:'2px solid #f44'}}>{err}</div>}

{pl&&h.rl&&<>
{h.hitFlash>0&&<div style={{position:'absolute',inset:0,zIndex:9,pointerEvents:'none',background:`radial-gradient(ellipse at center,transparent 45%,rgba(210,18,8,${Math.min(.58,h.hitFlash*.52)}) 100%)`}}/>}
<div style={{position:'absolute',top:0,left:0,right:0,padding:'6px 8px',display:'flex',justifyContent:'space-between',zIndex:10,pointerEvents:'none'}}>
<div style={bxS}><div style={{color:'#aaa',fontSize:8}}>HP</div><div style={{width:65,height:4,background:'#333',marginTop:1}}><div style={{height:'100%',width:Math.max(0,(h.hp/h.mhp)*100)+'%',background:h.rl==='clown'?'#f44':'#48f'}}/></div><div style={{fontSize:9,fontWeight:700,marginTop:2,color:h.rl==='clown'?'#4f4':'#8cf'}}>{h.st}</div></div>
<div style={{...bxS,textAlign:'center',minWidth:44}}><div style={{color:'#aaa',fontSize:8}}>TIME</div><div style={{fontWeight:700,fontSize:14,color:'#ff8'}}>{h.tm}</div></div>
<div style={{...bxS,textAlign:'right'}}><div style={{color:'#aaa',fontSize:8}}>WALLET</div><div style={{fontWeight:700,fontSize:14,color:'#fa0'}}>{h.wc}/5</div><div style={{fontSize:8,color:'#888',marginTop:1}}>🤡{h.ac} 👮{h.pc}</div></div>
</div>
<div style={{position:'absolute',top:36,left:'50%',transform:'translateX(-50%)',zIndex:10,pointerEvents:'none',padding:'1px 10px',border:'2px solid '+(h.rl==='clown'?'#f44':'#48f'),background:'rgba(0,0,0,.6)',fontSize:10,fontWeight:700,color:'#fff'}}>{h.rl==='clown'?'🤡 CLOWN':'👮 POLICE'}</div>
{h.al&&<div style={{position:'absolute',top:54,left:'50%',transform:'translateX(-50%)',background:'rgba(200,0,0,.85)',color:'#fff',padding:'3px 12px',border:'2px solid #f44',fontSize:10,fontWeight:700,zIndex:30,pointerEvents:'none',whiteSpace:'nowrap'}}>{h.al}</div>}
{h.fd&&h.fd.length>0&&<div style={{position:'absolute',top:72,left:8,zIndex:12,pointerEvents:'none',display:'flex',flexDirection:'column',gap:2}}>{h.fd.map((f,i)=><div key={i} style={{background:'rgba(0,0,0,.6)',padding:'2px 6px',fontSize:9,fontWeight:600,color:f.col,borderLeft:'3px solid '+f.col,opacity:Math.min(1,f.t),whiteSpace:'nowrap',maxWidth:200,overflow:'hidden'}}>{f.msg}</div>)}</div>}
<div style={{position:'absolute',top:72,right:6,zIndex:12,pointerEvents:'none'}}>
<div style={{background:'rgba(0,0,0,.5)',padding:'3px 5px',border:'2px solid rgba(255,255,255,.1)'}}><div style={{fontSize:7,color:'#aaa',marginBottom:2}}>PROGRESS</div><div style={{display:'flex',gap:2}}>{[0,1,2,3,4].map(i=><div key={i} style={{width:12,height:12,background:i<(h.wc||0)?'#fa0':'#333',border:'1px solid '+(i<(h.wc||0)?'#fa0':'#555'),fontSize:8,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>{i<(h.wc||0)?'✓':''}</div>)}</div></div>
<div style={{marginTop:3,background:'rgba(0,0,0,.5)',padding:2,border:'2px solid rgba(255,255,255,.1)'}}><canvas ref={mmRef} width={100} height={100} style={{width:100,height:100,display:'block',imageRendering:'pixelated'}}/><div style={{display:'flex',justifyContent:'center',gap:4,marginTop:2,fontSize:6,color:'#aaa'}}><span style={{color:'#0c6'}}>■YOU</span><span style={{color:'#da5'}}>■WAL</span></div></div>
</div>
<div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:10,pointerEvents:'none',width:18,height:18}}><div style={{width:2,height:18,background:'rgba(255,255,255,.5)',position:'absolute',left:8}}/><div style={{width:18,height:2,background:'rgba(255,255,255,.5)',position:'absolute',top:8}}/></div>
{h.cp>=0&&<div style={{position:'absolute',bottom:190,left:'50%',transform:'translateX(-50%)',width:130,zIndex:10,pointerEvents:'none',textAlign:'center'}}><div style={{color:'#ff8',fontSize:9,marginBottom:2}}>CAPTURING...</div><div style={{width:'100%',height:5,background:'#333',border:'1px solid #555'}}><div style={{height:'100%',background:'#fa0',width:Math.min(100,h.cp*100)+'%'}}/></div></div>}
<div style={{position:'absolute',bottom:0,left:0,width:'42%',height:195,zIndex:20}} onTouchStart={onJS} onTouchMove={onJM} onTouchEnd={onJE} onTouchCancel={onJE}><div data-jb="1" style={{position:'absolute',width:88,height:88,borderRadius:'50%',background:'rgba(255,255,255,.05)',border:'2px solid rgba(255,255,255,.12)',bottom:34,left:24}}><div ref={knobRef} style={{width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,.15)',border:'2px solid rgba(255,255,255,.2)',position:'absolute',top:'50%',left:'50%',marginTop:-17,marginLeft:-17}}/></div></div>
<div style={{position:'absolute',top:70,bottom:0,right:0,width:'58%',zIndex:15}} onTouchStart={onLS} onTouchMove={onLM} onTouchEnd={onLE} onTouchCancel={onLE}/>
{h.rl==='police'&&<button onClick={startReload} style={{position:'absolute',bottom:145,right:10,zIndex:26,width:50,padding:'5px 2px',border:'1px solid '+(h.reload?'#fa0':'rgba(255,255,255,.25)'),background:'rgba(5,10,16,.72)',color:h.reload?'#fa0':'#fff',fontFamily:'inherit',fontWeight:800,fontSize:11,cursor:'pointer'}}>{h.reload?'↻ LOAD':<><span style={{fontSize:17}}>{h.ammo}</span><span style={{color:'#84909b'}}>/{h.reserve}</span><br/><span style={{fontSize:7,color:'#9eb6ca'}}>R RELOAD</span></>}</button>}
<div style={{position:'absolute',bottom:24,right:10,zIndex:25,display:'flex',flexDirection:'column',gap:10}}>
<button style={{width:50,height:50,border:'2px solid '+(h.spr?'#fa0':'rgba(255,255,255,.15)'),background:h.spr?'rgba(255,165,0,.2)':'rgba(0,0,0,.3)',color:'#fff',fontSize:8,fontWeight:700,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'inherit'}} onTouchStart={e=>{e.preventDefault();e.stopPropagation();if(gRef.current)gRef.current.spr=!gRef.current.spr;}} onClick={()=>{if(gRef.current)gRef.current.spr=!gRef.current.spr;}}><span style={{fontSize:16}}>💨</span><span>RUN</span></button>
<button style={{width:50,height:50,border:'2px solid rgba(255,255,255,.15)',background:'rgba(0,0,0,.3)',color:'#fff',fontSize:8,fontWeight:700,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'inherit'}} onTouchStart={e=>{e.preventDefault();e.stopPropagation();doAtk();}} onClick={doAtk}><span style={{fontSize:16}}>{h.rl==='clown'?'⚔️':'🔫'}</span><span>{h.rl==='clown'?'ATK':'FIRE'}</span></button>
</div>
</>}

{screen==='menu'&&<div style={ov}>
<div style={{fontSize:12,color:'#555',letterSpacing:3,marginBottom:8}}>⬛⬛⬛ BLOCK WORLD ⬛⬛⬛</div>
<div style={{fontSize:48,marginBottom:4}}>🤡</div>
<h1 style={{fontSize:28,fontWeight:900,color:'#f44',letterSpacing:2,marginBottom:2,textShadow:'2px 2px 0 #800'}}>WHO IS THE</h1>
<h1 style={{fontSize:32,fontWeight:900,color:'#fa0',letterSpacing:3,marginBottom:12,textShadow:'2px 2px 0 #850'}}>CLOWN?</h1>
<p style={{color:'#888',fontSize:11,lineHeight:1.6,marginBottom:20,maxWidth:260}}>🎮 左摇杆移动 · 右侧滑动转视角<br/>🤡 小丑一击必杀 · 💀 被杀变警察<br/>⏰ 4分钟 · 最后1分钟疯狂时刻</p>
<div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'center'}}>
<button style={{...mcB,background:'linear-gradient(180deg,#4a4,#383)'}} onClick={()=>setScreen('play')} onTouchEnd={e=>{e.preventDefault();setScreen('play');}}>▶ 单人模式</button>
<button style={{...mcB,background:'linear-gradient(180deg,#48f,#36c)'}} onClick={()=>onMultiplayer&&onMultiplayer()} onTouchEnd={e=>{e.preventDefault();onMultiplayer&&onMultiplayer();}}>🌐 多人模式</button>
</div>
<div style={{marginTop:16,fontSize:9,color:'#444'}}>v0.2 · Pixel Edition</div>
</div>}

{screen==='switched'&&<div style={ov}>
<div style={{fontSize:48,marginBottom:6}}>💀</div>
<h2 style={{fontSize:22,fontWeight:900,color:'#f44',letterSpacing:2,marginBottom:4}}>YOU DIED!</h2>
<p style={{color:'#888',fontSize:11,lineHeight:1.6,marginBottom:14,maxWidth:240}}>重生为警察继续战斗<br/>找出真小丑 · ⚠️ 误杀AI扣血</p>
<button style={{...mcB,background:'linear-gradient(180deg,#48f,#36c)'}} onClick={doSwitch} onTouchEnd={e=>{e.preventDefault();doSwitch();}}>👮 RESPAWN AS POLICE</button>
</div>}

{screen==='over'&&<div style={ov}>
<div style={{fontSize:48,marginBottom:6}}>{info.w?'🏆':'💀'}</div>
<h1 style={{fontSize:22,fontWeight:900,color:info.w?'#4f4':'#f44',letterSpacing:2,marginBottom:4}}>{info.t}</h1>
<p style={{color:'#888',fontSize:11,marginBottom:14}}>{info.d}</p>
<button style={{...mcB,background:'linear-gradient(180deg,#4a4,#383)'}} onClick={()=>setScreen('play')} onTouchEnd={e=>{e.preventDefault();setScreen('play');}}>🔄 PLAY AGAIN</button>
<button style={{...mcB,background:'linear-gradient(180deg,#555,#444)',marginTop:8}} onClick={()=>setScreen('menu')} onTouchEnd={e=>{e.preventDefault();setScreen('menu');}}>🏠 MENU</button>
</div>}
</div>);
}
