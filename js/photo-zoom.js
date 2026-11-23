export const PHOTO_ZOOM_MIN = 1;
export const PHOTO_ZOOM_MAX = 4;

export function initialPhotoZoom() {
    return { scale: PHOTO_ZOOM_MIN, x: 0, y: 0 };
}

export function clampScale(scale) {
    const value = Number(scale);
    if (!Number.isFinite(value)) return PHOTO_ZOOM_MIN;
    return Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, value));
}

function clampAxis(value, limit) {
    const span = Math.max(0, Number(limit) || 0);
    if (span === 0) return 0;
    const next = Number(value) || 0;
    return Math.min(span, Math.max(-span, next));
}

export function clampPan(state, baseWidth, baseHeight, frameWidth, frameHeight) {
    const scale = clampScale(state && state.scale);
    const limitX = Math.max(0, ((Number(baseWidth) || 0) * scale - (Number(frameWidth) || 0)) / 2);
    const limitY = Math.max(0, ((Number(baseHeight) || 0) * scale - (Number(frameHeight) || 0)) / 2);
    return {
        scale,
        x: clampAxis(state && state.x, limitX),
        y: clampAxis(state && state.y, limitY),
    };
}

export function zoomGesture(state, nextScale, fromX, fromY, toX, toY, baseWidth, baseHeight, frameWidth, frameHeight) {
    const current = state && typeof state === "object" ? state : initialPhotoZoom();
    const scale = clampScale(nextScale);
    const old = clampScale(current.scale) || PHOTO_ZOOM_MIN;
    const originX = Number(fromX) || 0;
    const originY = Number(fromY) || 0;
    const imageX = (originX - (Number(current.x) || 0)) / old;
    const imageY = (originY - (Number(current.y) || 0)) / old;
    return clampPan({
        scale,
        x: (Number(toX) || 0) - imageX * scale,
        y: (Number(toY) || 0) - imageY * scale,
    }, baseWidth, baseHeight, frameWidth, frameHeight);
}

export function panPhoto(state, dx, dy, baseWidth, baseHeight, frameWidth, frameHeight) {
    const current = state && typeof state === "object" ? state : initialPhotoZoom();
    return clampPan({
        scale: current.scale,
        x: (Number(current.x) || 0) + (Number(dx) || 0),
        y: (Number(current.y) || 0) + (Number(dy) || 0),
    }, baseWidth, baseHeight, frameWidth, frameHeight);
}

export function pinchScale(startScale, startDistance, distance) {
    if (!(Number(startDistance) > 0) || !(Number(distance) > 0)) return clampScale(startScale);
    return clampScale((Number(startScale) || PHOTO_ZOOM_MIN) * (Number(distance) / Number(startDistance)));
}

export function pointDistance(a, b) {
    const dx = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
    const dy = (Number(a && a.y) || 0) - (Number(b && b.y) || 0);
    return Math.hypot(dx, dy);
}
