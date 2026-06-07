const CACHE_NAME = "alatipha-ges-pasco-beta-v9";

const FILES_TO_CACHE = [

  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest-beta.json",
  "./library/sample.epub",
  "./icon-beta-192.png",
  "./icon-beta-512.png"
];


/* =========================
   INSTALL
========================= */

self.addEventListener("install", event => {

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(cache => {

        return cache.addAll(
          FILES_TO_CACHE
        );

      })

  );

});

/* =========================
   ACTIVATE
========================= */

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys()
      .then(cacheNames => {

        return Promise.all(

          cacheNames.map(cache => {

            if (cache !== CACHE_NAME) {

              return caches.delete(cache);

            }

          })

        );

      })
      .then(() => {

        return self.clients.claim();

      })

  );

});

/* =========================
   FETCH
========================= */

self.addEventListener("fetch", event => {

  if (
    event.request.method !== "GET"
  ) {

    return;

  }

  event.respondWith(

    caches.match(event.request)
      .then(cachedResponse => {

        if (cachedResponse) {

          return cachedResponse;

        }

        return fetch(event.request)
          .then(networkResponse => {

            return caches.open(CACHE_NAME)
              .then(cache => {

                cache.put(
                  event.request,
                  networkResponse.clone()
                );

                return networkResponse;

              });

          });

      })
      .catch(() => {

        return caches.match("./index.html");

      })

  );

});
