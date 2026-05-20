export function generateFilename('test01', sessionId) {

    const now = new Date();

    const yyyy = now.getFullYear();

    const mm = String(now.getMonth() + 1).padStart(2, '0');

    const dd = String(now.getDate()).padStart(2, '0');

    return `${'test01'}_${yyyy}${mm}${dd}_${sessionId}.json`;
}