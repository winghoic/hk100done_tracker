import {
    GUEST_STORAGE_KEY,
    emptyState,
    explainAuthError,
    explainSyncError,
    guestStatus,
    isFirebaseConfigReady,
    isMeaningfulState,
    isOfflineSyncError,
    isSilentAuthError,
    planAccountLoad,
    readGuestState,
    readUserCache,
    shouldFallbackToRedirect,
    shrinkState,
    stampState,
    statusForPlan,
    userStorageKey,
    writeStoredState,
    applyUiEdits,
} from "./sync-model.js";

const UNCONFIGURED_SIGN_IN = "Google sign-in is not configured on this deployment yet, so this button cannot open Google. Hikes stay on this device. The site owner adds a Firebase web config and authorizes winghoic.github.io.";

export function createTrackerSync({
    config,
    storage,
    createBackend,
    now = () => Date.now(),
} = {}) {
    const configured = isFirebaseConfigReady(config);
    let backend = null;
    let mode = "guest";
    let uid = null;
    let user = null;
    let state = emptyState();
    let status = guestStatus(configured);
    let uploadedHikeIds = [];
    let cloudReadOk = false;
    let listeners = new Set();
    let chain = Promise.resolve();
    let unsub = null;
    let signingIn = false;
    let redirectNotice = "";

    function snapshot() {
        return {
            state,
            mode,
            configured,
            user: user
                ? {
                    uid: user.uid,
                    displayName: user.displayName || "",
                    email: user.email || "",
                    photoURL: user.photoURL || "",
                }
                : null,
            status: { ...status },
        };
    }

    function emit() {
        const current = snapshot();
        for (const listener of listeners) listener(current);
    }

    function enqueue(work) {
        const run = chain.then(work, work);
        chain = run.then(() => {}, () => {});
        return run;
    }

    function rememberGuest(next) {
        writeStoredState(storage, GUEST_STORAGE_KEY, next);
    }

    function rememberUser(next) {
        if (!uid) return;
        writeStoredState(storage, userStorageKey(uid), next);
    }

    async function applyUser(firebaseUser) {
        if (!firebaseUser || !isGoogleAccount(firebaseUser)) {
            if (firebaseUser && backend?.signOut) {
                try { await backend.signOut(); } catch { /* stay signed out locally */ }
            }
            mode = "guest";
            uid = null;
            user = null;
            uploadedHikeIds = [];
            cloudReadOk = false;
            state = readGuestState(storage);
            rememberGuest(state);
            status = redirectNotice
                ? { level: "error", message: redirectNotice }
                : guestStatus(configured);
            emit();
            return;
        }

        mode = "user";
        uid = firebaseUser.uid;
        user = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            photoURL: firebaseUser.photoURL || "",
        };
        const guest = readGuestState(storage);
        const cache = readUserCache(storage, uid);
        let cloud = emptyState();
        cloudReadOk = false;
        try {
            cloud = await backend.readCloud(uid);
            cloudReadOk = true;
            uploadedHikeIds = (cloud.hikes || []).map((hike) => hike.id);
        } catch (error) {
            state = isMeaningfulState(cache) ? cache : guest;
            rememberUser(state);
            status = {
                level: isOfflineSyncError(error) ? "offline" : "error",
                message: explainSyncError(error),
            };
            emit();
            return;
        }

        const plan = planAccountLoad({
            guest,
            cache,
            cloud,
            now: now(),
            uid,
        });
        state = plan.state;
        rememberUser(state);
        let synced = true;
        try {
            if (plan.backup) await backend.writeBackup(uid, plan.backup);
            if (plan.upload) {
                await backend.writeState(uid, shrinkState(state), {
                    previousHikeIds: uploadedHikeIds,
                    profile: profileFromUser(user, now()),
                });
                uploadedHikeIds = state.hikes.map((hike) => hike.id);
            }
            if (plan.clearGuest) rememberGuest(emptyState());
            status = statusForPlan(plan, true);
        } catch (error) {
            synced = false;
            status = {
                level: isOfflineSyncError(error) ? "offline" : "error",
                message: explainSyncError(error),
            };
        }
        if (!synced && plan.clearGuest) {
            status = {
                level: status.level,
                message: `${status.message} Guest hikes are still kept on this device until the upload succeeds.`,
            };
        }
        emit();
    }

    async function persistState() {
        if (mode !== "user" || !backend || !uid) {
            rememberGuest(state);
            status = guestStatus(configured);
            emit();
            return;
        }
        rememberUser(state);
        try {
            await backend.writeState(uid, shrinkState(state), {
                previousHikeIds: cloudReadOk ? uploadedHikeIds : [],
                profile: profileFromUser(user, now()),
            });
            uploadedHikeIds = state.hikes.map((hike) => hike.id);
            cloudReadOk = true;
            status = { level: "synced", message: "Saved to your Google account." };
        } catch (error) {
            status = {
                level: isOfflineSyncError(error) ? "offline" : "error",
                message: explainSyncError(error),
            };
        }
        emit();
    }

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        snapshot,
        async start() {
            if (!configured) {
                state = readGuestState(storage);
                rememberGuest(state);
                status = guestStatus(false);
                emit();
                return snapshot();
            }
            try {
                backend = await createBackend();
            } catch {
                backend = null;
            }
            if (!backend) {
                state = readGuestState(storage);
                rememberGuest(state);
                status = {
                    level: "error",
                    message: "Saved on this device. The cloud sign-in library did not load.",
                };
                emit();
                return snapshot();
            }
            try {
                const redirect = await backend.completeRedirect?.();
                if (redirect?.error) redirectNotice = explainAuthError(redirect.error);
            } catch (error) {
                redirectNotice = explainAuthError(error);
            }
            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    resolve();
                };
                unsub = backend.onAuthStateChanged((firebaseUser) => {
                    enqueue(() => applyUser(firebaseUser)).then(finish, finish);
                });
            });
            return snapshot();
        },
        async saveEdit(shown, ui) {
            return enqueue(async () => {
                const edited = applyUiEdits(state, shown, ui);
                state = stampState(state, edited, now());
                await persistState();
                return snapshot();
            });
        },
        async signInWithGoogle() {
            if (!configured) {
                status = guestStatus(false);
                emit();
                return { ok: false, message: UNCONFIGURED_SIGN_IN };
            }
            if (!backend) {
                return { ok: false, message: "Sign-in is still loading. Wait a moment and try again." };
            }
            if (mode === "user") return { ok: true };
            if (signingIn) return { ok: false, message: "Google sign-in is already open." };
            signingIn = true;
            status = { level: "signing-in", message: "Opening Google…" };
            emit();
            try {
                await backend.signInWithGoogle();
                return { ok: true };
            } catch (error) {
                if (isSilentAuthError(error)) {
                    status = guestStatus(true);
                    emit();
                    return { ok: false, silent: true };
                }
                if (shouldFallbackToRedirect(error) && backend.signInWithRedirect) {
                    try {
                        status = { level: "signing-in", message: "Continuing Google sign-in in this window…" };
                        emit();
                        await backend.signInWithRedirect();
                        return { ok: true, redirecting: true, message: status.message };
                    } catch (redirectError) {
                        const message = explainAuthError(redirectError);
                        status = { level: "error", message };
                        emit();
                        return { ok: false, message };
                    }
                }
                const message = explainAuthError(error);
                status = { level: "error", message };
                emit();
                return { ok: false, message };
            } finally {
                signingIn = false;
            }
        },
        async signOut() {
            if (!backend) return snapshot();
            await backend.signOut();
            return snapshot();
        },
        stop() {
            if (unsub) unsub();
            unsub = null;
        },
        whenIdle() {
            return chain;
        },
    };
}

function isGoogleAccount(user) {
    if (!user?.uid) return false;
    if (user.providerId === "google.com") return true;
    return Array.isArray(user.providerData) && user.providerData.some((entry) => entry?.providerId === "google.com");
}

function profileFromUser(account, updatedAt) {
    return {
        displayName: account.displayName || "",
        email: account.email || "",
        photoURL: account.photoURL || "",
        provider: "google.com",
        updatedAt,
    };
}
