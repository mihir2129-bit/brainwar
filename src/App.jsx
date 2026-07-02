import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Users, Play, ArrowRight, Trophy, Check, X, Zap, Upload } from "lucide-react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const COLORS = ["#FF5A5F", "#2EC4B6", "#F5D90A", "#6C5CE7"];
const SHAPES = ["▲", "◆", "●", "■"];
const QUESTION_TIME = 15;

const DEFAULT_QUIZZES = [
  {
    title: "General Knowledge",
    questions: [
      { q: "What is the capital of Japan?",        options: ["Seoul","Beijing","Tokyo","Bangkok"],     correct: 2 },
      { q: "Which planet is the Red Planet?",      options: ["Venus","Mars","Jupiter","Saturn"],       correct: 1 },
      { q: "How many continents are on Earth?",    options: ["5","6","7","8"],                         correct: 2 },
      { q: "Who painted the Mona Lisa?",           options: ["Van Gogh","Da Vinci","Picasso","Monet"], correct: 1 },
      { q: "Largest ocean on Earth?",              options: ["Atlantic","Indian","Arctic","Pacific"],  correct: 3 },
    ],
  },
  {
    title: "Science Basics",
    questions: [
      { q: "Gas plants absorb from air?",          options: ["Oxygen","Nitrogen","CO2","Hydrogen"],    correct: 2 },
      { q: "H2O is commonly known as?",            options: ["Salt","Water","Sugar","Oxygen"],         correct: 1 },
      { q: "Bones in adult human body?",           options: ["206","150","300","180"],                 correct: 0 },
      { q: "Force that pulls objects to Earth?",   options: ["Magnetism","Friction","Gravity","Tension"], correct: 2 },
      { q: "Smallest unit of life?",               options: ["Atom","Cell","Molecule","Tissue"],       correct: 1 },
    ],
  },
];

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
let _ctx = null;
let _muted = false;
let _musicNodes = [];
let _loopTimer = null;
const getCtx = () => { if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)(); return _ctx; };

function beep(freq=440, dur=0.12, vol=0.3, type="sine", delay=0) {
  if (_muted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + dur + 0.05);
  } catch {}
}

const SFX = {
  join()      { beep(600,0.08,0.2,"sine"); beep(900,0.1,0.2,"sine",0.1); },
  start()     { [330,415,523,659,784].forEach((f,i) => beep(f,0.18,0.2,"triangle",i*0.1)); },
  correct()   { [523,659,784,1047].forEach((f,i) => beep(f,0.15,0.25,"sine",i*0.09)); },
  wrong()     { beep(180,0.4,0.3,"sawtooth"); beep(140,0.3,0.2,"sawtooth",0.15); },
  tick()      { beep(880,0.05,0.15,"square"); },
  urgentTick(){ beep(1100,0.05,0.25,"square"); },
  victory()   { [523,523,784,659,880].forEach((f,i) => beep(f,0.22,0.25,"triangle",i*0.13)); beep(1047,0.5,0.3,"triangle",0.7); },
  playerJoin(){ beep(440,0.06,0.2,"sine"); beep(660,0.1,0.25,"sine",0.08); beep(880,0.12,0.2,"sine",0.18); },
};
function playSound(name) { if (!_muted) try { SFX[name]?.(); } catch {} }

function stopBgMusic() {
  clearTimeout(_loopTimer);
  _musicNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch {} });
  _musicNodes = [];
}
function playLobbyMusic() {
  if (_muted) return;
  stopBgMusic();
  const notes = [261,330,392,523,392,330];
  notes.forEach((freq,i) => {
    const ctx = getCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine"; osc.frequency.value = freq;
    const t0 = ctx.currentTime + i*0.28;
    gain.gain.setValueAtTime(0,t0); gain.gain.linearRampToValueAtTime(0.05,t0+0.06); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.26);
    osc.start(t0); osc.stop(t0+0.3); _musicNodes.push(osc,gain);
  });
  _loopTimer = setTimeout(() => { if (!_muted) playLobbyMusic(); }, notes.length*280+400);
}
function playGameMusic() {
  if (_muted) return;
  stopBgMusic();
  [130,0,146,0,130,0,110,0].forEach((freq,i) => {
    if (!freq) return;
    const ctx = getCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); osc.type = "triangle"; osc.frequency.value = freq;
    const t0 = ctx.currentTime + i*0.22;
    gain.gain.setValueAtTime(0,t0); gain.gain.linearRampToValueAtTime(0.07,t0+0.04); gain.gain.linearRampToValueAtTime(0,t0+0.18);
    osc.start(t0); osc.stop(t0+0.22); _musicNodes.push(osc,gain);
  });
  _loopTimer = setTimeout(() => { if (!_muted) playGameMusic(); }, 8*220+200);
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
async function loadGame(code) {
  try {
    if (window._fbDb) {
      const { ref, get } = await import("firebase/database");
      const snap = await get(ref(window._fbDb, `games/${code}`));
      return snap.exists() ? snap.val() : null;
    }
    const raw = localStorage.getItem("bw:"+code);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function saveGame(code, data) {
  try {
    if (window._fbDb) {
      const { ref, set } = await import("firebase/database");
      await set(ref(window._fbDb, `games/${code}`), data);
    } else {
      localStorage.setItem("bw:"+code, JSON.stringify(data));
    }
  } catch(e) { console.error(e); }
}
function subscribeGame(code, cb) {
  if (window._fbDb) {
    let unsubFn = () => {};
    import("firebase/database").then(({ ref, onValue, off }) => {
      const r = ref(window._fbDb, `games/${code}`);
      onValue(r, snap => { if (snap.exists()) cb(snap.val()); });
      unsubFn = () => off(r);
    });
    return () => unsubFn();
  }
  const id = setInterval(async () => { const g = await loadGame(code); if (g) cb(g); }, 1000);
  return () => clearInterval(id);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const genCode = () => String(Math.floor(100000 + Math.random()*900000));
const genId   = () => Math.random().toString(36).slice(2,10);

function computeScores(game) {
  const scores = {};
  const maxPts = game.sessionPts || 1000;
  Object.keys(game.players||{}).forEach(pid => (scores[pid]=0));
  (game.questions||[]).forEach((q,qi) => {
    const answers = (game.answers||{})[qi] || {};
    Object.entries(answers).forEach(([pid,a]) => {
      if (a.choice === q.correct) {
        const ratio = Math.max(0, 1 - a.time/(QUESTION_TIME*1000));
        scores[pid] = (scores[pid]||0) + Math.round(maxPts*0.1 + maxPts*0.9*ratio);
      }
    });
  });
  return scores;
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const results = [];
  const start = lines[0].toLowerCase().includes("question") ? 1 : 0;
  for (let i=start; i<lines.length; i++) {
    const cols = lines[i].split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    if (cols.length < 6) continue;
    const [q,a,b,c,d,idx] = cols;
    const correct = parseInt(idx,10);
    if (!q || isNaN(correct) || correct<0 || correct>3) continue;
    results.push({ q, options:[a,b,c,d], correct });
  }
  return results;
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const css = `
  *{box-sizing:border-box;}
  body{margin:0;background:#14122B;color:#F4F2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  button,input{font-family:inherit;}
  @keyframes popIn{from{transform:scale(0.93);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
`;

function Logo({ size=28 }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"Arial Black,Arial,sans-serif"}}>
      <span style={{fontSize:size,color:"#F5D90A"}}>⚔</span>
      <span style={{fontSize:size*0.78,fontWeight:800,letterSpacing:"-0.02em",color:"#F4F2FF"}}>
        Brain<span style={{color:"#FF5A5F"}}>War</span>
      </span>
    </div>
  );
}

function MuteBtn() {
  const [m, setM] = useState(false);
  return (
    <button onClick={() => { _muted=!_muted; setM(_muted); if(_muted) stopBgMusic(); }}
      style={{position:"fixed",top:14,right:16,zIndex:999,background:"rgba(255,255,255,0.08)",
        border:"1px solid rgba(255,255,255,0.15)",color:"#F4F2FF",borderRadius:999,
        width:38,height:38,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {m?"🔇":"🔊"}
    </button>
  );
}

function Shell({ children }) {
  return (
    <>
      <style>{css}</style>
      <MuteBtn/>
      <div style={{minHeight:"100vh",padding:"24px 16px 60px",background:"#14122B",
        backgroundImage:"radial-gradient(circle at 15% 20%,rgba(108,92,231,.18),transparent 40%),radial-gradient(circle at 85% 80%,rgba(46,196,182,.14),transparent 40%)",
        display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:"100%",maxWidth:860}}>{children}</div>
      </div>
    </>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{background:"#1D1A3D",border:"1px solid rgba(255,255,255,.07)",
      borderRadius:18,padding:24,animation:"popIn .22s ease",...style}}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, color="#6C5CE7", style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background:disabled?"#3a3760":color,
      color:color==="#F5D90A"?"#14122B":"#fff",
      border:"none",borderRadius:12,padding:"13px 22px",fontWeight:700,fontSize:15,
      opacity:disabled?0.6:1,boxShadow:disabled?"none":"0 4px 0 rgba(0,0,0,.25)",
      display:"inline-flex",alignItems:"center",gap:8,justifyContent:"center",
      cursor:disabled?"not-allowed":"pointer",...style}}>
      {children}
    </button>
  );
}

function Input(props) {
  return <input {...props} style={{width:"100%",padding:"12px 14px",borderRadius:10,
    border:"1px solid rgba(255,255,255,.15)",background:"#100E26",color:"#F4F2FF",fontSize:15,...props.style}}/>;
}

// ─── TIMER BAR ────────────────────────────────────────────────────────────────
function TimerBar({ duration, onExpire, questionKey }) {
  const [left, setLeft] = useState(duration);
  const startRef = useRef(Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    startRef.current = Date.now();
    expiredRef.current = false;
    setLeft(duration);
    let lastSec = duration;
    const id = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      setLeft(remaining);
      const curSec = Math.ceil(remaining);
      if (curSec !== lastSec) {
        lastSec = curSec;
        if (remaining > 0) {
          if (remaining <= 5) playSound("urgentTick");
          else playSound("tick");
        }
      }
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        playSound("wrong");
        onExpire?.();
      }
    }, 200);
    return () => clearInterval(id);
  }, [questionKey]);

  const pct = (left/duration)*100;
  const color = left>8?"#2EC4B6":left>4?"#F5D90A":"#FF5A5F";
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#A7A2D6",marginBottom:6}}>
        <span>⏱ Time left</span>
        <span style={{fontWeight:800,fontSize:18,color,animation:left<=5?"pulse 0.5s infinite":"none"}}>{Math.ceil(left)}s</span>
      </div>
      <div style={{height:10,background:"rgba(255,255,255,.08)",borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:99,transition:"width 0.2s linear,background 0.4s"}}/>
      </div>
    </div>
  );
}

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────
function CSVImport({ onImport }) {
  const fileRef = useRef();
  const [msg, setMsg] = useState("");
  const handle = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const qs = parseCSV(ev.target.result);
      if (qs.length===0) setMsg("❌ Format sahi nahi. Neeche format dekho.");
      else { onImport(qs); setMsg(`✅ ${qs.length} questions import ho gaye!`); }
    };
    reader.readAsText(file); e.target.value="";
  };
  return (
    <div style={{marginTop:14,background:"#100E26",borderRadius:12,padding:14}}>
      <div style={{fontSize:13,color:"#A7A2D6",marginBottom:8}}>
        📁 <strong style={{color:"#F4F2FF"}}>CSV file se questions import karo</strong>
      </div>
      <div style={{fontSize:11,color:"#A7A2D6",marginBottom:10,fontFamily:"monospace",background:"#0a0920",padding:"8px 10px",borderRadius:8}}>
        Format: Question,OptionA,OptionB,OptionC,OptionD,CorrectIndex<br/>
        Example: 2+2 kitna hai?,2,3,4,5,2<br/>
        <span style={{color:"#2EC4B6"}}>CorrectIndex: 0=A 1=B 2=C 3=D</span>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handle} style={{display:"none"}}/>
      <Btn color="#6C5CE7" onClick={()=>fileRef.current.click()} style={{width:"100%"}}><Upload size={15}/> CSV file choose karo</Btn>
      {msg && <p style={{margin:"8px 0 0",fontSize:13,color:"#2EC4B6"}}>{msg}</p>}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({ onHost, onJoin }) {
  const autoJoin = new URLSearchParams(window.location.search).get("join");
  const [mode, setMode] = useState(autoJoin ? "join" : null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err,  setErr]  = useState("");

  return (
    <div>
      <div style={{textAlign:"center",margin:"20px 0 32px"}}>
        <Logo size={42}/>
        <p style={{color:"#A7A2D6",marginTop:10}}>Live quiz battles — play together in real time</p>
      </div>

      {!mode && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Panel style={{textAlign:"center"}}>
            <div style={{fontSize:32}}>🎛️</div>
            <h3 style={{margin:"10px 0 4px"}}>Host a quiz</h3>
            <p style={{color:"#A7A2D6",fontSize:13,marginBottom:16}}>Build questions, share code, run it live</p>
            <Btn color="#FF5A5F" onClick={()=>setMode("host")} style={{width:"100%"}}>Create game</Btn>
          </Panel>
          <Panel style={{textAlign:"center"}}>
            <div style={{fontSize:32}}>🙋</div>
            <h3 style={{margin:"10px 0 4px"}}>Join a quiz</h3>
            <p style={{color:"#A7A2D6",fontSize:13,marginBottom:16}}>Enter the 6-digit code from host</p>
            <Btn color="#2EC4B6" onClick={()=>setMode("join")} style={{width:"100%"}}>Join game</Btn>
          </Panel>
        </div>
      )}

      {mode==="join" && (
        <Panel style={{maxWidth:420,margin:"0 auto"}}>
          <h3 style={{marginTop:0}}>Join a game</h3>
          {err && <p style={{color:"#FF5A5F",marginTop:0}}>{err}</p>}
          <label style={{fontSize:13,color:"#A7A2D6"}}>Game code</label>
          <Input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
            placeholder="123456" style={{marginTop:6,marginBottom:14,fontSize:22,letterSpacing:4,textAlign:"center"}}/>
          <label style={{fontSize:13,color:"#A7A2D6"}}>Tumhara naam</label>
          <Input value={name} onChange={e=>setName(e.target.value.slice(0,18))}
            placeholder="e.g. Captain Waffle" style={{marginTop:6,marginBottom:18}}/>
          <div style={{display:"flex",gap:10}}>
            <Btn color="#3a3760" onClick={()=>setMode(null)} style={{flex:1}}>Back</Btn>
            <Btn color="#2EC4B6" disabled={code.length!==6||!name.trim()}
              onClick={()=>onJoin(code,name.trim(),setErr)} style={{flex:2}}>
              Join <ArrowRight size={16}/>
            </Btn>
          </div>
        </Panel>
      )}

      {mode==="host" && <HostSetup onBack={()=>setMode(null)} onHost={onHost}/>}
    </div>
  );
}

// ─── HOST SETUP ───────────────────────────────────────────────────────────────
function HostSetup({ onBack, onHost }) {
  const [title,      setTitle]      = useState("");
  const [questions,  setQuestions]  = useState([]);
  const [sessionPts, setSessionPts] = useState(1000);
  const [draft,      setDraft]      = useState({q:"",options:["","","",""],correct:0});

  const addQ = () => {
    if (!draft.q.trim()||draft.options.some(o=>!o.trim())) return;
    setQuestions([...questions,{...draft,options:[...draft.options]}]);
    setDraft({q:"",options:["","","",""],correct:0});
  };

  return (
    <Panel>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{margin:0}}>Build your quiz</h3>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#A7A2D6",fontSize:13,cursor:"pointer"}}>← Back</button>
      </div>

      <label style={{fontSize:13,color:"#A7A2D6",display:"block",marginTop:16}}>Quiz title</label>
      <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Friday Trivia Night" style={{marginTop:6}}/>

      {/* SESSION POINTS */}
      <div style={{marginTop:18,background:"#100E26",borderRadius:12,padding:14}}>
        <label style={{fontSize:13,color:"#A7A2D6"}}>⭐ Pure quiz ke liye points (saare questions same)</label>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
          {[100,250,500,1000,2000,5000].map(p=>(
            <button key={p} onClick={()=>setSessionPts(p)} style={{
              background:sessionPts===p?"#F5D90A":"#262252",
              color:sessionPts===p?"#14122B":"#F4F2FF",
              border:"none",borderRadius:8,padding:"10px 18px",
              fontWeight:800,fontSize:15,cursor:"pointer",
              boxShadow:sessionPts===p?"0 3px 0 rgba(0,0,0,.3)":"none"}}>
              {p}
            </button>
          ))}
        </div>
        <p style={{fontSize:12,color:"#A7A2D6",margin:"8px 0 0"}}>
          Jaldi sahi jawab = max {sessionPts} pts | Dheere = min {Math.round(sessionPts*0.1)} pts
        </p>
      </div>

      {/* TEMPLATES */}
      <div style={{marginTop:16}}>
        <span style={{fontSize:13,color:"#A7A2D6"}}>Template load karo:</span>
        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
          {DEFAULT_QUIZZES.map(dq=>(
            <button key={dq.title} onClick={()=>{setTitle(dq.title);setQuestions(dq.questions.map(q=>({...q})));}}
              style={{background:"#100E26",border:"1px solid rgba(255,255,255,.15)",color:"#F4F2FF",
                borderRadius:999,padding:"8px 14px",fontSize:13,cursor:"pointer"}}>
              {dq.title} ({dq.questions.length}q)
            </button>
          ))}
        </div>
      </div>

      {/* CSV IMPORT */}
      <CSVImport onImport={qs=>setQuestions(prev=>[...prev,...qs])}/>

      {/* QUESTION LIST */}
      <div style={{marginTop:22,paddingTop:18,borderTop:"1px solid rgba(255,255,255,.08)"}}>
        <h4 style={{margin:"0 0 10px"}}>Questions ({questions.length})</h4>
        {questions.length===0 && <p style={{color:"#A7A2D6",fontSize:13}}>Koi question nahi hai abhi.</p>}
        {questions.map((q,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            background:"#100E26",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
            <span style={{fontSize:14}}>{i+1}. {q.q}</span>
            <button onClick={()=>setQuestions(questions.filter((_,idx)=>idx!==i))}
              style={{background:"none",border:"none",color:"#FF5A5F",cursor:"pointer"}}>
              <Trash2 size={16}/>
            </button>
          </div>
        ))}
      </div>

      {/* ADD QUESTION */}
      <div style={{marginTop:18,background:"#100E26",borderRadius:12,padding:16}}>
        <h4 style={{margin:"0 0 10px"}}>Question manually add karo</h4>
        <Input value={draft.q} onChange={e=>setDraft({...draft,q:e.target.value})} placeholder="Question likho..." style={{marginBottom:10}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {draft.options.map((opt,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setDraft({...draft,correct:i})}
                style={{width:30,height:30,flexShrink:0,borderRadius:8,border:"none",
                  background:draft.correct===i?"#2EC4B6":"#262252",color:"#fff",cursor:"pointer"}}>
                {draft.correct===i?<Check size={14}/>:SHAPES[i]}
              </button>
              <Input value={opt} onChange={e=>{const opts=[...draft.options];opts[i]=e.target.value;setDraft({...draft,options:opts});}} placeholder={`Option ${i+1}`}/>
            </div>
          ))}
        </div>
        <Btn onClick={addQ} color="#F5D90A" style={{marginTop:12}}><Plus size={16}/> Add question</Btn>
      </div>

      <Btn color="#FF5A5F" style={{width:"100%",marginTop:20}}
        disabled={!title.trim()||questions.length===0}
        onClick={()=>onHost(title.trim(),questions,sessionPts)}>
        Create game & get code <ArrowRight size={16}/>
      </Btn>
    </Panel>
  );
}

// ─── HOST LOBBY ───────────────────────────────────────────────────────────────
function HostLobby({ code, game, onStart }) {
  const players    = Object.entries(game.players||{});
  const [copied, setCopied] = useState(false);
  const prevCount  = useRef(0);
  const joinLink   = `${window.location.origin}${window.location.pathname}?join=${code}`;

  useEffect(() => {
    if (players.length > prevCount.current) {
      if (players.length > 0) playSound("playerJoin");
      prevCount.current = players.length;
    }
  }, [players.length]);

  const copyLink = () => {
    navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
  };

  return (
    <Panel style={{textAlign:"center"}}>
      <p style={{color:"#A7A2D6",marginBottom:4}}>Players ko ye code do</p>
      <div style={{fontSize:56,fontWeight:800,letterSpacing:10,color:"#F5D90A",fontFamily:"Arial Black,Arial,sans-serif"}}>{code}</div>

      <div style={{margin:"14px 0",background:"#100E26",borderRadius:12,padding:12}}>
        <p style={{fontSize:12,color:"#A7A2D6",margin:"0 0 8px"}}>Ya seedha ye link bhejo:</p>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1,fontSize:11,color:"#2EC4B6",background:"#0a0920",padding:"8px 12px",borderRadius:8,textAlign:"left",wordBreak:"break-all"}}>
            {joinLink}
          </div>
          <button onClick={copyLink} style={{flexShrink:0,background:copied?"#2EC4B6":"#6C5CE7",
            border:"none",borderRadius:8,color:"#fff",padding:"8px 12px",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {copied?"✅ Copied!":"Copy"}
          </button>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,margin:"14px 0 10px"}}>
        <Users size={18}/> <span style={{fontWeight:700}}>{players.length} joined</span>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",minHeight:36,marginBottom:22}}>
        {players.map(([pid,p],i)=>(
          <span key={pid} style={{background:COLORS[i%4],color:"#14122B",padding:"6px 14px",borderRadius:999,fontWeight:700,fontSize:13}}>{p.name}</span>
        ))}
      </div>
      <Btn color="#FF5A5F" disabled={players.length===0} onClick={onStart}><Play size={16}/> Start quiz</Btn>
    </Panel>
  );
}

// ─── HOST ACTIVE ──────────────────────────────────────────────────────────────
function HostActive({ game, onReveal }) {
  const players    = Object.entries(game.players||{});
  const q          = game.questions[game.currentIndex];
  const answersForQ = (game.answers||{})[game.currentIndex] || {};

  if (!q) return null;
  return (
    <Panel>
      <div style={{display:"flex",justifyContent:"space-between",color:"#A7A2D6",fontSize:13,marginBottom:10}}>
        <span>Question {game.currentIndex+1} / {game.questions.length}</span>
        <span><Users size={14} style={{verticalAlign:"-2px"}}/> {Object.keys(answersForQ).length}/{players.length} answered</span>
      </div>
      <TimerBar duration={QUESTION_TIME} questionKey={game.currentIndex} onExpire={onReveal}/>
      <h2 style={{fontSize:22,margin:"0 0 18px"}}>{q.q}</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {q.options.map((opt,i)=>(
          <div key={i} style={{background:COLORS[i],color:"#14122B",borderRadius:12,padding:16,fontWeight:700,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{SHAPES[i]}</span> {opt}
          </div>
        ))}
      </div>
      <Btn color="#F5D90A" style={{width:"100%",marginTop:18}} onClick={onReveal}>Answer dikhao</Btn>
    </Panel>
  );
}

// ─── HOST REVEAL ──────────────────────────────────────────────────────────────
function HostReveal({ game, onNext, onEnd }) {
  const players     = Object.entries(game.players||{});
  const q           = game.questions[game.currentIndex];
  const answersForQ = (game.answers||{})[game.currentIndex] || {};
  const scores      = computeScores(game);
  const ranked      = players.map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);
  const isLast      = game.currentIndex+1 >= game.questions.length;

  if (!q) return null;
  return (
    <Panel>
      <h2 style={{fontSize:20,marginTop:0}}>{q.q}</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        {q.options.map((opt,i)=>{
          const count = Object.values(answersForQ).filter(a=>a.choice===i).length;
          const isCorrect = i===q.correct;
          return (
            <div key={i} style={{background:isCorrect?"#2EC4B6":"#262252",color:isCorrect?"#14122B":"#F4F2FF",
              borderRadius:12,padding:14,fontWeight:700,display:"flex",justifyContent:"space-between"}}>
              <span>{SHAPES[i]} {opt} {isCorrect&&"✓"}</span>
              <span>{count}</span>
            </div>
          );
        })}
      </div>
      <h4 style={{margin:"18px 0 10px"}}><Trophy size={16} style={{verticalAlign:"-2px"}}/> Leaderboard</h4>
      {ranked.slice(0,5).map((p,i)=>(
        <div key={p.pid} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"#100E26",borderRadius:8,marginBottom:6}}>
          <span>{i+1}. {p.name}</span>
          <span style={{fontWeight:700,color:"#F5D90A"}}>{p.score}</span>
        </div>
      ))}
      {isLast
        ? <Btn color="#FF5A5F" style={{width:"100%",marginTop:14}} onClick={onEnd}>Finish quiz <Trophy size={16}/></Btn>
        : <Btn color="#FF5A5F" style={{width:"100%",marginTop:14}} onClick={onNext}>Next question <ArrowRight size={16}/></Btn>}
    </Panel>
  );
}

// ─── HOST ENDED ───────────────────────────────────────────────────────────────
function HostEnded({ game }) {
  const players = Object.entries(game.players||{});
  const scores  = computeScores(game);
  const ranked  = players.map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);
  return (
    <Panel style={{textAlign:"center"}}>
      <Trophy size={40} color="#F5D90A"/>
      <h2>Final Results</h2>
      {ranked.map((p,i)=>(
        <div key={p.pid} style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",
          background:i===0?"#F5D90A":"#100E26",color:i===0?"#14122B":"#F4F2FF",
          borderRadius:10,marginBottom:8,fontWeight:700}}>
          <span>{["🥇","🥈","🥉"][i]||`${i+1}.`} {p.name}</span>
          <span>{p.score}</span>
        </div>
      ))}
    </Panel>
  );
}

// ─── PLAYER LIVE ──────────────────────────────────────────────────────────────
function PlayerLive({ playerId, game, onAnswer }) {
  const idx          = game.currentIndex;
  const myAnswerForQ = ((game.answers||{})[idx]||{})[playerId];
  const scores       = computeScores(game);
  const myScore      = scores[playerId]||0;
  const ranked       = Object.entries(game.players||{}).map(([pid,p])=>({pid,name:p.name,score:scores[pid]||0})).sort((a,b)=>b.score-a.score);
  const myRank       = ranked.findIndex(r=>r.pid===playerId)+1;
  const revealedRef  = useRef(false);

  useEffect(() => {
    if (game.status==="reveal" && !revealedRef.current) {
      revealedRef.current = true;
      const q = game.questions[idx];
      if (!q) return;
      if (myAnswerForQ===undefined) playSound("wrong");
      else if (myAnswerForQ.choice===q.correct) playSound("correct");
      else playSound("wrong");
    }
    if (game.status==="active") revealedRef.current = false;
  }, [game.status, idx]);

  if (game.status==="lobby") return (
    <Panel style={{textAlign:"center"}}>
      <div style={{fontSize:40}}>🎉</div>
      <h2 style={{margin:"10px 0 6px"}}>You're in!</h2>
      <p style={{color:"#A7A2D6"}}>Host ke start karne ka wait karo...</p>
      <p style={{color:"#A7A2D6",fontSize:13}}>{Object.keys(game.players||{}).length} player(s) lobby mein</p>
    </Panel>
  );

  if (game.status==="active") {
    const q = game.questions[idx];
    if (!q) return null;
    if (myAnswerForQ!==undefined) return (
      <Panel style={{textAlign:"center"}}>
        <Zap size={32} color="#F5D90A"/>
        <h3 style={{margin:"10px 0"}}>Answer lock ho gaya!</h3>
        <p style={{color:"#A7A2D6"}}>Doosre players ka wait karo...</p>
      </Panel>
    );
    return (
      <Panel>
        <div style={{display:"flex",justifyContent:"space-between",color:"#A7A2D6",fontSize:13,marginBottom:10}}>
          <span>Q {idx+1} / {game.questions.length}</span>
          <span style={{color:"#F5D90A",fontWeight:700,background:"rgba(245,217,10,0.12)",padding:"3px 10px",borderRadius:999}}>
            ⭐ max {game.sessionPts||1000} pts
          </span>
        </div>
        <TimerBar duration={QUESTION_TIME} questionKey={idx} onExpire={()=>onAnswer(-1)}/>
        <h2 style={{fontSize:20,marginBottom:18}}>{q.q}</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {q.options.map((opt,i)=>(
            <button key={i} onClick={()=>onAnswer(i)} style={{background:COLORS[i],color:"#14122B",
              border:"none",borderRadius:12,padding:"22px 12px",fontWeight:700,fontSize:15,cursor:"pointer"}}>
              {SHAPES[i]} {opt}
            </button>
          ))}
        </div>
      </Panel>
    );
  }

  if (game.status==="reveal") {
    const q = game.questions[idx];
    if (!q) return null;
    const correct = myAnswerForQ!==undefined && myAnswerForQ.choice===q.correct;
    return (
      <Panel style={{textAlign:"center"}}>
        {myAnswerForQ===undefined ? <><X size={32} color="#FF5A5F"/><h3>Time out! ⏰</h3></>
        : correct ? <><Check size={32} color="#2EC4B6"/><h3 style={{color:"#2EC4B6"}}>Sahi jawab! 🎉</h3></>
        : <><X size={32} color="#FF5A5F"/><h3>Galat jawab</h3></>}
        <p style={{color:"#A7A2D6"}}>Sahi tha: <strong style={{color:"#2EC4B6"}}>{q.options[q.correct]}</strong></p>
        <p>Score: <span style={{color:"#F5D90A",fontWeight:700,fontSize:20}}>{myScore}</span></p>
        <p style={{color:"#A7A2D6"}}>Rank: #{myRank}</p>
      </Panel>
    );
  }

  if (game.status==="ended") {
    return (
      <Panel style={{textAlign:"center"}}>
        <Trophy size={36} color="#F5D90A"/>
        <h2>Quiz khatam!</h2>
        <p style={{fontSize:18}}>Tumhara rank: <strong>#{myRank}</strong> | Score: <strong style={{color:"#F5D90A"}}>{myScore}</strong></p>
        <div style={{marginTop:16}}>
          {ranked.slice(0,5).map((p,i)=>(
            <div key={p.pid} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",
              background:p.pid===playerId?"#2a1e4a":"#100E26",borderRadius:8,marginBottom:6}}>
              <span>{["🥇","🥈","🥉"][i]||`${i+1}.`} {p.name}{p.pid===playerId?" (tum)":""}</span>
              <span style={{fontWeight:700,color:"#F5D90A"}}>{p.score}</span>
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  return null;
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role,     setRole]     = useState(null);
  const [code,     setCode]     = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [game,     setGame]     = useState(null);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!code) return;
    const unsub = subscribeGame(code, g => setGame(g));
    return unsub;
  }, [code]);

  const refresh = async (mutator) => {
    const fresh = (await loadGame(code)) || game;
    const updated = mutator(fresh);
    await saveGame(code, updated);
    setGame(updated);
  };

  const handleHost = async (title, questions, sessionPts=1000) => {
    playSound("join"); playLobbyMusic();
    const c = genCode();
    const initial = {code:c,title,questions,sessionPts,status:"lobby",currentIndex:-1,players:{},answers:{},createdAt:Date.now()};
    await saveGame(c, initial);
    setGame(initial); setCode(c); setRole("host");
  };

  const handleJoin = async (c, name, setErr) => {
    setErr("");
    const g = await loadGame(c);
    if (!g) { setErr("❌ Galat code hai, dobara check karo."); return; }
    playSound("playerJoin"); playLobbyMusic();
    const pid = genId();
    const updated = {...g, players:{...g.players,[pid]:{name,score:0}}};
    await saveGame(c, updated);
    setGame(updated); setPlayerId(pid); setCode(c); setRole("player");
  };

  const handleStart = () => {
    playSound("start"); setTimeout(()=>playGameMusic(),700);
    refresh(g=>({...g,status:"active",currentIndex:0,questionStartedAt:Date.now()}));
  };
  const handleReveal = () => {
    stopBgMusic();
    refresh(g=>({...g,status:"reveal"}));
  };
  const handleNext = () => {
    setTimeout(()=>playGameMusic(),300);
    refresh(g=>({...g,status:"active",currentIndex:g.currentIndex+1,questionStartedAt:Date.now()}));
  };
  const handleEnd = () => {
    stopBgMusic(); setTimeout(()=>playSound("victory"),300);
    refresh(g=>({...g,status:"ended"}));
  };
  const handleAnswer = (choice) => {
    if (choice>=0) playSound("tick");
    refresh(g=>{
      const idx=g.currentIndex;
      const time=Date.now()-(g.questionStartedAt||Date.now());
      const answers={...(g.answers||{})};
      answers[idx]={...(answers[idx]||{}),[playerId]:{choice,time}};
      return {...g,answers};
    });
  };

  return (
    <Shell>
      {!role && <Home onHost={handleHost} onJoin={handleJoin}/>}
      {role && !game && <Panel style={{textAlign:"center"}}>Loading…</Panel>}

      {role==="host" && game && game.status==="lobby"  && <HostLobby  code={code} game={game} onStart={handleStart}/>}
      {role==="host" && game && game.status==="active" && <HostActive game={game} onReveal={handleReveal}/>}
      {role==="host" && game && game.status==="reveal" && <HostReveal game={game} onNext={handleNext} onEnd={handleEnd}/>}
      {role==="host" && game && game.status==="ended"  && <HostEnded  game={game}/>}

      {role==="player" && game && <PlayerLive playerId={playerId} game={game} onAnswer={handleAnswer}/>}
      {error && <p style={{color:"#FF5A5F",textAlign:"center",marginTop:12}}>{error}</p>}
    </Shell>
  );
}
