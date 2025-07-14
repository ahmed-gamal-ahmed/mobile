const CACHE_NAME = "product-inventory-cache-v2";
const APP_PREFIX = "product-inventory-";

// Include all icons and critical assets
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/logo-72.png",
  "./icons/logo-96.png",
  "./icons/logo-128.png",
  "./icons/logo-144.png",
  "./icons/logo-152.png",
  "./icons/logo-192.png",
  "./icons/logo-384.png",
  "./icons/logo-512.png",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/js/bootstrap.bundle.min.js"
];

// Install event - cache assets with improved error handling for mobile networks
self.addEventListener("install", (event) => {
  console.log('Service Worker: Installing');
  
  // Skip waiting to ensure the new service worker activates immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache)
          .catch(error => {
            console.error('Failed to cache all resources:', error);
            // Continue with partial caching rather than failing completely
            // This helps on flaky mobile networks
          });
      })
  );
});

// Improved fetch strategy for mobile - network first with cache fallback for better offline experience
self.addEventListener("fetch", (event) => {
  // Don't handle non-GET requests
  if (event.request.method !== 'GET') return;
  
  // For API requests or AJAX calls - try network first
  if (event.request.url.includes('/api/') || 
      event.request.headers.get('accept')?.includes('application/json')) {
    return event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
  
  // For HTML requests - network first with quick cache fallback
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response to store in cache
          let responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(response => {
              return response || caches.match('./mainVersion.html');
            });
        })
    );
    return;
  }

  // For everything else (CSS, JS, images) - try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached version and update cache in background (cache then network strategy)
          const fetchPromise = fetch(event.request)
            .then(networkResponse => {
              // Update the cache with new version
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
              return networkResponse;
            })
            .catch(() => {
              // Network failed, but we already have cached response
              console.log('Network failed, serving from cache');
            });
            
          // Start the fetch but return cached response immediately
          fetchPromise; // Don't wait for it
          return cachedResponse;
        }
        
        // If not in cache, fetch from network and cache the response
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          });
      })
  );
});

// Activate event - clean up old caches, take control immediately for better mobile experience
self.addEventListener("activate", (event) => {
  console.log('Service Worker: Activated');
  
  // Take control of clients immediately
  event.waitUntil(clients.claim());
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith(APP_PREFIX))
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('Service Worker: Clearing Old Cache', name);
            return caches.delete(name);
          })
      );
    })
  );
});

// Handle connectivity changes for better mobile experience
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
