# Google sign-in and cloud sync

The tracker is a static site on GitHub Pages. The web app config for Firebase project `hk100done-tracker` is in `js/firebase-config.js` with `enabled: true`.

Live site: `https://winghoic.github.io/hk100done_tracker/`

The Firebase web `apiKey` is in the page on purpose. It is not a server secret. Who can sign in, and which documents they can read, is limited by the authorized domains below, the Google OAuth client, and `firestore.rules`. Do not commit a service-account JSON file or an OAuth client secret.

`authDomain` is `hk100done-tracker.firebaseapp.com`.

## Authorized domains and OAuth URIs

GitHub Pages serves this repo from a project site. The origin does not include the `/hk100done_tracker` path.

Firebase → Authentication → Settings → Authorized domains. The host only:

- `winghoic.github.io`
- `localhost` (Firebase usually adds this itself)

Google Cloud → APIs & Services → Credentials → the OAuth 2.0 client Firebase created (often “Web client (auto created by Google Service)”).

Authorized JavaScript origins:

- `https://winghoic.github.io`
- `http://localhost`

Authorized redirect URIs, used if the browser blocks the Google popup:

- `https://hk100done-tracker.firebaseapp.com/__/auth/handler`
- `https://hk100done-tracker.web.app/__/auth/handler`

Do not add `https://winghoic.github.io/hk100done_tracker` as a JavaScript origin. Origins cannot contain a path. Do not add `https://winghoic.github.io/__/auth/handler`. GitHub Pages does not host Firebase’s auth handler.

OAuth consent screen: while the app is in Testing, only listed test users can finish Google sign-in. Add the Google accounts that will use the tracker, or publish the consent screen when you are ready.

## Firestore rules

`firestore.rules` allows a signed-in Google user to read and write only `users/{their uid}` and its `tracker`, `hikes`, and `backups` documents. Every other path is denied.

Cloud saves work after those rules are published to project `hk100done-tracker`:

```bash
firebase deploy --only firestore:rules
```

Sign-in can succeed before that publish. If a save is denied, the profile line says the hike stayed on this device.

## GitHub Pages

Publish the branch that contains `index.html` and `js/`. The site URL is:

`https://winghoic.github.io/hk100done_tracker/`

`.nojekyll` is included so Pages serves the `js/` files as-is. Sign in from that origin after the authorized domains above include `winghoic.github.io`.

## What users get

- **Guest:** schedule, recording, history, and edits stay in `localStorage` under `hk100_guest_v1`. Older keys `hk100_progress_default-app-id` and `hk100_history_default-app-id` are picked up once.
- **First Google sign-in:** if the account has no cloud tracker data, this browser’s guest hikes are copied to the account. If both sides have data, they are combined. The same hike id keeps the newer edit; the same week keeps the newer completion change. A backup is written to `users/{uid}/backups/{id}` before that upload. After a successful upload, the guest copy on this device is cleared so it is not imported into a different Google account later.
- **Later edits:** progress is `users/{uid}/tracker/progress`. Each hike is `users/{uid}/hikes/{hikeId}`. A copy also stays in this browser under `hk100_user_v1_{uid}` so a reload still shows your hikes if the network is down. Firestore persistent cache is enabled when the browser allows it.
- **Sign out:** the Google session ends and the screen returns to the guest store. Cloud hikes are not deleted. The next guest session does not show the previous account’s hikes.
- **Large photos or tracks:** a Firestore document must stay under 1 MB. Oversized photos or point lists stay on this device (`photoOmitted` / `pointsOmitted`) and the rest of the hike still syncs. Track points are stored in the cloud as `{lat, lng}` objects because Firestore cannot store an array of arrays.

Popup sign-in is the normal path. If the browser blocks the popup, the app continues with a full-page redirect. Safari can still interrupt that redirect when `hk100done-tracker.firebaseapp.com` and GitHub Pages are different sites. The profile line shows the failure, and local hikes stay put.

## If sign-in or sync fails

- **This site is not an authorized domain:** add `winghoic.github.io` in Firebase Authentication settings, with no path.
- **Popup blocked:** allow popups, or stay on the page while the redirect continues. The redirect must return through `https://hk100done-tracker.firebaseapp.com/__/auth/handler`.
- **Google account chooser closes immediately, or only some accounts work:** the OAuth consent screen is likely still in Testing. Add that Google account as a test user.
- **Saved on this device / cloud save was denied:** publish `firestore.rules`. A missing network leaves the same on-device copy and retries when the browser is back online.

## Strava and GPX

Hike export is separate from Google sign-in. See `docs/STRAVA.md`.
