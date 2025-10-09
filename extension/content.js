// === ProvvCalc content.js (weighted labels) ===
const TAG = "[ProvvCalc:content]";
const NUM_RE = /(?:€\s*)?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?/g;

// Pesi: maggiore = più importante. Le "negative" hanno pesi negativi.
const LABEL_WEIGHTS = [
  { re: /totale\s*imponibile/i, weight: 100 },
  { re: /imponibile/i,         weight: 80 },
  { re: /premio\s*imponibile/i,weight: 70 },
  { re: /totale\s*imposta/i,   weight: 5 },   // a volte vicino all'imponibile
  { re: /totale\s*prima/i,     weight: 1 },

  // Penalità per evitare prese sbagliate
  { re: /premio\s*lordo\s*annuo/i, weight: -100 },
  { re: /lordo\s*annuo/i,          weight: -80 },
  { re: /lordo/i,                  weight: -40 },
];

function parseIt(numLike) {
  if (!numLike) return null;
  let s = String(numLike).trim().replace(/\s|€|EUR/gi, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function textOf(el) {
  return (el?.innerText || el?.textContent || "").trim();
}

// Cerca il numero nella "stessa riga" (stesso <tr>) o vicino alla label
function findNumberNear(el) {
  // 1) Stessa riga di tabella
  const tr = el.closest("tr");
  if (tr) {
    const t = textOf(tr);
    const m = t.match(NUM_RE) || [];
    for (let i = m.length - 1; i >= 0; i--) {
      const v = parseIt(m[i]);
      if (v && v > 0) return v;
    }
  }
  // 2) Fratelli nello stesso contenitore
  const p = el.parentElement;
  if (p) {
    for (const sib of p.children) {
      if (sib === el) continue;
      const ms = textOf(sib).match(NUM_RE) || [];
      for (let i = ms.length - 1; i >= 0; i--) {
        const v = parseIt(ms[i]);
        if (v && v > 0) return v;
      }
    }
  }
  // 3) Dentro la label stessa o suoi figli
  const t = textOf(el);
  const m = t.match(NUM_RE) || [];
  for (let i = m.length - 1; i >= 0; i--) {
    const v = parseIt(m[i]);
    if (v && v > 0) return v;
  }
  for (const child of el.querySelectorAll("*")) {
    const mm = textOf(child).match(NUM_RE) || [];
    for (let i = mm.length - 1; i >= 0; i--) {
      const v = parseIt(mm[i]);
      if (v && v > 0) return v;
    }
  }
  return null;
}

function scoreForLabel(txt) {
  let score = 0;
  for (const { re, weight } of LABEL_WEIGHTS) {
    if (re.test(txt)) score += weight;
  }
  return score;
}

function scanAll() {
  let best = null;
  let bestLabel = null;
  let bestScore = -Infinity;
  let examined = 0;

  try {
    const nodes = Array.from(document.querySelectorAll("label, span, div, td, th"));
    examined = nodes.length;

    for (const el of nodes) {
      const txt = textOf(el);
      if (!txt) continue;

      const s = scoreForLabel(txt.toLowerCase());
      if (s <= 0) continue; // ignora label non utili o penalizzate

      const v = findNumberNear(el);
      if (v && s > bestScore) {
        best = v;
        bestLabel = txt;
        bestScore = s;
      }
    }

    // Fallback: se non abbiamo trovato nulla con label, prova tutto il testo
    if (best == null) {
      const allText = textOf(document.body);
      const matches = allText.match(NUM_RE) || [];
      const candidates = matches.map(parseIt).filter(n => n && n > 0);
      if (candidates.length) {
        const filtered = candidates.filter(n => n > 10);
        best = (filtered.length ? Math.max(...filtered) : Math.max(...candidates));
        bestLabel = "fallback";
        bestScore = 1;
      }
    }
  } catch (e) {
    console.warn(TAG, "scan error", e);
  }

  console.log(TAG, "scanAll → imponibile:", best, "label:", bestLabel, "score:", bestScore, "nodes:", examined, "url:", location.href);
  chrome.runtime.sendMessage({ type: "IMPO_DEBUG", imponibile: best, url: location.href, nodes: examined, label: bestLabel, score: bestScore });

  if (best != null) {
    chrome.runtime.sendMessage({ type: "IMPO_UPDATE", imponibile: best, label: bestLabel });
  }
}

// Mutations (SPA)
const observer = new MutationObserver(() => {
  clearTimeout(window.__provvcalc_t);
  window.__provvcalc_t = setTimeout(scanAll, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

// Rescan manuale
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RESCAN_IMPO") scanAll();
});

// Prima scansione
scanAll();
