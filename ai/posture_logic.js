// extension/ai/posture_logic.js

// [개선 3] Confidence 기준값 0.5 → 0.4으로 낮춰 인식률 향상
const CONF_THRESHOLD = 0.4;

// 전략 1 — 사이드 히스테리시스
// 반대쪽 score가 이 값만큼 확실히 높을 때만 전환 (0.0~1.0)
const SIDE_MARGIN = 0.15;

let lockedSide = null;   // 'LEFT' | 'RIGHT' | null

export function resetSideLock() {
    lockedSide = null;   // 카메라 재시작 시 popup.js에서 호출
}

export function getBestSidePoints(keypoints) {
    const leftEar       = keypoints.find(k => k.name === 'left_ear');
    const rightEar      = keypoints.find(k => k.name === 'right_ear');
    const leftShoulder  = keypoints.find(k => k.name === 'left_shoulder');
    const rightShoulder = keypoints.find(k => k.name === 'right_shoulder');

    if (!leftEar || !rightEar || !leftShoulder || !rightShoulder) return null;

    const leftScore  = (leftEar.score  + leftShoulder.score)  / 2;
    const rightScore = (rightEar.score + rightShoulder.score) / 2;

    // 전략 1: 잠긴 사이드가 없으면 초기 선택
    if (lockedSide === null) {
        lockedSide = leftScore >= rightScore ? 'LEFT' : 'RIGHT';
    } else {
        // 히스테리시스 — SIDE_MARGIN만큼 확실히 더 높을 때만 전환
        if (lockedSide === 'LEFT'  && rightScore > leftScore  + SIDE_MARGIN) lockedSide = 'RIGHT';
        if (lockedSide === 'RIGHT' && leftScore  > rightScore + SIDE_MARGIN) lockedSide = 'LEFT';
    }

    if (lockedSide === 'LEFT') {
        return {
            side:   'LEFT',
            ear:      leftEar,
            shoulder: leftShoulder,
            confOk:   leftEar.score > CONF_THRESHOLD && leftShoulder.score > CONF_THRESHOLD
        };
    } else {
        return {
            side:   'RIGHT',
            ear:      rightEar,
            shoulder: rightShoulder,
            confOk:   rightEar.score > CONF_THRESHOLD && rightShoulder.score > CONF_THRESHOLD
        };
    }
}


export function calculateCVA(ear, shoulder) {
    const dx = ear.x - shoulder.x;
    const dy = shoulder.y - ear.y;
    const angle = Math.atan2(Math.abs(dx), dy) * (180 / Math.PI);
    return 90 - angle;
}

// [개선 5] 경계값에서 상태가 깜빡이는 것을 막아주는 Hysteresis 함수
export function applyHysteresis(cva, prevState) {
    if (prevState === "NORMAL") {
        if (cva < 51) return "SEVERE_FHP";
        return "NORMAL";
    } else if (prevState === "SEVERE_FHP") {
        if (cva > 54) return "NORMAL";
        return "SEVERE_FHP";
    }
    return "NORMAL";
}