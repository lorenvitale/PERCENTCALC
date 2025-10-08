let lastImponibile = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "IMPO_UPDATE") {
    lastImponibile = msg.imponibile;
    chrome.runtime.sendMessage({ type: "IMPO_BROADCAST", imponibile: lastImponibile });
    sendResponse?.({ ok: true });
  }
  if (msg?.type === "IMPO_DEBUG") {
    // utile se vuoi mostrare info nel side panel
    chrome.runtime.sendMessage({ type: "IMPO_DEBUG", ...msg });
  }
});
