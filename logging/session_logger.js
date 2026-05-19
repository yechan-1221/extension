const SESSION_KEY = 'current_session_log';

// 세션 시작
export async function createSessionLog(userId) {
    const log = {
        user_id: userId,
        started_at: new Date().toISOString(),
        events: []
    };
    await chrome.storage.local.set({ [SESSION_KEY]: log });
    return log;
}

// 이벤트 추가
export async function appendEvent(event) {
    const result = await chrome.storage.local.get(SESSION_KEY);
    const log = result[SESSION_KEY];
    if (!log) return;

    log.events.push({
        ...event,
        timestamp: new Date().toISOString()
    });

    await chrome.storage.local.set({ [SESSION_KEY]: log });
}

// 현재 로그 불러오기
export async function getSessionLog() {
    const result = await chrome.storage.local.get(SESSION_KEY);
    return result[SESSION_KEY] || null;
}

// 로그 초기화 (전송 완료 후)
export async function clearSessionLog() {
    await chrome.storage.local.remove(SESSION_KEY);
}