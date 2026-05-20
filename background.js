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
        width: 415,
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

// ── 1. 스토어 업데이트 감지 및 창 정리 로직 (필수) ──
chrome.runtime.onUpdateAvailable.addListener(async (details) => {
    console.log(`[Background] 새 버전(${details.version}) 업데이트 대기 중... 기존 창 정리 시작`);
    
    try {
        const wins = await chrome.windows.getAll({ populate: true });
        const windowsToClose = new Set(); 

        wins.forEach(win => {
            win.tabs?.forEach(tab => {
                if (tab.url?.includes('popup.html') || tab.url?.includes('stretching.html')) {
                    windowsToClose.add(win.id);
                }
            });
        });

        for (const winId of windowsToClose) {
            await chrome.windows.remove(winId).catch(() => {}); 
        }

        console.log('[Background] 창 정리 완료. 익스텐션을 재시작합니다.');
        chrome.runtime.reload();

    } catch (error) {
        console.error('[Background] 업데이트 창 정리 중 에러 발생:', error);
        chrome.runtime.reload(); 
    }
});

// ── 2. 익스텐션 실행 시 업데이트 즉시 확인 (선택 사항, 추천) ──
// 크롬이 스스로 확인하는 주기(몇 시간)를 기다리지 않고 바로 찔러봅니다.
chrome.runtime.requestUpdateCheck((status) => {
    if (status === "update_available") {
        console.log("[Background] 스토어에서 새 버전을 발견했습니다! 다운로드 후 업데이트를 진행합니다.");
    }
});

// ── 문제 2: popup 닫힐 때 거북목 조건이면 stretching 창 열기 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'NEED_STRETCHING') {
        // 스트레칭 창 팝업으로 띄우기
        chrome.windows.create({
            url: chrome.runtime.getURL('stretching.html'),
            type: 'popup',
            width: 415,
            height: 660
        });
    }
});

// 창 닫히면 windowId 초기화
chrome.windows.onRemoved.addListener((id) => {
    if (id === windowId) windowId = null;
});
