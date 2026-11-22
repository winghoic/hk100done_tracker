export const ACTIVE_RECORDING_KEY = "hk100_active_recording_v1";
export const RECORDING_MAX_AGE_MS = 18 * 60 * 60 * 1000;
export const BACKGROUND_NOTE_AFTER_MS = 2000;
export const FIX_STALE_MS = 8000;

export const BACKGROUND_RECORDING_NOTE =
    "Page was in the background. The track already recorded is kept, and GPS is on again.";
export const RESTORED_RECORDING_NOTE =
    "Recording restored on this device. GPS is on again.";
export const PAUSED_RECORDING_NOTE =
    "Recording restored on this device. It is still paused.";

export function elapsedSeconds(startMs, nowMs) {
    const start = Number(startMs);
    const now = Number(nowMs);
    if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) return 0;
    return Math.floor((now - start) / 1000);
}

export function fixIsStale(lastFixAt, nowMs, staleMs = FIX_STALE_MS) {
    const last = Number(lastFixAt);
    const now = Number(nowMs);
    if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(now)) return true;
    return now - last >= staleMs;
}

export function recordingResumePlan({ tracking, paused, visibility, hiddenMs = 0 } = {}) {
    const active = tracking === true && paused !== true;
    const visible = visibility === "visible";
    const away = Math.max(0, Number(hiddenMs) || 0);
    return {
        refreshClock: active && visible,
        rearmWatch: visible && away > 0,
        requestFix: active && visible && away > 0,
        wakeLock: active && visible,
        backgroundNote: active && visible && away >= BACKGROUND_NOTE_AFTER_MS,
    };
}

export function snapshotRecording(state, now = Date.now()) {
    const source = state && typeof state === "object" ? state : {};
    const paused = source.paused === true;
    const tracking = source.tracking === true && !paused;
    return {
        v: 1,
        positions: normalizePositions(source.positions),
        distance: finite(source.distance),
        startTime: finite(source.startTime) || finite(now),
        duration: Math.max(0, Math.floor(finite(source.duration))),
        tracking,
        paused,
        savedAt: finite(now),
    };
}

export function serializeRecording(state, now = Date.now()) {
    return JSON.stringify(snapshotRecording(state, now));
}

export function parseRecordingSnapshot(raw, now = Date.now(), maxAgeMs = RECORDING_MAX_AGE_MS) {
    let data = raw;
    if (typeof raw === "string") {
        if (!raw) return null;
        try {
            data = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!data || data.v !== 1) return null;
    const savedAt = Number(data.savedAt);
    const nowMs = finite(now) || Date.now();
    if (!Number.isFinite(savedAt)) return null;
    if (savedAt > nowMs + 60 * 1000) return null;
    if (nowMs - savedAt > maxAgeMs) return null;
    const snap = snapshotRecording(data, savedAt);
    if (!snap.tracking && !snap.paused) return null;
    return snap;
}

export function writeActiveRecording(stores, state, now = Date.now()) {
    const idle = !state || (state.tracking !== true && state.paused !== true);
    if (idle) {
        clearActiveRecording(stores);
        return { ok: true, stored: false };
    }
    const json = serializeRecording(state, now);
    let stored = false;
    for (const store of stores || []) {
        if (!store || typeof store.setItem !== "function") continue;
        try {
            store.setItem(ACTIVE_RECORDING_KEY, json);
            stored = true;
        } catch {
            /* quota or private mode */
        }
    }
    return { ok: stored, stored, json };
}

export function readActiveRecording(stores, now = Date.now()) {
    for (const store of stores || []) {
        if (!store || typeof store.getItem !== "function") continue;
        let raw = null;
        try {
            raw = store.getItem(ACTIVE_RECORDING_KEY);
        } catch {
            continue;
        }
        if (!raw) continue;
        const parsed = parseRecordingSnapshot(raw, now);
        if (parsed) return parsed;
    }
    return null;
}

export function clearActiveRecording(stores) {
    for (const store of stores || []) {
        if (!store || typeof store.removeItem !== "function") continue;
        try {
            store.removeItem(ACTIVE_RECORDING_KEY);
        } catch {
            /* private mode */
        }
    }
}

function normalizePositions(points) {
    if (!Array.isArray(points)) return [];
    const normalized = [];
    for (const point of points) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        normalized.push([lat, lng]);
    }
    return normalized;
}

function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
