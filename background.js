let windowId = null;

// 익스텐션 아이콘 클릭 시
chrome.action.onClicked.addListener(async () => {
    // 이미 창이 열려 있으면 포커스만
    if (windowId !== null) {
        try {
            await chrome.windows.update(windowId, { focused: true });
            return;
        } catch {
            windowId = null; // 창이 닫혔으면 초기화
        }
    }

    // 새 창으로 열기 (작게)
    const win = await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 440,
        height: 640,
        top: 80,
        left: 900
    });

    windowId = win.id;
});

// 창 닫히면 windowId 초기화
chrome.windows.onRemoved.addListener((id) => {
    if (id === windowId) windowId = null;
});
