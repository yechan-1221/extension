export function smoothPoint(prev, current, alpha=0.7) {

    if (!prev) {
        return current;
    }

    return {
        x: alpha * prev.x + (1 - alpha) * current.x,
        y: alpha * prev.y + (1 - alpha) * current.y
    };
}