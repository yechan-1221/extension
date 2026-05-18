// extension/notifications.js

const CONFIGS = {
    started: {
        title:   '📷 UprightAI 시작됨',
        message: '웹캠이 활성화되어 자세 모니터링을 시작합니다.'
    },
    error: {
        title:   '⚠️ UprightAI 오류',
        message: '오류로 인해 모니터링이 중단되었습니다.'
    },
    stopped: {
        title:   '🛑 UprightAI 종료됨',
        message: '모니터링이 정상적으로 종료되었습니다.'
    }
};

/**
 * Chrome 알림을 발송합니다.
 * @param {'start'|'error'|'end'} type
 */
export function sendNotification(type) {
    const url = chrome.runtime.getURL(`ui/alert.html?type=${type}`);

    chrome.windows.create({
        url,
        type:   'popup',
        width:  360,
        height: 220
    });
}