import process from "node:process";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import webPush from "web-push";
import { allowedEndpoint, dueTasks, localClock, reminderPayload } from "./reminder.js";

async function main() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (serviceAccount?.project_id !== "tasky-6eec8" || !publicKey || !privateKey) {
    throw new Error("Configure the Tasky service account and VAPID keys in GitHub Actions secrets.");
  }
  initializeApp({ credential: cert(serviceAccount) });
  webPush.setVapidDetails("https://brentcrosby.github.io", publicKey, privateKey);
  const database = getFirestore();
  const now = new Date();
  const subscriptions = await database.collectionGroup("notifications").get();
  const boards = new Map();
  for (const doc of subscriptions.docs) {
    const setting = doc.data();
    const clock = localClock(now, setting.timeZone);
    // The extra hour provides a fallback if a scheduled run is delayed.
    if (!clock || clock.hour < 8 || clock.hour > 9 ||
        setting.lastSentDate === clock.date || !allowedEndpoint(setting.endpoint)) continue;
    const user = doc.ref.parent.parent;
    if (user?.parent.path !== "users") continue;
    if (!boards.has(user.path)) boards.set(user.path, await user.collection("tasky").doc("state").get());
    const cards = dueTasks(boards.get(user.path).data()?.state, clock.date);
    if (!cards.length) continue;
    try {
      await webPush.sendNotification({ endpoint: setting.endpoint, keys: setting.keys },
        reminderPayload(cards, clock.date), { TTL: 3600 });
      await doc.ref.update({ lastSentDate: clock.date, lastSentAt: FieldValue.serverTimestamp() });
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await doc.ref.delete();
      else console.error("Could not send a due reminder", { userId: user.id, statusCode: error.statusCode, message: error.message });
    }
  }
}

main().catch((error) => {
  console.error("Due reminders failed:", error.message);
  process.exitCode = 1;
});
