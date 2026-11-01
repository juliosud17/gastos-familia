// Service worker simples: deixa o app abrir rápido e funcionar sem sinal.
// Dados (Supabase) sempre vêm da rede.
const CACHE = 'caderneta-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const mesmoSite = url.origin === self.location.origin
  const fonte = url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com')
  if (!mesmoSite && !fonte) return

  // Páginas: rede primeiro, cache se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copia))
          return res
        })
        .catch(() => caches.match('./'))
    )
    return
  }

  // Arquivos: cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then((emCache) => {
      const daRede = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copia = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copia))
          }
          return res
        })
        .catch(() => emCache)
      return emCache || daRede
    })
  )
})
