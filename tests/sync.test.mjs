import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTrackerSync } from "../js/cloud-sync.js";
import {
    applyUiEdits,
    cloudDocumentPlan,
    createHikeId,
    encodeFirestoreValue,
    explainAuthError,
    isFirebaseConfigReady,
    mergeByRecency,
    normalizeState,
    planAccountLoad,
    readGuestState,
    shrinkHikeForCloud,
    stampState,
    toFirebaseAppConfig,
    userStorageKey,
} from "../js/sync-model.js";

const READY = {
    enabled: true,
    apiKey: "test-api-key",
    authDomain: "demo.firebaseapp.com",
    projectId: "demo",
    appId: "1:2:web:abc",
};

test("blank and placeholder Firebase config stays disabled", () => {
    assert.equal(isFirebaseConfigReady({ enabled: false, apiKey: "", authDomain: "", projectId: "", appId: "" }), false);
    assert.equal(isFirebaseConfigReady({ ...READY, enabled: false }), false);
    assert.equal(isFirebaseConfigReady({ ...READY, apiKey: "YOUR_API_KEY" }), false);
    assert.equal(isFirebaseConfigReady({ ...READY, projectId: "" }), false);
    assert.equal(isFirebaseConfigReady(READY), true);
    assert.deepEqual(toFirebaseAppConfig({ ...READY, storageBucket: "" }).storageBucket, undefined);
    assert.equal(toFirebaseAppConfig(READY).projectId, "demo");
});

test("legacy guest keys are adopted and new guest data is kept separate from a user cache", () => {
    const storage = memoryStorage({
        "hk100_progress_default-app-id": JSON.stringify({
            completedChallenges: { 1: true },
            completionDates: { 1: "1/1/2026" },
        }),
        "hk100_history_default-app-id": JSON.stringify([
            { id: "local_20", name: "Probe Hike", distance: "3.50", duration: 120, weekId: 1, points: [[22.2, 114.2]] },
        ]),
    });
    const guest = readGuestState(storage);
    assert.equal(guest.completedChallenges["1"], true);
    assert.equal(guest.hikes[0].name, "Probe Hike");
    assert.deepEqual(guest.hikes[0].points, [[22.2, 114.2]]);
    assert.notEqual(userStorageKey("ada"), userStorageKey("grace"));
    assert.equal(userStorageKey("ada").includes("hk100_guest_v1"), false);
});

test("hikes sort by time and cloud documents cannot contain nested arrays", () => {
    const state = normalizeState({
        hikes: [
            { id: "hike_b", name: "Older", createdAt: 10, points: [[22.1, 114.1]] },
            { id: "hike_a", name: "Newer", createdAt: 50, points: [{ lat: 22.3, lng: 114.3 }] },
        ],
    });
    assert.deepEqual(state.hikes.map((hike) => hike.name), ["Newer", "Older"]);
    assert.deepEqual(state.hikes[0].points, [[22.3, 114.3]]);
    const encoded = encodeFirestoreValue(state);
    assert.deepEqual(encoded.hikes[0].points, [{ lat: 22.3, lng: 114.3 }]);
    assert.equal(encoded.hikes.some((hike) => hike.points.some((point) => Array.isArray(point))), false);
    const plan = cloudDocumentPlan("ada", ["hike_old"], state);
    assert.deepEqual(plan.progressPath, ["users", "ada", "tracker", "progress"]);
    assert.deepEqual(plan.deleteHikePaths, [["users", "ada", "hikes", "hike_old"]]);
    assert.equal(createHikeId(123, 0.5).startsWith("hike_123_"), true);
});

test("merge keeps both sides, prefers the newer hike, and an edit made before cloud data loads does not wipe it", () => {
    const cloud = normalizeState({
        completedChallenges: { 2: true },
        completionDates: { 2: "2/2/2026" },
        hikes: [{ id: "shared", name: "Cloud name", updatedAt: 10, createdAt: 10 }],
    });
    const guest = normalizeState({
        completedChallenges: { 3: true },
        completionDates: { 3: "3/3/2026" },
        hikes: [
            { id: "shared", name: "Guest name", updatedAt: 20, createdAt: 10 },
            { id: "guest-only", name: "Local only", updatedAt: 5, createdAt: 5 },
        ],
    });
    const merged = mergeByRecency(cloud, guest);
    assert.equal(merged.hikes.find((hike) => hike.id === "shared").name, "Guest name");
    assert.equal(merged.hikes.some((hike) => hike.id === "guest-only"), true);
    assert.equal(merged.completedChallenges["2"], true);
    assert.equal(merged.completedChallenges["3"], true);

    const tied = mergeByRecency(
        { ...cloud, hikes: [{ id: "shared", name: "Cloud name", updatedAt: 10, createdAt: 10 }] },
        { hikes: [{ id: "shared", name: "Guest name", updatedAt: 10, createdAt: 10 }] }
    );
    assert.equal(tied.hikes[0].name, "Cloud name");

    const edited = applyUiEdits(cloud, { completedChallenges: {}, completionDates: {}, hikes: [] }, {
        completedChallenges: {},
        completionDates: {},
        hikes: [{ id: "new-hike", name: "Recorded early", createdAt: 30 }],
    });
    assert.equal(edited.completedChallenges["2"], true);
    assert.deepEqual(edited.hikes.map((hike) => hike.id).sort(), ["new-hike", "shared"]);
});

test("un-completing a week writes a tombstone instead of letting an older device restore it", () => {
    const previous = stampState({}, { completedChallenges: { 4: true }, completionDates: { 4: "4/4/2026" }, hikes: [] }, 100);
    const next = stampState(previous, { completedChallenges: {}, completionDates: {}, hikes: [] }, 200);
    assert.equal(next.completedChallenges["4"], undefined);
    assert.equal(next.challengeMeta["4"].done, false);
    assert.equal(next.challengeMeta["4"].updatedAt, 200);
    const restored = mergeByRecency(previous, next);
    assert.equal(restored.completedChallenges["4"], undefined);
});

test("oversized photos stay marked for local-only storage", () => {
    const shrunk = shrinkHikeForCloud({
        id: "hike_1",
        name: "Photo hike",
        photo: "x".repeat(900000),
        points: [[22, 114]],
        createdAt: 1,
    }, 1000);
    assert.equal(shrunk.photo, null);
    assert.equal(shrunk.photoOmitted, true);
    assert.equal(shrunk.points.length, 1);
});

test("guest mode persists locally and explains that Google is not configured", async () => {
    const { sync, storage } = harness({ config: { enabled: false } });
    await sync.start();
    const saved = await sync.saveEdit(
        { completedChallenges: {}, completionDates: {}, hikes: [] },
        {
            completedChallenges: { 1: true },
            completionDates: { 1: "1/1/2026" },
            hikes: [{ id: "hike_1", name: "Guest ridge", createdAt: 5, points: [[22, 114]] }],
        }
    );
    assert.equal(saved.mode, "guest");
    assert.equal(saved.status.level, "unconfigured");
    assert.match(saved.status.message, /not configured/i);
    const stored = JSON.parse(storage.getItem("hk100_guest_v1"));
    assert.equal(stored.hikes[0].name, "Guest ridge");
    assert.equal(stored.completedChallenges["1"], true);
    const signIn = await sync.signInWithGoogle();
    assert.equal(signIn.ok, false);
    assert.match(signIn.message, /winghoic\.github\.io/);
    assert.equal(storage.dump()["hk100_user_v1_ada"], undefined);
});

test("first Google sign-in migrates guest data, stores a backup, and sign-out returns to an empty guest", async () => {
    const { sync, storage, users } = harness({
        stored: {
            hk100_guest_v1: JSON.stringify({
                completedChallenges: { 1: true },
                completionDates: { 1: "1/1/2026" },
                hikes: [{ id: "hike_guest", name: "From this phone", createdAt: 40, updatedAt: 40 }],
            }),
        },
    });
    await sync.start();
    await sync.whenIdle();
    const signIn = await sync.signInWithGoogle();
    assert.equal(signIn.ok, true);
    await sync.whenIdle();

    const account = users.get("ada");
    assert.equal(account.backups.length, 1);
    assert.equal(account.backups[0].reason, "migrated");
    assert.equal(account.backups[0].guest.hikes[0].name, "From this phone");
    assert.equal(account.state.hikes[0].name, "From this phone");
    assert.equal(account.profile.email, "ada@example.com");
    assert.equal(account.profile.provider, "google.com");
    const guestAfter = JSON.parse(storage.getItem("hk100_guest_v1"));
    assert.equal(guestAfter.hikes.length, 0);
    assert.equal(sync.snapshot().status.level, "migrated");

    await sync.signOut();
    await sync.whenIdle();
    assert.equal(sync.snapshot().user, null);
    assert.equal(sync.snapshot().state.hikes.length, 0);
    assert.match(sync.snapshot().status.message, /this device/i);

    await sync.signInWithGoogle();
    await sync.whenIdle();
    assert.equal(users.get("ada").backups.length, 1);
    assert.equal(sync.snapshot().state.hikes[0].name, "From this phone");
});

test("sign-in merges guest hikes with hikes already stored on that Google account", async () => {
    const cloud = normalizeState({
        completedChallenges: { 8: true },
        completionDates: { 8: "8/8/2026" },
        hikes: [{ id: "cloud-hike", name: "Already synced", createdAt: 10, updatedAt: 10 }],
    });
    const { sync, storage, users } = harness({
        stored: {
            hk100_guest_v1: JSON.stringify({
                hikes: [{ id: "guest-hike", name: "Not uploaded yet", createdAt: 12, updatedAt: 12 }],
            }),
        },
        cloud,
    });
    await sync.start();
    await sync.whenIdle();
    await sync.signInWithGoogle();
    await sync.whenIdle();
    const names = sync.snapshot().state.hikes.map((hike) => hike.name).sort();
    assert.deepEqual(names, ["Already synced", "Not uploaded yet"]);
    assert.equal(sync.snapshot().state.completedChallenges["8"], true);
    assert.equal(users.get("ada").backups[0].reason, "merged");
    assert.equal(JSON.parse(storage.getItem("hk100_guest_v1")).hikes.length, 0);

    await sync.signOut();
    await sync.whenIdle();
    const second = harness({
        stored: storage.dump(),
        user: { uid: "grace", displayName: "Grace", email: "grace@example.com", providerId: "google.com" },
    });
    await second.sync.start();
    await second.sync.whenIdle();
    await second.sync.signInWithGoogle();
    await second.sync.whenIdle();
    assert.equal(second.sync.snapshot().user.uid, "grace");
    assert.equal(second.sync.snapshot().state.hikes.length, 0);
    assert.equal(second.users.get("ada"), undefined);
});

test("failed cloud migration keeps the guest copy", async () => {
    const { sync, storage, backend } = harness({
        stored: {
            hk100_guest_v1: JSON.stringify({
                hikes: [{ id: "hike_keep", name: "Keep me", createdAt: 3, updatedAt: 3 }],
            }),
        },
    });
    backend.writeBackup = async () => {
        const error = new Error("Missing or insufficient permissions.");
        error.code = "permission-denied";
        throw error;
    };
    await sync.start();
    await sync.whenIdle();
    await sync.signInWithGoogle();
    await sync.whenIdle();
    const guest = JSON.parse(storage.getItem("hk100_guest_v1"));
    assert.equal(guest.hikes[0].name, "Keep me");
    assert.match(sync.snapshot().status.message, /denied/i);
});

test("offline reads use the account cache and a blocked popup falls back to redirect", async () => {
    const { sync, backend } = harness({
        stored: {
            hk100_user_v1_ada: JSON.stringify({
                hikes: [{ id: "cached", name: "Cached ridge", createdAt: 9, updatedAt: 9 }],
            }),
        },
    });
    backend.readCloud = async () => {
        const error = new Error("offline");
        error.code = "unavailable";
        throw error;
    };
    await sync.start();
    await sync.whenIdle();
    await sync.signInWithGoogle();
    await sync.whenIdle();
    assert.equal(sync.snapshot().state.hikes[0].name, "Cached ridge");
    assert.equal(sync.snapshot().status.level, "offline");

    await sync.signOut();
    await sync.whenIdle();
    backend.signInWithGoogle = async () => {
        const error = new Error("blocked");
        error.code = "auth/popup-blocked";
        throw error;
    };
    const blocked = await sync.signInWithGoogle();
    assert.equal(blocked.redirecting, true);
    assert.equal(backend.redirects, 1);

    backend.signInWithGoogle = async () => {
        const error = new Error("closed");
        error.code = "auth/popup-closed-by-user";
        throw error;
    };
    const closed = await sync.signInWithGoogle();
    assert.equal(closed.silent, true);

    backend.signInWithGoogle = async () => {
        const error = new Error("domain");
        error.code = "auth/unauthorized-domain";
        throw error;
    };
    const domain = await sync.signInWithGoogle();
    assert.equal(domain.ok, false);
    assert.equal(backend.redirects, 1);
    assert.match(domain.message, /winghoic\.github\.io/);
    assert.match(explainAuthError({ code: "auth/unauthorized-domain" }), /winghoic\.github\.io/);
});

test("deleting a synced hike removes that cloud document only", async () => {
    const { sync, users } = harness({});
    await sync.start();
    await sync.whenIdle();
    await sync.signInWithGoogle();
    await sync.whenIdle();
    await sync.saveEdit(
        { completedChallenges: {}, completionDates: {}, hikes: [] },
        { completedChallenges: {}, completionDates: {}, hikes: [{ id: "hike_keep", name: "Keep", createdAt: 2 }, { id: "hike_drop", name: "Drop", createdAt: 3 }] }
    );
    await sync.saveEdit(
        { completedChallenges: {}, completionDates: {}, hikes: [{ id: "hike_keep", name: "Keep", createdAt: 2 }, { id: "hike_drop", name: "Drop", createdAt: 3 }] },
        { completedChallenges: {}, completionDates: {}, hikes: [{ id: "hike_keep", name: "Keep", createdAt: 2 }] }
    );
    const writes = users.get("ada").writes;
    const last = cloudDocumentPlan("ada", writes.at(-1).previousHikeIds, { hikes: [{ id: "hike_keep", name: "Keep", createdAt: 2 }] });
    assert.deepEqual(last.deleteHikePaths, [["users", "ada", "hikes", "hike_drop"]]);
});

test("repo contract: no invented Firebase project, rules bind Google users, Pages setup is documented", () => {
    const config = readFileSync(new URL("../js/firebase-config.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const docs = readFileSync(new URL("../docs/CLOUD_SIGNIN.md", import.meta.url), "utf8");
    const boot = readFileSync(new URL("../js/boot.js", import.meta.url), "utf8");

    assert.match(config, /enabled:\s*false/);
    assert.match(config, /apiKey:\s*""/);
    assert.doesNotMatch(config, /AIza/);
    assert.doesNotMatch(page, /__firebase_config|signInAnonymously|onclick="loginWithGoogle\(\)"/);
    assert.match(page, /src="\.\/js\/boot\.js"/);
    assert.match(page, /hk100_guest_v1/);
    assert.match(boot, /window\.loginWithGoogle/);
    assert.match(rules, /sign_in_provider == 'google.com'/);
    assert.match(rules, /request\.auth\.uid == userId/);
    assert.doesNotMatch(rules, /allow read, write: if true/);
    assert.match(docs, /winghoic\.github\.io/);
    assert.match(docs, /https:\/\/winghoic\.github\.io\/hk100done_tracker\//);
    assert.match(docs, /\/__\/auth\/handler/);
    assert.match(docs, /Authorized domains/);
    assert.match(docs, /firebase deploy --only firestore:rules/);
    const plan = planAccountLoad({
        guest: { hikes: [] },
        cache: { hikes: [] },
        cloud: { hikes: [] },
        now: 1,
        uid: "ada",
    });
    assert.equal(plan.upload, false);
    assert.equal(plan.backup, null);
});

function memoryStorage(initial = {}) {
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
        dump() {
            return Object.fromEntries(map);
        },
    };
}

function harness({ config = READY, stored = {}, cloud = null, user = null } = {}) {
    const account = user || {
        uid: "ada",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        photoURL: "",
        providerId: "google.com",
    };
    const storage = memoryStorage(stored);
    const users = new Map();
    if (cloud) users.set(account.uid, { state: cloud, backups: [], writes: [] });
    const backend = {
        current: null,
        redirects: 0,
        listener: null,
        emit(user) {
            this.listener?.(user);
        },
        async completeRedirect() {
            return { error: null };
        },
        onAuthStateChanged(callback) {
            this.listener = callback;
            queueMicrotask(() => callback(this.current));
            return () => {
                if (this.listener === callback) this.listener = null;
            };
        },
        async signInWithGoogle() {
            this.current = account;
            this.emit(this.current);
        },
        async signInWithRedirect() {
            this.redirects += 1;
        },
        async signOut() {
            this.current = null;
            this.emit(null);
        },
        async readCloud(uid) {
            return users.get(uid)?.state || { completedChallenges: {}, completionDates: {}, hikes: [] };
        },
        async writeBackup(uid, backup) {
            const row = users.get(uid) || { state: { hikes: [] }, backups: [], writes: [] };
            row.backups.push(backup);
            users.set(uid, row);
        },
        async writeState(uid, state, extras) {
            const row = users.get(uid) || { state, backups: [], writes: [] };
            row.state = state;
            row.writes.push(extras);
            row.profile = extras.profile;
            users.set(uid, row);
        },
    };
    const sync = createTrackerSync({
        config,
        storage,
        createBackend: async () => backend,
        now: () => 1_700_000_000_000,
    });
    return { sync, storage, users, backend };
}
