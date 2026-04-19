// Global State
let examActive = false;
let violationCount = 0;

// DOM Elements
const examContainer = document.getElementById('exam-container');
const setupModal = document.getElementById('setup-modal');
const violationModal = document.getElementById('violation-modal');
const startBtn = document.getElementById('start-exam-btn');
const resumeBtn = document.getElementById('resume-btn');
const uiWarningOverlay = document.getElementById('ui-warning-overlay');
const uiWarningText = document.getElementById('ui-warning-text');
const statusPill = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const logList = document.getElementById('log-list');
const modalReason = document.getElementById('modal-violation-reason');

// Utility to add logs
function addLog(message, isAlert = false) {
    const li = document.createElement('li');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    
    if (isAlert) {
        li.className = 'alert-log';
    }
    
    li.innerHTML = `<span class="time">${timeStr}</span> ${message}`;
    logList.prepend(li); // add to top
}

// 1. Initial Setup
startBtn.addEventListener('click', async () => {
    // Request fullscreen
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        
        setupModal.classList.add('hidden');
        examActive = true;
        addLog('Environment verified. Exam started.');
        
        // Start polling the AI endpoint
        startAIPolling();
    } catch (err) {
        alert("Fullscreen is required to start the exam!");
    }
});

// 2. Tab/Browser Monitoring (Client-Side Cheating)
document.addEventListener("visibilitychange", () => {
    if (examActive && document.visibilityState === 'hidden') {
        triggerViolation("TAB_SWITCH", "You switched tabs or lost window focus.");
    }
});

window.addEventListener("blur", () => {
    if (examActive) {
        triggerViolation("WINDOW_BLUR", "You clicked outside the exam window.");
    }
});

document.addEventListener("fullscreenchange", () => {
    if (examActive && !document.fullscreenElement) {
        triggerViolation("FULLSCREEN_EXIT", "You exited fullscreen mode.");
    }
});

function triggerViolation(code, msg) {
    violationCount++;
    addLog(`VIOLATION [${code}]: User minimized or unfocused window.`, true);
    
    modalReason.innerText = msg;
    examContainer.classList.add('blurred');
    violationModal.classList.remove('hidden');
    
    setUISystemStatus(true, "Client Violation Logged");
}

resumeBtn.addEventListener('click', async () => {
    try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
        violationModal.classList.add('hidden');
        examContainer.classList.remove('blurred');
        addLog('User acknowledged violation and resumed.');
        setUISystemStatus(false);
    } catch (err) {
        alert("You must allow fullscreen to resume!");
    }
});

// 3. AI Proctoring Polling (Server-Side Vision AI)
let lastWarning = "";

function setUISystemStatus(isDanger, text) {
    if (isDanger) {
        statusPill.className = "status-pill danger";
        statusText.innerText = text || "System Alert!";
    } else {
        statusPill.className = "status-pill safe";
        statusText.innerText = text || "System Active - Monitoring";
    }
}

async function startAIPolling() {
    setInterval(async () => {
        if (!examActive) return;
        
        try {
            const res = await fetch('/status');
            const data = await res.json();
            
            const currentWarning = data.warning;
            
            if (currentWarning) {
                if (currentWarning !== lastWarning) {
                    addLog(`AI DETECTED: ${currentWarning} - ${data.details}`, true);
                    lastWarning = currentWarning;
                }
                
                uiWarningOverlay.classList.remove('hidden');
                uiWarningText.innerText = currentWarning;
                setUISystemStatus(true, "AI Video Alert");
            } else {
                if (lastWarning !== "") {
                    addLog(`AI RESOLVED: Vision clear.`);
                    lastWarning = "";
                }
                uiWarningOverlay.classList.add('hidden');
                setUISystemStatus(false);
            }
        } catch (err) {
            console.error("Proctor API Error", err);
        }
    }, 1000); // Check every second
}

// Timer Logic (Visual Only)
let timeLeft = 45 * 60; // 45 mins
setInterval(() => {
    if(!examActive) return;
    timeLeft--;
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('time').innerText = `00:${m}:${s}`;
}, 1000);
