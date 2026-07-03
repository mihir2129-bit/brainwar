import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Users, Play, ArrowRight, Trophy, Check, X, Zap, Upload, Crown } from "lucide-react";

const COLORS  = ["#e63946","#2ec4b6","#f4a261","#6c5ce7"];
const SHAPES  = ["▲","◆","●","■"];
const LABELS  = ["A","B","C","D"];
const Q_TIME  = 15;

const DEFAULT_QUIZZES = [
  { title:"General Knowledge", questions:[
    {q:"Capital of Japan?",           options:["Seoul","Beijing","Tokyo","Bangkok"],     correct:2},
    {q:"Which is the Red Planet?",    options:["Venus","Mars","Jupiter","Saturn"],       correct:1},
    {q:"How many continents?",        options:["5","6","7","8"],                         correct:2},
    {q:"Who painted Mona Lisa?",      options:["Van Gogh","Da Vinci","Picasso","Monet"],correct:1},
    {q:"Largest ocean?",              options:["Atlantic","Indian","Arctic","Pacific"],  correct:3},
  ]},
  { title:"Science Basics", questions:[
    {q:"Gas plants absorb?",          options:["Oxygen","Nitrogen","CO2","Hydrogen"],    correct:2},
    {q:"H2O is?",                     options:["Salt","Water","Sugar","Oxygen"],         correct:1},
    {q:"Bones in human body?",        options:["206","150","300","180"],                 correct:0},
    {q:"Force pulling to Earth?",     options:["Magnetism","Friction","Gravity","Tension"],correct:2},
    {q:"Smallest unit of life?",      options:["Atom","Cell","Molecule","Tissue"],       correct:1},
  ]},
];

// ── SOUND ─────────────────────────────────────────────────────────────────────
let _ctx=null, _muted=false, _musicNodes=[], _loopTimer=null;
const getCtx=()=>{ if(!_ctx)_ctx=new(window.AudioContext||window.webkitAudioContext)(); return _ctx; };
function beep(f=440,d=0.12,v=0.3,t="sine",delay=0){
  if(_muted)return;
  try{const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type=t;
    o.frequency.setValueAtTime(f,ctx.currentTime+delay);
    g.gain.setValueAtTime(v,ctx.currentTime+delay);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+d);
    o.start(ctx.currentTime+delay);o.stop(ctx.currentTime+delay+d+0.05);
  }catch{}
}
const SFX={
  join()      {beep(600,.08,.2,"sine");beep(900,.1,.2,"sine",.1);},
  start()     {[330,415,523,659,784].forEach((f,i)=>beep(f,.18,.2,"triangle",i*.1));},
  correct()   {[523,659,784,1047].forEach((f,i)=>beep(f,.15,.25,"sine",i*.09));},
  wrong()     {beep(180,.4,.3,"sawtooth");beep(140,.3,.2,"sawtooth",.15);},
  tick()      {beep(880,.05,.15,"square");},
  urgentTick(){beep(1100,.05,.25,"square");},
  victory()   {[523,523,784,659,880].forEach((f,i)=>beep(f,.22,.25,"triangle",i*.13));beep(1047,.5,.3,"triangle",.7);},
  playerJoin(){beep(440,.06,.2,"sine");beep(660,.1,.25,"sine",.08);beep(880,.12,.2,"sine",.18);},
  countIn()   {beep(440,.08,.2,"sine");},
};
function playSound(n){if(!_muted)try{SFX[n]?.();}catch{}}
function stopBgMusic(){clearTimeout(_loopTimer);_musicNodes.forEach(n=>{try{n.stop?n.stop():n.disconnect();}catch{}});_musicNodes=[];}
function playLobbyMusic(){
  if(_muted)return; stopBgMusic();
  [261,330,392,523,392,330].forEach((freq,i)=>{
    const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type="sine";o.frequency.value=freq;
    const t0=ctx.currentTime+i*.28;
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.05,t0+.06);g.gain.exponentialRampToValueAtTime(.001,t0+.26);
    o.start(t0);o.stop(t0+.3);_musicNodes.push(o,g);
  });
  _loopTimer=setTimeout(()=>{if(!_muted)playLobbyMusic();},6*280+400);
}
function playGameMusic(){
  if(_muted)return; stopBgMusic();
  [130,0,146,0,130,0,110,0].forEach((freq,i)=>{
    if(!freq)return;
    const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type="triangle";o.frequency.value=freq;
    const t0=ctx.currentTime+i*.22;
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.07,t0+.04);g.gain.linearRampToValueAtTime(0,t0+.18);
    o.start(t0);o.stop(t0+.22);_musicNodes.push(o,g);
  });
  _loopTimer=setTimeout(()=>{if(!_muted)playGameMusic();},8*220+200);
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
    import("firebase/database").then(({ref,onValue,off})=>{const r=ref(window._fbDb,`games/${code}`);onValue(r,s=>{if(s.exists())cb(s.val())});unsub=()=>off(r);});
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
    // Sort by time to find order
    const correct=Object.entries(answers)
      .filter(([,a])=>a.choice===q.correct)
      .sort((a,b)=>a[1].time-b[1].time);
    correct.forEach(([pid,a],rank)=>{
      if(rank===0){
        // First correct = full points
        scores[pid]=(scores[pid]||0)+maxPts;
      } else {
        // Subsequent = time-based deduction (min 10%)
        const ratio=Math.max(0.1, 1-a.time/(Q_TIME*1000));
        scores[pid]=(scores[pid]||0)+Math.round(maxPts*ratio);
      }
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

// ── CSS ───────────────────────────────────────────────────────────────────────
const css=`
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#1a1a2e;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow-x:hidden;}
  button,input{font-family:inherit;}

  @keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes popIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes slideIn{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:translateX(0)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
  @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(108,92,231,0.4)}50%{box-shadow:0 0 40px rgba(108,92,231,0.8)}}
  @keyframes countPulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:0.7}100%{transform:scale(1);opacity:1}}
  @keyframes correctFlash{0%{background:#2ec4b6}50%{background:#00ff88}100%{background:#2ec4b6}}
  @keyframes wrongShake{0%,100%{transform:translateX(0);background:#e63946}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  @keyframes scoreCount{from{transform:scale(0.8) translateY(-10px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
  @keyframes floatUp{from{transform:translateY(0);opacity:1}to{transform:translateY(-60px);opacity:0}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes firework{0%{transform:scale(0);opacity:1}100%{transform:scale(3);opacity:0}}
  @keyframes rankSlide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
  @keyframes timerPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}

  .fade-in{animation:fadeIn .4s ease forwards;}
  .pop-in{animation:popIn .35s cubic-bezier(.34,1.56,.64,1) forwards;}
  .slide-up{animation:slideUp .4s ease forwards;}
  .bounce{animation:bounce .6s ease infinite;}

  .btn-answer{
    border:none;border-radius:12px;padding:18px 14px;font-weight:800;font-size:16px;
    cursor:pointer;transition:transform .1s,filter .1s;position:relative;overflow:hidden;
    display:flex;align-items:center;gap:12px;color:#fff;text-align:left;
  }
  .btn-answer:hover{transform:scale(1.03);filter:brightness(1.1);}
  .btn-answer:active{transform:scale(0.97);}
  .btn-answer::before{content:'';position:absolute;inset:0;background:rgba(255,255,255,.08);opacity:0;transition:opacity .2s;}
  .btn-answer:hover::before{opacity:1;}

  .answer-selected{animation:pulse .3s ease;}
  .answer-correct{animation:correctFlash .5s ease;}
  .answer-wrong{animation:wrongShake .4s ease;}

  .score-float{
    position:fixed;font-size:24px;font-weight:900;color:#F5D90A;
    pointer-events:none;z-index:999;animation:floatUp 1.2s ease forwards;
  }
`;

// ── FLOATING SCORE ────────────────────────────────────────────────────────────
function FloatScore({pts, x, y, onDone}){
  useEffect(()=>{const t=setTimeout(onDone,1200);return()=>clearTimeout(t);},[]);
  return <div className="score-float" style={{left:x,top:y}}>+{pts}</div>;
}

// ── MUTE ──────────────────────────────────────────────────────────────────────
function MuteBtn(){
  const[m,setM]=useState(false);
  return(
    <button onClick={()=>{_muted=!_muted;setM(_muted);if(_muted)stopBgMusic();}} style={{
      position:"fixed",top:14,right:16,zIndex:999,background:"rgba(255,255,255,.1)",
      backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,.2)",
      color:"#fff",borderRadius:999,width:42,height:42,fontSize:18,cursor:"pointer",
      display:"flex",alignItems:"center",justifyContent:"center",
    }}>{m?"🔇":"🔊"}</button>
  );
}

// ── LAYOUT ────────────────────────────────────────────────────────────────────
function Shell({children}){
  return(
    <>
      <style>{css}</style>
      <MuteBtn/>
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",
        display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px 60px"}}>
        <div style={{width:"100%",maxWidth:860}}>{children}</div>
      </div>
    </>
  );
}

function Card({children,style}){
  return(
    <div className="fade-in" style={{background:"rgba(255,255,255,.05)",backdropFilter:"blur(20px)",
      border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:28,...style}}>
      {children}
    </div>
  );
}

function Btn({children,onClick,color="#6C5CE7",style,disabled}){
  return(
    <button onClick={onClick} disabled={disabled} style={{
      background:disabled?"#333":color,color:color==="#F5D90A"?"#14122B":"#fff",
      border:"none",borderRadius:12,padding:"14px 24px",fontWeight:700,fontSize:15,
      opacity:disabled?.5:1,boxShadow:disabled?"none":`0 4px 15px ${color}66`,
      display:"inline-flex",alignItems:"center",gap:8,justifyContent:"center",
      cursor:disabled?"not-allowed":"pointer",transition:"all .2s",
      ...style,
    }}
    onMouseEnter={e=>{if(!disabled)e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";}}
    >{children}</button>
  );
}

function Input(props){
  return <input {...props} style={{width:"100%",padding:"13px 16px",borderRadius:12,
    border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",
    color:"#fff",fontSize:15,outline:"none",...props.style}}/>;
}

// ── LOGO ──────────────────────────────────────────────────────────────────────
function Logo({size=32}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:size,animation:"spin 4s linear infinite",display:"inline-block"}}>⚔️</span>
      <span style={{fontSize:size*.9,fontWeight:900,letterSpacing:"-1px"}}>
        Brain<span style={{color:"#e63946"}}>War</span>
      </span>
    </div>
  );
}

// ── TIMER BAR ─────────────────────────────────────────────────────────────────
function TimerBar({duration, questionKey, onExpire}){
  const[left,setLeft]=useState(duration);
  const startRef=useRef(Date.now());
  const doneRef=useRef(false);
  const lastSecRef=useRef(duration);

  useEffect(()=>{
    doneRef.current=false; startRef.current=Date.now(); setLeft(duration); lastSecRef.current=duration;
    const id=setInterval(()=>{
      const elapsed=(Date.now()-startRef.current)/1000;
      const rem=Math.max(0,duration-elapsed);
      setLeft(rem);
      const cur=Math.ceil(rem);
      if(cur!==lastSecRef.current){lastSecRef.current=cur;if(rem>0){rem<=5?playSound("urgentTick"):playSound("tick");}}
      if(rem<=0&&!doneRef.current){doneRef.current=true;clearInterval(id);playSound("wrong");onExpire?.();}
    },100);
    return()=>clearInterval(id);
  },[questionKey]);

  const pct=(left/duration)*100;
  const color=left>8?"#2ec4b6":left>4?"#F5D90A":"#e63946";
  const urgent=left<=5;

  return(
    <div style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:13,color:"rgba(255,255,255,.6)"}}>⏱ Time left</span>
        <span style={{fontWeight:900,fontSize:28,color,
          animation:urgent?"countPulse .5s infinite":"none",
          textShadow:urgent?`0 0 20px ${color}`:"none"}}>
          {Math.ceil(left)}
        </span>
      </div>
      <div style={{height:12,background:"rgba(255,255,255,.1)",borderRadius:99,overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,.05)",}}/>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color}88,${color})`,
          borderRadius:99,transition:"width .15s linear,background .5s",
          boxShadow:`0 0 10px ${color}`}}/>
      </div>
    </div>
  );
}

// ── CSV IMPORT ────────────────────────────────────────────────────────────────
function CSVImport({onImport}){
  const ref=useRef(); const[msg,setMsg]=useState("");
  const handle=e=>{
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{const qs=parseCSV(ev.target.result);
      if(!qs.length)setMsg("❌ Format sahi nahi");
      else{onImport(qs);setMsg(`✅ ${qs.length} questions import!`);}};
    r.readAsText(file);e.target.value="";
  };
  return(
    <div style={{marginTop:14,background:"rgba(108,92,231,.15)",borderRadius:14,padding:14,border:"1px solid rgba(108,92,231,.3)"}}>
      <p style={{fontSize:13,color:"rgba(255,255,255,.7)",marginBottom:8}}>📁 CSV se questions import karo</p>
      <p style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:10,fontFamily:"monospace",
        background:"rgba(0,0,0,.3)",padding:"8px 10px",borderRadius:8,lineHeight:1.8}}>
        Question,OptionA,OptionB,OptionC,OptionD,CorrectIndex<br/>
        2+2?,1,2,3,4,3 &nbsp;<span style={{color:"#2ec4b6"}}>(0=A 1=B 2=C 3=D)</span>
      </p>
      <input ref={ref} type="file" accept=".csv,.txt" onChange={handle} style={{display:"none"}}/>
      <Btn color="#6C5CE7" onClick={()=>ref.current.click()} style={{width:"100%"}}><Upload size={15}/> File choose karo</Btn>
      {msg&&<p style={{fontSize:13,color:"#2ec4b6",marginTop:8}}>{msg}</p>}
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function Home({onHost,onJoin}){
  const autoJoin=new URLSearchParams(window.location.search).get("join");
  const[mode,setMode]=useState(autoJoin?"join":null);
  const[code,setCode]=useState("");
  const[name,setName]=useState("");
  const[err,setErr]=useState("");
  const[joining,setJoining]=useState(false);

  return(
    <div>
      <div style={{textAlign:"center",padding:"40px 0 36px",animation:"fadeIn .6s ease"}}>
        <Logo size={38}/>
        <p style={{color:"rgba(255,255,255,.5)",marginTop:12,fontSize:15}}>Live quiz battles — real-time mein sabke saath khelo</p>
      </div>

      {!mode&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div className="pop-in" style={{animationDelay:".1s"}}>
            <Card style={{textAlign:"center",cursor:"pointer",border:"2px solid rgba(230,57,70,.3)",
              background:"linear-gradient(135deg,rgba(230,57,70,.15),rgba(230,57,70,.05))"}}>
              <div style={{fontSize:52,marginBottom:12}}>🎛️</div>
              <h3 style={{fontSize:18,marginBottom:6}}>Host karo</h3>
              <p style={{color:"rgba(255,255,255,.5)",fontSize:13,marginBottom:20,lineHeight:1.5}}>Quiz banao, code share karo, live chalao</p>
              <Btn color="#e63946" onClick={()=>setMode("host")} style={{width:"100%"}}>
                <Play size={16}/> Game banao
              </Btn>
            </Card>
          </div>
          <div className="pop-in" style={{animationDelay:".2s"}}>
            <Card style={{textAlign:"center",cursor:"pointer",border:"2px solid rgba(46,196,182,.3)",
              background:"linear-gradient(135deg,rgba(46,196,182,.15),rgba(46,196,182,.05))"}}>
              <div style={{fontSize:52,marginBottom:12}}>🙋</div>
              <h3 style={{fontSize:18,marginBottom:6}}>Join karo</h3>
              <p style={{color:"rgba(255,255,255,.5)",fontSize:13,marginBottom:20,lineHeight:1.5}}>6-digit code dalo aur game mein ghuso</p>
              <Btn color="#2ec4b6" onClick={()=>setMode("join")} style={{width:"100%"}}>
                <ArrowRight size={16}/> Join karo
              </Btn>
            </Card>
          </div>
        </div>
      )}

      {mode==="join"&&(
        <div className="slide-up" style={{maxWidth:420,margin:"0 auto"}}>
          <Card>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:40,marginBottom:8}}>🎮</div>
              <h2 style={{fontSize:22}}>Game Join karo</h2>
            </div>
            {err&&<div style={{background:"rgba(230,57,70,.2)",border:"1px solid #e63946",
              borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:14,color:"#ff8a94"}}>{err}</div>}
            <label style={{fontSize:13,color:"rgba(255,255,255,.5)",display:"block",marginBottom:6}}>Game Code</label>
            <Input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
              placeholder="_ _ _ _ _ _"
              style={{fontSize:28,letterSpacing:8,textAlign:"center",marginBottom:16,fontWeight:800}}/>
            <label style={{fontSize:13,color:"rgba(255,255,255,.5)",display:"block",marginBottom:6}}>Tumhara Naam</label>
            <Input value={name} onChange={e=>setName(e.target.value.slice(0,18))}
              placeholder="e.g. Captain Waffle" style={{marginBottom:20}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn color="rgba(255,255,255,.1)" onClick={()=>setMode(null)} style={{flex:1,boxShadow:"none"}}>← Back</Btn>
              <Btn color="#2ec4b6" disabled={code.length!==6||!name.trim()||joining}
                onClick={async()=>{setJoining(true);await onJoin(code,name.trim(),setErr);setJoining(false);}} style={{flex:2}}>
                {joining?"Joining...":"Join Game 🚀"}
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {mode==="host"&&<HostSetup onBack={()=>setMode(null)} onHost={onHost}/>}
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
    <div className="slide-up">
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:22}}>🎯 Quiz Banao</h2>
          <button onClick={onBack} style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",fontSize:13,cursor:"pointer"}}>← Back</button>
        </div>

        <label style={{fontSize:13,color:"rgba(255,255,255,.5)",display:"block",marginBottom:6}}>Quiz Title</label>
        <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Friday Trivia Night" style={{marginBottom:20}}/>

        {/* POINTS */}
        <div style={{background:"rgba(245,217,10,.08)",border:"1px solid rgba(245,217,10,.2)",borderRadius:14,padding:16,marginBottom:20}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,.6)",marginBottom:12}}>⭐ Har question ke points (saare questions ke liye same)</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[100,250,500,1000,2000,5000].map(p=>(
              <button key={p} onClick={()=>setSessionPts(p)} style={{
                background:sessionPts===p?"#F5D90A":"rgba(255,255,255,.08)",
                color:sessionPts===p?"#14122B":"#fff",
                border:`2px solid ${sessionPts===p?"#F5D90A":"transparent"}`,
                borderRadius:10,padding:"10px 18px",fontWeight:800,fontSize:15,cursor:"pointer",
                transition:"all .2s",transform:sessionPts===p?"scale(1.1)":"scale(1)",
              }}>{p}</button>
            ))}
          </div>
          <p style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:10}}>
            ✅ Pehla sahi jawab → <strong style={{color:"#F5D90A"}}>{sessionPts} pts</strong> &nbsp;|&nbsp;
            ⚡ Baad mein → time ke hisaab se kam
          </p>
        </div>

        {/* TEMPLATES */}
        <div style={{marginBottom:20}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:10}}>📚 Template load karo:</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {DEFAULT_QUIZZES.map(dq=>(
              <button key={dq.title} onClick={()=>{setTitle(dq.title);setQuestions(dq.questions.map(q=>({...q})));}}
                style={{background:"rgba(108,92,231,.2)",border:"1px solid rgba(108,92,231,.4)",
                  color:"#fff",borderRadius:20,padding:"8px 16px",fontSize:13,cursor:"pointer"}}>
                {dq.title} ({dq.questions.length}q)
              </button>
            ))}
          </div>
        </div>

        <CSVImport onImport={qs=>setQuestions(prev=>[...prev,...qs])}/>

        {/* QUESTION LIST */}
        {questions.length>0&&(
          <div style={{margin:"20px 0",padding:"16px 0",borderTop:"1px solid rgba(255,255,255,.08)"}}>
            <p style={{fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:12}}>📋 Questions ({questions.length})</p>
            {questions.map((q,i)=>(
              <div key={i} className="fade-in" style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                background:"rgba(255,255,255,.05)",borderRadius:10,padding:"10px 14px",marginBottom:8,
                border:"1px solid rgba(255,255,255,.08)"}}>
                <span style={{fontSize:14}}>{i+1}. {q.q}</span>
                <button onClick={()=>setQuestions(questions.filter((_,idx)=>idx!==i))}
                  style={{background:"none",border:"none",color:"#e63946",cursor:"pointer",fontSize:18}}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* ADD QUESTION */}
        <div style={{background:"rgba(255,255,255,.03)",borderRadius:14,padding:16,border:"1px solid rgba(255,255,255,.08)"}}>
          <p style={{fontSize:14,fontWeight:700,marginBottom:12}}>➕ Question add karo</p>
          <Input value={draft.q} onChange={e=>setDraft({...draft,q:e.target.value})} placeholder="Question likho..." style={{marginBottom:12}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {draft.options.map((opt,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setDraft({...draft,correct:i})} style={{
                  width:34,height:34,flexShrink:0,borderRadius:8,border:"2px solid",
                  borderColor:draft.correct===i?"#2ec4b6":"rgba(255,255,255,.2)",
                  background:draft.correct===i?"#2ec4b6":"transparent",
                  color:"#fff",cursor:"pointer",fontWeight:800,fontSize:12,
                }}>{draft.correct===i?"✓":LABELS[i]}</button>
                <Input value={opt} onChange={e=>{const opts=[...draft.options];opts[i]=e.target.value;setDraft({...draft,options:opts});}} placeholder={`Option ${LABELS[i]}`}/>
              </div>
            ))}
          </div>
          <Btn onClick={addQ} color="#F5D90A" style={{marginTop:14,width:"100%"}}><Plus size={15}/> Add Question</Btn>
        </div>

        <Btn color="#e63946" style={{width:"100%",marginTop:20,fontSize:17,padding:"16px"}}
          disabled={!title.trim()||questions.length===0}
          onClick={()=>onHost(title.trim(),questions,sessionPts)}>
          🚀 Game Create Karo & Code Lo
        </Btn>
      </Card>
    </div>
  );
}

// ── HOST LOBBY ────────────────────────────────────────────────────────────────
function HostLobby({code,game,onStart}){
  const players=Object.entries(game.players||{});
  const[copied,setCopied]=useState(false);
  const prevCount=useRef(0);
  const joinLink=`${window.location.origin}${window.location.pathname}?join=${code}`;

  useEffect(()=>{
    if(players.length>prevCount.current&&players.length>0)playSound("playerJoin");
    prevCount.current=players.length;
  },[players.length]);

  return(
    <div className="fade-in">
      <div style={{textAlign:"center",marginBottom:24}}>
        <Logo size={30}/>
        <h2 style={{fontSize:16,color:"rgba(255,255,255,.5)",marginTop:8,fontWeight:400}}>{game.title}</h2>
      </div>

      <Card style={{textAlign:"center",marginBottom:16,background:"linear-gradient(135deg,rgba(108,92,231,.2),rgba(230,57,70,.1))"}}>
        <p style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:8}}>Players ko ye code do 👇</p>
        <div style={{fontSize:64,fontWeight:900,letterSpacing:12,color:"#F5D90A",
          textShadow:"0 0 30px rgba(245,217,10,.5)",fontFamily:"monospace",
          animation:"glow 2s ease infinite"}}>{code}</div>
        <p style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:8}}>{game.questions?.length} questions • {game.sessionPts} pts each</p>
      </Card>

      {/* JOIN LINK */}
      <Card style={{marginBottom:16,padding:16}}>
        <p style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:10}}>🔗 Ya seedha ye link share karo:</p>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1,fontSize:12,color:"#2ec4b6",background:"rgba(0,0,0,.3)",
            padding:"10px 12px",borderRadius:10,wordBreak:"break-all"}}>{joinLink}</div>
          <button onClick={()=>{navigator.clipboard.writeText(joinLink);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
            style={{flexShrink:0,background:copied?"#2ec4b6":"#6C5CE7",border:"none",
              borderRadius:10,color:"#fff",padding:"10px 14px",fontWeight:700,fontSize:13,cursor:"pointer",
              transition:"background .3s"}}>
            {copied?"✅":"Copy"}
          </button>
        </div>
      </Card>

      {/* PLAYERS */}
      <Card style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:16}}>
          <Users size={18} color="#2ec4b6"/>
          <span style={{fontWeight:700,fontSize:16}}>{players.length} players joined</span>
          {players.length>0&&<span className="bounce" style={{display:"inline-block"}}>🎉</span>}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",minHeight:40}}>
          {players.map(([pid,p],i)=>(
            <div key={pid} className="pop-in" style={{background:COLORS[i%4],color:"#fff",
              padding:"8px 16px",borderRadius:999,fontWeight:700,fontSize:14,
              boxShadow:`0 4px 12px ${COLORS[i%4]}66`,
              animation:`popIn .3s cubic-bezier(.34,1.56,.64,1) ${i*.05}s both`}}>
              {p.name}
            </div>
          ))}
          {players.length===0&&<p style={{color:"rgba(255,255,255,.3)",fontSize:14}}>Koi nahi aaya abhi... 👀</p>}
        </div>
      </Card>

      <Btn color="#e63946" style={{width:"100%",fontSize:18,padding:"18px",
        boxShadow:players.length>0?"0 6px 25px rgba(230,57,70,.5)":"none"}}
        disabled={players.length===0} onClick={onStart}>
        <Play size={20}/> Quiz Start Karo!
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
  const[revealed,setRevealed]=useState(false);

  const doReveal=()=>{if(!revealed){setRevealed(true);onReveal();}};

  if(!q)return null;
  return(
    <div className="fade-in">
      {/* header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{background:"rgba(255,255,255,.1)",padding:"6px 14px",borderRadius:999,fontSize:14}}>
          Q {game.currentIndex+1} / {game.questions.length}
        </span>
        <span style={{background:"rgba(46,196,182,.15)",border:"1px solid rgba(46,196,182,.3)",
          padding:"6px 14px",borderRadius:999,fontSize:14,color:"#2ec4b6"}}>
          <Users size={14} style={{verticalAlign:"-2px"}}/> {answered}/{players.length}
        </span>
      </div>

      <TimerBar duration={Q_TIME} questionKey={game.currentIndex} onExpire={doReveal}/>

      {/* question */}
      <Card style={{textAlign:"center",marginBottom:20,padding:"32px 28px",
        background:"linear-gradient(135deg,rgba(108,92,231,.15),rgba(230,57,70,.08))"}}>
        <p style={{fontSize:13,color:"rgba(255,255,255,.4)",marginBottom:12}}>⭐ {game.sessionPts} pts per correct answer</p>
        <h2 style={{fontSize:24,lineHeight:1.4,fontWeight:800}}>{q.q}</h2>
      </Card>

      {/* options grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {q.options.map((opt,i)=>(
          <div key={i} style={{background:COLORS[i],borderRadius:14,padding:"20px 16px",
            fontWeight:700,fontSize:16,display:"flex",alignItems:"center",gap:12,
            boxShadow:`0 6px 20px ${COLORS[i]}55`}}>
            <span style={{fontSize:22,flexShrink:0}}>{SHAPES[i]}</span>
            <span style={{lineHeight:1.3}}>{opt}</span>
          </div>
        ))}
      </div>

      <Btn color="#F5D90A" style={{width:"100%",fontSize:16,padding:"16px"}} onClick={doReveal}>
        Answer Dikhao 👀
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
  if(!q)return null;

  return(
    <div className="fade-in">
      <Card style={{marginBottom:16,padding:"24px 28px",
        background:"linear-gradient(135deg,rgba(46,196,182,.1),rgba(108,92,231,.08))"}}>
        <p style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:8}}>Sahi jawab tha:</p>
        <h2 style={{fontSize:22,color:"#2ec4b6",fontWeight:800}}>✅ {q.options[q.correct]}</h2>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
        {q.options.map((opt,i)=>{
          const count=Object.values(answersForQ).filter(a=>a.choice===i).length;
          const isCorrect=i===q.correct;
          return(
            <div key={i} style={{background:isCorrect?"rgba(46,196,182,.3)":"rgba(255,255,255,.05)",
              border:`2px solid ${isCorrect?"#2ec4b6":"rgba(255,255,255,.1)"}`,
              borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
              transition:"all .3s",animation:isCorrect?"correctFlash .5s ease":"none"}}>
              <span style={{fontWeight:700}}>{SHAPES[i]} {opt} {isCorrect&&"✓"}</span>
              <span style={{background:"rgba(0,0,0,.3)",padding:"4px 10px",borderRadius:999,fontSize:14,fontWeight:700}}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* leaderboard */}
      <Card>
        <h3 style={{marginBottom:14,display:"flex",alignItems:"center",gap:8}}><Trophy size={18} color="#F5D90A"/> Leaderboard</h3>
        {ranked.slice(0,5).map((p,i)=>(
          <div key={p.pid} className="slide-up" style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"12px 16px",background:i===0?"rgba(245,217,10,.15)":"rgba(255,255,255,.04)",
            borderRadius:10,marginBottom:8,border:i===0?"1px solid rgba(245,217,10,.3)":"1px solid transparent",
            animation:`rankSlide .4s ease ${i*.08}s both`}}>
            <span style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
              <span style={{fontWeight:600}}>{p.name}</span>
            </span>
            <span style={{fontWeight:800,fontSize:18,color:"#F5D90A"}}>{p.score}</span>
          </div>
        ))}
      </Card>

      <div style={{marginTop:16}}>
        {isLast
          ?<Btn color="#e63946" style={{width:"100%",fontSize:17,padding:"16px"}} onClick={onEnd}>🏆 Results Dekho!</Btn>
          :<Btn color="#6C5CE7" style={{width:"100%",fontSize:17,padding:"16px"}} onClick={onNext}>Next Question ➡️</Btn>}
      </div>
    </div>
  );
}

// ── HOST ENDED ────────────────────────────────────────────────────────────────
function HostEnded({game}){
  const players=Object.entries(game.players||{});
  const scores=computeScores(game);
  const ranked=players.map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);

  return(
    <div className="fade-in" style={{textAlign:"center"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:60,animation:"bounce .6s ease infinite"}}>🏆</div>
        <h1 style={{fontSize:28,marginTop:12}}>Quiz Khatam!</h1>
        <p style={{color:"rgba(255,255,255,.5)",fontSize:15}}>Final Results</p>
      </div>
      {ranked.map((p,i)=>(
        <div key={p.pid} className="slide-up" style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"16px 20px",margin:"0 auto 10px",maxWidth:500,
          background:i===0?"linear-gradient(135deg,rgba(245,217,10,.25),rgba(245,217,10,.1))":"rgba(255,255,255,.05)",
          border:`2px solid ${i===0?"#F5D90A":i===1?"#C0C0C0":i===2?"#CD7F32":"rgba(255,255,255,.1)"}`,
          borderRadius:14,animation:`slideUp .4s ease ${i*.1}s both`,
          transform:i===0?"scale(1.04)":"scale(1)"}}>
          <span style={{display:"flex",alignItems:"center",gap:12,fontSize:17}}>
            <span style={{fontSize:28}}>{["🥇","🥈","🥉"][i]||`${i+1}.`}</span>
            <span style={{fontWeight:700}}>{p.name}</span>
          </span>
          <span style={{fontWeight:900,fontSize:22,color:i===0?"#F5D90A":"#fff"}}>{p.score}</span>
        </div>
      ))}
    </div>
  );
}

// ── PLAYER LIVE ───────────────────────────────────────────────────────────────
function PlayerLive({playerId,game,onAnswer}){
  const idx=game.currentIndex;
  const myAnswerForQ=((game.answers||{})[idx]||{})[playerId];
  const scores=computeScores(game);
  const myScore=scores[playerId]||0;
  const ranked=Object.entries(game.players||{}).map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);
  const myRank=ranked.findIndex(r=>r.pid===playerId)+1;
  const revealedRef=useRef(false);
  const[selectedAnswer,setSelectedAnswer]=useState(null);
  const[floatScores,setFloatScores]=useState([]);

  useEffect(()=>{
    if(game.status==="reveal"&&!revealedRef.current){
      revealedRef.current=true;
      const q=game.questions[idx];
      if(!q)return;
      if(myAnswerForQ===undefined)playSound("wrong");
      else if(myAnswerForQ.choice===q.correct){
        playSound("correct");
        // float score
        const pts=scores[playerId]-(scores[playerId]-(game.sessionPts||1000));
        setFloatScores(prev=>[...prev,{id:Date.now(),pts:game.sessionPts||1000,x:window.innerWidth/2-40,y:window.innerHeight/2}]);
      }else playSound("wrong");
    }
    if(game.status==="active"){revealedRef.current=false;setSelectedAnswer(null);}
  },[game.status,idx]);

  // LOBBY
  if(game.status==="lobby")return(
    <div className="fade-in" style={{textAlign:"center",paddingTop:40}}>
      <Logo size={32}/>
      <h2 style={{marginTop:20,fontSize:20}}>{game.title}</h2>
      <div style={{marginTop:40}}>
        <div className="bounce" style={{fontSize:60,display:"inline-block"}}>🎉</div>
        <h3 style={{fontSize:22,marginTop:16}}>Tum Join Ho Gaye!</h3>
        <p style={{color:"rgba(255,255,255,.5)",marginTop:8}}>Host ke start karne ka wait karo...</p>
      </div>
      <div style={{marginTop:30,background:"rgba(255,255,255,.05)",borderRadius:14,padding:16,display:"inline-block"}}>
        <p style={{fontSize:14,color:"rgba(255,255,255,.4)"}}>
          <Users size={14} style={{verticalAlign:"-2px"}}/> {Object.keys(game.players||{}).length} players lobby mein
        </p>
      </div>
    </div>
  );

  // ACTIVE
  if(game.status==="active"){
    const q=game.questions[idx];
    if(!q)return null;
    if(myAnswerForQ!==undefined)return(
      <div className="fade-in" style={{textAlign:"center",paddingTop:40}}>
        <div className="bounce" style={{fontSize:60,display:"inline-block"}}>⚡</div>
        <h3 style={{fontSize:22,marginTop:16,color:"#F5D90A"}}>Jawab Lock Ho Gaya!</h3>
        <p style={{color:"rgba(255,255,255,.5)",marginTop:8}}>Doosre players ka wait karo...</p>
        <div style={{marginTop:24,background:"rgba(255,255,255,.05)",borderRadius:14,padding:"14px 24px",display:"inline-block"}}>
          <p style={{fontSize:15}}>Abhi tak score: <strong style={{color:"#F5D90A",fontSize:20}}>{myScore}</strong></p>
        </div>
      </div>
    );
    return(
      <div className="fade-in">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{background:"rgba(255,255,255,.1)",padding:"6px 14px",borderRadius:999,fontSize:14}}>
            Q {idx+1}/{game.questions.length}
          </span>
          <span style={{color:"#F5D90A",fontWeight:800,fontSize:16}}>⭐ {game.sessionPts||1000} pts</span>
        </div>

        <TimerBar duration={Q_TIME} questionKey={idx} onExpire={()=>onAnswer(-1)}/>

        <Card style={{textAlign:"center",marginBottom:20,padding:"28px 24px"}}>
          <h2 style={{fontSize:22,fontWeight:800,lineHeight:1.4}}>{q.q}</h2>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {q.options.map((opt,i)=>{
            const isSelected=selectedAnswer===i;
            return(
              <button key={i} className="btn-answer" onClick={()=>{
                if(selectedAnswer!==null)return;
                setSelectedAnswer(i); onAnswer(i); playSound("tick");
              }} style={{
                background:isSelected?`${COLORS[i]}cc`:COLORS[i],
                boxShadow:`0 6px 20px ${COLORS[i]}55`,
                transform:isSelected?"scale(0.96)":"scale(1)",
                opacity:selectedAnswer!==null&&!isSelected?.5:1,
                animation:isSelected?"pulse .3s ease":"none",
                minHeight:90,
              }}>
                <span style={{fontSize:28,flexShrink:0,filter:"drop-shadow(0 2px 4px rgba(0,0,0,.3))"}}>{SHAPES[i]}</span>
                <span style={{fontSize:16,lineHeight:1.3,fontWeight:800}}>{opt}</span>
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
      <div className="fade-in" style={{textAlign:"center"}}>
        {floatScores.map(fs=>(
          <FloatScore key={fs.id} pts={fs.pts} x={fs.x} y={fs.y} onDone={()=>setFloatScores(prev=>prev.filter(f=>f.id!==fs.id))}/>
        ))}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:70,animation:correct?"bounce .5s ease":"shake .4s ease"}}>
            {noAnswer?"⏰":correct?"🎯":"❌"}
          </div>
          <h2 style={{fontSize:26,marginTop:12,color:correct?"#2ec4b6":noAnswer?"#F5D90A":"#e63946"}}>
            {noAnswer?"Time Out!":correct?"Bilkul Sahi!":"Galat Jawab!"}
          </h2>
          {!noAnswer&&!correct&&<p style={{color:"rgba(255,255,255,.5)",marginTop:8}}>Sahi tha: <strong style={{color:"#2ec4b6"}}>{q.options[q.correct]}</strong></p>}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          {q.options.map((opt,i)=>{
            const isCorrect=i===q.correct;
            const myPick=myAnswerForQ?.choice===i;
            return(
              <div key={i} style={{background:isCorrect?"rgba(46,196,182,.25)":myPick?"rgba(230,57,70,.2)":"rgba(255,255,255,.05)",
                border:`2px solid ${isCorrect?"#2ec4b6":myPick?"#e63946":"rgba(255,255,255,.1)"}`,
                borderRadius:12,padding:"14px",fontWeight:700,display:"flex",alignItems:"center",gap:8,
                animation:isCorrect?"correctFlash .5s ease":myPick&&!isCorrect?"wrongShake .4s ease":"none"}}>
                <span>{SHAPES[i]}</span><span style={{fontSize:14}}>{opt}</span>
                {isCorrect&&<span style={{marginLeft:"auto"}}>✓</span>}
                {myPick&&!isCorrect&&<span style={{marginLeft:"auto"}}>✗</span>}
              </div>
            );
          })}
        </div>

        <Card style={{background:"linear-gradient(135deg,rgba(245,217,10,.1),rgba(108,92,231,.1))"}}>
          <div style={{display:"flex",justifyContent:"space-around"}}>
            <div>
              <p style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>Tumhara Score</p>
              <p style={{fontSize:32,fontWeight:900,color:"#F5D90A",animation:"scoreCount .4s ease"}}>{myScore}</p>
            </div>
            <div style={{width:1,background:"rgba(255,255,255,.1)"}}/>
            <div>
              <p style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>Rank</p>
              <p style={{fontSize:32,fontWeight:900,color:"#2ec4b6"}}>#{myRank}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ENDED
  if(game.status==="ended"){
    const isTop3=myRank<=3;
    return(
      <div className="fade-in" style={{textAlign:"center"}}>
        <div style={{fontSize:70,animation:"bounce .6s ease infinite"}}>{isTop3?["🥇","🥈","🥉"][myRank-1]:"🎮"}</div>
        <h2 style={{fontSize:26,marginTop:16}}>Quiz Khatam!</h2>
        <div style={{margin:"20px auto",background:"rgba(255,255,255,.05)",borderRadius:16,padding:"20px 30px",display:"inline-block",minWidth:260}}>
          <p style={{fontSize:15,color:"rgba(255,255,255,.5)",marginBottom:4}}>Tumhara Final Score</p>
          <p style={{fontSize:48,fontWeight:900,color:"#F5D90A",lineHeight:1}}>{myScore}</p>
          <p style={{fontSize:18,color:"rgba(255,255,255,.6)",marginTop:8}}>Rank #{myRank}</p>
        </div>
        <div style={{marginTop:20}}>
          {ranked.slice(0,5).map((p,i)=>(
            <div key={p.pid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 16px",background:p.pid===playerId?"rgba(108,92,231,.3)":"rgba(255,255,255,.04)",
              border:p.pid===playerId?"1px solid rgba(108,92,231,.6)":"1px solid transparent",
              borderRadius:12,marginBottom:8,animation:`rankSlide .4s ease ${i*.08}s both`}}>
              <span style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>{["🥇","🥈","🥉"][i]||`${i+1}.`}</span>
                <span style={{fontWeight:600}}>{p.name}{p.pid===playerId?" (tum)":""}</span>
              </span>
              <span style={{fontWeight:800,fontSize:18,color:"#F5D90A"}}>{p.score}</span>
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
    await saveGame(c,init);
    setGame(init);setCode(c);setRole("host");
  };

  const handleJoin=async(c,name,setErr)=>{
    setErr("");
    const g=await loadGame(c);
    if(!g){setErr("❌ Galat code hai, dobara check karo.");return;}
    playSound("playerJoin");playLobbyMusic();
    const pid=genId();
    const updated={...g,players:{...g.players,[pid]:{name,score:0}}};
    await saveGame(c,updated);
    setGame(updated);setPlayerId(pid);setCode(c);setRole("player");
  };

  const handleStart=()=>{playSound("start");setTimeout(()=>playGameMusic(),700);refresh(g=>({...g,status:"active",currentIndex:0,questionStartedAt:Date.now()}));};
  const handleReveal=()=>{stopBgMusic();refresh(g=>({...g,status:"reveal"}));};
  const handleNext=()=>{setTimeout(()=>playGameMusic(),300);refresh(g=>({...g,status:"active",currentIndex:g.currentIndex+1,questionStartedAt:Date.now()}));};
  const handleEnd=()=>{stopBgMusic();setTimeout(()=>playSound("victory"),300);refresh(g=>({...g,status:"ended"}));};
  const handleAnswer=(choice)=>{
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
      {role&&!game&&<div style={{textAlign:"center",paddingTop:80,fontSize:18}}>Loading...</div>}
      {role==="host"&&game&&game.status==="lobby"  &&<HostLobby  code={code} game={game} onStart={handleStart}/>}
      {role==="host"&&game&&game.status==="active" &&<HostActive game={game} onReveal={handleReveal}/>}
      {role==="host"&&game&&game.status==="reveal" &&<HostReveal game={game} onNext={handleNext} onEnd={handleEnd}/>}
      {role==="host"&&game&&game.status==="ended"  &&<HostEnded  game={game}/>}
      {role==="player"&&game&&<PlayerLive playerId={playerId} game={game} onAnswer={handleAnswer}/>}
      {error&&<p style={{color:"#e63946",textAlign:"center",marginTop:12}}>{error}</p>}
    </Shell>
  );
}
