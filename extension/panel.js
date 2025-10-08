// === ProvvCalc panel.js ===
const frame = document.getElementById("app");
const dbg = document.getElementById("dbg");

// Riceve messaggi dal background e li inoltra all'app dentro l'iframe (GitHub Pages)
chrome.runtime.onMessage.addListener((msg) => {
  try {
    if (msg?.type === "IMPO_BROADCAST" && frame?.contentWindow) {
      frame.contentWindow.postMessage({ type: "IMPO_BROADCAST", imponibile: msg.imponibile }, "*");
      dbg.textContent = `Imponibile: ${msg.imponibile}`;
    }
    if (msg?.type === "IMPO_DEBUG") {
      dbg.textContent = `Scan: ${msg.imponibile ?? "—"} | nodi: ${msg.nodes ?? "?"}`;
    }
  } catch (e) {
    console.debug("[ProvvCalc:panel] onMessage error:", e?.message);
  }
});

// Trova una scheda aperta sul dominio Zurich
async function findSferaTab() {
  const tabs = await chrome.tabs.query({ url: ["https://*.zurich.it/*"] });
  const active = tabs.find(t => t.active) || tabs[0];
  return active?.id ? active.id : null;
}

// Inietta content.js manualmente (se il declarative non è partito)
async function ensureInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (e) {
    // ignora errori se già iniettato
    console.debug("[ProvvCalc:panel] inject:", e?.message);
  }
}

// Rescan manuale
document.getElementById("rescan").addEventListener("click", async () => {
  const tabId = await findSferaTab();
  if (!tabId) { dbg.textContent = "Nessuna scheda Sfera trovata"; return; }
  await ensureInjected(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RESCAN_IMPO" });
    dbg.textContent = "Rescan inviato…";
  } catch (e) {
    dbg.textContent = "Reinietto e riprovo…";
    await ensureInjected(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "RESCAN_IMPO" });
  }
});

// All'apertura del pannello: inietta e prova subito una scansione
(async () => {
  const tabId = await findSferaTab();
  if (tabId) {
    await ensureInjected(tabId);
    try { await chrome.tabs.sendMessage(tabId, { type: "RESCAN_IMPO" }); } catch {}
  }
})();
