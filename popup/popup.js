console.log("[DEBUG] Popup Loaded. Manifest Icons:", JSON.stringify(chrome.runtime.getManifest().icons));

document.getElementById('start-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('auth/auth.html') });
});
