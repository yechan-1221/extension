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
    chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 440,
        height: 640,
        top: 80,
        left: 900
    });

    windowId = win.id;
});

chrome.runtime.onConnect.addListener((port) => {
  // 연결된 곳이 팝업인지 확인
  if (port.name === "popup") {
    
    // 팝업이 닫혀서 연결이 끊어졌을 때 실행
    port.onDisconnect.addListener(() => {
      /*
      // 익스텐션 내부의 stretching.html을 새 탭으로 열기
      chrome.tabs.create({
        url: chrome.runtime.getURL("stretching.html")
      });
      */
      // 만약 새 탭이 아니라 아예 새로운 브라우저 창으로 띄우고 싶다면 아래 코드를 사용하세요.
      
      chrome.windows.create({
            url: chrome.runtime.getURL('stretching.html'),
            type: 'popup',
            width: 400,
            height: 600
        });
      
    });
  }
});

// 창 닫히면 windowId 초기화
chrome.windows.onRemoved.addListener((id) => {
    if (id === windowId) windowId = null;
});
