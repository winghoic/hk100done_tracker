import { buildGpx, formatOffsetIso, gpxFilename, startEpochMs, validTrackPoints } from "./gpx.js";

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_SCOPE = "activity:write";
export const STRAVA_SPORT = "Hike";

const NOT_CONFIGURED = "Strava upload is not set up yet. Add the public client id and the token exchange URL in js/strava-config.js. The client secret stays on the exchange host. GPX download does not need Strava. See docs/STRAVA.md.";

export function stravaSetupMessage() {
    return NOT_CONFIGURED;
}

export function isStravaConfigReady(config) {
    if (!config || config.enabled !== true) return false;
    const clientId = String(config.clientId || "").trim();
    if (!clientId || /your_client_id/i.test(clientId)) return false;
    return isExchangeUrl(config.tokenExchangeUrl);
}

export function isExchangeUrl(value) {
    let url;
    try {
        url = new URL(String(value || "").trim());
    } catch {
        return false;
    }
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export function activityName(hike) {
    return (String(hike?.name || "").trim() || "Hike").slice(0, 255);
}

export function activityDescription(hike, context = {}) {
    const lines = [];
    const comment = String(hike?.comment || "").trim();
    if (comment) lines.push(comment);
    const weather = String(hike?.weather || "").trim();
    if (weather && weather !== "--") lines.push(`Weather: ${weather}`);
    const week = String(context.weekLabel || "").trim();
    if (week) lines.push(week);
    lines.push("Exported from HK100Done Tracker.");
    return lines.join("\n").slice(0, 2000);
}

export function distanceMeters(hike) {
    const km = Number(hike?.distance);
    if (!Number.isFinite(km) || km <= 0) return null;
    return Math.round(km * 1000);
}

export function externalId(hike) {
    const id = String(hike?.id || "hike").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
    return `hk100done-${id || "hike"}`;
}

export function manualActivityFields(hike, context = {}, now = Date.now()) {
    const fields = {
        name: activityName(hike),
        sport_type: STRAVA_SPORT,
        type: STRAVA_SPORT,
        start_date_local: formatOffsetIso(startEpochMs(hike, now)),
        elapsed_time: String(Math.max(0, Math.round(Number(hike?.duration) || 0))),
        description: activityDescription(hike, context),
    };
    const meters = distanceMeters(hike);
    if (meters != null) fields.distance = String(meters);
    return fields;
}

export function gpxUploadFields(hike, context = {}) {
    return {
        name: activityName(hike),
        description: activityDescription(hike, context),
        data_type: "gpx",
        sport_type: STRAVA_SPORT,
        external_id: externalId(hike),
    };
}

export function planStravaExport(hike, context = {}, now = Date.now()) {
    const points = validTrackPoints(hike);
    if (points.length) {
        return {
            mode: "gpx",
            filename: gpxFilename(hike),
            gpx: buildGpx(hike, now),
            fields: gpxUploadFields(hike, context),
        };
    }
    return {
        mode: "manual",
        fields: manualActivityFields(hike, context, now),
    };
}

export function buildAuthorizeUrl({ clientId, redirectUri, state, approvalPrompt = "auto", scope = STRAVA_SCOPE }) {
    const url = new URL(STRAVA_AUTHORIZE_URL);
    url.searchParams.set("client_id", String(clientId || "").trim());
    url.searchParams.set("redirect_uri", String(redirectUri || ""));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("approval_prompt", approvalPrompt === "force" ? "force" : "auto");
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", String(state || ""));
    return url.toString();
}

export function parseOAuthCallback(href) {
    let url;
    try {
        url = new URL(String(href || ""));
    } catch {
        return null;
    }
    const error = url.searchParams.get("error") || "";
    const code = url.searchParams.get("code") || "";
    if (!error && !code) return null;
    return {
        error,
        code,
        state: url.searchParams.get("state") || "",
        scope: url.searchParams.get("scope") || "",
    };
}

export function pageUrlWithoutQuery(href) {
    const url = new URL(String(href));
    return `${url.pathname}${url.hash}`;
}

export function hasActivityWrite(scope) {
    return String(scope || "").split(/[\s,]+/).filter(Boolean).includes("activity:write");
}

export function stravaActivityUrl(id) {
    const text = String(id ?? "");
    if (!/^[1-9]\d*$/.test(text)) return "";
    return `https://www.strava.com/activities/${text}`;
}

export function plainStravaMessage(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function readStravaError(body) {
    if (!body) return "";
    if (typeof body === "string") return plainStravaMessage(body);
    if (typeof body.error === "string" && body.error) return plainStravaMessage(body.error);
    const parts = [];
    if (body.message) parts.push(String(body.message));
    if (Array.isArray(body.errors)) {
        for (const err of body.errors) {
            if (!err || typeof err !== "object") continue;
            const field = err.field ? String(err.field) : "";
            const code = err.code ? String(err.code) : "";
            const piece = [field, code].filter(Boolean).join(" ");
            if (piece) parts.push(piece);
        }
    }
    return plainStravaMessage(parts.join(". "));
}

export function interpretUploadStatus(body) {
    const error = body && typeof body.error === "string" ? body.error.trim() : "";
    const duplicate = /duplicate of activity\s+([1-9]\d*)/i.exec(error);
    if (duplicate) {
        return {
            phase: "duplicate",
            activityId: duplicate[1],
            message: "This track is already on Strava.",
        };
    }
    if (error) return { phase: "error", message: plainStravaMessage(error) };
    const activityId = positiveId(body && body.activity_id);
    if (activityId) return { phase: "ready", activityId };
    const uploadId = body && (body.id_str || positiveId(body.id));
    if (uploadId) return { phase: "processing", uploadId: String(uploadId), status: body.status || "" };
    return { phase: "error", message: "Strava did not return an upload id." };
}

export function interpretCreatedActivity(body) {
    const activityId = positiveId(body && body.id);
    if (activityId) return { phase: "ready", activityId };
    const message = readStravaError(body) || "Strava did not return an activity id.";
    return { phase: "error", message };
}

export function normalizeTokenResponse(body, fallbackScope = "") {
    if (!body || typeof body !== "object" || !body.access_token || !body.refresh_token) return null;
    const athlete = body.athlete && typeof body.athlete === "object" ? body.athlete : {};
    const athleteName = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim();
    return {
        accessToken: String(body.access_token),
        refreshToken: String(body.refresh_token),
        expiresAt: Number(body.expires_at) || 0,
        scope: String(body.scope || fallbackScope || ""),
        athleteName,
        athleteId: athlete.id != null ? String(athlete.id) : "",
    };
}

export function explainStravaHttp(status, body) {
    if (status === 401) return "Strava declined the saved login. Connect again, then retry the export.";
    if (status === 403) return "Strava did not allow this upload. Connect again and allow activity uploads.";
    if (status === 429) return "Strava's rate limit was reached. Wait a few minutes and try again.";
    const message = readStravaError(body);
    if (message) return message;
    return `Strava returned status ${status}.`;
}

export function explainExchangeError(status, body) {
    const code = body && typeof body.error === "string" ? body.error : "";
    if (code === "token_exchange_not_configured") {
        return "The token exchange does not have the Strava client secret yet. Add it on the exchange host. Do not put the secret in this website.";
    }
    if (code === "origin_not_allowed") return "The token exchange rejected this website.";
    if (code === "redirect_not_allowed") return "The token exchange rejected this callback URL.";
    if (status === 401) return "Strava did not accept the login. Try connecting again.";
    const message = readStravaError(body);
    if (message && message !== code) return message;
    return "Strava login could not be completed.";
}

function positiveId(value) {
    const text = String(value ?? "");
    return /^[1-9]\d*$/.test(text) ? text : "";
}
