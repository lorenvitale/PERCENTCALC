const NUM_RE = /(?:€\s*)?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?/g;

function parseIt(numLike) {
  if (!numLike) return null;
  let s = String(numLike).trim().replace(/\s|€|EUR/gi, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickImponibileFromNode(node) {
  const text = (node?.innerText || node?.textContent || "").trim();
  if (!text) return null;
  if (/(imponibile|premio|premio imponibile)/i.test(text)) {
    const matches = text.match(NUM_RE) || [];
    for (let i = matches.length - 1; i >= 0; i--) {
      const v = parseIt(matches[i]);
      if (v !== null && v > 0) return v;
    }
  }
  return null;
}

function scanAll() {
  let best = null;

  const labels = Array.from(document.querySelectorAll("label, span, div, td, th"));
  for (const el of labels) {
    const v = pickImponibileFromNode(el);
    if (v) { best = v; break; }
  }

  if (!best) {
    const allText = document.body.innerText || "";
    const matches = allText.match(NUM_RE) || [];
    const candidates = matches.map(parseIt).filter(n => n && n > 0);
    if (candidates.length) {
      const filtered = candidates.filter(n => n > 10);
      best = (filtered.length ? Math.max(...filtered) : Math.max(...candidates));
    }
  }

  if (best) {
    chrome.runtime.sendMessage({ type: "IMPO_UPDATE", imponibile: best });
  }
}

const observer = new MutationObserver(() => {
  clearTimeout(window.__provvcalc_t);
  window.__provvcalc_t = setTimeout(scanAll, 300);
});

observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
scanAll();
window.__provvcalc_scan = scanAll;
