/* Nama cache diikat pada versi aplikasi. WAJIB dinaikkan setiap rilis, dan sudah dijaga test
   agar selalu sama dengan APP_VERSION-VERSION_CODE pada src/data/version.js.

   Sebelumnya nama cache tetap dan seluruh aset diambil cache-first, sehingga setelah APK
   diperbarui WebView masih menjalankan JavaScript lama dari cache dan revisi baru tidak
   pernah muncul. Kini kode aplikasi diambil network-first supaya berkas dari APK terbaru
   selalu menang, sedangkan aset berat tetap cache-first agar offline tetap ringan. */
const APP_CACHE_VERSION='1.2.1-13';
const CACHE=`erapor-satria-${APP_CACHE_VERSION}`;
const OFFLINE_SHELL='./index.html';
const APP_SHELL=[
  './','./index.html','./manifest.webmanifest',
  './assets/app-icon.svg','./assets/app-icon-192.svg','./assets/app-icon-512.svg','./assets/fahmi-djawas.jpg','./assets/vendor/xlsx.mjs',
  './assets/logo-tut-wuri-handayani.png','./assets/logo-kabupaten-bekasi.png',
  './src/styles/app.css','./src/app.js','./src/core/router.js','./src/data/constants.js','./src/data/navigation.js','./src/data/version.js','./src/data/seed-5b.js','./src/data/cocurricular.js','./src/data/intracurricular-defaults.js',
  './src/ui/dom.js','./src/ui/icons.js','./src/ui/layout.js','./src/ui/digital-gauge.js',
  './src/pages/assessment.js','./src/pages/attendance.js','./src/pages/class-overview.js','./src/pages/completeness.js','./src/pages/intracurricular-input.js',
  './src/pages/activation.js','./src/pages/admin-status.js','./src/pages/attitudes.js','./src/pages/cocurricular.js','./src/pages/intracurricular.js','./src/pages/dapodik.js',
  './src/pages/dashboard.js','./src/pages/login.js','./src/pages/objectives.js','./src/pages/placeholder.js','./src/pages/references.js',
  './src/pages/print.js','./src/pages/profile.js','./src/pages/progress.js','./src/pages/reports.js',
  './src/pages/settings.js','./src/pages/students.js','./src/pages/transcript.js','./src/pages/transcript-admin.js','./src/pages/users.js','./src/pages/weights.js',
  './src/services/admin-status.js','./src/services/analytics.js','./src/services/assessment.js','./src/services/assessment-bulk.js','./src/services/assessment-import.js','./src/services/attendance.js','./src/services/attitudes.js','./src/services/auth.js',
  './src/services/backup.js','./src/services/cocurricular.js','./src/services/completeness.js','./src/services/descriptions.js','./src/services/documents.js','./src/services/dapodik-adapter.js','./src/services/dapodik-sync.js','./src/services/dapodik-bridge.js','./src/services/intracurricular.js',
  './src/services/mapping.js','./src/services/master.js','./src/services/objectives.js','./src/services/report.js',
  './src/services/owner-activation.js','./src/services/print-settings.js','./src/services/publications.js','./src/services/references.js','./src/services/report-bulk.js',
  './src/services/report-import.js','./src/services/snapshots.js','./src/services/migrations.js','./src/services/seed.js','./src/services/storage.js','./src/services/students.js',
  './src/services/subjects.js','./src/services/transcript.js','./src/services/transcript-admin.js','./src/services/excel.js','./src/services/file-io.js','./src/services/print-service.js','./src/data/owner-verifier.js'
];

const SWAPPABLE_ASSETS=['/assets/login-background.jpg','/assets/logo-sekolah.png'];
function isSwappableAsset(url){const path=new URL(url).pathname;return SWAPPABLE_ASSETS.some(name=>path.endsWith(name));}

function isAppCode(url){return /\.(?:js|mjs|css|html|webmanifest)$/i.test(new URL(url).pathname);}
async function cacheFirst(request){const cached=await caches.match(request);if(cached)return cached;try{const response=await fetch(request);if(response.ok)(await caches.open(CACHE)).put(request,response.clone());return response;}catch{return new Response('Aset tidak tersedia saat offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}}
async function networkFirst(request){try{const response=await fetch(request);if(response.ok)(await caches.open(CACHE)).put(request,response.clone());return response;}catch{const cached=await caches.match(request);return cached||new Response('Aset tidak tersedia saat offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{await cache.addAll(APP_SHELL);}catch{await Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));}await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(OFFLINE_SHELL,copy));return response;}).catch(()=>caches.match(OFFLINE_SHELL)));return;}event.respondWith(isAppCode(event.request.url)||isSwappableAsset(event.request.url)?networkFirst(event.request):cacheFirst(event.request));});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
