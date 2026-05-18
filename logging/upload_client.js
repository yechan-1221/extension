export async function uploadLog(logData) {

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

    return await response.json();
}