// extension/ai/chin_tuck_logic.js

// MoveNet 측면 촬영 기준의 간단한 스트레칭(턱당기기) 검증 로직입니다.
// 별도 학습 모델 없이, 사용자가 버튼을 누른 뒤 측정한 기준 자세 대비 CVA 증가/머리 전방 이동 감소를 확인합니다.

const BASELINE_DELAY_MS = 3000;      // 버튼 클릭 후 기준 자세 측정 전 대기 시간
const BASELINE_FRAMES = 18;          // 3초 뒤 실제 기준 자세 평균을 낼 프레임 수
const MIN_IMPROVEMENT_DEG = 4;       // CVA만으로 충분히 좋아졌다고 볼 최소 개선량
const MIN_RETRACTION_PX = 10;        // 머리 위치만으로 충분히 뒤로 들어왔다고 볼 최소 감소량
const MIN_COMBINED_IMPROVEMENT_DEG = 2.5; // CVA+머리 이동을 함께 볼 때의 최소 CVA 개선량
const MIN_COMBINED_RETRACTION_PX = 6;   // CVA+머리 이동을 함께 볼 때의 최소 머리 이동 감소량
const HOLD_DURATION_MS = 5000;       // 성공 판정을 위한 유지 시간
const RESET_TOLERANCE_DEG = 2;       // 원위치 복귀 감지 CVA 여유값
const RESET_RETRACTION_PX = 4;       // 원위치 복귀 감지 머리 이동 여유값
const MAX_BASELINE_CVA_RANGE = 14;   // 기준 측정 중 CVA 흔들림 허용치
const ALMOST_IMPROVEMENT_DEG = 1.5;    // GOOD 전 단계로 볼 최소 CVA 개선량
const ALMOST_RETRACTION_PX = 4;      // GOOD 전 단계로 볼 최소 머리 이동 감소량
const GOOD_DISPLAY_MS = 800;         // GOOD 진입 직후 안내를 보여주는 시간
const HOLD_GRACE_MS = 900;           // 순간적인 keypoint 흔들림 때문에 HOLD가 바로 끊기지 않도록 허용하는 시간
const SIDE_GRACE_MS = 700;           // 측면 판정이 순간적으로 흔들려도 HOLD가 바로 끊기지 않도록 허용하는 시간

// 시간 계산은 프레임 수가 아니라 실제 경과 시간(performance.now) 기준으로 처리합니다.
// MoveNet FPS가 순간적으로 떨어져도 3초 카운트다운/5초 유지 판정 시간이 늘어나지 않도록 하기 위함입니다.

let baselineSamples = [];
let baseline = null;
let baselineRequestTime = null;  // performance.now() 기준
let holdStartTime = null;      // performance.now() 기준
let successCount = 0;
let lastStatus = 'WAITING';
let waitingForReturn = false;
let lastGoodTime = null;
let notSideStartTime = null;
let baselineReadyUntil = null;

export function resetChinTuckState() {
    baselineSamples = [];
    baseline = null;
    baselineRequestTime = null;
    holdStartTime = null;
    successCount = 0;
    lastStatus = 'WAITING';
    waitingForReturn = false;
    lastGoodTime = null;
    notSideStartTime = null;
    baselineReadyUntil = null;
}

// 사용자가 “기준 자세 측정” 버튼을 눌렀을 때 호출합니다.
// 기존 기준값은 버리고 3초 카운트다운 뒤 다시 기준 자세를 잡습니다.
export function requestChinTuckBaseline() {
    baselineSamples = [];
    baseline = null;
    baselineRequestTime = performance.now();
    holdStartTime = null;
    // 기준 자세를 새로 잡으면 이전 기준으로 계산된 성공 횟수와 섞이지 않도록 초기화합니다.
    successCount = 0;
    lastStatus = 'COUNTDOWN';
    waitingForReturn = false;
    lastGoodTime = null;
    notSideStartTime = null;
    baselineReadyUntil = null;
}

export function hasChinTuckBaseline() {
    return Boolean(baseline);
}

function getHeadForwardPx(ear, shoulder) {
    return Math.abs(ear.x - shoulder.x);
}

export function evaluateChinTuck({ ear, shoulder, cva, poseQuality = { isSideView: true } }) {
    const now = performance.now();
    const headForwardPx = getHeadForwardPx(ear, shoulder);

    // 아직 사용자가 기준 자세 측정 버튼을 누르지 않은 상태
    if (!baselineRequestTime && !baseline) {
        return {
            status: 'WAITING',
            message: '옆모습으로 앉은 뒤 기준 자세 측정 버튼을 누르세요',
            progress: 0,
            baseline,
            cva,
            headForwardPx,
            successCount,
            holdSeconds: 0
        };
    }

    // 버튼 클릭 후 3초 카운트다운
    if (!baseline && baselineRequestTime) {
        const elapsedMs = now - baselineRequestTime;
        const remainSeconds = Math.max(0, Math.ceil((BASELINE_DELAY_MS - elapsedMs) / 1000));

        if (elapsedMs < BASELINE_DELAY_MS) {
            return {
                status: 'COUNTDOWN',
                message: `기준 자세 측정까지 ${remainSeconds}초`,
                detailMessage: '3초간 기준 자세를 유지해주세요',
                progress: Math.min(1, elapsedMs / BASELINE_DELAY_MS),
                baseline,
                cva,
                headForwardPx,
                successCount,
                holdSeconds: 0
            };
        }

        // 3초가 지난 뒤부터 기준 자세 샘플을 모읍니다.
        // 이 시점부터는 측면 자세일 때만 샘플을 추가합니다.
        // 단, 중간에 잠깐 정면으로 돌아가거나 측면 판정이 흔들려도 기준 측정을 실패시키지 않고
        // 현재까지 모은 샘플을 유지한 채 옆모습으로 돌아올 때까지 기다립니다.
        if (!poseQuality.isSideView) {
            holdStartTime = null;
            return {
                status: 'BASELINE_SIDE_WAIT',
                feedbackLabel: 'WAIT',
                message: '측면 자세가 확인되면 기준 측정이 이어집니다',
                detailMessage: '정면에 가까우면 기준 자세로 저장하지 않습니다',
                progress: Math.min(1, baselineSamples.length / BASELINE_FRAMES),
                baseline,
                cva,
                headForwardPx,
                successCount,
                holdSeconds: 0,
                poseQuality
            };
        }

        baselineSamples.push({ cva, headForwardPx });

        if (baselineSamples.length >= BASELINE_FRAMES) {
            const cvaValues = baselineSamples.map(item => item.cva);
            const cvaRange = Math.max(...cvaValues) - Math.min(...cvaValues);

            if (cvaRange > MAX_BASELINE_CVA_RANGE) {
                baselineSamples = [];
                baseline = null;
                baselineRequestTime = null;
                holdStartTime = null;
                lastStatus = 'BASELINE_UNSTABLE';
                return {
                    status: 'BASELINE_UNSTABLE',
                    message: '기준 자세가 많이 흔들렸습니다. 옆모습을 유지하고 다시 측정해주세요',
                    progress: 0,
                    baseline,
                    cva,
                    headForwardPx,
                    successCount,
                    holdSeconds: 0
                };
            }

            baseline = baselineSamples.reduce((acc, item) => {
                acc.cva += item.cva;
                acc.headForwardPx += item.headForwardPx;
                return acc;
            }, { cva: 0, headForwardPx: 0 });

            baseline.cva /= baselineSamples.length;
            baseline.headForwardPx /= baselineSamples.length;
            // 새 기준 자세가 확정되면 성공 횟수도 새 기준에 맞춰 0부터 다시 셉니다.
            successCount = 0;
            lastStatus = 'READY';
            baselineReadyUntil = now + 2000;
            return {
                status: 'BASELINE_READY',
                feedbackLabel: 'READY',
                message: '기준 자세 측정 완료',
                detailMessage: `기준 CVA: ${baseline.cva.toFixed(1)}° / 이제 스트레칭을 시작하세요`,
                progress: 1,
                baseline,
                cva,
                headForwardPx,
                successCount,
                holdSeconds: 0
            };
        }

        return {
            status: 'BASELINE',
            message: '3초간 기준 자세를 유지해주세요',
            detailMessage: '움직이지 말고 옆모습 기본 자세를 유지하세요',
            progress: Math.min(1, baselineSamples.length / BASELINE_FRAMES),
            baseline,
            cva,
            headForwardPx,
            successCount,
            holdSeconds: 0
        };
    }

    // 기준 자세가 막 저장된 직후에는 완료 메시지를 잠깐 보여줍니다.
    if (baselineReadyUntil && now < baselineReadyUntil) {
        return {
            status: 'BASELINE_READY',
            feedbackLabel: 'READY',
            message: '기준 자세 측정 완료',
            detailMessage: `기준 CVA: ${baseline.cva.toFixed(1)}° / 이제 스트레칭을 시작하세요`,
            progress: 1,
            baseline,
            cva,
            headForwardPx,
            successCount,
            holdSeconds: 0
        };
    }

    // 기준 자세 측정이 끝난 뒤의 스트레칭 성공 판정도 측면 자세에서만 허용합니다.
    // 다만 MoveNet keypoint가 1~2프레임 흔들리는 것만으로 HOLD가 바로 끊기지 않게 짧은 여유 시간을 둡니다.
    if (!poseQuality.isSideView) {
        if (!notSideStartTime) notSideStartTime = now;
        const notSideMs = now - notSideStartTime;

        if (holdStartTime && notSideMs < SIDE_GRACE_MS) {
            return {
                status: 'HOLD',
                feedbackLabel: 'HOLD',
                message: 'HOLD: 측면을 유지하면서 자세를 잡아주세요',
                detailMessage: '측면 판정이 잠깐 흔들렸지만 유지 시간은 이어집니다',
                progress: Math.min(1, (now - holdStartTime) / HOLD_DURATION_MS),
                baseline,
                cva,
                headForwardPx,
                successCount,
                holdSeconds: (now - holdStartTime) / 1000,
                poseQuality
            };
        }

        holdStartTime = null;
        lastGoodTime = null;
        return {
            status: 'NOT_SIDE_VIEW',
            message: '측면 자세가 아닙니다. 옆모습으로 앉아주세요',
            progress: 0,
            baseline,
            cva,
            headForwardPx,
            successCount,
            holdSeconds: 0,
            poseQuality
        };
    }
    notSideStartTime = null;

    const cvaImprovement = cva - baseline.cva;
    const retractionPx = baseline.headForwardPx - headForwardPx;
    const returnedToBase = cvaImprovement <= RESET_TOLERANCE_DEG && retractionPx <= RESET_RETRACTION_PX;

    // 성공 후에는 같은 자세를 계속 유지하는 것만으로 성공 횟수가 반복 증가하지 않게 막습니다.
    // 반드시 기준 자세 근처로 한 번 돌아온 뒤 다음 횟수를 인정합니다.
    if (waitingForReturn) {
        holdStartTime = null;
        if (returnedToBase) {
            waitingForReturn = false;
            lastStatus = 'READY';
            return {
                status: 'READY',
                message: '다시 턱을 뒤로 당겨주세요',
                progress: 0,
                baseline,
                cva,
                headForwardPx,
                cvaImprovement,
                retractionPx,
                successCount,
                holdSeconds: 0
            };
        }

        return {
            status: 'RETURN',
            message: '다음 횟수를 위해 기본 자세로 돌아오세요',
            progress: 0,
            baseline,
            cva,
            headForwardPx,
            cvaImprovement,
            retractionPx,
            successCount,
            holdSeconds: 0
        };
    }

    // 스트레칭 피드백은 WRONG / ALMOST / GOOD / HOLD / SUCCESS / RETURN 단계로 나눕니다.
    // GOOD 판정 기준:
    // 1) CVA가 5도 이상 확실히 좋아졌거나
    // 2) CVA가 3도 이상 좋아지고 머리-어깨 수평거리도 8px 이상 줄어들었거나
    // 3) 머리-어깨 수평거리가 12px 이상 줄고 CVA가 나빠지지 않은 경우
    const strongCvaImprovement = cvaImprovement >= MIN_IMPROVEMENT_DEG;
    const combinedImprovement = cvaImprovement >= MIN_COMBINED_IMPROVEMENT_DEG &&
                                retractionPx >= MIN_COMBINED_RETRACTION_PX;
    const strongRetraction = retractionPx >= MIN_RETRACTION_PX &&
                             cvaImprovement >= 0;
    const isGoodTuck = strongCvaImprovement || combinedImprovement || strongRetraction;

    if (isGoodTuck) {
        if (!holdStartTime) holdStartTime = now;
        lastGoodTime = now;
    }

    // GOOD 상태에서 keypoint가 잠깐 흔들리면 바로 0초로 리셋하지 않고 0.9초까지 유지합니다.
    // 그래서 실제로 자세를 유지하고 있는데 SUCCESS가 안 올라가는 문제를 줄입니다.
    const canKeepHolding = holdStartTime && lastGoodTime && (now - lastGoodTime <= HOLD_GRACE_MS);

    if (holdStartTime && (isGoodTuck || canKeepHolding)) {
        const holdMs = now - holdStartTime;

        if (holdMs >= HOLD_DURATION_MS) {
            successCount += 1;
            holdStartTime = null;
            lastGoodTime = null;
            waitingForReturn = true;
            lastStatus = 'SUCCESS';
            return {
                status: 'SUCCESS',
                feedbackLabel: 'SUCCESS',
                message: `좋습니다! ${successCount}회 성공`,
                detailMessage: '다음 횟수를 위해 기본 자세로 돌아오세요',
                progress: 1,
                baseline,
                cva,
                headForwardPx,
                cvaImprovement,
                retractionPx,
                successCount,
                holdSeconds: HOLD_DURATION_MS / 1000
            };
        }

        const status = holdMs < GOOD_DISPLAY_MS ? 'GOOD' : 'HOLD';
        lastStatus = status;
        return {
            status,
            feedbackLabel: status,
            message: status === 'GOOD' ? 'GOOD: 좋은 자세입니다' : `HOLD: ${(holdMs / 1000).toFixed(1)} / 5초 유지 중`,
            detailMessage: isGoodTuck ? '그 자세를 유지하세요' : '조금 흔들렸습니다. 같은 자세를 다시 잡아주세요',
            progress: Math.min(1, holdMs / HOLD_DURATION_MS),
            baseline,
            cva,
            headForwardPx,
            cvaImprovement,
            retractionPx,
            successCount,
            holdSeconds: holdMs / 1000
        };
    }

    holdStartTime = null;
    lastGoodTime = null;

    const almostByCva = cvaImprovement >= ALMOST_IMPROVEMENT_DEG;
    const almostByRetraction = retractionPx >= ALMOST_RETRACTION_PX;
    const isAlmost = almostByCva || almostByRetraction;

    if (isAlmost) {
        lastStatus = 'ALMOST';
        let detailMessage = '조금만 더 턱을 뒤로 당기고 목을 길게 세워보세요';

        if (cvaImprovement < MIN_COMBINED_IMPROVEMENT_DEG && retractionPx >= ALMOST_RETRACTION_PX) {
            detailMessage = '머리는 들어왔지만 CVA 개선이 부족합니다. 목을 길게 세워보세요';
        } else if (cvaImprovement >= ALMOST_IMPROVEMENT_DEG && retractionPx < MIN_COMBINED_RETRACTION_PX) {
            detailMessage = 'CVA는 좋아졌지만 머리를 어깨 쪽으로 조금 더 뒤로 당겨보세요';
        }

        return {
            status: 'ALMOST',
            feedbackLabel: 'ALMOST',
            message: 'ALMOST: 거의 맞았습니다',
            detailMessage,
            progress: 0,
            baseline,
            cva,
            headForwardPx,
            cvaImprovement,
            retractionPx,
            successCount,
            holdSeconds: 0
        };
    }

    lastStatus = 'WRONG';
    return {
        status: 'WRONG',
        feedbackLabel: 'WRONG',
        message: 'WRONG: 아직 스트레칭 자세가 아닙니다',
        detailMessage: returnedToBase
            ? '기준 자세입니다. 턱을 뒤로 당겨보세요'
            : '기준보다 좋아지지 않았습니다. 얼굴을 돌리지 말고 측면 상태를 유지하세요',
        progress: 0,
        baseline,
        cva,
        headForwardPx,
        cvaImprovement,
        retractionPx,
        successCount,
        holdSeconds: 0
    };
}
