import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { summarizeEdition4 } from "../js/edition4-scores.js";
import { buildGpx, hikeFromGpx, nameFromFilename, parseGpx, trackDistanceKm } from "../js/gpx.js";
import { normalizeState } from "../js/sync-model.js";

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

test("a downloaded GPX imports as a hike with the same track, name, and duration", () => {
    const imported = hikeFromGpx(buildGpx(HIKE), { id: "hike_import_1", filename: "ignored.gpx" });
    assert.equal(imported.ok, true);
    assert.equal(imported.truncated, false);
    assert.equal(imported.hike.id, "hike_import_1");
    assert.equal(imported.hike.name, "Dragon & Back");
    assert.equal(imported.hike.comment, "steep <stairs>");
    assert.equal(imported.hike.duration, 120);
    assert.equal(imported.hike.createdAt, HIKE.createdAt);
    assert.equal(imported.hike.weekId, null);
    assert.equal(imported.hike.weather, "--");
    assert.equal(imported.hike.photo, null);
    assert.deepEqual(imported.hike.points, [[22.281234, 114.158765], [22.282, 114.16]]);
    assert.equal(imported.hike.distance, trackDistanceKm(imported.hike.points).toFixed(2));
    const km = Number(imported.hike.distance);
    assert.ok(km > 0.1 && km < 0.2, imported.hike.distance);
    assert.ok(imported.hike.date);

    const stored = normalizeState({ hikes: [imported.hike] }).hikes[0];
    assert.equal(stored.id, "hike_import_1");
    assert.equal(stored.weekId, null);
    assert.equal(stored.points.length, 2);
});

test("GPX import reads namespaced tracks, routes, and filenames", () => {
    const watch = hikeFromGpx(`<?xml version="1.0"?>
        <gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Watch">
          <metadata><name>大帽山</name><desc>Morning &amp; clear</desc></metadata>
          <trk><name>Ignored</name><trkseg>
            <trkpt lat="22.410117" lon="114.124595"><ele>957</ele><time>2024-03-01T00:10:00Z</time></trkpt>
            <trkpt lat="22.411000" lon="114.125000"><time>2024-03-01T01:10:00Z</time></trkpt>
          </trkseg></trk>
          <rte><rtept lat="1" lon="2"/></rte>
        </gpx>`, { id: "hike_watch", now: 50 });
    assert.equal(watch.ok, true);
    assert.equal(watch.hike.name, "大帽山");
    assert.equal(watch.hike.comment, "Morning & clear");
    assert.equal(watch.hike.duration, 3600);
    assert.equal(watch.hike.points.length, 2);
    assert.notEqual(watch.hike.points[0][0], 1);

    const route = hikeFromGpx(`<gpx version="1.1"><rte><name>Planned</name>
        <rtept lat="22.10" lon="114.10"/>
        <rtept lat="22.20" lng="114.20"/>
        </rte></gpx>`, { id: "hike_route", filename: "other.gpx", now: 10 });
    assert.equal(route.hike.name, "Planned");
    assert.deepEqual(route.hike.points, [[22.1, 114.1], [22.2, 114.2]]);
    assert.equal(route.hike.duration, 0);
    assert.equal(route.hike.createdAt, 10);

    const namedFile = hikeFromGpx(`<gpx><trk><trkseg>
        <trkpt lat="22.3" lon="114.3"/>
        </trkseg></trk></gpx>`, { id: "hike_file", filename: "Tai_Mo.gpx", now: 5 });
    assert.equal(namedFile.hike.name, "Tai Mo");
    assert.equal(nameFromFilename("folder/Tai_Mo.gpx"), "Tai_Mo");

    const commented = parseGpx(`<gpx><!-- <trkpt lat="1" lon="1"></trkpt> -->
        <trk><trkseg><trkpt lat="22.5" lon="114.5"/></trkseg></trk></gpx>`);
    assert.equal(commented.points.length, 1);
    assert.equal(commented.points[0].lat, 22.5);
});

test("GPX import rejects an empty file and shortens a very long track", () => {
    const empty = hikeFromGpx("<gpx><wpt lat=\"22.2\" lon=\"114.2\"><name>Peak</name></wpt></gpx>", { id: "nope" });
    assert.equal(empty.ok, false);
    assert.match(empty.message, /no track points/);
    assert.equal(hikeFromGpx("not xml", { id: "nope" }).ok, false);

    const rows = Array.from({ length: 5 }, (_, index) => (
        `<trkpt lat="${22 + index / 100}" lon="114.1"><time>2024-01-01T00:0${index}:00Z</time></trkpt>`
    ));
    const shortened = hikeFromGpx(`<gpx><trk><name>Long</name><trkseg>${rows.join("")}</trkseg></trk></gpx>`, {
        id: "hike_long",
        maxPoints: 2,
        now: 1,
    });
    assert.equal(shortened.ok, true);
    assert.equal(shortened.truncated, true);
    assert.equal(shortened.hike.points.length, 2);
    assert.equal(shortened.hike.points[0][0], 22);
    assert.equal(shortened.hike.points[1][0], 22.04);
    assert.equal(shortened.hike.duration, 240);
});

test("an imported hike can count toward scores the same way as a recorded hike", () => {
    const imported = hikeFromGpx(`<gpx><metadata><name>大帽山</name></metadata><trk><trkseg>
        <trkpt lat="22.410118" lon="114.124595"/>
        <trkpt lat="22.410200" lon="114.124700"/>
        </trkseg></trk></gpx>`, { id: "hike_score", now: 99 });
    const summary = summarizeEdition4({ completedChallenges: {}, hikes: [imported.hike] });
    assert.equal(summary.rows.find((row) => row.name === "大帽山").hiked, true);
    assert.equal(summary.hikedCount, 1);
});

test("History offers GPX import beside the existing download", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const boot = readFileSync(new URL("../js/boot.js", import.meta.url), "utf8");
    const docs = readFileSync(new URL("../docs/CLOUD_SIGNIN.md", import.meta.url), "utf8");

    assert.match(html, /id="btn-import-gpx"/);
    assert.match(html, /id="gpx-file-input"/);
    assert.match(html, /Import GPX/);
    assert.match(html, /accept="\.gpx,/);
    assert.match(html, /importGpxFile/);
    assert.match(html, /prepareHikeFromGpx/);
    assert.match(html, /data-hike-action="gpx"/);
    assert.match(html, /#view-map,\s*\n\s*#view-record \{\s*\n\s*touch-action: auto;/);
    assert.doesNotMatch(html, /sportiva/i);
    assert.doesNotMatch(html, /strava/i);

    assert.match(boot, /prepareHikeFromGpx/);
    assert.match(boot, /hikeFromGpx/);
    assert.match(docs, /## GPX import/);
    assert.match(docs, /40,000 points/);
    assert.doesNotMatch(docs, /strava/i);
});
