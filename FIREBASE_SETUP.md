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

## GitHub Pages: primary app address

The primary app address is https://brentcrosby.github.io/time-slice-kanban-board/. Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and publishes the app automatically. Routine UI changes do not need `firebase login` or a Firebase Hosting deploy.

In the repository's Settings → Secrets and variables → Actions → Variables, create these repository variables with the matching Firebase web app values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`

The Pages workflow injects these public Firebase web configuration values into the build. Re-run the workflow (or push a commit) after adding them. Firebase web config is not a server secret; the security boundary is Google Authentication plus the Firestore rules.

On GitHub Pages, mobile Google sign-in uses a popup because the app and Firebase auth helper are on different domains; redirect sign-in can fail when mobile browsers block third-party storage. On Firebase Hosting, the auth helper shares the app's domain, so mobile sign-in can use a redirect.

## Optional Firebase Hosting

`https://tasky-6eec8.web.app` remains configured but is not the routine publishing destination, so it may lag behind GitHub Pages. If Firebase Hosting is deliberately needed again, build for the root path and deploy Hosting separately. Firebase Authentication, App Check, Firestore, and their security rules continue to operate for the GitHub Pages app without deploying Firebase Hosting. Deploy Firestore rules separately only when those rules change.

## Data behavior

Signing in on the first device seeds the account with that device's local board. A device with an existing local board signing into an account that already has a board is asked to merge its cards or use the account board. Subsequent board changes sync between signed-in devices. On sign-out, choose whether to keep a local copy or remove tasks from that device. Removing tasks does not delete the synced account board.
