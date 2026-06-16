// sw.js - Facilitaki Service Worker
// Versão: 1.0.0

const CACHE_NAME = 'facilitaki-v1';
const OFFLINE_URL = '/offline.html';

// Arquivos para cache (core do app)
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/offline.html'
];

// CDNs e recursos externos
const EXTERNAL_CACHE_URLS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

const ALL_CACHE_URLS = [...STATIC_CACHE_URLS, ...EXTERNAL_CACHE_URLS];

// ============================================
// INSTALAÇÃO
// ============================================
self.addEventListener('install', event => {
  console.log('🔄 Facilitaki Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache aberto, adicionando arquivos...');
        return cache.addAll(ALL_CACHE_URLS);
      })
      .then(() => {
        console.log('✅ Cache populado com sucesso!');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Erro no cache:', error);
      })
  );
});

// ============================================
// ATIVAÇÃO
// ============================================
self.addEventListener('activate', event => {
  console.log('⚡ Facilitaki Service Worker: Ativando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑️ Removendo cache antigo: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker ativado e controlando a página');
      return self.clients.claim();
    })
  );
});

// ============================================
// ESTRATÉGIA DE CACHE
// ============================================
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorar requisições de API (não cachear dados dinâmicos)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // Ignorar requisições de analytics
  if (url.hostname.includes('google-analytics') || url.hostname.includes('googletagmanager')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Para outros recursos, usar cache-first
  event.respondWith(cacheFirst(event.request));
});

// Estratégia: Cache First (mais rápido)
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Retorna do cache e atualiza em background
    fetch(request).then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
    }).catch(() => {});
    
    return cachedResponse;
  }
  
  // Se não está no cache, busca na rede
  return fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => {
    // Fallback para offline
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    return new Response('Offline - Facilitaki', {
      status: 503,
      statusText: 'Offline',
      headers: new Headers({ 'Content-Type': 'text/plain' })
    });
  });
}

// Estratégia: Network First (para APIs e dados dinâmicos)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback de erro
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Sem conexão com a internet' 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// NOTIFICAÇÕES PUSH
// ============================================
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Novo status no seu pedido Facilitaki',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/#dashboard',
      pedidoId: data.pedidoId
    },
    actions: [
      {
        action: 'open',
        title: 'Ver pedido'
      },
      {
        action: 'dismiss',
        title: 'Fechar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Facilitaki', options)
  );
});

// Clique na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'dismiss') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const url = event.notification.data?.url || '/';
        
        for (let client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});