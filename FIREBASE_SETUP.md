# Google sign-in and task sync

Tasky uses Firebase Authentication and Cloud Firestore for optional account sync. The Firebase project must be created specifically for Tasky; do not use Daymark's project. Until configured, the app continues to work with browser-local storage.

## Create and configure the Firebase project

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/), add a Web app, and copy its web configuration values.
2. In Authentication → Sign-in method, enable Google.
3. In Authentication → Settings → Authorized domains, add `tasky-6eec8.web.app`, `brentcrosby.github.io`, and `localhost` (for local testing).
4. Create a Cloud Firestore database.
5. Deploy [`firestore.rules`](./firestore.rules) with `firebase deploy --only firestore:rules`. These rules scope the board document to its signed-in owner and validate the board's top-level structure.
6. Register the web app with Firebase App Check using a reCAPTCHA Enterprise score-based site key restricted to the production domains. Add its public site key to the build environment. Monitor App Check request metrics before enabling Firestore enforcement; enforcing before deployed clients receive tokens can interrupt sync.

## Configure local development

Copy `.env.example` to `.env.local` and fill in the six Firebase web app configuration values and the public App Check site key. Restart `npm run dev` after changing environment values. App Check is initialized in production builds only; local development does not mint production App Check tokens.

Run `npm run test:rules` to verify Firestore rules with the local emulator before deploying them.

## Configure Firebase Hosting

Build with `VITE_FIREBASE_AUTH_DOMAIN=tasky-6eec8.web.app npm run build`, then deploy with `firebase deploy --only hosting,firestore:rules --project tasky-6eec8`. The primary address is `https://tasky-6eec8.web.app`. The Hosting domain must also be an authorized Firebase Authentication domain and have `https://tasky-6eec8.web.app` as an OAuth JavaScript origin and `https://tasky-6eec8.web.app/__/auth/handler` as an OAuth redirect URI. This same-domain auth configuration supports Google redirect sign-in on mobile. The Hosting configuration serves the single-page app and adds browser security headers.

## Configure GitHub Pages

In the repository's Settings → Secrets and variables → Actions → Variables, create these repository variables with the matching Firebase web app values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`

The Pages workflow injects these public Firebase web configuration values into the build. Re-run the workflow (or push a commit) after adding them. Firebase web config is not a server secret; the security boundary is Google Authentication plus the Firestore rules.

## Data behavior

Signing in on the first device seeds the account with that device's local board. A device with an existing local board signing into an account that already has a board is asked to merge its cards or use the account board. Subsequent board changes sync between signed-in devices. On sign-out, choose whether to keep a local copy or remove tasks from that device. Removing tasks does not delete the synced account board.
