/**
 * Minimal Strava token exchange for the static HK100Done site.
 *
 * The Pages app never sees the client secret. Deploy this file as a
 * Cloudflare Worker (or any host that calls `handleTokenExchange`) and set:
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 *
 * The browser posts JSON here. This worker adds the secret and calls Strava.
 * Docs: docs/STRAVA.md
 */

const TOKEN_URL = "https://www.strava.com/oauth/token";
const REVOKE_URL = "https://www.strava.com/oauth/revoke";
const PAGES_ORIGIN = "https://winghoic.github.io";

export function isAllowedOrigin(value) {
    let url;
    try {
        url = new URL(String(value || ""));
    } catch {
        return false;
    }
    if (url.username || url.password) return false;
    if (url.origin === PAGES_ORIGIN) return true;
    return (url.protocol === "http:" || url.protocol === "https:")
        && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export function isAllowedRedirect(value) {
    let url;
    try {
        url = new URL(String(value || ""));
    } catch {
        return false;
    }
    if (url.username || url.password) return false;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return url.protocol === "http:" || url.protocol === "https:";
    }
    if (url.protocol !== "https:" || url.hostname !== "winghoic.github.io") return false;
    return url.pathname === "/hk100done_tracker"
        || url.pathname === "/hk100done_tracker/"
        || url.pathname === "/hk100done_tracker/index.html";
}

export function classifyExchange(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, error: "invalid_json" };
    }
    const grant = payload.grant_type;
    if (grant === "authorization_code") {
        if (typeof payload.code !== "string" || !payload.code.trim()) return { ok: false, error: "code_required" };
        if (!isAllowedRedirect(payload.redirect_uri)) return { ok: false, error: "redirect_not_allowed" };
        return { ok: true, grant, strava: { grant_type: grant, code: payload.code.trim() } };
    }
    if (grant === "refresh_token") {
        if (typeof payload.refresh_token !== "string" || !payload.refresh_token.trim()) {
            return { ok: false, error: "refresh_token_required" };
        }
        return { ok: true, grant, strava: { grant_type: grant, refresh_token: payload.refresh_token.trim() } };
    }
    if (grant === "revoke") {
        if (typeof payload.token !== "string" || !payload.token.trim()) return { ok: false, error: "token_required" };
        const hint = payload.token_type_hint === "access_token" ? "access_token" : "refresh_token";
        return { ok: true, grant, token: payload.token.trim(), hint };
    }
    return { ok: false, error: "grant_not_supported" };
}

export function stravaTokenForm(classified, credentials) {
    const params = new URLSearchParams();
    params.set("client_id", credentials.clientId);
    params.set("client_secret", credentials.clientSecret);
    params.set("grant_type", classified.strava.grant_type);
    if (classified.grant === "authorization_code") params.set("code", classified.strava.code);
    if (classified.grant === "refresh_token") params.set("refresh_token", classified.strava.refresh_token);
    return params;
}

export function corsHeaders(origin) {
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        vary: "Origin",
        "cache-control": "no-store",
    };
}

export async function handleTokenExchange(request, env, fetchImpl = fetch) {
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") {
        if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: "origin_not_allowed" }, 403, "");

    const clientId = String(env?.STRAVA_CLIENT_ID || "").trim();
    const clientSecret = String(env?.STRAVA_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) return jsonResponse({ error: "token_exchange_not_configured" }, 500, origin);

    let text = "";
    try {
        text = await request.text();
    } catch {
        return jsonResponse({ error: "invalid_json" }, 400, origin);
    }
    if (text.length > 8000) return jsonResponse({ error: "payload_too_large" }, 413, origin);

    let payload;
    try {
        payload = JSON.parse(text);
    } catch {
        return jsonResponse({ error: "invalid_json" }, 400, origin);
    }
    const classified = classifyExchange(payload);
    if (!classified.ok) return jsonResponse({ error: classified.error }, 400, origin);

    if (classified.grant === "revoke") {
        const basic = btoa(`${clientId}:${clientSecret}`);
        const body = new URLSearchParams();
        body.set("token", classified.token);
        body.set("token_type_hint", classified.hint);
        let response;
        try {
            response = await fetchImpl(REVOKE_URL, {
                method: "POST",
                headers: {
                    authorization: `Basic ${basic}`,
                    "content-type": "application/x-www-form-urlencoded",
                },
                body,
            });
        } catch {
            return jsonResponse({ error: "revoke_failed" }, 502, origin);
        }
        if (!response.ok) return jsonResponse({ error: "revoke_failed" }, response.status || 502, origin);
        return jsonResponse({ revoked: true }, 200, origin);
    }

    let response;
    try {
        response = await fetchImpl(TOKEN_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: stravaTokenForm(classified, { clientId, clientSecret }),
        });
    } catch {
        return jsonResponse({ error: "token_exchange_failed" }, 502, origin);
    }
    const raw = await response.text();
    let parsed = null;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch {
        parsed = null;
    }
    if (!response.ok) {
        const error = parsed && typeof parsed === "object" ? parsed : { error: "token_exchange_failed" };
        return jsonResponse(error, response.status || 502, origin);
    }
    if (!parsed || typeof parsed !== "object") return jsonResponse({ error: "token_exchange_failed" }, 502, origin);
    return jsonResponse(parsed, 200, origin);
}

function jsonResponse(body, status, origin) {
    const headers = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
    };
    if (origin && isAllowedOrigin(origin)) Object.assign(headers, corsHeaders(origin));
    return new Response(JSON.stringify(body), { status, headers });
}

export default {
    async fetch(request, env) {
        return handleTokenExchange(request, env, fetch);
    },
};
