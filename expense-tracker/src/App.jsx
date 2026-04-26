import { useState, useEffect, useRef, useCallback } from 'react';
import Dashboard from './Dashboard';
import Settings from './Settings';
import Insights from './Insights';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc,
  getDocs, deleteDoc, doc,
  query, orderBy,
} from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';

/* ─────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────── */
const GEMINI_KEY = 'PASTE_KEY_HERE';   // ← paste your Gemini key here

const firebaseConfig = {
  apiKey: 'AIzaSyAQKkbjnICmP2KwQ1TbQvaRIjyACdSxkAM',
  authDomain: 'capstone-project-2834c.firebaseapp.com',
  projectId: 'capstone-project-2834c',
  storageBucket: 'capstone-project-2834c.firebasestorage.app',
  messagingSenderId: '99913464938',
  appId: '1:99913464938:web:0eabaa58e77c1d052b9e13',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const EXPENSES_COL = 'expenses';

/* ─────────────────────────────────────────────────────────
   PURE HELPERS
───────────────────────────────────────────────────────── */
function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function isToday(ts) {
  if (!ts) return false;
  const d = new Date(ts), t = new Date();
  return d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear();
}

/* ─────────────────────────────────────────────────────────
   LOCAL KEYWORD PARSER (fallback when Gemini is unavailable)
───────────────────────────────────────────────────────── */
const FOOD_KEYS      = ['zomato','swiggy','food','lunch','dinner','breakfast','restaurant','cafe','tea','coffee','snack','meal','blinkit','zepto','instamart','chai','pizza','burger','biryani','dhaba','eat','bakery','kfc','mcdonalds','subway','dominos','juice','maggi','noodles'];
const TRANSPORT_KEYS = ['travel','uber','ola','auto','rickshaw','metro','bus','train','cab','taxi','rapido','petrol','fuel','flight','ticket','fare','diesel','airport','bike','toll','parking','commute'];
const SHOPPING_KEYS  = ['amazon','flipkart','mall','clothes','shirt','shoes','myntra','meesho','purchase','bought','order','delivery','ajio','shopping','bag','watch','phone','laptop','gadget','electronics','jeans','dress','jacket','groceries','supermarket','dmart','bigbasket'];
const HEALTH_KEYS    = ['pharmacy','medicine','doctor','hospital','clinic','chemist','medical','tablet','prescription','gym','fitness','yoga','health','apollo','capsule','syrup'];
const ENTERTAIN_KEYS = ['netflix','prime','movie','game','spotify','concert','hotstar','show','subscription','cinema','bookmyshow'];

// Category detection helper — finds which category keyword appears first
function detectCategory(text) {
  const t = text.toLowerCase();
  const checks = [
    { cat: 'Food',          keys: FOOD_KEYS },
    { cat: 'Transport',     keys: TRANSPORT_KEYS },
    { cat: 'Shopping',      keys: SHOPPING_KEYS },
    { cat: 'Health',        keys: HEALTH_KEYS },
    { cat: 'Entertainment', keys: ENTERTAIN_KEYS },
  ];
  let best = { cat: 'Other', pos: Infinity };
  checks.forEach(({ cat, keys }) => {
    keys.forEach(k => {
      const pos = t.indexOf(k);
      if (pos !== -1 && pos < best.pos) best = { cat, pos };
    });
  });
  return best.cat;
}

function localParse(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const rest = trimmed.replace(match[0], '').trim();
  return { amount, category: detectCategory(trimmed), description: rest || 'Unnamed expense' };
}

/* ─────────────────────────────────────────────────────────
   GEMINI API
───────────────────────────────────────────────────────── */
async function geminiParse(userText) {
  const prompt = `You are an expense categorizer for Indian users. Return ONLY valid JSON, no markdown, no explanation.
Format: {"amount": number, "category": "Food|Transport|Shopping|Health|Entertainment|Other", "description": "short clean label in 2-4 words"}
Rules:
- Extract the number as amount in rupees
- For category, use these keyword mappings strictly:
  Food: zomato, swiggy, food, lunch, dinner, breakfast, restaurant, cafe, tea, coffee, snack, meal, blinkit, zepto, instamart
  Transport: travel, uber, ola, auto, rickshaw, metro, bus, train, cab, taxi, rapido, petrol, fuel, flight, ticket, fare
  Shopping: amazon, flipkart, mall, clothes, shirt, shoes, myntra, meesho, purchase, bought, order, delivery
  Health: pharmacy, medicine, doctor, hospital, clinic, chemist, medical, tablet, prescription, gym, fitness
  Entertainment: netflix, prime, movie, game, spotify, concert, hotstar, show, ticket, subscription
  Other: anything that doesn't match above
- If multiple categories match, pick the one whose keyword appears FIRST in the input string
- description should be clean and short, 2-4 words
Input: "${userText}"`;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

/* ─────────────────────────────────────────────────────────
   FIRESTORE
───────────────────────────────────────────────────────── */
async function fetchFromFirestore(uid) {
  if (!uid) return [];
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('Firestore fetch timeout')), 6000)
  );
  const q = query(collection(db, 'users', uid, EXPENSES_COL), orderBy('timestamp', 'desc'));
  const snap = await Promise.race([getDocs(q), timeout]);
  return snap.docs.map(d => ({
    firestoreId: d.id,
    id: d.id,
    amount: d.data().amount,
    category: d.data().category,
    desc: d.data().description,
    raw: d.data().raw,
    ts: d.data().timestamp,
  }));
}

async function saveToFirestore(parsed, rawText, uid) {
  if (!uid) throw new Error('Not logged in');
  const now = new Date();
  const docData = {
    amount: parsed.amount,
    category: parsed.category,
    description: parsed.description,
    raw: rawText,
    timestamp: now.toISOString(),
    date: now.toISOString().slice(0, 10),
  };
  const ref = await addDoc(collection(db, 'users', uid, EXPENSES_COL), docData);
  return { firestoreId: ref.id, ...docData };
}

/* ─────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────── */
const PLACEHOLDERS = [
  'e.g. 250 Zomato lunch',
  'e.g. 80 auto rickshaw to office',
  'e.g. 1200 Amazon headphones',
  'e.g. 45 metro fare',
  'e.g. 500 pharmacy medicines',
  'e.g. 350 Swiggy dinner',
  'e.g. 2500 Myntra jacket',
  'e.g. 699 Netflix subscription',
];

const BADGE_CLASS = {
  Food: 'badge-Food',
  Transport: 'badge-Transport',
  Shopping: 'badge-Shopping',
  Health: 'badge-Health',
  Entertainment: 'badge-Entertainment',
  Other: 'badge-Other',
};

const CAT_COLORS = {
  Food: '#F59E0B',
  Transport: '#22D3EE',
  Shopping: '#A78BFA',
  Health: '#F87171',
  Entertainment: '#FBBF24',
  Other: '#6B7280',
};

/* ─────────────────────────────────────────────────────────
   useAnimatedNumber — counts up/down on value change
───────────────────────────────────────────────────────── */
function useAnimatedNumber(target, duration = 500) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    const start = prev.current;
    const delta = target - start;
    if (delta === 0) return;
    const startTime = performance.now();
    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(start + delta * ease));
      if (t < 1) requestAnimationFrame(step);
      else prev.current = target;
    }
    requestAnimationFrame(step);
  }, [target, duration]);

  return display;
}

/* ─────────────────────────────────────────────────────────
   EntryCard
───────────────────────────────────────────────────────── */
function EntryCard({ entry, onDelete }) {
  const [removing, setRemoving] = useState(false);

  function handleDelete() {
    setRemoving(true);
    // Let CSS animation play out, then notify parent
    setTimeout(() => onDelete(entry), 320);
  }

  return (
    <div
      className={`entry-card${removing ? ' removing' : ''}`}
      data-category={entry.category}
    >
      <div className="entry-amount">
        <span className="currency">₹</span>
        {Number(entry.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
      <div className="entry-info">
        <div className="entry-desc">{entry.desc}</div>
        <div className="entry-raw">{entry.raw}</div>
      </div>
      <div className={`category-badge ${BADGE_CLASS[entry.category] ?? 'badge-Other'}`}>
        {entry.category}
      </div>
      <div className="entry-time">{formatTime(entry.ts)}</div>
      <button className="entry-delete" onClick={handleDelete} title="Delete entry">
        ×
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SpendingBreakdown — category bar chart
───────────────────────────────────────────────────────── */
function SpendingBreakdown({ entries }) {
  const total = entries.reduce((s, e) => s + e.amount, 0);

  if (!entries.length) {
    return (
      <div className="breakdown-section">
        <div className="section-label">// spending breakdown</div>
        <div className="breakdown-empty">
          No data yet — log an expense to see your category breakdown
        </div>
      </div>
    );
  }
  const cats = {};
  entries.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  return (
    <div className="breakdown-section">
      <div className="section-label">// spending breakdown</div>
      <div className="breakdown-list">
        {sorted.map(([cat, amount]) => {
          const pct = ((amount / total) * 100).toFixed(0);
          return (
            <div key={cat} className="breakdown-row">
              <div className={`breakdown-label category-badge ${BADGE_CLASS[cat] ?? 'badge-Other'}`}>
                {cat}
              </div>
              <div className="breakdown-bar-track">
                <div
                  className="breakdown-bar-fill"
                  style={{ width: `${pct}%`, background: CAT_COLORS[cat] ?? '#6B7280' }}
                />
              </div>
              <div className="breakdown-meta">
                <span className="breakdown-pct">{pct}%</span>
                <span className="breakdown-amt">{formatINR(amount)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   BOOT SCREEN
───────────────────────────────────────────────────────── */
const BOOT_LINES = [
  'EXPENSEOS v2.1.0',
  '// initializing modules...',
  '// connecting to database...',
  '// loading user data...',
  '// all systems nominal ✓',
];

function BootScreen({ onDone }) {
  const [displayed, setDisplayed] = useState(['']);
  const [lineIdx, setLineIdx]     = useState(0);
  const [charIdx, setCharIdx]     = useState(0);
  const [fading, setFading]       = useState(false);

  useEffect(() => {
    if (lineIdx >= BOOT_LINES.length) {
      setTimeout(() => setFading(true), 500);
      setTimeout(onDone, 1100);
      return;
    }
    const line = BOOT_LINES[lineIdx];
    if (charIdx < line.length) {
      const t = setTimeout(() => {
        setDisplayed(prev => {
          const d = [...prev];
          d[lineIdx] = line.slice(0, charIdx + 1);
          return d;
        });
        setCharIdx(c => c + 1);
      }, 40);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setLineIdx(l => l + 1);
        setCharIdx(0);
        setDisplayed(prev => [...prev, '']);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [lineIdx, charIdx]);

  return (
    <div className={`boot-screen${fading ? ' fading' : ''}`}>
      <div className="grid-bg" />
      <div className="scanlines" />
      <div className="boot-terminal">
        {displayed.map((line, i) => (
          <div key={i} className="boot-line">
            <span className="boot-prompt">$ </span>
            <span className={i === BOOT_LINES.length - 1 && lineIdx >= BOOT_LINES.length ? 'boot-success' : ''}>{line}</span>
            {i === lineIdx && lineIdx < BOOT_LINES.length && charIdx < BOOT_LINES[lineIdx].length && (
              <span className="boot-cursor">▋</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   APP
───────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser]             = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [booting, setBooting]       = useState(() => !sessionStorage.getItem('expenseOS_booted'));
  const [allEntries, setAllEntries] = useState([]);
  const [view, setView]             = useState('LOG');
  const [transitioning, setTransitioning] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [logState, setLogState]     = useState('idle'); // idle|parsing|categorizing|saving|done
  const [liveDate, setLiveDate]     = useState('READY');
  const [toast, setToast]           = useState({ visible: false, msg: '' });
  const [showCursor, setShowCursor] = useState(true);
  const [barError, setBarError]     = useState(false);
  const [fetchingCloud, setFetchingCloud] = useState(true);
  const [confirmClear, setConfirmClear]   = useState(false);
  const [detectedCat, setDetectedCat]     = useState(null); // real-time preview

  const inputRef = useRef(null);
  const inputFocusRef = useRef(false);
  const phStateRef = useRef({ idx: 0, charIdx: 0, deleting: false });
  const phTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const confirmTimerRef = useRef(null);

  /* ── Live date ───────────────────────────────────────── */
  useEffect(() => {
    function update() {
      setLiveDate(
        new Date().toLocaleDateString('en-IN', {
          weekday: 'short', day: '2-digit', month: 'short',
        }).toUpperCase()
      );
    }
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  /* ── Auth state ──────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  /* ── Initial Firestore load ──────────────────────────── */
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAllEntries([]); setFetchingCloud(false); return; }
    (async () => {
      setFetchingCloud(true);
      try {
        const loaded = await fetchFromFirestore(user.uid);
        setAllEntries(loaded);
      } catch (err) {
        console.warn('Firestore fetch skipped:', err.message);
      } finally {
        setFetchingCloud(false);
      }
      setTimeout(() => inputRef.current?.focus(), 700);
    })();
  }, [user, authLoading]);

  /* ── Toast helper ────────────────────────────────────── */
  const showToast = useCallback((msg) => {
    clearTimeout(toastTimerRef.current);
    setToast({ visible: true, msg });
    toastTimerRef.current = setTimeout(
      () => setToast(t => ({ ...t, visible: false })),
      2800
    );
  }, []);

  /* ── Placeholder typewriter animation ────────────────── */
  const animatePh = useCallback(() => {
    if (!inputRef.current) return;

    if (inputFocusRef.current) {
      phTimerRef.current = setTimeout(animatePh, 200);
      return;
    }

    const st = phStateRef.current;
    const current = PLACEHOLDERS[st.idx];

    if (!st.deleting) {
      st.charIdx++;
      inputRef.current.placeholder = current.slice(0, st.charIdx);
      if (st.charIdx >= current.length) {
        st.deleting = true;
        phTimerRef.current = setTimeout(animatePh, 1800);
        return;
      }
      phTimerRef.current = setTimeout(animatePh, 55);
    } else {
      st.charIdx--;
      inputRef.current.placeholder = current.slice(0, st.charIdx);
      if (st.charIdx <= 0) {
        st.deleting = false;
        st.idx = (st.idx + 1) % PLACEHOLDERS.length;
        phTimerRef.current = setTimeout(animatePh, 400);
        return;
      }
      phTimerRef.current = setTimeout(animatePh, 28);
    }
  }, []); // stable — uses refs only

  useEffect(() => {
    const id = setTimeout(animatePh, 1200);
    return () => { clearTimeout(id); clearTimeout(phTimerRef.current); };
  }, [animatePh]);

  /* ── Derived Data & Stats ────────────────────────────── */
  const todayEntries = allEntries.filter(e => isToday(e.ts));

  const total = todayEntries.reduce((s, e) => s + e.amount, 0);
  const animatedTotal = useAnimatedNumber(total);
  const animatedCount = useAnimatedNumber(todayEntries.length);

  // Real-time category preview
  const detectedPreview = (() => {
    const m = inputValue.match(/^(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/i);
    if (!m) return null;
    const cat = detectCategory(inputValue);
    return { amount: parseFloat(m[1]), cat };
  })();

  const topCat = (() => {
    if (!todayEntries.length) return null;
    const counts = {};
    todayEntries.forEach(e => { counts[e.category] = (counts[e.category] || 0) + e.amount; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  })();

  /* ── Delete single entry ─────────────────────────────── */
  function deleteEntry(entry) {
    if (!user) return;
    setAllEntries(prev => prev.filter(e => e.id !== entry.id));
    if (entry.firestoreId && !entry.firestoreId.startsWith('local_')) {
      deleteDoc(doc(db, 'users', user.uid, EXPENSES_COL, entry.firestoreId))
        .catch(err => console.warn('Single delete failed:', err.message));
    }
  }

  /* ── Log expense ─────────────────────────────────────── */
  async function logExpense() {
    if (logState !== 'idle') return;
    const raw = inputValue.trim();

    if (!raw) {
      setBarError(true);
      setTimeout(() => setBarError(false), 600);
      inputRef.current?.focus();
      return;
    }

    if (!/^[₹\d]/.test(raw) && !/^rs/i.test(raw)) {
      setBarError(true);
      setTimeout(() => setBarError(false), 700);
      showToast('⚠ Start with an amount — e.g. "250 Zomato"');
      return;
    }

    setLogState('parsing');

    /* Parse — Gemini first, local fallback */
    let parsed;
    try {
      if (GEMINI_KEY && GEMINI_KEY !== 'PASTE_KEY_HERE') {
        parsed = await geminiParse(raw);
      } else {
        await new Promise(r => setTimeout(r, 600));
        parsed = localParse(raw);
      }
    } catch (err) {
      console.warn('Gemini failed, using local parser:', err.message);
      parsed = localParse(raw);
    }

    if (!parsed?.amount) {
      setLogState('idle');
      showToast('⚠ Could not parse amount. Try "250 Zomato lunch"');
      return;
    }

    setLogState('categorizing');
    await new Promise(r => setTimeout(r, 600));
    setLogState('saving');

    /* Save — Firestore with 10s timeout */
    const firestoreTimeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), 10000)
    );
    let saved;
    try {
      saved = await Promise.race([saveToFirestore(parsed, raw, user?.uid), firestoreTimeout]);
    } catch (err) {
      console.warn('Firestore save issue:', err.message);
      const now = new Date();
      saved = {
        firestoreId: 'local_' + Date.now(),
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        raw,
        timestamp: now.toISOString(),
      };
      showToast('⚠ Cloud save failed — showing locally');
    }

    const entry = {
      firestoreId: saved.firestoreId,
      id: saved.firestoreId,
      amount: saved.amount,
      category: saved.category,
      desc: saved.description,
      raw: saved.raw,
      ts: saved.timestamp,
    };

    setAllEntries(prev => [entry, ...prev]);
    setInputValue('');
    setLogState('done');

    if (!saved.firestoreId.startsWith('local_')) {
      showToast(`✓ ${formatINR(entry.amount)} · ${entry.category} logged`);
    }
    setTimeout(() => { setLogState('idle'); inputRef.current?.focus(); }, 800);
  }

  const changeView = (newView) => {
    if (newView === view) return;
    setTransitioning(true);
    setTimeout(() => { setView(newView); setTransitioning(false); }, 150);
  };

  /* ── Clear all (two-click confirm, instant UI clear) ── */
  function handleClearClick() {
    if (!allEntries.length) return;

    if (!confirmClear) {
      // First click — arm the confirmation
      setConfirmClear(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }

    // Second click — execute immediately
    clearTimeout(confirmTimerRef.current);
    setConfirmClear(false);

    const ids = allEntries
      .map(e => e.firestoreId)
      .filter(id => id && !id.startsWith('local_'));

    // Clear UI right away — don’t wait for Firestore
    setAllEntries([]);
    showToast('All entries cleared ✓');

    // Fire Firestore deletes in background
    if (ids.length > 0 && user) {
      Promise.all(ids.map(id => deleteDoc(doc(db, 'users', user.uid, EXPENSES_COL, id))))
        .catch(err => console.warn('Firestore delete error:', err.message));
    }
  }

  /* ── Boot screen ─────────────────────────────────── */
  if (booting) {
    return <BootScreen onDone={() => { sessionStorage.setItem('expenseOS_booted', '1'); setBooting(false); }} />;
  }

  /* ── Auth gate ──────────────────────────────────────── */
  if (authLoading) {
    return (
      <>
        <div className="grid-bg" /><div className="scanlines" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--green)', fontFamily:'var(--font)', letterSpacing:'0.1em' }}>INITIALIZING...</div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <div className="grid-bg" /><div className="scanlines" />
        <div className="login-screen">
          <div className="login-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            </div>
            <h1>EXPENSE<span className="logo-os">OS</span></h1>
            <div className="logo-subtitle" style={{ fontSize:'13px' }}>// your personal expense terminal</div>
          </div>
          <button className="login-btn" onClick={() => signInWithPopup(auth, provider)}>SIGN IN WITH GOOGLE &nbsp;→</button>
          <div className="login-disclaimer">your data is private and tied to your account</div>
        </div>
      </>
    );
  }

  /* ── View renderer ────────────────────────────────────── */
  const renderViewContent = () => {
    if (view === 'DASHBOARD') return <Dashboard allEntries={allEntries} />;
    if (view === 'SETTINGS')  return <Settings />;
    if (view === 'INSIGHTS')  return <Insights allEntries={allEntries} />;
    return (
      <div className="log-view-layout">
        <div className="input-section">
          <div className={`command-bar${barError ? ' error' : ''}`}>
            <div className="command-prompt">&gt;_</div>
            <div className="command-input-wrap">
              <input ref={inputRef} type="text" id="commandInput" value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && logExpense()}
                onFocus={() => { inputFocusRef.current = true;  setShowCursor(false); }}
                onBlur={()  => { inputFocusRef.current = false; setShowCursor(true);  }}
                autoComplete="off" autoCorrect="off" spellCheck={false} disabled={logState !== 'idle'}
              />
              {showCursor && <div className="blinking-cursor" />}
            </div>
            <button
              className={`log-btn${logState !== 'idle' ? ' loading' : ''}${logState === 'done' ? ' done' : ''}`}
              id="logBtn" onClick={logExpense} disabled={logState !== 'idle'} aria-label="Log expense"
            >
              {logState === 'parsing'      ? <span className="loading-inner">PARSING…</span>
                : logState === 'categorizing' ? <span className="loading-inner">CATEGORIZING…</span>
                : logState === 'saving'       ? <span className="loading-inner">SAVING…</span>
                : logState === 'done'         ? <span className="loading-inner">✓ LOGGED</span>
                : <>LOG IT &nbsp;→</>}
            </button>
          </div>
          <div className="hint-text">
            {detectedPreview
              ? <>Detected: <span>{formatINR(detectedPreview.amount)}</span> · likely <span className={`badge-${detectedPreview.cat}`} style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10px' }}>{detectedPreview.cat}</span></>
              : <>Try: <span>"350 Swiggy dinner"</span> · <span>"120 travel to work"</span> · <span>"2400 Amazon headphones"</span></>
            }
          </div>
        </div>

        <div className="summary-section">
          <div className="stats-row">
            <div className="stat-block first stagger-1">
              <div className="stat-label">Total Spent Today</div>
              <div className="stat-value accent">{formatINR(animatedTotal)}</div>
              <div className="stat-sub">{todayEntries.length ? (todayEntries.length === 1 ? '1 entry' : `${todayEntries.length} entries`) : 'no entries yet'}</div>
            </div>
            <div className="stat-block stagger-2">
              <div className="stat-label">Top Category</div>
              <div className="stat-value" style={{ fontSize:'18px', letterSpacing:'0.02em' }}>{topCat ? topCat[0] : '—'}</div>
              <div className="stat-sub">{topCat ? `${formatINR(topCat[1])} spent` : '—'}</div>
            </div>
            <div className="stat-block stagger-3">
              <div className="stat-label">Entries Count</div>
              <div className="stat-value">{animatedCount}</div>
              <div className="stat-sub">logged today</div>
            </div>
          </div>
        </div>

        <div className="entries-section">
          <div className="entries-header">
            <div className="section-label" style={{ margin:0, flex:1, display:'flex', alignItems:'center', gap:'8px' }}>
              // recent entries <span className="live-dot" />
            </div>
            <button className={`clear-btn${confirmClear ? ' confirming' : ''}`} onClick={handleClearClick}>
              {confirmClear ? 'CONFIRM?' : 'CLEAR ALL'}
            </button>
          </div>
          <div className="entries-list" id="entriesList">
            {fetchingCloud ? (
              <div className="cloud-loading">FETCHING FROM CLOUD…</div>
            ) : todayEntries.length === 0 ? (
              <div className="empty-state" id="emptyState">
                <div className="empty-state-label">// awaiting first entry...</div>
                <div className="empty-chips">
                  {[
                    { label: '⚡ 250 Swiggy dinner',  value: '250 Swiggy dinner' },
                    { label: '🚗 120 travel to work', value: '120 travel to work' },
                    { label: '💊 500 pharmacy',       value: '500 pharmacy' },
                  ].map(chip => (
                    <button key={chip.value} className="chip-btn" onClick={() => {
                      setInputValue(chip.value);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}>{chip.label}</button>
                  ))}
                </div>
              </div>
            ) : (
              todayEntries.map(entry => <EntryCard key={entry.id} entry={entry} onDelete={deleteEntry} />)
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <>
      <div className="grid-bg" />
      <div className="scanlines" />

      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="sidebar-logo">
              <div className="logo-icon">
                <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <div className="logo-text">
                <h1>EXPENSE<span className="logo-os">OS</span></h1>
                <div className="logo-subtitle">v2.1.0</div>
              </div>
            </div>
            <nav className="sidebar-nav">
              <button className={`nav-item ${view==='LOG'?'active':''}`} onClick={() => changeView('LOG')}><span className="nav-icon">⚡</span> Log Expense</button>
              <button className={`nav-item ${view==='DASHBOARD'?'active':''}`} onClick={() => changeView('DASHBOARD')}><span className="nav-icon">📊</span> Dashboard</button>
              <button className={`nav-item ${view==='INSIGHTS'?'active':''}`} onClick={() => changeView('INSIGHTS')}><span className="nav-icon">🤖</span> AI Insights</button>
              <button className={`nav-item ${view==='SETTINGS'?'active':''}`} onClick={() => changeView('SETTINGS')}><span className="nav-icon">⚙</span> Settings</button>
            </nav>
          {/* Quick Stats panel */}
          {(() => {
            const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
            const weekEntries = allEntries.filter(e => new Date(e.ts) >= weekAgo);
            const weekCats = {};
            weekEntries.forEach(e => { weekCats[e.category] = (weekCats[e.category] || 0) + 1; });
            const topWeekCat = Object.entries(weekCats).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
            return (
              <div className="sidebar-quick-stats">
                <div className="qs-title">// QUICK STATS</div>
                <div className="qs-row">
                  <div className="qs-item"><span className="qs-label">Today</span><span className="qs-val">{formatINR(total)}</span></div>
                  <div className="qs-item"><span className="qs-label">Entries</span><span className="qs-val">{todayEntries.length}</span></div>
                  <div className="qs-item"><span className="qs-label">Top this week</span><span className="qs-val" style={{fontSize:'10px'}}>{topWeekCat}</span></div>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <img src={user.photoURL} alt="Profile" className="profile-img" referrerPolicy="no-referrer" />
            <div className="user-details">
              <span className="user-name">{user.displayName}</span>
              <button className="signout-btn sidebar-signout" onClick={() => signOut(auth)}>SIGN OUT</button>
            </div>
          </div>
        </div>
        </aside>

        <main className="main-content">
          <header className="top-bar">
            <h2 className="page-title">// {view === 'LOG' ? 'LOG EXPENSE' : view}</h2>
            <div className="header-status">
              <div className="status-dot" />
              <span>{liveDate}</span>
            </div>
          </header>
          <div className={`content-scroll-area${transitioning ? ' view-transitioning' : ''}`}>
            {renderViewContent()}
          </div>
        </main>
      </div>

      <div className={`toast${toast.visible ? ' show' : ''}`} id="toast">
        <span>✓</span><span id="toastMsg">{toast.msg}</span>
      </div>
    </>
  );
}
