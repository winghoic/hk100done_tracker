import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildGpx, escapeXml, gpxFilename, startEpochMs, trackAvailability, validTrackPoints } from "../js/gpx.js";
import { createStravaClient } from "../js/strava-client.js";
import { stravaConfig } from "../js/strava-config.js";
import {
    buildAuthorizeUrl,
    distanceMeters,
    hasActivityWrite,
    interpretCreatedActivity,
    interpretUploadStatus,
    isStravaConfigReady,
    manualActivityFields,
    parseOAuthCallback,
    planStravaExport,
    stravaActivityUrl,
} from "../js/strava-model.js";
import {
    classifyExchange,
    handleTokenExchange,
    isAllowedOrigin,
    isAllowedRedirect,
    stravaTokenForm,
} from "../strava-token/worker.js";

const CONFIGURED = {
    enabled: true,
    clientId: "12345",
    tokenExchangeUrl: "https://token.example/exchange",
};

const HIKE = {
    id: "hike_1700000000000_ab",
    name: "Dragon & Back",
    date: "11/8/2026",
    distance: "3.50",
    duration: 120,
    points: [[22.2812344, 114.1587654], [22.282, 114.16]],
    weather: "26°C",
    comment: "steep <stairs>",
    createdAt: 1_700_000_000_000,
    weekId: 4,
};

test("config stays disabled until a public client id and https exchange URL are set", () => {
    assert.equal(stravaConfig.enabled, false);
    assert.equal(stravaConfig.clientId, "");
    assert.equal(stravaConfig.tokenExchangeUrl, "");
    const source = readFileSync(new URL("../js/strava-config.js", import.meta.url), "utf8");
    assert.equal(source.includes("clientSecret"), false);
    assert.equal(isStravaConfigReady(stravaConfig), false);
    assert.equal(isStravaConfigReady({ ...CONFIGURED, enabled: false }), false);
    assert.equal(isStravaConfigReady({ ...CONFIGURED, clientId: "YOUR_CLIENT_ID" }), false);
    assert.equal(isStravaConfigReady({ ...CONFIGURED, tokenExchangeUrl: "http://token.example/exchange" }), false);
    assert.equal(isStravaConfigReady({ ...CONFIGURED, tokenExchangeUrl: "http://localhost:8787" }), true);
    assert.equal(isStravaConfigReady(CONFIGURED), true);
});

test("GPX uses the hike track, escapes text, and timestamps every point", () => {
    const gpx = buildGpx(HIKE);
    assert.match(gpx, /creator="HK100Done Tracker"/);
    assert.match(gpx, /<name>Dragon &amp; Back<\/name>/);
    assert.match(gpx, /<desc>steep &lt;stairs&gt;<\/desc>/);
    assert.match(gpx, /<type>Hike<\/type>/);
    assert.match(gpx, /<trkpt lat="22\.281234" lon="114\.158765"><time>2023-11-14T22:11:20\.000Z<\/time><\/trkpt>/);
    assert.match(gpx, /<trkpt lat="22\.282000" lon="114\.160000"><time>2023-11-14T22:13:20\.000Z<\/time><\/trkpt>/);
    assert.equal(gpxFilename(HIKE), "Dragon-Back.gpx");
    assert.equal(gpxFilename({ name: "四排石山" }), "四排石山.gpx");
    assert.equal(escapeXml(`5' & <6>`), "5&apos; &amp; &lt;6&gt;");
    assert.equal(validTrackPoints({ points: [[22.2, 114.2], { lat: 91, lng: 114 }, "nope"] }).length, 1);
    assert.equal(startEpochMs(HIKE), HIKE.createdAt - 120000);
});

test("a hike with no points has a clear GPX empty state and a manual Strava payload", () => {
    const empty = trackAvailability({ name: "Free hike", points: [] });
    assert.equal(empty.available, false);
    assert.match(empty.note, /No GPS track/);
    assert.match(empty.message, /no GPX file/);
    assert.equal(buildGpx({ name: "Free hike", points: [] }), null);

    const omitted = trackAvailability({ points: [], pointsOmitted: true, pointCount: 400 });
    assert.match(omitted.note, /not on this device/);
    assert.match(omitted.message, /too large for cloud sync/);

    const plan = planStravaExport({ ...HIKE, points: [], comment: "foggy ridge" }, { weekLabel: "Week 4: 四排石山" });
    assert.equal(plan.mode, "manual");
    assert.equal(plan.fields.name, "Dragon & Back");
    assert.equal(plan.fields.sport_type, "Hike");
    assert.equal(plan.fields.type, "Hike");
    assert.equal(plan.fields.elapsed_time, "120");
    assert.equal(plan.fields.distance, "3500");
    assert.match(plan.fields.description, /foggy ridge/);
    assert.match(plan.fields.description, /Weather: 26°C/);
    assert.match(plan.fields.description, /Week 4: 四排石山/);
    assert.equal(plan.fields.file, undefined);
    assert.equal(distanceMeters({ distance: "0.00" }), null);
    assert.equal(manualActivityFields({ name: "Zero", distance: "0", duration: 0 }).distance, undefined);

    const tracked = planStravaExport(HIKE, { weekLabel: "Week 4" });
    assert.equal(tracked.mode, "gpx");
    assert.equal(tracked.fields.data_type, "gpx");
    assert.equal(tracked.fields.sport_type, "Hike");
    assert.equal(tracked.fields.external_id, "hk100done-hike_1700000000000_ab");
    assert.match(tracked.gpx, /<gpx /);
});

test("authorize URL is the Strava code flow and carries no client secret", () => {
    const url = new URL(buildAuthorizeUrl({
        clientId: "12345",
        redirectUri: "https://winghoic.github.io/hk100done_tracker/",
        state: "abc",
    }));
    assert.equal(url.origin, "https://www.strava.com");
    assert.equal(url.pathname, "/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "12345");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), "activity:write");
    assert.equal(url.searchParams.get("redirect_uri"), "https://winghoic.github.io/hk100done_tracker/");
    assert.equal(url.searchParams.get("state"), "abc");
    assert.equal(url.searchParams.get("client_secret"), null);
    assert.equal(hasActivityWrite("activity:write"), true);
    assert.equal(hasActivityWrite("read,activity:read"), false);
    assert.deepEqual(
        parseOAuthCallback("https://winghoic.github.io/hk100done_tracker/?code=once&state=abc&scope=activity:write"),
        { error: "", code: "once", state: "abc", scope: "activity:write" }
    );
    assert.equal(parseOAuthCallback("https://winghoic.github.io/hk100done_tracker/"), null);
    assert.equal(stravaActivityUrl("153243126"), "https://www.strava.com/activities/153243126");
    assert.equal(stravaActivityUrl("0"), "");
});

test("upload status prefers an activity link, including a duplicate", () => {
    assert.deepEqual(interpretUploadStatus({ id: 5, id_str: "5", error: null, activity_id: null }), {
        phase: "processing",
        uploadId: "5",
        status: "",
    });
    assert.equal(interpretUploadStatus({ activity_id: 153243126, error: null }).phase, "ready");
    assert.deepEqual(
        interpretUploadStatus({ error: "Walk.gpx duplicate of activity 21234316", activity_id: null }),
        { phase: "duplicate", activityId: "21234316", message: "This track is already on Strava." }
    );
    assert.equal(interpretCreatedActivity({ id: 42, name: "Hike" }).activityId, "42");
    assert.equal(interpretCreatedActivity({ message: "Bad Request" }).phase, "error");
});

test("token exchange adds the secret from the host environment only", async () => {
    assert.equal(isAllowedOrigin("https://winghoic.github.io"), true);
    assert.equal(isAllowedOrigin("https://evil.example"), false);
    assert.equal(isAllowedRedirect("https://winghoic.github.io/hk100done_tracker/"), true);
    assert.equal(isAllowedRedirect("https://winghoic.github.io/other/"), false);
    assert.equal(isAllowedRedirect("http://localhost:8080/hk100done_tracker/"), true);

    const classified = classifyExchange({
        grant_type: "authorization_code",
        code: "once",
        redirect_uri: "https://winghoic.github.io/hk100done_tracker/",
        client_secret: "from-the-browser",
    });
    assert.equal(JSON.stringify(classified).includes("from-the-browser"), false);
    const form = stravaTokenForm(classified, { clientId: "12345", clientSecret: "test-secret" });
    assert.equal(form.get("client_secret"), "test-secret");
    assert.equal(form.get("code"), "once");
    assert.equal(form.get("redirect_uri"), null);

    const calls = [];
    const response = await handleTokenExchange(jsonRequest({
        grant_type: "authorization_code",
        code: "once",
        redirect_uri: "https://winghoic.github.io/hk100done_tracker/",
        client_secret: "from-the-browser",
    }), { STRAVA_CLIENT_ID: "12345", STRAVA_CLIENT_SECRET: "test-secret" }, async (url, options) => {
        calls.push({ url, body: options.body.toString(), headers: options.headers });
        return jsonResult({
            access_token: "access",
            refresh_token: "refresh",
            expires_at: 1_800_000_000,
            scope: "activity:write",
            athlete: { firstname: "Wing", lastname: "Hoi" },
        });
    });
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, "https://www.strava.com/oauth/token");
    assert.match(calls[0].body, /client_secret=test-secret/);
    assert.equal(calls[0].body.includes("from-the-browser"), false);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://winghoic.github.io");
    const token = await response.json();
    assert.equal(token.access_token, "access");

    const blocked = await handleTokenExchange(jsonRequest({
        grant_type: "authorization_code",
        code: "once",
        redirect_uri: "https://evil.example/callback",
    }, "https://evil.example"), { STRAVA_CLIENT_ID: "12345", STRAVA_CLIENT_SECRET: "test-secret" }, () => {
        throw new Error("should not call Strava");
    });
    assert.equal(blocked.status, 403);

    const missing = await handleTokenExchange(jsonRequest({
        grant_type: "refresh_token",
        refresh_token: "refresh",
    }), {}, async () => {
        throw new Error("should not call Strava");
    });
    assert.equal(missing.status, 500);
    assert.equal((await missing.json()).error, "token_exchange_not_configured");
});

test("the browser client exchanges the code, then uploads GPX or a manual hike", async () => {
    const storage = memoryStorage();
    const session = memoryStorage();
    const calls = [];
    const client = createStravaClient({
        config: CONFIGURED,
        storage,
        session,
        now: () => 1_700_000_000_000,
        randomBytes: () => new Uint8Array([1, 2, 3, 4]),
        sleep: async () => {},
        downloadFile() {},
        fetch: async (url, options = {}) => {
            const body = options.body;
            calls.push({
                url: String(url),
                method: options.method || "GET",
                headers: options.headers || {},
                text: typeof body?.toString === "function" && !(body instanceof FormData) ? body.toString() : "",
                form: body instanceof FormData ? body : null,
            });
            if (String(url) === CONFIGURED.tokenExchangeUrl) {
                const payload = JSON.parse(options.body);
                assert.equal(payload.client_secret, undefined);
                return jsonResult({
                    access_token: "access",
                    refresh_token: "refresh",
                    expires_at: 1_800_000_000,
                    scope: "activity:write",
                    athlete: { firstname: "Wing", lastname: "Hoi" },
                });
            }
            if (String(url) === "https://www.strava.com/api/v3/uploads") {
                return jsonResult({ id_str: "55", error: null, activity_id: null, status: "Your activity is still being processed." }, 201);
            }
            if (String(url) === "https://www.strava.com/api/v3/uploads/55") {
                return jsonResult({ id_str: "55", error: null, activity_id: 153243126, status: "Your activity is ready." });
            }
            if (String(url) === "https://www.strava.com/api/v3/activities") {
                return jsonResult({ id: 77, name: "Dragon & Back" }, 201);
            }
            return jsonResult({ message: "unexpected" }, 500);
        },
    });

    const started = client.beginConnect({
        hikeId: HIKE.id,
        redirectUri: "https://winghoic.github.io/hk100done_tracker/",
    });
    assert.equal(started.ok, true);
    assert.equal(new URL(started.url).searchParams.get("client_secret"), null);

    const done = await client.completeAuthorization(
        `https://winghoic.github.io/hk100done_tracker/?code=once&state=${new URL(started.url).searchParams.get("state")}&scope=activity:write`
    );
    assert.equal(done.ok, true);
    assert.equal(done.hikeId, HIKE.id);
    assert.equal(done.cleanedUrl, "/hk100done_tracker/");
    assert.equal(calls[0].text.includes("client_secret"), false);
    assert.equal(client.snapshot().athleteName, "Wing Hoi");

    calls.length = 0;
    const uploaded = await client.upload(HIKE, { weekLabel: "Week 4: peaks" });
    assert.equal(uploaded.ok, true);
    assert.equal(uploaded.mode, "gpx");
    assert.equal(uploaded.url, "https://www.strava.com/activities/153243126");
    assert.equal(calls[0].form.get("data_type"), "gpx");
    assert.equal(calls[0].form.get("sport_type"), "Hike");
    assert.match(await calls[0].form.get("file").text(), /<gpx /);
    assert.match(calls[0].headers.authorization, /^Bearer access$/);

    calls.length = 0;
    const manual = await client.upload({ ...HIKE, points: [] });
    assert.equal(manual.ok, true);
    assert.equal(manual.mode, "manual");
    assert.equal(manual.url, "https://www.strava.com/activities/77");
    assert.match(calls[0].text, /sport_type=Hike/);
    assert.match(calls[0].text, /elapsed_time=120/);
    assert.match(calls[0].text, /distance=3500/);
    assert.equal(calls[0].url, "https://www.strava.com/api/v3/activities");

    const unconfigured = createStravaClient({
        config: stravaConfig,
        storage: memoryStorage(),
        session: memoryStorage(),
        fetch: async () => {
            throw new Error("should not call the network");
        },
    });
    const blocked = await unconfigured.upload(HIKE);
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /not set up yet/);
    const file = unconfigured.download({ name: "Empty", points: [] });
    assert.match(file.message, /no GPX file/);
});

test("history and the save prompt expose GPX and Strava actions", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    assert.match(html, /data-hike-action="gpx"/);
    assert.match(html, /data-hike-action="strava"/);
    assert.match(html, /Download GPX/);
    assert.match(html, /Export to Strava/);
    assert.match(html, /id="strava-status"/);
    assert.match(html, /hikeTrackNote/);
});

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
    };
}

function jsonRequest(body, origin = "https://winghoic.github.io") {
    return new Request("https://token.example/exchange", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function jsonResult(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
