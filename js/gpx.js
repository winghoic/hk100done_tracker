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
