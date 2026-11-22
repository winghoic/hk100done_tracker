const GPX_NS = "http://www.topografix.com/GPX/1/1";

export function escapeXml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&apos;",
    }[ch]));
}

export function validTrackPoints(hike) {
    const source = Array.isArray(hike?.points) ? hike.points : [];
    const points = [];
    for (const point of source) {
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
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        points.push([lat, lng]);
    }
    return points;
}

export function trackAvailability(hike) {
    const points = validTrackPoints(hike);
    if (points.length) {
        return { available: true, count: points.length, note: "", message: "" };
    }
    if (hike && hike.pointsOmitted === true) {
        return {
            available: false,
            count: 0,
            note: "GPS track is not on this device.",
            message: "This hike has no GPS track on this device. The track was too large for cloud sync, so the GPX file is only in the browser that recorded it.",
        };
    }
    return {
        available: false,
        count: 0,
        note: "No GPS track for this hike.",
        message: "This hike has no GPS track, so there is no GPX file to download.",
    };
}

export function prepareGpxDownload(hike, now = Date.now()) {
    const availability = trackAvailability(hike);
    if (!availability.available) {
        return { ok: false, message: availability.message || trackAvailability({}).message };
    }
    const gpx = buildGpx(hike, now);
    if (!gpx) return { ok: false, message: availability.message || trackAvailability({}).message };
    return {
        ok: true,
        filename: gpxFilename(hike),
        contents: gpx,
        message: "GPX file downloaded.",
    };
}

export function gpxFilename(hike) {
    const cleaned = String(hike?.name || "hike")
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
    return `${cleaned || "hike"}.gpx`;
}

export function startEpochMs(hike, now = Date.now()) {
    const durationMs = Math.max(0, Number(hike?.duration) || 0) * 1000;
    const created = Number(hike?.createdAt);
    if (Number.isFinite(created) && created > 0) return created - durationMs;
    const parsed = Date.parse(String(hike?.date || ""));
    if (Number.isFinite(parsed)) return parsed;
    return (Number(now) || Date.now()) - durationMs;
}

export function formatOffsetIso(epochMs) {
    const date = new Date(epochMs);
    const pad = (value) => String(Math.trunc(Math.abs(value))).padStart(2, "0");
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.trunc(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`;
}

function pointTimes(hike, count, now) {
    const start = startEpochMs(hike, now);
    const durationMs = Math.max(0, Number(hike?.duration) || 0) * 1000;
    const span = durationMs > 0 ? durationMs : (count > 1 ? (count - 1) * 1000 : 0);
    if (count <= 1) return [start];
    return Array.from({ length: count }, (_, index) => start + Math.round((span * index) / (count - 1)));
}

export function buildGpx(hike, now = Date.now()) {
    const points = validTrackPoints(hike);
    if (!points.length) return null;
    const name = String(hike?.name || "").trim() || "Hike";
    const comment = String(hike?.comment || "").trim();
    const times = pointTimes(hike, points.length, now);
    const startIso = new Date(times[0]).toISOString();
    const rows = points.map((point, index) => (
        `      <trkpt lat="${point[0].toFixed(6)}" lon="${point[1].toFixed(6)}"><time>${new Date(times[index]).toISOString()}</time></trkpt>`
    ));
    const description = comment ? `\n    <desc>${escapeXml(comment)}</desc>` : "";
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<gpx version="1.1" creator="HK100Done Tracker" xmlns="${GPX_NS}">`,
        `  <metadata>`,
        `    <name>${escapeXml(name)}</name>${description}`,
        `    <time>${startIso}</time>`,
        `  </metadata>`,
        `  <trk>`,
        `    <name>${escapeXml(name)}</name>`,
        `    <type>Hike</type>`,
        `    <trkseg>`,
        ...rows,
        `    </trkseg>`,
        `  </trk>`,
        `</gpx>`,
        ``,
    ].join("\n");
}

export const MAX_IMPORT_POINTS = 40000;

export function nameFromFilename(filename) {
    const base = String(filename || "").split(/[/\\]/).pop() || "";
    return base.replace(/\.gpx$/i, "").trim();
}

export function trackDistanceKm(points) {
    const list = Array.isArray(points) ? points : [];
    let total = 0;
    for (let i = 1; i < list.length; i += 1) {
        const prev = pairLatLng(list[i - 1]);
        const next = pairLatLng(list[i]);
        if (!prev || !next) continue;
        total += haversineKm(prev[0], prev[1], next[0], next[1]);
    }
    return total;
}

export function parseGpx(xml) {
    const source = stripXmlNoise(xml);
    const tracked = pointsFor(source, "trkpt");
    const points = tracked.length ? tracked : pointsFor(source, "rtept");
    return {
        name: cleanText(firstNamed(source, "name"), 80),
        comment: cleanText(firstNamed(source, "desc"), 500),
        points,
    };
}

export function hikeFromGpx(xml, options = {}) {
    const parsed = parseGpx(xml);
    if (!parsed.points.length) {
        return { ok: false, message: "This GPX file has no track points to import." };
    }
    const now = finiteNow(options.now);
    const limit = Math.max(2, Number(options.maxPoints) || MAX_IMPORT_POINTS);
    const stored = thinPoints(parsed.points, limit);
    let earliest = Infinity;
    let latest = -Infinity;
    for (const point of parsed.points) {
        if (!Number.isFinite(point.timeMs)) continue;
        if (point.timeMs < earliest) earliest = point.timeMs;
        if (point.timeMs > latest) latest = point.timeMs;
    }
    let createdAt = now;
    let duration = 0;
    if (earliest !== Infinity) {
        createdAt = latest;
        duration = Math.max(0, Math.round((latest - earliest) / 1000));
    }
    const formatDate = typeof options.formatDate === "function" ? options.formatDate : formatHikeDate;
    const name = cleanText(parsed.name || nameFromFilename(options.filename).replace(/[_]+/g, " "), 80) || "Imported hike";
    const hike = {
        id: String(options.id || ""),
        name,
        date: String(formatDate(createdAt) || ""),
        distance: trackDistanceKm(stored.map((point) => [point.lat, point.lng])).toFixed(2),
        duration,
        points: stored.map((point) => [point.lat, point.lng]),
        weather: "--",
        comment: parsed.comment,
        photo: null,
        weekId: null,
        createdAt,
    };
    const truncated = stored.length < parsed.points.length;
    return {
        ok: true,
        hike,
        truncated,
        pointCount: stored.length,
        message: truncated
            ? "GPX file imported. The saved track was shortened so it fits on this device."
            : "GPX file imported.",
    };
}

function formatHikeDate(epochMs) {
    const date = new Date(epochMs);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString();
}

function finiteNow(value) {
    const now = Number(value);
    return Number.isFinite(now) ? now : Date.now();
}

function pairLatLng(point) {
    if (Array.isArray(point) && point.length >= 2) {
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    if (point && typeof point === "object") {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const earthKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stripXmlNoise(xml) {
    return String(xml || "")
        .replace(/^\uFEFF/, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<\?[\s\S]*?\?>/g, "")
        .replace(/<!DOCTYPE[\s\S]*?>/gi, "");
}

function pointsFor(xml, tag) {
    const re = new RegExp(
        `<(?:[\\w.-]+:)?${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>)`,
        "gi"
    );
    const points = [];
    for (const match of xml.matchAll(re)) {
        const attrs = match[1] || "";
        const body = match[2] || "";
        const lat = Number(attr(attrs, "lat"));
        const lng = Number(attr(attrs, "lon") || attr(attrs, "lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        const timeMs = Date.parse(childText(body, "time"));
        points.push({ lat, lng, timeMs: Number.isFinite(timeMs) ? timeMs : null });
    }
    return points;
}

function attr(text, name) {
    const match = String(text || "").match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    if (!match) return "";
    return match[2] != null ? match[2] : (match[3] || "");
}

function childText(body, tag) {
    const match = String(body || "").match(new RegExp(
        `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`,
        "i"
    ));
    if (!match) return "";
    return decodeXml(unwrapCdata(match[1]).replace(/<[^>]+>/g, "").trim());
}

function firstNamed(xml, tag) {
    for (const parent of ["metadata", "trk", "rte"]) {
        const block = blockInner(xml, parent);
        const text = block ? childText(block, tag) : "";
        if (text) return text;
    }
    return childText(xml, tag);
}

function blockInner(xml, tag) {
    const match = String(xml || "").match(new RegExp(
        `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`,
        "i"
    ));
    return match ? match[1] : "";
}

function unwrapCdata(value) {
    const match = String(value || "").trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    return match ? match[1] : String(value || "");
}

function decodeXml(value) {
    return String(value || "")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => safeCodePoint(Number(num)))
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, "\"")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

function safeCodePoint(value) {
    if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
    try {
        return String.fromCodePoint(value);
    } catch {
        return "";
    }
}

function cleanText(value, max) {
    const text = String(value || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return text.slice(0, max).trim();
}

function thinPoints(points, max) {
    if (points.length <= max) return points.slice();
    const last = points.length - 1;
    const used = new Set();
    const out = [];
    for (let i = 0; i < max; i += 1) {
        const index = Math.round((i * last) / (max - 1));
        if (used.has(index)) continue;
        used.add(index);
        out.push(points[index]);
    }
    return out;
}
