/**
 * AJ AI ASSISTANT - UI LOGIC
 */

document.addEventListener('DOMContentLoaded', () => {
    initAjChat();
});

function initAjChat() {
    // Prevent double initialization
    if (window.ajChatInitialized || document.querySelector('.aj-widget')) {
        console.warn("Aj Chatbot already initialized.");
        return;
    }
    window.ajChatInitialized = true;

    // Determine the base path of the project based on the script element's source
    let basePath = '../';
    const scriptEl = document.querySelector('script[src*="chatbot.js"]');
    if (scriptEl) {
        const src = scriptEl.getAttribute('src');
        const match = src.match(/^(.*)assets\/chatbot\.js/);
        if (match) {
            basePath = match[1];
        }
    }

    // Create Chatbot Structure
    const widget = document.createElement('div');
    widget.className = 'aj-widget';
    widget.innerHTML = `
        <div class="aj-window" id="ajWindow">
            <div class="aj-header">
                <div class="aj-header-info">
                    <div class="aj-avatar-mini">
                        <img src="${basePath}CHATBOT.png" id="ajHeaderImg" style="width: 25px; height: 25px; border-radius: 50%;">
                    </div>
                    <div class="aj-title-box">
                        <h3>Aj Assistant</h3>
                        <div class="aj-status">Online</div>
                    </div>
                </div>
                <button class="aj-close" id="ajClose" style="background:none; border:none; color:white; font-size:20px; cursor:pointer;">&times;</button>
            </div>
            <div class="aj-messages" id="ajMessages">
                <!-- Messages will appear here -->
            </div>
            <div class="aj-typing" id="ajTyping">
                <div class="aj-dot"></div>
                <div class="aj-dot"></div>
                <div class="aj-dot"></div>
            </div>
            <div class="aj-input-area">
                <input type="text" class="aj-input" id="ajInput" placeholder="Type a message...">
                <button class="aj-send-btn" id="ajSend">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
        <div class="aj-mascot" id="ajMascot">
            <div class="aj-bubble" id="ajBubble"></div>
            <div class="aj-badge">1</div>
            <img src="${basePath}CHATBOT.png" id="ajMascotImg" class="aj-mascot-img">
        </div>
    `;
    document.body.appendChild(widget);

    const mascot = document.getElementById('ajMascot');
    const windowEl = document.getElementById('ajWindow');
    const closeBtn = document.getElementById('ajClose');
    const input = document.getElementById('ajInput');
    const sendBtn = document.getElementById('ajSend');
    const msgArea = document.getElementById('ajMessages');
    const mascotImg = document.getElementById('ajMascotImg');
    const headerImg = document.getElementById('ajHeaderImg');
    const bubble = document.getElementById('ajBubble');

    // CSP Compliant Fallback
    const fallbackSrc = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';
    const setFallback = (img) => { if (img) img.src = fallbackSrc; };
    
    if (mascotImg) mascotImg.addEventListener('error', () => setFallback(mascotImg));
    if (headerImg) headerImg.addEventListener('error', () => setFallback(headerImg));

    let isFirstOpen = true;

    // Timeouts for greeting typewriter effect to avoid concurrent execution
    let typeTimeout = null;
    let greetingTimeout = null;
    let closeTimeout = null;

    // Toggle Chat
    mascot.onclick = () => {
        windowEl.classList.toggle('active');
        if (windowEl.classList.contains('active')) {
            mascot.querySelector('.aj-badge').style.display = 'none';
            // Clear any active typing greeting when chat window is opened
            bubble.classList.remove('active');
            bubble.textContent = "";
            if (typeTimeout) clearTimeout(typeTimeout);
            if (greetingTimeout) clearTimeout(greetingTimeout);
            if (closeTimeout) clearTimeout(closeTimeout);

            if (isFirstOpen) {
                sendWelcomeMessage();
                isFirstOpen = false;
            }
            setTimeout(() => input.focus(), 300);
        }
    };

    closeBtn.onclick = (e) => {
        e.stopPropagation();
        windowEl.classList.remove('active');
    };

    // Auto-wave interval
    setInterval(() => {
        const img = document.getElementById('ajMascotImg');
        if (img) {
            img.classList.add('aj-mascot-img-wave');
            setTimeout(() => img.classList.remove('aj-mascot-img-wave'), 2000);
        }
    }, 8000);

    // Dynamic Greeting Bubble Logic
    let greetingIndex = 0;
    
    const typeEffect = (text, i = 0, callback) => {
        if (!bubble.classList.contains('active')) return;
        if (i < text.length) {
            bubble.textContent += text.charAt(i);
            typeTimeout = setTimeout(() => typeEffect(text, i + 1, callback), 60);
        } else if (callback) {
            callback();
        }
    };

    const showGreeting = () => {
        if (windowEl.classList.contains('active')) return; // Don't show bubble if chat is open
        
        // Clear any previous typing session
        if (typeTimeout) clearTimeout(typeTimeout);
        if (greetingTimeout) clearTimeout(greetingTimeout);
        if (closeTimeout) clearTimeout(closeTimeout);

        const context = getCurrentContext();
        const nickname = localStorage.getItem('nickname') || 'User';
        const msgs = getContextMessages(context, nickname);
        
        // Cycle through the greetings array for Option A style (outside chatbot)
        const text = msgs.greetings[greetingIndex % msgs.greetings.length];
        greetingIndex++;
        
        bubble.textContent = "";
        bubble.classList.add('active');
        
        // Type effect with a callback to schedule the closing of the bubble
        greetingTimeout = setTimeout(() => {
            typeEffect(text, 0, () => {
                closeTimeout = setTimeout(() => {
                    bubble.classList.remove('active');
                }, 4000); // Stay open for 4 seconds after typing ends
            });
        }, 400);
    };

    // Initial delay and loop
    setTimeout(showGreeting, 3000);
    setInterval(showGreeting, 18000);

    // Send Logic
    const handleSend = async () => {
        const text = input.value.trim();
        if (!text) return;

        // Remove suggestion chips when a message is sent
        const existing = document.querySelector('.aj-chips-container');
        if (existing) existing.remove();

        addMessage(text, 'user');
        input.value = '';
        
        showTyping(true);
        
        try {
            const response = await callGemini(text);
            showTyping(false);
            addMessage(response, 'bot');
        } catch (e) {
            showTyping(false);
            addMessage("I'm having a bit of trouble connecting right now. Try again in a moment! 🤖", 'bot');
            console.error("Aj Chat Error:", e);
        }
    };

    sendBtn.onclick = handleSend;
    input.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };
}

async function callGemini(userMessage) {
    const API_KEY = "AIzaSyDbx0H-vGeQiGNbI6G8DdRJK56qS-ed4jw";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${API_KEY}`;

    // Get Session Context
    let session = null;
    try { session = JSON.parse(localStorage.getItem('session')); } catch(e){}
    const nickname = localStorage.getItem('nickname') || (session && session.nickName) || 'User';
    const access = session ? session.access : {};
    const role = (session && session.role) || 'USER';

    const context = getCurrentContext();
    const contextDescriptions = {
        main_dashboard: "Main Dashboard / Analytics Hub (showing global platform comparisons, vendor performance, user metrics)",
        ajio_invoice: "Ajio Invoice Dashboard (for uploading Portal, Sale, and Purchase files to check duplicates and dispute rates)",
        ajio_return: "Ajio Return Dashboard (for uploading customer return sheets to check return discrepancies and claims)",
        amazon_invoice: "Amazon Invoice Dashboard (for uploading Portal, Vendor, Sale, and Purchase files to audit inventory records)",
        amazon_return: "Amazon Return Dashboard (for uploading customer returns and claims sheets)",
        myntra_invoice: "Myntra Invoice Dashboard (for uploading Portal, Sale, and Purchase files to check duplicates and dispute rates)",
        myntra_return: "Myntra Return Dashboard (for uploading customer return reports to verify discrepancies)",
        data_upload: "Data Upload Queue & History Modal (where user can see spreadsheet logs under 'File Upload' or Google Sheet sync logs under 'Google Sheet Upload')",
        generic: "Generic Page"
    };
    const currentView = contextDescriptions[context] || "Unknown Page";

    const systemPrompt = `
    You are "Aj", a smart and friendly AI assistant for the "Brand Central / Invoice Checker" dashboard.
    Your personality: Fun, helpful, and premium. Use friendly greetings like "Heyy!" and occasional phrases like "Heyy Kati" or similar friendly tones.
    
    Current User Context:
    - Name: ${nickname}
    - Role: ${role}
    - Access: ${JSON.stringify(access)} (OK means they have access, NO means they don't).
    - Current Active Screen/View: ${currentView}
    
    Dashboard Knowledge:
    1. Amazon: Used for checking Amazon invoices and returns.
    2. Ajio: Used for Ajio invoice verification.
    3. Myntra: Used for Myntra invoice checking.
    4. Analytics Hub: Shows global trends, platform comparisons, and user performance.
    5. Vendor Dashboard: Tracks vendor activity, repeat pushes, and inactivity alerts.
    
    Rules:
    - If a user asks why they can't access a platform, check the Access object provided above. If it's "NO", tell them politely that they don't have access and should contact the Admin.
    - If they ask how to go somewhere, explain which sidebar button to click.
    - Keep responses concise and formatted for a small chat window.
    - If they ask something unrelated to the dashboard, try to bring it back to how you can help them here.
    `;

    const payload = {
        contents: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "Understood! I am Aj, ready to help. I will use the user context and dashboard knowledge provided." }] },
            { role: "user", parts: [{ text: userMessage }] }
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 250 }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    let botText = data.candidates[0].content.parts[0].text;
    
    // Decrement local AI Quota if available
    if (window.decrementAiQuota) window.decrementAiQuota();
    
    return botText;
}

function addMessage(text, side) {
    const area = document.getElementById('ajMessages');
    const msg = document.createElement('div');
    msg.className = `aj-msg ${side}`;
    msg.textContent = text;
    area.appendChild(msg);
    area.scrollTop = area.scrollHeight;
}

function showTyping(show) {
    document.getElementById('ajTyping').style.display = show ? 'flex' : 'none';
    const area = document.getElementById('ajMessages');
    area.scrollTop = area.scrollHeight;
}

function sendWelcomeMessage() {
    const context = getCurrentContext();
    const nickname = localStorage.getItem('nickname') || 'User';
    const msgs = getContextMessages(context, nickname);
    
    // Display the default welcome message (Option C style: default welcome + suggestion chips below it)
    addMessage(msgs.welcome, 'bot');
    
    // Wait a brief moment to show the suggestion chips nicely
    setTimeout(() => {
        renderSuggestionChips(msgs.chips);
    }, 600);
}

function renderSuggestionChips(chips) {
    // Remove existing chips container if any exists
    const existing = document.querySelector('.aj-chips-container');
    if (existing) existing.remove();
    
    const msgArea = document.getElementById('ajMessages');
    const container = document.createElement('div');
    container.className = 'aj-chips-container';
    
    chips.forEach(chipText => {
        const chip = document.createElement('button');
        chip.className = 'aj-chip';
        chip.textContent = chipText;
        chip.onclick = () => {
            container.remove(); // Remove chips after selection
            const input = document.getElementById('ajInput');
            if (input) {
                input.value = chipText;
                const sendBtn = document.getElementById('ajSend');
                if (sendBtn) sendBtn.click();
            }
        };
        container.appendChild(chip);
    });
    
    msgArea.appendChild(container);
    msgArea.scrollTop = msgArea.scrollHeight;
}

function getCurrentContext() {
    // 1. Check if Data Upload modal is open and visible
    const uploadModal = document.getElementById('dataUploadModal');
    if (uploadModal && uploadModal.style.display === 'flex') {
        return 'data_upload';
    }
    
    // 2. Check window location path
    const path = window.location.pathname;
    if (path.includes('/auth/auth.html')) {
        return 'main_dashboard';
    } else if (path.includes('/ajio/INVOICE/')) {
        return 'ajio_invoice';
    } else if (path.includes('/ajio/RETURN/')) {
        return 'ajio_return';
    } else if (path.includes('/amazon/INVOICE/')) {
        return 'amazon_invoice';
    } else if (path.includes('/amazon/RETURN/')) {
        return 'amazon_return';
    } else if (path.includes('/myntra/INVOICE/')) {
        return 'myntra_invoice';
    } else if (path.includes('/myntra/RETURN/')) {
        return 'myntra_return';
    }
    
    return 'generic';
}

function getContextMessages(context, nickname) {
    const defaultWelcome = `Heyy ${nickname}! 👋 I'm Aj, your smart assistant.`;
    
    const messages = {
        main_dashboard: {
            welcome: defaultWelcome,
            chips: [
                "What is Brand Central?",
                "How to analyze platform performance?",
                "Where is the Vendor Leaderboard?",
                "Compare sales trends",
                "How to navigate to brand dashboards?"
            ],
            greetings: [
                "Hii, I'm Aj, your friend! 👋",
                "Let's check your platform analytics! 📊",
                "Analyze sales performance trends 📈",
                "Check top-performing vendors 👑",
                "Compare data across sales channels!"
            ]
        },
        ajio_invoice: {
            welcome: defaultWelcome,
            chips: [
                "How to upload Portal file?",
                "Check dispute amount details",
                "Reconcile Sale and Purchase sheets",
                "Find duplicate invoice entries",
                "How to download reconciled Excel?"
            ],
            greetings: [
                "Need help reconciling Ajio invoices? 🧾",
                "Upload Portal, Sale, and Purchase files! 📁",
                "Verify billing dispute amounts instantly",
                "Find duplicates and mismatches",
                "Download reconciled reports in Excel!"
            ]
        },
        ajio_return: {
            welcome: defaultWelcome,
            chips: [
                "How to reconcile Ajio returns?",
                "Reconcile customer return files",
                "Check dispute rate alerts",
                "Find transaction discrepancies",
                "How to match returns data?"
            ],
            greetings: [
                "Processing Ajio customer returns? 🔄",
                "Upload Ajio returns sheet to audit",
                "Reconcile returned inventory automatically",
                "Track return claim discrepancies",
                "Let's trace dispute rates today!"
            ]
        },
        amazon_invoice: {
            welcome: defaultWelcome,
            chips: [
                "How to reconcile Amazon invoices?",
                "Upload Portal, Vendor, Sale sheets",
                "Reconcile inventory records",
                "Highlight duplicate invoice rows",
                "Verify price disputes & mismatches"
            ],
            greetings: [
                "Ready to audit Amazon invoices? 📦",
                "Upload Portal and Vendor invoices! 📁",
                "Check for pricing disputes & mismatches",
                "Verify duplicate rows in inventory logs",
                "Audit sales and purchases reports!"
            ]
        },
        amazon_return: {
            welcome: defaultWelcome,
            chips: [
                "How to audit Amazon returns?",
                "Reconcile claim payouts",
                "Track returned inventory items",
                "Identify refund discrepancies",
                "How to check claim status codes?"
            ],
            greetings: [
                "Reconciling Amazon returns? 🔄",
                "Upload customer return reports to match",
                "Track returned inventory and refunds",
                "Check claims and payout discrepancies",
                "Audit outstanding claims effortlessly!"
            ]
        },
        myntra_invoice: {
            welcome: defaultWelcome,
            chips: [
                "How to reconcile Myntra invoices?",
                "Upload Portal, Sale, Purchase sheets",
                "Verify Myntra dispute rates",
                "Trace matching invoice entries",
                "Find duplicate records in sheet"
            ],
            greetings: [
                "Reconciling Myntra invoices? 🛍️",
                "Upload Portal, Sale, and Purchase sheets! 📁",
                "Find matching logs and billing disputes",
                "Trace duplicate records automatically",
                "Export reconciled data to Excel!"
            ]
        },
        myntra_return: {
            welcome: defaultWelcome,
            chips: [
                "Reconcile Myntra return files",
                "Match order IDs and return codes",
                "Flag customer return disputes",
                "Track returned items discrepancies",
                "How to check return dashboard data?"
            ],
            greetings: [
                "Processing Myntra returns? 🔄",
                "Upload return reports to check mismatches",
                "Reconcile customer returns with ease",
                "Match order IDs and flag disputes",
                "Verify returned items transaction logs!"
            ]
        },
        data_upload: {
            welcome: defaultWelcome,
            chips: [
                "How does the Upload Queue work?",
                "Check File Upload log status",
                "View Google Sheet sync history",
                "What do stats counters mean?",
                "Download history logs to Excel"
            ],
            greetings: [
                "Checking upload history? 📤",
                "Track file upload queues and statuses",
                "Verify Google Sheet sync logs",
                "Check success vs failed rows in history",
                "Download history report or clear logs!"
            ]
        },
        generic: {
            welcome: defaultWelcome,
            chips: [
                "How to use this dashboard?",
                "Where to upload spreadsheets?",
                "How to contact support?",
                "Can I download reports?",
                "Check platform access lists"
            ],
            greetings: [
                "Hii, I'm Aj, your friend! 👋",
                "Need help navigating Brand Central?",
                "I can answer access or platform queries",
                "Check out our new invoice checkers",
                "Ready to process your sheets?"
            ]
        }
    };
    
    return messages[context] || messages.generic;
}
