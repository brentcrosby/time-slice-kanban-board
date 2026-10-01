self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (payload?.type !== "tasky-due") return;
  event.waitUntil(self.registration.showNotification(payload.title || "Tasks due today", {
    body: payload.body || "Open Tasky to see what's due.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: `tasky-due-${payload.date}`,
    data: { url: self.registration.scope },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification.data?.url || self.registration.scope;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
