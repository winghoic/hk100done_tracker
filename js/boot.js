import { firebaseConfig } from "./firebase-config.js";
import { createTrackerSync } from "./cloud-sync.js";
import { createHikeId, visibleFingerprint } from "./sync-model.js";
import { prepareGpxDownload, trackAvailability } from "./gpx.js";

const RETIRED_STRAVA_KEYS = ["hk100_strava_session_v1", "hk100_strava_oauth_v1"];

function forgetStoredStravaLogin() {
    for (const store of [window.localStorage, window.sessionStorage]) {
        if (!store) continue;
        for (const key of RETIRED_STRAVA_KEYS) {
            try {
                store.removeItem(key);
            } catch {
                /* private mode */
            }
        }
    }
}

forgetStoredStravaLogin();

const sync = createTrackerSync({
    config: firebaseConfig,
    storage: window.localStorage,
    createBackend: async () => {
        const { createFirebaseBackend } = await import("./firebase-backend.js");
        return createFirebaseBackend(firebaseConfig);
    },
});

window.createHikeId = () => createHikeId();
window.trackerSync = sync;
window.hikeTrackNote = (hike) => trackAvailability(hike).note;

window.downloadHikeGpx = function downloadHikeGpx(id) {
    const hike = findHike(id);
    if (!hike) return;
    const result = prepareGpxDownload(hike);
    if (!result.ok) {
        showAlert("No GPS track", result.message);
        return;
    }
    downloadFile(result.filename, result.contents, "application/gpx+xml");
};

window.loginWithGoogle = async function loginWithGoogle() {
    const result = await sync.signInWithGoogle();
    if (!result || result.ok || result.silent || result.redirecting || !result.message) return;
    if (typeof window.showIOSAlert === "function") {
        const title = /not configured/i.test(result.message) ? "Cloud sign-in is not set up" : "Sign-in did not finish";
        window.showIOSAlert(title, result.message, [{ text: "OK", style: "cancel" }]);
    }
};

window.logoutFromGoogle = function logoutFromGoogle() {
    const run = () => sync.signOut();
    if (typeof window.showIOSAlert !== "function") {
        run();
        return;
    }
    window.showIOSAlert(
        "Sign out?",
        "This device returns to a guest session. Hikes already stored for your Google account stay in the cloud.",
        [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", action: run },
        ]
    );
};

window.startTrackerSync = async function startTrackerSync() {
    sync.subscribe((snap) => {
        renderAccount(snap);
        const bridge = window.trackerBridge;
        if (!bridge) return;
        if (visibleFingerprint(bridge.getState()) === visibleFingerprint(snap.state)) return;
        bridge.replaceState(snap.state);
    });
    await sync.start();
    window.__trackerLoaded = true;
    const pendingEdit = typeof window.__consumePendingTrackerEdit === "function"
        ? window.__consumePendingTrackerEdit()
        : null;
    if (pendingEdit) await sync.saveEdit(pendingEdit.shown, pendingEdit.ui);
};

function renderAccount(snap) {
    const nameEl = document.getElementById("account-name");
    const emailEl = document.getElementById("account-email");
    const syncEl = document.getElementById("account-sync");
    const area = document.getElementById("account-action-area");
    const image = document.getElementById("user-avatar-image");
    const fallback = document.getElementById("user-avatar-fallback");
    if (!nameEl || !emailEl || !syncEl || !area) return;

    const account = snap.user;
    if (account) {
        nameEl.textContent = account.displayName || "Google account";
        emailEl.textContent = account.email || "Signed in with Google";
        showAvatar(image, fallback, account.photoURL);
        area.replaceChildren(accountButton("Sign out", false, () => window.logoutFromGoogle(), false));
    } else {
        nameEl.textContent = "Guest";
        emailEl.textContent = snap.configured ? "Not signed in" : "Saved on this device";
        showAvatar(image, fallback, "");
        const opening = snap.status.level === "signing-in";
        area.replaceChildren(accountButton(
            opening ? "Opening Google…" : "Sign in with Google",
            true,
            () => window.loginWithGoogle(),
            opening
        ));
    }
    syncEl.textContent = snap.status?.message || "";
}

function showAvatar(image, fallback, photoURL) {
    if (!image || !fallback) return;
    if (!photoURL) {
        image.removeAttribute("src");
        image.classList.add("hidden");
        fallback.classList.remove("hidden");
        return;
    }
    image.onload = () => {
        image.classList.remove("hidden");
        fallback.classList.add("hidden");
    };
    image.onerror = () => {
        image.classList.add("hidden");
        fallback.classList.remove("hidden");
    };
    image.src = photoURL;
}

function accountButton(label, google, onClick, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = disabled;
    button.id = google ? "btn-google-sign-in" : "btn-sign-out";
    button.className = google
        ? "w-full py-3.5 bg-white text-black font-bold rounded-2xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all shadow-lg disabled:opacity-60"
        : "w-full py-3.5 bg-white/10 text-white font-bold rounded-2xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all";
    if (google) {
        const icon = document.createElement("i");
        icon.className = "fa-brands fa-google text-red-500";
        button.appendChild(icon);
    }
    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    button.addEventListener("click", onClick);
    return button;
}

function findHike(id) {
    const hikes = window.trackerBridge?.getState?.().hikes || [];
    return hikes.find((hike) => String(hike.id) === String(id)) || null;
}

function showAlert(title, message, buttons) {
    if (typeof window.showIOSAlert !== "function") return;
    window.showIOSAlert(title, message, buttons || [{ text: "OK", style: "cancel" }]);
}

function downloadFile(filename, contents, mime) {
    const blob = new Blob([contents], { type: mime || "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
