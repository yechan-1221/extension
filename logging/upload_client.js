export async function uploadLog(logData) {
    // 1. Azure Functions로 로그 전송
    try {
        const response = await fetch(
            'http://localhost:8000/api/upload-log',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logData)
            }
        );
        const result = await response.json();
        console.log('[Azure Pipeline] 로그 전송 완료:', result);

        // 2. 전송 완료 후 Flask에 절전 신호
        try {
            await fetch('http://localhost:5000/shutdown', { method: 'POST' });
            console.log('[Azure Pipeline] 절전 신호 전송 완료');
        } catch (err) {
            console.log('[Azure Pipeline] 절전 신호 전송 실패:', err);
        }

        return result;

    } catch (err) {
        console.log('[Azure Pipeline] 로그 전송 실패:', err);
        throw err;
    }
}