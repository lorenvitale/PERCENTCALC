import React, { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, Settings, Image as ImageIcon, Eraser, Copy, Shield, History, Plus, Minus, X, Divide, Percent, Delete, Save } from "lucide-react";
import { motion } from "framer-motion";
import Tesseract from "tesseract.js";

// ---- Utility helpers -------------------------------------------------------
const fmt = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(v);
};

const parseNumber = (s) => {
  if (typeof s === "number") return s;
  if (!s) return 0;
  // Accetta virgola o punto come decimale, rimuove spazi
  const norm = s
    .toString()
    .trim()
    .replace(/[\s\u00A0]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // separatori migliaia
    .replace(",", ".");
  const v = Number(norm);
  return Number.isFinite(v) ? v : 0;
};

const defaultPercents = [5, 6, 10, 16, 20, 25];

const defaultPrefs = {
  theme: "light",
  percents: defaultPercents,
};

const loadPrefs = () => {
  try {
    const s = localStorage.getItem("provvcalc_prefs");
    return s ? { ...defaultPrefs, ...JSON.parse(s) } : defaultPrefs;
  } catch {
    return defaultPrefs;
  }
};

const savePrefs = (prefs) => {
  try {
    localStorage.setItem("provvcalc_prefs", JSON.stringify(prefs));
  } catch {}
};

// Extract numbers from OCR text (e.g., "Premio imponibile: 1.234,50" -> [1234.5])
const numbersFromText = (text) => {
  const candidates = text.match(/\d{1,3}(?:[\.\s]\d{3})*(?:[\,\.]\d+)?|\d+(?:[\,\.]\d+)?/g) || [];
  return candidates
    .map((t) => t.replace(/[\s\u00A0]/g, ""))
    .map((t) => {
      // If both , and . appear, assume . thousands and , decimal (it-IT style)
      if (t.includes(".") && t.includes(",")) {
        return parseNumber(t.replace(/\./g, "").replace(",", "."));
      }
      // If only comma, assume decimal
      if (t.includes(",")) return parseNumber(t.replace(",", "."));
      // Else just number with maybe thousands as . previously removed
      return parseNumber(t);
    })
    .filter((n) => Number.isFinite(n));
};

// ---- Components ------------------------------------------------------------
const Logo = ({ theme }) => (
  <div className="flex items-center gap-3 select-none">
    <div className="relative w-10 h-10">
      <svg viewBox="0 0 64 64" className="w-10 h-10">
        <defs>
          <linearGradient id="grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={theme === "dark" ? "#60a5fa" : "#1d4ed8"} />
            <stop offset="100%" stopColor={theme === "dark" ? "#93c5fd" : "#3b82f6"} />
          </linearGradient>
        </defs>
        <path d="M32 4l22 10v14c0 12.7-9.2 24.9-22 28-12.8-3.1-22-15.3-22-28V14L32 4z" fill="url(#grad)"/>
        <g fill="white" opacity="0.95">
          <path d="M20 28h24v4H20z"/>
          <path d="M28 20h8v24h-8z"/>
        </g>
      </svg>
    </div>
    <div className="leading-tight">
      <div className="text-xl font-semibold tracking-tight">ProvvCalc</div>
      <div className="text-xs opacity-70 -mt-0.5">Calcolatrice provvigioni smart</div>
    </div>
  </div>
);

function App() {
  const [prefs, setPrefs] = useState(loadPrefs());
  const [display, setDisplay] = useState("0");
  const [pendingOp, setPendingOp] = useState(null); // { op: '+', value: number }
  const [history, setHistory] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const fileInputRef = useRef(null);
  const [importedNumbers, setImportedNumbers] = useState([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", prefs.theme === "dark");
  }, [prefs.theme]);

  // Keyboard input: digits, ops, enter, backspace, escape, percent presets (F1–F6)
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key;
      // Allow typing numbers (including numpad)
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        inputDigit(k);
        return;
      }
      if (k === "," || k === ".") {
        e.preventDefault();
        addDot();
        return;
      }
      if (k === "+" || k === "-" || k === "*" || k === "/") {
        e.preventDefault();
        setOp(k);
        return;
      }
      if (k === "Enter" || k === "=") {
        e.preventDefault();
        equals();
        return;
      }
      if (k === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (k === "Escape") {
        e.preventDefault();
        clearAll();
        return;
      }
      // Quick percent: F1–F6 apply custom % buttons 1–6
      if (/^F[1-6]$/.test(k)) {
        const idx = Number(k.slice(1)) - 1;
        const p = prefs.percents[idx];
        if (typeof p === "number") {
          e.preventDefault();
          applyPercent(p);
        }
        return;
      }
      // Toggle theme with 't'
      if (k.toLowerCase() === "t") {
        e.preventDefault();
        toggleTheme();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prefs.percents]);

  const pushHistory = (expression, result) => {
    const item = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      expression,
      result,
    };
    setHistory((h) => [item, ...h].slice(0, 200));
  };

  const clearAll = () => {
    setDisplay("0");
    setPendingOp(null);
  };

  const inputDigit = (d) => {
    setDisplay((cur) => {
      if (cur === "0" && d !== "," && d !== ".") return String(d);
      return cur + String(d);
    });
  };

  const addDot = () => {
    setDisplay((cur) => (cur.includes(",") || cur.includes(".") ? cur : cur + ","));
  };

  const backspace = () => {
    setDisplay((cur) => (cur.length <= 1 ? "0" : cur.slice(0, -1)));
  };

  const setOp = (op) => {
    const val = parseNumber(display);
    if (pendingOp) {
      // chain operations: compute previous first
      const r = evalOp(pendingOp.value, val, pendingOp.op);
      setPendingOp({ op, value: r });
      setDisplay("0");
    } else {
      setPendingOp({ op, value: val });
      setDisplay("0");
    }
  };

  const evalOp = (a, b, op) => {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  };

  const equals = () => {
    const val = parseNumber(display);
    if (pendingOp) {
      const r = evalOp(pendingOp.value, val, pendingOp.op);
      pushHistory(`${fmt(pendingOp.value)} ${pendingOp.op} ${fmt(val)}`, r);
      setDisplay(String(r));
      setPendingOp(null);
    } else {
      pushHistory(`${fmt(val)}`, val);
    }
  };

  const applyPercent = (p) => {
    const base = parseNumber(display);
    const r = (base * p) / 100;
    pushHistory(`${fmt(base)} × ${p}%`, r);
    setDisplay(String(r));
  };

  const updatePercent = (idx, newVal) => {
    const v = Math.max(0, Math.min(1000, Number(newVal)));
    const next = [...prefs.percents];
    next[idx] = v;
    const np = { ...prefs, percents: next };
    setPrefs(np);
    savePrefs(np);
  };

  const toggleTheme = () => {
    const np = { ...prefs, theme: prefs.theme === "dark" ? "light" : "dark" };
    setPrefs(np);
    savePrefs(np);
  };

  const onOcrFile = async (file) => {
    if (!file) return;
    setOcrBusy(true);
    try {
      const { data } = await Tesseract.recognize(file, "ita+eng", {
        logger: () => {},
      });
      const txt = data.text || "";
      const nums = numbersFromText(txt);
      setImportedNumbers(nums);
    } catch (e) {
      console.error(e);
      alert("OCR non riuscito. Riprova con un'immagine più nitida.");
    } finally {
      setOcrBusy(false);
    }
  };

  const pasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            await onOcrFile(blob);
            return;
          }
        }
      }
      alert("Nessuna immagine trovata negli appunti.");
    } catch (e) {
      alert("Impossibile leggere dagli appunti: verifica i permessi del browser.");
    }
  };

  const insertImported = (n) => {
    setDisplay(String(n));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/70 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo theme={prefs.theme} />
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
              {prefs.theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>} 
            </button>
            <button onClick={() => setShowSettings(true)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
              <Settings size={18}/> <span className="hidden sm:inline">Impostazioni</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Calculator Card */}
        <motion.section layout className="lg:col-span-3">
          <div className="rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-900 dark:to-slate-800">
              <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 font-semibold">Calcolatrice</div>
              <div className="mt-2 text-3xl font-semibold text-blue-900 dark:text-blue-200 text-right tabular-nums">{fmt(parseNumber(display))}</div>
              {pendingOp && (
                <div className="text-right text-xs text-slate-500 mt-1">Operazione in corso: {fmt(pendingOp.value)} {pendingOp.op}</div>
              )}
            </div>
            <div className="p-4 grid grid-cols-4 gap-2">
              {/* Row 1 */}
              <CalcKey onClick={clearAll} className="col-span-1 bg-slate-100 dark:bg-slate-800"><Eraser size={18}/> AC</CalcKey>
              <CalcKey onClick={backspace} className="col-span-1 bg-slate-100 dark:bg-slate-800"><Delete size={18}/> DEL</CalcKey>
              <CalcKey onClick={() => setOp("/")} className="col-span-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"><Divide size={18}/></CalcKey>
              <CalcKey onClick={() => setOp("*")} className="col-span-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">×</CalcKey>

              {/* Row 2 */}
              {[7,8,9].map((n) => (
                <CalcKey key={n} onClick={() => inputDigit(n)}>{n}</CalcKey>
              ))}
              <CalcKey onClick={() => setOp("-")} className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"><Minus size={18}/></CalcKey>

              {/* Row 3 */}
              {[4,5,6].map((n) => (
                <CalcKey key={n} onClick={() => inputDigit(n)}>{n}</CalcKey>
              ))}
              <CalcKey onClick={() => setOp("+")} className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"><Plus size={18}/></CalcKey>

              {/* Row 4 */}
              {[1,2,3].map((n) => (
                <CalcKey key={n} onClick={() => inputDigit(n)}>{n}</CalcKey>
              ))}
              <CalcKey onClick={equals} className="row-span-2 bg-blue-600 text-white hover:bg-blue-700">=</CalcKey>

              {/* Row 5 */}
              <CalcKey onClick={() => inputDigit(0)} className="col-span-2">0</CalcKey>
              <CalcKey onClick={addDot}>,</CalcKey>
            </div>

            {/* Fixed Percent Buttons */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Percent size={16}/> Tasti % personalizzabili</div>
                <button onClick={() => setShowSettings(true)} className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"><Settings size={14}/> Modifica</button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {prefs.percents.map((p, i) => (
                  <button key={i} onClick={() => applyPercent(p)} className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800/60 font-medium">
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Sidebar: OCR + History */}
        <motion.aside layout className="lg:col-span-2 space-y-6">
          {/* OCR Card */}
          <div className="rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><ImageIcon size={18}/> <span className="font-medium">Importa dati da foto/screen (OCR)</span></div>
              <div className="flex items-center gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Carica immagine</button>
                <button onClick={pasteImage} className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Incolla</button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onOcrFile(e.target.files?.[0])} />
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              {ocrBusy ? (
                <div className="text-sm text-slate-500">Analisi in corso…</div>
              ) : importedNumbers.length === 0 ? (
                <div className="text-sm text-slate-500">Qui compariranno i numeri trovati (es. premi imponibili).</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {importedNumbers.map((n, idx) => (
                    <button key={idx} onClick={() => insertImported(n)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
                      {fmt(n)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* History Card */}
          <div className="rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><History size={18}/> <span className="font-medium">Storico calcoli</span></div>
              <button onClick={() => setHistory([])} className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Svuota</button>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-auto">
              {history.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">Nessun calcolo ancora.</div>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500">{new Date(h.ts).toLocaleString("it-IT")}</div>
                      <div className="text-sm">{h.expression}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold tabular-nums">{fmt(h.result)}</div>
                      <button onClick={() => navigator.clipboard.writeText(String(h.result))} className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title="Copia risultato"><Copy size={16}/></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.aside>
      </main>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="rounded-2xl w-full max-w-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="font-semibold">Impostazioni</div>
              <button onClick={() => setShowSettings(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16}/></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Tasti fissi %</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {prefs.percents.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" step="0.01" min="0" max="1000" value={p} onChange={(e) => updatePercent(i, e.target.value)} className="w-24 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"/>
                      <span className="text-sm">%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm">Tema</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const np = { ...prefs, theme: "light" }; setPrefs(np); savePrefs(np); }} className={`px-3 py-1 rounded-md border ${prefs.theme === "light" ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 dark:border-slate-700"}`}>Chiaro</button>
                  <button onClick={() => { const np = { ...prefs, theme: "dark" }; setPrefs(np); savePrefs(np); }} className={`px-3 py-1 rounded-md border ${prefs.theme === "dark" ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 dark:border-slate-700"}`}>Scuro</button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"><Save size={16}/> Fine</button>
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-xs text-slate-500">
        <div className=\"flex items-center justify-center gap-2 mb-2\"><Shield size=\{14\}/> Made for insurance workflows • Tema blu</div>
        <div>Tips: carica uno screenshot del gestionale, premi imponibile → OCR estrae i numeri → tocca per inserirli → usa i tasti % per le provvigioni. Da tastiera: numeri 0–9, "," o "." per il decimale, + − × ÷, Invio (=) per uguale, Backspace per cancella, Esc per AC, F1–F6 per applicare i 6 % personalizzati, "t" per tema.</div>
      </footer>
    </div>
  );
}

const CalcKey = ({ children, className = "", onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-lg font-medium flex items-center justify-center gap-2 ${className}`}
  >
    {children}
  </button>
);

export default App;
