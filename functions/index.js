import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import webPush from "web-push";
import { allowedEndpoint, dueTasks, localClock, reminderPayload } from "./reminder.js";

initializeApp();

const publicKey = defineSecret("VAPID_PUBLIC_KEY");
const privateKey = defineSecret("VAPID_PRIVATE_KEY");

export const sendDueReminders = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "Etc/UTC",
  secrets: [publicKey, privateKey],
  timeoutSeconds: 540,
}, async () => {
  webPush.setVapidDetails("https://brentcrosby.github.io", publicKey.value(), privateKey.value());
  const database = getFirestore();
  const now = new Date();
  const subscriptions = await database.collectionGroup("notifications").get();
  const boards = new Map();
  for (const doc of subscriptions.docs) {
      const setting = doc.data();
      const clock = localClock(now, setting.timeZone);
      if (clock?.hour !== 8 || setting.lastSentDate === clock.date || !allowedEndpoint(setting.endpoint)) continue;
      const user = doc.ref.parent.parent;
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
});
