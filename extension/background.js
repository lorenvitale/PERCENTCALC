let lastImponibile = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "IMPO_UPDATE") {
    lastImponibile = msg.imponibile;
    chrome.runtime.sendMessage({ type: "IMPO_BROADCAST", imponibile: lastImponibile });
    sendResponse({ ok: true });
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "provvcalc-panel" && lastImponibile != null) {
    port.postMessage({ type: "IMPO_BROADCAST", imponibile: lastImponibile });
  }
});
