// extension/param_panel.js

const DEFAULTS = {
    MAX_MOVEMENT:      50,
    FRAME_SKIP:        3,
    MIN_STATE_DURATION: 5000,
    CVA_BUFFER_SIZE:   5,
    SMOOTH_ALPHA:      0.7
};

let current = { ...DEFAULTS };

const DEFS = [
    {
        id: 'param-max-movement', labelId: 'label-max-movement',
        key: 'MAX_MOVEMENT',
        format: v => v
    },
    {
        id: 'param-frame-skip', labelId: 'label-frame-skip',
        key: 'FRAME_SKIP',
        format: v => v
    },
    {
        id: 'param-min-duration', labelId: 'label-min-duration',
        key: 'MIN_STATE_DURATION',
        format: v => (v / 1000).toFixed(1) + 's'
    },
    {
        id: 'param-buffer-size', labelId: 'label-buffer-size',
        key: 'CVA_BUFFER_SIZE',
        format: v => v
    },
    {
        id: 'param-smooth-alpha', labelId: 'label-smooth-alpha',
        key: 'SMOOTH_ALPHA',
        format: v => v
    }
];

let paramTestLog = [];
let isTestMode   = false;

/**
 * 슬라이더 UI를 current 값과 연결하고 버튼 이벤트를 등록합니다.
 * popup.js 초기화 시 한 번 호출합니다.
 */
export function bindParamControls() {
    DEFS.forEach(({ id, labelId, key, format }) => {
        const input = document.getElementById(id);
        const label = document.getElementById(labelId);
        if (!input || !label) return;
        input.value       = current[key];
        label.textContent = format(current[key]);
        input.addEventListener('input', () => {
            current[key]      = +input.value;
            label.textContent = format(current[key]);
        });
    });

    const testToggle = document.getElementById('param-test-mode');
    if (testToggle) {
        testToggle.checked = isTestMode;
        testToggle.addEventListener('change', () => {
            isTestMode = testToggle.checked;
            if (isTestMode) paramTestLog = [];
            const dlBtn = document.getElementById('btn-download-log');
            if (dlBtn) dlBtn.disabled = false;
        });
    }

    const dlBtn = document.getElementById('btn-download-log');
    if (dlBtn) dlBtn.addEventListener('click', downloadParamLog);

    const resetBtn = document.getElementById('btn-reset-params');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            current = { ...DEFAULTS };
            bindParamControls();
        });
    }
}

/**
 * 감지 루프에서 매 프레임 호출해 현재 파라미터 값을 가져옵니다.
 * @returns {{ MAX_MOVEMENT, FRAME_SKIP, MIN_STATE_DURATION,
 *             CVA_BUFFER_SIZE, SMOOTH_ALPHA }}
 */
export function getParams() {
    return { ...current };
}

/**
 * 테스트 모드일 때 프레임별 CVA 데이터를 기록합니다.
 */
export function logParamFrame(rawCva, smoothedCva, pendingState, confirmedState) {
    if (!isTestMode) return;
    paramTestLog.push({
        ts:             Date.now(),
        rawCva:         +rawCva.toFixed(2),
        smoothedCva:    +smoothedCva.toFixed(2),
        pendingState,
        confirmedState
    });
}

function downloadParamLog() {
    if (paramTestLog.length === 0) {
        alert('저장된 테스트 데이터가 없습니다.');
        return;
    }
    const blob = new Blob(
        [JSON.stringify(paramTestLog, null, 2)],
        { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `param_test_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}