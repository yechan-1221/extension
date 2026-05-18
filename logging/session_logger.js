export function createSessionLog(userId) {

    return {
        user_id: userId,
        started_at: new Date().toISOString(),
        events: []
    };
}


export function appendEvent(log, event) {

    log.events.push(event);
}