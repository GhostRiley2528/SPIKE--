/**
 * SPIKE! Volleyball — Server (1v1 + 2v2 online)
 * npm install && node server.js
 */
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const PORT=3000;

const httpServer=http.createServer((req,res)=>{
  fs.readFile(path.join(__dirname,'index.html'),(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':'text/html'});res.end(data);
  });
});

const rooms=new Map();
function makeCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)];return rooms.has(s)?makeCode():s;}
function bcast(room,msg){const d=JSON.stringify(msg);room.conns.forEach(ws=>ws&&ws.readyState===1&&ws.send(d));}
function wsend(ws,msg){ws&&ws.readyState===1&&ws.send(JSON.stringify(msg));}

const G=0.52,BR=13,FP=28,NW=10,NHF=0.28,PW=16,PH=56,PS=5.2,JV=-14;
const WW=800,WH=500,FL=WH-FP,NX=WW/2,NT=FL-WH*NHF;
const HR=BR+PW*4.5,BLOCK_R=BR+PW*5.0;
const START_X=[WW*0.20,WW*0.08,WW*0.72,WW*0.86];
function minX(s){return s<2?0:NX+NW/2+2;}
function maxX(s){return s<2?NX-NW/2-2:WW;}
function slotSide(s){return s<2?0:1;}

function makeState(mode){
  const n=mode==='2v2'?4:2,players=[];
  for(let i=0;i<n;i++)players.push({x:START_X[i],y:FL-PH,vy:0,onGround:true,keys:{},blocking:false});
  return{mode,phase:'waiting',serving:0,score:[0,0],sets:[0,0],
    sideHits:[0,0],lastHitSide:-1,rallyHits:0,longestRally:0,
    stats:{spikes:[0,0],blocks:[0,0],aces:[0,0]},
    players,ball:{x:NX-WW*0.22,y:FL-110,vx:0,vy:0,spin:0}};
}

function resetState(s){
  s.players.forEach((p,i)=>{p.x=START_X[i];p.y=FL-PH;p.vy=0;p.onGround=true;p.blocking=false;});
  const side=slotSide(s.serving);
  s.ball={x:side===0?NX-WW*0.22:NX+WW*0.22,y:FL-110,vx:0,vy:0,spin:0};
  s.sideHits=[0,0];s.lastHitSide=-1;s.rallyHits=0;
}

function gravStep(p,slot){
  p.vy+=G;p.y+=p.vy;
  if(p.y+PH>=FL){p.y=FL-PH;p.vy=0;p.onGround=true;}
  p.x=Math.max(minX(slot),Math.min(maxX(slot)-PW,p.x));
}

function tickRoom(room){
  const s=room.state;if(s.phase!=='playing')return;
  const b=s.ball;
  s.players.forEach((p,i)=>{
    const k=p.keys;
    if(k.left)p.x-=PS;if(k.right)p.x+=PS;
    if(k.jump&&p.onGround){p.vy=JV;p.onGround=false;}
    gravStep(p,i);
  });
  b.vy+=G;b.x+=b.vx;b.y+=b.vy;
  b.spin+=b.vx*0.05;b.vx*=0.996;
  if(b.x-BR<0){b.x=BR;b.vx=Math.abs(b.vx)*0.75;}
  if(b.x+BR>WW){b.x=WW-BR;b.vx=-Math.abs(b.vx)*0.75;}
  if(b.y-BR<0){b.y=BR;b.vy=Math.abs(b.vy)*0.65;}
  // net
  if(b.x+BR>NX-NW/2&&b.x-BR<NX+NW/2&&b.y+BR>NT){
    b.vx=b.vx>0?-Math.abs(b.vx)*0.55:Math.abs(b.vx)*0.55;
    b.x=b.vx<0?NX-NW/2-BR:NX+NW/2+BR;b.vy*=0.65;
  }
  if(b.y+BR>=FL){
    s.longestRally=Math.max(s.longestRally,s.rallyHits);
    awardPoint(room,b.x<NX?0:1);return;
  }
  // passive push
  s.players.forEach(p=>{
    const cx=p.x+PW/2,cy=p.y,dx=b.x-cx,dy=b.y-cy;
    const dist=Math.sqrt(dx*dx+dy*dy),md=BR+PW*0.85;
    if(dist<md&&dist>0){const nx=dx/dist,ny=dy/dist;b.x=cx+nx*(md+1);b.y=cy+ny*(md+1);b.vx+=nx*1.2;b.vy+=ny*1.2;}
  });
  // block check
  s.players.forEach((p,i)=>{
    if(!p.blocking||p.onGround)return;
    const side=slotSide(i);
    const cx=p.x+PW/2,cy=p.y;
    const dist=Math.sqrt((b.x-cx)**2+(b.y-cy)**2);
    if(dist<BLOCK_R){
      // Deflect straight back
      b.vx*=-0.9;b.vy=Math.min(b.vy,-4);
      b.x=cx+(b.x-cx)/dist*(BLOCK_R+1);
      b.y=cy+(b.y-cy)/dist*(BLOCK_R+1);
      s.stats.blocks[side]++;
      bcast(room,{type:'blocked',side,sideHits:s.sideHits});
    }
  });
}

function handleSkill(room,slotIdx,power,skillType){
  const s=room.state;if(s.phase!=='playing')return;
  const p=s.players[slotIdx];if(!p)return;
  const side=slotSide(slotIdx),b=s.ball;
  if(side===0?b.x>=NX:b.x<NX)return;
  const cx=p.x+PW/2,cy=p.y;
  const dist=Math.sqrt((b.x-cx)**2+(b.y-cy)**2);
  if(dist>HR)return;
  const hitN=s.sideHits[side];
  if(hitN>=3){awardPoint(room,side);return;}
  if(skillType==='spike'&&p.onGround)return;
  if(s.lastHitSide>=0&&s.lastHitSide!==side)s.sideHits[1-side]=0;
  s.sideHits[side]++;s.lastHitSide=side;s.rallyHits++;
  const spMult=Math.min(1.65,1+s.rallyHits*0.055);
  const pwr=Math.max(0.3,Math.min(1.0,power));
  const ddx=b.x-cx,ddy=b.y-cy,dl=Math.max(1,Math.sqrt(ddx*ddx+ddy*ddy));
  const ndx=ddx/dl,ndy=ddy/dl,md=BR+PW*1.1;
  if(skillType==='bump'){
    const drift=(side===0?1:-1)*(0.8+pwr*1.2);
    b.vx=drift*spMult;b.vy=-(12+pwr*6)*spMult;
  } else if(skillType==='set'){
    const st=side===0?NX-(60-pwr*40):NX+(60-pwr*40);
    const sdx=st-b.x;
    b.vx=(sdx/Math.max(1,Math.abs(sdx)))*(2.5+pwr*2)*spMult;
    b.vy=-(14+pwr*5)*spMult;
  } else if(skillType==='tip'){
    // Soft tip just over net
    const dir=side===0?1:-1;
    b.vx=dir*(3+pwr*2);b.vy=-(6+pwr*3);
  } else {
    const dir=side===0?1:-1,spd=(8+pwr*7)*spMult;
    b.vx=dir*spd*0.9;b.vy=-spd*0.22;
    s.stats.spikes[side]++;
  }
  b.x=cx+ndx*(md+1);b.y=cy+ndy*(md+1);
  bcast(room,{type:'hit',hitType:skillType,side,sideHits:s.sideHits,power:pwr,rallyHits:s.rallyHits});
}

function handleBlock(room,slotIdx,isBlocking){
  const s=room.state;if(s.phase!=='playing')return;
  const p=s.players[slotIdx];if(!p)return;
  p.blocking=isBlocking;
}

function awardPoint(room,losingSide){
  const s=room.state;if(s.phase!=='playing')return;
  s.phase='point';
  const win=1-losingSide;
  s.score[win]++;s.sideHits=[0,0];s.lastHitSide=-1;
  if(s.rallyHits===0)s.stats.aces[win]++;
  s.longestRally=Math.max(s.longestRally,s.rallyHits);
  s.rallyHits=0;
  let msg='',over=false;
  const names=s.mode==='2v2'?['TEAM A','TEAM B']:['P1','P2'];
  if(s.score[0]>=7&&s.score[0]-s.score[1]>=2){
    s.sets[0]++;s.score[0]=0;s.score[1]=0;s.serving=s.mode==='2v2'?2:1;
    over=s.sets[0]>=2;msg=over?`${names[0]} WINS!`:`SET — ${names[0]}!`;
  } else if(s.score[1]>=7&&s.score[1]-s.score[0]>=2){
    s.sets[1]++;s.score[0]=0;s.score[1]=0;s.serving=0;
    over=s.sets[1]>=2;msg=over?`${names[1]} WINS!`:`SET — ${names[1]}!`;
  } else {
    s.serving=win===0?0:(s.mode==='2v2'?2:1);msg=`${names[win]} POINT!`;
  }
  bcast(room,{type:'point',win,msg,score:s.score,sets:s.sets,over,serving:s.serving,
    stats:over?s.stats:null,longestRally:over?s.longestRally:null});
  if(over){s.phase='gameover';return;}
  setTimeout(()=>{resetState(s);s.phase='waiting';bcast(room,{type:'waiting',serving:s.serving});},1600);
}

setInterval(()=>{
  for(const[,room] of rooms){
    const needed=room.state.mode==='2v2'?4:2;
    const filled=room.conns.filter(Boolean).length;
    if(filled===needed&&room.state.phase==='playing'){
      tickRoom(room);
      bcast(room,{type:'state',
        players:room.state.players.map(p=>({x:p.x,y:p.y,onGround:p.onGround,blocking:p.blocking})),
        ball:room.state.ball,sideHits:room.state.sideHits,rallyHits:room.state.rallyHits});
    }
  }
},16);

const wss=new WebSocketServer({server:httpServer});
wss.on('connection',ws=>{
  let code=null,slot=null;
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw);}catch{return;}
    if(m.type==='create'){
      const mode=m.mode==='2v2'?'2v2':'1v1',needed=mode==='2v2'?4:2;
      code=makeCode();const conns=new Array(needed).fill(null);conns[0]=ws;
      rooms.set(code,{conns,state:makeState(mode)});slot=0;
      wsend(ws,{type:'created',code,slot:0,mode,needed});
    }
    else if(m.type==='join'){
      const c=(m.code||'').toUpperCase().trim(),room=rooms.get(c);
      if(!room){wsend(ws,{type:'error',msg:'Room not found'});return;}
      const idx=room.conns.findIndex(x=>x===null);
      if(idx===-1){wsend(ws,{type:'error',msg:'Room is full'});return;}
      room.conns[idx]=ws;code=c;slot=idx;
      wsend(ws,{type:'joined',slot:idx,mode:room.state.mode,needed:room.conns.length});
      const filled=room.conns.filter(Boolean).length;
      bcast(room,{type:'lobby',filled,needed:room.conns.length});
      if(filled===room.conns.length)bcast(room,{type:'start',serving:room.state.serving,mode:room.state.mode});
    }
    else if(m.type==='serve'){
      const room=rooms.get(code);
      if(!room||room.state.phase!=='waiting'||slot!==room.state.serving)return;
      room.state.phase='playing';room.state.ball.vx=0;room.state.ball.vy=-(11+Math.random()*2);
      bcast(room,{type:'served'});
    }
    else if(m.type==='keys'){const room=rooms.get(code);if(!room||slot===null)return;room.state.players[slot].keys=m.keys;}
    else if(m.type==='skill'){const room=rooms.get(code);if(!room||slot===null)return;handleSkill(room,slot,m.power,m.skill);}
    else if(m.type==='block'){const room=rooms.get(code);if(!room||slot===null)return;handleBlock(room,slot,m.blocking);}
    else if(m.type==='rematch'){
      const room=rooms.get(code);if(!room)return;
      room.state=makeState(room.state.mode);
      bcast(room,{type:'start',serving:room.state.serving,mode:room.state.mode});
    }
  });
  ws.on('close',()=>{
    if(!code)return;const room=rooms.get(code);if(!room)return;
    room.conns[slot]=null;
    if(room.conns.every(x=>!x)){rooms.delete(code);return;}
    bcast(room,{type:'disconnect'});room.state.phase='gameover';
  });
});

httpServer.listen(PORT,()=>console.log(`\n  🏐  SPIKE! Server → http://localhost:${PORT}\n`));
