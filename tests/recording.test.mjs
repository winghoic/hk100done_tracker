import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    ACTIVE_RECORDING_KEY,
    BACKGROUND_NOTE_AFTER_MS,
    BACKGROUND_RECORDING_NOTE,
    RECORDING_MAX_AGE_MS,
    clearActiveRecording,
    elapsedSeconds,
    fixIsStale,
    parseRecordingSnapshot,
    readActiveRecording,
    recordingResumePlan,
    writeActiveRecording,
} from "../js/recording.js";

test("elapsed time follows the wall clock across a hidden gap", () => {
    const start = 1_700_000_000_000;
    assert.equal(elapsedSeconds(start, start + 10 * 60 * 1000), 600);
    assert.equal(elapsedSeconds(start, start + 1500), 1);
    assert.equal(elapsedSeconds(start, start - 5), 0);
    assert.equal(elapsedSeconds("nope", start), 0);
});

test("returning to a visible page rearms GPS and keeps a paused hike paused", () => {
    const hidden = recordingResumePlan({
        tracking: true,
        paused: false,
        visibility: "visible",
        hiddenMs: 30_000,
    });
    assert.equal(hidden.refreshClock, true);
    assert.equal(hidden.rearmWatch, true);
    assert.equal(hidden.requestFix, true);
    assert.equal(hidden.wakeLock, true);
    assert.equal(hidden.backgroundNote, true);

    const flicker = recordingResumePlan({
        tracking: true,
        paused: false,
        visibility: "visible",
        hiddenMs: BACKGROUND_NOTE_AFTER_MS - 1,
    });
    assert.equal(flicker.backgroundNote, false);
    assert.equal(flicker.rearmWatch, true);

    const paused = recordingResumePlan({
        tracking: false,
        paused: true,
        visibility: "visible",
        hiddenMs: 30_000,
    });
    assert.equal(paused.refreshClock, false);
    assert.equal(paused.wakeLock, false);
    assert.equal(paused.requestFix, false);
    assert.equal(paused.backgroundNote, false);
    assert.equal(paused.rearmWatch, true);

    const stillHidden = recordingResumePlan({
        tracking: true,
        paused: false,
        visibility: "hidden",
        hiddenMs: 30_000,
    });
    assert.equal(stillHidden.wakeLock, false);
    assert.equal(stillHidden.rearmWatch, false);
    assert.equal(stillHidden.refreshClock, false);
});

test("an in-progress track survives a reload and a saved hike does not stay active", () => {
    const stores = [memoryStore(), memoryStore()];
    const now = 1_700_000_100_000;
    const state = {
        positions: [[22.28, 114.15], [22.281, 114.151]],
        distance: 0.14,
        startTime: now - 125_000,
        duration: 125,
        tracking: true,
        paused: false,
    };
    const written = writeActiveRecording(stores, state, now);
    assert.equal(written.stored, true);
    assert.equal(stores[0].getItem(ACTIVE_RECORDING_KEY), written.json);
    assert.equal(stores[1].getItem(ACTIVE_RECORDING_KEY), written.json);

    const restored = readActiveRecording(stores, now + 5000);
    assert.equal(restored.tracking, true);
    assert.equal(restored.paused, false);
    assert.deepEqual(restored.positions, state.positions);
    assert.equal(restored.distance, 0.14);
    assert.equal(restored.startTime, state.startTime);
    assert.equal(elapsedSeconds(restored.startTime, now + 5000), 130);

    assert.equal(readActiveRecording(stores, now + RECORDING_MAX_AGE_MS + 1), null);
    assert.equal(parseRecordingSnapshot("{", now), null);
    assert.equal(parseRecordingSnapshot(JSON.stringify({ v: 1, savedAt: now + 120_000, tracking: true }), now), null);

    writeActiveRecording(stores, { tracking: false, paused: false }, now);
    assert.equal(stores[0].getItem(ACTIVE_RECORDING_KEY), null);
    assert.equal(readActiveRecording(stores, now), null);

    writeActiveRecording(stores, { ...state, tracking: false, paused: true, duration: 80 }, now);
    const paused = readActiveRecording([memoryStore(), stores[1]], now + 1000);
    assert.equal(paused.paused, true);
    assert.equal(paused.tracking, false);
    assert.equal(paused.duration, 80);
    clearActiveRecording(stores);
    assert.equal(readActiveRecording(stores, now), null);
});

test("a missing GPS fix is treated as stale", () => {
    assert.equal(fixIsStale(0, 10_000), true);
    assert.equal(fixIsStale(1_000, 9_000), true);
    assert.equal(fixIsStale(1_000, 8_999), false);
});

test("the page rearms recording when it becomes visible again", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const boot = readFileSync(new URL("../js/boot.js", import.meta.url), "utf8");
    const docs = readFileSync(new URL("../docs/CLOUD_SIGNIN.md", import.meta.url), "utf8");

    assert.match(html, /visibilitychange/);
    assert.match(html, /pagehide/);
    assert.match(html, /navigator\.wakeLock/);
    assert.match(html, /restoreActiveRecording/);
    assert.match(html, /armPositionWatch/);
    assert.match(html, /id="recording-status"/);
    assert.match(html, /#view-map,\s*\n\s*#view-record \{\s*\n\s*touch-action: auto;/);
    assert.match(boot, /recordingSession/);
    assert.match(boot, /ACTIVE_RECORDING_KEY|recording\.js/);
    assert.match(docs, /hk100_active_recording_v1/);
    assert.match(docs, /iPhone Safari/);
    assert.match(docs, /18 hours/);
    assert.match(BACKGROUND_RECORDING_NOTE, /track already recorded is kept/);
    assert.doesNotMatch(html, /sportiva/i);
});

function memoryStore(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        },
        removeItem(key) {
            map.delete(key);
        },
    };
}
