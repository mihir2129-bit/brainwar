import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Users, Play, ArrowRight, Trophy, Check, X, Zap, Upload } from "lucide-react";

const COLORS = ["#e63946","#2ec4b6","#f4a261","#6c5ce7"];
const SHAPES = ["▲","◆","●","■"];
const LABELS = ["A","B","C","D"];
const Q_TIME = 15;

const DEFAULT_QUIZZES = [
  { title:"General Knowledge", questions:[
    {q:"Capital of Japan?",options:["Seoul","Beijing","Tokyo","Bangkok"],correct:2},
    {q:"Which is the Red Planet?",options:["Venus","Mars","Jupiter","Saturn"],correct:1},
    {q:"How many continents?",options:["5","6","7","8"],correct:2},
    {q:"Who painted Mona Lisa?",options:["Van Gogh","Da Vinci","Picasso","Monet"],correct:1},
    {q:"Largest ocean on Earth?",options:["Atlantic","Indian","Arctic","Pacific"],correct:3},
  ]},
  { title:"Science Basics", questions:[
    {q:"Gas plants absorb from air?",options:["Oxygen","Nitrogen","CO2","Hydrogen"],correct:2},
    {q:"H2O is commonly known as?",options:["Salt","Water","Sugar","Oxygen"],correct:1},
    {q:"Bones in adult human body?",options:["206","150","300","180"],correct:0},
    {q:"Force pulling objects to Earth?",options:["Magnetism","Friction","Gravity","Tension"],correct:2},
    {q:"Smallest unit of life?",options:["Atom","Cell","Molecule","Tissue"],correct:1},
  ]},
];

// ── SOUND ENGINE ─────────────────────────────────────────────────────────────
let _ctx=null,_muted=false,_musicNodes=[],_loopTimer=null;
const getCtx=()=>{if(!_ctx)_ctx=new(window.AudioContext||window.webkitAudioContext)();return _ctx;};

function beep(f=440,d=.12,v=.3,t="sine",delay=0){
  if(_muted)return;
  try{
    const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type=t;
    o.frequency.setValueAtTime(f,ctx.currentTime+delay);
    g.gain.setValueAtTime(v,ctx.currentTime+delay);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+d);
    o.start(ctx.currentTime+delay);o.stop(ctx.currentTime+delay+d+.05);
  }catch{}
}

function playBuzzerAlarm(){
  if(_muted)return;
  // Rapid alarm beeps — gets faster
  [0,.18,.36,.54,.72,.84,.94,1.02,1.09,1.15].forEach((t,i)=>{
    const freq = i<4 ? 440 : i<7 ? 660 : 880;
    beep(freq,.12,.5,"square",t);
  });
  // Final long buzz
  beep(220,.4,.6,"sawtooth",1.3);
}

const SFX={
  join()      {beep(600,.08,.2,"sine");beep(900,.1,.2,"sine",.1);},
  start()     {[330,415,523,659,784].forEach((f,i)=>beep(f,.18,.2,"triangle",i*.1));},
  correct()   {[523,659,784,1047].forEach((f,i)=>beep(f,.15,.25,"sine",i*.09));},
  wrong()     {beep(180,.4,.3,"sawtooth");beep(140,.3,.2,"sawtooth",.15);},
  tick()      {beep(880,.05,.12,"square");},
  urgentTick(){beep(1100,.05,.22,"square");},
  victory()   {[523,523,784,659,880].forEach((f,i)=>beep(f,.22,.25,"triangle",i*.13));beep(1047,.5,.3,"triangle",.7);},
  playerJoin(){beep(440,.06,.2,"sine");beep(660,.1,.25,"sine",.08);beep(880,.12,.2,"sine",.18);},
};
function playSound(n){if(!_muted)try{SFX[n]?.();}catch{}}

function stopBgMusic(){clearTimeout(_loopTimer);_musicNodes.forEach(n=>{try{n.stop?n.stop():n.disconnect();}catch{}});_musicNodes=[];}
function playLobbyMusic(){
  if(_muted)return;stopBgMusic();
  [261,330,392,523,392,330].forEach((freq,i)=>{
    const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type="sine";o.frequency.value=freq;
    const t0=ctx.currentTime+i*.28;
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.05,t0+.06);g.gain.exponentialRampToValueAtTime(.001,t0+.26);
    o.start(t0);o.stop(t0+.3);_musicNodes.push(o,g);
  });
  _loopTimer=setTimeout(()=>{if(!_muted)playLobbyMusic();},6*280+500);
}
function playGameMusic(){
  if(_muted)return;stopBgMusic();
  [130,0,146,0,130,0,110,0].forEach((freq,i)=>{
    if(!freq)return;
    const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type="triangle";o.frequency.value=freq;
    const t0=ctx.currentTime+i*.22;
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.07,t0+.04);g.gain.linearRampToValueAtTime(0,t0+.18);
    o.start(t0);o.stop(t0+.22);_musicNodes.push(o,g);
  });
  _loopTimer=setTimeout(()=>{if(!_muted)playGameMusic();},8*220+300);
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
async function loadGame(code){
  try{
    if(window._fbDb){const{ref,get}=await import("firebase/database");const s=await get(ref(window._fbDb,`games/${code}`));return s.exists()?s.val():null;}
    const r=localStorage.getItem("bw:"+code);return r?JSON.parse(r):null;
  }catch{return null;}
}
async function saveGame(code,data){
  try{
    if(window._fbDb){const{ref,set}=await import("firebase/database");await set(ref(window._fbDb,`games/${code}`),data);}
    else localStorage.setItem("bw:"+code,JSON.stringify(data));
  }catch(e){console.error(e);}
}
function subscribeGame(code,cb){
  if(window._fbDb){
    let unsub=()=>{};
    import("firebase/database").then(({ref,onValue,off})=>{
      const r=ref(window._fbDb,`games/${code}`);
      onValue(r,s=>{if(s.exists())cb(s.val())});
      unsub=()=>off(r);
    });
    return()=>unsub();
  }
  const id=setInterval(async()=>{const g=await loadGame(code);if(g)cb(g);},800);
  return()=>clearInterval(id);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const genCode=()=>String(Math.floor(100000+Math.random()*900000));
const genId=()=>Math.random().toString(36).slice(2,10);

function computeScores(game){
  const scores={};
  const maxPts=game.sessionPts||1000;
  Object.keys(game.players||{}).forEach(pid=>(scores[pid]=0));
  (game.questions||[]).forEach((q,qi)=>{
    const answers=(game.answers||{})[qi]||{};
    const correct=Object.entries(answers)
      .filter(([,a])=>a.choice===q.correct)
      .sort((a,b)=>a[1].time-b[1].time);
    correct.forEach(([pid,a],rank)=>{
      if(rank===0)scores[pid]=(scores[pid]||0)+maxPts;
      else{const ratio=Math.max(.1,1-a.time/(Q_TIME*1000));scores[pid]=(scores[pid]||0)+Math.round(maxPts*ratio);}
    });
  });
  return scores;
}

function parseCSV(text){
  const lines=text.trim().split("\n").filter(Boolean);
  const results=[];
  const start=lines[0].toLowerCase().includes("question")?1:0;
  for(let i=start;i<lines.length;i++){
    const cols=lines[i].split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    if(cols.length<6)continue;
    const[q,a,b,c,d,idx]=cols;const correct=parseInt(idx,10);
    if(!q||isNaN(correct)||correct<0||correct>3)continue;
    results.push({q,options:[a,b,c,d],correct});
  }
  return results;
}

// ── CONFETTI ──────────────────────────────────────────────────────────────────
function Confetti(){
  const pieces=Array.from({length:55},(_,i)=>({
    id:i,color:["#e63946","#2ec4b6","#f4a261","#6c5ce7","#F5D90A","#ff6b9d"][i%6],
    left:Math.random()*100,delay:Math.random()*2,duration:2+Math.random()*2,
    size:8+Math.random()*8,rotate:Math.random()*360,
  }));
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:9999}}>
      {pieces.map(p=>(
        <div key={p.id} style={{
          position:"absolute",top:"-20px",left:`${p.left}%`,
          width:p.size,height:p.size,background:p.color,
          borderRadius:p.size>12?"50%":"2px",
          animation:`confettiFall ${p.duration}s ease-in ${p.delay}s both`,
          transform:`rotate(${p.rotate}deg)`,
        }}/>
      ))}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css=`
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  body{background:#1a1a2e;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow-x:hidden;-webkit-text-size-adjust:100%;}
  button,input{font-family:inherit;}
  input{font-size:16px !important;}

  @keyframes fadeSlideDown{from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeSlideUp{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeSlideLeft{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}
  @keyframes popIn{from{transform:scale(0.4);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  @keyframes bounceY{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
  @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
  @keyframes glow{0%,100%{text-shadow:0 0 20px rgba(245,217,10,.4)}50%{text-shadow:0 0 50px rgba(245,217,10,.9)}}
  @keyframes countPulse{0%{transform:scale(1)}50%{transform:scale(1.5)}100%{transform:scale(1)}}
  @keyframes floatScore{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-90px);opacity:0}}
  @keyframes correctFlash{0%,100%{background:rgba(46,196,182,.15)}50%{background:rgba(46,196,182,.45)}}
  @keyframes rankSlide{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
  @keyframes barGrow{from{width:0}to{width:var(--bw)}}
  @keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
  @keyframes scaleIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes playerPop{from{transform:scale(0) translateY(16px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
  @keyframes pulseShadow{0%,100%{box-shadow:0 0 0 0 rgba(108,92,231,.4)}50%{box-shadow:0 0 0 14px rgba(108,92,231,0)}}

  /* COUNTDOWN ANIMATIONS */
  @keyframes numPop{0%{transform:scale(0.3);opacity:0}60%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
  @keyframes goPopIn{0%{transform:scale(0.2);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
  @keyframes alarmScale{0%{transform:scaleY(1)}100%{transform:scaleY(1.8)}}

  .q-enter{animation:fadeSlideDown .45s cubic-bezier(.34,1.56,.64,1) both;}
  .btn-pop-0{animation:fadeSlideUp .4s cubic-bezier(.34,1.56,.64,1) .08s both;}
  .btn-pop-1{animation:fadeSlideUp .4s cubic-bezier(.34,1.56,.64,1) .16s both;}
  .btn-pop-2{animation:fadeSlideUp .4s cubic-bezier(.34,1.56,.64,1) .24s both;}
  .btn-pop-3{animation:fadeSlideUp .4s cubic-bezier(.34,1.56,.64,1) .32s both;}

  .answer-btn{
    border:none;border-radius:16px;cursor:pointer;
    display:flex;align-items:center;gap:14px;
    color:#fff;font-weight:800;font-size:16px;text-align:left;
    transition:transform .12s,filter .12s;
    position:relative;overflow:hidden;padding:20px 18px;
    -webkit-tap-highlight-color:transparent;touch-action:manipulation;
    min-height:84px;width:100%;
  }
  .answer-btn:active{transform:scale(.95) !important;}
  .answer-btn.disabled{opacity:.4;pointer-events:none;}
`;

// ── 3,2,1 GO COUNTDOWN (buzzer sounds) ───────────────────────────────────────
function CountdownOverlay({ onDone, label }){
  const [num, setNum]   = useState(3);
  const [isGo, setIsGo] = useState(false);
  const colors = {3:"#e63946", 2:"#f4a261", 1:"#F5D90A"};

  useEffect(()=>{
    // Buzzer beep for "3"
    beep(200,.18,.7,"sawtooth"); beep(400,.1,.4,"square",.12);

    const t1=setTimeout(()=>{
      setNum(2);
      beep(200,.18,.7,"sawtooth"); beep(400,.1,.4,"square",.12);
    },1000);
    const t2=setTimeout(()=>{
      setNum(1);
      beep(200,.18,.7,"sawtooth"); beep(400,.1,.4,"square",.12);
    },2000);
    const t3=setTimeout(()=>{
      setIsGo(true);
      // GO! rising fanfare
      [523,659,784,1047].forEach((f,i)=>beep(f,.18,.5,"sine",i*.07));
    },3000);
    const t4=setTimeout(()=>onDone(), 3800);
    return()=>[t1,t2,t3,t4].forEach(clearTimeout);
  },[]);

  return(
    <div style={{
      position:"fixed",inset:0,zIndex:9000,
      background:"rgba(10,8,30,0.94)",backdropFilter:"blur(10px)",
      display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
    }}>
      {/* Label */}
      {label&&!isGo&&(
        <div style={{
          fontSize:14,fontWeight:700,color:"rgba(255,255,255,.45)",
          letterSpacing:3,textTransform:"uppercase",marginBottom:32,
        }}>{label}</div>
      )}

      {/* Big number / GO */}
      <div key={isGo?"go":num} style={{
        fontSize: isGo ? 120 : 160,
        fontWeight:900,
        color: isGo ? "#2ec4b6" : colors[num],
        fontFamily:"Arial Black,Arial,sans-serif",
        lineHeight:1,
        animation: isGo
          ? "goPopIn .45s cubic-bezier(.34,1.56,.64,1)"
          : "numPop .4s cubic-bezier(.34,1.56,.64,1)",
        textShadow: isGo
          ? "0 0 60px rgba(46,196,182,.8)"
          : `0 0 60px ${colors[num]}99`,
        letterSpacing: isGo ? -4 : 0,
      }}>{isGo ? "GO!" : num}</div>

      {/* Dot indicators */}
      {!isGo&&(
        <div style={{display:"flex",gap:14,marginTop:36}}>
          {[3,2,1].map(n=>(
            <div key={n} style={{
              width:18,height:18,borderRadius:"50%",
              background: n>=num ? colors[num] : "rgba(255,255,255,.12)",
              boxShadow: n===num ? `0 0 14px ${colors[num]}` : "none",
              transition:"all .2s",
            }}/>
          ))}
        </div>
      )}

      {/* Sound bars */}
      {!isGo&&(
        <div style={{position:"absolute",bottom:55,display:"flex",gap:5,alignItems:"flex-end"}}>
          {Array.from({length:9},(_,i)=>(
            <div key={i} style={{
              width:6,height:10+Math.abs(i-4)*8,borderRadius:3,
              background:colors[num],opacity:.35+Math.abs(i-4)*.07,
              animation:`alarmScale .3s ease ${i*.035}s infinite alternate`,
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FLOAT SCORE ───────────────────────────────────────────────────────────────
function FloatScore({pts,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,1400);return()=>clearTimeout(t);},[]);
  return(
    <div style={{
      position:"fixed",top:"35%",left:"50%",transform:"translateX(-50%)",
      fontSize:34,fontWeight:900,color:"#F5D90A",pointerEvents:"none",zIndex:9998,
      textShadow:"0 2px 20px rgba(245,217,10,.6)",
      animation:"floatScore 1.4s ease forwards",whiteSpace:"nowrap",
    }}>+{pts} pts! 🎯</div>
  );
}

// ── CIRCULAR TIMER ────────────────────────────────────────────────────────────
function CircularTimer({duration,questionKey,onExpire}){
  const[left,setLeft]=useState(duration);
  const doneRef=useRef(false);
  const startRef=useRef(Date.now());
  const lastSecRef=useRef(duration);

  useEffect(()=>{
    doneRef.current=false;startRef.current=Date.now();setLeft(duration);lastSecRef.current=duration;
    const id=setInterval(()=>{
      const elapsed=(Date.now()-startRef.current)/1000;
      const rem=Math.max(0,duration-elapsed);
      setLeft(rem);
      const cur=Math.ceil(rem);
      if(cur!==lastSecRef.current){
        lastSecRef.current=cur;
        if(rem>0){rem<=5?playSound("urgentTick"):playSound("tick");}
      }
      if(rem<=0&&!doneRef.current){doneRef.current=true;clearInterval(id);playSound("wrong");onExpire?.();}
    },100);
    return()=>clearInterval(id);
  },[questionKey]);

  const pct=left/duration;
  const r=42;const circ=2*Math.PI*r;
  const offset=circ*(1-pct);
  const color=left>8?"#2ec4b6":left>4?"#F5D90A":"#e63946";

  return(
    <div style={{position:"relative",width:100,height:100,flexShrink:0}}>
      <svg width="100" height="100" style={{transform:"rotate(-90deg)"}}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="7"/>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{transition:"stroke-dashoffset .12s linear,stroke .5s",filter:`drop-shadow(0 0 5px ${color})`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:26,fontWeight:900,color,
          animation:left<=5?"countPulse .5s infinite":"none",
          textShadow:left<=5?`0 0 16px ${color}`:"none"}}>{Math.ceil(left)}</span>
      </div>
    </div>
  );
}

// ── LIVE SCOREBOARD ───────────────────────────────────────────────────────────
function LiveScoreboard({ game, highlightPid }){
  const players = Object.entries(game.players||{});
  const scores  = computeScores(game);
  const ranked  = players.map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0}))
    .sort((a,b)=>b.score-a.score);
  const maxScore = ranked[0]?.score || 1;

  if(ranked.length===0) return null;

  return(
    <div style={{
      background:"rgba(255,255,255,.04)",
      border:"1px solid rgba(255,255,255,.08)",
      borderRadius:14,padding:"14px 16px",marginTop:16,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
        <Trophy size={14} color="#F5D90A"/>
        <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",letterSpacing:1,textTransform:"uppercase"}}>Live Scores</span>
      </div>
      {ranked.slice(0,5).map((p,i)=>(
        <div key={p.pid} style={{
          display:"flex",alignItems:"center",gap:10,marginBottom:8,
          animation:`rankSlide .3s ease ${i*.05}s both`,
        }}>
          <span style={{fontSize:14,width:20,textAlign:"center"}}>
            {["🥇","🥈","🥉","4️⃣","5️⃣"][i]}
          </span>
          <span style={{
            fontSize:13,fontWeight:p.pid===highlightPid?800:500,
            color:p.pid===highlightPid?"#F5D90A":"rgba(255,255,255,.8)",
            flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          }}>{p.name}{p.pid===highlightPid?" ★":""}</span>
          <div style={{width:80,height:6,background:"rgba(255,255,255,.08)",borderRadius:99,overflow:"hidden",flexShrink:0}}>
            <div style={{
              height:"100%",
              width:`${Math.round((p.score/Math.max(maxScore,1))*100)}%`,
              background:p.pid===highlightPid?"#F5D90A":"#6c5ce7",
              borderRadius:99,transition:"width .5s ease",
            }}/>
          </div>
          <span style={{
            fontSize:13,fontWeight:700,
            color:p.pid===highlightPid?"#F5D90A":"rgba(255,255,255,.6)",
            width:44,textAlign:"right",flexShrink:0,
          }}>{p.score}</span>
        </div>
      ))}
    </div>
  );
}

// ── MUTE ─────────────────────────────────────────────────────────────────────
function MuteBtn(){
  const[m,setM]=useState(false);
  return(
    <button onClick={()=>{_muted=!_muted;setM(_muted);if(_muted)stopBgMusic();}} style={{
      position:"fixed",top:14,right:16,zIndex:9999,
      background:"rgba(0,0,0,.5)",backdropFilter:"blur(10px)",
      border:"1px solid rgba(255,255,255,.15)",color:"#fff",
      borderRadius:999,width:44,height:44,fontSize:20,cursor:"pointer",
      display:"flex",alignItems:"center",justifyContent:"center",
      WebkitTapHighlightColor:"transparent",
    }}>{m?"🔇":"🔊"}</button>
  );
}

// ── SHELL ─────────────────────────────────────────────────────────────────────
function Shell({children}){
  return(
    <>
      <style>{css}</style>
      <MuteBtn/>
      <div style={{
        minHeight:"100vh",
        background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",
        display:"flex",flexDirection:"column",alignItems:"center",
        padding:"20px 16px 60px",
        WebkitOverflowScrolling:"touch",
      }}>
        <div style={{width:"100%",maxWidth:880}}>{children}</div>
      </div>
    </>
  );
}

// ── INPUT / BTN ───────────────────────────────────────────────────────────────
function Input(props){
  return <input {...props} style={{
    width:"100%",padding:"14px 16px",borderRadius:12,
    border:"1.5px solid rgba(255,255,255,.15)",
    background:"rgba(255,255,255,.06)",
    color:"#fff",fontSize:"16px",outline:"none",
    transition:"border .2s",
    WebkitAppearance:"none",
    ...props.style,
  }}
  onFocus={e=>{e.target.style.borderColor="rgba(108,92,231,.7)";}}
  onBlur={e=>{e.target.style.borderColor="rgba(255,255,255,.15)";}}
  />;
}

function Btn({children,onClick,color="#6C5CE7",style,disabled}){
  return(
    <button onClick={onClick} disabled={disabled} style={{
      background:disabled?"#2a2a4a":color,
      color:color==="#F5D90A"?"#14122B":"#fff",
      border:"none",borderRadius:14,padding:"15px 24px",
      fontWeight:800,fontSize:15,
      opacity:disabled?.5:1,
      boxShadow:disabled?"none":`0 4px 20px ${color}55`,
      display:"inline-flex",alignItems:"center",gap:8,justifyContent:"center",
      cursor:disabled?"not-allowed":"pointer",
      transition:"all .18s",
      WebkitTapHighlightColor:"transparent",
      touchAction:"manipulation",
      ...style,
    }}>{children}</button>
  );
}

function Logo({size=32}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,fontWeight:900}}>
      <span style={{fontSize:size}}>⚔️</span>
      <span style={{fontSize:size*.9,letterSpacing:"-1px"}}>
        Brain<span style={{color:"#e63946"}}>War</span>
      </span>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function Home({onHost,onJoin}){
  const params = new URLSearchParams(window.location.search);
  const rawT = params.get("t")||"";
  let decoded = "";
  try { if(rawT) decoded = atob(rawT).replace("BW:",""); } catch {}
  const autoJoin = decoded || params.get("join") || "";
  const[mode,setMode]=useState(autoJoin?"join":null);
  const[code,setCode]=useState("");
  const[name,setName]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);

  return(
    <div>
      <div style={{textAlign:"center",padding:"44px 0 40px",animation:"fadeSlideDown .6s ease both"}}>
        <Logo size={40}/>
        <p style={{color:"rgba(255,255,255,.4)",marginTop:12,fontSize:15}}>
          Live quiz battles — play together in real time
        </p>
      </div>

      {!mode&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,maxWidth:580,margin:"0 auto"}}>
          <div style={{animation:"fadeSlideUp .5s ease .08s both"}}>
            <div onClick={()=>setMode("host")} style={{
              background:"linear-gradient(145deg,rgba(230,57,70,.22),rgba(230,57,70,.06))",
              border:"2px solid rgba(230,57,70,.35)",borderRadius:20,
              padding:"30px 20px",textAlign:"center",cursor:"pointer",
              transition:"transform .2s,box-shadow .2s",
            }}
            onTouchStart={()=>{}} // iOS active state trigger
            >
              <div style={{fontSize:50,marginBottom:12}}>🎛️</div>
              <h3 style={{fontSize:19,marginBottom:8}}>Host a Quiz</h3>
              <p style={{color:"rgba(255,255,255,.4)",fontSize:13,lineHeight:1.6,marginBottom:20}}>
                Create questions, share code, run it live
              </p>
              <Btn color="#e63946" style={{width:"100%"}}>
                <Play size={16}/> Create Game
              </Btn>
            </div>
          </div>
          <div style={{animation:"fadeSlideUp .5s ease .16s both"}}>
            <div onClick={()=>setMode("join")} style={{
              background:"linear-gradient(145deg,rgba(46,196,182,.22),rgba(46,196,182,.06))",
              border:"2px solid rgba(46,196,182,.35)",borderRadius:20,
              padding:"30px 20px",textAlign:"center",cursor:"pointer",
              transition:"transform .2s,box-shadow .2s",
            }}
            onTouchStart={()=>{}}
            >
              <div style={{fontSize:50,marginBottom:12}}>🙋</div>
              <h3 style={{fontSize:19,marginBottom:8}}>Join a Quiz</h3>
              <p style={{color:"rgba(255,255,255,.4)",fontSize:13,lineHeight:1.6,marginBottom:20}}>
                Enter 6-digit code from your host
              </p>
              <Btn color="#2ec4b6" style={{width:"100%"}}>
                <ArrowRight size={16}/> Join Game
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* JOIN FORM */}
      {mode==="join"&&(
        <div style={{maxWidth:420,margin:"0 auto",animation:"fadeSlideUp .4s ease both"}}>
          <div style={{background:"rgba(255,255,255,.05)",backdropFilter:"blur(20px)",
            border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:28}}>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:42,marginBottom:8}}>🎮</div>
              <h2 style={{fontSize:22}}>Join a Game</h2>
            </div>
            {err&&(
              <div style={{background:"rgba(230,57,70,.15)",border:"1px solid rgba(230,57,70,.35)",
                borderRadius:10,padding:"11px 14px",marginBottom:16,fontSize:14,color:"#ff8a94",
                animation:"shake .4s ease"}}>{err}</div>
            )}
            <label style={{fontSize:13,color:"rgba(255,255,255,.45)",display:"block",marginBottom:8}}>Game Code</label>
            <Input value={code}
              onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
              placeholder="Enter 6-digit code"
              inputMode="numeric" pattern="[0-9]*"
              style={{fontSize:"22px",letterSpacing:6,textAlign:"center",marginBottom:18,fontWeight:900,fontFamily:"monospace"}}/>
            <label style={{fontSize:13,color:"rgba(255,255,255,.45)",display:"block",marginBottom:8}}>Your Name</label>
            <Input value={name} onChange={e=>setName(e.target.value.slice(0,18))}
              placeholder="e.g. Captain Waffle" style={{marginBottom:22}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn color="rgba(255,255,255,.08)" onClick={()=>{setMode(null);setCode("");}} style={{flex:1,boxShadow:"none"}}>← Back</Btn>
              <Btn color="#2ec4b6" disabled={code.length!==6||!name.trim()||loading}
                onClick={async()=>{setLoading(true);await onJoin(code,name.trim(),setErr);setLoading(false);}}
                style={{flex:2}}>
                {loading?"Joining...":"Join Now 🚀"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {mode==="host"&&<HostSetup onBack={()=>setMode(null)} onHost={onHost}/>}
    </div>
  );
}

// ── CSV IMPORT ────────────────────────────────────────────────────────────────
function CSVImport({onImport}){
  const ref=useRef();const[msg,setMsg]=useState("");
  const handle=e=>{
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{const qs=parseCSV(ev.target.result);
      if(!qs.length)setMsg("❌ Invalid format. Check example below.");
      else{onImport(qs);setMsg(`✅ ${qs.length} questions imported!`);}};
    r.readAsText(file);e.target.value="";
  };
  return(
    <div style={{background:"rgba(108,92,231,.1)",border:"1px solid rgba(108,92,231,.25)",borderRadius:14,padding:16,marginTop:16}}>
      <p style={{fontSize:13,color:"rgba(255,255,255,.55)",marginBottom:8}}>📁 Import questions from CSV</p>
      <p style={{fontSize:11,color:"rgba(255,255,255,.3)",marginBottom:10,fontFamily:"monospace",
        background:"rgba(0,0,0,.25)",padding:"8px 10px",borderRadius:8,lineHeight:2}}>
        Question,OptionA,OptionB,OptionC,OptionD,CorrectIndex<br/>
        What is 2+2?,1,2,3,4,3 <span style={{color:"#2ec4b6"}}>(0=A 1=B 2=C 3=D)</span>
      </p>
      <input ref={ref} type="file" accept=".csv,.txt" onChange={handle} style={{display:"none"}}/>
      <Btn color="#6C5CE7" onClick={()=>ref.current.click()} style={{width:"100%"}}>
        <Upload size={15}/> Choose CSV File
      </Btn>
      {msg&&<p style={{fontSize:13,color:"#2ec4b6",marginTop:10}}>{msg}</p>}
    </div>
  );
}

// ── HOST SETUP ────────────────────────────────────────────────────────────────
function HostSetup({onBack,onHost}){
  const[title,setTitle]=useState("");
  const[questions,setQuestions]=useState([]);
  const[sessionPts,setSessionPts]=useState(1000);
  const[draft,setDraft]=useState({q:"",options:["","","",""],correct:0});

  const addQ=()=>{
    if(!draft.q.trim()||draft.options.some(o=>!o.trim()))return;
    setQuestions([...questions,{...draft,options:[...draft.options]}]);
    setDraft({q:"",options:["","","",""],correct:0});
  };

  return(
    <div style={{animation:"fadeSlideUp .4s ease both"}}>
      <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:20,padding:26}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <h2 style={{fontSize:21,fontWeight:800}}>🎯 Create Your Quiz</h2>
          <button onClick={onBack} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:14,cursor:"pointer",padding:"6px 10px"}}>← Back</button>
        </div>

        <label style={{fontSize:13,color:"rgba(255,255,255,.45)",display:"block",marginBottom:8}}>Quiz Title</label>
        <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Friday Trivia Night" style={{marginBottom:22}}/>

        {/* POINTS */}
        <div style={{background:"rgba(245,217,10,.06)",border:"1px solid rgba(245,217,10,.18)",borderRadius:14,padding:16,marginBottom:22}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:12}}>⭐ Points per question (same for all)</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[100,250,500,1000,2000,5000].map(p=>(
              <button key={p} onClick={()=>setSessionPts(p)} style={{
                background:sessionPts===p?"#F5D90A":"rgba(255,255,255,.07)",
                color:sessionPts===p?"#14122B":"#fff",
                border:`2px solid ${sessionPts===p?"#F5D90A":"rgba(255,255,255,.12)"}`,
                borderRadius:10,padding:"10px 16px",fontWeight:800,fontSize:14,
                cursor:"pointer",transition:"all .18s",
                transform:sessionPts===p?"scale(1.08)":"scale(1)",
              }}>{p}</button>
            ))}
          </div>
          <p style={{fontSize:12,color:"rgba(255,255,255,.3)",marginTop:10}}>
            ✅ 1st correct → <strong style={{color:"#F5D90A"}}>{sessionPts} pts</strong> &nbsp;·&nbsp; ⚡ Later answers → less based on time
          </p>
        </div>

        {/* TEMPLATES */}
        <div style={{marginBottom:18}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,.4)",marginBottom:10}}>📚 Load a template:</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {DEFAULT_QUIZZES.map(dq=>(
              <button key={dq.title} onClick={()=>{setTitle(dq.title);setQuestions(dq.questions.map(q=>({...q})));}}
                style={{background:"rgba(108,92,231,.18)",border:"1px solid rgba(108,92,231,.3)",
                  color:"#fff",borderRadius:20,padding:"8px 16px",fontSize:13,cursor:"pointer"}}>
                {dq.title} ({dq.questions.length}q)
              </button>
            ))}
          </div>
        </div>

        <CSVImport onImport={qs=>setQuestions(prev=>[...prev,...qs])}/>

        {/* QUESTION LIST */}
        {questions.length>0&&(
          <div style={{marginTop:22,paddingTop:18,borderTop:"1px solid rgba(255,255,255,.06)"}}>
            <p style={{fontSize:14,color:"rgba(255,255,255,.4)",marginBottom:12,fontWeight:600}}>Questions ({questions.length})</p>
            {questions.map((q,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",
                borderRadius:10,padding:"11px 14px",marginBottom:8}}>
                <span style={{fontSize:14}}>{i+1}. {q.q}</span>
                <button onClick={()=>setQuestions(questions.filter((_,idx)=>idx!==i))}
                  style={{background:"none",border:"none",color:"rgba(230,57,70,.7)",cursor:"pointer",fontSize:20}}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* ADD QUESTION */}
        <div style={{marginTop:20,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:14,padding:18}}>
          <p style={{fontSize:15,fontWeight:700,marginBottom:12}}>➕ Add Question Manually</p>
          <Input value={draft.q} onChange={e=>setDraft({...draft,q:e.target.value})} placeholder="Type your question here..." style={{marginBottom:12}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {draft.options.map((opt,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setDraft({...draft,correct:i})} style={{
                  width:36,height:36,flexShrink:0,borderRadius:10,
                  border:`2px solid ${draft.correct===i?"#2ec4b6":"rgba(255,255,255,.18)"}`,
                  background:draft.correct===i?"#2ec4b6":"transparent",
                  color:"#fff",cursor:"pointer",fontWeight:800,fontSize:13,transition:"all .18s",
                }}>{draft.correct===i?"✓":LABELS[i]}</button>
                <Input value={opt}
                  onChange={e=>{const opts=[...draft.options];opts[i]=e.target.value;setDraft({...draft,options:opts});}}
                  placeholder={`Option ${LABELS[i]}`}/>
              </div>
            ))}
          </div>
          <Btn onClick={addQ} color="#F5D90A" style={{marginTop:14,width:"100%"}}>
            <Plus size={15}/> Add Question
          </Btn>
        </div>

        <Btn color="#e63946" style={{width:"100%",marginTop:20,fontSize:17,padding:"18px"}}
          disabled={!title.trim()||questions.length===0}
          onClick={()=>onHost(title.trim(),questions,sessionPts)}>
          🚀 Create Game & Get Code
        </Btn>
      </div>
    </div>
  );
}

// ── HOST LOBBY ────────────────────────────────────────────────────────────────
function HostLobby({code,game,onStart}){
  const players=Object.entries(game.players||{});
  const[copied,setCopied]=useState(false);
  const prevCount=useRef(0);
  const token = btoa("BW:" + code);
  const joinLink = `${window.location.origin}${window.location.pathname}?t=${token}`;

  useEffect(()=>{
    if(players.length>prevCount.current&&players.length>0)playSound("playerJoin");
    prevCount.current=players.length;
  },[players.length]);

  return(
    <div style={{animation:"fadeSlideDown .5s ease both"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <Logo size={30}/>
        <p style={{color:"rgba(255,255,255,.35)",marginTop:8,fontSize:14}}>{game.title}</p>
      </div>

      {/* GAME PIN */}
      <div style={{background:"linear-gradient(135deg,rgba(108,92,231,.25),rgba(230,57,70,.12))",
        border:"1px solid rgba(108,92,231,.35)",borderRadius:20,padding:"26px 24px",
        textAlign:"center",marginBottom:14}}>
        <p style={{fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:8,letterSpacing:2,textTransform:"uppercase"}}>Game PIN</p>
        <div style={{fontSize:66,fontWeight:900,letterSpacing:14,color:"#F5D90A",
          fontFamily:"monospace",lineHeight:1,animation:"glow 2.5s ease infinite"}}>
          {code}
        </div>
        <p style={{fontSize:12,color:"rgba(255,255,255,.3)",marginTop:10}}>
          {game.questions?.length} questions · {game.sessionPts} pts each
        </p>
      </div>

      {/* JOIN LINK */}
      <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",
        borderRadius:14,padding:14,marginBottom:14}}>
        <p style={{fontSize:12,color:"rgba(255,255,255,.35)",marginBottom:10}}>
          🔗 Share this link — players just enter their name:
        </p>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1,fontSize:11,color:"#2ec4b6",background:"rgba(0,0,0,.25)",
            padding:"10px 12px",borderRadius:10,wordBreak:"break-all",lineHeight:1.5}}>
            {joinLink}
          </div>
          <button onClick={()=>{navigator.clipboard.writeText(joinLink);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
            style={{flexShrink:0,background:copied?"#2ec4b6":"#6C5CE7",border:"none",
              borderRadius:10,color:"#fff",padding:"0 14px",fontWeight:700,fontSize:13,
              cursor:"pointer",transition:"background .3s",minWidth:70}}>
            {copied?"✅":"Copy"}
          </button>
        </div>
      </div>

      {/* PLAYERS */}
      <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",
        borderRadius:16,padding:18,marginBottom:18,minHeight:90}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <Users size={16} color="#2ec4b6"/>
          <span style={{fontWeight:700,fontSize:15}}>{players.length} Player{players.length!==1?"s":""} Joined</span>
          {players.length>0&&<span style={{fontSize:18,animation:"bounceY .7s ease infinite"}}>🎉</span>}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,minHeight:34}}>
          {players.map(([pid,p],i)=>(
            <div key={pid} style={{
              background:COLORS[i%4],color:"#fff",
              padding:"7px 14px",borderRadius:999,fontWeight:700,fontSize:14,
              boxShadow:`0 3px 12px ${COLORS[i%4]}55`,
              animation:"playerPop .35s cubic-bezier(.34,1.56,.64,1) both",
            }}>{p.name}</div>
          ))}
          {players.length===0&&<p style={{color:"rgba(255,255,255,.2)",fontSize:14}}>Waiting for players... 👀</p>}
        </div>
      </div>

      <Btn color="#e63946" style={{width:"100%",fontSize:18,padding:"20px"}}
        disabled={players.length===0} onClick={onStart}>
        <Play size={20}/> Start Quiz!
      </Btn>
    </div>
  );
}

// ── HOST ACTIVE ───────────────────────────────────────────────────────────────
function HostActive({game,onReveal}){
  const players=Object.entries(game.players||{});
  const q=game.questions[game.currentIndex];
  const answersForQ=(game.answers||{})[game.currentIndex]||{};
  const answered=Object.keys(answersForQ).length;
  const revealedRef=useRef(false);
  const[showBuzzer,setShowBuzzer]=useState(true);
  const doReveal=()=>{if(!revealedRef.current){revealedRef.current=true;onReveal();}};
  if(!q)return null;

  return(
    <div>
      {showBuzzer&&(
        <CountdownOverlay
          label={game.currentIndex===0?"Quiz is Starting!":"Next Question"}
          onDone={()=>{setShowBuzzer(false);playGameMusic();}}
        />
      )}

      {/* TOP BAR */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{background:"rgba(255,255,255,.07)",borderRadius:999,padding:"8px 16px",fontSize:14,fontWeight:600}}>
          Q {game.currentIndex+1} <span style={{color:"rgba(255,255,255,.35)"}}>/ {game.questions.length}</span>
        </div>
        <div style={{background:"rgba(46,196,182,.1)",border:"1px solid rgba(46,196,182,.22)",
          borderRadius:999,padding:"8px 16px",fontSize:14,color:"#2ec4b6",fontWeight:600}}>
          <Users size={13} style={{verticalAlign:"-2px",marginRight:5}}/>
          {answered} / {players.length} answered
        </div>
      </div>

      {/* TIMER + QUESTION */}
      <div style={{display:"flex",gap:16,alignItems:"flex-start",marginBottom:18}}>
        <CircularTimer duration={Q_TIME} questionKey={game.currentIndex} onExpire={doReveal}/>
        <div className="q-enter" style={{flex:1,background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(255,255,255,.08)",borderRadius:18,
          padding:"22px 24px",minHeight:100,display:"flex",alignItems:"center"}}>
          <div>
            <p style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:8,letterSpacing:.5}}>
              ⭐ {game.sessionPts} pts per correct answer
            </p>
            <h2 style={{fontSize:21,fontWeight:800,lineHeight:1.4}}>{q.q}</h2>
          </div>
        </div>
      </div>

      {/* ANSWERS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
        {q.options.map((opt,i)=>(
          <div key={i} className={`btn-pop-${i}`}
            style={{background:COLORS[i],borderRadius:16,padding:"20px 16px",
              fontWeight:700,fontSize:16,display:"flex",alignItems:"center",gap:12,
              boxShadow:`0 5px 18px ${COLORS[i]}44`,minHeight:78}}>
            <span style={{fontSize:24,flexShrink:0}}>{SHAPES[i]}</span>
            <span style={{lineHeight:1.3}}>{opt}</span>
          </div>
        ))}
      </div>

      {/* LIVE SCORES */}
      <LiveScoreboard game={game}/>

      <Btn color="#F5D90A" style={{width:"100%",fontSize:16,padding:"16px",marginTop:14}} onClick={doReveal}>
        Show Answer 👀
      </Btn>
    </div>
  );
}

// ── HOST REVEAL ───────────────────────────────────────────────────────────────
function HostReveal({game,onNext,onEnd}){
  const players=Object.entries(game.players||{});
  const q=game.questions[game.currentIndex];
  const answersForQ=(game.answers||{})[game.currentIndex]||{};
  const scores=computeScores(game);
  const ranked=players.map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);
  const isLast=game.currentIndex+1>=game.questions.length;
  const maxScore=ranked[0]?.score||1;
  if(!q)return null;

  return(
    <div style={{animation:"fadeSlideDown .4s ease both"}}>
      {/* CORRECT BANNER */}
      <div style={{background:"rgba(46,196,182,.15)",border:"2px solid rgba(46,196,182,.4)",
        borderRadius:16,padding:"16px 20px",marginBottom:14,
        display:"flex",alignItems:"center",gap:14,animation:"correctFlash .6s ease"}}>
        <span style={{fontSize:30}}>✅</span>
        <div>
          <p style={{fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:4}}>Correct Answer</p>
          <p style={{fontSize:19,fontWeight:800,color:"#2ec4b6"}}>{q.options[q.correct]}</p>
        </div>
      </div>

      {/* ANSWER BREAKDOWN */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {q.options.map((opt,i)=>{
          const count=Object.values(answersForQ).filter(a=>a.choice===i).length;
          const isCorrect=i===q.correct;
          return(
            <div key={i} style={{
              background:isCorrect?"rgba(46,196,182,.18)":"rgba(255,255,255,.04)",
              border:`2px solid ${isCorrect?"#2ec4b6":"rgba(255,255,255,.08)"}`,
              borderRadius:12,padding:"13px 16px",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,fontSize:14}}>{SHAPES[i]} {opt} {isCorrect?"✓":""}</span>
              <span style={{background:"rgba(0,0,0,.2)",padding:"3px 10px",borderRadius:999,
                fontSize:13,fontWeight:700,color:isCorrect?"#2ec4b6":"rgba(255,255,255,.5)"}}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* LEADERBOARD WITH BARS */}
      <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",
        borderRadius:16,padding:18,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <Trophy size={16} color="#F5D90A"/>
          <h3 style={{fontSize:15,fontWeight:700}}>Leaderboard</h3>
        </div>
        {ranked.slice(0,5).map((p,i)=>{
          const bw=`${Math.round((p.score/maxScore)*100)}%`;
          return(
            <div key={p.pid} style={{marginBottom:10,animation:`rankSlide .4s ease ${i*.07}s both`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <span style={{display:"flex",alignItems:"center",gap:8,fontWeight:600,fontSize:14}}>
                  <span style={{fontSize:17}}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>{p.name}
                </span>
                <span style={{fontWeight:800,fontSize:16,color:"#F5D90A"}}>{p.score}</span>
              </div>
              <div style={{height:7,background:"rgba(255,255,255,.07)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:bw,background:"linear-gradient(90deg,#6C5CE7,#e63946)",
                  borderRadius:99,animation:`barGrow .6s ease ${i*.07}s both`,"--bw":bw}}/>
              </div>
            </div>
          );
        })}
      </div>

      {isLast
        ?<Btn color="#e63946" style={{width:"100%",fontSize:17,padding:"18px"}} onClick={onEnd}>🏆 See Final Results!</Btn>
        :<Btn color="#6C5CE7" style={{width:"100%",fontSize:17,padding:"18px"}} onClick={onNext}>Next Question ➡️</Btn>}
    </div>
  );
}

// ── HOST ENDED ────────────────────────────────────────────────────────────────
function HostEnded({game}){
  const players=Object.entries(game.players||{});
  const scores=computeScores(game);
  const ranked=players.map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);
  return(
    <div style={{textAlign:"center",animation:"fadeSlideDown .5s ease both"}}>
      <Confetti/>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:62,animation:"bounceY .7s ease infinite"}}>🏆</div>
        <h1 style={{fontSize:28,fontWeight:900,marginTop:12}}>Quiz Complete!</h1>
        <p style={{color:"rgba(255,255,255,.35)",fontSize:14,marginTop:6}}>Final Results</p>
      </div>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        {ranked.map((p,i)=>(
          <div key={p.pid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"15px 20px",marginBottom:10,borderRadius:16,
            background:i===0?"linear-gradient(135deg,rgba(245,217,10,.22),rgba(245,217,10,.07))":"rgba(255,255,255,.04)",
            border:`2px solid ${i===0?"rgba(245,217,10,.45)":i===1?"rgba(192,192,192,.25)":i===2?"rgba(205,127,50,.25)":"rgba(255,255,255,.07)"}`,
            transform:i===0?"scale(1.04)":"scale(1)",
            animation:`rankSlide .5s ease ${i*.1}s both`}}>
            <span style={{display:"flex",alignItems:"center",gap:12,fontSize:16}}>
              <span style={{fontSize:26}}>{["🥇","🥈","🥉"][i]||`${i+1}.`}</span>
              <span style={{fontWeight:700}}>{p.name}</span>
            </span>
            <span style={{fontWeight:900,fontSize:20,color:i===0?"#F5D90A":"#fff"}}>{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLAYER LIVE ───────────────────────────────────────────────────────────────
function PlayerLive({playerId,game,onAnswer}){
  const idx=game.currentIndex;
  const myAnswerForQ=((game.answers||{})[idx]||{})[playerId];
  const scores=computeScores(game);
  const myScore=scores[playerId]||0;
  const ranked=Object.entries(game.players||{})
    .map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0}))
    .sort((a,b)=>b.score-a.score);
  const myRank=ranked.findIndex(r=>r.pid===playerId)+1;

  const revealedRef=useRef(false);
  const[selectedAnswer,setSelectedAnswer]=useState(null);
  const[showFloat,setShowFloat]=useState(false);
  const[earnedPts,setEarnedPts]=useState(0);
  const[showBuzzer,setShowBuzzer]=useState(false);
  const prevIdxRef=useRef(-1);
  const prevScoreRef=useRef(0);

  useEffect(()=>{
    if(game.status==="active"&&idx!==prevIdxRef.current){
      prevIdxRef.current=idx;
      setShowBuzzer(true);
      setSelectedAnswer(null);
    }
  },[game.status,idx]);

  useEffect(()=>{
    if(game.status==="reveal"&&!revealedRef.current){
      revealedRef.current=true;
      const q=game.questions[idx];
      if(!q)return;
      if(myAnswerForQ===undefined)playSound("wrong");
      else if(myAnswerForQ.choice===q.correct){
        playSound("correct");
        const gained=myScore-prevScoreRef.current;
        if(gained>0){setEarnedPts(gained);setShowFloat(true);}
      } else playSound("wrong");
    }
    if(game.status==="active"){
      revealedRef.current=false;
      prevScoreRef.current=myScore;
    }
  },[game.status,idx]);

  // LOBBY
  if(game.status==="lobby")return(
    <div style={{textAlign:"center",paddingTop:50,animation:"fadeSlideDown .5s ease both"}}>
      <Logo size={34}/>
      <h2 style={{marginTop:16,fontSize:19,color:"rgba(255,255,255,.75)"}}>{game.title}</h2>
      <div style={{marginTop:50}}>
        <div style={{fontSize:62,animation:"bounceY .7s ease infinite",display:"inline-block"}}>🎉</div>
        <h3 style={{fontSize:23,marginTop:16,fontWeight:800}}>You're In!</h3>
        <p style={{color:"rgba(255,255,255,.4)",marginTop:10,fontSize:15}}>Waiting for the host to start...</p>
      </div>
      <div style={{marginTop:30,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",
        borderRadius:14,padding:"13px 22px",display:"inline-block"}}>
        <Users size={15} style={{verticalAlign:"-3px",marginRight:8,color:"#2ec4b6"}}/>
        <span style={{fontSize:14,color:"rgba(255,255,255,.4)"}}>
          {Object.keys(game.players||{}).length} players in lobby
        </span>
      </div>
    </div>
  );

  // ACTIVE
  if(game.status==="active"){
    const q=game.questions[idx];
    if(!q)return null;

    if(myAnswerForQ!==undefined)return(
      <div style={{animation:"fadeSlideDown .4s ease both"}}>
        <div style={{textAlign:"center",paddingTop:40,marginBottom:20}}>
          <div style={{fontSize:62,animation:"bounceY .6s ease infinite",display:"inline-block"}}>⚡</div>
          <h3 style={{fontSize:21,marginTop:16,color:"#F5D90A",fontWeight:800}}>Answer Locked In!</h3>
          <p style={{color:"rgba(255,255,255,.4)",marginTop:8}}>Waiting for others...</p>
        </div>
      </div>
    );

    return(
      <div style={{animation:"fadeSlideDown .4s ease both"}}>
        {showBuzzer&&(
          <CountdownOverlay
            label={idx===0?"Quiz is Starting!":"Next Question"}
            onDone={()=>setShowBuzzer(false)}
          />
        )}

        {/* TOP */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{background:"rgba(255,255,255,.07)",borderRadius:999,padding:"8px 14px",fontSize:14}}>
            Q {idx+1} / {game.questions.length}
          </span>
          <span style={{color:"#F5D90A",fontWeight:800,fontSize:14,
            background:"rgba(245,217,10,.08)",padding:"8px 14px",borderRadius:999}}>
            ⭐ {game.sessionPts||1000} pts
          </span>
        </div>

        {/* TIMER + QUESTION */}
        <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:18}}>
          <CircularTimer duration={Q_TIME} questionKey={idx} onExpire={()=>onAnswer(-1)}/>
          <div className="q-enter" style={{flex:1,background:"rgba(255,255,255,.04)",
            border:"1px solid rgba(255,255,255,.07)",borderRadius:18,
            padding:"20px 22px",display:"flex",alignItems:"center",minHeight:96}}>
            <h2 style={{fontSize:19,fontWeight:800,lineHeight:1.4}}>{q.q}</h2>
          </div>
        </div>

        {/* ANSWER BUTTONS */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
          {q.options.map((opt,i)=>{
            const isSel=selectedAnswer===i;
            const isDis=selectedAnswer!==null&&!isSel;
            return(
              <button key={i}
                className={`answer-btn btn-pop-${i}${isDis?" disabled":""}`}
                onClick={()=>{
                  if(selectedAnswer!==null)return;
                  setSelectedAnswer(i);onAnswer(i);
                }}
                style={{
                  background:isSel?`${COLORS[i]}aa`:COLORS[i],
                  boxShadow:isSel?`0 2px 8px ${COLORS[i]}33`:`0 5px 20px ${COLORS[i]}55`,
                  transform:isSel?"scale(.96)":"scale(1)",
                }}>
                <span style={{fontSize:24,filter:"drop-shadow(0 2px 5px rgba(0,0,0,.4))"}}>{SHAPES[i]}</span>
                <span style={{fontSize:15,lineHeight:1.3,fontWeight:800}}>{opt}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // REVEAL
  if(game.status==="reveal"){
    const q=game.questions[idx];
    if(!q)return null;
    const correct=myAnswerForQ!==undefined&&myAnswerForQ.choice===q.correct;
    const noAnswer=myAnswerForQ===undefined;
    return(
      <div style={{animation:"fadeSlideDown .4s ease both"}}>
        {showFloat&&<FloatScore pts={earnedPts} onDone={()=>setShowFloat(false)}/>}

        {/* RESULT */}
        <div style={{textAlign:"center",marginBottom:20,padding:"28px 20px",
          background:correct?"rgba(46,196,182,.08)":noAnswer?"rgba(244,162,97,.08)":"rgba(230,57,70,.08)",
          border:`2px solid ${correct?"rgba(46,196,182,.35)":noAnswer?"rgba(244,162,97,.25)":"rgba(230,57,70,.35)"}`,
          borderRadius:20}}>
          <div style={{fontSize:58,animation:correct?"bounceY .5s ease":"shake .4s ease"}}>
            {noAnswer?"⏰":correct?"🎯":"❌"}
          </div>
          <h2 style={{fontSize:24,fontWeight:900,marginTop:10,
            color:correct?"#2ec4b6":noAnswer?"#f4a261":"#e63946"}}>
            {noAnswer?"Time's Up!":correct?"Correct!":"Wrong Answer!"}
          </h2>
          {!noAnswer&&!correct&&(
            <p style={{color:"rgba(255,255,255,.45)",marginTop:6,fontSize:14}}>
              Correct: <strong style={{color:"#2ec4b6"}}>{q.options[q.correct]}</strong>
            </p>
          )}
        </div>

        {/* SCORE + RANK */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div style={{background:"rgba(245,217,10,.1)",border:"2px solid rgba(245,217,10,.28)",
            borderRadius:16,padding:"20px",textAlign:"center"}}>
            <p style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:8,letterSpacing:1,textTransform:"uppercase"}}>Your Score</p>
            <p style={{fontSize:42,fontWeight:900,color:"#F5D90A",
              animation:"scaleIn .5s cubic-bezier(.34,1.56,.64,1)",
              textShadow:"0 0 18px rgba(245,217,10,.4)"}}>{myScore}</p>
            {correct&&earnedPts>0&&(
              <p style={{fontSize:13,color:"#2ec4b6",marginTop:6,fontWeight:700}}>+{earnedPts} this round!</p>
            )}
          </div>
          <div style={{background:"rgba(46,196,182,.1)",border:"2px solid rgba(46,196,182,.28)",
            borderRadius:16,padding:"20px",textAlign:"center"}}>
            <p style={{fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:8,letterSpacing:1,textTransform:"uppercase"}}>Your Rank</p>
            <p style={{fontSize:42,fontWeight:900,color:"#2ec4b6",
              animation:"scaleIn .5s cubic-bezier(.34,1.56,.64,1) .1s both",
              textShadow:"0 0 18px rgba(46,196,182,.4)"}}>#{myRank}</p>
          </div>
        </div>
      </div>
    );
  }

  // ENDED
  if(game.status==="ended"){
    const isTop3=myRank<=3;
    return(
      <div style={{textAlign:"center",animation:"fadeSlideDown .5s ease both"}}>
        {isTop3&&<Confetti/>}
        <div style={{fontSize:62,animation:"bounceY .7s ease infinite"}}>{isTop3?["🥇","🥈","🥉"][myRank-1]:"🎮"}</div>
        <h2 style={{fontSize:25,fontWeight:900,marginTop:14}}>Quiz Over!</h2>
        <div style={{margin:"20px auto",background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(255,255,255,.08)",borderRadius:18,
          padding:"22px 32px",display:"inline-block",minWidth:240}}>
          <p style={{fontSize:12,color:"rgba(255,255,255,.35)",marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>Final Score</p>
          <p style={{fontSize:50,fontWeight:900,color:"#F5D90A",lineHeight:1,animation:"scaleIn .5s ease"}}>{myScore}</p>
          <p style={{fontSize:16,color:"rgba(255,255,255,.5)",marginTop:8}}>Rank #{myRank}</p>
        </div>
        <div style={{marginTop:18,maxWidth:440,margin:"18px auto 0"}}>
          {ranked.slice(0,5).map((p,i)=>(
            <div key={p.pid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 16px",
              background:p.pid===playerId?"rgba(108,92,231,.2)":"rgba(255,255,255,.04)",
              border:`1px solid ${p.pid===playerId?"rgba(108,92,231,.45)":"rgba(255,255,255,.06)"}`,
              borderRadius:12,marginBottom:8,animation:`rankSlide .4s ease ${i*.08}s both`}}>
              <span style={{display:"flex",alignItems:"center",gap:10,fontWeight:600}}>
                <span style={{fontSize:18}}>{["🥇","🥈","🥉"][i]||`${i+1}.`}</span>
                {p.name}{p.pid===playerId?" (you)":""}
              </span>
              <span style={{fontWeight:800,fontSize:17,color:"#F5D90A"}}>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App(){
  const[role,setRole]=useState(null);
  const[code,setCode]=useState(null);
  const[playerId,setPlayerId]=useState(null);
  const[game,setGame]=useState(null);
  const[error,setError]=useState("");

  useEffect(()=>{
    if(!code)return;
    const unsub=subscribeGame(code,g=>setGame(g));
    return unsub;
  },[code]);

  const refresh=async(mutator)=>{
    const fresh=(await loadGame(code))||game;
    const updated=mutator(fresh);
    await saveGame(code,updated);
    setGame(updated);
  };

  const handleHost=async(title,questions,sessionPts=1000)=>{
    playSound("join");playLobbyMusic();
    const c=genCode();
    const init={code:c,title,questions,sessionPts,status:"lobby",currentIndex:-1,players:{},answers:{},createdAt:Date.now()};
    await saveGame(c,init);setGame(init);setCode(c);setRole("host");
  };

  const handleJoin=async(c,name,setErr)=>{
    setErr("");
    const g=await loadGame(c);
    if(!g){setErr("❌ Invalid code. Please check and try again.");return;}
    const existing=Object.values(g.players||{}).map(p=>p.name.toLowerCase().trim());
    if(existing.includes(name.toLowerCase().trim())){
      setErr("❌ This name is already taken. Choose a different name.");return;
    }
    playSound("playerJoin");playLobbyMusic();
    const pid=genId();
    const updated={...g,players:{...g.players,[pid]:{name,score:0}}};
    await saveGame(c,updated);setGame(updated);setPlayerId(pid);setCode(c);setRole("player");
  };

  const handleStart  =()=>{playSound("start");refresh(g=>({...g,status:"active",currentIndex:0,questionStartedAt:Date.now()}));};
  const handleReveal =()=>{stopBgMusic();refresh(g=>({...g,status:"reveal"}));};
  const handleNext   =()=>{stopBgMusic();refresh(g=>({...g,status:"active",currentIndex:g.currentIndex+1,questionStartedAt:Date.now()}));};
  const handleEnd    =()=>{stopBgMusic();setTimeout(()=>playSound("victory"),200);refresh(g=>({...g,status:"ended"}));};
  const handleAnswer =(choice)=>{
    if(choice>=0)playSound("tick");
    refresh(g=>{
      const idx=g.currentIndex;
      const time=Date.now()-(g.questionStartedAt||Date.now());
      const answers={...(g.answers||{})};
      answers[idx]={...(answers[idx]||{}),[playerId]:{choice,time}};
      return{...g,answers};
    });
  };

  return(
    <Shell>
      {!role&&<Home onHost={handleHost} onJoin={handleJoin}/>}
      {role&&!game&&(
        <div style={{textAlign:"center",paddingTop:100}}>
          <div style={{fontSize:36,animation:"bounceY .7s ease infinite"}}>⏳</div>
          <p style={{marginTop:16,color:"rgba(255,255,255,.35)"}}>Loading...</p>
        </div>
      )}
      {role==="host"&&game&&game.status==="lobby"  &&<HostLobby  code={code} game={game} onStart={handleStart}/>}
      {role==="host"&&game&&game.status==="active" &&<HostActive game={game} onReveal={handleReveal}/>}
      {role==="host"&&game&&game.status==="reveal" &&<HostReveal game={game} onNext={handleNext} onEnd={handleEnd}/>}
      {role==="host"&&game&&game.status==="ended"  &&<HostEnded  game={game}/>}
      {role==="player"&&game&&<PlayerLive playerId={playerId} game={game} onAnswer={handleAnswer}/>}
      {error&&<p style={{color:"#e63946",textAlign:"center",marginTop:12}}>{error}</p>}
    </Shell>
  );
}
