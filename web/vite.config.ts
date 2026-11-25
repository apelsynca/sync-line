import { createHash } from "node:crypto";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000" },
  },
  plugins: [
    {
      name: "offline-workspace",
      apply: "build",
      enforce: "post",
      generateBundle(_, bundle) {
        const assets = Object.keys(bundle)
          .map((name) => "/" + name)
          .sort();
        const hash = createHash("sha256");
        for (const file of Object.values(bundle)) {
          hash.update(file.fileName);
          hash.update(file.type === "asset" ? file.source : file.code);
        }
        const version = hash.digest("hex").slice(0, 16);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const cacheName = "sync-line-shell-${version}";
const assets = ${JSON.stringify(assets)};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("sync-line-shell-") && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  const navigation = event.request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/app" || url.pathname.startsWith("/app/"));
  if (navigation || assets.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache =>
      await cache.match(navigation ? "/index.html" : url.pathname) || fetch(event.request)));
  }
});
`,
        });
      },
    },
  ],
});
