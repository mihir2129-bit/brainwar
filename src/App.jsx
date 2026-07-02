import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Users, Play, ArrowRight, Trophy, Check, X, Zap, Upload } from "lucide-react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const COLORS  = ["#FF5A5F", "#2EC4B6", "#F5D90A", "#6C5CE7"];
const SHAPES  = ["▲", "◆", "●", "■"];
const QUESTION_TIME = 15; // seconds

const DEFAULT_QUIZZES = [
  {
    title: "General Knowledge",
    questions: [
      { q: "What is the capital of Japan?",           options: ["Seoul","Beijing","Tokyo","Bangkok"],    correct: 2 },
      { q: "Which planet is the Red Planet?",         options: ["Venus","Mars","Jupiter","Saturn"],      correct: 1 },
      { q: "How many continents are on Earth?",       options: ["5","6","7","8"],                        correct: 2 },
      { q: "Who painted the Mona Lisa?",              options: ["Van Gogh","Da Vinci","Picasso","Monet"],correct: 1 },
      { q: "What is the largest ocean on Earth?",     options: ["Atlantic","Indian","Arctic","Pacific"], correct: 3 },
    ],
  },
  {
    title: "Science Basics",
    questions: [
      { q: "What gas do plants absorb from air?",     options: ["Oxygen","Nitrogen","Carbon dioxide","Hydrogen"], correct: 2 },
      { q: "What is H2O commonly known as?",          options: ["Salt","Water","Sugar","Oxygen"],        correct: 1 },
      { q: "How many bones in adult human body?",     options: ["206","150","300","180"],                correct: 0 },
      { q: "What force pulls objects toward Earth?",  options: ["Magnetism","Friction","Gravity","Tension"], correct: 2 },
      { q: "What is the smallest unit of life?",      options: ["Atom","Cell","Molecule","Tissue"],      correct: 1 },
    ],
  },
];

// ─── SOUND ENGINE (Web Audio API) ────────────────────────────────────────────
let _ctx = null;
let _muted = false;
let _musicNodes = [];
let _loopTimer = null;

const getCtx = () => {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
};

function beep(freq = 440, dur = 0.12, vol = 0.3, type = "sine", delay = 0) {
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
  join()     { beep(600,0.08,0.2,"sine"); beep(900,0.1,0.2,"sine",0.1); },
  start()    { [330,415,523,659,784].forEach((f,i)=>beep(f,0.18,0.2,"triangle",i*0.1)); },
  correct()  { [523,659,784,1047].forEach((f,i)=>beep(f,0.15,0.25,"sine",i*0.09)); },
  wrong()    { beep(180,0.4,0.3,"sawtooth"); beep(140,0.3,0.2,"sawtooth",0.15); },
  tick()     { beep(880,0.05,0.15,"square"); },
  urgentTick(){ beep(1100,0.05,0.25,"square"); },
  victory()  { [523,523,784,659,880].forEach((f,i)=>beep(f,0.22,0.25,"triangle",i*0.13)); beep(1047,0.5,0.3,"triangle",0.7); },
  countdown(){ [0,0.25,0.5].forEach(d=>beep(660,0.08,0.2,"square",d)); },
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
  // gentle repeating arpeggio loop
  const notes = [261, 330, 392, 523, 392, 330];
  notes.forEach((freq, i) => {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + i * 0.28;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.05, t0 + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
    osc.start(t0);
    osc.stop(t0 + 0.3);
    _musicNodes.push(osc, gain);
  });
  _loopTimer = setTimeout(() => { if (!_muted) playLobbyMusic(); }, notes.length * 280 + 400);
}

function playGameMusic() {
  if (_muted) return;
  stopBgMusic();
  const pattern = [130, 0, 146, 0, 130, 0, 110, 0];
  pattern.forEach((freq, i) => {
    if (!freq) return;
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + i * 0.22;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.07, t0 + 0.04);
    gain.gain.linearRampToValueAtTime(0, t0 + 0.18);
    osc.start(t0);
    osc.stop(t0 + 0.22);
    _musicNodes.push(osc, gain);
  });
  _loopTimer = setTimeout(() => { if (!_muted) playGameMusic(); }, pattern.length * 220 + 200);
}

// ─── FIREBASE / STORAGE HELPERS ──────────────────────────────────────────────
const gameKey = (code) => `games/${code}`;

async function loadGame(code) {
  try {
    // Firebase (production)
    if (window._fbDb) {
      const { ref, get } = await import("firebase/database");
      const snap = await get(ref(window._fbDb, gameKey(code)));
      return snap.exists() ? snap.val() : null;
    }
    // fallback: localStorage (dev/demo)
    const raw = localStorage.getItem("bw:" + code);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveGame(code, data) {
  try {
    if (window._fbDb) {
      const { ref, set } = await import("firebase/database");
      await set(ref(window._fbDb, gameKey(code)), data);
    } else {
      localStorage.setItem("bw:" + code, JSON.stringify(data));
    }
  } catch (e) { console.error(e); }
}

function subscribeGame(code, cb) {
  if (window._fbDb) {
    import("firebase/database").then(({ ref, onValue, off }) => {
      const r = ref(window._fbDb, gameKey(code));
      onValue(r, snap => { if (snap.exists()) cb(snap.val()); });
      return () => off(r);
    });
    return () => {};
  }
  // fallback: poll localStorage every 1s
  const id = setInterval(async () => {
    const g = await loadGame(code);
    if (g) cb(g);
  }, 1000);
  return () => clearInterval(id);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const genId   = () => Math.random().toString(36).slice(2, 10);

function computeScores(game) {
  const scores = {};
  Object.keys(game.players || {}).forEach(pid => (scores[pid] = 0));
  (game.questions || []).forEach((q, qi) => {
    const answers = (game.answers || {})[qi] || {};
    Object.entries(answers).forEach(([pid, a]) => {
      if (a.choice === q.correct) {
        const ratio = Math.max(0, 1 - a.time / (QUESTION_TIME * 1000));
        scores[pid] = (scores[pid] || 0) + Math.round(100 + 900 * ratio);
      }
    });
  });
  return scores;
}

// ─── CSV IMPORT ──────────────────────────────────────────────────────────────
// CSV format:
// Question,OptionA,OptionB,OptionC,OptionD,CorrectIndex(0-3)
// What is 2+2?,1,2,3,4,3
function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const results = [];
  // skip header if first line has "question" keyword
  const start = lines[0].toLowerCase().includes("question") ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 6) continue;
    const [q, a, b, c, d, idx] = cols;
    const correct = parseInt(idx, 10);
    if (!q || isNaN(correct) || correct < 0 || correct > 3) continue;
    results.push({ q, options: [a, b, c, d], correct });
  }
  return results;
}

// ─── UI ATOMS ────────────────────────────────────────────────────────────────
function Logo({ size = 28 }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:"Arial Black, Arial, sans-serif" }}>
      <span style={{ fontSize:size, color:"#F5D90A" }}>⚔</span>
      <span style={{ fontSize:size*0.78, fontWeight:800, letterSpacing:"-0.02em", color:"#F4F2FF" }}>
        Brain<span style={{ color:"#FF5A5F" }}>War</span>
      </span>
    </div>
  );
}

function MuteBtn() {
  const [m, setM] = useState(false);
  const toggle = () => {
    _muted = !_muted; setM(_muted);
    if (_muted) stopBgMusic();
  };
  return (
    <button onClick={toggle} style={{
      position:"fixed", top:14, right:16, zIndex:999,
      background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)",
      color:"#F4F2FF", borderRadius:999, width:38, height:38,
      fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    }}>{m ? "🔇" : "🔊"}</button>
  );
}

const css = `
  :root{--bg:#14122B;--panel:#1D1A3D;--ink:#F4F2FF;--muted:#A7A2D6;--yellow:#F5D90A;--coral:#FF5A5F;--teal:#2EC4B6;--violet:#6C5CE7;}
  *{box-sizing:border-box;} body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  button,input{font-family:inherit;}
  @keyframes popIn{from{transform:scale(0.93);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes timerBar{from{width:100%}to{width:0%}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
`;

function Shell({ children }) {
  return (
    <>
      <style>{css}</style>
      <MuteBtn />
      <div style={{
        minHeight:"100vh", padding:"24px 16px 60px",
        background:"var(--bg)",
        backgroundImage:"radial-gradient(circle at 15% 20%,rgba(108,92,231,.18),transparent 40%),radial-gradient(circle at 85% 80%,rgba(46,196,182,.14),transparent 40%)",
        display:"flex", flexDirection:"column", alignItems:"center",
      }}>
        <div style={{ width:"100%", maxWidth:860 }}>{children}</div>
      </div>
    </>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      background:"var(--panel)", border:"1px solid rgba(255,255,255,.07)",
      borderRadius:18, padding:24, animation:"popIn .22s ease", ...style,
    }}>{children}</div>
  );
}

function Btn({ children, onClick, color="var(--violet)", style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled?"#3a3760":color,
      color: color==="var(--yellow)"?"#14122B":"#fff",
      border:"none", borderRadius:12, padding:"13px 22px",
      fontWeight:700, fontSize:15,
      opacity: disabled?0.6:1,
      boxShadow: disabled?"none":"0 4px 0 rgba(0,0,0,.25)",
      display:"inline-flex", alignItems:"center", gap:8, justifyContent:"center",
      cursor: disabled?"not-allowed":"pointer",
      ...style,
    }}>{children}</button>
  );
}

function Input(props) {
  return <input {...props} style={{
    width:"100%", padding:"12px 14px", borderRadius:10,
    border:"1px solid rgba(255,255,255,.15)", background:"#100E26",
    color:"var(--ink)", fontSize:15, ...props.style,
  }} />;
}

// ─── TIMER BAR ───────────────────────────────────────────────────────────────
function TimerBar({ duration, onExpire, questionKey }) {
  const [left, setLeft] = useState(duration);
  const startRef = useRef(Date.now());
  const warnedRef = useRef(false);

  useEffect(() => {
    warnedRef.current = false;
    startRef.current = Date.now();
    setLeft(duration);
    const id = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      setLeft(remaining);
      // tick every second
      if (Math.ceil(remaining) !== Math.ceil(duration - elapsed + 0.05)) {
        if (remaining <= 5 && remaining > 0) {
          playSound("urgentTick");
        } else if (remaining > 5) {
          playSound("tick");
        }
      }
      if (remaining <= 0) {
        clearInterval(id);
        playSound("wrong");
        onExpire?.();
      }
    }, 200);
    return () => clearInterval(id);
  }, [questionKey]);

  const pct = (left / duration) * 100;
  const color = left > 8 ? "var(--teal)" : left > 4 ? "var(--yellow)" : "var(--coral)";

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--muted)", marginBottom:6 }}>
        <span style={{ display:"flex", alignItems:"center", gap:6 }}>
          ⏱ Time left
        </span>
        <span style={{
          fontWeight:800, fontSize:18,
          color,
          animation: left <= 5 ? "pulse 0.5s infinite" : "none",
        }}>{Math.ceil(left)}s</span>
      </div>
      <div style={{ height:10, background:"rgba(255,255,255,.08)", borderRadius:99, overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${pct}%`, background:color,
          borderRadius:99, transition:"width 0.2s linear, background 0.4s",
        }} />
      </div>
    </div>
  );
}

// ─── CSV IMPORT BUTTON ───────────────────────────────────────────────────────
function CSVImport({ onImport }) {
  const ref = useRef();
  const [msg, setMsg] = useState("");

  const handle = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const qs = parseCSV(ev.target.result);
      if (qs.length === 0) {
        setMsg("❌ No valid questions found. Check format below.");
      } else {
        onImport(qs);
        setMsg(`✅ ${qs.length} questions imported!`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{ marginTop:14, background:"#100E26", borderRadius:12, padding:14 }}>
      <div style={{ fontSize:13, color:"var(--muted)", marginBottom:8 }}>
        📁 <strong style={{color:"var(--ink)"}}>CSV se import karo</strong> — Excel mein questions banao aur .csv save karo
      </div>
      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:10, fontFamily:"monospace", background:"#0a0920", padding:"8px 10px", borderRadius:8 }}>
        Format (header optional):<br/>
        Question,OptionA,OptionB,OptionC,OptionD,CorrectIndex<br/>
        What is 2+2?,1,2,3,4,3<br/>
        <span style={{color:"var(--teal)"}}>CorrectIndex: 0=A, 1=B, 2=C, 3=D</span>
      </div>
      <input ref={ref} type="file" accept=".csv,.txt" onChange={handle} style={{ display:"none" }} />
      <Btn color="var(--violet)" onClick={() => ref.current.click()} style={{ width:"100%" }}>
        <Upload size={15} /> Choose CSV file
      </Btn>
      {msg && <p style={{ margin:"8px 0 0", fontSize:13, color:"var(--teal)" }}>{msg}</p>}
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function Home({ onHost, onJoin }) {
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err,  setErr]  = useState("");

  return (
    <div>
      <div style={{ textAlign:"center", margin:"20px 0 32px" }}>
        <Logo size={42} />
        <p style={{ color:"var(--muted)", marginTop:10 }}>Live quiz battles — play together in real time</p>
      </div>

      {!mode && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Panel style={{ textAlign:"center" }}>
            <div style={{ fontSize:32 }}>🎛️</div>
            <h3 style={{ margin:"10px 0 4px" }}>Host a quiz</h3>
            <p style={{ color:"var(--muted)", fontSize:13, marginBottom:16 }}>Build questions, share code, run it live</p>
            <Btn color="var(--coral)" onClick={() => setMode("host")} style={{ width:"100%" }}>Create game</Btn>
          </Panel>
          <Panel style={{ textAlign:"center" }}>
            <div style={{ fontSize:32 }}>🙋</div>
            <h3 style={{ margin:"10px 0 4px" }}>Join a quiz</h3>
            <p style={{ color:"var(--muted)", fontSize:13, marginBottom:16 }}>Enter the 6-digit code from host</p>
            <Btn color="var(--teal)" onClick={() => setMode("join")} style={{ width:"100%" }}>Join game</Btn>
          </Panel>
        </div>
      )}

      {mode === "join" && (
        <Panel style={{ maxWidth:420, margin:"0 auto" }}>
          <h3 style={{ marginTop:0 }}>Join a game</h3>
          {err && <p style={{ color:"var(--coral)", marginTop:0 }}>{err}</p>}
          <label style={{ fontSize:13, color:"var(--muted)" }}>Game code</label>
          <Input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
            placeholder="123456" style={{ marginTop:6, marginBottom:14, fontSize:22, letterSpacing:4, textAlign:"center" }} />
          <label style={{ fontSize:13, color:"var(--muted)" }}>Your nickname</label>
          <Input value={name} onChange={e=>setName(e.target.value.slice(0,18))}
            placeholder="e.g. Captain Waffle" style={{ marginTop:6, marginBottom:18 }} />
          <div style={{ display:"flex", gap:10 }}>
            <Btn color="#3a3760" onClick={() => setMode(null)} style={{ flex:1 }}>Back</Btn>
            <Btn color="var(--teal)" disabled={code.length!==6||!name.trim()}
              onClick={() => onJoin(code, name.trim(), setErr)} style={{ flex:2 }}>
              Join <ArrowRight size={16} />
            </Btn>
          </div>
        </Panel>
      )}

      {mode === "host" && <HostSetup onBack={() => setMode(null)} onHost={onHost} />}
    </div>
  );
}

// ─── HOST SETUP ──────────────────────────────────────────────────────────────
function HostSetup({ onBack, onHost }) {
  const [title, setTitle]       = useState("");
  const [questions, setQuestions] = useState([]);
  const [draft, setDraft]       = useState({ q:"", options:["","","",""], correct:0 });

  const addQ = () => {
    if (!draft.q.trim() || draft.options.some(o=>!o.trim())) return;
    setQuestions([...questions, { ...draft, options:[...draft.options] }]);
    setDraft({ q:"", options:["","","",""], correct:0 });
  };

  return (
    <Panel>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h3 style={{ margin:0 }}>Build your quiz</h3>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--muted)", fontSize:13, cursor:"pointer" }}>← Back</button>
      </div>

      <label style={{ fontSize:13, color:"var(--muted)", display:"block", marginTop:16 }}>Quiz title</label>
      <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Friday Trivia Night" style={{ marginTop:6 }} />

      {/* templates */}
      <div style={{ marginTop:16 }}>
        <span style={{ fontSize:13, color:"var(--muted)" }}>Load template:</span>
        <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
          {DEFAULT_QUIZZES.map(dq => (
            <button key={dq.title} onClick={() => { setTitle(dq.title); setQuestions(dq.questions.map(q=>({...q}))); }}
              style={{ background:"#100E26", border:"1px solid rgba(255,255,255,.15)", color:"var(--ink)", borderRadius:999, padding:"8px 14px", fontSize:13, cursor:"pointer" }}>
              {dq.title} ({dq.questions.length}q)
            </button>
          ))}
        </div>
      </div>

      {/* CSV import */}
      <CSVImport onImport={qs => setQuestions(prev => [...prev, ...qs])} />

      {/* question list */}
      <div style={{ marginTop:22, paddingTop:18, borderTop:"1px solid rgba(255,255,255,.08)" }}>
        <h4 style={{ margin:"0 0 10px" }}>Questions ({questions.length})</h4>
        {questions.length === 0 && <p style={{ color:"var(--muted)", fontSize:13 }}>No questions yet.</p>}
        {questions.map((q,i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            background:"#100E26", borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
            <span style={{ fontSize:14 }}>{i+1}. {q.q}</span>
            <button onClick={() => setQuestions(questions.filter((_,idx)=>idx!==i))}
              style={{ background:"none", border:"none", color:"var(--coral)", cursor:"pointer" }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* add question manually */}
      <div style={{ marginTop:18, background:"#100E26", borderRadius:12, padding:16 }}>
        <h4 style={{ margin:"0 0 10px" }}>Add question manually</h4>
        <Input value={draft.q} onChange={e=>setDraft({...draft,q:e.target.value})} placeholder="Type your question..." style={{ marginBottom:10 }} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {draft.options.map((opt,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={() => setDraft({...draft,correct:i})}
                style={{ width:30, height:30, flexShrink:0, borderRadius:8, border:"none",
                  background: draft.correct===i?"var(--teal)":"#262252", color:"#fff", cursor:"pointer" }}>
                {draft.correct===i ? <Check size={14}/> : SHAPES[i]}
              </button>
              <Input value={opt} onChange={e=>{ const opts=[...draft.options]; opts[i]=e.target.value; setDraft({...draft,options:opts}); }} placeholder={`Option ${i+1}`} />
            </div>
          ))}
        </div>
        <Btn onClick={addQ} color="var(--yellow)" style={{ marginTop:12 }}><Plus size={16}/> Add question</Btn>
      </div>

      <Btn color="var(--coral)" style={{ width:"100%", marginTop:20 }}
        disabled={!title.trim() || questions.length===0}
        onClick={() => onHost(title.trim(), questions)}>
        Create game & get code <ArrowRight size={16}/>
      </Btn>
    </Panel>
  );
}

// ─── HOST LIVE ────────────────────────────────────────────────────────────────
function HostLive({ code, game, onStart, onNext, onReveal, onEnd }) {
  const players     = Object.entries(game.players || {});
  const q           = game.questions[game.currentIndex];
  const answersForQ = ((game.answers||{})[game.currentIndex]) || {};
  const scores      = computeScores(game);
  const ranked      = players.map(([pid,p])=>({ pid, name:p.name, score:scores[pid]||0 })).sort((a,b)=>b.score-a.score);
  const prevCountRef = useRef(0);

  // play sound when a new player joins lobby
  useEffect(() => {
    if (game.status === "lobby" && players.length > prevCountRef.current) {
      if (players.length > 0) playSound("playerJoin");
      prevCountRef.current = players.length;
    }
  }, [players.length, game.status]);

  // ── LOBBY ──
  if (game.status === "lobby") return (
    <Panel style={{ textAlign:"center" }}>
      <p style={{ color:"var(--muted)", marginBottom:4 }}>Share this code with players</p>
      <div style={{ fontSize:56, fontWeight:800, letterSpacing:10, color:"var(--yellow)", fontFamily:"Arial Black,Arial,sans-serif" }}>{code}</div>
      <p style={{ color:"var(--muted)", marginTop:4, fontSize:13 }}>Players open this app → Join → enter code</p>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, margin:"18px 0 10px" }}>
        <Users size={18}/> <span style={{ fontWeight:700 }}>{players.length} joined</span>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center", minHeight:36, marginBottom:22 }}>
        {players.map(([pid,p],i) => (
          <span key={pid} style={{ background:COLORS[i%4], color:"#14122B", padding:"6px 14px", borderRadius:999, fontWeight:700, fontSize:13 }}>{p.name}</span>
        ))}
      </div>
      <Btn color="var(--coral)" disabled={players.length===0} onClick={onStart}><Play size={16}/> Start quiz</Btn>
    </Panel>
  );

  // ── ACTIVE ──
  if (game.status === "active") return (
    <Panel>
      <div style={{ display:"flex", justifyContent:"space-between", color:"var(--muted)", fontSize:13, marginBottom:10 }}>
        <span>Question {game.currentIndex+1} / {game.questions.length}</span>
        <span><Users size={14} style={{verticalAlign:"-2px"}}/> {Object.keys(answersForQ).length}/{players.length} answered</span>
      </div>
      <TimerBar duration={QUESTION_TIME} questionKey={game.currentIndex} onExpire={onReveal}/>
      <h2 style={{ fontSize:22, margin:"0 0 18px" }}>{q.q}</h2>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {q.options.map((opt,i) => (
          <div key={i} style={{ background:COLORS[i], color:"#14122B", borderRadius:12, padding:16, fontWeight:700, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:18 }}>{SHAPES[i]}</span> {opt}
          </div>
        ))}
      </div>
      <Btn color="var(--yellow)" style={{ width:"100%", marginTop:18 }} onClick={onReveal}>Show answer</Btn>
    </Panel>
  );

  // ── REVEAL ──
  if (game.status === "reveal") return (
    <Panel>
      <h2 style={{ fontSize:20, marginTop:0 }}>{q.q}</h2>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
        {q.options.map((opt,i) => {
          const count = Object.values(answersForQ).filter(a=>a.choice===i).length;
          const isCorrect = i===q.correct;
          return (
            <div key={i} style={{ background:isCorrect?"var(--teal)":"#262252", color:isCorrect?"#14122B":"var(--ink)", borderRadius:12, padding:14, fontWeight:700, display:"flex", justifyContent:"space-between" }}>
              <span>{SHAPES[i]} {opt} {isCorrect&&"✓"}</span>
              <span>{count}</span>
            </div>
          );
        })}
      </div>
      <h4 style={{ margin:"18px 0 10px" }}><Trophy size={16} style={{verticalAlign:"-2px"}}/> Leaderboard</h4>
      {ranked.slice(0,5).map((p,i) => (
        <div key={p.pid} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", background:"#100E26", borderRadius:8, marginBottom:6 }}>
          <span>{i+1}. {p.name}</span>
          <span style={{ fontWeight:700, color:"var(--yellow)" }}>{p.score}</span>
        </div>
      ))}
      {game.currentIndex+1 < game.questions.length
        ? <Btn color="var(--coral)" style={{ width:"100%", marginTop:14 }} onClick={onNext}>Next question <ArrowRight size={16}/></Btn>
        : <Btn color="var(--coral)" style={{ width:"100%", marginTop:14 }} onClick={onEnd}>Finish quiz <Trophy size={16}/></Btn>}
    </Panel>
  );

  // ── ENDED ──
  if (game.status === "ended") return (
    <Panel style={{ textAlign:"center" }}>
      <Trophy size={40} color="var(--yellow)"/>
      <h2>Final Results</h2>
      {ranked.map((p,i) => (
        <div key={p.pid} style={{ display:"flex", justifyContent:"space-between", padding:"12px 16px",
          background:i===0?"var(--yellow)":"#100E26", color:i===0?"#14122B":"var(--ink)",
          borderRadius:10, marginBottom:8, fontWeight:700 }}>
          <span>{["🥇","🥈","🥉"][i]||`${i+1}.`} {p.name}</span>
          <span>{p.score}</span>
        </div>
      ))}
    </Panel>
  );

  return null;
}

// ─── PLAYER LIVE ─────────────────────────────────────────────────────────────
function PlayerLive({ playerId, game, onAnswer }) {
  const idx          = game.currentIndex;
  const myAnswerForQ = ((game.answers||{})[idx]||{})[playerId];
  const scores       = computeScores(game);
  const myScore      = scores[playerId] || 0;
  const ranked       = Object.entries(game.players||{}).map(([pid,p])=>({ pid, name:p.name, score:scores[pid]||0 })).sort((a,b)=>b.score-a.score);
  const myRank       = ranked.findIndex(r=>r.pid===playerId)+1;
  const revealedRef  = useRef(false);

  // play correct/wrong on reveal
  useEffect(() => {
    if (game.status==="reveal" && !revealedRef.current) {
      revealedRef.current = true;
      const q = game.questions[idx];
      if (myAnswerForQ===undefined) playSound("wrong");
      else if (myAnswerForQ.choice===q.correct) playSound("correct");
      else playSound("wrong");
    }
    if (game.status==="active") revealedRef.current = false;
  }, [game.status, idx]);

  // ── LOBBY ──
  if (game.status==="lobby") return (
    <Panel style={{ textAlign:"center" }}>
      <div style={{ fontSize:40 }}>🎉</div>
      <h2 style={{ margin:"10px 0 6px" }}>You're in!</h2>
      <p style={{ color:"var(--muted)" }}>Waiting for host to start...</p>
      <div style={{ marginTop:16, fontSize:13, color:"var(--muted)" }}>
        {Object.keys(game.players||{}).length} player(s) in lobby
      </div>
    </Panel>
  );

  // ── ACTIVE ──
  if (game.status==="active") {
    const q = game.questions[idx];
    if (myAnswerForQ !== undefined) return (
      <Panel style={{ textAlign:"center" }}>
        <Zap size={32} color="var(--yellow)"/>
        <h3 style={{ margin:"10px 0" }}>Answer locked in!</h3>
        <p style={{ color:"var(--muted)" }}>Waiting for other players...</p>
      </Panel>
    );
    return (
      <Panel>
        <div style={{ display:"flex", justifyContent:"space-between", color:"var(--muted)", fontSize:13, marginBottom:10 }}>
          <span>Q {idx+1} / {game.questions.length}</span>
          <span>Score: <strong style={{color:"var(--yellow)"}}>{myScore}</strong></span>
        </div>
        <TimerBar duration={QUESTION_TIME} questionKey={idx} onExpire={() => onAnswer(-1)} />
        <h2 style={{ fontSize:20, marginBottom:18 }}>{q.q}</h2>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {q.options.map((opt,i) => (
            <button key={i} onClick={() => onAnswer(i)} style={{
              background:COLORS[i], color:"#14122B", border:"none",
              borderRadius:12, padding:"22px 12px", fontWeight:700, fontSize:15, cursor:"pointer",
            }}>{SHAPES[i]} {opt}</button>
          ))}
        </div>
      </Panel>
    );
  }

  // ── REVEAL ──
  if (game.status==="reveal") {
    const q = game.questions[idx];
    const correct = myAnswerForQ!==undefined && myAnswerForQ.choice===q.correct;
    return (
      <Panel style={{ textAlign:"center" }}>
        {myAnswerForQ===undefined ? <><X size={32} color="var(--coral)"/><h3>Time's up!</h3></>
        : correct ? <><Check size={32} color="var(--teal)"/><h3 style={{color:"var(--teal)"}}>Correct! 🎉</h3></>
        : <><X size={32} color="var(--coral)"/><h3>Wrong answer</h3></>}
        <p style={{ color:"var(--muted)" }}>Correct: <strong style={{color:"var(--teal)"}}>{game.questions[idx].options[game.questions[idx].correct]}</strong></p>
        <p>Score: <span style={{ color:"var(--yellow)", fontWeight:700, fontSize:20 }}>{myScore}</span></p>
        <p style={{ color:"var(--muted)" }}>Rank: #{myRank}</p>
      </Panel>
    );
  }

  // ── ENDED ──
  if (game.status==="ended") return (
    <Panel style={{ textAlign:"center" }}>
      <Trophy size={36} color="var(--yellow)"/>
      <h2>Quiz Over!</h2>
      <p style={{ fontSize:18 }}>You finished <strong>#{myRank}</strong> with <strong style={{color:"var(--yellow)"}}>{myScore}</strong> pts</p>
      <div style={{ marginTop:16 }}>
        {ranked.slice(0,5).map((p,i)=>(
          <div key={p.pid} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px",
            background: p.pid===playerId?"#2a1e4a":"#100E26", borderRadius:8, marginBottom:6 }}>
            <span>{["🥇","🥈","🥉"][i]||`${i+1}.`} {p.name}{p.pid===playerId?" (you)":""}</span>
            <span style={{fontWeight:700,color:"var(--yellow)"}}>{p.score}</span>
          </div>
        ))}
      </div>
    </Panel>
  );

  return null;
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role,     setRole]     = useState(null);
  const [code,     setCode]     = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [game,     setGame]     = useState(null);
  const [error,    setError]    = useState("");

  // real-time listener
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

  const handleHost = async (title, questions) => {
    playSound("join");
    playLobbyMusic();
    const c = genCode();
    const initial = { code:c, title, questions, status:"lobby", currentIndex:-1, players:{}, answers:{}, createdAt:Date.now() };
    await saveGame(c, initial);
    setGame(initial); setCode(c); setRole("host");
  };

  const handleJoin = async (c, name, setErr) => {
    setErr("");
    const g = await loadGame(c);
    if (!g) { setErr("❌ No game found with that code."); return; }
    playSound("playerJoin");
    playLobbyMusic();
    const pid = genId();
    const updated = { ...g, players:{ ...g.players, [pid]:{ name, score:0 } } };
    await saveGame(c, updated);
    setGame(updated); setPlayerId(pid); setCode(c); setRole("player");
  };

  const handleStart = () => {
    playSound("start");
    setTimeout(() => playGameMusic(), 700);
    refresh(g => ({ ...g, status:"active", currentIndex:0, questionStartedAt:Date.now() }));
  };

  const handleReveal = () => {
    stopBgMusic();
    refresh(g => ({ ...g, status:"reveal" }));
  };

  const handleNext = () => {
    setTimeout(() => playGameMusic(), 300);
    refresh(g => ({ ...g, status:"active", currentIndex:g.currentIndex+1, questionStartedAt:Date.now() }));
  };

  const handleEnd = () => {
    stopBgMusic();
    setTimeout(() => playSound("victory"), 300);
    refresh(g => ({ ...g, status:"ended" }));
  };

  const handleAnswer = (choice) => {
    if (choice >= 0) playSound("tick");
    refresh(g => {
      const idx = g.currentIndex;
      const time = Date.now() - (g.questionStartedAt || Date.now());
      const answers = { ...(g.answers||{}) };
      answers[idx] = { ...(answers[idx]||{}), [playerId]:{ choice, time } };
      return { ...g, answers };
    });
  };

  return (
    <Shell>
      {!role && <Home onHost={handleHost} onJoin={handleJoin} />}
      {role && !game && <Panel style={{textAlign:"center"}}>Loading…</Panel>}
      {role==="host" && game && <HostLive code={code} game={game} onStart={handleStart} onReveal={handleReveal} onNext={handleNext} onEnd={handleEnd}/>}
      {role==="player" && game && <PlayerLive playerId={playerId} game={game} onAnswer={handleAnswer}/>}
      {error && <p style={{color:"var(--coral)",textAlign:"center",marginTop:12}}>{error}</p>}
    </Shell>
  );
}
