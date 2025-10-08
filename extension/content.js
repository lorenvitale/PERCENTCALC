// === ProvvCalc content.js ===
const TAG = "[ProvvCalc:content]";
const NUM_RE = /(?:€\s*)?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?/g;

function parseIt(numLike) {
  if (!numLike) return null;
  let s = String(numLike).trim().replace(/\s|€|EUR/gi, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const KEYWORDS = ["premio imponibile", "imponibile", "premio", "importi"];

function findNearestNumber(node) {
  const t = (node.innerText || node.textContent || "").trim();
  const m = t.match(NUM_RE);
  if (m && m.length) {
    for (let i = m.length - 1; i >= 0; i--) {
      const v = parseIt(m[i]);
      if (v && v > 0) return v;
    }
  }
  const p = node.parentElement;
  if (p) {
    for (const sib of p.children) {
      if (sib === node) continue;
      const mm = (sib.innerText || sib.textContent || "").match(NUM_RE) || [];
      for (let i = mm.length - 1; i >= 0; i--) {
        const v = parseIt(mm[i]);
        if (v && v > 0) return v;
      }
    }
  }
  for (const child of node.querySelectorAll("*")) {
    const mm = (child.innerText || child.textContent || "").match(NUM_RE) || [];
    for (let i = mm.length - 1; i >= 0; i--) {
      const v = parseIt(mm[i]);
      if (v && v > 0) return v;
    }
  }
  return null;
}

function scanAll() {
  let best = null;
  let examined = 0;

  try {
    const nodes = Array.from(document.querySelectorAll("label, span, div, td, th"));
    examined = nodes.length;
    const keyNodes = nodes.filter(el => {
      const txt = (el.innerText || el.textContent || "").toLowerCase();
      return KEYWORDS.some(k => txt.includes(k));
    });

    for (const el of keyNodes) {
      const v = findNearestNumber(el);
      if (v) { best = v; break; }
    }

    if (!best) {
      const allText = document.body?.innerText || "";
      const matches = allText.match(NUM_RE) || [];
      const candidates = matches.map(parseIt).filter(n => n && n > 0);
      if (candidates.length) {
        const filtered = candidates.filter(n => n > 10);
        best = (filtered.length ? Math.max(...filtered) : Math.max(...candidates));
      }
    }
  } catch (e) {
    console.warn(TAG, "scan error", e);
  }

  console.log(TAG, "scanAll → imponibile:", best, "nodes:", examined, "url:", location.href);
  chrome.runtime.sendMessage({ type: "IMPO_DEBUG", imponibile: best, url: location.href, nodes: examined });

  if (best) {
    chrome.runtime.sendMessage({ type: "IMPO_UPDATE", imponibile: best });
  }
}

const observer = new MutationObserver(() => {
  clearTimeout(window.__provvcalc_t);
  window.__provvcalc_t = setTimeout(scanAll, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RESCAN_IMPO") {
    console.log(TAG, "RESCAN_IMPO");
    scanAll();
  }
});

scanAll();
