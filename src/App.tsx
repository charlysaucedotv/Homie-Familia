import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIG
// 1. Ve a https://console.firebase.google.com
// 2. Crea un proyecto → Realtime Database → Crear base de datos (modo prueba)
// 3. Ve a Configuración del proyecto → Tus apps → Web → Registrar app
// 4. Copia los valores y reemplaza los de abajo
// ─────────────────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyB2rUGZOtVVn_gXYMNNAlSqxl4Ir2b1Bfg",
  authDomain:        "homie-familia.firebaseapp.com",
  databaseURL:       "https://homie-familia-default-rtdb.firebaseio.com",
  projectId:         "homie-familia",
  storageBucket:     "homie-familia.firebasestorage.app",
  messagingSenderId: "528766501818",
  appId:             "1:528766501818:web:2316c6d3bec39dbb479383",
};
// ─────────────────────────────────────────────────────────────────────────────

// ── Firebase SDK via CDN (loaded dynamically) ─────────────────────────────────
let firebaseApp = null, firebaseDb = null;
let fbRef, fbSet, fbUpdate, fbOnValue, fbOff, fbPush, fbRemove, fbGet;
let firebaseReady = false;

async function loadFirebase() {
  if (firebaseReady) return true;
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const dbMod  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
    firebaseApp = appMod.initializeApp(FIREBASE_CONFIG);
    firebaseDb  = dbMod.getDatabase(firebaseApp);
    fbRef       = dbMod.ref;
    fbSet       = dbMod.set;
    fbUpdate    = dbMod.update;
    fbOnValue   = dbMod.onValue;
    fbOff       = dbMod.off;
    fbPush      = dbMod.push;
    fbRemove    = dbMod.remove;
    fbGet       = dbMod.get;
    firebaseReady = true;
    return true;
  } catch (e) {
    console.error("Firebase load error:", e);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const now        = () => new Date();
const addDays    = (n) => { const d = new Date(); d.setHours(23,59,59,0); d.setDate(d.getDate()+n); return d.toISOString(); };
const msToHours  = (ms) => ms / 3600000;
const rand       = (arr) => arr[Math.floor(Math.random()*arr.length)];
const genCode    = () => "CASA-" + Math.random().toString(36).substring(2,6).toUpperCase();
const genId      = () => "_" + Math.random().toString(36).substr(2,9);

function urgencyLevel(task) {
  if (task.done) return "done";
  if (!task.deadline) return "normal";
  const diff = new Date(task.deadline) - now();
  if (diff < 0) return "overdue";
  if (msToHours(diff) < 24) return "critical";
  if (msToHours(diff) < 72) return "warning";
  return "normal";
}
function timeLabel(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - now();
  if (diff < 0) { const h=Math.abs(Math.floor(diff/3600000)); return h<24?`Venció ${h}h`:`Venció ${Math.floor(h/24)}d`; }
  const h = Math.floor(diff/3600000);
  if (h<1) return "¡<1h!"; if (h<24) return `${h}h`; return `${Math.floor(h/24)}d`;
}

const URGENCY = {
  done:    { border:"#e0e0e0", bg:"#f9f9f9" },
  normal:  { border:"transparent", bg:"white" },
  warning: { border:"#FFC107", bg:"#FFFDE7" },
  critical:{ border:"#FF5722", bg:"#FFF3E0" },
  overdue: { border:"#c0392b", bg:"#FFEBEE" },
};

// ── Static data ───────────────────────────────────────────────────────────────
const AVATAR_OPTIONS = ["👨","👩","👧","👦","👴","👵","🧑","👱","🧒","🐶","🐱","🦊"];
const COLOR_OPTIONS  = ["#3498DB","#E91E63","#FF6B35","#9B59B6","#27AE60","#F39C12","#E74C3C","#00BCD4","#FF9800","#795548"];
const ICON_OPTIONS   = ["🛒","👕","📋","💪","🍽️","🧹","💊","📦","🔧","📝","🎯","🏡","🚗","💡","🌿","📚","🛏️","🗑️","🧺","🐾","🎮","🎨","🎵","📱"];
const PRIORITY_XP    = { baja:10, media:20, alta:35 };
const PRIORITY_COLOR = { baja:"#4ECDC4", media:"#F39C12", alta:"#E74C3C" };

const ALL_ACHIEVEMENTS = [
  { id:"first_task",  icon:"🌟", label:"Primera tarea",    desc:"Completa tu primera tarea",     req: s => s.totalDone >= 1 },
  { id:"streak_3",    icon:"🔥", label:"Racha de 3",       desc:"3 días consecutivos",           req: s => s.streak >= 3 },
  { id:"streak_7",    icon:"🏆", label:"Semana perfecta",  desc:"7 días de racha",               req: s => s.streak >= 7 },
  { id:"challenge_3", icon:"💪", label:"Retador",          desc:"Completa 3 retos",              req: s => (s.challengesDone||0) >= 3 },
  { id:"level_2",     icon:"⬆️", label:"Nivel 2",          desc:"Sube al nivel 2",               req: s => s.level >= 2 },
  { id:"level_3",     icon:"🚀", label:"Imparable",        desc:"Sube al nivel 3",               req: s => s.level >= 3 },
  { id:"tasks_10",    icon:"📦", label:"10 tareas",        desc:"Completa 10 tareas en total",   req: s => s.totalDone >= 10 },
];

const MESSAGES = {
  idle:      ["¡Hola! ¿Qué hacemos hoy? 🏠","Tu casa te espera 😊","¡Vamos a ser productivos! ✨"],
  complete:  ["¡Genial! 🎉","¡Así se hace! 💪","¡Tachado! 🌟"],
  levelup:   ["¡SUBISTE DE NIVEL! 🎊","¡Eres un maestro del hogar! 🏅"],
  urgent:    ["⚠️ ¡Algo está por vencer!","¡Corre! Tarea crítica 🚨"],
  challenge: ["¡Reto aceptado! 🎯 Tú puedes","¡No te rajes! 💪"],
};

// ── Homie SVG ─────────────────────────────────────────────────────────────────
function HomieSVG({ mood="idle", size=90 }) {
  const color = mood==="celebrate"?"#FFD700":mood==="urgent"?"#FF5722":mood==="remind"?"#FF8C42":"#7EC8E3";
  return (
    <svg viewBox="0 0 120 140" width={size} height={size*1.17} style={{overflow:"visible"}}>
      <ellipse cx="60" cy="138" rx="30" ry="6" fill="rgba(0,0,0,0.10)"/>
      <ellipse cx="60" cy="105" rx="28" ry="22" fill={color}/>
      <g style={mood==="celebrate"?{animation:"waveArms 0.5s ease-in-out infinite alternate"}:{}}>
        <ellipse cx="26" cy="95" rx="10" ry="6" fill={color} transform="rotate(-30 26 95)"/>
        <ellipse cx="94" cy="95" rx="10" ry="6" fill={color} transform="rotate(30 94 95)"/>
      </g>
      <ellipse cx="47" cy="126" rx="10" ry="6" fill={color}/>
      <ellipse cx="73" cy="126" rx="10" ry="6" fill={color}/>
      <circle cx="60" cy="62" r="34" fill={color}/>
      {mood!=="remind"&&mood!=="urgent"&&(<><circle cx="40" cy="68" r="7" fill="rgba(255,100,100,0.22)"/><circle cx="80" cy="68" r="7" fill="rgba(255,100,100,0.22)"/></>)}
      {mood==="celebrate"
        ? (<><text x="43" y="67" fontSize="14" textAnchor="middle">^</text><text x="77" y="67" fontSize="14" textAnchor="middle">^</text><path d="M45 78 Q60 90 75 78" stroke="#2C3E50" strokeWidth="2.5" fill="rgba(255,150,150,0.3)" strokeLinecap="round"/></>)
        : (mood==="remind"||mood==="urgent")
        ? (<><ellipse cx="44" cy="62" rx="7" ry="8" fill="white"/><circle cx="44" cy="64" r="4" fill="#2C3E50"/><ellipse cx="76" cy="62" rx="7" ry="8" fill="white"/><circle cx="76" cy="64" r="4" fill="#2C3E50"/><path d="M38 52 Q44 49 50 52" stroke="#2C3E50" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d="M70 52 Q76 49 82 52" stroke="#2C3E50" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d="M48 78 Q60 74 72 78" stroke="#2C3E50" strokeWidth="2.5" fill="none" strokeLinecap="round"/></>)
        : (<><ellipse cx="44" cy="62" rx="7" ry="8" fill="white"/><circle cx="44" cy="64" r="4" fill="#2C3E50"/><circle cx="45.5" cy="62" r="1.5" fill="white"/><ellipse cx="76" cy="62" rx="7" ry="8" fill="white"/><circle cx="76" cy="64" r="4" fill="#2C3E50"/><circle cx="77.5" cy="62" r="1.5" fill="white"/><path d="M47 76 Q60 85 73 76" stroke="#2C3E50" strokeWidth="2.5" fill="none" strokeLinecap="round"/></>)
      }
      <text x="60" y="112" fontSize="16" textAnchor="middle">🏠</text>
      <style>{`@keyframes waveArms{from{transform:rotate(-10deg)}to{transform:rotate(10deg)}}`}</style>
    </svg>
  );
}

function XPBar({ xp, level, color="#7EC8E3" }) {
  const needed=level*100, pct=Math.min((xp/needed)*100,100);
  return (
    <div style={{width:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#aaa",marginBottom:2}}><span>Nv.{level}</span><span>{xp}/{needed}XP</span></div>
      <div style={{background:"#eee",borderRadius:99,height:7,overflow:"hidden"}}>
        <div style={{background:`linear-gradient(90deg,${color},${color}88)`,width:`${pct}%`,height:"100%",borderRadius:99,transition:"width 0.6s ease"}}/>
      </div>
    </div>
  );
}

function AchievementToast({ achievement, onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,3200); return ()=>clearTimeout(t); },[]);
  return (
    <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:400,background:"linear-gradient(135deg,#FFD700,#FF8C42)",borderRadius:20,padding:"13px 22px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(255,215,0,0.4)",animation:"toastIn 0.4s ease",minWidth:240,fontFamily:"'Nunito',sans-serif"}}>
      <span style={{fontSize:28}}>{achievement.icon}</span>
      <div><div style={{fontWeight:900,fontSize:11,color:"rgba(255,255,255,0.8)",textTransform:"uppercase",letterSpacing:1}}>Logro desbloqueado</div><div style={{fontWeight:900,fontSize:14,color:"white"}}>{achievement.label}</div></div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </div>
  );
}

// ── Live indicator dot ────────────────────────────────────────────────────────
function LiveDot({ color="#27AE60" }) {
  return (
    <span style={{display:"inline-block",width:7,height:7,borderRadius:99,background:color,marginRight:4,boxShadow:`0 0 0 2px ${color}44`,animation:"pulse 1.5s ease-in-out infinite"}}>
      <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 2px ${color}44}50%{box-shadow:0 0 0 5px ${color}22}}`}</style>
    </span>
  );
}

// ── Focus Lock ────────────────────────────────────────────────────────────────
function FocusLockScreen({ profile, tasks, onUnlock }) {
  const myPending  = tasks.filter(t=>t.assignedTo===profile.id&&!t.done);
  const required   = myPending.filter(t=>t.focusRequired);
  const canUnlock  = required.length===0 || required.every(t=>t.done);
  return (
    <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Nunito',sans-serif"}}>
      <div style={{animation:"float 3s ease-in-out infinite"}}><HomieSVG mood="remind" size={100}/></div>
      <div style={{fontSize:26,margin:"12px 0 4px"}}>🔒</div>
      <div style={{fontSize:20,fontWeight:900,color:"white",marginBottom:6}}>Modo Enfoque</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",marginBottom:24,textAlign:"center",maxWidth:280}}>Completa tus tareas para desbloquear, {profile.name} {profile.avatar}</div>
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:9,marginBottom:24}}>
        {myPending.length===0
          ? <div style={{textAlign:"center",color:"rgba(255,255,255,0.4)",fontSize:13}}>¡Sin tareas pendientes! 🎉</div>
          : myPending.map(t=>(
            <div key={t.id} style={{background:"rgba(255,255,255,0.07)",borderRadius:14,padding:"11px 14px",display:"flex",alignItems:"center",gap:11,border:"1.5px solid rgba(255,255,255,0.1)"}}>
              <span style={{fontSize:20}}>{t.icon}</span>
              <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:"white"}}>{t.label}</div>{t.deadline&&<div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:1}}>{timeLabel(t.deadline)}</div>}</div>
              {t.focusRequired&&<span style={{fontSize:9,background:"rgba(255,87,34,0.3)",color:"#FF8A65",borderRadius:99,padding:"2px 8px",fontWeight:800}}>REQUERIDA</span>}
            </div>
          ))
        }
      </div>
      {canUnlock
        ? <button onClick={onUnlock} style={{padding:"13px 36px",background:"linear-gradient(135deg,#FFD700,#FF8C42)",color:"white",fontWeight:900,fontSize:15,border:"none",borderRadius:99,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(255,215,0,0.35)"}}>🎉 ¡Desbloquear!</button>
        : <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",textAlign:"center"}}>Completa las tareas requeridas primero</div>
      }
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// ── Setup screens ─────────────────────────────────────────────────────────────
function SetupScreen({ onDone }) {
  const [step,       setStep]    = useState("welcome"); // welcome | create | join | profile
  const [familyCode, setFCode]   = useState("");
  const [familyName, setFName]   = useState("");
  const [joinCode,   setJCode]   = useState("");
  const [myName,     setMyName]  = useState("");
  const [myAvatar,   setAvatar]  = useState("👨");
  const [myColor,    setColor]   = useState("#3498DB");
  const [myRole,     setRole]    = useState("parent");
  const [loading,    setLoading] = useState(false);
  const [error,      setError]   = useState("");

  const createFamily = async () => {
    if (!familyName.trim()) { setError("Ponle un nombre a tu familia"); return; }
    setLoading(true); setError("");
    const ok = await loadFirebase();
    if (!ok) { setError("Error cargando Firebase. Revisa tu configuración."); setLoading(false); return; }
    const code = genCode();
    const ref = fbRef(firebaseDb, `families/${code}`);
    await fbSet(ref, { name: familyName.trim(), code, createdAt: Date.now(), tasks:{}, members:{} });
    setFCode(code);
    setLoading(false);
    setStep("profile");
  };

  const joinFamily = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError("Ingresa el código de tu familia"); return; }
    setLoading(true); setError("");
    const ok = await loadFirebase();
    if (!ok) { setError("Error cargando Firebase."); setLoading(false); return; }
    const snap = await fbGet(fbRef(firebaseDb, `families/${code}`));
    if (!snap.exists()) { setError("Código no encontrado. Revisa con tu familia."); setLoading(false); return; }
    setFCode(code);
    setLoading(false);
    setStep("profile");
  };

  const saveProfile = async () => {
    if (!myName.trim()) { setError("Ingresa tu nombre"); return; }
    setLoading(true); setError("");
    const ok = await loadFirebase();
    if (!ok) { setError("Error cargando Firebase."); setLoading(false); return; }
    const memberId = genId();
    const member = { id:memberId, name:myName.trim(), avatar:myAvatar, color:myColor, role:myRole,
      xp:0, level:1, streak:0, totalDone:0, challengesDone:0, achievements:[], focusActive:false };
    await fbSet(fbRef(firebaseDb, `families/${familyCode}/members/${memberId}`), member);
    onDone({ familyCode, memberId });
  };

  const chip = (active,col,fn,children) => (
    <button onClick={fn} style={{padding:"8px 14px",borderRadius:99,border:`2px solid ${active?col:"#eee"}`,background:active?col+"1A":"white",fontWeight:700,fontSize:12,cursor:"pointer",color:active?col:"#888",transition:"all 0.15s",fontFamily:"inherit"}}>{children}</button>
  );

  const dark = step==="welcome";
  const bg   = dark ? "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)" : "linear-gradient(160deg,#E8F7FF,#FFF9F0,#F0FFF4)";

  return (
    <div style={{minHeight:"100vh",background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Nunito',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}*{box-sizing:border-box}`}</style>

      {step==="welcome" && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,width:"100%",maxWidth:340}}>
          <div style={{animation:"float 3s ease-in-out infinite"}}><HomieSVG mood="idle" size={100}/></div>
          <div style={{fontSize:28,fontWeight:900,color:"white",textAlign:"center",letterSpacing:-0.5}}>Homie Familia 🏠</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.5)",textAlign:"center",marginBottom:8}}>Tareas del hogar en familia,<br/>sincronizadas en tiempo real</div>
          <button onClick={()=>setStep("create")} style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#7EC8E3,#4ECDC4)",color:"white",fontWeight:900,fontSize:15,border:"none",borderRadius:16,cursor:"pointer",fontFamily:"inherit"}}>🏠 Crear mi familia</button>
          <button onClick={()=>setStep("join")} style={{width:"100%",padding:"14px",background:"rgba(255,255,255,0.08)",color:"white",fontWeight:800,fontSize:15,border:"2px solid rgba(255,255,255,0.15)",borderRadius:16,cursor:"pointer",fontFamily:"inherit"}}>🔗 Unirme con código</button>
        </div>
      )}

      {step==="create" && (
        <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{textAlign:"center",marginBottom:4}}>
            <div style={{fontSize:20,fontWeight:900,color:"#2C3E50"}}>Crear mi familia 🏠</div>
            <div style={{fontSize:12,color:"#aaa"}}>Elige un nombre para tu hogar</div>
          </div>
          <input value={familyName} onChange={e=>setFName(e.target.value)} placeholder="Ej: Familia García, Casa Pérez…"
            style={{width:"100%",border:"2px solid #E8F4FF",borderRadius:14,padding:"13px 16px",fontSize:15,fontFamily:"inherit",fontWeight:700,outline:"none",color:"#2C3E50"}}/>
          {error && <div style={{fontSize:12,color:"#E74C3C",fontWeight:700,textAlign:"center"}}>{error}</div>}
          <button onClick={createFamily} disabled={loading}
            style={{padding:"14px",background:"linear-gradient(135deg,#7EC8E3,#4ECDC4)",color:"white",fontWeight:900,fontSize:15,border:"none",borderRadius:16,cursor:"pointer",fontFamily:"inherit",opacity:loading?0.7:1}}>
            {loading?"Creando…":"✓ Crear familia"}
          </button>
          <button onClick={()=>setStep("welcome")} style={{padding:"10px",background:"transparent",color:"#aaa",fontWeight:700,fontSize:13,border:"none",cursor:"pointer",fontFamily:"inherit"}}>← Volver</button>
        </div>
      )}

      {step==="join" && (
        <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{textAlign:"center",marginBottom:4}}>
            <div style={{fontSize:20,fontWeight:900,color:"#2C3E50"}}>Unirme a mi familia 🔗</div>
            <div style={{fontSize:12,color:"#aaa"}}>Pide el código a quien creó la familia</div>
          </div>
          <input value={joinCode} onChange={e=>setJCode(e.target.value.toUpperCase())} placeholder="Ej: CASA-4X9K"
            style={{width:"100%",border:"2px solid #E8F4FF",borderRadius:14,padding:"13px 16px",fontSize:18,fontFamily:"inherit",fontWeight:900,outline:"none",color:"#2C3E50",textAlign:"center",letterSpacing:2}}/>
          {error && <div style={{fontSize:12,color:"#E74C3C",fontWeight:700,textAlign:"center"}}>{error}</div>}
          <button onClick={joinFamily} disabled={loading}
            style={{padding:"14px",background:"linear-gradient(135deg,#7EC8E3,#4ECDC4)",color:"white",fontWeight:900,fontSize:15,border:"none",borderRadius:16,cursor:"pointer",fontFamily:"inherit",opacity:loading?0.7:1}}>
            {loading?"Buscando…":"🔗 Unirme"}
          </button>
          <button onClick={()=>setStep("welcome")} style={{padding:"10px",background:"transparent",color:"#aaa",fontWeight:700,fontSize:13,border:"none",cursor:"pointer",fontFamily:"inherit"}}>← Volver</button>
        </div>
      )}

      {step==="profile" && (
        <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{textAlign:"center",marginBottom:4}}>
            <div style={{fontSize:20,fontWeight:900,color:"#2C3E50"}}>Tu perfil 👤</div>
            {familyCode && <div style={{fontSize:12,color:"#aaa"}}>Familia: <strong style={{color:"#7EC8E3",letterSpacing:1}}>{familyCode}</strong></div>}
          </div>

          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#777",marginBottom:6}}>Tu nombre</div>
            <input value={myName} onChange={e=>setMyName(e.target.value)} placeholder="¿Cómo te llamas?"
              style={{width:"100%",border:"2px solid #E8F4FF",borderRadius:12,padding:"11px 14px",fontSize:15,fontFamily:"inherit",fontWeight:700,outline:"none",color:"#2C3E50"}}/>
          </div>

          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#777",marginBottom:6}}>Elige tu avatar</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {AVATAR_OPTIONS.map(a=>(
                <button key={a} onClick={()=>setAvatar(a)} style={{fontSize:24,background:myAvatar===a?"#E8F4FF":"transparent",border:myAvatar===a?"2px solid #7EC8E3":"2px solid #eee",borderRadius:12,width:44,height:44,cursor:"pointer"}}>{a}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#777",marginBottom:6}}>Color</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {COLOR_OPTIONS.map(c=>(
                <button key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:99,background:c,border:myColor===c?"3px solid #2C3E50":"3px solid transparent",cursor:"pointer"}}/>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#777",marginBottom:6}}>Rol en la familia</div>
            <div style={{display:"flex",gap:8}}>
              {chip(myRole==="parent","#B8860B",()=>setRole("parent"),"👑 Padre/Madre")}
              {chip(myRole==="child","#7EC8E3",()=>setRole("child"),"👶 Hijo/a")}
            </div>
          </div>

          {error && <div style={{fontSize:12,color:"#E74C3C",fontWeight:700,textAlign:"center"}}>{error}</div>}

          <div style={{background:"#f0f0f0",borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:32}}>{myAvatar}</span>
            <div><div style={{fontWeight:900,fontSize:14,color:"#2C3E50"}}>{myName||"Tu nombre"}</div><div style={{fontSize:11,color:myRole==="parent"?"#B8860B":"#7EC8E3",fontWeight:700}}>{myRole==="parent"?"👑 Padre/Madre":"👶 Hijo/a"}</div></div>
          </div>

          <button onClick={saveProfile} disabled={loading}
            style={{padding:"14px",background:"linear-gradient(135deg,#7EC8E3,#4ECDC4)",color:"white",fontWeight:900,fontSize:15,border:"none",borderRadius:16,cursor:"pointer",fontFamily:"inherit",opacity:loading?0.7:1}}>
            {loading?"Guardando…":"✓ ¡Listo, entrar!"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Profile Selector ──────────────────────────────────────────────────────────
function ProfileSelector({ members, onSelect }) {
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Nunito',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}*{box-sizing:border-box}`}</style>
      <div style={{animation:"float 3s ease-in-out infinite",marginBottom:8}}><HomieSVG mood="idle" size={85}/></div>
      <div style={{fontSize:22,fontWeight:900,color:"white",marginBottom:4}}>¿Quién eres? 👋</div>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:28}}>Homie Familia</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,width:"100%",maxWidth:340}}>
        {members.map(m=>(
          <div key={m.id} onClick={()=>onSelect(m)}
            style={{background:m.focusActive?"rgba(30,10,10,0.6)":"rgba(255,255,255,0.07)",borderRadius:20,padding:"20px 14px",display:"flex",flexDirection:"column",alignItems:"center",gap:7,cursor:"pointer",border:`2px solid ${m.focusActive?"#c0392b":m.color+"55"}`,backdropFilter:"blur(6px)",transition:"all 0.2s"}}>
            <div style={{fontSize:40,position:"relative"}}>{m.avatar}{m.focusActive&&<span style={{position:"absolute",top:-4,right:-4,fontSize:14}}>🔒</span>}</div>
            <div style={{fontWeight:900,fontSize:14,color:"white"}}>{m.name}</div>
            <div style={{fontSize:9,color:m.role==="parent"?"#FFD700":"#7EC8E3",fontWeight:800,textTransform:"uppercase",letterSpacing:0.5}}>{m.role==="parent"?"👑 Padre/Madre":"👶 Hijo/a"}</div>
            {m.focusActive?<div style={{fontSize:10,color:"#FF6B6B",fontWeight:700}}>🔒 Modo enfoque</div>:<XPBar xp={m.xp} level={m.level} color={m.color}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Add Task Sheet ────────────────────────────────────────────────────────────
function AddTaskSheet({ members, currentMember, onAdd, onClose }) {
  const [label,      setLabel]   = useState("");
  const [icon,       setIcon]    = useState("🎯");
  const [priority,   setPri]     = useState("media");
  const [assignTo,   setAssign]  = useState(currentMember.id);
  const [isChallenge,setChall]   = useState(false);
  const [deadlineDays,setDL]     = useState("1");
  const [focusReq,   setFocReq]  = useState(false);
  const isParent = currentMember.role==="parent";

  const chip=(active,col,fn,txt)=>(
    <button onClick={fn} style={{padding:"6px 11px",borderRadius:99,border:`2px solid ${active?col:"#eee"}`,background:active?col+"1A":"white",fontWeight:700,fontSize:11,cursor:"pointer",color:active?col:"#888",transition:"all 0.15s",fontFamily:"inherit"}}>{txt}</button>
  );

  const submit=()=>{
    if(!label.trim()) return;
    const d=parseInt(deadlineDays,10);
    onAdd({id:genId(),icon,label:label.trim(),xp:PRIORITY_XP[priority],color:PRIORITY_COLOR[priority],
      assignedTo:assignTo,done:false,isChallenge,focusRequired:focusReq,
      deadline:!isNaN(d)&&deadlineDays!==""?addDays(d):null,createdAt:Date.now()});
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(3px)"}}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div style={{background:"white",borderRadius:"24px 24px 0 0",padding:"20px 18px 40px",width:"100%",maxWidth:440,animation:"slideUp 0.3s ease",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:16,fontWeight:900,color:"#2C3E50"}}>Nueva tarea 🎯</span>
          <button onClick={onClose} style={{background:"#f0f0f0",border:"none",borderRadius:99,width:30,height:30,fontSize:15,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{fontSize:10,fontWeight:800,color:"#777",marginBottom:5}}>Ícono</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
          {ICON_OPTIONS.map(ic=>(
            <button key={ic} onClick={()=>setIcon(ic)} style={{fontSize:17,background:icon===ic?"#E8F4FF":"transparent",border:icon===ic?"2px solid #7EC8E3":"2px solid #eee",borderRadius:9,width:34,height:34,cursor:"pointer"}}>{ic}</button>
          ))}
        </div>

        <div style={{fontSize:10,fontWeight:800,color:"#777",marginBottom:5}}>¿Qué hay que hacer?</div>
        <input autoFocus value={label} onChange={e=>setLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder="Ej: Hacer la tarea de matemáticas…"
          style={{width:"100%",border:"2px solid #E8F4FF",borderRadius:12,padding:"10px 13px",fontSize:13,fontFamily:"inherit",fontWeight:600,outline:"none",color:"#2C3E50",marginBottom:14}}/>

        {isParent&&(<>
          <div style={{fontSize:10,fontWeight:800,color:"#777",marginBottom:5}}>Asignar a</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {members.map(m=>chip(assignTo===m.id,m.color,()=>setAssign(m.id),`${m.avatar} ${m.name}`))}
          </div>
        </>)}

        <div style={{fontSize:10,fontWeight:800,color:"#777",marginBottom:5}}>Prioridad</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {["baja","media","alta"].map(p=>chip(priority===p,PRIORITY_COLOR[p],()=>setPri(p),`${p==="alta"?"🔥 Alta":p==="media"?"Media":"Baja"} +${PRIORITY_XP[p]}XP`))}
        </div>

        <div style={{fontSize:10,fontWeight:800,color:"#777",marginBottom:5}}>Cuándo vence</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {[["Hoy","0"],["Mañana","1"],["3 días","3"],["1 semana","7"],["Sin fecha",""]].map(([l,v])=>chip(deadlineDays===v,"#9B59B6",()=>setDL(v),l))}
        </div>

        <div onClick={()=>setChall(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",borderRadius:13,background:isChallenge?"#FFFBEA":"#f9f9f9",border:`2px solid ${isChallenge?"#FFD700":"#eee"}`,cursor:"pointer",marginBottom:8,transition:"all 0.2s"}}>
          <span style={{fontSize:20}}>{isChallenge?"🏆":"🎯"}</span>
          <div style={{flex:1}}><div style={{fontWeight:800,fontSize:12,color:isChallenge?"#B8860B":"#555"}}>{isChallenge?"¡Reto! (+10XP bonus)":"Marcar como reto"}</div></div>
          <div style={{width:20,height:20,borderRadius:99,background:isChallenge?"#FFD700":"#ddd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"white",fontWeight:900}}>{isChallenge?"✓":""}</div>
        </div>

        {isParent&&(
          <div onClick={()=>setFocReq(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",borderRadius:13,background:focusReq?"#FFF0F0":"#f9f9f9",border:`2px solid ${focusReq?"#E74C3C":"#eee"}`,cursor:"pointer",marginBottom:16,transition:"all 0.2s"}}>
            <span style={{fontSize:20}}>{focusReq?"🔒":"📱"}</span>
            <div style={{flex:1}}><div style={{fontWeight:800,fontSize:12,color:focusReq?"#c0392b":"#555"}}>{focusReq?"Requerida para desbloquear":"Requerir en Modo Enfoque"}</div></div>
            <div style={{width:20,height:20,borderRadius:99,background:focusReq?"#E74C3C":"#ddd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"white",fontWeight:900}}>{focusReq?"✓":""}</div>
          </div>
        )}

        <button onClick={submit} style={{width:"100%",padding:"13px",background:isChallenge?"linear-gradient(135deg,#FFD700,#FF8C42)":"linear-gradient(135deg,#7EC8E3,#4ECDC4)",color:"white",fontWeight:900,fontSize:14,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"inherit"}}>
          {isChallenge?"🏆 ¡Aceptar reto!":"✓ Agregar tarea"}
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function HomieApp() {
  const [session,  setSession]  = useState(null);      // { familyCode, memberId }
  const [members,  setMembers]  = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [me,       setMe]       = useState(null);
  const [view,     setView]     = useState("tasks");
  const [selMember,setSelMember]= useState(null);      // who's playing on this device
  const [mood,     setMood]     = useState("idle");
  const [bubble,   setBubble]   = useState("¡Hola! ¿Qué hacemos hoy? 🏠");
  const [popTask,  setPopTask]  = useState(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [toast,    setToast]    = useState(null);
  const [connected,setConnected]= useState(false);
  const [familyName,setFamilyName]= useState("Mi Familia");
  const [familyCode,setFamilyCode]= useState("");
  const moodTimer = useRef(null);
  const listenersRef = useRef([]);

  const say = (msg,m="idle",dur=3000) => {
    setBubble(msg); setMood(m);
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(()=>setMood("idle"),dur);
  };

  // Load session from memory
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem("homie_session")||"null");
      if (s) setSession(s);
    } catch {}
  }, []);

  // Subscribe to Firebase when session is set
  useEffect(() => {
    if (!session) return;
    let unsubs = [];
    (async () => {
      const ok = await loadFirebase();
      if (!ok) return;
      const { familyCode, memberId } = session;
      setFamilyCode(familyCode);

      // Family name
      const famRef = fbRef(firebaseDb, `families/${familyCode}/name`);
      const unsubFam = fbOnValue(famRef, snap => { if (snap.exists()) setFamilyName(snap.val()); });
      unsubs.push(()=>fbOff(famRef,"value",unsubFam));

      // Members
      const memRef = fbRef(firebaseDb, `families/${familyCode}/members`);
      const unsubMem = fbOnValue(memRef, snap => {
        const data = snap.val()||{};
        const arr = Object.values(data);
        setMembers(arr);
        const me = arr.find(m=>m.id===memberId);
        if (me) setMe(me);
      });
      unsubs.push(()=>fbOff(memRef,"value",unsubMem));

      // Tasks
      const taskRef = fbRef(firebaseDb, `families/${familyCode}/tasks`);
      const unsubTask = fbOnValue(taskRef, snap => {
        const data = snap.val()||{};
        setTasks(Object.values(data));
        setConnected(true);
      });
      unsubs.push(()=>fbOff(taskRef,"value",unsubTask));
    })();
    return () => unsubs.forEach(fn=>fn());
  }, [session]);

  const handleSetup = (data) => {
    sessionStorage.setItem("homie_session", JSON.stringify(data));
    setSession(data);
  };

  const completeTask = async (task) => {
    if (!task||task.done||!session) return;
    const { familyCode } = session;
    const memberId = selMember?.id||me?.id;
    if (!memberId) return;
    const member = members.find(m=>m.id===memberId);
    if (!member) return;

    // Update task
    await fbUpdate(fbRef(firebaseDb,`families/${familyCode}/tasks/${task.id}`),{done:true,doneBy:memberId,doneAt:Date.now()});

    // Update member stats
    const bonus  = task.isChallenge?10:0;
    const earned = task.xp+bonus;
    const newXp  = member.xp+earned;
    const newTotal = (member.totalDone||0)+1;
    const newCh  = task.isChallenge?(member.challengesDone||0)+1:(member.challengesDone||0);
    let finalXp  = newXp, newLevel = member.level;
    if (newXp >= member.level*100) { finalXp=newXp-member.level*100; newLevel=member.level+1; say("¡SUBISTE DE NIVEL! 🎊","celebrate",4000); }
    else say(rand(MESSAGES.complete),"celebrate",2500);

    setPopTask(task.id); setTimeout(()=>setPopTask(null),700);

    const newStats = {xp:finalXp,level:newLevel,totalDone:newTotal,challengesDone:newCh};
    await fbUpdate(fbRef(firebaseDb,`families/${familyCode}/members/${memberId}`),newStats);

    // Check achievements
    const updatedMember = {...member,...newStats,achievements:member.achievements||[]};
    const newAch = ALL_ACHIEVEMENTS.filter(a=>!updatedMember.achievements.includes(a.id)&&a.req(updatedMember));
    if (newAch.length) {
      setToast(newAch[0]);
      await fbUpdate(fbRef(firebaseDb,`families/${familyCode}/members/${memberId}`),{achievements:[...updatedMember.achievements,...newAch.map(a=>a.id)]});
    }
  };

  const addTask = async (task) => {
    if (!session) return;
    await fbSet(fbRef(firebaseDb,`families/${session.familyCode}/tasks/${task.id}`),task);
    setShowAdd(false);
    say(task.isChallenge?rand(MESSAGES.challenge):"¡Tarea añadida! 📌",task.isChallenge?"celebrate":"idle",2500);
  };

  const toggleFocus = async (childId) => {
    if (!session) return;
    const child = members.find(m=>m.id===childId);
    if (!child) return;
    await fbUpdate(fbRef(firebaseDb,`families/${session.familyCode}/members/${childId}`),{focusActive:!child.focusActive});
  };

  const logout = () => { sessionStorage.removeItem("homie_session"); setSession(null); setMe(null); setSelMember(null); setMembers([]); setTasks([]); };

  // ── Routing ─────────────────────────────────────────────────────────────────
  if (!session) return <SetupScreen onDone={handleSetup}/>;
  if (!connected||!me) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'Nunito',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{animation:"float2 1s ease-in-out infinite alternate",fontSize:48}}>🏠</div>
      <div style={{color:"white",fontWeight:800,fontSize:16}}>Conectando con tu familia…</div>
      <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{familyCode}</div>
      <style>{`@keyframes float2{from{transform:translateY(0)}to{transform:translateY(-10px)}}`}</style>
    </div>
  );
  if (!selMember) return <ProfileSelector members={members} onSelect={setSelMember}/>;

  const activeProfile = selMember;
  const isParent = activeProfile.role==="parent";
  const myStats  = members.find(m=>m.id===activeProfile.id)||activeProfile;
  const focusOn  = myStats.focusActive && !isParent;

  if (focusOn) return <FocusLockScreen profile={activeProfile} tasks={tasks}
    onUnlock={async()=>{ await fbUpdate(fbRef(firebaseDb,`families/${session.familyCode}/members/${activeProfile.id}`),{focusActive:false}); say("¡Bien hecho! 🎉","celebrate",3000); }}/>;

  const myTasks   = isParent ? tasks : tasks.filter(t=>t.assignedTo===activeProfile.id);
  const ORDER     = {overdue:0,critical:1,warning:2,normal:3,done:4};
  const sorted    = [...myTasks].sort((a,b)=>(ORDER[urgencyLevel(a)]??3)-(ORDER[urgencyLevel(b)]??3));
  const doneCount = myTasks.filter(t=>t.done).length;
  const pendCount = myTasks.filter(t=>!t.done).length;
  const children  = members.filter(m=>m.role==="child");

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#E8F7FF,#FFF9F0,#F0FFF4)",fontFamily:"'Nunito',sans-serif",display:"flex",justifyContent:"center",padding:"18px 14px 60px"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes popIn{0%{transform:scale(1)}50%{transform:scale(1.13)}100%{transform:scale(1)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes checkPop{0%{transform:scale(0) rotate(-20deg);opacity:0}70%{transform:scale(1.3)}100%{transform:scale(1);opacity:1}}
        .tr{animation:slideIn 0.2s ease;transition:transform 0.15s}.tr:hover{transform:translateX(3px)}
        .homie-float{animation:float 3s ease-in-out infinite}
        .btn:hover{opacity:0.88;transform:translateY(-1px)}.btn:active{transform:scale(0.97)}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ddd;border-radius:99px}
      `}</style>

      {toast&&<AchievementToast achievement={toast} onDone={()=>setToast(null)}/>}

      <div style={{width:"100%",maxWidth:430}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <button onClick={()=>setSelMember(null)} style={{fontSize:30,background:"none",border:"none",cursor:"pointer",padding:0,lineHeight:1}}>{activeProfile.avatar}</button>
            <div>
              <div style={{fontSize:15,fontWeight:900,color:"#2C3E50",display:"flex",alignItems:"center",gap:6}}>
                {activeProfile.name}
                {isParent&&<span style={{fontSize:10,background:"#FFF9E0",color:"#B8860B",borderRadius:99,padding:"2px 7px",fontWeight:800}}>👑</span>}
              </div>
              <div style={{fontSize:10,color:"#aaa",fontWeight:600,display:"flex",alignItems:"center"}}>
                <LiveDot color={connected?"#27AE60":"#aaa"}/>{connected?"En vivo · ":""}{familyName} · {familyCode}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:5}}>
            <div style={{background:"white",borderRadius:11,padding:"5px 9px",display:"flex",alignItems:"center",gap:3,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              <span>🔥</span><span style={{fontWeight:800,color:"#FF6B35",fontSize:12}}>{myStats.streak||0}</span>
            </div>
            <div style={{background:"white",borderRadius:11,padding:"5px 9px",display:"flex",alignItems:"center",gap:3,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              <span>⭐</span><span style={{fontWeight:800,color:"#F39C12",fontSize:12}}>{myStats.xp||0}</span>
            </div>
          </div>
        </div>

        {/* Homie card */}
        <div style={{background:"white",borderRadius:22,padding:"14px",boxShadow:"0 4px 20px rgba(0,0,0,0.08)",marginBottom:12,display:"flex",alignItems:"center",gap:11,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,right:0,width:80,height:80,background:"radial-gradient(circle,rgba(126,200,227,0.12) 0%,transparent 70%)",borderRadius:"0 22px 0 100%"}}/>
          <div className="homie-float" style={{flexShrink:0}}><HomieSVG mood={mood} size={82}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{background:"#F0F8FF",border:"2px solid #D0EEFF",borderRadius:"13px 13px 13px 3px",padding:"8px 11px",fontSize:12,fontWeight:700,color:"#2C3E50",marginBottom:9,lineHeight:1.4,minHeight:36}}>{bubble}</div>
            <XPBar xp={myStats.xp||0} level={myStats.level||1} color={activeProfile.color}/>
            <div style={{marginTop:6,display:"flex",gap:10,fontSize:10}}>
              <span style={{color:"#888"}}>✅ <strong style={{color:"#27AE60"}}>{doneCount}</strong></span>
              <span style={{color:"#888"}}>⏳ <strong style={{color:"#FF6B35"}}>{pendCount}</strong></span>
              <span style={{color:"#888"}}>🏆 <strong style={{color:"#B8860B"}}>{(myStats.achievements||[]).length}</strong></span>
              <span style={{color:"#888"}}>👥 <strong style={{color:"#7EC8E3"}}>{members.length}</strong> miembros</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {[["tasks","📋 Tareas"],["family","👨‍👩‍👧 Familia"],["achievements","🏆 Logros"]].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} style={{flex:1,padding:"8px 4px",borderRadius:11,border:"none",background:view===k?"#2C3E50":"white",color:view===k?"white":"#888",fontWeight:800,fontSize:11,cursor:"pointer",fontFamily:"inherit",boxShadow:view===k?"none":"0 1px 6px rgba(0,0,0,0.07)",transition:"all 0.15s"}}>{l}</button>
          ))}
        </div>

        {/* ── TASKS ── */}
        {view==="tasks"&&(
          <>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              {sorted.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"#ccc",fontWeight:700}}><div style={{fontSize:32,marginBottom:6}}>🎉</div>¡Sin tareas!</div>}
              {sorted.map(task=>{
                const urg=urgencyLevel(task), s=URGENCY[urg];
                const owner=members.find(m=>m.id===task.assignedTo);
                const canComplete = isParent||task.assignedTo===activeProfile.id;
                return (
                  <div key={task.id} className="tr"
                    onClick={()=>canComplete&&completeTask(task)}
                    style={{background:task.done?"#fafafa":s.bg,borderRadius:15,padding:"11px 12px",display:"flex",alignItems:"center",gap:10,cursor:task.done||!canComplete?"default":"pointer",boxShadow:task.done?"none":"0 2px 10px rgba(0,0,0,0.05)",border:`2px solid ${s.border}`,opacity:task.done?0.5:1,transition:"all 0.2s",animation:popTask===task.id?"popIn 0.4s ease":undefined}}>
                    <div style={{width:38,height:38,borderRadius:11,background:task.done?"#f0f0f0":`${task.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0,border:`2px solid ${task.done?"#e8e8e8":task.color+"40"}`,position:"relative"}}>
                      {task.icon}
                      {task.isChallenge&&!task.done&&<div style={{position:"absolute",top:-5,right:-5,fontSize:10}}>🏆</div>}
                      {task.focusRequired&&!task.done&&<div style={{position:"absolute",bottom:-5,right:-5,fontSize:10}}>🔒</div>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:13,color:task.done?"#aaa":"#2C3E50",textDecoration:task.done?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2,flexWrap:"wrap"}}>
                        {owner&&<span style={{fontSize:9,fontWeight:800,background:owner.color+"20",color:owner.color,borderRadius:99,padding:"1px 6px"}}>{owner.avatar} {owner.name}</span>}
                        {(urg==="overdue"||urg==="critical")&&<span style={{fontSize:9,fontWeight:800,background:urg==="overdue"?"#c0392b":"#FF5722",color:"white",borderRadius:99,padding:"1px 6px"}}>{urg==="overdue"?"⚠ VENCIDA":"🔴 URGENTE"}</span>}
                        {task.deadline&&!task.done&&<span style={{fontSize:10,color:"#bbb",fontWeight:700}}>{timeLabel(task.deadline)}</span>}
                        <span style={{fontSize:10,color:task.done?"#ccc":task.color,fontWeight:700}}>+{task.xp}XP</span>
                        {task.doneBy&&task.done&&<span style={{fontSize:9,color:"#bbb"}}>{members.find(m=>m.id===task.doneBy)?.avatar}</span>}
                      </div>
                    </div>
                    {task.done?<div style={{fontSize:17,animation:"checkPop 0.4s ease"}}>✅</div>:<div style={{width:22,height:22,borderRadius:99,border:`2.5px solid ${task.color}`,flexShrink:0}}/>}
                  </div>
                );
              })}
            </div>
            <button className="btn" onClick={()=>setShowAdd(true)}
              style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,#7EC8E3,#4ECDC4)",color:"white",fontWeight:900,fontSize:14,border:"none",borderRadius:15,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",boxShadow:"0 4px 14px rgba(78,205,196,0.28)"}}>
              + Agregar tarea o reto
            </button>
          </>
        )}

        {/* ── FAMILY ── */}
        {view==="family"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Invite card */}
            <div style={{background:"linear-gradient(135deg,#2C3E50,#34495e)",borderRadius:18,padding:"16px",marginBottom:2}}>
              <div style={{fontWeight:800,fontSize:13,color:"white",marginBottom:4}}>📲 Invita a tu familia</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.55)",marginBottom:10}}>Comparte este código para que se unan desde su celular</div>
              <div style={{background:"rgba(255,255,255,0.1)",borderRadius:12,padding:"12px",textAlign:"center",letterSpacing:4,fontSize:22,fontWeight:900,color:"#7EC8E3"}}>{familyCode}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",textAlign:"center",marginTop:6}}>Funciona en iPhone y Android · Safari y Chrome</div>
            </div>

            {/* Family XP */}
            <div style={{background:"white",borderRadius:18,padding:"14px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
              <div style={{fontWeight:800,fontSize:12,color:"#2C3E50",marginBottom:8}}>👨‍👩‍👧 Progreso familiar</div>
              <div style={{background:"#f0f0f0",borderRadius:99,height:12,overflow:"hidden",marginBottom:5}}>
                <div style={{background:"linear-gradient(90deg,#7EC8E3,#FFD700,#FF6B35)",width:`${Math.min((tasks.filter(t=>t.done).length/20)*100,100)}%`,height:"100%",borderRadius:99,transition:"width 0.6s ease"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#aaa"}}>
                <span>{tasks.filter(t=>t.done).length} tareas completadas</span><span>Meta: 20</span>
              </div>
            </div>

            {/* Members */}
            {members.map(m=>{
              const mt=tasks.filter(t=>t.assignedTo===m.id);
              const md=mt.filter(t=>t.done).length, mp=mt.filter(t=>!t.done).length;
              const isChild=m.role==="child";
              return (
                <div key={m.id} style={{background:"white",borderRadius:18,padding:"14px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",border:`2px solid ${m.focusActive?"#FFCDD2":"transparent"}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{fontSize:34,lineHeight:1}}>{m.avatar}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:900,fontSize:14,color:"#2C3E50",display:"flex",alignItems:"center",gap:6}}>
                        {m.name}
                        {m.id===session.memberId&&<span style={{fontSize:9,background:"#E8F4FF",color:"#7EC8E3",borderRadius:99,padding:"2px 6px",fontWeight:800}}>Tú</span>}
                        {m.focusActive&&<span style={{fontSize:9,background:"#FFEBEE",color:"#c0392b",borderRadius:99,padding:"2px 6px",fontWeight:800}}>🔒 Enfoque</span>}
                      </div>
                      <div style={{fontSize:9,color:m.role==="parent"?"#B8860B":"#7EC8E3",fontWeight:800,marginBottom:4}}>{m.role==="parent"?"👑 Padre/Madre":"👶 Hijo/a"}</div>
                      <XPBar xp={m.xp||0} level={m.level||1} color={m.color}/>
                    </div>
                    <div style={{textAlign:"center",flexShrink:0}}>
                      <div style={{fontWeight:900,fontSize:18,color:"#FF6B35"}}>{m.streak||0}</div>
                      <div style={{fontSize:8,color:"#aaa"}}>🔥racha</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:7,marginBottom:isParent&&isChild?10:0}}>
                    {[[md,"✅","#27AE60"],[mp,"⏳","#FF6B35"],[(m.achievements||[]).length,"🏆","#B8860B"]].map(([v,ic,c],i)=>(
                      <div key={i} style={{flex:1,background:"#f9f9f9",borderRadius:10,padding:"7px",textAlign:"center"}}>
                        <div style={{fontWeight:900,fontSize:15,color:c}}>{v}</div>
                        <div style={{fontSize:8,color:"#aaa",fontWeight:700}}>{ic}</div>
                      </div>
                    ))}
                  </div>
                  {isParent&&isChild&&(
                    <button onClick={()=>toggleFocus(m.id)}
                      style={{width:"100%",padding:"9px",background:m.focusActive?"#FFEBEE":"linear-gradient(135deg,#2C3E50,#34495e)",color:m.focusActive?"#c0392b":"white",fontWeight:800,fontSize:12,border:`2px solid ${m.focusActive?"#FFCDD2":"transparent"}`,borderRadius:11,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
                      {m.focusActive?"🔓 Desactivar Modo Enfoque":"🔒 Activar Modo Enfoque"}
                    </button>
                  )}
                </div>
              );
            })}

            <button onClick={logout} style={{padding:"10px",background:"transparent",color:"#ccc",fontWeight:700,fontSize:12,border:"2px solid #eee",borderRadius:12,cursor:"pointer",fontFamily:"inherit"}}>
              Cambiar de familia / cerrar sesión
            </button>
          </div>
        )}

        {/* ── ACHIEVEMENTS ── */}
        {view==="achievements"&&(
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <div style={{background:"white",borderRadius:16,padding:"13px 14px",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",marginBottom:2}}>
              <div style={{fontWeight:900,fontSize:13,color:"#2C3E50"}}>{activeProfile.avatar} {activeProfile.name} · Logros</div>
              <div style={{fontSize:11,color:"#aaa",marginBottom:7}}>{(myStats.achievements||[]).length} de {ALL_ACHIEVEMENTS.length}</div>
              <div style={{background:"#f0f0f0",borderRadius:99,height:7,overflow:"hidden"}}>
                <div style={{background:"linear-gradient(90deg,#FFD700,#FF8C42)",width:`${(((myStats.achievements||[]).length)/ALL_ACHIEVEMENTS.length)*100}%`,height:"100%",borderRadius:99,transition:"width 0.6s ease"}}/>
              </div>
            </div>
            {ALL_ACHIEVEMENTS.map(a=>{
              const unlocked=(myStats.achievements||[]).includes(a.id);
              return (
                <div key={a.id} style={{background:unlocked?"white":"#fafafa",borderRadius:15,padding:"12px 13px",display:"flex",alignItems:"center",gap:11,boxShadow:unlocked?"0 2px 10px rgba(0,0,0,0.07)":"none",border:`2px solid ${unlocked?"#FFD70055":"#eee"}`,opacity:unlocked?1:0.5}}>
                  <div style={{width:44,height:44,borderRadius:13,background:unlocked?"linear-gradient(135deg,#FFD700,#FF8C42)":"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                    {unlocked?a.icon:"🔒"}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:13,color:unlocked?"#2C3E50":"#aaa"}}>{a.label}</div>
                    <div style={{fontSize:11,color:"#bbb",marginTop:1}}>{a.desc}</div>
                  </div>
                  {unlocked&&<div style={{fontSize:16}}>✅</div>}
                </div>
              );
            })}
          </div>
        )}

        <div style={{textAlign:"center",fontSize:10,color:"#ccc",marginTop:16,fontWeight:600}}>
          Cambios en tiempo real para toda la familia 🔴
        </div>
      </div>

      {showAdd&&<AddTaskSheet members={members} currentMember={activeProfile} onAdd={addTask} onClose={()=>setShowAdd(false)}/>}
    </div>
  );
}
