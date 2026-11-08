import { buildGpx, gpxFilename, trackAvailability } from "./gpx.js";
import {
    buildAuthorizeUrl,
    explainExchangeError,
    explainStravaHttp,
    hasActivityWrite,
    interpretCreatedActivity,
    interpretUploadStatus,
    isStravaConfigReady,
    normalizeTokenResponse,
    pageUrlWithoutQuery,
    parseOAuthCallback,
    planStravaExport,
    stravaActivityUrl,
    stravaSetupMessage,
} from "./strava-model.js";

const SESSION_KEY = "hk100_strava_session_v1";
const PENDING_KEY = "hk100_strava_oauth_v1";
const UPLOADS_URL = "https://www.strava.com/api/v3/uploads";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/activities";
const DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
const PENDING_TTL_MS = 30 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function createStravaClient({
    config,
    storage,
    session = storage,
    fetch: fetchImpl,
    now = () => Date.now(),
    randomBytes = defaultRandomBytes,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    downloadFile = defaultDownload,
    pollLimit = 8,
} = {}) {
    let uploading = false;

    function snapshot() {
        const saved = readSession();
        return {
            configured: isStravaConfigReady(config),
            connected: Boolean(saved?.refreshToken),
            athleteName: saved?.athleteName || "",
            scope: saved?.scope || "",
        };
    }

    function download(hike) {
        const availability = trackAvailability(hike);
        if (!availability.available) return { ok: false, message: availability.message };
        const gpx = buildGpx(hike, now());
        if (!gpx) return { ok: false, message: availability.message || trackAvailability({}).message };
        downloadFile(gpxFilename(hike), gpx, "application/gpx+xml");
        return { ok: true, message: "GPX file downloaded." };
    }

    function beginConnect({ hikeId = "", redirectUri, force = false } = {}) {
        if (!isStravaConfigReady(config)) return { ok: false, reason: "not_configured", message: stravaSetupMessage() };
        if (!redirectUri) return { ok: false, reason: "redirect", message: "This page has no callback URL for Strava." };
        const state = bytesToHex(randomBytes(16));
        writeJson(session, PENDING_KEY, {
            state,
            hikeId: String(hikeId || ""),
            redirectUri,
            createdAt: now(),
        });
        return {
            ok: true,
            url: buildAuthorizeUrl({
                clientId: String(config.clientId).trim(),
                redirectUri,
                state,
                approvalPrompt: force ? "force" : "auto",
            }),
        };
    }

    async function completeAuthorization(pageUrl) {
        const parsed = parseOAuthCallback(pageUrl);
        if (!parsed) return null;
        const cleanedUrl = pageUrlWithoutQuery(pageUrl);
        const pending = readJson(session, PENDING_KEY);
        removeKey(session, PENDING_KEY);
        if (!pending || pending.state !== parsed.state) {
            return {
                ok: false,
                cleanedUrl,
                message: "This Strava login did not match the one started in this browser. Try again.",
            };
        }
        if (!pending.createdAt || now() - Number(pending.createdAt) > PENDING_TTL_MS) {
            return { ok: false, cleanedUrl, message: "This Strava login expired. Try again." };
        }
        if (parsed.error) {
            const cancelled = parsed.error === "access_denied";
            return {
                ok: false,
                cleanedUrl,
                message: cancelled ? "Strava connection was cancelled." : "Strava did not finish the connection.",
            };
        }
        if (!isStravaConfigReady(config)) return { ok: false, cleanedUrl, message: stravaSetupMessage() };
        let response;
        try {
            response = await fetchImpl(String(config.tokenExchangeUrl).trim(), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    grant_type: "authorization_code",
                    code: parsed.code,
                    redirect_uri: pending.redirectUri,
                }),
            });
        } catch {
            return { ok: false, cleanedUrl, message: "Could not reach the Strava token exchange. Check the token URL and try again." };
        }
        const body = await readBody(response);
        if (!response.ok) return { ok: false, cleanedUrl, message: explainExchangeError(response.status, body) };
        const token = normalizeTokenResponse(body, parsed.scope);
        if (!token) return { ok: false, cleanedUrl, message: "Strava did not return a login token." };
        if (!hasActivityWrite(token.scope || parsed.scope)) {
            return {
                ok: false,
                cleanedUrl,
                message: "Strava connected without permission to upload activities. Connect again and allow activity uploads.",
            };
        }
        writeJson(storage, SESSION_KEY, token);
        return { ok: true, cleanedUrl, hikeId: pending.hikeId || "", athleteName: token.athleteName };
    }

    async function upload(hike, context = {}) {
        if (!hike) return { ok: false, message: "That hike is no longer on this device." };
        if (!isStravaConfigReady(config)) return { ok: false, reason: "not_configured", message: stravaSetupMessage() };
        const saved = readSession();
        if (!saved?.refreshToken) return { ok: false, reason: "signed_out", message: "Connect Strava first, then the hike uploads." };
        if (saved.scope && !hasActivityWrite(saved.scope)) {
            return {
                ok: false,
                reason: "scope",
                message: "Strava is connected without permission to upload. Connect again and allow activity uploads.",
            };
        }
        if (uploading) return { ok: false, message: "An upload is already in progress." };
        uploading = true;
        try {
            const token = await ensureAccessToken(saved);
            if (!token.ok) return token;
            const plan = planStravaExport(hike, context, now());
            if (plan.mode === "gpx") return await uploadGpx(token.accessToken, plan);
            return await createManual(token.accessToken, plan.fields);
        } finally {
            uploading = false;
        }
    }

    async function disconnect() {
        const saved = readSession();
        removeKey(storage, SESSION_KEY);
        removeKey(session, PENDING_KEY);
        if (!saved) return { ok: true, message: "Strava is disconnected on this device." };
        const tasks = [];
        if (saved.accessToken) {
            const body = new URLSearchParams();
            body.set("access_token", saved.accessToken);
            tasks.push(fetchImpl(DEAUTHORIZE_URL, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body,
            }).catch(() => null));
        }
        if (isStravaConfigReady(config) && saved.refreshToken) {
            tasks.push(fetchImpl(String(config.tokenExchangeUrl).trim(), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    grant_type: "revoke",
                    token: saved.refreshToken,
                    token_type_hint: "refresh_token",
                }),
            }).catch(() => null));
        }
        await Promise.all(tasks);
        return {
            ok: true,
            message: "Strava is disconnected on this device. Hikes already uploaded stay on Strava. You can also remove HK100Done Tracker at strava.com/settings/apps.",
        };
    }

    async function ensureAccessToken(saved) {
        const expiresMs = Number(saved.expiresAt) > 0 ? Number(saved.expiresAt) * 1000 : 0;
        if (saved.accessToken && expiresMs - now() > REFRESH_MARGIN_MS) {
            return { ok: true, accessToken: saved.accessToken };
        }
        let response;
        try {
            response = await fetchImpl(String(config.tokenExchangeUrl).trim(), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    grant_type: "refresh_token",
                    refresh_token: saved.refreshToken,
                }),
            });
        } catch {
            return { ok: false, message: "Could not refresh the Strava login. Try again when you are online." };
        }
        const body = await readBody(response);
        if (!response.ok) {
            removeKey(storage, SESSION_KEY);
            return { ok: false, message: explainExchangeError(response.status, body) };
        }
        const next = normalizeTokenResponse(body, saved.scope);
        if (!next) {
            removeKey(storage, SESSION_KEY);
            return { ok: false, message: "Strava did not return a new login token. Connect again." };
        }
        if (!next.athleteName) next.athleteName = saved.athleteName || "";
        if (!next.athleteId) next.athleteId = saved.athleteId || "";
        if (!next.scope) next.scope = saved.scope || "";
        writeJson(storage, SESSION_KEY, next);
        return { ok: true, accessToken: next.accessToken };
    }

    async function uploadGpx(accessToken, plan) {
        const form = new FormData();
        form.append("file", new Blob([plan.gpx], { type: "application/gpx+xml" }), plan.filename);
        for (const [key, value] of Object.entries(plan.fields)) form.append(key, value);
        let response;
        try {
            response = await fetchImpl(UPLOADS_URL, {
                method: "POST",
                headers: { authorization: `Bearer ${accessToken}` },
                body: form,
            });
        } catch {
            return { ok: false, mode: "gpx", message: "Could not reach Strava to upload the GPX file." };
        }
        let body = await readBody(response);
        if (!response.ok && response.status !== 400) {
            return { ok: false, mode: "gpx", message: explainStravaHttp(response.status, body) };
        }
        let status = interpretUploadStatus(body);
        let polls = 0;
        while (status.phase === "processing" && polls < pollLimit) {
            await sleep(1000);
            polls += 1;
            try {
                response = await fetchImpl(`${UPLOADS_URL}/${encodeURIComponent(status.uploadId)}`, {
                    headers: { authorization: `Bearer ${accessToken}` },
                });
            } catch {
                return { ok: false, mode: "gpx", message: "The GPX file was sent, but Strava's status check did not answer." };
            }
            body = await readBody(response);
            if (!response.ok && response.status !== 400) {
                return { ok: false, mode: "gpx", message: explainStravaHttp(response.status, body) };
            }
            status = interpretUploadStatus(body);
        }
        return finishActivityResult(status, "gpx", "Uploaded the GPS track to Strava.");
    }

    async function createManual(accessToken, fields) {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(fields)) body.set(key, value);
        let response;
        try {
            response = await fetchImpl(ACTIVITIES_URL, {
                method: "POST",
                headers: { authorization: `Bearer ${accessToken}` },
                body,
            });
        } catch {
            return { ok: false, mode: "manual", message: "Could not reach Strava to create the hike." };
        }
        const parsed = await readBody(response);
        if (!response.ok) return { ok: false, mode: "manual", message: explainStravaHttp(response.status, parsed) };
        const status = interpretCreatedActivity(parsed);
        return finishActivityResult(
            status,
            "manual",
            "Created a Strava hike without a GPS file, because this hike has no track points."
        );
    }

    function finishActivityResult(status, mode, successMessage) {
        if (status.phase === "ready" || status.phase === "duplicate") {
            const url = stravaActivityUrl(status.activityId);
            return {
                ok: true,
                mode,
                duplicate: status.phase === "duplicate",
                activityId: status.activityId || "",
                url,
                message: status.phase === "duplicate" ? status.message : successMessage,
            };
        }
        if (status.phase === "processing") {
            return {
                ok: true,
                mode,
                url: "",
                message: "Strava accepted the GPS file and is still processing it. Check your activities in a moment.",
            };
        }
        return { ok: false, mode, message: status.message || "Strava did not accept this hike." };
    }

    function readSession() {
        return readJson(storage, SESSION_KEY);
    }

    return { snapshot, download, beginConnect, completeAuthorization, upload, disconnect };
}

function defaultRandomBytes(size) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return bytes;
}

function bytesToHex(bytes) {
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function readJson(store, key) {
    try {
        const raw = store.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function writeJson(store, key, value) {
    store.setItem(key, JSON.stringify(value));
}

function removeKey(store, key) {
    try {
        store.removeItem(key);
    } catch {
        /* ignore private-mode storage failures */
    }
}

async function readBody(response) {
    if (!response) return null;
    try {
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch {
            return { message: text.slice(0, 300) };
        }
    } catch {
        return null;
    }
}

function defaultDownload(filename, contents, mime) {
    const blob = new Blob([contents], { type: mime || "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
