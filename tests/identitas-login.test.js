import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SCHOOL, academicYearOf, availableAcademicYears, currentSemesterLabel, semestersOf } from '../src/data/constants.js';
import { APP_VERSION } from '../src/data/version.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { listLoginSemesters } from '../src/services/references.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const nilai=new Map();globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};invalidateDbCache();}

/* ------------------------------------------------- 1-3. Tahun pelajaran mengikuti kalender */

test('1. Tahun pelajaran berjalan berganti setiap bulan Juli',()=>{
  /* Tahun ajaran di Indonesia dimulai Juli, jadi Juni masih tahun lama dan Juli sudah tahun baru. */
  for(const [tanggal,harapan] of [
    ['2026-07-01','2026/2027'],['2026-12-31','2026/2027'],
    ['2027-06-30','2026/2027'],['2027-07-01','2027/2028'],
    ['2028-01-15','2027/2028'],['2030-09-01','2030/2031'],
  ])assert.equal(academicYearOf(new Date(tanggal)),harapan,`${tanggal} berada pada tahun ${harapan}`);
  assert.equal(academicYearOf(new Date('bukan tanggal')),academicYearOf(),'tanggal tidak valid jatuh ke hari ini');
});

test('2. Tahun dasar tidak pernah berubah karena ikut menyusun kunci penyimpanan',()=>{
  /* Bila ACADEMIC_YEAR ikut berubah mengikuti tanggal, seluruh data guru berpindah scope dan
     seolah hilang. Karena itu nilainya tetap, dan tahun baru hanya ditambahkan. */
  assert.equal(ACADEMIC_YEAR,'2026/2027');
  assert.match(read('src/data/constants.js'),/export const ACADEMIC_YEAR = '2026\/2027';/);
  assert.match(read('src/data/constants.js'),/TIDAK boleh berubah mengikuti tanggal/,'alasannya tercatat di kode');
});

test('3. Tahun dasar, tahun berjalan, dan tahun berikutnya selalu tersedia',()=>{
  for(const tanggal of ['2026-08-19','2027-07-01','2031-02-10']){
    const daftar=availableAcademicYears(new Date(tanggal));
    const berjalan=academicYearOf(new Date(tanggal));
    const berikutnya=`${Number(berjalan.slice(0,4))+1}/${Number(berjalan.slice(0,4))+2}`;
    assert.ok(daftar.includes(ACADEMIC_YEAR),`${tanggal}: tahun dasar tetap ada`);
    assert.ok(daftar.includes(berjalan),`${tanggal}: tahun berjalan tersedia`);
    assert.ok(daftar.includes(berikutnya),`${tanggal}: tahun berikutnya sudah disiapkan`);
    assert.equal(new Set(daftar).size,daftar.length,'tidak ada tahun ganda');
    assert.deepEqual(daftar,[...daftar].sort(),'urut naik');
  }
  assert.deepEqual(semestersOf('2031/2032'),['Ganjil 2031/2032','Genap 2031/2032']);
});

/* ------------------------------------------------ 4-5. Referensi terisi tanpa merusak data */

test('4. Database baru langsung memuat semester untuk setiap tahun yang tersedia',()=>{
  useMemoryStorage();
  const refs=loadDb().masterData.references;
  const tahun=refs.academicYears.map(item=>item.id);
  for(const item of availableAcademicYears())assert.ok(tahun.includes(item),`tahun ${item} tersedia di Data Referensi`);
  for(const item of availableAcademicYears())
    for(const label of semestersOf(item))
      assert.ok(refs.semesters.some(s=>s.id===label&&s.academicYear===item),`semester ${label} tersedia`);
  /* Halaman Masuk menampilkan semester itu tanpa guru perlu menambahkannya manual. */
  assert.ok(listLoginSemesters().includes(`Ganjil ${ACADEMIC_YEAR}`));
});

test('5. Tahun pelajaran lama pada database yang sudah ada tidak pernah dibuang',()=>{
  useMemoryStorage();
  const lama='2019/2020';
  const db=loadDb();
  db.masterData.references.academicYears.push({id:lama,label:lama,active:false});
  db.masterData.references.semesters.push({id:`Ganjil ${lama}`,label:`Ganjil ${lama}`,name:'Ganjil',academicYear:lama,active:false});
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  invalidateDbCache();
  const refs=loadDb().masterData.references;
  assert.ok(refs.academicYears.some(item=>item.id===lama),'tahun lama tetap ada');
  assert.ok(refs.semesters.some(item=>item.id===`Ganjil ${lama}`),'semester lama tetap ada');
  for(const item of availableAcademicYears())assert.ok(refs.academicYears.some(x=>x.id===item),`tahun ${item} tetap ditambahkan`);
});

/* --------------------------------------------------------- 6-8. Identitas halaman Masuk */

test('6. Panel Masuk menampilkan identitas e-Rapor, sekolah, dan kabupaten',()=>{
  const halaman=read('src/pages/login.js');
  assert.match(halaman,/<span class="login-brand-app">e-Rapor<\/span>/);
  assert.match(halaman,/<strong>SDN SATRIA JAYA 01<\/strong>/);
  assert.match(halaman,/<span class="login-brand-region">KABUPATEN BEKASI<\/span>/);
  assert.match(halaman,/Cerdas Berkarakter Berprestasi/,'slogan sekolah tampil');
  assert.equal(SCHOOL,'SDN Satria Jaya 01');
});

test('7. Semester aktif tetap dapat dipilih guru pada panel Masuk',()=>{
  const halaman=read('src/pages/login.js');
  assert.match(halaman,/id="semester" aria-label="Semester Aktif"/,'dropdown semester tetap bernama');
  assert.match(halaman,/<select class="input" id="semester"/);
  assert.match(halaman,/aria-label="Sekolah"/,'isian sekolah tetap bernama');
  assert.match(halaman,/listLoginSemesters\(\)/,'daftar semester berasal dari Data Referensi');
  assert.match(halaman,/semester:qs\('#semester',root\)\.value/,'semester terpilih ikut dikirim saat masuk');
});

test('8. Footer memuat nama pengembang dan hak cipta, tanpa teks lama',()=>{
  const halaman=read('src/pages/login.js');
  assert.match(halaman,/<strong>FAHMI DJAWAS, S\.Pd\.<\/strong>/);
  assert.match(halaman,/Dirancang &amp; Dikembangkan oleh/);
  assert.match(halaman,/© 2026 e-Rapor SDN Satria Jaya 01 — Semua Hak Dilindungi/);
  assert.equal(halaman.includes('System Architect & Lead Developer'),false,'peran lama dibuang');
  assert.equal(halaman.includes('Inovasi digital mandiri'),false,'moto lama dibuang');
  /* Nomor versi tetap otomatis dari APP_VERSION. */
  assert.match(halaman,/<span class="login-version">v\$\{escapeHtml\(APP_VERSION\)\}<\/span>/);
  assert.match(halaman,/import \{ APP_VERSION \} from '\.\.\/data\/version\.js';/);
});

test('9. Semester yang sedang berjalan menurut kalender berada di urutan pertama',()=>{
  /* Pilihan pertama adalah yang terpilih otomatis pada halaman Masuk. Bila yang terpilih tahun
     berikutnya, guru masuk ke scope yang memang masih kosong dan mengira datanya hilang. */
  useMemoryStorage();
  assert.equal(currentSemesterLabel(new Date('2026-08-19')),'Ganjil 2026/2027');
  assert.equal(currentSemesterLabel(new Date('2027-02-10')),'Genap 2026/2027');
  assert.equal(currentSemesterLabel(new Date('2027-07-05')),'Ganjil 2027/2028');
  assert.equal(listLoginSemesters()[0],currentSemesterLabel(),'semester berjalan menjadi pilihan awal');
});

test('10. Tidak ada satu pun semester yang hilang dari daftar Masuk',()=>{
  /* Penataan urutan hanya memindahkan, tidak pernah membuang. Semester lain tetap bisa dipilih. */
  useMemoryStorage();
  const daftar=listLoginSemesters();
  const aktif=loadDb().masterData.references.semesters.filter(item=>item.active!==false).map(item=>item.label);
  assert.deepEqual([...daftar].sort(),[...aktif].sort(),'isi daftar sama persis dengan semester aktif');
  assert.equal(new Set(daftar).size,daftar.length,'tidak ada semester ganda');
  for(const label of semestersOf(academicYearOf()))assert.ok(daftar.includes(label),`${label} tetap dapat dipilih`);
});

test('11. Bila semester berjalan dinonaktifkan, yang dipilih semester lampau bukan masa depan',()=>{
  useMemoryStorage();
  const berjalan=academicYearOf();
  const lampau=`${Number(berjalan.slice(0,4))-1}/${Number(berjalan.slice(0,4))}`;
  const db=loadDb();
  const refs=db.masterData.references;
  refs.academicYears.push({id:lampau,label:lampau,active:true});
  for(const label of semestersOf(lampau))
    refs.semesters.push({id:label,label,name:label.split(' ')[0],academicYear:lampau,active:true});
  for(const item of refs.semesters)if(item.academicYear===berjalan)item.active=false;
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  invalidateDbCache();
  const daftar=listLoginSemesters();
  assert.equal(daftar[0],`Genap ${lampau}`,'jatuh ke semester terakhir yang sudah lewat');
  assert.ok(!daftar[0].endsWith(`${Number(berjalan.slice(0,4))+1}/${Number(berjalan.slice(0,4))+2}`),'bukan tahun depan yang kosong');
});

test('12. Semester login yang dipilih guru tetap diterima meski urutannya berubah',()=>{
  /* Validasi login memakai keanggotaan daftar, jadi menata urutan tidak boleh menolak semester
     yang selama ini dipakai guru. */
  useMemoryStorage();
  const daftar=listLoginSemesters();
  for(const label of [`Ganjil ${ACADEMIC_YEAR}`,`Genap ${ACADEMIC_YEAR}`])
    assert.ok(daftar.includes(label),`${label} tetap valid untuk login`);
  assert.match(read('src/services/references.js'),/const active=listReferenceSemesters\(\)\.filter\(item=>item\.active!==false\)/);
});
