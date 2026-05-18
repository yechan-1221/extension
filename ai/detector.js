export async function detectPose(detector, video) {

    const poses = await detector.estimatePoses(video);

    return poses;
}