const CACHE='erapor-satria-v14-1';
const OFFLINE_SHELL='./index.html';
const APP_SHELL=[
  './','./index.html','./manifest.webmanifest',
  './assets/app-icon.svg','./assets/app-icon-192.svg','./assets/app-icon-512.svg','./assets/fahmi-djawas.jpg','./assets/intro-logo.mp4','./assets/vendor/xlsx.mjs',
  './src/styles/app.css','./src/app.js','./src/core/router.js','./src/data/constants.js','./src/data/version.js',
  './src/ui/dom.js','./src/ui/icons.js','./src/ui/layout.js','./src/ui/intro.js','./src/ui/digital-gauge.js',
  './src/pages/assessment.js','./src/pages/attendance.js','./src/pages/class-overview.js','./src/pages/completeness.js',
  './src/pages/activation.js','./src/pages/admin-status.js','./src/pages/attitudes.js','./src/pages/cocurricular.js',
  './src/pages/dashboard.js','./src/pages/login.js','./src/pages/objectives.js','./src/pages/placeholder.js','./src/pages/references.js',
  './src/pages/print.js','./src/pages/profile.js','./src/pages/progress.js','./src/pages/reports.js',
  './src/pages/settings.js','./src/pages/students.js','./src/pages/transcript.js','./src/pages/users.js','./src/pages/weights.js',
  './src/services/admin-status.js','./src/services/analytics.js','./src/services/assessment.js','./src/services/assessment-bulk.js','./src/services/attendance.js','./src/services/attitudes.js','./src/services/auth.js',
  './src/services/backup.js','./src/services/cocurricular.js','./src/services/completeness.js','./src/services/descriptions.js','./src/services/documents.js',
  './src/services/mapping.js','./src/services/master.js','./src/services/objectives.js','./src/services/report.js',
  './src/services/owner-activation.js','./src/services/print-settings.js','./src/services/references.js','./src/services/report-bulk.js',
  './src/services/report-import.js','./src/services/snapshots.js','./src/services/migrations.js','./src/services/storage.js','./src/services/students.js',
  './src/services/subjects.js','./src/services/transcript.js','./src/services/excel.js','./src/services/file-io.js','./src/services/print-service.js','./src/data/owner-verifier.js'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(OFFLINE_SHELL,copy));return response;}).catch(()=>caches.match(OFFLINE_SHELL)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>new Response('Aset tidak tersedia saat offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
