import { loadMoveNet }                                                        from './ai/movenet_loader.js';
import { detectPose }                                                         from './ai/detector.js';
import { getBestSidePoints, calculateCVA, applyHysteresis, resetSideLock }   from './ai/posture_logic.js';
import { drawOverlay, clearOverlay } from './ui/overlay.js';
import { getParams, logParamFrame }                       from './ui/param_panel.js';
import { sendNotification }                               from './ui/notifications.js';

const FUNCTIONS_URL = 'https://uprightai-func-c5eyevhngmhtbadr.centralus-01.azurewebsites.net/api';
const MIN_FHP_SEC   = 10;
const KST_OFFSET    = 9 * 60 * 60 * 1000;


function safeRuntime(fn) {
    try {
        if (!chrome.runtime?.id) throw new Error('invalidated');
        return fn();
    } catch (e) {
        if (e.message.includes('invalidated') || e.message.includes('Extension context')) {
            loopRunning = false;
            window.close();
        }
    }
}


// ── 페이지/탭 라우팅 (CSP 호환 — 인라인 script 대체) ──────
(function initRouting() {
  var $ = function(id) { return document.getElementById(id); };
  var PAGES  = ['page-main'];
  var TABS   = ['tab-live-page', 'tab-survey-page'];
  var TABBTN = ['tab-live', 'tab-survey'];
  function showPage(id) {
    PAGES.forEach(function(p) { $(p).classList.remove('active'); });
    $(id).classList.add('active');
  }
  function showTab(pageId, btnId) {
    TABS.forEach(function(t) { $(t).classList.remove('active'); });
    TABBTN.forEach(function(b) { $(b).classList.remove('active'); });
    $(pageId).classList.add('active');
    $(btnId).classList.add('active');
  }

  var p = new URLSearchParams(location.search).get('state') || '';

  if (!p) {
    // 프로덕션: 탭 바인딩
    showPage('page-main');
    $('tab-live').addEventListener('click', function() { showTab('tab-live-page','tab-live'); });
    $('tab-survey').addEventListener('click', function() { showTab('tab-survey-page','tab-survey'); });
    return;
  }

  // 프리뷰: ?state=xxx 목업
  var statusDot = $('statusDot'), statusTxt = $('statusText');
  var camDot = $('camStatusDot'), camTxt = $('camStatusText'), camBadge = $('camBadge');
  var liveCVA = $('liveCVA'), liveState = $('liveState'), liveSide = $('liveSide');
  var fhpCount = $('sessionFhpCount'), fhpSec = $('sessionFhpSec');
  var nfcBanner = $('nfcBanner'), nfcTitle = $('nfcTitle'), nfcSub = $('nfcBannerSub');
  $('headerUser').textContent = 'emp_001'; $('headerTime').textContent = '14:17';
  $('tab-live').addEventListener('click', function() { showTab('tab-live-page','tab-live'); });
  $('tab-survey').addEventListener('click', function() { showTab('tab-survey-page','tab-survey'); });

  if (p === 'live-loading') {
    showPage('page-main'); showTab('tab-live-page','tab-live');
    statusDot.style.background = 'var(--warn)'; statusTxt.textContent = 'AI 모델 로딩 중...';
    camDot.style.background = 'var(--warn)'; camTxt.textContent = '로딩 중';
    liveCVA.textContent = '--'; liveState.textContent = '--'; liveSide.textContent = '--';
    fhpCount.textContent = '0'; fhpSec.textContent = '0';
    var cw = document.querySelector('.cam-wrap');
    if (cw) cw.innerHTML = '<div class="cam-loading"><div class="cam-loading-icon">🧘</div><div class="cam-loading-text">AI 모델 로딩 중...</div><div class="shimmer-bar"></div></div>';
  }
  if (p === 'live-good') {
    showPage('page-main'); showTab('tab-live-page','tab-live');
    statusDot.style.background = 'var(--good)'; statusTxt.textContent = '측정 중';
    camDot.style.background = 'var(--good)'; camTxt.textContent = 'LIVE';
    camBadge.textContent = '✓ 바른 자세'; camBadge.className = 'cam-badge normal';
    liveCVA.textContent = '58.4'; liveCVA.style.color = 'var(--good)';
    liveState.textContent = '정상'; liveState.style.color = 'var(--good)';
    liveSide.textContent = '우측'; fhpCount.textContent = '2'; fhpSec.textContent = '47';
    nfcTitle.textContent = '자세 정상'; nfcSub.textContent = 'CVA 58.4° — 바른 자세를 유지하고 있습니다.';
  }
  if (p === 'live-bad') {
    showPage('page-main'); showTab('tab-live-page','tab-live');
    statusDot.style.background = 'var(--good)'; statusTxt.textContent = '측정 중';
    camDot.style.background = 'var(--risk)'; camTxt.textContent = 'LIVE';
    camBadge.textContent = '⚠ 거북목 감지'; camBadge.className = 'cam-badge severe';
    liveCVA.textContent = '41.2'; liveCVA.style.color = 'var(--risk)';
    liveState.textContent = '거북목'; liveState.style.color = 'var(--risk)';
    liveSide.textContent = '우측'; fhpCount.textContent = '3'; fhpSec.textContent = '118';
    if (nfcBanner) nfcBanner.classList.add('bad-posture');
    nfcTitle.textContent = '⚠ 거북목 감지'; nfcTitle.className = 'nfc-title bad';
    nfcSub.textContent = 'CVA 41.2° — 목이 앞으로 기울어졌습니다. 지금 바로잡아 주세요.';
    var ni = document.querySelector('.nfc-icon'); if (ni) ni.textContent = '⚠️';
  }
  if (p === 'survey-wed') {
    showPage('page-main'); showTab('tab-survey-page','tab-survey');
    $('surveyBadge').classList.add('show'); $('surveyBanner').className = 'sv-banner wednesday';
    $('surveyBannerIcon').textContent = '📋'; $('surveyBannerTitle').textContent = '오늘은 설문일입니다!';
    $('surveyBannerSub').textContent = '이번 주 컨디션을 알려주세요. 5문항, 1분이면 충분합니다.';
  }
  if (p === 'survey-waiting') {
    showPage('page-main'); showTab('tab-survey-page','tab-survey');
    $('surveyBanner').className = 'sv-banner waiting'; $('surveyBannerIcon').textContent = '📅';
    $('surveyBannerTitle').textContent = '다음 설문일: 수요일 (3일 후)';
    $('surveyBannerSub').textContent = '수요일이 아니어도 미리 제출할 수 있습니다.';
  }
  if (p === 'survey-done') {
    showPage('page-main'); showTab('tab-survey-page','tab-survey');
    $('surveyBanner').className = 'sv-banner done'; $('surveyBannerIcon').textContent = '✅';
    $('surveyBannerTitle').textContent = '이번 주 설문 완료';
    $('surveyBannerSub').textContent = '설문에 참여해주셔서 감사합니다. 다음 수요일에 다시 만나요!';
    $('surveySubmitBtn').disabled = true;
    $('resultCard').className = 'result-card show yellow';
    $('resultEmoji').textContent = '🟡'; $('resultLabel').textContent = '번아웃 위험도 중간';
    $('resultDesc').textContent = '위험 지수 52% — 업무량과 휴식의 균형을 점검해보세요.';
  }
  // 스트레칭 페이지는 stretching.html 로 분리됨
})();

function nowKST() {
    return new Date(Date.now() + KST_OFFSET).toISOString().replace('Z', '');
}
function todayKST() {
    return new Date(Date.now() + KST_OFFSET).toISOString().slice(0, 10);
}

// ── 원본과 동일한 상태 변수들 ─────────────────────────────
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
let totalFhpDuration  = 0;
let fhpEvents  = [];
let sessionIdx = 1;

const video  = document.getElementById('webcam');
const canvas = document.getElementById('overlay');

// ── 시간 표시 (원본 동일) ─────────────────────────────────
function updateTime() {
    const now = new Date(Date.now() + KST_OFFSET);
    document.getElementById('headerTime').textContent =
        now.toISOString().slice(11, 16);
}
setInterval(updateTime, 1000);
updateTime();

// ── 설문 관련 ─────────────────────────────────────────────
const isWed         = () => new Date(Date.now() + KST_OFFSET).getDay() === 3;
const daysToWed     = () => { const d = new Date(Date.now() + KST_OFFSET).getDay(); return ((3 - d + 7) % 7) || 7; };
const surveyKey     = () => `survey_done_${todayKST()}_${userId}`;
const isSurveyDone  = () => { try { return !!localStorage.getItem(surveyKey()); } catch { return false; } };
const markSurveyDone = () => { try { localStorage.setItem(surveyKey(), '1'); } catch {} };

function updateSurveyBanner() {
    const banner = document.getElementById('surveyBanner');
    const icon   = document.getElementById('surveyBannerIcon');
    const title  = document.getElementById('surveyBannerTitle');
    const sub    = document.getElementById('surveyBannerSub');
    const badge  = document.getElementById('surveyBadge');
    const btn    = document.getElementById('surveySubmitBtn');

    if (isSurveyDone()) {
        banner.className   = 'survey-banner done';
        icon.textContent   = '✅';
        title.textContent  = '이번 주 설문 완료';
        sub.textContent    = '설문에 참여해주셔서 감사합니다. 다음 수요일에 다시 만나요!';
        if (badge) badge.classList.remove('show');
        if (btn)   btn.disabled = true;
    } else if (isWed()) {
        banner.className   = 'survey-banner wednesday';
        icon.textContent   = '📋';
        title.textContent  = '오늘은 설문일입니다!';
        sub.textContent    = '이번 주 컨디션을 알려주세요. 5문항, 1분이면 충분합니다.';
        if (badge) badge.classList.add('show');
        if (btn)   btn.disabled = false;
    } else {
        banner.className   = 'survey-banner waiting';
        icon.textContent   = '📅';
        title.textContent  = `다음 설문일: 수요일 (${daysToWed()}일 후)`;
        sub.textContent    = '수요일이 아니어도 미리 제출할 수 있습니다.';
        if (badge) badge.classList.remove('show');
        if (btn)   btn.disabled = false;
    }
}

const calcBurnout = (w, f, sleep, sign) => Math.min(1, Math.max(0,
    w * 0.035 + f * 0.045 +
    (sleep === '부족' ? 0.12 : sleep === '보통' ? 0.06 : 0) +
    (sign  === '많이' ? 0.18 : sign  === '약간' ? 0.09 : 0)
));

async function submitSurvey() {
    const w     = +document.getElementById('q1').value;
    const f     = +document.getElementById('q2').value;
    const sleep = document.querySelector('.ch-btn[data-q="q3"].selected')?.dataset.val;
    const sign  = document.querySelector('.ch-btn[data-q="q4"].selected')?.dataset.val;
    const comment = document.getElementById('q5').value.trim();

    if (!sleep || !sign) { alert('수면 상태와 번아웃 징후를 선택해주세요.'); return; }

    const burn  = calcBurnout(w, f, sleep, sign);
    const level = burn >= 0.7 ? 'HIGH' : burn >= 0.4 ? 'MEDIUM' : 'LOW';
    showResult(level, burn);
    document.getElementById('surveySubmitBtn').disabled = true;

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    try {
        await fetch(FUNCTIONS_URL + '/survey', {
            method: 'POST', headers,
            body: JSON.stringify({
                user_id: userId, date: todayKST(),
                workload: w, mental_fatigue: f,
                sleep_quality: sleep, burnout_sign: sign, comment,
                burn_rate: parseFloat(burn.toFixed(4)), risk_level: level,
                submitted_at: nowKST()
            })
        });
    } catch(e) { console.warn('설문 전송 실패:', e); }

    markSurveyDone();
    updateSurveyBanner();
}

function showResult(level, burn) {
    const map = {
        LOW:    { cls: 'green',  e: '🟢', l: '번아웃 위험도 낮음', d: '현재 컨디션이 양호합니다. 지금 패턴을 유지하세요.' },
        MEDIUM: { cls: 'yellow', e: '🟡', l: '번아웃 위험도 중간', d: '업무량과 휴식의 균형을 점검해보세요.' },
        HIGH:   { cls: 'red',    e: '🔴', l: '번아웃 위험도 높음', d: 'HR 담당자와 면담을 권장합니다.' }
    };
    const m = map[level];
    document.getElementById('resultCard').className  = `result-card show ${m.cls}`;
    document.getElementById('resultEmoji').textContent = m.e;
    document.getElementById('resultLabel').textContent = m.l;
    document.getElementById('resultDesc').textContent  = `위험 지수 ${Math.round(burn * 100)}% — ${m.d}`;
}

function bindSurveyEvents() {
    ['q1', 'q2'].forEach(id => {
        const sl = document.getElementById(id);
        const vl = document.getElementById(id + 'val');
        if (sl && vl) sl.addEventListener('input', () => vl.textContent = sl.value);
    });
    document.querySelectorAll('.ch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll(`.ch-btn[data-q="${btn.dataset.q}"]`)
                    .forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    document.getElementById('surveySubmitBtn').addEventListener('click', submitSurvey);
}

// ── 로그인 없이 바로 시작 (NFC 자동 인증 대응) ───────────
// window.nfcLogin(userId) 으로 외부에서 호출 가능 (원본 동일)
function startMain(id) {
    // ── 버전 체크 ──
    const myVer = chrome.runtime.getManifest().version;
    userId = 'test01';
    document.getElementById('headerUser').textContent = userId;

    // NFC 배너 서브 텍스트에 사용자명 반영
    const sub = document.getElementById('nfcBannerSub');
    if (sub) sub.textContent = `${userId}님, 자세 모니터링을 시작합니다. 올바른 자세를 유지해주세요.`;

    // 페이지-메인 표시
    document.getElementById('page-main').classList.add('active');

    updateSurveyBanner();
    bindSurveyEvents();

    // 백그라운드 토큰 발급 시도 (실패해도 카메라는 동작)
    fetch(FUNCTIONS_URL + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password: 'test1234' })
    }).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.token) token = d.token; })
      .catch(() => {});

    startCamera();
}

// NFC 태그 → 외부에서 호출하는 진입점 (원본과 동일하게 유지)
window.nfcLogin = id => {
    try { localStorage.setItem('uprightai_user_id', id); } catch {}
    startMain(id);
};

// ── 자동 시작 (NFC 자동화) ─────────────────────────────
(function init() {
    if (new URLSearchParams(location.search).get('state')) return;
    let saved = null;
    try { saved = localStorage.getItem('uprightai_user_id'); } catch {}
    startMain(saved || userId);
})();

// ── 세션 로그 전송 (원본 동일) ────────────────────────────
async function sendSessionLog() {
    if (!token || fhpEvents.length === 0) return;
    const eventsToSend = [...fhpEvents];
    fhpEvents = [];
    try {
        const res = await fetch(FUNCTIONS_URL + '/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            keepalive: true,
            body: JSON.stringify({
                user_id: userId, date: todayKST(),
                session_index: sessionIdx, fhp_events: eventsToSend
            })
        });
        if (res.ok) { console.log('Log sent:', eventsToSend.length, 'events'); sessionIdx++; }
    } catch(e) { console.error(e); }
}

setInterval(sendSessionLog, 60 * 1000);

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && fhpEvents.length > 0) {
        chrome.runtime.sendMessage({
            type: 'SEND_FINAL_LOG',
            payload: { userId, token, fhpEvents: [...fhpEvents], sessionIdx, date: todayKST() }
        });
        fhpEvents = [];
    }
});

window.addEventListener('beforeunload', sendSessionLog);

// ── 자동 종료 (오후 6시 KST) — 원본 동일 ─────────────────
const AUTO_END_HOUR = 18;

async function checkAutoLogout() {
    if (!token) return;   // 원본과 동일: token 없으면 skip
    const now = new Date(Date.now() + KST_OFFSET);
    if (now.getHours() >= AUTO_END_HOUR) executeShutdown();
}
setInterval(checkAutoLogout, 60000);

// ── 종료 워크플로우 (원본 동일) ───────────────────────────
async function finalize() {
    try { await sendSessionLog(); } catch(e) { console.warn('로그 전송 실패:', e); }
    sendNotification('end');
    window.close();
}

window.addEventListener('beforeunload', () => {
    loopRunning = false;

    // context 가드 추가
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }

    if (totalFhpDuration > 5.0) {  // 테스트 조건
        chrome.runtime.sendMessage({ type: 'NEED_STRETCHING' }).catch(() => {});
        window.close();
    }

    finalize();
});

// ── 카메라 + 추론 루프 (원본 동일) ───────────────────────
async function startCamera() {
    document.getElementById('statusText').textContent = '카메라 로딩 중...';
    resetSideLock();
    lastState         = 'NORMAL';
    pendingState      = 'NORMAL';
    pendingStateStart = Date.now();
    noDetectionStart  = null;

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
            if (!loopRunning || !chrome.runtime?.id) return;
            try {
                const poses = await detectPose(detector, video);
                if (poses.length > 0) {
                    const result = getBestSidePoints(poses[0].keypoints);
                    if (result && result.confOk) {
                        noDetectionStart = null;
                        const cva      = calculateCVA(result.ear, result.shoulder);
                        const rawState = applyHysteresis(cva, lastState);

                        const now = Date.now();
                        if (rawState !== pendingState) {
                            pendingState      = rawState;
                            pendingStateStart = now;
                        }

                        const pendingDuration   = now - pendingStateStart;
                        const FHP_CONFIRM_MS    = 10000;
                        const NORMAL_CONFIRM_MS = 5000;

                        let confirmedState = lastState;
                        if (pendingState === 'SEVERE_FHP' && pendingDuration >= FHP_CONFIRM_MS) {
                            confirmedState = 'SEVERE_FHP';
                        } else if (pendingState === 'NORMAL' && lastState === 'SEVERE_FHP' && pendingDuration >= NORMAL_CONFIRM_MS) {
                            confirmedState = 'NORMAL';
                        } else if (lastState !== 'SEVERE_FHP') {
                            confirmedState = pendingState;
                        }

                        const state = confirmedState;

                        drawOverlay(canvas, result.ear, result.shoulder, state, cva, {
                            active:    state === 'SEVERE_FHP',
                            startTime: fhpStartMs
                        });
                        logParamFrame(cva, cva, pendingState, state);

                        document.getElementById('liveCVA').textContent   = cva.toFixed(1);
                        document.getElementById('liveState').textContent  =
                            state === 'NORMAL' ? '정상' : '거북목';
                        document.getElementById('liveSide').textContent   =
                            result.side === 'LEFT' ? '좌측' : '우측';

                        const badge = document.getElementById('camBadge');
                        if (state === 'NORMAL') {
                            badge.className   = 'cam-badge normal';
                            badge.textContent = '✓ 바른 자세';
                        } else {
                            badge.className   = 'cam-badge severe';
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

                                document.getElementById('sessionFhpCount').textContent = fhpEvents.length;
                                document.getElementById('sessionFhpSec').textContent = Math.round(totalFhpDuration);
                            }
                            fhpStart = null; fhpStartMs = null;
                        }
                        lastState = state;

                    } else {
                        if (noDetectionStart === null) noDetectionStart = Date.now();
                        const noDetectionSec = (Date.now() - noDetectionStart) / 1000;

                        if (noDetectionSec >= 10) {
                            if (lastState !== 'NO_DETECTION') {
                                clearOverlay(canvas);
                                document.getElementById('camBadge').className   = 'cam-badge';
                                document.getElementById('camBadge').textContent = '측면을 카메라에 보여주세요';
                                lastState         = 'NO_DETECTION';
                                pendingState      = 'NORMAL';
                                pendingStateStart = Date.now();
                            }
                        } else if (lastState === 'SEVERE_FHP') {
                            const badge = document.getElementById('camBadge');
                            badge.className   = 'cam-badge severe';
                            badge.textContent = '⚠ 거북목 감지';
                        } else {
                            clearOverlay(canvas);
                            document.getElementById('camBadge').className   = 'cam-badge';
                            document.getElementById('camBadge').textContent = '측면을 카메라에 보여주세요';
                        }
                    }
                }
            } catch(e) { console.error(e); }
            setTimeout(detectLoop, 150);
        }
        detectLoop();

    } catch(e) {
        document.getElementById('statusText').textContent = '오류: ' + e.message;
        document.getElementById('statusDot').style.background = '#C4513A';
    }
}