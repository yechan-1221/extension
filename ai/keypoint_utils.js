export function getKeypointByName(keypoints, name) {

    return keypoints.find(k => k.name === name);
}