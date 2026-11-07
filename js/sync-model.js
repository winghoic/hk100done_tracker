export const GUEST_STORAGE_KEY = "hk100_guest_v1";
export const USER_STORAGE_PREFIX = "hk100_user_v1_";
export const LEGACY_APP_ID = "default-app-id";
export const CLOUD_HIKE_CHAR_BUDGET = 800000;

const REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "appId"];

export function emptyState() {
    return {
        completedChallenges: {},
        completionDates: {},
        challengeMeta: {},
        hikes: [],
    };
}

export function isFirebaseConfigReady(config) {
    if (!config || config.enabled !== true) return false;
    return REQUIRED_CONFIG_KEYS.every((key) => isFilledConfigValue(config[key]));
}

export function toFirebaseAppConfig(config) {
    const source = config && typeof config === "object" ? config : {};
    const appConfig = {};
    for (const [key, value] of Object.entries(source)) {
        if (key === "enabled") continue;
        if (value == null) continue;
        const text = String(value).trim();
        if (!text) continue;
        appConfig[key] = text;
    }
    return appConfig;
}

export function userStorageKey(uid) {
    return USER_STORAGE_PREFIX + String(uid || "").trim();
}

export function createHikeId(now = Date.now(), rand = Math.random()) {
    const stamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const token = Math.floor(Math.abs(Number(rand)) * 1e9).toString(36);
    return `hike_${stamp}_${token || "0"}`;
}

export function normalizeState(input) {
    const source = input && typeof input === "object" ? input : {};
    const completedFromMeta = {};
    const datesFromMeta = {};
    const challengeMeta = normalizeMeta(source.challengeMeta);

    for (const [id, entry] of Object.entries(challengeMeta)) {
        if (entry.done) {
            completedFromMeta[id] = true;
            if (entry.date) datesFromMeta[id] = entry.date;
        }
    }

    const completedChallenges = Object.keys(challengeMeta).length
        ? completedFromMeta
        : normalizeCompleted(source.completedChallenges);
    const completionDates = Object.keys(challengeMeta).length
        ? datesFromMeta
        : normalizeDates(source.completionDates);

    if (!Object.keys(challengeMeta).length) {
        for (const [id, done] of Object.entries(completedChallenges)) {
            challengeMeta[id] = {
                done: done === true,
                date: completionDates[id] || "",
                updatedAt: 0,
            };
        }
    }

    const seen = new Set();
    const hikes = [];
    const list = Array.isArray(source.hikes) ? source.hikes : [];
    for (const hike of list) {
        const normalized = normalizeHike(hike);
        if (!normalized || seen.has(normalized.id)) continue;
        seen.add(normalized.id);
        hikes.push(normalized);
    }
    hikes.sort(compareHikesDesc);

    return { completedChallenges, completionDates, challengeMeta, hikes };
}

export function isMeaningfulState(state) {
    const normalized = normalizeState(state);
    return Object.keys(normalized.completedChallenges).length > 0 || normalized.hikes.length > 0 || hasTombstone(normalized);
}

export function statesEqual(left, right) {
    return JSON.stringify(normalizeState(left)) === JSON.stringify(normalizeState(right));
}

export function visibleFingerprint(state) {
    const normalized = normalizeState(state);
    return JSON.stringify({
        completedChallenges: normalized.completedChallenges,
        completionDates: normalized.completionDates,
        hikes: normalized.hikes.map(visibleHike),
    });
}

export function readGuestState(storage) {
    const primary = readKey(storage, GUEST_STORAGE_KEY);
    if (primary.present) return primary.state;

    const progress = readKey(storage, `hk100_progress_${LEGACY_APP_ID}`);
    const history = readKey(storage, `hk100_history_${LEGACY_APP_ID}`);
    if (!progress.present && !history.present) return emptyState();

    const progressBody = progress.value && typeof progress.value === "object" ? progress.value : {};
    return normalizeState({
        completedChallenges: progressBody.completedChallenges,
        completionDates: progressBody.completionDates,
        hikes: Array.isArray(history.value) ? history.value : [],
    });
}

export function readUserCache(storage, uid) {
    return readKey(storage, userStorageKey(uid)).state;
}

export function writeStoredState(storage, key, state) {
    storage.setItem(key, JSON.stringify(normalizeState(state)));
}

export function mergeByRecency(base, incoming) {
    const left = normalizeState(base);
    const right = normalizeState(incoming);
    const hikes = new Map(left.hikes.map((hike) => [hike.id, hike]));
    for (const hike of right.hikes) {
        const existing = hikes.get(hike.id);
        hikes.set(hike.id, existing ? newerHike(existing, hike) : hike);
    }
    const challengeMeta = mergeMeta(left.challengeMeta, right.challengeMeta);
    return stateFromParts(challengeMeta, [...hikes.values()]);
}

export function applyUiEdits(canonical, shown, ui) {
    const base = normalizeState(canonical);
    const before = readVisible(shown);
    const after = readVisible(ui);
    const hikes = new Map(base.hikes.map((hike) => [hike.id, hike]));
    const beforeById = new Map(before.hikes.map((hike) => [hike.id, hike]));
    const afterIds = new Set(after.hikes.map((hike) => hike.id));

    for (const hike of after.hikes) {
        const previous = beforeById.get(hike.id);
        if (!previous) {
            hikes.set(hike.id, hike);
            continue;
        }
        if (visibleHike(previous) !== visibleHike(hike)) {
            const current = hikes.get(hike.id) || previous;
            hikes.set(hike.id, hydrateHike({ ...current, ...hike, id: hike.id }, current));
        }
    }
    for (const id of beforeById.keys()) {
        if (!afterIds.has(id)) hikes.delete(id);
    }

    const completedChallenges = { ...base.completedChallenges };
    const completionDates = { ...base.completionDates };
    const weekIds = new Set([
        ...Object.keys(before.completedChallenges),
        ...Object.keys(after.completedChallenges),
    ]);
    for (const id of weekIds) {
        const beforeDone = before.completedChallenges[id] === true;
        const afterDone = after.completedChallenges[id] === true;
        const beforeDate = before.completionDates[id] || "";
        const afterDate = after.completionDates[id] || "";
        if (beforeDone === afterDone && beforeDate === afterDate) continue;
        if (afterDone) {
            completedChallenges[id] = true;
            if (afterDate) completionDates[id] = afterDate;
            else delete completionDates[id];
        } else {
            delete completedChallenges[id];
            delete completionDates[id];
        }
    }

    return {
        completedChallenges,
        completionDates,
        hikes: [...hikes.values()],
    };
}

export function stampState(previous, next, now) {
    const prev = normalizeState(previous);
    const incoming = readVisible(next);
    const stamp = Number(now) || 0;
    const previousHikes = new Map(prev.hikes.map((hike) => [hike.id, hike]));
    const hikes = incoming.hikes.map((hike) => {
        const old = previousHikes.get(hike.id);
        const changed = !old || visibleHike(old) !== visibleHike(hike);
        return {
            ...hike,
            updatedAt: changed ? stamp : Number(old.updatedAt) || stamp,
        };
    });

    const meta = { ...prev.challengeMeta };
    const weekIds = new Set([
        ...Object.keys(prev.completedChallenges),
        ...Object.keys(incoming.completedChallenges),
        ...Object.keys(meta),
    ]);
    for (const id of weekIds) {
        const wasDone = prev.completedChallenges[id] === true;
        const isDone = incoming.completedChallenges[id] === true;
        const wasDate = prev.completionDates[id] || "";
        const isDate = incoming.completionDates[id] || "";
        if (wasDone !== isDone || wasDate !== isDate) {
            meta[id] = { done: isDone, date: isDone ? isDate : "", updatedAt: stamp };
        } else if (!meta[id]) {
            meta[id] = { done: isDone, date: isDone ? isDate : "", updatedAt: 0 };
        }
    }

    return stateFromParts(meta, hikes);
}

export function planAccountLoad({ guest, cache, cloud, now, uid }) {
    const guestState = normalizeState(guest);
    const cacheState = normalizeState(cache);
    const cloudState = normalizeState(cloud);
    let state = mergeByRecency(cloudState, cacheState);
    const guestMeaningful = isMeaningfulState(guestState);
    if (guestMeaningful) state = mergeByRecency(state, guestState);

    const cloudMeaningful = isMeaningfulState(cloudState);
    const upload = !statesEqual(state, cloudState);
    let reason = "synced";
    if (upload && guestMeaningful && !cloudMeaningful) reason = "migrated";
    else if (upload && guestMeaningful && cloudMeaningful) reason = "merged";
    else if (upload) reason = "uploaded";

    const backup = upload
        ? buildBackup({
            reason,
            createdAt: Number(now) || 0,
            uid,
            guest: guestState,
            cache: cacheState,
            cloud: cloudState,
        })
        : null;

    return {
        state,
        upload,
        backup,
        clearGuest: guestMeaningful,
        reason,
    };
}

export function buildBackup({ reason, createdAt, uid, guest, cache, cloud }) {
    return {
        reason,
        createdAt,
        uid: String(uid || ""),
        guest: shrinkState(guest),
        cache: shrinkState(cache),
        cloud: shrinkState(cloud),
    };
}

export function shrinkState(state) {
    const normalized = normalizeState(state);
    return {
        ...normalized,
        hikes: normalized.hikes.map((hike) => shrinkHikeForCloud(hike)),
    };
}

export function shrinkHikeForCloud(hike, maxChars = CLOUD_HIKE_CHAR_BUDGET) {
    const next = { ...normalizeHike(hike) };
    if (!next) return hike;
    if (serializedLength(next) > maxChars && next.photo) {
        next.photo = null;
        next.photoOmitted = true;
    }
    if (serializedLength(next) > maxChars && next.points.length) {
        next.pointCount = next.points.length;
        next.points = [];
        next.pointsOmitted = true;
    }
    return next;
}

export function cloudDocumentPlan(uid, previousHikeIds, state) {
    const safeUid = String(uid || "").trim();
    const normalized = shrinkState(state);
    const hikeIds = normalized.hikes.map((hike) => hike.id);
    const previous = new Set((previousHikeIds || []).map((id) => String(id)));
    return {
        profilePath: ["users", safeUid],
        progressPath: ["users", safeUid, "tracker", "progress"],
        progress: {
            completedChallenges: normalized.completedChallenges,
            completionDates: normalized.completionDates,
            challengeMeta: normalized.challengeMeta,
            updatedAt: newestStamp(normalized),
        },
        hikes: normalized.hikes.map((hike) => ({
            path: ["users", safeUid, "hikes", hike.id],
            data: hike,
        })),
        deleteHikePaths: [...previous]
            .filter((id) => !hikeIds.includes(id))
            .map((id) => ["users", safeUid, "hikes", id]),
        backupCollectionPath: ["users", safeUid, "backups"],
    };
}

export function explainAuthError(error) {
    const code = error?.code || "";
    switch (code) {
        case "auth/unauthorized-domain":
            return "This site is not an authorized domain for the Firebase project. Add the GitHub Pages host winghoic.github.io with no path, then try Google sign-in again.";
        case "auth/popup-blocked":
            return "The browser blocked the Google window. Allow popups for this site, or stay on the page while sign-in continues.";
        case "auth/operation-not-supported-in-this-environment":
            return "This browser cannot open Google sign-in. Open the tracker in Safari, Chrome, or Firefox instead of an in-app browser.";
        case "auth/network-request-failed":
            return "Google sign-in could not reach the network. Check the connection and try again. Hikes already on this device are unchanged.";
        case "auth/web-storage-unsupported":
            return "This browser is blocking site storage, so Google sign-in cannot keep you signed in.";
        case "auth/account-exists-with-different-credential":
            return "An account already exists for that email with a different sign-in method.";
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
            return "";
        default:
            return "Google sign-in did not finish. Hikes already on this device are unchanged.";
    }
}

export function isSilentAuthError(error) {
    const code = error?.code || "";
    return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}

export function shouldFallbackToRedirect(error) {
    const code = error?.code || "";
    return code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment";
}

export function explainSyncError(error) {
    const code = error?.code || "";
    const message = String(error?.message || "");
    if (code === "permission-denied" || /insufficient permissions|permission-denied/i.test(message)) {
        return "Saved on this device. Cloud save was denied. Enable Google sign-in and deploy firestore.rules for this project.";
    }
    if (code === "unavailable" || code === "deadline-exceeded" || code === "failed-precondition") {
        return "Saved on this device. Will sync to your account when you are back online.";
    }
    return "Saved on this device. Cloud sync did not complete.";
}

export function isOfflineSyncError(error) {
    const code = error?.code || "";
    return code === "unavailable" || code === "deadline-exceeded";
}

export function guestStatus(configured) {
    if (!configured) {
        return {
            level: "unconfigured",
            message: "Saved on this device. Google sign-in is not configured for this deployment yet.",
        };
    }
    return {
        level: "guest",
        message: "Saved on this device. Sign in with Google to store hikes on your account.",
    };
}

export function statusForPlan(plan, synced) {
    if (!synced) {
        return {
            level: "offline",
            message: "Saved on this device. Will sync to your account when you are back online.",
        };
    }
    if (plan.reason === "migrated") {
        return {
            level: "migrated",
            message: "Moved this device's guest hikes to your Google account. A backup was stored with the account first.",
        };
    }
    if (plan.reason === "merged") {
        return {
            level: "merged",
            message: "Combined this device with hikes already on your Google account. A backup of both copies was stored first.",
        };
    }
    return {
        level: "synced",
        message: "Saved to your Google account.",
    };
}

function isFilledConfigValue(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (/^(YOUR_|REPLACE_|xxx|todo\b)/i.test(text)) return false;
    if (text.includes("YOUR_")) return false;
    return true;
}

function readKey(storage, key) {
    try {
        const raw = storage.getItem(key);
        if (raw == null || raw === "") return { present: false, state: emptyState(), value: null };
        return { present: true, state: normalizeState(JSON.parse(raw)), value: JSON.parse(raw) };
    } catch {
        return { present: true, state: emptyState(), value: null };
    }
}

function normalizeCompleted(raw) {
    const completed = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return completed;
    for (const [id, value] of Object.entries(raw)) {
        if (value === true || value === "true" || value === 1) completed[safeId(id)] = true;
    }
    return completed;
}

function normalizeDates(raw) {
    const dates = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return dates;
    for (const [id, value] of Object.entries(raw)) {
        if (value == null || value === "") continue;
        dates[safeId(id)] = String(value);
    }
    return dates;
}

function normalizeMeta(raw) {
    const meta = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return meta;
    for (const [id, value] of Object.entries(raw)) {
        if (!value || typeof value !== "object") continue;
        const safe = safeId(id);
        if (!safe) continue;
        meta[safe] = {
            done: value.done === true,
            date: value.date ? String(value.date) : "",
            updatedAt: finiteNumber(value.updatedAt),
        };
    }
    return meta;
}

function readVisible(input) {
    const source = input && typeof input === "object" ? input : {};
    const seen = new Set();
    const hikes = [];
    const list = Array.isArray(source.hikes) ? source.hikes : [];
    for (const hike of list) {
        const normalized = normalizeHike(hike);
        if (!normalized || seen.has(normalized.id)) continue;
        seen.add(normalized.id);
        hikes.push(normalized);
    }
    return {
        completedChallenges: normalizeCompleted(source.completedChallenges),
        completionDates: normalizeDates(source.completionDates),
        hikes,
    };
}

function normalizeHike(hike) {
    if (!hike || typeof hike !== "object") return null;
    const id = safeId(hike.id);
    if (!id) return null;
    const weekRaw = hike.weekId == null || hike.weekId === "" ? null : Number(hike.weekId);
    const points = normalizePoints(hike.points);
    return {
        id,
        name: hike.name != null && String(hike.name).trim() ? String(hike.name) : "Hike Route",
        date: hike.date != null ? String(hike.date) : "",
        distance: hike.distance != null ? String(hike.distance) : "0.00",
        duration: finiteNumber(hike.duration),
        points,
        weather: hike.weather != null ? String(hike.weather) : "--",
        comment: hike.comment != null ? String(hike.comment) : "",
        photo: typeof hike.photo === "string" && hike.photo ? hike.photo : null,
        weekId: Number.isFinite(weekRaw) ? weekRaw : null,
        createdAt: finiteNumber(hike.createdAt) || idTimestamp(id),
        updatedAt: finiteNumber(hike.updatedAt),
        photoOmitted: hike.photoOmitted === true,
        pointsOmitted: hike.pointsOmitted === true,
        pointCount: finiteNumber(hike.pointCount) || points.length,
    };
}

function normalizePoints(points) {
    if (!Array.isArray(points)) return [];
    const normalized = [];
    for (const point of points) {
        let lat;
        let lng;
        if (Array.isArray(point) && point.length >= 2) {
            lat = Number(point[0]);
            lng = Number(point[1]);
        } else if (point && typeof point === "object") {
            lat = Number(point.lat);
            lng = Number(point.lng);
        } else {
            continue;
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        normalized.push([lat, lng]);
    }
    return normalized;
}

export function encodeFirestoreValue(value) {
    if (Array.isArray(value)) {
        if (value.some((point) => Array.isArray(point))) {
            return value.map((point) => (
                Array.isArray(point)
                    ? { lat: Number(point[0]), lng: Number(point[1]) }
                    : encodeFirestoreValue(point)
            ));
        }
        return value.map((entry) => encodeFirestoreValue(entry));
    }
    if (value && typeof value === "object") {
        const encoded = {};
        for (const [key, entry] of Object.entries(value)) {
            if (entry === undefined) continue;
            encoded[key] = encodeFirestoreValue(entry);
        }
        return encoded;
    }
    return value;
}

function safeId(value) {
    return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
}

function idTimestamp(id) {
    const hikeMatch = /^hike_(\d+)_/.exec(id);
    if (hikeMatch) return Number(hikeMatch[1]);
    const localMatch = /^local_(\d+)/.exec(id);
    if (localMatch) return Number(localMatch[1]);
    if (/^\d+$/.test(id)) return Number(id);
    return 0;
}

function compareHikesDesc(left, right) {
    const byTime = (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0);
    if (byTime) return byTime;
    return String(right.id).localeCompare(String(left.id));
}

function visibleHike(hike) {
    return JSON.stringify({
        id: hike.id,
        name: hike.name,
        date: hike.date,
        distance: hike.distance,
        duration: hike.duration,
        points: hike.points,
        weather: hike.weather,
        comment: hike.comment,
        photo: hike.photo,
        weekId: hike.weekId,
    });
}

function newerHike(base, incoming) {
    const baseStamp = Number(base.updatedAt) || 0;
    const incomingStamp = Number(incoming.updatedAt) || 0;
    const primary = incomingStamp > baseStamp ? incoming : base;
    const secondary = primary === base ? incoming : base;
    return hydrateHike(primary, secondary);
}

function hydrateHike(primary, fallback) {
    const photo = primary.photo || (primary.photoOmitted ? fallback.photo : primary.photo) || null;
    const points = primary.points && primary.points.length
        ? primary.points
        : (primary.pointsOmitted && fallback.points && fallback.points.length ? fallback.points : primary.points || []);
    return normalizeHike({
        ...fallback,
        ...primary,
        id: primary.id,
        photo,
        points,
        photoOmitted: primary.photoOmitted && !photo,
        pointsOmitted: primary.pointsOmitted && points.length === 0,
        pointCount: points.length || primary.pointCount || fallback.pointCount || 0,
    });
}

function mergeMeta(base, incoming) {
    const ids = new Set([...Object.keys(base || {}), ...Object.keys(incoming || {})]);
    const merged = {};
    for (const id of ids) {
        const left = base?.[id];
        const right = incoming?.[id];
        if (!left) merged[id] = right;
        else if (!right) merged[id] = left;
        else if ((left.updatedAt || 0) === (right.updatedAt || 0)) {
            merged[id] = {
                done: left.done || right.done,
                date: left.date || right.date || "",
                updatedAt: left.updatedAt || 0,
            };
        } else {
            merged[id] = (right.updatedAt || 0) > (left.updatedAt || 0) ? right : left;
        }
    }
    return merged;
}

function stateFromParts(challengeMeta, hikes) {
    return normalizeState({ challengeMeta, hikes });
}

function hasTombstone(state) {
    return Object.values(state.challengeMeta || {}).some((entry) => entry && entry.done === false && entry.updatedAt);
}

function serializedLength(value) {
    return JSON.stringify(value).length;
}

function newestStamp(state) {
    let newest = 0;
    for (const entry of Object.values(state.challengeMeta || {})) {
        newest = Math.max(newest, Number(entry?.updatedAt) || 0);
    }
    for (const hike of state.hikes || []) {
        newest = Math.max(newest, Number(hike.updatedAt) || 0, Number(hike.createdAt) || 0);
    }
    return newest;
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
