import { loadMoveNet }                                from './ai/movenet_loader.js';
import { detectPose }                                 from './ai/detector.js';
import { drawChinTuckOverlay }                        from './ui/overlay.js';
import { evaluateChinTuck, resetChinTuckState,
         requestChinTuckBaseline }                    from './ai/chin_tuck_logic.js';

// ── DOM refs ──────────────────────────────────────────────
const stretchVideo  = document.getElementById('stretchVideo');
const stretchCanvas = document.getElementById('stretchCanvas');
const pillDot       = document.getElementById('stretchPillDot');
const pillText      = document.getElementById('stretchPillText');
const feedbackMain  = document.getElementById('stretchFeedbackMain');
const feedbackSub   = document.getElementById('stretchFeedback');
const successNum    = document.getElementById('stretchSuccessNum');
const holdBar       = document.getElementById('stretchHoldBar');
const holdFill      = document.getElementById('stretchHoldFill');
const holdLabel     = document.getElementById('stretchHoldLabel');
const baselineBtn   = document.getElementById('baselineBtn');
const doneBtn       = document.getElementById('stretchDoneBtn');

// ── 사이드뷰 품질 판별 ────────────────────────────────────
function getStretchPoseQuality(keypoints, canvasWidth) {
    const leftEar       = keypoints.find(k => k.name === 'left_ear');
    const rightEar      = keypoints.find(k => k.name === 'right_ear');
    const leftShoulder  = keypoints.find(k => k.name === 'left_shoulder');
    const rightShoulder = keypoints.find(k => k.name === 'right_shoulder');

    if (!leftEar || !rightEar || !leftShoulder || !rightShoulder)
        return { isSideView: false, reason: 'KEYPOINT_MISSING' };

    const width              = canvasWidth || 256;
    const shoulderWidthRatio = Math.abs(leftShoulder.x - rightShoulder.x) / width;
    const earWidthRatio      = Math.abs(leftEar.x - rightEar.x) / width;
    const leftScore          = (leftEar.score + leftShoulder.score) / 2;
    const rightScore         = (rightEar.score + rightShoulder.score) / 2;
    const sideScoreGap       = Math.abs(leftScore - rightScore);

    return {
        isSideView: (shoulderWidthRatio <= 0.22 || (sideScoreGap >= 0.12 && shoulderWidthRatio <= 0.32))
                    && !(leftEar.score > 0.45 && rightEar.score > 0.45 && earWidthRatio > 0.08),
        shoulderWidthRatio, earWidthRatio, sideScoreGap, leftScore, rightScore
    };
}

// ── chin_tuck_logic 콜백 → UI 업데이트 ───────────────────
window.onChinTuckUpdate = function({ phase, successCount, holdProgress, holdSec, holdTarget, message, detail }) {
    if (phase === 'baseline') {
        pillDot.style.background = 'var(--warn)';
        pillText.textContent     = '기준 측정 중';
    } else if (phase === 'exercise') {
        pillDot.style.background = 'var(--good)';
        pillText.textContent     = '운동 중';
    }

    successNum.textContent = successCount ?? '0';
    feedbackMain.textContent = message   ?? '';
    feedbackSub.textContent  = detail    ?? '';

    if (holdProgress != null) {
        holdBar.classList.add('show');
        holdFill.style.width   = (holdProgress * 100).toFixed(1) + '%';
        holdLabel.textContent  = `${holdSec?.toFixed(1) ?? '0.0'} / ${holdTarget ?? 5}초`;
    } else {
        holdBar.classList.remove('show');
    }
};

// ── 메인 초기화 ──────────────────────────────────────────
async function init() {
    // 카메라 스트림 열기
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 400, height: 300, facingMode: 'user' }, audio: false
        });
    } catch (e) {
        feedbackMain.textContent = '카메라 접근 실패: ' + e.message;
        return;
    }

    stretchVideo.srcObject = stream;
    await new Promise(r => stretchVideo.onloadedmetadata = r);
    stretchCanvas.width  = stretchVideo.videoWidth;
    stretchCanvas.height = stretchVideo.videoHeight;

    resetChinTuckState();
    let stretchRunning = true;

    // AI 모델 로드
    let detector;
    try {
        pillText.textContent = 'AI 모델 로딩 중...';
        detector = await loadMoveNet();
        pillText.textContent     = '준비 중';
        feedbackMain.textContent = '기준 자세 측정 버튼을 눌러 시작하세요';
        feedbackSub.textContent  = '카메라에 측면이 잘 보이도록 자세를 맞춰주세요.';
    } catch (e) {
        feedbackMain.textContent = 'AI 모델 로딩 실패: ' + e.message;
        return;
    }

    // 기준 자세 측정 버튼
    baselineBtn.onclick = () => requestChinTuckBaseline();

    // 완료 버튼
    doneBtn.onclick = () => {
        stretchRunning = false;
        stream.getTracks().forEach(t => t.stop());
        stretchVideo.srcObject = null;
        // popup.js 와의 통신: 완료 메시지 전달
        chrome.runtime.sendMessage({ type: 'STRETCHING_DONE' });
        window.close();
    };

    // 추론 루프
    async function detectLoop() {
        if (!stretchRunning) return;
        try {
            const poses = await detectPose(detector, stretchVideo);
            if (poses.length > 0) {
                const kp      = poses[0].keypoints;
                const quality = getStretchPoseQuality(kp, stretchCanvas.width);
                const result  = evaluateChinTuck(kp, quality);

                drawChinTuckOverlay(stretchCanvas, kp, result);
            }
        } catch (e) { console.error(e); }
        setTimeout(detectLoop, 150);
    }
    detectLoop();
}

init();
