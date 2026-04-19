// Global State
let examActive = false;
let strikes = 0;
const MAX_STRIKES = 3;

// Suspicion Logic
let suspicionScore = 0; // 0 to 100
let isScanningRoom = false;
let objectDetectionFrameCount = 0;

// DOM Elements
const examContainer = document.getElementById('exam-container');
const setupModal = document.getElementById('setup-modal');
const violationModal = document.getElementById('violation-modal');
const roomScanModal = document.getElementById('room-scan-modal');

const startBtn = document.getElementById('start-exam-btn');
const resumeBtn = document.getElementById('resume-btn');
const startScanBtn = document.getElementById('start-scan-btn');

const uiWarningOverlay = document.getElementById('ui-warning-overlay');
const uiWarningText = document.getElementById('ui-warning-text');
const statusPill = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const logList = document.getElementById('log-list');

const modalReason = document.getElementById('modal-violation-reason');
const scanReason = document.getElementById('scan-reason');
const strikeText = document.getElementById('strike-text');

const modelLoader = document.getElementById('model-loader');
const loaderText = document.getElementById('loader-text');

const quizPanel = document.getElementById('quiz-panel');
const endPanel = document.getElementById('end-panel');
const termReason = document.getElementById('termination-reason');
const quizControls = document.getElementById('quiz-controls');

const suspicionPercent = document.getElementById('suspicion-percent');
const suspicionFill = document.getElementById('suspicion-fill');

// Video elements
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// ====== MAX SECURITY: AUDIO SURVEILLANCE ======
let audioContext, analyser, microphone, javascriptNode;
let audioWarningDebounce = 0;

async function activateAudioSurveillance() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);
        
        javascriptNode.onaudioprocess = function() {
            if (!examActive || isScanningRoom) return;
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let values = 0;
            const length = array.length;
            for (let i = 0; i < length; i++) {
                values += (array[i]);
            }
            const average = values / length;

            // Audio Threshold
            if (average > 25) { // Highly sensitive microphone trigger
                audioWarningDebounce++;
                if (audioWarningDebounce > 30) { // ~ 1 second of noise
                    increaseSuspicion(15, "UNAUTHORIZED AUDIO/TALKING.");
                    
                    uiWarningOverlay.classList.remove('hidden');
                    uiWarningText.innerText = "NOISE DETECTED";
                    setUISystemStatus(true, "Audio Alarm");
                    
                    setTimeout(() => { if (!isScanningRoom) uiWarningOverlay.classList.add('hidden'); }, 1500);
                    audioWarningDebounce = 0;
                }
            } else {
                audioWarningDebounce = 0; // Clear if silent
            }
        }
        addLog("Audio microphone successfully hooked.");
    } catch (e) {
        alert("Audio recording permission is permanently required for MAX SECURITY! System failed to attach.");
    }
}

// ====== MAX SECURITY: HARDWARE / DOM LOCKDOWN ======
document.addEventListener('copy', (e) => { e.preventDefault(); triggerViolation("KEYBOARD_LOCK", "Copying payload intercepted."); });
document.addEventListener('cut', (e) => { e.preventDefault(); triggerViolation("KEYBOARD_LOCK", "Cutting payload intercepted."); });
document.addEventListener('paste', (e) => { e.preventDefault(); triggerViolation("KEYBOARD_LOCK", "Pasting payload intercepted."); });

document.addEventListener('keydown', (e) => {
    // Block F12, Ctrl+Shift+I, Option+Cmd+I, Ctrl+U
    if(e.keyCode === 123 || 
      (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || 
      (e.ctrlKey && e.keyCode === 85) || 
      (e.metaKey && e.altKey && e.keyCode === 73)) {
        e.preventDefault();
        triggerViolation("DEV_TOOLS_LOCK", "Developer Mode tampering attempt recorded.");
    }
});


// Timer (2 Minutes)
let timeLeft = 2 * 60;
let timerInterval;

function startTimer() {
    timerInterval = setInterval(() => {
        if(!examActive || isScanningRoom) return; 
        timeLeft--;
        
        if (timeLeft <= 0) {
            terminateExam("Time's up! The 2-minute exam interval has finished and auto-submitted.");
            document.getElementById('time').innerText = `00:00`;
            return;
        }

        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        document.getElementById('time').innerText = `${m}:${s}`;
    }, 1000);
}

// Utility to add logs
function addLog(message, isAlert = false) {
    const li = document.createElement('li');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    if (isAlert) li.className = 'alert-log';
    li.innerHTML = `<span class="time">${timeStr}</span> ${message}`;
    logList.prepend(li);
}

function setUISystemStatus(isDanger, text) {
    statusPill.classList.remove('hidden');
    modelLoader.classList.add('hidden');
    if (isDanger) {
        statusPill.className = "status-pill danger";
        statusText.innerText = text || "System Alert!";
    } else {
        statusPill.className = "status-pill safe";
        statusText.innerText = text || "System Active - Audio/Video Monitored";
    }
}

// Suspicion Logic & Room Scan
function increaseSuspicion(amount, reason) {
    if (isScanningRoom || !examActive) return;
    
    suspicionScore += amount;
    if (suspicionScore > 100) suspicionScore = 100;
    
    suspicionPercent.innerText = `${suspicionScore}%`;
    suspicionFill.style.width = `${suspicionScore}%`;
    
    if (suspicionScore < 50) {
        suspicionFill.style.background = 'var(--success)';
    } else if (suspicionScore < 80) {
        suspicionFill.style.background = 'var(--warning)';
    } else {
        suspicionFill.style.background = 'var(--danger)';
    }

    addLog(`SUSPICION LEVEL [${suspicionScore}%]: ${reason}`, true);
    
    if (suspicionScore === 100) {
        triggerRoomScan(reason);
    }
}

function triggerRoomScan(reason) {
    isScanningRoom = true;
    examContainer.classList.add('blurred');
    
    strikes++;
    if (strikes >= MAX_STRIKES) {
        terminateExam("Auto-terminated due to maximum security violations (3/3). Your exam session is nullified.");
        return;
    }
    
    roomScanModal.classList.remove('hidden');
    scanReason.innerHTML = `Suspicion maxed out due to: ${reason}<br><br><span style="color:var(--danger); font-weight:800; font-size:1.3rem;">⚠️ THIS IS STRIKE ${strikes} OF 3.</span>`;
    addLog(`ROOM SCAN MANDATE ENFORCED (Strike ${strikes}).`, true);
    setUISystemStatus(true, "Scan Required");
}

let scanTimer;
startScanBtn.addEventListener('click', () => {
    startScanBtn.disabled = true;
    startScanBtn.innerText = "Scanning Environment...";
    
    const pb = document.getElementById('scan-progress-bar');
    const pt = document.getElementById('scan-timer-text');
    let scanTimeLeft = 15;
    
    scanTimer = setInterval(() => {
        scanTimeLeft--;
        pt.innerText = `${scanTimeLeft}s remaining. Keep panning the camera.`;
        pb.style.width = `${((15 - scanTimeLeft) / 15) * 100}%`;
        
        if (scanTimeLeft <= 0) {
            clearInterval(scanTimer);
            completeRoomScan();
        }
    }, 1000);
});

function completeRoomScan() {
    isScanningRoom = false;
    suspicionScore = 0; 
    suspicionPercent.innerText = "0%";
    suspicionFill.style.width = "0%";
    suspicionFill.style.background = 'var(--success)';
    document.getElementById('scan-progress-bar').style.width = "0%";
    document.getElementById('scan-timer-text').innerText = "Preparing...";
    
    startScanBtn.disabled = false;
    startScanBtn.innerText = "Begin 15-Second Room Scan";
    
    roomScanModal.classList.add('hidden');
    examContainer.classList.remove('blurred');
    addLog(`ROOM SCAN APPROVED. Strike ${strikes}/3 recorded. Resuming security...`);
    setUISystemStatus(false);
}

// Terminate Exam (Lock out of everything)
function terminateExam(reasonString) {
    examActive = false;
    clearInterval(timerInterval);
    if(document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
    }
    
    violationModal.classList.add('hidden');
    roomScanModal.classList.add('hidden');
    examContainer.classList.remove('blurred');
    quizPanel.classList.add('hidden');
    quizControls.classList.add('hidden');
    endPanel.classList.remove('hidden');
    termReason.innerText = reasonString;
    addLog(`EXAM LOCKED: ${reasonString}`, true);
    setUISystemStatus(true, "Exam Terminated");
    
    const stream = videoElement.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (audioContext) audioContext.close();

    // Notify OS directly
    if (Notification.permission === "granted") {
        new Notification("🚨 EXAM TERMINATED 🚨", {
            body: "You have exceeded the maximum allowed mistakes (3/3). The test has been automatically ended.",
            icon: "https://cdn-icons-png.flaticon.com/512/564/564619.png"
        });
    } else {
        alert("🚨 EXAM TERMINATED: You have made 3 mistakes. The test has ended automatically and the authority is notified.");
    }
}

// Trigger Hard Cheating Violation (Dom events)
function triggerViolation(code, msg) {
    if (!examActive || isScanningRoom) return; 
    strikes++;
    addLog(`STRIKE ${strikes}/${MAX_STRIKES} [${code}]: ${msg}`, true);
    
    if (strikes >= MAX_STRIKES) {
        terminateExam("Auto-terminated due to maximum security violations (3/3). Authority Notified.");
        return;
    }
    
    modalReason.innerText = msg;
    strikeText.innerText = `Strike ${strikes} of ${MAX_STRIKES}. Continued violations will result in auto-termination.`;
    
    examContainer.classList.add('blurred');
    violationModal.classList.remove('hidden');
    setUISystemStatus(true, "Violation Logged");
}

document.addEventListener("visibilitychange", () => {
    if (examActive && document.visibilityState === 'hidden') triggerViolation("TAB_SWITCH", "You switched tabs or lost browser focus.");
});

window.addEventListener("blur", () => {
    if (examActive && !isScanningRoom) triggerViolation("WINDOW_BLUR", "Foreground application disrupted. Focus lost.");
});

document.addEventListener("fullscreenchange", () => {
    if (examActive && !document.fullscreenElement && !isScanningRoom) triggerViolation("FULLSCREEN_EXIT", "Attempted to break fullscreen confinement.");
});

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
        alert("Fullscreen confinement rigidly required!");
    }
});

// MULTI-MODEL AI PIPELINE
let isTfReady = false;
let cocoModel = null;
let currentAIWarning = "";
let aiWarningDebounce = 0;
let modelsLoadedCount = 0;

function checkAllModelsLoaded() {
    modelsLoadedCount++;
    if (modelsLoadedCount === 2) {
        startBtn.disabled = false;
        startBtn.innerText = "Activate Security Payload & Start";
        startBtn.style.background = 'var(--primary)';
        startBtn.style.cursor = 'pointer';
        startBtn.classList.add('glow-effect');
        modelLoader.classList.add('hidden');
        setUISystemStatus(false, "System Ready");
    } else {
        loaderText.innerText = "Loading Object Defense Neural Net (Please wait ~10s)...";
    }
}

// 1. TensorFlow COCO-SSD for Phones/Books
cocoSsd.load().then(model => {
    cocoModel = model;
    isTfReady = true;
    checkAllModelsLoaded();
});

// 2. MediaPipe FaceMesh for Eye Tracking
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});
faceMesh.setOptions({ maxNumFaces: 2, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
let isFaceMeshReady = false;
faceMesh.onResults((results) => {
    if (!isFaceMeshReady) {
        isFaceMeshReady = true;
        checkAllModelsLoaded();
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (results.image) {
        canvasCtx.translate(canvasElement.width, 0); 
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    
    if(!examActive || isScanningRoom) { canvasCtx.restore(); return; }

    objectDetectionFrameCount++;
    if (isTfReady && objectDetectionFrameCount % 10 === 0) {
        cocoModel.detect(videoElement).then(predictions => {
            let prohibitedObj = null;
            predictions.forEach(pred => {
                if (['cell phone', 'book', 'laptop', 'tablet', 'tv'].includes(pred.class)) {
                    if (pred.score > 0.50) prohibitedObj = pred.class;
                }
            });
            
            if (prohibitedObj) {
                uiWarningOverlay.classList.remove('hidden');
                uiWarningText.innerText = `UNAUTHORIZED: ${prohibitedObj.toUpperCase()}`;
                canvasCtx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // red tint
                canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
                increaseSuspicion(45, `Detected prohibited object (${prohibitedObj}) in camera view.`);
                setTimeout(() => { if (!isScanningRoom) uiWarningOverlay.classList.add('hidden'); }, 1500);
            }
        });
    }

    canvasCtx.restore();

    // === FATAL/SOFT FACE ANOMALIES ===
    let warning = ""; let detReason = "";
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        warning = "NO FACE DETECTED"; detReason = "Physical absence detected.";
    } else if (results.multiFaceLandmarks.length > 1) {
        warning = "MULTIPLE FACES DETECTED"; detReason = "External presence breach.";
    } else {
        const landmarks = results.multiFaceLandmarks[0];
        const leftIris = landmarks[468]; 
        const leftEyeInner = landmarks[133]; 
        const leftEyeOuter = landmarks[33];  
        const irisPos = (leftIris.x - leftEyeOuter.x) / (leftEyeInner.x - leftEyeOuter.x);
        
        const nose = landmarks[1];
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        const distLeft = Math.abs(nose.x - leftCheek.x);
        const distRight = Math.abs(nose.x - rightCheek.x);

        if (distLeft > distRight * 3.0) {
            warning = "LOOKING AWAY"; detReason = "Head posture shifted right.";
        } else if (distRight > distLeft * 3.0) {
            warning = "LOOKING AWAY"; detReason = "Head posture shifted left.";
        } else if (irisPos < 0.20) {
            warning = "EYE TRACKING ALERT"; detReason = "Iris tracking severe derivation right.";
        } else if (irisPos > 0.80) {
            warning = "EYE TRACKING ALERT"; detReason = "Iris tracking severe derivation left.";
        }
    }

    if (warning !== "") {
        aiWarningDebounce++;
        if(aiWarningDebounce > 10) { // FASTER reaction ~ 300ms
            if(currentAIWarning !== warning) {
                addLog(`AI PROCTOR: ${warning}`, true);
                currentAIWarning = warning;
            }
            uiWarningOverlay.classList.remove('hidden');
            uiWarningText.innerText = warning;
            if(!isScanningRoom) setUISystemStatus(true, "Vision Protocol Alert");
            
            canvasCtx.fillStyle = 'rgba(239, 68, 68, 0.2)';
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            
            // Lock onto Suspicion fast
            if (aiWarningDebounce % 45 === 0) { // every ~ 1.5 second
                increaseSuspicion(25, `${detReason}`);
            }
        }
    } else {
        if (currentAIWarning !== "") {
            addLog(`AI PROCTOR: Gaze recovered.`);
            currentAIWarning = "";
        }
        aiWarningDebounce = 0;
        uiWarningOverlay.classList.add('hidden');
        if(!isScanningRoom && suspicionScore < 100) setUISystemStatus(false);
    }
});

const camera = new Camera(videoElement, {
  onFrame: async () => {
    try { await faceMesh.send({image: videoElement}); } 
    catch(err) {} 
  }, width: 640, height: 480
});
camera.start();

startBtn.addEventListener('click', async () => {
    try {
        if ("Notification" in window) await Notification.requestPermission();
        await activateAudioSurveillance(); // Hooks mic
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        setupModal.classList.add('hidden');
        examActive = true;
        addLog('Environment verified. Max Security lock engaged.');
        startTimer();
    } catch (err) {
        alert("Fullscreen, Mic, and Notification bounds are strictly enforced!");
    }
});
