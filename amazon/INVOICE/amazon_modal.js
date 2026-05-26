console.log("Amazon: amazon_modal.js loaded.");

function openInvoiceDetails() {
    try {
        console.log("Amazon: Starting openInvoiceDetails...");
        if (hasPortalErrors(27)) { // Column AB for Purchase
            console.warn("Amazon: Portal errors found in Column AB");
            showPortalErrorWarning('AB');
            return;
        }
        if (!globalPurchaseMetadata) {
            console.warn("Amazon: globalPurchaseMetadata is missing");
            return window.showCustomAlert("Please process Purchase data first!", "Data Missing");
        }
        
        console.log("Amazon: Extracting purchase flags...");
        const getFlag = (idx) => (globalPortalData && globalPortalData[idx]) ? renderCustomCell(null, 56, globalPortalData[idx], 'portal', idx) : "FALSE";
        const isBe3 = getFlag(2) === "TRUE";
        const isBe4 = getFlag(3) === "TRUE";
        const isBe5 = getFlag(4) === "TRUE";

        const purQty = parseFloat(globalPurchaseMetadata.qty) || 0;
        const purNet = parseFloat(globalPurchaseMetadata.net) || 0;
        const purGrand = parseFloat(globalPurchaseMetadata.grand) || 0;
        const purWithTax = parseFloat(globalPurchaseMetadata.withTax) || 0;
        const purTds = parseFloat(globalPurchaseMetadata.tds) || 0;

        console.log("Amazon: Populating purchase header...");
        document.getElementById('id-seller-code').textContent = globalPurchaseMetadata.sellerCode || "-";
        document.getElementById('id-inv-no').textContent = globalPurchaseMetadata.invNo || "-";
        document.getElementById('id-inv-date').textContent = globalPurchaseMetadata.date || "-";

        const fmt = (n) => "₹ " + (parseFloat(n)||0).toLocaleString(undefined, {minimumFractionDigits: 2});
        
        console.log("Amazon: Calculating purchase values...");
        document.getElementById('id-amt-net').textContent = fmt(purNet);
        setAmazonStatus('id-stat-net', null, true);

        document.getElementById('id-amt-qty').textContent = purQty;
        const qtyIsMatch = Math.abs(purQty - portalSumQty) < 0.01;
        setAmazonStatus('id-stat-qty', qtyIsMatch, false);

        document.getElementById('id-amt-cgst').textContent = fmt(globalPurchaseMetadata.cgst);
        setAmazonStatus('id-stat-cgst', null, true);
        document.getElementById('id-amt-sgst').textContent = fmt(globalPurchaseMetadata.sgst);
        setAmazonStatus('id-stat-sgst', null, true);

        document.getElementById('id-amt-tds').textContent = fmt(purTds);
        const roundOff = (purWithTax - (purGrand - purTds)).toFixed(2);
        document.getElementById('id-amt-round').textContent = "₹ " + roundOff;

        document.getElementById('id-amt-grand').textContent = "₹ " + purWithTax.toLocaleString(undefined, {minimumFractionDigits: 0});
        setAmazonStatus('id-stat-diff-grand', null, true);

        const pricePerQtyPortal = portalSumQty > 0 ? (portalSumNet / portalSumQty) : 0;
        const pricePerQtyPur = purQty > 0 ? (purNet / purQty) : 0;
        const priceDiff = pricePerQtyPortal - pricePerQtyPur;

        document.getElementById('id-diff-val-price-qty').textContent = priceDiff.toFixed(2);
        const diffNet = portalSumNet - purNet;
        const diffGrand = portalSumGrand - purWithTax;
        
        document.getElementById('id-diff-val-net').textContent = diffNet.toFixed(2);
        document.getElementById('id-diff-val-grand').textContent = diffGrand.toFixed(2);
        
        setAmazonStatus('id-stat-price-qty', priceDiff >= 0);
        setAmazonStatus('id-stat-diff-net', diffNet >= 0);
        setAmazonStatus('id-stat-diff-grand-actual', diffGrand >= 0);

        console.log("Amazon: Finalizing Purchase Modal Display...");
        document.getElementById('invoiceDetailsModal').style.display = 'flex';
    } catch (err) {
        console.error("CRITICAL ERROR in openInvoiceDetails:", err);
        window.showCustomAlert("Error opening Invoice Details: " + err.message, "System Error");
    }
}

function closeWarningModal() {
    const modal = document.getElementById('warningModal');
    if (modal) modal.style.display = 'none';
}

function setAmazonStatus(id, bool, forceOk = false) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`SetStatus: Element #${id} not found.`);
        return;
    }
    if (forceOk) {
        el.className = 'id-status-badge badge-pending';
        el.textContent = 'OK';
        return;
    }
    el.className = 'id-status-badge ' + (bool ? 'badge-true' : 'badge-false');
    el.textContent = bool ? 'TRUE ✓' : 'FALSE ✕';
}

// --- SHARED DATA & STATE ---

function openSaleDetails() {
    try {
        console.log("Amazon: Starting openSaleDetails...");
        if (hasPortalErrors(23)) { // Column X for Sale
            console.warn("Amazon: Portal errors found in Column X");
            showPortalErrorWarning('X');
            return;
        }
        if (!globalSaleMetadata) {
            console.warn("Amazon: globalSaleMetadata is missing");
            return window.showCustomAlert("Please process Sale data first!", "Data Missing");
        }

        console.log("Amazon: Calculating sale taxes...");
        const saleQty = parseFloat(globalSaleMetadata.qty) || 0;
        const saleNet = parseFloat(globalSaleMetadata.net) || 0;
        const saleGrand = parseFloat(globalSaleMetadata.grand) || 0;

        let totalSaleCgst = 0; let totalSaleSgst = 0;
        if (globalSaleData && globalSaleData.length > 1) {
            for (let i = 1; i < globalSaleData.length; i++) {
                totalSaleCgst += parseFloat(renderCustomCell(null, 19, globalSaleData[i], 'sale', i)) || 0;
                totalSaleSgst += parseFloat(renderCustomCell(null, 20, globalSaleData[i], 'sale', i)) || 0;
            }
        }

        const fmt = (n) => "₹ " + (parseFloat(n)||0).toLocaleString(undefined, {minimumFractionDigits: 2});

        console.log("Amazon: Populating sale header...");
        document.getElementById('s-det-seller-code').textContent = globalPurchaseMetadata ? globalPurchaseMetadata.sellerCode : "-";
        document.getElementById('s-det-inv-no').textContent = globalSaleMetadata.invNo || "-";
        document.getElementById('s-det-inv-id').textContent = globalSaleMetadata.invId || "-";
        document.getElementById('s-det-inv-date').textContent = globalSaleMetadata.date || "-";

        console.log("Amazon: Comparing sale components...");
        // 1. Without Tax
        document.getElementById('s-det-portal-net').textContent = fmt(portalSumNet);
        document.getElementById('s-det-sale-net').textContent = fmt(saleNet);
        setAmazonStatus('s-det-stat-net', isNear(portalSumNet, saleNet));

        // 2. Quantity
        document.getElementById('s-det-portal-qty').textContent = portalSumQty;
        document.getElementById('s-det-sale-qty').textContent = saleQty;
        setAmazonStatus('s-det-stat-qty', isNear(portalSumQty, saleQty));

        // 3. CGST
        document.getElementById('s-det-portal-cgst').textContent = fmt(portalSumCgst);
        document.getElementById('s-det-sale-cgst').textContent = fmt(totalSaleCgst);
        setAmazonStatus('s-det-stat-cgst', isNear(portalSumCgst, totalSaleCgst));

        // 4. SGST
        document.getElementById('s-det-portal-sgst').textContent = fmt(portalSumSgst);
        document.getElementById('s-det-sale-sgst').textContent = fmt(totalSaleSgst);
        setAmazonStatus('s-det-stat-sgst', isNear(portalSumSgst, totalSaleSgst));
        
        // 5. Round Off
        console.log("Amazon: Calculating round off...");
        const portalRound = portalSumGrand - Math.round(portalSumGrand);
        const saleGrandExact = saleNet + totalSaleCgst + totalSaleSgst;
        const saleRound = saleGrand - saleGrandExact;
        document.getElementById('s-det-portal-round').textContent = fmt(portalRound);
        document.getElementById('s-det-sale-round').textContent = fmt(saleRound);
        setAmazonStatus('s-det-stat-round', null, true);

        // 6. Total With Tax (Net Grand)
        const portalWithTax = Math.round(portalSumGrand);
        document.getElementById('s-det-portal-grand').textContent = fmt(portalWithTax);
        document.getElementById('s-det-sale-grand').textContent = fmt(saleGrand);
        setAmazonStatus('s-det-stat-grand', isNear(portalWithTax, saleGrand));

        const diffNote = document.getElementById('s-det-diff-note');
        if (diffNote) {
            const absDiff = Math.abs(portalWithTax - saleGrand);
            if (absDiff > 0 && absDiff <= 1) {
                diffNote.textContent = "DIFFRENCE IS UNDER 1 RUPEES,YU CAN CONSIDER IN ACCOUNT";
                diffNote.style.display = 'block';
            } else {
                diffNote.style.display = 'none';
            }
        }

        console.log("Amazon: Finalizing Sale Modal Display...");
        document.getElementById('saleDetailsModal').style.display = 'flex';
    } catch (err) {
        console.error("CRITICAL ERROR in openSaleDetails:", err);
        window.showCustomAlert("Error opening Sale Details: " + err.message, "System Error");
    }
}

// Initialize Audit Listeners only after all functions are defined
console.log("Amazon: Checking if initAmazonAudit is available...");
if (typeof initAmazonAudit === 'function') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log("Amazon: DOMContentLoaded fired, calling init...");
            initAmazonAudit();
        });
    } else {
        console.log("Amazon: Document already ready, calling init...");
        initAmazonAudit();
    }
} else {
    console.error("Amazon: initAmazonAudit NOT FOUND!");
}
