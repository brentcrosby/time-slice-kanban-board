# Google sign-in and task sync

Tasky uses Firebase Authentication and Cloud Firestore for optional account sync. The Firebase project must be created specifically for Tasky; do not use Daymark's project. Until configured, the app continues to work with browser-local storage.

## Create and configure the Firebase project

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/), add a Web app, and copy its web configuration values.
2. In Authentication → Sign-in method, enable Google.
3. In Authentication → Settings → Authorized domains, add `brentcrosby.github.io` and `localhost` (for local testing).
4. Create a Cloud Firestore database.
5. In Firestore → Rules, publish the contents of [`firestore.rules`](./firestore.rules). These rules scope the board document to its signed-in owner.

## Configure local development

Copy `.env.example` to `.env.local` and fill in all six values from the Firebase web app configuration. Restart `npm run dev` after changing environment values.

## Configure GitHub Pages

In the repository's Settings → Secrets and variables → Actions → Variables, create these repository variables with the matching Firebase web app values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

The Pages workflow injects these public Firebase web configuration values into the build. Re-run the workflow (or push a commit) after adding them. Firebase web config is not a server secret; the security boundary is Google Authentication plus the Firestore rules.

## Data behavior

Signing in on the first device seeds the account with that device's local board. A device with an existing local board signing into an account that already has a board is asked to merge its cards or use the account board. Subsequent board changes sync between signed-in devices. Signing out leaves the current browser's local copy in place.
