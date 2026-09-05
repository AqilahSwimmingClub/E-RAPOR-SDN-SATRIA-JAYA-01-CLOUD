import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';
import { resolveRoute } from '../src/core/router.js';
import { ACADEMIC_YEAR } from '../src/data/constants.js';

/* RESPONSIVE: TIDAK ADA ISI ATAU AKSI YANG HILANG DI LAYAR SEMPIT.

   Aplikasi menyembunyikan sebagian tabel pada layar sempit dan menggantinya dengan versi
   kartu. Cara itu benar selama penggantinya BENAR-BENAR ADA. Yang pernah terjadi justru
   sebaliknya: beberapa tabel disembunyikan tanpa pengganti sehingga seluruh isinya lenyap di
   portrait, dan kartu Akun Guru hanya memuat satu dari empat tombol yang ada di tabelnya.

   Test ini menjaga aturannya, bukan tampilannya:

   1. Setiap kelas tabel yang disembunyikan CSS harus punya kelas kartu pasangannya pada
      halaman yang memakainya.
   2. Tabel yang memang tidak punya versi kartu memakai penanda `wide-table-card` dan tidak
      boleh pernah masuk aturan display:none.
   3. Kartu Akun Guru memuat seluruh aksi yang ada pada tabel desktopnya.
   4. Ukuran sasaran sentuh ditegakkan berdasarkan lebar layar, bukan hanya jenis penunjuk. */

const root=new URL('../',import.meta.url);
const baca=path=>readFileSync(new URL(path,root),'utf8');
const css=baca('src/styles/app.css');
const halaman=readdirSync(new URL('src/pages/',root)).filter(nama=>nama.endsWith('.js'));
const isiHalaman=new Map(halaman.map(nama=>[nama,baca(`src/pages/${nama}`)]));

/* Kelas tabel yang disembunyikan CSS, beserta kelas kartu penggantinya. Daftar ini dibaca
   dari CSS supaya penambahan tabel baru ikut terjaga tanpa mengubah test. */
const PASANGAN=Object.freeze({
  'student-table-card':'student-card-list',
  'assessment-table-card':'assessment-card-list',
  'report-table-card':'report-card-list',
  'saved-table-card':'saved-card-list',
  'cocurricular-table-card':'cocurricular-card-list',
  'intracurricular-table-card':'intracurricular-card-list',
  'leger-table-card':'leger-card-list',
  'users-table-card':'teacher-account-cards',
});

/* Aturan display:none yang berlaku pada layar sempit - yakni yang berada di dalam media query
   dengan max-width - dikumpulkan apa adanya dari berkas CSS. */
function kelasDisembunyikanDiLayarSempit(){
  const hasil=new Set();
  const teks=css.replace(/\/\*[\s\S]*?\*\//g,'');
  for(const blok of teks.split('@media').slice(1)){
    const syarat=blok.slice(0,blok.indexOf('{'));
    if(!/max-width/.test(syarat)||/print/.test(syarat))continue;
    for(const aturan of blok.matchAll(/([^{}]+)\{[^{}]*display\s*:\s*none[^{}]*\}/g))
      for(const pemilih of aturan[1].split(','))
        for(const kelas of pemilih.matchAll(/\.([a-z0-9-]+)/g))hasil.add(kelas[1]);
  }
  return hasil;
}
const disembunyikan=kelasDisembunyikanDiLayarSempit();

test('1. Setiap tabel yang disembunyikan pada layar sempit punya versi kartu di halaman yang sama',()=>{
  for(const [tabel,kartu] of Object.entries(PASANGAN)){
    if(!disembunyikan.has(tabel))continue;
    for(const [nama,isi] of isiHalaman){
      if(!isi.includes(tabel))continue;
      assert.ok(isi.includes(kartu),
        `src/pages/${nama} memakai .${tabel} yang disembunyikan di portrait tetapi tidak menyediakan .${kartu}`);
    }
  }
});

test('2. Tabel tanpa versi kartu memakai wide-table-card dan tidak pernah disembunyikan',()=>{
  assert.equal(disembunyikan.has('wide-table-card'),false,
    'wide-table-card justru dipakai agar tabelnya tetap terlihat di layar sempit');
  const dipakai=[...isiHalaman.values()].some(isi=>isi.includes('wide-table-card'));
  assert.equal(dipakai,true,'penanda ini memang dipakai halaman');
  /* Isinya tetap dapat dibaca lewat penggulir mendatar miliknya sendiri, bukan menggeser
     badan halaman. */
  for(const [nama,isi] of isiHalaman){
    if(!isi.includes('wide-table-card'))continue;
    assert.ok(isi.includes('table-scroll'),
      `src/pages/${nama} membungkus tabel lebarnya dengan .table-scroll`);
  }
  assert.match(css,/\.table-scroll\{[^}]*overflow:\s*auto/);
});

test('3. Kartu Akun Guru memuat seluruh aksi yang ada pada tabel desktopnya',()=>{
  const isi=isiHalaman.get('users.js');
  const potong=(awal,akhir)=>{
    const mulai=isi.indexOf(awal);assert.ok(mulai>=0,`potongan ${awal} ditemukan`);
    const selesai=isi.indexOf(akhir,mulai);assert.ok(selesai>mulai,`akhir ${akhir} ditemukan`);
    return isi.slice(mulai,selesai);
  };
  /* Ada dua tabel berkelas users-table pada halaman ini; yang dimaksud adalah tabel Penugasan
     Guru, dikenali dari kolom Mata Pelajaran Ditugaskan miliknya. */
  const tabel=potong('<th>Mata Pelajaran Ditugaskan</th>','</table>');
  const kartu=potong('<div class="teacher-account-cards">','</div>`;');
  const aksi=teks=>[...new Set([...teks.matchAll(/data-(assign|edit|reset|toggle)=/g)].map(m=>m[1]))].sort();
  assert.deepEqual(aksi(tabel),['assign','edit','reset','toggle'],'tabel desktop punya empat aksi');
  assert.deepEqual(aksi(kartu),aksi(tabel),
    'kartu portrait memuat empat aksi yang sama: Ubah Penugasan, Edit Identitas, Reset Password, dan Aktifkan/Nonaktifkan');
  /* Status akun dan daftar mapel ikut terbawa, bukan hanya tombolnya. */
  assert.match(kartu,/badge-active|badge-inactive/,'status akun tampil pada kartu');
  assert.match(kartu,/Mata Pelajaran Ditugaskan/,'daftar mapel yang ditugaskan tampil pada kartu');
});

test('4. Ukuran sasaran sentuh ditegakkan berdasarkan lebar layar, bukan hanya jenis penunjuk',()=>{
  /* Tablet Android berpapan ketik, mode desktop pada browser HP, dan sebagian WebView
     melaporkan penunjuk halus. Karena itu aturannya tidak boleh hanya bergantung pada
     pointer:coarse. */
  assert.match(css,/@media\s*\(pointer:coarse\)/);
  assert.match(css,/@media\s*\(max-width:1024px\)\{[^@]*min-height:44px/);
  assert.match(css,/@media\s*\(pointer:coarse\)\{[^@]*min-height:44px/);
});

test('5. Halaman Pembelajaran memisahkan Mapel Berlaku dari Mapel Ditugaskan',()=>{
  const isi=isiHalaman.get('references.js');
  assert.match(isi,/Mapel Berlaku/,'kolom dari Mapping Mata Pelajaran');
  assert.match(isi,/Mapel Ditugaskan/,'kolom dari Penugasan Guru');
  assert.match(isi,/getTeacherAssignment/,'angkanya dibaca dari penugasan yang sesungguhnya');
});

test('6. Setiap menu yang tampil benar-benar membuka halamannya sendiri',()=>{
  /* Router melemparkan route yang tidak dikenal ke Dashboard TANPA bersuara. Sifat itu benar
     sebagai pengaman, tetapi ia juga membuat menu yang salah tulis tampak berfungsi: ia
     terbuka, hanya saja yang muncul Dashboard. Test ini menutup celah itu untuk kedua peran,
     sekaligus memastikan setiap route yang ada di sidebar memang punya halaman di pageFor. */
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const punyaHalaman=new Set([...app.matchAll(/case '([a-z0-9-]+)'/g)].map(m=>m[1]));
  for(const peran of ['admin','teacher']){
    const sesi=peran==='admin'
      ?{role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`}
      :{role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
    const daftar=flattenNavigation(peran).map(item=>item.route);
    assert.ok(daftar.length>0,`${peran} punya menu`);
    for(const route of daftar){
      assert.equal(resolveRoute(route,sesi),route,
        `menu ${peran} "${route}" tidak boleh jatuh ke Dashboard`);
      if(route!=='dashboard')
        assert.ok(punyaHalaman.has(route),`menu ${peran} "${route}" punya halaman sendiri di app.js`);
    }
  }
});
