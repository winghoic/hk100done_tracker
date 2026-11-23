import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    PHOTO_ZOOM_MAX,
    PHOTO_ZOOM_MIN,
    clampPan,
    initialPhotoZoom,
    panPhoto,
    pinchScale,
    pointDistance,
    zoomGesture,
} from "../js/photo-zoom.js";

const FRAME = [200, 100];

test("zoom stays between the fitted photo and four times that size", () => {
    assert.equal(PHOTO_ZOOM_MIN, 1);
    assert.equal(PHOTO_ZOOM_MAX, 4);
    assert.deepEqual(initialPhotoZoom(), { scale: 1, x: 0, y: 0 });
    const zoomed = zoomGesture(initialPhotoZoom(), 8, 0, 0, 0, 0, 200, 100, ...FRAME);
    assert.equal(zoomed.scale, 4);
    const shrunk = zoomGesture(zoomed, 0.2, 0, 0, 0, 0, 200, 100, ...FRAME);
    assert.deepEqual(shrunk, { scale: 1, x: 0, y: 0 });
});

test("zooming keeps the point under the pointer and panning stops at the photo edge", () => {
    const zoomed = zoomGesture(initialPhotoZoom(), 2, 50, 0, 50, 0, 200, 100, ...FRAME);
    assert.equal(zoomed.scale, 2);
    assert.equal(zoomed.x, -50);
    assert.equal(zoomed.y, 0);

    const panned = panPhoto(zoomed, -500, 400, 200, 100, ...FRAME);
    assert.equal(panned.x, -100);
    assert.equal(panned.y, 50);

    const fitted = panPhoto(initialPhotoZoom(), 30, 30, 200, 100, ...FRAME);
    assert.deepEqual(fitted, { scale: 1, x: 0, y: 0 });
    assert.deepEqual(clampPan({ scale: 2, x: 1000, y: -1000 }, 0, 0, 200, 100), { scale: 2, x: 0, y: 0 });
});

test("a pinch scales from the starting distance and a moving pinch also pans", () => {
    assert.equal(pointDistance({ x: 0, y: 0 }, { x: 30, y: 40 }), 50);
    assert.equal(pinchScale(2, 10, 20), 4);
    assert.equal(pinchScale(2, 10, 80), 4);
    assert.equal(pinchScale(2, 10, 2), 1);
    assert.equal(pinchScale(2, 0, 20), 2);

    const moved = zoomGesture({ scale: 1, x: 0, y: 0 }, 2, 0, 0, 20, 0, 200, 100, ...FRAME);
    assert.equal(moved.scale, 2);
    assert.equal(moved.x, 20);
});

test("the photo viewer keeps Close and adds zoom controls", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    assert.match(page, /id="photo-viewer-close"/);
    assert.match(page, /id="photo-zoom-in"/);
    assert.match(page, /id="photo-zoom-out"/);
    assert.match(page, /Zoom in/);
    assert.match(page, /Zoom out/);
    assert.match(page, /Drag to move/);
    assert.match(page, /window\.photoZoom/);
    assert.match(page, /photo-viewer-stage/);
});
