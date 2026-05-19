let windowId = null;

// ─── NFC 폴링 ───────────────────────────────────────────
const FLASK_URL = 'http://localhost:5000';
let lastStatus = null;

async function pollSessionStatus() {
    try {
        const res = await fetch(`${FLASK_URL}/session-status`);
        const data = await res.json();
        const status = data.status;

        if (status === lastStatus) return;
        lastStatus = status;

        if (status === 'ACTIVE') {
            console.log('[Background] ACTIVE 감지 → 팝업 창 생성');
            openPopup();
        }

        if (status === 'INACTIVE') {
            console.log('[Background] INACTIVE 감지 → 종료 시퀀스 시작');
            chrome.runtime.sendMessage({ type: 'SHUTDOWN_SIGNAL' });

            setTimeout(() => {
                console.log('[Background] 크롬 종료 시작');
                chrome.windows.getAll((windows) => {
                    windows.forEach(win => chrome.windows.remove(win.id));
                });
            }, 15000);
        }

    } catch (err) {
        console.log('[Background] Flask 폴링 실패:', err);
    }
}

setInterval(pollSessionStatus, 3000);

// ─── 팝업 창 열기 ────────────────────────────────────────
async function openPopup() {
    if (windowId !== null) {
        try {
            await chrome.windows.update(windowId, { focused: true });
            return;
        } catch {
            windowId = null;
        }
    }

    const win = await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 440,
        height: 640,
        top: 80,
        left: 900
    });

    windowId = win.id;
}

// ─── 아이콘 클릭 시 ──────────────────────────────────────
chrome.action.onClicked.addListener(async () => {
    openPopup();
});

// ── 문제 1: 브라우저 업데이트 시 깔끔하게 재시작 ──
chrome.runtime.onUpdateAvailable.addListener(() => {
    chrome.runtime.reload();
});

// ── 문제 2: popup 닫힐 때 거북목 조건이면 stretching 창 열기 ──
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup') {
        let needStretching = false;

        port.onMessage.addListener((msg) => {
            if (msg.type === 'NEED_STRETCHING') needStretching = true;
        });

        port.onDisconnect.addListener(() => {
            if (needStretching) {
                chrome.windows.create({
                    url: chrome.runtime.getURL('stretching.html'),
                    type: 'popup',
                    width: 400,
                    height: 600
                });
            }
        });
    }
});

// 창 닫히면 windowId 초기화
chrome.windows.onRemoved.addListener((id) => {
    if (id === windowId) windowId = null;
});
