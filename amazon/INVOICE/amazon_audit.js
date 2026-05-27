console.log("Amazon: amazon_audit.js loaded.");
// --- AUDIT MODULE ---
// This module will handle matching Portal data against Purchase and Sale data.
// It will utilize the MATCH KEY (Column V) to find discrepancies.

function closeSaleDetails() {
    const modal = document.getElementById('saleDetailsModal');
    if (modal) modal.style.display = 'none';
}

function closeInvoiceDetails() {
    console.log("Amazon: Closing Invoice Details Modal...");
    const modal = document.getElementById('invoiceDetailsModal');
    if (modal) modal.style.display = 'none';
}

function openVendorDetails() {
    if (hasPortalErrors(25)) { // Column Z for Vendor Central
        showPortalErrorWarning('Z');
        return;
    }
    if (!globalVendorMetadata) {
        window.showCustomAlert("Please process Vendor Central data first!", "Data Missing");
        return;
    }
    
    // Populate header details
    document.getElementById('v-det-seller').textContent = globalVendorMetadata.seller;
    document.getElementById('v-det-gstin').textContent = globalVendorMetadata.gstin;
    document.getElementById('v-det-inv-date').textContent = globalVendorMetadata.date;
    document.getElementById('v-det-inv-no').textContent = globalVendorMetadata.invNo;

    // Helper to set text and status
    const setVal = (idPrefix, pVal, vVal) => {
        const pEl = document.getElementById(`v-det-portal-${idPrefix}`);
        const vEl = document.getElementById(`v-det-vc-${idPrefix}`);
        const sEl = document.getElementById(`v-det-stat-${idPrefix}`);
        
        const pNum = parseFloat(pVal || 0);
        const vNum = parseFloat(vVal || 0);
        
        pEl.textContent = pNum.toLocaleString(undefined, {minimumFractionDigits: 2});
        vEl.textContent = vNum.toLocaleString(undefined, {minimumFractionDigits: 2});
        
        const match = isNear(pNum, vNum);
        sEl.textContent = match ? "TRUE ✓" : "FALSE ✗";
        sEl.className = `id-status-badge ${match ? 'badge-true' : 'badge-false'}`;
    };

    // Populate comparisons
    setVal('net', portalSumNet, globalVendorMetadata.net);
    setVal('qty', portalSumQty, globalVendorMetadata.qty);
    setVal('cgst', portalSumCgst, globalVendorMetadata.cgst);
    setVal('sgst', portalSumSgst, globalVendorMetadata.sgst);
    setVal('grand', portalSumGrand, globalVendorMetadata.exact);

    document.getElementById('vendorDetailsModal').style.display = 'flex';
}

function closeVendorDetails() {
    const modal = document.getElementById('vendorDetailsModal');
    if (modal) modal.style.display = 'none';
}

// --- EXPORT ENGINE ---
async function handleInvoicePdfAction(saveToStore, config = {}) {
    // Default to Sale modal IDs for backward compatibility if config is empty
    const inputId = config.inputId || 'pdfLinkInput';
    const invNoId = config.invNoId || 's-det-inv-no';
    const feedbackId = config.feedbackId || 'pdfStatus';
    const sellerRawId = config.sellerRawId || 's-det-seller-code';

    const rawUrl = document.getElementById(inputId).value.trim();
    if (!rawUrl) return window.showCustomAlert("Please paste a PDF link first!", "Link Missing");

    const invNo = document.getElementById(invNoId).textContent.trim();
    const sellerRaw = document.getElementById(sellerRawId).textContent.trim(); 
    
    // 1. Try to get FULL LEGAL NAME from Global Metadata (Prioritize Purchase, then Portal)
    let seller = "";
    if (globalPurchaseMetadata && globalPurchaseMetadata.seller && globalPurchaseMetadata.seller !== "-" && !globalPurchaseMetadata.seller.toLowerCase().includes("multiple sellers")) {
        seller = globalPurchaseMetadata.seller;
    } else if (globalPortalMetadata && globalPortalMetadata.seller && globalPortalMetadata.seller !== "-" && !globalPortalMetadata.seller.toLowerCase().includes("multiple sellers")) {
        seller = globalPortalMetadata.seller;
    } else if (globalSaleMetadata && globalSaleMetadata.seller && globalSaleMetadata.seller !== "-" && !globalSaleMetadata.seller.toLowerCase().includes("multiple sellers")) {
        seller = globalSaleMetadata.seller;
    }

    // 2. Fallback to DOM elements if globals are somehow empty
    if (!seller || seller === "-") {
        const pFull = document.getElementById('p-seller')?.textContent?.trim();
        const portFull = document.getElementById('port-seller')?.textContent?.trim();
        const sFull = document.getElementById('s-seller')?.textContent?.trim();
        if (pFull && pFull !== "-" && !pFull.toLowerCase().includes("multiple sellers")) seller = pFull;
        else if (portFull && portFull !== "-" && !portFull.toLowerCase().includes("multiple sellers")) seller = portFull;
        else if (sFull && sFull !== "-" && !sFull.toLowerCase().includes("multiple sellers")) seller = sFull;
    }

    // 3. Last Fallback: Extraction from seller code or defaults
    if (!seller || seller === "-") {
        if (sellerRaw && sellerRaw !== "-") {
            const parts = sellerRaw.split('-').map(p => p.trim());
            seller = parts.length > 1 ? parts[1] : parts[0];
        }
    }
    
    if (!seller || seller === "-") seller = "Document";
    
    const descriptiveName = `${invNo} ${seller}`.replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `${descriptiveName}.pdf`;

    console.log(`Final Filename Attempt: ${fileName}`);

    // 1. Save to Storage
    if (saveToStore && window.savePdfLink) {
        await window.savePdfLink(descriptiveName, rawUrl);
    }

    // Always show "DONE ✅" feedback if the export was triggered
    const statusEl = document.getElementById(feedbackId);
    if (statusEl) {
        statusEl.textContent = "DONE ✅";
        statusEl.style.opacity = '1';
        setTimeout(() => { statusEl.style.opacity = '0'; }, 3000);
    }

    // 2. Reliable Download Logic (Blob Fetch + Link Rename)
    try {
        console.log(`Fetching PDF for renaming: ${fileName}`);
        const response = await fetch(rawUrl);
        if (!response.ok) throw new Error("CORS Fetch failed");
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        // Use the most reliable renaming method for Blobs
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        }, 100);
        
        console.log("Download Success with correct name.");
    } catch (e) {
        console.warn("Direct blob download failed, trying native extension download as fallback:", e);
        if (typeof chrome !== 'undefined' && chrome.downloads) {
            chrome.downloads.download({
                url: rawUrl,
                filename: fileName,
                conflictAction: "uniquify"
            });
        } else {
            fallbackDownloadWithProxy(rawUrl, fileName);
        }
    }
}

async function fallbackDownloadWithProxy(rawUrl, fileName) {
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`
    ];

    let downloaded = false;
    for (const proxyUrl of proxies) {
        if (downloaded) break;
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            downloaded = true;
        } catch (e) { }
    }

    if (!downloaded) {
        const link = document.createElement('a');
        link.href = rawUrl;
        link.setAttribute('download', fileName);
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function exportVCDataToCSV() {
    console.log("VC Export Triggered...");
    if (!globalPortalData || globalPortalData.length < 3) return window.showCustomAlert("Upload and Process Portal data first!", "Data Missing");
    if (!globalVendorData || globalVendorData.length <= 1) return window.showCustomAlert("Upload and Process Vendor data first!", "Data Missing");

    // VBA Logic: Check AW3 (48) and BC3 (54)
    const checkError = (colIdx, colName) => {
        // Use row index 2 for Row 3 in Excel
        const rowData = globalPortalData[2];
        const val = renderCustomCell(null, colIdx, rowData, 'portal', 2);
        
        // Check for #N/A or FALSE in the rendered output (can be inside badge HTML)
        const text = String(val).toUpperCase();
        if (text.includes("#N/A") || (text.includes("FALSE") && !text.includes("TRUE"))) {
             window.showCustomAlert(`${colName}3 cell contains #N/A or FALSE. Export aborted.`, "Export Error");
             return true;
        }
        return false;
    };

    if (checkError(48, 'AW') || checkError(54, 'BC')) return;

    // Build CSV Content
    let csvData = [];
    csvData.push(["Sale Order Details"]); // Excel Row 1
    
    // First 18 columns (A-R)
    for (let i = 0; i < globalVendorData.length; i++) {
        let row = [...globalVendorData[i]]; // clone
        
        // VBA Requirement: Set Column R (Index 17) to 0 for DATA rows
        // Excel Row 1 = Title, Row 2 = Header, Row 3+ = Data
        // In this loop: i=0 is header, i>0 is data
        if (i > 0) {
            row[17] = 0;
        }

        const slice = row.slice(0, 18).map(cell => {
            let val = String(cell === undefined || cell === null ? "" : cell).replace(/"/g, '""');
            return `"${val}"`;
        });
        csvData.push(slice);
    }

    const csvContent = csvData.map(r => r.join(",")).join("\n");

    // Trigger Download
    const fileName = `${globalVendorMetadata.invNo || 'Unknown'}-VC.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Inline Feedback (No Alert)
        const statusEl = document.getElementById('vcExportStatus');
        if (statusEl) {
            statusEl.style.opacity = '1';
            setTimeout(() => { statusEl.style.opacity = '0'; }, 3000);
        }
    }
}

// --- INITIALIZATION ---
function initAmazonAudit() {
    console.log("Amazon: Initializing Audit Listeners...");
    // Audit Open Buttons
    const invBtn = document.getElementById('invoiceDetailsBtnHeader');
    if (invBtn) {
        console.log("Amazon: Attached click to invoiceDetailsBtnHeader");
        invBtn.addEventListener('click', openInvoiceDetails);
    }

    const saleBtn = document.getElementById('saleDetailsBtnHeader');
    if (saleBtn) {
        console.log("Amazon: Attached click to saleDetailsBtnHeader");
        saleBtn.addEventListener('click', openSaleDetails);
    }

    const vcBtn = document.getElementById('vendorDetailsBtnHeader');
    if (vcBtn) vcBtn.addEventListener('click', openVendorDetails);
    // Modal Close Buttons
    const closeInv = document.getElementById('closeIdBtn');
    if (closeInv) closeInv.addEventListener('click', closeInvoiceDetails);

    const closeSale = document.getElementById('closeSaleIdBtn');
    if (closeSale) closeSale.addEventListener('click', closeSaleDetails);

    const closeVc = document.getElementById('closeVcIdBtn');
    if (closeVc) closeVc.addEventListener('click', closeVendorDetails);

    const exportBtn = document.getElementById('exportVcBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportVCDataToCSV);

    const closeWarn = document.getElementById('closeWarningBtn');
    if (closeWarn) closeWarn.addEventListener('click', closeWarningModal);

    // PDF Handlers (Sale Modal)
    const pdfExp = document.getElementById('pdfExportBtn');
    if (pdfExp) pdfExp.addEventListener('click', () => handleInvoicePdfAction(false, {
        inputId: 'pdfLinkInput',
        invNoId: 's-det-inv-no',
        feedbackId: 'pdfStatus',
        sellerRawId: 's-det-seller-code'
    }));

    const pdfSave = document.getElementById('pdfSaveExportBtn');
    if (pdfSave) pdfSave.addEventListener('click', () => handleInvoicePdfAction(true, {
        inputId: 'pdfLinkInput',
        invNoId: 's-det-inv-no',
        feedbackId: 'pdfStatus',
        sellerRawId: 's-det-seller-code'
    }));

    // PDF Handlers (Purchase Modal)
    const purPdfSave = document.getElementById('purPdfSaveExportBtn');
    if (purPdfSave) purPdfSave.addEventListener('click', () => handleInvoicePdfAction(true, {
        inputId: 'purPdfLinkInput',
        invNoId: 'id-inv-no',
        feedbackId: 'purPdfStatus',
        sellerRawId: 'id-seller-code'
    }));

    const purPdfExp = document.getElementById('purPdfExportBtn');
    if (purPdfExp) purPdfExp.addEventListener('click', () => handleInvoicePdfAction(false, {
        inputId: 'purPdfLinkInput',
        invNoId: 'id-inv-no',
        feedbackId: 'purPdfStatus',
        sellerRawId: 'id-seller-code'
    }));

    console.log("Amazon: All Listeners Initialized.");
}
