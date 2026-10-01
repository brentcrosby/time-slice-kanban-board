import { useCallback, useEffect, useState } from "react";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "../utils/firebase";

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const OWNER_KEY = "tasky:push-owner";
const supported = () => {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
  return (!ios || installed) && "Notification" in window &&
    "serviceWorker" in navigator && "PushManager" in window;
};

function publicKeyBytes(key) {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function subscriptionId(endpoint) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function useDueNotifications(user, syncStatus) {
  const [permission, setPermission] = useState(() => supported() ? Notification.permission : "unsupported");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = Boolean(vapidPublicKey && firestore && supported());

  useEffect(() => {
    if (!available || !user) { setEnabled(false); return undefined; }
    let active = true;
    const refresh = async () => {
      setPermission(Notification.permission);
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (!active) return;
      if (!subscription || Notification.permission !== "granted") { setEnabled(false); return; }
      if (localStorage.getItem(OWNER_KEY) !== user.uid) {
        // A prior account's subscription must not be attached to a new one.
        await subscription.unsubscribe();
        setEnabled(false);
        return;
      }
      // A subscription can outlive sign-in and a time-zone change. Reconcile
      // its account and zone whenever the app opens again.
      const id = await subscriptionId(subscription.endpoint);
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) throw new Error("Your browser did not provide a push subscription.");
      await setDoc(doc(firestore, "users", user.uid, "notifications", id), {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (active) setEnabled(true);
    };
    if (syncStatus === "synced") refresh().catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [available, user, syncStatus]);

  const enable = useCallback(async () => {
    if (!available || !user || busy || syncStatus !== "synced") return;
    setBusy(true);
    setError("");
    try {
      // Keep the permission prompt in the direct click gesture on iOS.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}push-sw.js`, {
        scope: import.meta.env.BASE_URL,
      });
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKeyBytes(vapidPublicKey),
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) throw new Error("Your browser did not provide a push subscription.");
      await setDoc(doc(firestore, "users", user.uid, "notifications", await subscriptionId(subscription.endpoint)), {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      localStorage.setItem(OWNER_KEY, user.uid);
      setEnabled(true);
    } catch (cause) { setError(cause.message || "Could not enable reminders."); }
    finally { setBusy(false); }
  }, [available, user, busy, syncStatus]);

  const disable = useCallback(async () => {
    if (!user || !supported()) return;
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        try {
          await deleteDoc(doc(firestore, "users", user.uid, "notifications", await subscriptionId(subscription.endpoint)));
        } finally {
          // Even if offline prevents the server deletion, stop this device
          // receiving notifications after sign-out. The sender removes a 410.
          await subscription.unsubscribe();
        }
      }
      localStorage.removeItem(OWNER_KEY);
      setEnabled(false);
    } catch (cause) { setError(cause.message || "Could not turn off reminders."); }
    finally { setBusy(false); }
  }, [user]);

  return { available, supported: supported(), permission, enabled, busy, error, enable, disable };
}
