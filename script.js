// Global State
let examActive = false;
let strikes = 0;
const MAX_STRIKES = 3;

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
const strikeText = document.getElementById('strike-text');
const modelLoader = document.getElementById('model-loader');

const quizPanel = document.getElementById('quiz-panel');
const endPanel = document.getElementById('end-panel');
const termReason = document.getElementById('termination-reason');
const quizControls = document.getElementById('quiz-controls');

// Video elements
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Timer (2 Minutes)
let timeLeft = 2 * 60;
let timerInterval;

function startTimer() {
    timerInterval = setInterval(() => {
        if(!examActive) return;
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
    logList.prepend(li); // add to top
}

function setUISystemStatus(isDanger, text) {
    statusPill.classList.remove('hidden');
    modelLoader.classList.add('hidden');
    if (isDanger) {
        statusPill.className = "status-pill danger";
        statusText.innerText = text || "System Alert!";
    } else {
        statusPill.className = "status-pill safe";
        statusText.innerText = text || "System Active - Eye Tracking On";
    }
}

// Terminate Exam (Lock out of everything)
function terminateExam(reasonString) {
    examActive = false;
    clearInterval(timerInterval);
    if(document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
    }
    
    violationModal.classList.add('hidden');
    examContainer.classList.remove('blurred');
    quizPanel.classList.add('hidden');
    quizControls.classList.add('hidden');
    endPanel.classList.remove('hidden');
    termReason.innerText = reasonString;
    addLog(`EXAM LOCKED: ${reasonString}`, true);
    setUISystemStatus(true, "Exam Over");
    
    // Stop camera
    const stream = videoElement.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

// Trigger Cheating Violation
function triggerViolation(code, msg) {
    if (!examActive) return;
    strikes++;
    addLog(`STRIKE ${strikes}/${MAX_STRIKES} [${code}]: ${msg}`, true);
    
    if (strikes >= MAX_STRIKES) {
        terminateExam("Auto-terminated due to exceeding maximum cheating violation strikes (3/3). You are locked out.");
        return;
    }
    
    modalReason.innerText = msg;
    strikeText.innerText = `Strike ${strikes} of ${MAX_STRIKES}. Continued violations will result in auto-termination.`;
    
    examContainer.classList.add('blurred');
    violationModal.classList.remove('hidden');
    setUISystemStatus(true, "Violation Logged");
}

// Tab/Browser Out-of-focus Monitoring
document.addEventListener("visibilitychange", () => {
    if (examActive && document.visibilityState === 'hidden') {
        triggerViolation("TAB_SWITCH", "You switched tabs or minimized the browser.");
    }
});

window.addEventListener("blur", () => {
    if (examActive) {
        triggerViolation("WINDOW_BLUR", "You clicked outside the exam window.");
    }
});

document.addEventListener("fullscreenchange", () => {
    if (examActive && !document.fullscreenElement) {
        triggerViolation("FULLSCREEN_EXIT", "You attempted to exit fullscreen mode.");
    }
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
        alert("You must allow fullscreen to resume!");
    }
});

// MEDIA PIPE CLIENT-SIDE AI (Face & Eye tracking)
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
    maxNumFaces: 2,
    refineLandmarks: true, // Enables highly accurate Iris detection
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

let currentAIWarning = "";
let aiWarningDebounce = 0;

faceMesh.onResults((results) => {
    // Enable start button on first frame
    if (startBtn.disabled) {
        startBtn.disabled = false;
        startBtn.innerText = "Enter Secure Fullscreen & Start";
        startBtn.style.background = 'var(--primary)';
        startBtn.style.cursor = 'pointer';
        startBtn.classList.add('glow-effect');
        modelLoader.classList.add('hidden');
        setUISystemStatus(false, "System Ready");
    }

    // Draw video to canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Check if image exists before drawing
    if (results.image) {
        canvasCtx.translate(canvasElement.width, 0); // Mirror horizontally
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    canvasCtx.restore();

    if(!examActive) return;

    let warning = "";
    let detReason = "";

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        warning = "NO FACE DETECTED";
        detReason = "Camera cannot see candidate.";
    } else if (results.multiFaceLandmarks.length > 1) {
        warning = "MULTIPLE FACES DETECTED";
        detReason = "Unrecognized person in frame.";
    } else {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Exact eye gaze tracking (Iris vs Eye boundaries)
        const leftIris = landmarks[468]; // Center of left iris
        const leftEyeInner = landmarks[133]; 
        const leftEyeOuter = landmarks[33];  

        // Heuristic distance ratio for horizontal gaze
        const irisPos = (leftIris.x - leftEyeOuter.x) / (leftEyeInner.x - leftEyeOuter.x);
        
        // Head pose rough bounds
        const nose = landmarks[1];
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        
        const distLeft = Math.abs(nose.x - leftCheek.x);
        const distRight = Math.abs(nose.x - rightCheek.x);

        if (distLeft > distRight * 2.8) {
            warning = "LOOKING AWAY";
            detReason = "Head turned right.";
        } else if (distRight > distLeft * 2.8) {
            warning = "LOOKING AWAY";
            detReason = "Head turned left.";
        } else if (irisPos < 0.25) {
            warning = "EYE MOVEMENT DETECTED";
            detReason = "Gaze deviated severely right (screen relative).";
        } else if (irisPos > 0.75) {
            warning = "EYE MOVEMENT DETECTED";
            detReason = "Gaze deviated severely left (screen relative).";
        }
    }

    // Debounce to avoid flashing (trigger UI after 15 solid frames of cheating ~ 500ms)
    if (warning !== "") {
        aiWarningDebounce++;
        if(aiWarningDebounce > 15) {
            if(currentAIWarning !== warning) {
                addLog(`AI PROCTOR: ${warning} - ${detReason}`, true);
                currentAIWarning = warning;
            }
            uiWarningOverlay.classList.remove('hidden');
            uiWarningText.innerText = warning;
            setUISystemStatus(true, "AI Vision Alert!");
            
            // Apply red tint to canvas
            canvasCtx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            
            // If user stares away for 90 concurrent frames (~3 seconds), strike them.
            if (aiWarningDebounce === 90) {
                triggerViolation("PROLONGED_VISION_ALERT", `AI tracked prolonged violation: ${detReason}`);
            }
        }
    } else {
        if (currentAIWarning !== "") {
            addLog(`AI PROCTOR: Vision clear.`);
            currentAIWarning = "";
        }
        aiWarningDebounce = 0;
        uiWarningOverlay.classList.add('hidden');
        setUISystemStatus(false);
    }
});

// Setup Camera Flow
const camera = new Camera(videoElement, {
  onFrame: async () => {
    try {
        await faceMesh.send({image: videoElement});
    } catch(err) {
        console.error("Camera processing error", err);
    }
  },
  width: 640,
  height: 480
});

// Init on load
camera.start();

startBtn.addEventListener('click', async () => {
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        setupModal.classList.add('hidden');
        examActive = true;
        addLog('Environment verified. Security lock initiated.');
        startTimer();
    } catch (err) {
        alert("Fullscreen is required to start the exam!");
    }
});
