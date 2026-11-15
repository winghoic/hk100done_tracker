// Personal 4th-edition (2026–2027) score table.
// Names copy the characters already stored on all100Peaks in index.html.
// Rank, elevation, and score come from the printed table and are not GPS data.
// Suffixes keep the two 蓮花山 peaks and the two 象山 peaks apart.

const AMBIGUOUS_BASES = ["蓮花山", "象山"];

export const EDITION4_PEAKS = [
    { rank: 1, name: "大帽山", elev: 957, score: 1052, weekId: 24, repoName: "大帽山" },
    { rank: 2, name: "鳳凰山", elev: 934, score: 1308, weekId: 31, repoName: "鳳凰山" },
    { rank: 3, name: "大東山", elev: 869, score: 1217, weekId: 26, repoName: "大東山" },
    { rank: 4, name: "四方山", elev: 784, score: 784, weekId: 24, repoName: "四方山" },
    { rank: 5, name: "妙高台", elev: 779, score: 1013, weekId: 24, repoName: "妙高台" },
    { rank: 6, name: "禾秧山", elev: 767, score: 997, weekId: 24, repoName: "禾秧山" },
    { rank: 7, name: "蓮花山（嶼）", elev: 766, score: 919, weekId: 26, repoName: "蓮花山", aliases: ["蓮花山(嶼)"] },
    { rank: 8, name: "彌勒山", elev: 751, score: 976, weekId: 31, repoName: "彌勒山" },
    { rank: 9, name: "二東山", elev: 749, score: 974, weekId: 26, repoName: "二東山" },
    { rank: 10, name: "鴨腳瀝", elev: 722, score: 939, weekId: 26, repoName: "鴨腳瀝" },
    { rank: 11, name: "馬鞍山", elev: 702, score: 913, weekId: 30, repoName: "馬鞍山" },
    { rank: 12, name: "牛押山", elev: 677, score: 880, weekId: 30, repoName: "牛押山" },
    { rank: 13, name: "草山", elev: 647, score: 776, weekId: 12, repoName: "草山" },
    { rank: 14, name: "黃嶺", elev: 639, score: 831, weekId: 25, repoName: "黃嶺" },
    { rank: 15, name: "水牛山", elev: 606, score: 788, weekId: 20, repoName: "水牛山" },
    { rank: 16, name: "黃牛山", elev: 604, score: 785, weekId: 20, repoName: "黃牛山" },
    { rank: 17, name: "飛鵝山", elev: 602, score: 783, weekId: 18, repoName: "飛鵝山" },
    { rank: 18, name: "彎曲山", elev: 592, score: 710, weekId: 30, repoName: "彎曲山" },
    { rank: 19, name: "八仙嶺（純陽峰）", elev: 590, score: 767, weekId: 25, repoName: "八仙嶺 純陽峰", aliases: ["八仙嶺純陽峰", "八仙嶺(純陽峰)", "八仙嶺"] },
    { rank: 20, name: "吊手岩", elev: 588, score: 823, weekId: 30, repoName: "吊手岩" },
    { rank: 21, name: "象山（九龍）", elev: 585, score: 761, weekId: 18, repoName: "象山", aliases: ["象山(九龍)"] },
    { rank: 22, name: "雞公嶺", elev: 585, score: 819, weekId: 28, repoName: "雞公嶺" },
    { rank: 23, name: "青山", elev: 583, score: 758, weekId: 29, repoName: "青山" },
    { rank: 24, name: "蓮花山（荃灣）", elev: 578, score: 578, weekId: 13, repoName: "蓮花山", aliases: ["蓮花山(荃灣)"] },
    { rank: 25, name: "大老山", elev: 577, score: 577, weekId: 18, repoName: "大老山" },
    { rank: 26, name: "大刀屻", elev: 566, score: 735.8, weekId: 28, repoName: "大刀屻" },
    { rank: 27, name: "鱷魚朝天", elev: 559, score: 671, weekId: 13, repoName: "鱷魚朝天" },
    { rank: 28, name: "太平山", elev: 552, score: 607, weekId: 2, repoName: "太平山" },
    { rank: 29, name: "犂壁山", elev: 550, score: 660, weekId: 25, repoName: "犂壁山", aliases: ["犁壁山"] },
    { rank: 30, name: "東山", elev: 544, score: 544, weekId: 18, repoName: "東山" },
    { rank: 31, name: "石芽山", elev: 540, score: 702, weekId: 20, repoName: "石芽山" },
    { rank: 32, name: "狗牙嶺", elev: 539, score: 701, weekId: 31, repoName: "狗牙嶺" },
    { rank: 33, name: "大金鐘", elev: 536, score: 697, weekId: 30, repoName: "大金鐘" },
    { rank: 34, name: "東洋山", elev: 532, score: 638, weekId: 8, repoName: "東洋山" },
    { rank: 35, name: "針山", elev: 532, score: 692, weekId: 12, repoName: "針山" },
    { rank: 36, name: "柏架山", elev: 532, score: 692, weekId: 6, repoName: "柏架山" },
    { rank: 37, name: "萡刀屻", elev: 529, score: 688, weekId: 23, repoName: "萡刀屻", aliases: ["薄刀屻"] },
    { rank: 38, name: "屏風山", elev: 529, score: 688, weekId: 25, repoName: "屏風山" },
    { rank: 39, name: "九逕山", elev: 507, score: 659, weekId: 17, repoName: "九逕山", aliases: ["九徑山"] },
    { rank: 40, name: "獅子山", elev: 495, score: 644, weekId: 7, repoName: "獅子山" },
    { rank: 41, name: "西高山", elev: 493, score: 542, weekId: 2, repoName: "西高山" },
    { rank: 42, name: "紅花嶺", elev: 492, score: 640, weekId: 14, repoName: "紅花嶺" },
    { rank: 43, name: "靈會山", elev: 490, score: 637, weekId: 22, repoName: "靈會山" },
    { rank: 44, name: "慈雲山", elev: 490, score: 588, weekId: 18, repoName: "慈雲山" },
    { rank: 45, name: "紅花寨", elev: 487, score: 633, weekId: 14, repoName: "紅花寨" },
    { rank: 46, name: "龜頭嶺", elev: 486, score: 632, weekId: 14, repoName: "龜頭嶺" },
    { rank: 47, name: "婆髻山", elev: 482, score: 627, weekId: 23, repoName: "婆髻山" },
    { rank: 48, name: "石屋山", elev: 481, score: 625, weekId: 27, repoName: "石屋山" },
    { rank: 49, name: "北大刀屻", elev: 480, score: 624, weekId: 28, repoName: "北大刀屻" },
    { rank: 50, name: "石龍拱", elev: 474, score: 616, weekId: 13, repoName: "石龍拱" },
    { rank: 51, name: "蚺蛇尖", elev: 468, score: 655.2, weekId: 27, repoName: "蚺蛇尖" },
    { rank: 52, name: "大磡森", elev: 466, score: 652, weekId: 22, repoName: "大磡森" },
    { rank: 53, name: "老虎頭", elev: 465, score: 605, weekId: 10, repoName: "老虎頭" },
    { rank: 54, name: "羗山", elev: 459, score: 597, weekId: 22, repoName: "羗山", aliases: ["羌山"] },
    { rank: 55, name: "筆架山", elev: 457, score: 503, weekId: 7, repoName: "筆架山" },
    { rank: 56, name: "象山（大嶼山）", elev: 449, score: 584, weekId: 22, repoName: "象山", aliases: ["象山(大嶼山)"] },
    { rank: 57, name: "九龍坑山", elev: 440, score: 572, weekId: 3, repoName: "九龍坑山" },
    { rank: 58, name: "金馬倫山", elev: 439, score: 571, weekId: 11, repoName: "金馬倫山" },
    { rank: 59, name: "畢拿山", elev: 435, score: 522, weekId: 6, repoName: "畢拿山" },
    { rank: 60, name: "觀音山（羌山）", elev: 434, score: 564, weekId: 21, repoName: "觀音山", aliases: ["觀音山(羌山)", "觀音山（羗山）", "觀音山"] },
    { rank: 61, name: "紫羅蘭山", elev: 433, score: 563, weekId: 11, repoName: "紫羅蘭山" },
    { rank: 62, name: "渣甸山", elev: 433, score: 563, weekId: 6, repoName: "渣甸山" },
    { rank: 63, name: "鷓鴣山", elev: 432, score: 562, weekId: 9, repoName: "鷓鴣山" },
    { rank: 64, name: "深坑瀝", elev: 431, score: 560, weekId: 21, repoName: "深坑瀝" },
    { rank: 65, name: "聶高信山", elev: 429, score: 558, weekId: 11, repoName: "聶高信山" },
    { rank: 66, name: "中狗牙嶺", elev: 428, score: 556, weekId: 31, repoName: "中狗牙嶺", aliases: ["中狗牙"] },
    { rank: 67, name: "小馬山", elev: 424, score: 509, weekId: 6, repoName: "小馬山" },
    { rank: 68, name: "吊燈籠", elev: 416, score: 582, weekId: 15, repoName: "吊燈籠" },
    { rank: 69, name: "鹿巢山", elev: 414, score: 538, weekId: 8, repoName: "鹿巢山" },
    { rank: 70, name: "大枕蓋", elev: 408, score: 530, weekId: 16, repoName: "大枕蓋" },
    { rank: 71, name: "鹿山", elev: 408, score: 530, weekId: 5, repoName: "鹿山" },
    { rank: 72, name: "女婆山", elev: 399, score: 519, weekId: 5, repoName: "女婆山" },
    { rank: 73, name: "狗肚山", elev: 399, score: 519, weekId: 5, repoName: "狗肚山" },
    { rank: 74, name: "雞公山", elev: 399, score: 559, weekId: 16, repoName: "雞公山" },
    { rank: 75, name: "大上托", elev: 399, score: 519, weekId: 9, repoName: "大上托" },
    { rank: 76, name: "乾山", elev: 394, score: 551.6, weekId: 29, repoName: "乾山" },
    { rank: 77, name: "畫眉山", elev: 391, score: 508, weekId: 27, repoName: "畫眉山" },
    { rank: 78, name: "孖崗山", elev: 386, score: 502, weekId: 11, repoName: "孖崗山" },
    { rank: 79, name: "雷打石", elev: 379, score: 531, weekId: 27, repoName: "雷打石" },
    { rank: 80, name: "圓頭山", elev: 375, score: 525, weekId: 29, repoName: "圓頭山" },
    { rank: 81, name: "牙鷹山", elev: 374, score: 486, weekId: 21, repoName: "牙鷹山" },
    { rank: 82, name: "水泉澳", elev: 372, score: 484, weekId: 5, repoName: "水泉澳" },
    { rank: 83, name: "大蚊山", elev: 370, score: 518, weekId: 19, repoName: "大蚊山" },
    { rank: 84, name: "金山", elev: 369, score: 480, weekId: 12, repoName: "金山" },
    { rank: 85, name: "龍山", elev: 361, score: 505, weekId: 3, repoName: "龍山" },
    { rank: 86, name: "釣魚翁", elev: 344, score: 447, weekId: 9, repoName: "釣魚翁" },
    { rank: 87, name: "桃坑峒", elev: 344, score: 447, weekId: 17, repoName: "桃坑峒", aliases: ["桃坑峗", "桃花峗"] },
    { rank: 88, name: "孖指徑", elev: 337, score: 371, weekId: 12, repoName: "孖指徑" },
    { rank: 89, name: "春花落", elev: 334, score: 434, weekId: 4, repoName: "春花落" },
    { rank: 90, name: "獅山", elev: 322, score: 419, weekId: 21, repoName: "獅山" },
    { rank: 91, name: "太墩", elev: 317, score: 412, weekId: 16, repoName: "太墩" },
    { rank: 92, name: "下花山", elev: 315, score: 410, weekId: 13, repoName: "下花山" },
    { rank: 93, name: "西灣山", elev: 314, score: 408, weekId: 19, repoName: "西灣山" },
    { rank: 94, name: "花香爐頂", elev: 310, score: 434, weekId: 29, repoName: "花香爐頂" },
    { rank: 95, name: "鷹巢山標高柱", elev: 305, score: 397, weekId: 7, repoName: "鷹巢山標高柱", aliases: ["鷹巢山"] },
    { rank: 96, name: "五桂山", elev: 304, score: 365, weekId: 9, repoName: "五桂山" },
    { rank: 97, name: "老人山", elev: 303, score: 424, weekId: 10, repoName: "老人山" },
    { rank: 98, name: "馬頭峰", elev: 295, score: 384, weekId: 15, repoName: "馬頭峰" },
    { rank: 99, name: "四排石山", elev: 290, score: 377, weekId: 4, repoName: "四排石山" },
    { rank: 100, name: "打爛埕頂", elev: 284, score: 369, weekId: 1, repoName: "打爛埕頂" },
];

const BARE_GROUPS = [
    {
        base: "蓮花山",
        choices: [
            { rank: 7, weekId: 26, elev: "766" },
            { rank: 24, weekId: 13, elev: "578" },
        ],
    },
    {
        base: "象山",
        choices: [
            { rank: 21, weekId: 18, elev: "585" },
            { rank: 56, weekId: 22, elev: "449" },
        ],
    },
];

const AMBIGUOUS_NORMALIZED = new Set(AMBIGUOUS_BASES.map((name) => normalizePeakText(name)));
const ALIAS_INDEX = buildAliasIndex();
const WEEK_ANCHORS = buildWeekAnchors();

export function normalizePeakText(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .replace(/[\s·・,，、/|＋+&＆]+/g, "")
        .replace(/[()（）【】[\]「」『』]/g, "");
}

export function scoreToTenths(score) {
    return Math.round(Number(score) * 10);
}

export function formatScoreTenths(tenths) {
    const value = Math.round(Number(tenths) || 0);
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    if (abs % 10 === 0) return `${sign}${abs / 10}`;
    return `${sign}${Math.floor(abs / 10)}.${abs % 10}`;
}

export function formatTotals(summary) {
    const count = Number(summary?.hikedCount) || 0;
    return `${count} 座 / ${formatScoreTenths(summary?.scoreTenths)} 分`;
}

export function matchRanksInText(text) {
    const norm = normalizePeakText(text);
    if (!norm) return [];
    const used = new Array(norm.length).fill(false);
    const found = new Set();
    claimAliases(norm, used, found);
    claimBareNames(norm, used, found);
    return [...found].sort((a, b) => a - b);
}

export function hikedRanksFromState(state) {
    const source = state && typeof state === "object" ? state : {};
    const found = new Set();
    const completed = source.completedChallenges && typeof source.completedChallenges === "object"
        ? source.completedChallenges
        : {};

    for (const peak of EDITION4_PEAKS) {
        if (completed[peak.weekId] === true || completed[String(peak.weekId)] === true) {
            found.add(peak.rank);
        }
    }

    const hikes = Array.isArray(source.hikes) ? source.hikes : [];
    for (const hike of hikes) {
        const weekId = Number(hike?.weekId);
        if (Number.isInteger(weekId) && weekId > 0) {
            for (const peak of EDITION4_PEAKS) {
                if (peak.weekId === weekId) found.add(peak.rank);
            }
        }
        for (const rank of matchRanksInText(`${hike?.name || ""}\n${hike?.comment || ""}`)) {
            found.add(rank);
        }
    }

    return [...found].sort((a, b) => a - b);
}

export function summarizeEdition4(state) {
    const hiked = new Set(hikedRanksFromState(state));
    let scoreTenths = 0;
    const rows = EDITION4_PEAKS.map((peak) => {
        const done = hiked.has(peak.rank);
        const tenths = scoreToTenths(peak.score);
        if (done) scoreTenths += tenths;
        return {
            rank: peak.rank,
            name: peak.name,
            elev: peak.elev,
            score: peak.score,
            scoreTenths: tenths,
            weekId: peak.weekId,
            hiked: done,
        };
    });
    return {
        hikedCount: rows.filter((row) => row.hiked).length,
        scoreTenths,
        hikedRanks: rows.filter((row) => row.hiked).map((row) => row.rank),
        rows,
    };
}

function buildAliasIndex() {
    const seen = new Set();
    const entries = [];
    for (const peak of EDITION4_PEAKS) {
        const labels = [peak.name, peak.repoName, ...(peak.aliases || [])];
        for (const label of labels) {
            const norm = normalizePeakText(label);
            if (!norm || AMBIGUOUS_NORMALIZED.has(norm)) continue;
            const key = `${peak.rank}:${norm}`;
            if (seen.has(key)) continue;
            seen.add(key);
            entries.push({ rank: peak.rank, norm });
        }
    }
    entries.sort((a, b) => b.norm.length - a.norm.length || a.rank - b.rank);
    return entries;
}

function buildWeekAnchors() {
    const bareRanks = new Set(BARE_GROUPS.flatMap((group) => group.choices.map((choice) => choice.rank)));
    const anchors = new Map();
    for (const peak of EDITION4_PEAKS) {
        if (bareRanks.has(peak.rank)) continue;
        const list = anchors.get(peak.weekId) || [];
        list.push(peak.rank);
        anchors.set(peak.weekId, list);
    }
    return anchors;
}

function claimAliases(norm, used, found) {
    for (const entry of ALIAS_INDEX) {
        let from = 0;
        while (from < norm.length) {
            const at = norm.indexOf(entry.norm, from);
            if (at < 0) break;
            const end = at + entry.norm.length;
            if (isFree(used, at, end)) {
                markUsed(used, at, end);
                found.add(entry.rank);
            }
            from = at + entry.norm.length;
        }
    }
}

function claimBareNames(norm, used, found) {
    for (const group of BARE_GROUPS) {
        const base = normalizePeakText(group.base);
        let from = 0;
        while (from < norm.length) {
            const at = norm.indexOf(base, from);
            if (at < 0) break;
            const end = at + base.length;
            if (isFree(used, at, end)) {
                const rank = resolveBare(group, norm.slice(end, end + 4), found);
                if (rank) {
                    markUsed(used, at, end);
                    found.add(rank);
                }
            }
            from = end;
        }
    }
}

function resolveBare(group, tail, found) {
    for (const choice of group.choices) {
        if (tail.startsWith(choice.elev)) return choice.rank;
    }
    const matchedWeeks = [];
    for (const choice of group.choices) {
        const anchors = WEEK_ANCHORS.get(choice.weekId) || [];
        if (anchors.some((rank) => found.has(rank))) matchedWeeks.push(choice);
    }
    if (matchedWeeks.length === 1) return matchedWeeks[0].rank;
    return null;
}

function isFree(used, start, end) {
    for (let i = start; i < end; i += 1) {
        if (used[i]) return false;
    }
    return true;
}

function markUsed(used, start, end) {
    for (let i = start; i < end; i += 1) used[i] = true;
}

if (typeof window !== "undefined") {
    window.hk100Edition4 = {
        peaks: EDITION4_PEAKS,
        summarize: summarizeEdition4,
        formatScoreTenths,
        formatTotals,
    };
}
