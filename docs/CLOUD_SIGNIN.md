# Google sign-in and cloud sync

The tracker runs as a static site on GitHub Pages. Until the steps below are done, **Sign in with Google** stays in guest mode and hikes remain in this browser only. Do not invent a Firebase config. Paste the web app config from the Firebase project you create.

Live site: `https://winghoic.github.io/hk100done_tracker/`

The Firebase web `apiKey` is restricted by the domains and rules below. It is not a server secret, but it still has to come from your project. Do not commit service-account JSON or OAuth client secrets.

## 1. Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Authentication → Sign-in method → enable **Google**. Leave Anonymous disabled. This app ignores any session that is not Google.
3. Create a **Cloud Firestore** database.
4. Project settings → Your apps → add a **Web** app.
5. Copy the config into `js/firebase-config.js`, set `enabled` to `true`, and commit that file. `authDomain` must stay `{projectId}.firebaseapp.com`.

```js
export const firebaseConfig = {
  enabled: true,
  apiKey: "...",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

## 2. Authorized domains and OAuth URIs

GitHub Pages serves this repo from a project site. The origin does **not** include the `/hk100done_tracker` path.

Firebase → Authentication → Settings → **Authorized domains**. Add the host only:

- `winghoic.github.io`
- `localhost` (Firebase usually adds this itself)

Google Cloud → APIs & Services → Credentials → the OAuth 2.0 client Firebase created (often “Web client (auto created by Google Service)”).

Authorized **JavaScript origins**:

- `https://winghoic.github.io`
- `http://localhost`

Authorized **redirect URIs** (Firebase’s handler, used if the browser blocks the Google popup):

- `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`
- `https://YOUR_PROJECT_ID.web.app/__/auth/handler`

Do not add `https://winghoic.github.io/hk100done_tracker` as a JavaScript origin. Origins cannot contain a path. Do not add `https://winghoic.github.io/__/auth/handler`; GitHub Pages does not host Firebase’s auth handler.

OAuth consent screen: while the app is in **Testing**, only listed test users can finish Google sign-in. Add the Google accounts that will use the tracker, or publish the consent screen when you are ready.

## 3. Deploy security rules

`firestore.rules` allows a signed-in Google user to read and write only `users/{their uid}` and its `tracker`, `hikes`, and `backups` documents. Every other path is denied.

From this repository, after `firebase login` and `firebase use --add`:

```bash
firebase deploy --only firestore:rules
```

Sign-in can succeed before this deploy, but cloud saves will be denied until the rules are published. The profile line then says the save stayed on this device.

## 4. GitHub Pages

Publish the branch that contains `index.html`, `js/`, and `firestore.rules` is not required on Pages, but `js/firebase-config.js` is. The site URL is:

`https://winghoic.github.io/hk100done_tracker/`

`.nojekyll` is included so Pages serves the `js/` files as-is. After the config change is merged, reload the Pages site and sign in from that exact origin.

## What users get

- **Guest:** schedule, recording, history, and edits stay in `localStorage` under `hk100_guest_v1`. Older keys `hk100_progress_default-app-id` and `hk100_history_default-app-id` are picked up once.
- **First Google sign-in:** if the account has no cloud tracker data, this browser’s guest hikes are copied to the account. If both sides have data, they are combined. The same hike id keeps the newer edit; the same week keeps the newer completion change. A backup is written to `users/{uid}/backups/{id}` before that upload. After a successful upload, the guest copy on this device is cleared so it is not imported into a different Google account later.
- **Later edits:** progress is `users/{uid}/tracker/progress`. Each hike is `users/{uid}/hikes/{hikeId}`. A copy also stays in this browser under `hk100_user_v1_{uid}` so a reload still shows your hikes if the network is down. Firestore persistent cache is enabled when the browser allows it.
- **Sign out:** the Google session ends and the screen returns to the guest store. Cloud hikes are not deleted. The next guest session does not show the previous account’s hikes.
- **Large photos or tracks:** a Firestore document must stay under 1 MB. Oversized photos or point lists stay on this device (`photoOmitted` / `pointsOmitted`) and the rest of the hike still syncs. Track points are stored in the cloud as `{lat, lng}` objects because Firestore cannot store an array of arrays.

Popup sign-in is the normal path. If the browser blocks the popup, the app continues with a full-page redirect. Safari can still interrupt that redirect when Firebase’s auth domain and GitHub Pages are different sites; the profile line shows the failure and local hikes stay put.
