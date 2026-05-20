import { loadMoveNet }                                from './ai/movenet_loader.js';
import { detectPose }                                 from './ai/detector.js';
import { getBestSidePoints, calculateCVA, resetSideLock } from './ai/posture_logic.js';
import { drawChinTuckOverlay }                        from './ui/overlay.js';
import { evaluateChinTuck, resetChinTuckState,
         requestChinTuckBaseline }                    from './ai/chin_tuck_logic.js';

// ── DOM refs ──────────────────────────────────────────────
const stretchVideo  = document.getElementById('stretchVideo');
const stretchCanvas = document.getElementById('stretchCanvas');
const pillDot       = document.getElementById('stretchPillDot');
const pillText      = document.getElementById('stretchPillText');
const cvaValue      = document.getElementById('stretchCvaValue');
const feedbackMain  = document.getElementById('stretchFeedbackMain');
const feedbackSub   = document.getElementById('stretchFeedback');
const successNum    = document.getElementById('stretchSuccessNum');
const baselineBtn   = document.getElementById('baselineBtn');

// ── 사이드뷰 품질 판단: 스트레칭 기준자세 측정용 완화 버전 ─────────────────────────────
function getStretchPoseQuality(keypoints, canvasWidth) {
    const leftEar       = keypoints.find(k => k.name === 'left_ear');
    const rightEar      = keypoints.find(k => k.name === 'right_ear');
    const leftShoulder  = keypoints.find(k => k.name === 'left_shoulder');
    const rightShoulder = keypoints.find(k => k.name === 'right_shoulder');

    if (!leftEar || !rightEar || !leftShoulder || !rightShoulder) {
        return { isSideView: false, reason: 'KEYPOINT_MISSING' };
    }

    const width = canvasWidth || 256;

    const shoulderWidthRatio = Math.abs(leftShoulder.x - rightShoulder.x) / width;
    const earWidthRatio      = Math.abs(leftEar.x - rightEar.x) / width;

    const leftScore  = (leftEar.score + leftShoulder.score) / 2;
    const rightScore = (rightEar.score + rightShoulder.score) / 2;

    const sideScoreGap = Math.abs(leftScore - rightScore);

    // 기존보다 완화한 측면 조건
    const shoulderLooksSide = shoulderWidthRatio <= 0.30;
    const scoreLooksSide    = sideScoreGap >= 0.08 && shoulderWidthRatio <= 0.38;

    // 정말 정면에 가까운 경우만 제외
    const clearlyFront =
        leftEar.score > 0.60 &&
        rightEar.score > 0.60 &&
        earWidthRatio > 0.12 &&
        shoulderWidthRatio > 0.34;

    return {
        isSideView: (shoulderLooksSide || scoreLooksSide) && !clearlyFront,
        shoulderWidthRatio,
        earWidthRatio,
        sideScoreGap,
        leftScore,
        rightScore
    };
}

// ── chin_tuck_logic 콜백 → UI 업데이트 ───────────────────
window.onChinTuckUpdate = function({ phase, successCount, holdProgress, holdSec, holdTarget, message, detail }) {
    if (phase === 'baseline') {
        pillDot.style.background = 'var(--warn)';
        pillText.textContent     = '기준 측정 중';
    } else if (phase === 'exercise') {
        pillDot.style.background = 'var(--good)';
        pillText.textContent     = '스트레칭 중';
    }

    successNum.textContent = successCount ?? '0';
    feedbackMain.textContent = message   ?? '';
    feedbackSub.textContent  = detail    ?? '';
};

// ── evaluateChinTuck 결과 → 아래 패널 업데이트 ─────────────
function updateStretchPanel(result) {
    // 1. 성공 횟수 표시
    successNum.textContent = result.successCount ?? 0;

    // 2. 메인 문구 / 상세 문구 표시
    feedbackMain.textContent = result.message ?? '';
    feedbackSub.textContent = result.detailMessage ?? '';

    // 3. 상단 상태 pill 표시
    if (result.status === 'COUNTDOWN') {
        pillDot.style.background = 'var(--warn)';
        pillText.textContent = '기준 대기 중';
    } else if (result.status === 'BASELINE' || result.status === 'BASELINE_SIDE_WAIT') {
        pillDot.style.background = 'var(--warn)';
        pillText.textContent = '기준 측정 중';
    } else if (result.status === 'BASELINE_READY') {
        pillDot.style.background = 'var(--good)';
        pillText.textContent = '기준 완료';
    } else if (result.status === 'HOLD') {
        pillDot.style.background = 'var(--good)';
        pillText.textContent = '유지 중';
    } else if (result.status === 'SUCCESS') {
        pillDot.style.background = 'var(--good)';
        pillText.textContent = '성공';
    } else if (result.status === 'RETURN') {
        pillDot.style.background = 'var(--warn)';
        pillText.textContent = '복귀 필요';
    } else if (result.status === 'WRONG') {
        pillDot.style.background = 'var(--warn)';
        pillText.textContent = '스트레칭 중';
    } else if (result.status === 'NOT_SIDE_VIEW') {
        pillDot.style.background = 'var(--bad)';
        pillText.textContent = '측면 아님';
    } else if (result.status === 'BASELINE_UNSTABLE') {
        pillDot.style.background = 'var(--bad)';
        pillText.textContent = '기준 실패';
    } else {
        pillDot.style.background = 'var(--muted)';
        pillText.textContent = '준비 중';
    }

    // 4. CVA 값을 가운데 박스에 표시
    const cvaText = typeof result.cva === 'number'
        ? `CVA ${result.cva.toFixed(1)}°`
        : 'CVA --';

    cvaValue.textContent = cvaText;

    const holdSec = typeof result.holdSeconds === 'number'
        ? result.holdSeconds.toFixed(1)
        : '0.0';

    const holdTarget = 5;

    if (result.status === 'HOLD') {
        holdLabel.textContent = `${holdSec} / ${holdTarget}초`;
    } else {
        holdLabel.textContent = `0.0 / ${holdTarget}초`;
    }

    // 5. 유지 progress bar 표시
    if (typeof result.progress === 'number' && result.status === 'HOLD') {
        holdBar.classList.add('show');
        holdFill.style.width = `${Math.min(100, Math.max(0, result.progress * 100)).toFixed(1)}%`;
    } else {
        holdBar.classList.remove('show');
        holdFill.style.width = '0%';
    }
}

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
    resetSideLock();
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

    // 추론 루프
    async function detectLoop() {
        if (!stretchRunning) return;

        try {
            const poses = await detectPose(detector, stretchVideo);

            if (poses.length > 0) {
                const kp = poses[0].keypoints;

                // 1. 측면 기준으로 사용할 귀/어깨 포인트 선택
                const sidePoints = getBestSidePoints(kp);

                if (sidePoints && sidePoints.confOk) {
                    // 2. 측면 자세 품질 확인
                    const quality = getStretchPoseQuality(kp, stretchCanvas.width);

                    // 3. 귀-어깨 기준 CVA 계산
                    const cva = calculateCVA(sidePoints.ear, sidePoints.shoulder);

                    // 4. 턱 당기기 스트레칭 판정
                    const result = evaluateChinTuck({
                        ear: sidePoints.ear,
                        shoulder: sidePoints.shoulder,
                        cva,
                        poseQuality: quality
                    });

                    // 5. 스트레칭 화면 문구 업데이트
                    updateStretchPanel(result);

                    // 6. 웹캠 위 오버레이 표시
                    drawChinTuckOverlay(
                        stretchCanvas,
                        sidePoints.ear,
                        sidePoints.shoulder,
                        result
                    );
                } else {
                    feedbackMain.textContent = '귀와 어깨가 잘 보이도록 측면으로 앉아주세요';
                    feedbackSub.textContent = '카메라에 얼굴 옆면과 어깨가 함께 보여야 합니다.';

                    stretchCanvas.getContext('2d').clearRect(
                        0,
                        0,
                        stretchCanvas.width,
                        stretchCanvas.height
                    );
                }
            } else {
                feedbackMain.textContent = '사람이 감지되지 않습니다';
                feedbackSub.textContent = '카메라 앞에 앉아주세요.';

                stretchCanvas.getContext('2d').clearRect(
                    0,
                    0,
                    stretchCanvas.width,
                    stretchCanvas.height
                );
            }
        } catch (e) {
            console.error('[Stretch] detectLoop error:', e);

            feedbackMain.textContent = '스트레칭 감지 중 오류가 발생했습니다';
            feedbackSub.textContent = 'Console 오류를 확인해주세요.';
        }

        setTimeout(detectLoop, 150);
    }
    detectLoop();
}

init();
