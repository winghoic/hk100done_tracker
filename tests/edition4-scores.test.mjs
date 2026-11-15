import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    EDITION4_PEAKS,
    formatScoreTenths,
    formatTotals,
    hikedRanksFromState,
    matchRanksInText,
    scoreToTenths,
    summarizeEdition4,
} from "../js/edition4-scores.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scoreSource = readFileSync(new URL("../js/edition4-scores.js", import.meta.url), "utf8");

const KEPT_SPELLINGS = ["鴨腳瀝", "婆髻山", "蚺蛇尖", "大磡森", "鷓鴣山", "深坑瀝", "孖崗山", "孖指徑", "桃坑峒", "打爛埕頂", "萡刀屻", "犂壁山", "羗山", "鱷魚朝天", "九逕山", "中狗牙嶺", "鷹巢山標高柱", "大刀屻", "北大刀屻"];
const GARBLED = ["鴨腳滾", "婆魯山", "虺蛇尖", "大碏森", "鵬鴈山", "深坑滾", "嬽崗山", "嬽指徑", "桃坑崗", "打爛埔頂", "萱刀屻", "㿄壁山", "薀刀屻", "鵪鴉山", "蚪蛇尖", "大磋森", "大碣森", "鵬鴇山"];

test("the score table has 100 poster rows and keeps repo spellings", () => {
    assert.equal(EDITION4_PEAKS.length, 100);
    assert.deepEqual(EDITION4_PEAKS.map((peak) => peak.rank), Array.from({ length: 100 }, (_, i) => i + 1));

    const names = new Set(EDITION4_PEAKS.map((peak) => peak.name));
    for (const spelling of KEPT_SPELLINGS) assert.equal(names.has(spelling), true, spelling);
    assert.equal(names.has("蓮花山（嶼）"), true);
    assert.equal(names.has("蓮花山（荃灣）"), true);
    assert.equal(names.has("象山（九龍）"), true);
    assert.equal(names.has("象山（大嶼山）"), true);
    assert.equal(names.has("八仙嶺（純陽峰）"), true);
    assert.equal(names.has("觀音山（羌山）"), true);

    const byName = Object.fromEntries(EDITION4_PEAKS.map((peak) => [peak.name, peak]));
    assert.equal(byName["大刀屻"].score, 735.8);
    assert.equal(byName["蚺蛇尖"].score, 655.2);
    assert.equal(byName["乾山"].score, 551.6);
    assert.equal(scoreToTenths(byName["大刀屻"].score), 7358);
    assert.equal(scoreToTenths(byName["蚺蛇尖"].score), 6552);
    assert.equal(scoreToTenths(byName["乾山"].score), 5516);
    assert.equal(byName["大帽山"].score, 1052);
    assert.equal(byName["打爛埕頂"].score, 369);

    for (const garbled of GARBLED) {
        assert.equal(scoreSource.includes(garbled), false, garbled);
    }
    assert.doesNotMatch(scoreSource, /lat:|lng:/);
    assert.doesNotMatch(html, /sportiva/i);
});

test("every stored GPS peak maps once, and coordinates stay untouched", () => {
    const blockStart = html.indexOf("const all100Peaks = [");
    const blockEnd = html.indexOf("];", blockStart);
    const block = html.slice(blockStart, blockEnd + 2);
    assert.equal(createHash("sha256").update(block).digest("hex"), "ba96cd5a56ecae4e332139fb1d9190b55c8e3c43632c2efcea8f42e569874ac6");

    const arrayText = block.slice(block.indexOf("["), block.lastIndexOf("]") + 1);
    const catalog = Function(`"use strict"; return (${arrayText});`)();
    assert.equal(catalog.length, 100);
    const wanted = new Set(catalog.map((peak) => `${peak.weekId}:${peak.name}`));
    const linked = EDITION4_PEAKS.map((peak) => `${peak.weekId}:${peak.repoName}`);
    assert.equal(new Set(linked).size, 100);
    assert.deepEqual(new Set(linked), wanted);

    const lotus = EDITION4_PEAKS.filter((peak) => peak.repoName === "蓮花山");
    assert.deepEqual(lotus.map((peak) => [peak.name, peak.weekId, peak.elev]).sort(), [
        ["蓮花山（嶼）", 26, 766],
        ["蓮花山（荃灣）", 13, 578],
    ]);
    const elephant = EDITION4_PEAKS.filter((peak) => peak.repoName === "象山");
    assert.deepEqual(elephant.map((peak) => [peak.name, peak.weekId, peak.elev]).sort(), [
        ["象山（九龍）", 18, 585],
        ["象山（大嶼山）", 22, 449],
    ]);
});

test("week completion and hike names score the matching peak only", () => {
    const empty = summarizeEdition4({ completedChallenges: {}, hikes: [] });
    assert.equal(empty.hikedCount, 0);
    assert.equal(empty.scoreTenths, 0);
    assert.equal(formatTotals(empty), "0 座 / 0 分");
    assert.equal(empty.rows.every((row) => row.hiked === false), true);

    const sunset = summarizeEdition4({ completedChallenges: { 26: true }, hikes: [] });
    assert.deepEqual(sunset.hikedRanks, [3, 7, 9, 10]);
    assert.equal(formatTotals(sunset), "4 座 / 4049 分");
    assert.equal(sunset.rows.find((row) => row.rank === 24).hiked, false);

    const stringKey = hikedRanksFromState({ completedChallenges: { "13": true }, hikes: [] });
    assert.deepEqual(stringKey, [24, 27, 50, 92]);

    const named = summarizeEdition4({
        completedChallenges: {},
        hikes: [{ id: "h1", name: "大帽山", comment: "" }],
    });
    assert.deepEqual(named.hikedRanks, [1]);
    assert.equal(formatTotals(named), "1 座 / 1052 分");

    const route = matchRanksInText("大東山, 二東山, 蓮花山, 鴨腳瀝");
    assert.deepEqual(route, [3, 7, 9, 10]);
    assert.deepEqual(matchRanksInText("蓮花山"), []);
    assert.deepEqual(matchRanksInText("象山"), []);
    assert.deepEqual(matchRanksInText("飛鵝山 象山"), [17, 21]);
    assert.deepEqual(matchRanksInText("靈會山、大磡森、羗山、象山"), [43, 52, 54, 56]);
    assert.deepEqual(matchRanksInText("蓮花山766"), [7]);
    assert.deepEqual(matchRanksInText("蓮花山（荃灣）"), [24]);

    assert.deepEqual(matchRanksInText("中狗牙嶺"), [66]);
    assert.deepEqual(matchRanksInText("中狗牙"), [66]);
    assert.deepEqual(matchRanksInText("狗牙嶺"), [32]);
    assert.deepEqual(matchRanksInText("八仙嶺純陽峰"), [19]);
    assert.deepEqual(matchRanksInText("八仙嶺 純陽峰"), [19]);
    assert.deepEqual(matchRanksInText("鷹巢山"), [95]);
    assert.deepEqual(matchRanksInText("九徑山"), [39]);
    assert.deepEqual(matchRanksInText("薄刀屻"), [37]);
    assert.deepEqual(matchRanksInText("犁壁山"), [29]);
    assert.deepEqual(matchRanksInText("羌山"), [54]);
    assert.deepEqual(matchRanksInText("觀音山（羌山）"), [60]);
    assert.deepEqual(matchRanksInText("桃坑峗"), [87]);
    assert.deepEqual(matchRanksInText("桃花峗"), [87]);
    assert.deepEqual(matchRanksInText("北大刀屻"), [49]);
    assert.deepEqual(matchRanksInText("大刀屻"), [26]);

    const decimals = summarizeEdition4({
        completedChallenges: {},
        hikes: [{ name: "大刀屻" }, { name: "蚺蛇尖", comment: "乾山" }],
    });
    assert.equal(formatScoreTenths(decimals.scoreTenths), "1942.6");
    assert.equal(formatTotals(decimals), "3 座 / 1942.6 分");

    const week23 = hikedRanksFromState({
        completedChallenges: {},
        hikes: [{ name: "Tung Chung", weekId: "23" }],
    });
    assert.deepEqual(week23, [37, 47]);
});

test("the Scores tab is separate and the existing totals show the same score", () => {
    assert.match(html, /id="view-scores"/);
    assert.match(html, /switchTab\('scores'\)/);
    assert.match(html, /id="edition4ProgressText"/);
    assert.match(html, /id="edition4-list"/);
    assert.match(html, /id="scheduleScoreText"/);
    assert.match(html, /id="hk100BadgeScore"/);
    assert.match(html, /src="\.\/js\/edition4-scores\.js"/);
    assert.match(html, /function renderEdition4/);
    assert.match(html, /Not an official Life Fever product\./);
    assert.equal(html.split("Not an official Life Fever product.").length - 1, 2);
    assert.doesNotMatch(html, /sportiva/i);

    const progress = html.slice(html.indexOf("function readEditionProgress"), html.indexOf("function renderHistoryList"));
    assert.match(progress, /scheduleScoreText/);
    assert.match(progress, /hk100BadgeScore/);
    assert.match(progress, /edition4ProgressText/);
    assert.match(progress, /renderEdition4\(progress\)/);
    const profile = html.slice(html.indexOf("function updateProfileStats"), html.indexOf("function refreshVisibleMap"));
    assert.match(profile, /updateProgressRing\(\)/);
});
