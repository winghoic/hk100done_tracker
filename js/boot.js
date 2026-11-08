import { firebaseConfig } from "./firebase-config.js";
import { createTrackerSync } from "./cloud-sync.js";
import { createHikeId, visibleFingerprint } from "./sync-model.js";
import { stravaConfig } from "./strava-config.js";
import { createStravaClient } from "./strava-client.js";
import { trackAvailability } from "./gpx.js";
import { hasActivityWrite } from "./strava-model.js";

const sync = createTrackerSync({
    config: firebaseConfig,
    storage: window.localStorage,
    createBackend: async () => {
        const { createFirebaseBackend } = await import("./firebase-backend.js");
        return createFirebaseBackend(firebaseConfig);
    },
});

const strava = createStravaClient({
    config: stravaConfig,
    storage: window.localStorage,
    session: window.sessionStorage,
});

window.createHikeId = () => createHikeId();
window.trackerSync = sync;
window.hikeTrackNote = (hike) => trackAvailability(hike).note;

window.downloadHikeGpx = function downloadHikeGpx(id) {
    const hike = findHike(id);
    if (!hike) return;
    const result = strava.download(hike);
    if (!result.ok) showAlert("No GPS track", result.message);
};

window.exportHikeToStrava = async function exportHikeToStrava(id) {
    const hike = findHike(id);
    if (!hike) return;
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const snap = strava.snapshot();
    if (!snap.configured) {
        showAlert("Strava", "Strava upload is not set up yet. Add the public client id and the token exchange URL. The client secret stays off this website. GPX download still works.");
        return;
    }
    if (!snap.connected || (snap.scope && !hasActivityWrite(snap.scope))) {
        const started = strava.beginConnect({ hikeId: hike.id, redirectUri, force: Boolean(snap.connected) });
        if (!started.ok) {
            showAlert("Strava", started.message);
            return;
        }
        window.location.assign(started.url);
        return;
    }
    showAlert("Strava", "Sending this hike to Strava…", [{ text: "Hide", style: "cancel" }]);
    const result = await strava.upload(hike, exportContext(hike));
    showStravaResult(result);
};

window.connectStrava = function connectStrava() {
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const started = strava.beginConnect({ redirectUri, force: strava.snapshot().connected });
    if (!started.ok) {
        showAlert("Strava", started.message);
        return;
    }
    window.location.assign(started.url);
};

window.disconnectStrava = function disconnectStrava() {
    const run = async () => {
        const result = await strava.disconnect();
        renderStrava();
        showAlert("Strava", result.message);
    };
    if (typeof window.showIOSAlert !== "function") {
        run();
        return;
    }
    window.showIOSAlert("Disconnect Strava?", "This browser forgets the Strava login. Hikes already uploaded stay on Strava.", [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", action: run },
    ]);
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
    const oauthTask = strava.completeAuthorization(window.location.href);
    await sync.start();
    window.__trackerLoaded = true;
    const pendingEdit = typeof window.__consumePendingTrackerEdit === "function"
        ? window.__consumePendingTrackerEdit()
        : null;
    if (pendingEdit) await sync.saveEdit(pendingEdit.shown, pendingEdit.ui);
    const oauth = await oauthTask;
    if (oauth?.cleanedUrl) window.history.replaceState({}, "", oauth.cleanedUrl);
    renderStrava();
    if (!oauth) return;
    if (!oauth.ok) {
        showAlert("Strava", oauth.message);
        return;
    }
    if (!oauth.hikeId) {
        showAlert("Strava", oauth.athleteName ? `Connected as ${oauth.athleteName}.` : "Strava is connected.");
        return;
    }
    const hike = findHike(oauth.hikeId);
    if (!hike) {
        showAlert("Strava", "Strava is connected. That hike is not on this device anymore.");
        return;
    }
    showAlert("Strava", "Sending this hike to Strava…", [{ text: "Hide", style: "cancel" }]);
    showStravaResult(await strava.upload(hike, exportContext(hike)));
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
    renderStrava();
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

function renderStrava() {
    const nameEl = document.getElementById("strava-name");
    const statusEl = document.getElementById("strava-status");
    const area = document.getElementById("strava-action-area");
    if (!nameEl || !statusEl || !area) return;
    const snap = strava.snapshot();
    if (!snap.configured) {
        nameEl.textContent = "Not connected";
        statusEl.textContent = "GPX download works without Strava. Upload needs the client id and token exchange URL from the setup notes.";
        area.replaceChildren(stravaButton("How to connect", false, () => {
            showAlert("Strava", "Create a Strava API app with callback domain winghoic.github.io, deploy the token exchange, then set enabled, clientId, and tokenExchangeUrl. Keep the client secret on the exchange host.");
        }));
        return;
    }
    if (!snap.connected) {
        nameEl.textContent = "Not connected";
        statusEl.textContent = "Connect once. After that, Export to Strava uploads the hike.";
        area.replaceChildren(stravaButton("Connect Strava", true, () => window.connectStrava()));
        return;
    }
    nameEl.textContent = snap.athleteName || "Strava connected";
    statusEl.textContent = "Uploads from this browser go to this Strava account.";
    area.replaceChildren(stravaButton("Disconnect", false, () => window.disconnectStrava()));
}

function stravaButton(label, primary, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = primary
        ? "w-full py-3.5 bg-[#FC4C02] text-white font-bold rounded-2xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all"
        : "w-full py-3.5 bg-white/10 text-white font-bold rounded-2xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all";
    const icon = document.createElement("i");
    icon.className = "fa-brands fa-strava";
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    button.addEventListener("click", onClick);
    return button;
}

function findHike(id) {
    const hikes = window.trackerBridge?.getState?.().hikes || [];
    return hikes.find((hike) => String(hike.id) === String(id)) || null;
}

function exportContext(hike) {
    const bridge = window.trackerBridge;
    if (bridge && typeof bridge.hikeExportContext === "function") return bridge.hikeExportContext(hike) || {};
    return {};
}

function showAlert(title, message, buttons, options) {
    if (typeof window.showIOSAlert !== "function") return;
    window.showIOSAlert(title, message, buttons || [{ text: "OK", style: "cancel" }], options);
}

function showStravaResult(result) {
    if (!result) return;
    if (result.ok && result.url) {
        showAlert("Strava", result.message, [{ text: "OK", style: "cancel" }], {
            href: result.url,
            label: "Open on Strava",
        });
        return;
    }
    showAlert("Strava", result.message || "Strava did not accept this hike.");
}
