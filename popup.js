import { loadMoveNet }                                                        from './ai/movenet_loader.js';
import { detectPose }                                                         from './ai/detector.js';
import { getBestSidePoints, calculateCVA, applyHysteresis, resetSideLock }   from './ai/posture_logic.js';
import { drawOverlay, clearOverlay, drawChinTuckOverlay } from './ui/overlay.js';
import { getParams, logParamFrame }                       from './ui/param_panel.js';
import { sendNotification }                               from './ui/notifications.js';
import { evaluateChinTuck, resetChinTuckState,
         requestChinTuckBaseline }                        from './ai/chin_tuck_logic.js';

const FUNCTIONS_URL = 'https://uprightai-func-c5eyevhngmhtbadr.centralus-01.azurewebsites.net/api';
const MIN_FHP_SEC   = 10;
const KST_OFFSET    = 9 * 60 * 60 * 1000;

function nowKST() {
    return new Date(Date.now() + KST_OFFSET).toISOString().replace('Z', '');
}
function todayKST() {
    return new Date(Date.now() + KST_OFFSET).toISOString().slice(0, 10);
}

let token      = null;
let detector   = null;
let loopRunning = false;
let userId     = null;
let lastState  = 'NORMAL';
let fhpStart   = null;
let fhpStartMs = null;
let pendingState      = 'NORMAL';
let pendingStateStart = Date.now();
let noDetectionStart  = null;
let totalFhpDuration  = 0; // 거북목 누적 시간(초)
let fhpEvents  = [];
let sessionIdx = 1;

const video  = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx    = canvas.getContext('2d');

// ── 로그인/회원가입 탭 전환 ──────────────────────────────
document.getElementById('authTabLogin').addEventListener('click', () => {
    document.getElementById('authTabLogin').classList.add('active');
    document.getElementById('authTabRegister').classList.remove('active');
    document.getElementById('formLogin').classList.add('active');
    document.getElementById('formRegister').classList.remove('active');
    document.getElementById('loginMsg').textContent    = '';
    document.getElementById('registerMsg').textContent = '';
});

document.getElementById('authTabRegister').addEventListener('click', () => {
    document.getElementById('authTabRegister').classList.add('active');
    document.getElementById('authTabLogin').classList.remove('active');
    document.getElementById('formRegister').classList.add('active');
    document.getElementById('formLogin').classList.remove('active');
    document.getElementById('loginMsg').textContent    = '';
    document.getElementById('registerMsg').textContent = '';
});

// ── 로그인 ────────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', async () => {
    const id  = document.getElementById('loginId').value.trim();
    const pw  = document.getElementById('loginPw').value.trim();
    const msg = document.getElementById('loginMsg');

    if (!id || !pw) { msg.textContent = '아이디와 비밀번호를 입력하세요.'; return; }

    try {
        const res  = await fetch(FUNCTIONS_URL + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: id, password: pw })
        });
        const data = await res.json();

        if (!res.ok) { msg.textContent = data.detail || '로그인 실패'; return; }

        token  = data.token;
        userId = data.user_id;
        document.getElementById('headerUser').textContent = userId;

        document.getElementById('page-login').style.display = 'none';
        document.getElementById('page-main').style.display  = 'block';
        sendNotification('start');
        startCamera();

    } catch(e) {
        msg.textContent = '서버에 연결할 수 없습니다.';
    }
});

// ── 회원가입 ──────────────────────────────────────────────
document.getElementById('registerBtn').addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const id   = document.getElementById('regId').value.trim();
    const pw   = document.getElementById('regPw').value.trim();
    const msg  = document.getElementById('registerMsg');

    if (!name || !id || !pw) { msg.textContent = '모든 항목을 입력하세요.'; return; }
    if (id.length < 3)       { msg.textContent = '아이디는 3자 이상이어야 합니다.'; return; }
    if (pw.length < 6)       { msg.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }

    msg.className   = 'login-msg';
    msg.textContent = '';

    try {
        const res  = await fetch(FUNCTIONS_URL + '/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: id, password: pw, name })
        });
        const data = await res.json();

        if (!res.ok) { msg.textContent = data.detail || '회원가입 실패'; return; }

        msg.className   = 'login-msg success';
        msg.textContent = `${name}님 가입 완료! 로그인해주세요.`;

        // 1.2초 후 로그인 탭으로 자동 전환 + 아이디 자동 입력
        setTimeout(() => {
            document.getElementById('authTabLogin').click();
            document.getElementById('loginId').value = id;
        }, 1200);

    } catch(e) {
        msg.textContent = '서버에 연결할 수 없습니다.';
    }
});

// ── 탭 전환 ──────────────────────────────────────────────
document.getElementById('tab-live').addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('tab-live-page').classList.add('active');
});

document.getElementById('tab-stats').addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('tab-stats-page').classList.add('active');
    loadStats();
});

document.getElementById('refresh-btn').addEventListener('click', loadStats);

// ── 시간 표시 ─────────────────────────────────────────────
function updateTime() {
    const now = new Date(Date.now() + KST_OFFSET);
    document.getElementById('headerTime').textContent =
        now.toISOString().slice(11, 16);
}
setInterval(updateTime, 1000);
updateTime();

// ── 도넛 차트 ─────────────────────────────────────────────
function drawDonut(n, b, s) {
    const c = document.getElementById('donutChart').getContext('2d');
    const cx = 45, cy = 45, r = 36, thick = 12;
    c.clearRect(0, 0, 90, 90);
    const total = n + b + s;
    if (total === 0) {
        c.beginPath(); c.arc(cx, cy, r, 0, 2 * Math.PI);
        c.strokeStyle = '#E8E2D7'; c.lineWidth = thick; c.stroke();
        return;
    }
    [{ val: n/total, color: '#2E7D5B' },
     { val: b/total, color: '#C57B2E' },
     { val: s/total, color: '#C4513A' }].reduce((start, d) => {
        if (d.val <= 0) return start;
        const end = start + d.val * 2 * Math.PI;
        c.beginPath(); c.arc(cx, cy, r, start, end);
        c.strokeStyle = d.color; c.lineWidth = thick; c.stroke();
        return end;
    }, -Math.PI / 2);
}
drawDonut(0, 0, 0);

// ── 통계 로드 ─────────────────────────────────────────────
async function loadStats() {
    if (!token || !userId) return;
    try {
        const res  = await fetch(FUNCTIONS_URL + '/stats/' + userId, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (!data.total_sessions || data.total_sessions === 0) {
            ['statAvgCVA','statCount','statDuration','statRatio'].forEach(id => {
                document.getElementById(id).textContent = '0';
            });
            document.getElementById('insightText').textContent = '아직 측정 데이터가 없습니다.';
            drawDonut(0, 0, 0);
            return;
        }

        document.getElementById('statAvgCVA').textContent   = data.avg_cva_angle ? data.avg_cva_angle.toFixed(1) : '--';
        document.getElementById('statCount').textContent    = data.total_fhp_events;
        document.getElementById('statDuration').textContent = data.avg_duration_sec ? Math.round(data.avg_duration_sec) : '--';
        document.getElementById('statRatio').textContent    = data.fhp_ratio;

        const n = data.normal_count || 0;
        const b = data.borderline_count || 0;
        const s = data.fhp_count || 0;
        drawDonut(n, b, s);
        document.getElementById('lgNormal').textContent = n + '회';
        document.getElementById('lgSevere').textContent = s + '회';

        const ratio = data.fhp_ratio;
        document.getElementById('insightText').textContent =
            ratio > 40 ? '거북목 비율이 ' + ratio + '%로 높습니다. 모니터 높이를 조정해보세요.' :
            ratio > 20 ? '거북목 비율이 ' + ratio + '%입니다. 스트레칭을 권장합니다.' :
                         '오늘 자세 관리가 잘 되고 있어요! 거북목 비율 ' + ratio + '%로 양호합니다.';
    } catch(e) {
        document.getElementById('insightText').textContent = 'Azure Functions 서버에 연결할 수 없습니다.';
    }
}

// ── 세션 로그 전송 ────────────────────────────────────────
async function sendSessionLog() {
    if (!token || fhpEvents.length === 0) return;
    const eventsToSend = [...fhpEvents];
    fhpEvents = [];
    try {
        const res = await fetch(FUNCTIONS_URL + '/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({
                user_id: userId, date: todayKST(),
                session_index: sessionIdx, fhp_events: eventsToSend
            })
        });
        if (res.ok) { console.log('Log sent:', eventsToSend.length, 'events'); sessionIdx++; }
    } catch(e) { console.error(e); }
}

window.addEventListener('beforeunload', sendSessionLog);

// ── 시간 기반 자동 종료 (오후 7시 KST) ───────────────────
const AUTO_END_HOUR = 19;

async function checkAutoLogout() {
    if (!token) return;
    const now = new Date(Date.now() + KST_OFFSET);
    if (now.getHours() >= AUTO_END_HOUR) executeShutdown();
}
setInterval(checkAutoLogout, 60000);

// ── 종료 워크플로우 ────────────────────────────────────────
async function finalize() {
    try { await sendSessionLog(); } catch(e) { console.warn('로그 전송 실패:', e); }
    sendNotification('end');
    window.close();
}

async function executeShutdown() {
    loopRunning = false;

    // 카메라 스트림 종료
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }

    if (totalFhpDuration > 5.0) {
        // 거북목 5초 초과 → 스트레칭 화면으로 전환
        document.getElementById('page-main').style.display = 'none';
        document.getElementById('page-stretching').style.display = 'flex';

        // 스트레칭 전용 카메라 시작
        const stretchVideo  = document.getElementById('stretchVideo');
        const stretchCanvas = document.getElementById('stretchCanvas');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 256, height: 256, facingMode: 'user' }, audio: false
        });
        stretchVideo.srcObject = stream;
        await new Promise(r => stretchVideo.onloadedmetadata = r);
        stretchCanvas.width  = stretchVideo.videoWidth;
        stretchCanvas.height = stretchVideo.videoHeight;

        resetChinTuckState();
        let stretchRunning = true;

        // 스트레칭 감지 루프
        async function stretchLoop() {
            if (!stretchRunning) return;
            try {
                const poses = await detectPose(detector, stretchVideo);
                if (poses.length > 0) {
                    const result = getBestSidePoints(poses[0].keypoints);
                    if (result && result.confOk) {
                        const cva = calculateCVA(result.ear, result.shoulder);
                        const poseQuality = getStretchPoseQuality(poses[0].keypoints, stretchCanvas.width);
                        const chinResult = evaluateChinTuck({ ear: result.ear, shoulder: result.shoulder, cva, poseQuality });
                        drawChinTuckOverlay(stretchCanvas, result.ear, result.shoulder, chinResult);
                        document.getElementById('stretchFeedback').textContent = chinResult.message || '';
                    }
                }
            } catch(e) { console.error(e); }
            setTimeout(stretchLoop, 150);
        }
        stretchLoop();

        // 기준 자세 측정 버튼
        document.getElementById('baselineBtn').onclick = () => requestChinTuckBaseline();

        // 스트레칭 완료
        document.getElementById('stretchDoneBtn').onclick = () => {
            stretchRunning = false;
            stream.getTracks().forEach(t => t.stop());
            stretchVideo.srcObject = null;
            finalize();
        };
    } else {
        // 거북목 5초 이하 → 바로 종료
        finalize();
    }
}

function getStretchPoseQuality(keypoints, canvasWidth) {
    const leftEar       = keypoints.find(k => k.name === 'left_ear');
    const rightEar      = keypoints.find(k => k.name === 'right_ear');
    const leftShoulder  = keypoints.find(k => k.name === 'left_shoulder');
    const rightShoulder = keypoints.find(k => k.name === 'right_shoulder');

    if (!leftEar || !rightEar || !leftShoulder || !rightShoulder)
        return { isSideView: false, reason: 'KEYPOINT_MISSING' };

    const width = canvasWidth || 256;
    const shoulderWidthRatio = Math.abs(leftShoulder.x - rightShoulder.x) / width;
    const earWidthRatio      = Math.abs(leftEar.x - rightEar.x) / width;
    const leftScore          = (leftEar.score + leftShoulder.score) / 2;
    const rightScore         = (rightEar.score + rightShoulder.score) / 2;
    const sideScoreGap       = Math.abs(leftScore - rightScore);
    const sideByNarrowShoulder  = shoulderWidthRatio <= 0.22;
    const sideByDominantSide    = sideScoreGap >= 0.12 && shoulderWidthRatio <= 0.32;
    const bothEarsClearlyVisible = leftEar.score > 0.45 && rightEar.score > 0.45 && earWidthRatio > 0.08;

    return {
        isSideView: (sideByNarrowShoulder || sideByDominantSide) && !bothEarsClearlyVisible,
        shoulderWidthRatio, earWidthRatio, sideScoreGap, leftScore, rightScore
    };
}

// ── 종료 버튼 ─────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', executeShutdown);

// ── 점/선 그리기 ──────────────────────────────────────────

// ── 카메라 + 추론 ─────────────────────────────────────────
async function startCamera() {
    document.getElementById('statusText').textContent = '카메라 로딩 중...';
    resetSideLock();
    lastState = 'NORMAL';
    pendingState = 'NORMAL';
    pendingStateStart = Date.now();
    noDetectionStart = null;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 256, height: 256, facingMode: 'user' }, audio: false
        });
        video.srcObject = stream;
        await new Promise(r => {
            video.onloadedmetadata = () => {
                video.play();
                canvas.width  = video.videoWidth;
                canvas.height = video.videoHeight;
                r();
            };
        });

        document.getElementById('statusText').textContent = 'AI 모델 로딩 중...';
        detector = await loadMoveNet();
        document.getElementById('statusText').textContent = '측정 중';
        document.getElementById('statusDot').style.background = '#2E7D5B';

        loopRunning = true;
        async function detectLoop() {
            if (!loopRunning) return;
            try {
                const poses = await detectPose(detector, video);
                if (poses.length > 0) {
                    const result = getBestSidePoints(poses[0].keypoints);
                    if (result && result.confOk) {
                        noDetectionStart = null; // 인식 재개 시 리셋
                        const cva        = calculateCVA(result.ear, result.shoulder);
                        const rawState   = applyHysteresis(cva, lastState);

                        // ── 상태 전환 지연 로직 ──────────────────────────
                        // 거북목 → 정상: 5초 지속 시 전환
                        // 정상 → 거북목: 10초 지속 시 전환 (최초 미감지→감지 제외)
                        const now = Date.now();

                        if (rawState !== pendingState) {
                            pendingState      = rawState;
                            pendingStateStart = now;
                        }

                        const pendingDuration = now - pendingStateStart;
                        const FHP_CONFIRM_MS    = 10000; // 거북목 확정: 10초
                        const NORMAL_CONFIRM_MS = 5000;  // 정상 확정: 5초 (거북목→정상만)

                        let confirmedState = lastState;

                        if (pendingState === 'SEVERE_FHP' && pendingDuration >= FHP_CONFIRM_MS) {
                            confirmedState = 'SEVERE_FHP';
                        } else if (pendingState === 'NORMAL' && lastState === 'SEVERE_FHP' && pendingDuration >= NORMAL_CONFIRM_MS) {
                            confirmedState = 'NORMAL';
                        } else if (lastState !== 'SEVERE_FHP') {
                            // 거북목 아닌 상태에서 정상 전환은 즉시
                            confirmedState = pendingState;
                        }

                        const state = confirmedState;

                        // overlay.js로 캔버스 그리기
                        drawOverlay(canvas, result.ear, result.shoulder, state, cva, {
                            active:    state === 'SEVERE_FHP',
                            startTime: fhpStartMs
                        });

                        // 파라미터 테스트 로그
                        logParamFrame(cva, cva, pendingState, state);

                        document.getElementById('liveCVA').textContent   = cva.toFixed(1);
                        document.getElementById('liveState').textContent =
                            state === 'NORMAL' ? '정상' : '거북목';
                        document.getElementById('liveSide').textContent  =
                            result.side === 'LEFT' ? '좌측' : '우측';

                        const badge = document.getElementById('camBadge');
                        if (state === 'NORMAL') {
                            badge.className = 'cam-badge normal';
                            badge.textContent = '✓ 바른 자세';
                        } else {
                            badge.className = 'cam-badge severe';
                            badge.textContent = '⚠ 거북목 감지';
                        }

                        if (state === 'SEVERE_FHP' && lastState !== 'SEVERE_FHP') {
                            fhpStart   = nowKST();
                            fhpStartMs = Date.now();
                        }
                        if (state !== 'SEVERE_FHP' && lastState === 'SEVERE_FHP' && fhpStart) {
                            const durSec = (Date.now() - fhpStartMs) / 1000;
                            totalFhpDuration += durSec;
                            if (durSec >= MIN_FHP_SEC) {
                                fhpEvents.push({ start: fhpStart, end: nowKST() });
                                console.log('FHP recorded:', durSec.toFixed(1) + 's');
                            }
                            fhpStart = null; fhpStartMs = null;
                        }
                        lastState = state;

                    } else {
                        // 미감지 시작 시각 기록
                        if (noDetectionStart === null) noDetectionStart = Date.now();

                        const noDetectionSec = (Date.now() - noDetectionStart) / 1000;

                        if (noDetectionSec >= 10) {
                            // 10초 이상 미감지 → 상태 초기화
                            if (lastState !== 'NO_DETECTION') {
                                clearOverlay(canvas);
                                document.getElementById('camBadge').className   = 'cam-badge';
                                document.getElementById('camBadge').textContent = '측면을 카메라에 보여주세요';
                                lastState = 'NO_DETECTION';
                                pendingState = 'NORMAL';
                                pendingStateStart = Date.now();
                            }
                        } else if (lastState === 'SEVERE_FHP') {
                            // 거북목 상태에서 10초 미만 미감지 → 거북목 유지
                            const badge = document.getElementById('camBadge');
                            badge.className = 'cam-badge severe';
                            badge.textContent = '⚠ 거북목 감지';
                        } else {
                            clearOverlay(canvas);
                            document.getElementById('camBadge').className   = 'cam-badge';
                            document.getElementById('camBadge').textContent = '측면을 카메라에 보여주세요';
                        }
                    }
                }
            } catch(e) { console.error(e); }
            setTimeout(detectLoop, 150); // ~6 FPS — CPU 백엔드에 최적화
        }
        detectLoop();

    } catch(e) {
        document.getElementById('statusText').textContent = '오류: ' + e.message;
        document.getElementById('statusDot').style.background = '#C4513A';
    }
}