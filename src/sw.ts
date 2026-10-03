/// <reference lib="webworker" />
// STUB (1.1 → 5.1): the single service worker, built by vite-plugin-pwa (injectManifest)
// to `<base>/sw.js` with scope `<base>`. Step 5.1 adds navigation fallback, runtime caching and
// Firebase background messaging here (Blueprint §1, §9, §10).
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// registerType 'prompt': UpdatePrompt asks the waiting worker to take over.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting();
  }
});
