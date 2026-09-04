import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';
import { aktifkanLisensiLokal } from './helpers/license-local.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const dashboard=()=>read('src/pages/dashboard.js');
const css=()=>read('src/styles/app.css');

test('Tema dashboard memakai token dark navy, glass, dan aksen cyan/teal/ungu',()=>{
  const t=css();
  for(const token of ['--navy','--navy-2','--glass','--glass-line','--cyan','--teal','--purple'])
    assert.match(t,new RegExp(`${token}\\s*:`),`token ${token} tersedia`);
  /* Permukaan kaca wajib memakai blur, bukan sekadar warna transparan. */
  assert.match(t,/backdrop-filter\s*:\s*blur\(/);
});

test('Sidebar dan topbar mengikuti tema baru, bukan gradasi maroon lama',()=>{
  const t=css();
  assert.doesNotMatch(t,/\.sidebar\{[^}]*linear-gradient\(180deg,#711827/,'gradasi maroon sidebar diganti');
  assert.match(t,/\.sidebar\{[^}]*var\(--navy/,'sidebar memakai navy');
  assert.match(t,/\.topbar\{[^}]*var\(--glass/,'topbar memakai permukaan kaca');
  assert.match(t,/\.app-shell\{[^}]*var\(--navy/,'shell memakai latar navy');
});

test('Dashboard membaca seluruh angka dari layanan data asli',()=>{
  const source=dashboard();
  for(const fn of ['getAdminAssessmentStatus','getReportCompleteness','dailyAttendanceRecap','semesterAttendanceRecap','listStudents','getSubjectMapping','getSchoolMaster'])
    assert.match(source,new RegExp(fn),`${fn} dipakai`);
  /* Tidak boleh ada deret angka contoh yang ditulis langsung di halaman. */
  /* Satu-satunya deret angka yang boleh ditulis langsung adalah garis bantu sumbu grafik;
     seluruh angka yang ditampilkan wajib berasal dari layanan data. */
  const deretAngka=source.match(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+[^\]]*\]/g)||[];
  assert.deepEqual(deretAngka,['[0,25,50,75,100]'],'tidak ada deret angka dummy selain skala sumbu');
  assert.match(source,/const AXIS_TICKS=\[0,25,50,75,100\]/,'skala sumbu dinamai eksplisit');
  assert.doesNotMatch(source,/dummy|contoh|lorem|placeholder/i);
});

test('Grafik dashboard dibangun dari koleksi data asli, bukan konstanta',()=>{
  const source=dashboard();
  assert.match(source,/function sparkArea\(/,'grafik area tersedia');
  assert.match(source,/function barChart\(/,'grafik batang tersedia');
  /* Grafik Admin memetakan rombel nyata; grafik Guru memetakan tanggal absensi nyata. */
  assert.match(source,/adminStatus\.classes\.map/);
  assert.match(source,/recap\.dates/);
  assert.match(source,/<svg/,'grafik dirender sebagai SVG inline tanpa pustaka luar');
});

test('Kartu statistik dan grafik punya kelas tema baru di CSS',()=>{
  const t=css(),source=dashboard();
  for(const kelas of ['dash-hero','dash-stat','dash-panel','dash-chart'])
    assert.match(source,new RegExp(kelas),`markup memakai ${kelas}`);
  for(const kelas of ['.dash-hero','.dash-stat','.dash-panel','.dash-chart'])
    assert.match(t,new RegExp(kelas.replace('.','\\.')),`CSS mendefinisikan ${kelas}`);
});

test('Dashboard responsif untuk Android, tablet, dan laptop',()=>{
  const t=css();
  assert.match(t,/\.dash-stat-grid\{[^}]*repeat\(4/,'empat kolom di layar lebar');
  assert.match(t,/@media\(max-width:1100px\)[^@]*\.dash-stat-grid\{[^}]*repeat\(2/,'dua kolom di tablet');
  assert.match(t,/@media\(max-width:767px\)[^@]*\.dash-stat-grid\{[^}]*1fr/,'satu kolom di ponsel');
  assert.match(t,/\.dash-panel-grid\{/);
});

test('Redesign dashboard tidak mengubah menu Admin maupun Guru',()=>{
  /* Penjaga ini dulunya membandingkan diff Git terhadap HEAD, yang hanya menahan perubahan
     yang belum di-commit dan ikut menahan penambahan menu yang memang direncanakan. Yang
     benar-benar dijaga adalah bentuk menunya: seluruh menu dashboard lama tetap ada, tidak
     ada route ganda, dan jumlah grup tidak menyusut. */
  for(const wajib of ['dashboard','profile','backup','account-settings'])
    assert.ok(flattenNavigation('admin').some(item=>item.route===wajib),`menu Admin tetap memuat ${wajib}`);
  const admin=flattenNavigation('admin').map(item=>item.route);
  const teacher=flattenNavigation('teacher').map(item=>item.route);
  assert.equal(new Set(admin).size,admin.length,'route Admin tetap unik');
  assert.equal(new Set(teacher).size,teacher.length,'route Guru tetap unik');
  assert.ok(navigationForRole('admin').length>=8,'grup menu Admin tetap lengkap');
  assert.ok(navigationForRole('teacher').length>=7,'grup menu Guru tetap lengkap');
  /* Setelah pembagian peran: cetak rapor milik Guru, Dapodik dan backup milik Admin. */
  for(const route of ['dashboard','dapodik-service','reference-students','backup','account-settings'])
    assert.ok(admin.includes(route),`menu Admin ${route} tetap ada`);
  for(const route of ['dashboard','student-update','attendance','report-input','print-report'])
    assert.ok(teacher.includes(route),`menu Guru ${route} tetap ada`);
});

test('Halaman tampilan tidak pernah menjalankan autentikasi sendiri',()=>{
  /* Semula test ini membekukan src/services/auth.js lewat `git diff HEAD`. Pembekuan itu tidak
     sehat sebagai penjaga: hasilnya bergantung pada ada tidaknya perubahan yang belum
     di-commit, dan ia menghalangi perubahan autentikasi yang memang diminta - seperti gerbang
     lisensi pada login.

     Yang sebenarnya ingin dijaga adalah pemisahan perannya: halaman tampilan boleh berubah
     sebebasnya, tetapi tidak boleh memindahkan logika autentikasi ke dalam dirinya. Itulah yang
     diperiksa sekarang, dan ia berlaku kapan pun tanpa bergantung pada keadaan git. */
  for(const berkas of ['src/pages/dashboard.js','src/ui/layout.js']){
    const isi=readFileSync(new URL(berkas,root),'utf8');
    assert.equal(/verifyPassword|createPasswordHash|activateOwnerAdmin/.test(isi),false,
      `${berkas} tidak menjalankan autentikasi sendiri`);
  }
  /* Kontrak layanannya tetap berdiri. */
  const auth=readFileSync(new URL('src/services/auth.js',root),'utf8');
  assert.match(auth,/export async function authenticate/);
  assert.match(auth,/export function getSession/);
});

test('Permukaan dokumen cetak tetap putih, tidak ikut tema gelap',()=>{
  const t=css();
  assert.match(t,/\.document-a4\{[^}]*background:#fff/,'lembar dokumen tetap putih');
  assert.match(t,/\.report-a4\{padding:14mm 13mm\}/,'geometri rapor tidak berubah');
});
