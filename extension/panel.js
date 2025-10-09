// === ProvvCalc panel.js ===
const frame = document.getElementById("app");
const dbg = document.getElementById("dbg");

chrome.runtime.onMessage.addListener((msg) => {
  try {
    if (msg?.type === "IMPO_BROADCAST" && frame?.contentWindow) {
      frame.contentWindow.postMessage({ type: "IMPO_BROADCAST", imponibile: msg.imponibile }, "*");
      dbg.textContent = `Imponibile: ${msg.imponibile}  •  Label: ${msg.label || "—"}`;
    }
    if (msg?.type === "IMPO_DEBUG") {
      dbg.textContent = `Scan: ${msg.imponibile ?? "—"}  •  Label: ${msg.label || "—"}  •  nodi: ${msg.nodes ?? "?"}`;
    }
  } catch (e) {
    console.debug("[ProvvCalc:panel] onMessage error:", e?.message);
  }
});

async function findSferaTab() {
  const tabs = await chrome.tabs.query({ url: ["https://*.zurich.it/*"] });
  const active = tabs.find(t => t.active) || tabs[0];
  return active?.id ? active.id : null;
}

async function ensureInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (e) {
    console.debug("[ProvvCalc:panel] inject:", e?.message);
  }
}

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

(async () => {
  const tabId = await findSferaTab();
  if (tabId) {
    await ensureInjected(tabId);
    try { await chrome.tabs.sendMessage(tabId, { type: "RESCAN_IMPO" }); } catch {}
  }
})();
