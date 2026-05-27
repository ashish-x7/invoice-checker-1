// Content script to bridge webpage and extension background script for downloads
console.log("[Extension Content Script] Active on page.");

// Tell the webpage that the extension is active
const script = document.createElement('script');
script.textContent = 'window.hasInvoiceCheckerExtension = true;';
(document.head || document.documentElement).appendChild(script);
script.remove();

// Listen for download messages from the webpage
window.addEventListener("message", (event) => {
    // Only trust messages from our own window
    if (event.source !== window) return;

    if (event.data && event.data.type === "DOWNLOAD_PDF_VIA_EXTENSION") {
        console.log("[Extension Content Script] Forwarding download request to background service worker:", event.data);
        chrome.runtime.sendMessage({
            action: "downloadPdf",
            url: event.data.url,
            filename: event.data.filename
        });
    }
});
