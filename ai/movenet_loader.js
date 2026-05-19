let detector = null;

export async function loadMoveNet() {
    if (detector) return detector;

    // tf가 로드될 때까지 대기
    let retries = 0;
    while (typeof tf === 'undefined' && retries < 20) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
    }

    if (typeof tf === 'undefined') throw new Error('TensorFlow.js 로드 실패');

    await tf.ready();

    detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: 'SinglePose.Lightning' }
    );

    return detector;
}