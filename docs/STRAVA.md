# GPX download and Strava upload

Saved hikes can be downloaded as GPX from History, and from the save prompt at the end of a recording. The same places have **Export to Strava**.

Live site: `https://winghoic.github.io/hk100done_tracker/`

GPX download works with no Strava account. Upload needs the one-time setup below. Google sign-in and Firestore sync are unchanged.

## Strava API application

Open [https://www.strava.com/settings/api](https://www.strava.com/settings/api) and create an application with these values:

| Setting | Value |
| --- | --- |
| Application Name | `HK100Done Tracker` |
| Category | Visualizer, or the closest choice Strava offers |
| Club | Leave empty |
| Website | `https://winghoic.github.io/hk100done_tracker/` |
| Authorization Callback Domain | `winghoic.github.io` |

The callback domain is the host only. Do not include `https://` and do not include `/hk100done_tracker`.

Strava does not ask for a full callback URL. The app sends this redirect URI itself:

`https://winghoic.github.io/hk100done_tracker/`

If the page is opened as `index.html`, the redirect is `https://winghoic.github.io/hk100done_tracker/index.html`. Both are on the callback domain above.

`localhost` and `127.0.0.1` are allowed by Strava even when the saved callback domain is `winghoic.github.io`. A local preview can use the same application.

After you save the application, copy the **Client ID**. Leave the **Client Secret** out of this repository.

## Why the secret is not in the site

Strava's web flow is authorization code, not an implicit token and not PKCE. A token request without `client_secret` is rejected (`client_secret` invalid). Checked against `POST https://www.strava.com/oauth/token` in November 2026.

GitHub Pages publishes every file in the site. A secret in `js/strava-config.js` would be visible to anyone who can load the page. Do not add one.

The browser can call Strava's activity and upload APIs directly. Those endpoints respond with `Access-Control-Allow-Origin: *`. Only the token exchange needs a host that can hold the secret. The included worker is that host. It is not deployed by this repository.

Requested scope is only `activity:write` (create a manual hike, or upload a GPX file).

## Token exchange

`strava-token/worker.js` is a single module with no dependencies.

1. Create a Cloudflare Worker and paste that file in as a module worker.
2. Add variables:
   - `STRAVA_CLIENT_ID` — the same client id as the website
   - `STRAVA_CLIENT_SECRET` — store this as a secret, not as plain text in git
3. Deploy it and copy the worker URL, for example `https://hk100done-strava.<account>.workers.dev`.

The worker accepts calls from `https://winghoic.github.io` and from `localhost` / `127.0.0.1`. It only exchanges a code, refreshes a token, or revokes a token for this app. It does not store the athlete token. The browser keeps that token in `localStorage` on the device that connected.

Anyone who can call the worker can spend this application's Strava rate limit. That is the tradeoff of a personal app with a public client id. The secret itself stays on the worker.

## Website config

Edit `js/strava-config.js`:

```js
export const stravaConfig = {
    enabled: true,
    clientId: "12345",
    tokenExchangeUrl: "https://hk100done-strava.<account>.workers.dev",
};
```

`clientId` and `tokenExchangeUrl` are public. Publish this file to GitHub Pages. Do not put the client secret next to them.

Until `enabled` is true and both values are set, **Export to Strava** explains that setup and does not redirect. **Download GPX** still works.

## Connect and upload

1. Open the site, record or open a hike, and tap **Export to Strava**. Profile has the same **Connect Strava** button.
2. Strava asks you to allow activity uploads. The browser returns to the GitHub Pages URL with a one-time `code`.
3. The page sends that code to the token exchange, then:
   - if the hike has track points, uploads a GPX file to `POST /api/v3/uploads` with `sport_type` `Hike`
   - if it has no track, creates a manual activity at `POST /api/v3/activities` with sport type `Hike`, the elapsed time in seconds, and the distance in meters when the hike has one
4. When Strava returns an activity id, the confirmation includes **Open on Strava**.

A hike with no points shows **No GPS track for this hike** on the history card. Download explains that there is no GPX file. If cloud sync left the track behind (`pointsOmitted`), the card says the GPS track is not on this device.

Uploading the same track again can come back as a duplicate. The confirmation still links to the existing activity when Strava names it.

Disconnect on the Profile tab forgets the login in this browser and asks Strava to revoke it. Uploaded activities stay on the account. You can also remove the app at [https://www.strava.com/settings/apps](https://www.strava.com/settings/apps).

## What is in the GPX file

Each saved point is a track point with latitude, longitude, and a time. Times are spread from the start of the hike to the save time using the recorded duration. Strava requires a time on each point. This tracker does not store elevation, so the file has no elevation. The route name and comment are escaped as XML text.
