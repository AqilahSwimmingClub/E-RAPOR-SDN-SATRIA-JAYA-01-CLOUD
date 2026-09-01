import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessRoute, resolveRoute } from '../src/core/router.js';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const ROUTES=[['dapodik-service','service'],['dapodik-pull','pull'],['dapodik-push','push']];

test('Route Dapodik kanonik memilih satu mode halaman',()=>{
  const app=read('src/app.js');
  for(const [route,mode] of ROUTES){
    assert.match(app,new RegExp(`case '${route}': return renderDapodik\\(session,'${mode}'\\);`),`${route} memakai mode ${mode}`);
  }
  /* Tiga route ini tidak boleh lagi memakai stub placeholder. */
  assert.doesNotMatch(app,/case 'dapodik-[a-z]+': return renderPlaceholder/);
});

test('Dapodik hanya untuk Admin dan tidak muncul pada menu Guru',()=>{
  for(const [route] of ROUTES){
    assert.equal(canAccessRoute(route,'admin'),true);
    assert.equal(canAccessRoute(route,'teacher'),false);
    assert.equal(resolveRoute(route,{role:'teacher',classId:'5B'}),'dashboard');
  }
  const menuGuru=flattenNavigation('teacher').map(item=>item.route);
  assert.equal(menuGuru.some(item=>item.startsWith('dapodik')),false);
  const menuAdmin=flattenNavigation('admin').map(item=>item.route);
  for(const [route] of ROUTES)assert.equal(menuAdmin.filter(item=>item===route).length,1,`${route} muncul sekali`);
});

test('Halaman Dapodik memuat koneksi, pratinjau, dan arahan Windows',()=>{
  const page=read('src/pages/dapodik.js');
  assert.match(page,/Tes Koneksi/);
  assert.match(page,/Pratinjau Perubahan/);
  assert.match(page,/Terapkan Data/);
  assert.match(page,/aplikasi Windows/);
  assert.match(page,/Reset Form Data/);
  assert.match(page,/export function renderDapodik\(session,mode='service'\)/);
});

test('Halaman menolak sesi bukan Admin dan mode yang tidak dikenal',()=>{
  const page=read('src/pages/dapodik.js');
  assert.match(page,/Hanya Admin/);
  assert.match(page,/DAPODIK_MODES/);
  for(const [,mode] of ROUTES)assert.match(page,new RegExp(`'${mode}'`),`mode ${mode} dikenali`);
});

test('Form layanan memakai kolom yang disepakati dan token bertopeng',()=>{
  const page=read('src/pages/dapodik.js');
  for(const field of ['baseUrl','npsn','semesterId','token'])assert.match(page,new RegExp(`name="${field}"`),`kolom ${field} tersedia`);
  assert.match(page,/type="password"/,'token diketik bertopeng');
  /* Token yang sudah tersimpan tidak pernah dikembalikan bridge, jadi form tidak boleh
     mencoba mengisi ulang nilainya. */
  assert.doesNotMatch(page,/value="\$\{escapeHtml\(config\.token/);
});

test('Pratinjau mengelompokkan aksi dan konflik tidak dicentang otomatis',()=>{
  const page=read('src/pages/dapodik.js');
  for(const aksi of ['create','update','archive','conflict','unchanged'])assert.match(page,new RegExp(`'${aksi}'`),`kelompok ${aksi} ditampilkan`);
  assert.match(page,/action!=='conflict'/,'konflik tidak dicentang otomatis');
  assert.match(page,/confirmDialog/,'penerapan meminta konfirmasi eksplisit');
  assert.match(page,/applyDapodikPreview/);
  assert.match(page,/buildDapodikPreview/);
  assert.match(page,/normalizeDapodikDataset/);
});

test('Ambil dan Kirim terkunci sampai tes koneksi cocok',()=>{
  const page=read('src/pages/dapodik.js');
  assert.match(page,/connectionMatches/,'status kecocokan koneksi disimpan');
  assert.match(page,/disabled/,'tombol dinonaktifkan sebelum tes cocok');
  assert.match(page,/NPSN|semester/i);
});

test('Halaman Dapodik terdaftar pada check, precache, dan CSS',()=>{
  assert.match(read('package.json'),/node --check src\/pages\/dapodik\.js/);
  assert.match(read('sw.js'),/\.\/src\/pages\/dapodik\.js/);
  assert.match(read('src/styles/app.css'),/dapodik-/);
});
