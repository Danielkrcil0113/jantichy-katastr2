/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = `dopisy-${version}`;
const ASSETS = [...build, ...files];

worker.addEventListener('install', (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
  }

  event.waitUntil(addFilesToCache());
});

worker.addEventListener('activate', (event) => {
  async function deleteOldCaches() {
    const keys = await caches.keys();

    await Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }

        return Promise.resolve(false);
      })
    );

    await worker.clients.claim();
  }

  event.waitUntil(deleteOldCaches());
});

worker.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return cachedResponse ?? fetch(request);
      })
    );

    return;
  }

  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }

        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      })
  );
});