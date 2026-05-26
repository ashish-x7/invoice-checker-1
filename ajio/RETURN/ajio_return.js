document.addEventListener('DOMContentLoaded', () => {
    if (window.displayUserNickname) window.displayUserNickname('userBadgeHost');
    const pdfInput = document.getElementById('pdf-input');
    const imageInput = document.getElementById('image-input');
    const pdfStatus = document.getElementById('pdfStatus');
    const imageStatus = document.getElementById('imageStatus');
    const verifyBtn = document.getElementById('verify-btn');
    const resetBtn = document.getElementById('reset-btn');
    
    // Custom trigger text elements
    const pdfTriggerText = document.getElementById('pdf-trigger-text');
    const imageTriggerText = document.getElementById('image-trigger-text');

    // CSP Compliant Click Handlers
    const pdfTriggerBox = document.getElementById('pdf-trigger-box');
    const imageTriggerBox = document.getElementById('image-trigger-box');
    if (pdfTriggerBox) pdfTriggerBox.addEventListener('click', () => pdfInput.click());
    if (imageTriggerBox) imageTriggerBox.addEventListener('click', () => imageInput.click());

    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const displayLabel = e.target.files[0].name.substring(0, 20) + (e.target.files[0].name.length > 20 ? "..." : "");
            pdfStatus.innerText = "✓ " + displayLabel;
            pdfStatus.style.background = "rgba(16, 185, 129, 0.1)";
            pdfStatus.style.color = "#10b981";
            if (pdfTriggerText) pdfTriggerText.innerText = displayLabel;
            checkReady();
        }
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const displayLabel = e.target.files[0].name.substring(0, 20) + (e.target.files[0].name.length > 20 ? "..." : "");
            imageStatus.innerText = "✓ " + displayLabel;
            imageStatus.style.background = "rgba(59, 130, 246, 0.1)";
            imageStatus.style.color = "#3b82f6";
            if (imageTriggerText) imageTriggerText.innerText = displayLabel;
            checkReady();
        }
    });

    function checkReady() {
        verifyBtn.disabled = !(pdfInput.files.length > 0 && imageInput.files.length > 0);
    }

    verifyBtn.onclick = () => {
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('results-section').classList.remove('hidden');
        document.getElementById('status-badge').innerText = "Analyzing Ajio Data...";
    };

    if (resetBtn) {
        resetBtn.onclick = () => {
            pdfInput.value = "";
            imageInput.value = "";
            pdfStatus.innerText = "Pending";
            pdfStatus.style.background = "";
            pdfStatus.style.color = "";
            imageStatus.innerText = "Pending";
            imageStatus.style.background = "";
            imageStatus.style.color = "";
            if (pdfTriggerText) pdfTriggerText.innerText = "UPLOAD INVOICE PDF";
            if (imageTriggerText) imageTriggerText.innerText = "UPLOAD PORTAL IMAGE";
            verifyBtn.disabled = true;
            document.getElementById('upload-section').classList.remove('hidden');
            document.getElementById('results-section').classList.add('hidden');
        };
    }
});
