// extension/overlay.js

/**
 * 캔버스에 귀-어깨 연결선, 키포인트 점, CVA/상태 텍스트를 그립니다.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ x, y }} ear
 * @param {{ x, y }} shoulder
 * @param {string} state  'NORMAL' | 'BORDERLINE' | 'SEVERE_FHP'
 * @param {number} cva    smoothed CVA 값 (°)
 * @param {{ active: boolean, startTime: number|null }} fhp
 */
export function drawOverlay(canvas, ear, shoulder, state, cva, fhp) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 귀-어깨 연결선
    ctx.beginPath();
    ctx.moveTo(ear.x, ear.y);
    ctx.lineTo(shoulder.x, shoulder.y);
    ctx.strokeStyle = state === 'SEVERE_FHP' ? '#FF4444' : '#00FFFF';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // 키포인트
    ctx.beginPath();
    ctx.arc(ear.x, ear.y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#00FF00';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(shoulder.x, shoulder.y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#0000FF';
    ctx.fill();
}

/**
 * 캔버스를 완전히 지웁니다.
 */
export function clearOverlay(canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * 스트레칭 모드 오버레이
 */
export function drawChinTuckOverlay(canvas, ear, shoulder, result) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 기준선: 어깨에서 위로
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y + 60);
    ctx.lineTo(shoulder.x, Math.max(0, shoulder.y - 160));
    ctx.strokeStyle = '#7777AA';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 귀-어깨 연결선
    ctx.beginPath();
    ctx.moveTo(ear.x, ear.y);
    ctx.lineTo(shoulder.x, shoulder.y);
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 키포인트
    ctx.beginPath();
    ctx.arc(ear.x, ear.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#00FF00';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(shoulder.x, shoulder.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#0000FF';
    ctx.fill();

    const statusColor = result.status === 'SUCCESS'            ? 'lime'
                      : result.status === 'GOOD'               ? 'lime'
                      : result.status === 'HOLD'               ? '#00FFFF'
                      : result.status === 'ALMOST'             ? 'orange'
                      : result.status === 'WRONG'              ? 'red'
                      : result.status === 'RETURN'             ? 'yellow'
                      : result.status === 'NOT_SIDE_VIEW'      ? 'red'
                      : result.status === 'BASELINE_READY'     ? 'lime'
                      : result.status === 'BASELINE_UNSTABLE'  ? 'red'
                      : result.status === 'BASELINE_SIDE_WAIT' ? 'orange'
                      : (result.status === 'BASELINE' || result.status === 'COUNTDOWN') ? 'yellow'
                      : '#FFFFFF';

    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = statusColor;
    ctx.fillText('MODE: STRETCH', 20, 30);

    ctx.font = 'bold 22px Arial';
    ctx.fillText(result.feedbackLabel || result.status, 20, 62);

    ctx.font = 'bold 17px Arial';
    ctx.fillText(result.message, 20, 90);

    if (result.detailMessage) {
        ctx.font = '15px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(result.detailMessage, 20, 115);
    }

    if (result.status === 'COUNTDOWN') {
        const match = String(result.message || '').match(/(\d+)/);
        const remain = match ? match[1] : '';
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 72px Arial';
        ctx.fillStyle = 'yellow';
        ctx.fillText(remain, canvas.width / 2, canvas.height / 2);
        ctx.font = 'bold 20px Arial';
        ctx.fillText('3초간 기준 자세를 유지해주세요', canvas.width / 2, canvas.height / 2 + 58);
        ctx.restore();
    }

    if (result.status === 'BASELINE_SIDE_WAIT') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 34px Arial';
        ctx.fillStyle = 'orange';
        ctx.fillText('옆모습으로 돌아와 주세요', canvas.width / 2, canvas.height / 2);
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('돌아오면 기준 측정이 자동으로 이어집니다', canvas.width / 2, canvas.height / 2 + 42);
        ctx.restore();
    }

    if (result.status === 'BASELINE_READY') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px Arial';
        ctx.fillStyle = 'lime';
        ctx.fillText('기준 자세 측정 완료', canvas.width / 2, canvas.height / 2);
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#FFFFFF';
        const baseText = result.baseline && typeof result.baseline.cva === 'number'
            ? `기준 CVA: ${result.baseline.cva.toFixed(1)}°`
            : '이제 스트레칭을 시작하세요';
        ctx.fillText(baseText, canvas.width / 2, canvas.height / 2 + 46);
        ctx.restore();
    }

    if (result.status === 'BASELINE_UNSTABLE') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 34px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText('기준 자세 측정 실패', canvas.width / 2, canvas.height / 2);
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('움직이지 말고 다시 기준 자세 측정을 눌러주세요', canvas.width / 2, canvas.height / 2 + 42);
        ctx.restore();
    }

    ctx.font = 'bold 15px Arial';
    if (result.baseline && typeof result.baseline.cva === 'number') {
        ctx.fillStyle = 'lime';
        ctx.fillText(`기준: 완료 (${result.baseline.cva.toFixed(1)}°)`, 20, result.detailMessage ? 140 : 115);
    } else if (result.status === 'COUNTDOWN') {
        ctx.fillStyle = 'yellow';
        ctx.fillText('기준: 카운트다운 중', 20, result.detailMessage ? 140 : 115);
    } else if (result.status === 'BASELINE') {
        ctx.fillStyle = 'yellow';
        ctx.fillText(`기준: 측정 중 ${Math.round((result.progress || 0) * 100)}%`, 20, result.detailMessage ? 140 : 115);
    } else if (result.status === 'BASELINE_SIDE_WAIT') {
        ctx.fillStyle = 'orange';
        ctx.fillText(`기준: 측정 대기 ${Math.round((result.progress || 0) * 100)}%`, 20, result.detailMessage ? 140 : 115);
    } else if (result.status === 'BASELINE_UNSTABLE') {
        ctx.fillStyle = 'red';
        ctx.fillText('기준: 실패', 20, result.detailMessage ? 140 : 115);
    } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('기준: 미측정', 20, result.detailMessage ? 140 : 115);
    }

    ctx.font = '15px Arial';
    ctx.fillStyle = '#FFFFFF';
    const infoY = result.detailMessage ? 168 : 143;
    if (typeof result.cva === 'number') {
        ctx.fillText(`CVA: ${result.cva.toFixed(1)}°`, 20, infoY);
        ctx.fillText(`SUCCESS: ${result.successCount ?? 0}`, 20, infoY + 25);
    } else {
        ctx.fillText(`SUCCESS: ${result.successCount ?? 0}`, 20, infoY);
    }
}