import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { buildGpx, escapeXml, gpxFilename, prepareGpxDownload, startEpochMs, trackAvailability, validTrackPoints } from "../js/gpx.js";

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

test("a hike with no points has a clear GPX empty state", () => {
    const empty = trackAvailability({ name: "Free hike", points: [] });
    assert.equal(empty.available, false);
    assert.match(empty.note, /No GPS track/);
    assert.match(empty.message, /no GPX file/);
    assert.equal(buildGpx({ name: "Free hike", points: [] }), null);

    const omitted = trackAvailability({ points: [], pointsOmitted: true, pointCount: 400 });
    assert.match(omitted.note, /not on this device/);
    assert.match(omitted.message, /too large for cloud sync/);

    const missing = prepareGpxDownload({ name: "Empty", points: [] });
    assert.equal(missing.ok, false);
    assert.match(missing.message, /no GPX file/);

    const omittedDownload = prepareGpxDownload({ points: [], pointsOmitted: true });
    assert.equal(omittedDownload.ok, false);
    assert.match(omittedDownload.message, /too large for cloud sync/);

    const ready = prepareGpxDownload(HIKE);
    assert.equal(ready.ok, true);
    assert.equal(ready.filename, "Dragon-Back.gpx");
    assert.match(ready.contents, /<gpx /);
    assert.match(ready.contents, /<trkpt /);
});

test("history and the save prompt offer GPX download without Strava", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const boot = readFileSync(new URL("../js/boot.js", import.meta.url), "utf8");
    const docs = readFileSync(new URL("../docs/CLOUD_SIGNIN.md", import.meta.url), "utf8");

    assert.match(html, /data-hike-action="gpx"/);
    assert.match(html, /Download GPX/);
    assert.match(html, /Your hike is in History\. Download the GPX file\./);
    assert.match(html, /hikeTrackNote/);
    assert.match(html, /window\.loginWithGoogle/);
    assert.doesNotMatch(html, /strava/i);
    assert.doesNotMatch(html, /Export to Strava|Connect Strava|Disconnect Strava/);

    assert.match(boot, /downloadHikeGpx/);
    assert.match(boot, /prepareGpxDownload/);
    assert.match(boot, /window\.loginWithGoogle/);
    assert.match(boot, /firebase-config\.js/);
    assert.match(boot, /hk100_strava_session_v1/);
    assert.match(boot, /hk100_strava_oauth_v1/);
    assert.doesNotMatch(boot, /strava-client|strava-config|strava-model|exportHikeToStrava|connectStrava|www\.strava\.com/i);

    assert.match(docs, /## GPX download/);
    assert.match(docs, /No GPS track for this hike/);
    assert.match(docs, /pointsOmitted/);
    assert.doesNotMatch(docs, /strava/i);

    for (const rel of [
        "../js/strava-client.js",
        "../js/strava-config.js",
        "../js/strava-model.js",
        "../strava-token/worker.js",
        "../docs/STRAVA.md",
    ]) {
        assert.equal(existsSync(new URL(rel, import.meta.url)), false, rel);
    }
});
