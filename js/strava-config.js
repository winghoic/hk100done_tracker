/**
 * Strava export for the HK100Done tracker.
 *
 * clientId is public, like the Firebase web apiKey.
 * Strava still requires a client secret to exchange the OAuth code, and this
 * GitHub Pages site cannot keep that secret. Leave it on the token exchange
 * host and put only that host's URL here.
 *
 * Do not add a client secret to this file.
 * Setup: docs/STRAVA.md
 */
export const stravaConfig = {
    enabled: false,
    clientId: "",
    tokenExchangeUrl: "",
};
