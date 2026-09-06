import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { normalizeMappingOrder, reorderSubject } from '../src/services/mapping.js';
import { buildBackup, parseBackupText } from '../src/services/backup.js';
import { listActiveSubjects } from '../src/services/subjects.js';
import { createStudent } from '../src/services/students.js';
import { getSubjectMapping, invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';
import { saveSubjectMapping as siapkanMapel, tugaskan } from './helpers/penugasan.js';

/* MAPPING SATU DAFTAR DAN ABSENSI MANUAL MENDATAR (1.3.2).

   Dua keluhan yang diselesaikan bersama:

     A. Mapping Mata Pelajaran masih memakai Kelompok A/B - dua kartu terpisah, dropdown
        kelompok, dan penomoran yang diulang dari 1 di tiap kelompok. Akibatnya `order` tidak
        pernah menjadi urutan yang sebenarnya, dan setiap halaman terpaksa mengurutkan
        `group` lebih dulu secara diam-diam.
     B. Input Manual Satu Semester menggulir ke samping pada layar mendatar, sehingga guru
        harus menggeser tabel hanya untuk mengisi tiga angka.

   Data lama TIDAK dirusak: field `group` tetap tersimpan, id mapel tidak berubah, status aktif
   dan penugasan Guru tetap utuh. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css');
function semuaAturan(teks,selektor,properti){
  const lolos=selektor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...teks.matchAll(new RegExp('(?:^|[,}])\\s*'+lolos+'\\{[^}]*\\}','gm'))]
    .map(m=>m[0].replace(/^[,}]\s*/,'')).filter(m=>m.includes(properti));
}
const aturanDasar=(t,s,p)=>semuaAturan(t,s,p)[0]||'';
function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});

/* ==================================== A. MAPPING: SATU DAFTAR, SATU URUTAN ==================================== */

test('1. UI Mapping tidak lagi memuat Kelompok A/B dalam bentuk apa pun',()=>{
  const halaman=read('src/pages/settings.js');
  const gaya=css();
  /* Yang diperiksa MARKUP-nya, bukan komentar penjelas - komentar memang masih menyebut
     Kelompok A/B untuk menerangkan apa yang dibuang dan mengapa. */
  const markup=halaman.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.equal(/const groups=\['A','B'\]/.test(markup),false,'kartu per kelompok dibuang');
  assert.equal(/data-group\b/.test(markup),false,'dropdown kelompok dibuang');
  assert.equal(/Kelompok A|Kelompok B/.test(markup),false,'label kelompok dibuang dari markup');
  assert.equal(/mapping-group-select/.test(markup+gaya),false,'gaya dropdown ikut dibuang');
  /* Yang tersisa: satu daftar, dengan urutan dan status aktif. */
  assert.match(markup,/class="mapping-list"/,'satu daftar mapel');
  assert.match(markup,/data-up|data-down/,'kendali urutan tetap ada');
  assert.match(markup,/data-active/,'kendali aktif tetap ada');
});

test('2. Nomor urut adalah satu deret tunggal 1..N tanpa nomor kembar',()=>{
  const urut=normalizeMappingOrder(SUBJECTS_DEFAULT);
  assert.deepEqual(urut.map(item=>item.order),
    Array.from({length:SUBJECTS_DEFAULT.length},(_,i)=>i+1));
  assert.equal(new Set(urut.map(item=>item.order)).size,urut.length,'tidak ada nomor kembar');
  /* Seluruh mapel tetap ada; tidak ada yang hilang saat penomoran diubah. */
  assert.equal(urut.length,12);
  assert.deepEqual(urut.map(item=>item.id).sort(),SUBJECTS_DEFAULT.map(item=>item.id).sort());
});

test('3. Urutan Mapping menjadi sumber kebenaran untuk daftar mapel Guru',()=>{
  useMemoryStorage();
  const sesi=guru();
  /* Mapel terakhir dinaikkan ke posisi pertama. */
  const diubah=reorderSubject(
    reorderSubject(normalizeMappingOrder(SUBJECTS_DEFAULT).map(item=>({...item,active:true})),'koding',-1),
    'koding',-1);
  siapkanMapel(sesi,diubah);
  tugaskan(sesi,diubah.map(item=>item.id));
  const daftar=listActiveSubjects(sesi);
  const tersimpan=getSubjectMapping(sesi).filter(item=>item.active);
  /* Daftar Guru mengikuti urutan Mapping persis, bukan urutan kelompok. */
  assert.deepEqual(daftar.map(item=>item.id),tersimpan.map(item=>item.id));
  assert.equal(daftar.at(-3).id,'koding','mapel yang dinaikkan benar-benar bergeser');
  /* Dan tidak ada lagi pengurutan diam-diam berdasarkan kelompok. */
  assert.equal(/\(a\.group==='A'\?0:1\)/.test(read('src/services/subjects.js')),false);
});

test('4. Rapor, Leger, dan Transkrip memakai urutan yang sama, bukan kelompok',()=>{
  const cetak=read('src/pages/print.js');
  assert.equal(/\['A','B'\]\.flatMap/.test(cetak),false,'Rapor tidak mengelompokkan A/B');
  assert.match(cetak,/const rows=doc\.subjects\.slice\(\)/,'Rapor memakai urutan Mapping apa adanya');
  /* Tidak ada satu pun halaman yang menyortir memakai group. */
  for(const berkas of ['src/pages/print.js','src/pages/reports.js','src/pages/transcript.js',
    'src/services/subjects.js','src/services/report.js'])
    assert.equal(/sort\([^)]*\.group/.test(read(berkas)),false,`${berkas} tidak menyortir memakai group`);
});

test('5. Mapping lama bernomor per kelompok tetap terbaca dan dinormalkan sekali',()=>{
  /* Bentuk rilis lama: Kelompok A 1..9, Kelompok B 1..3 sendiri. */
  const jumlahA=SUBJECTS_DEFAULT.filter(item=>item.group==='A').length;
  const lama=SUBJECTS_DEFAULT.map(item=>({...item,
    order:item.group==='A'?item.order:item.order-jumlahA,
    active:item.id==='koding'?false:true}));
  const hasil=normalizeMappingOrder(lama);
  assert.deepEqual(hasil.map(item=>item.order),Array.from({length:12},(_,i)=>i+1));
  /* Urutan yang selama ini dilihat guru dipertahankan. */
  assert.deepEqual(hasil.map(item=>item.id),SUBJECTS_DEFAULT.map(item=>item.id));
  /* Status aktif, id, dan metadata kelompok tidak hilang. */
  assert.equal(hasil.find(item=>item.id==='koding').active,false,'status aktif dipertahankan');
  assert.ok(hasil.every(item=>['A','B'].includes(item.group)),'metadata group tetap tersimpan');
  /* Idempotent: dipanggil berkali-kali hasilnya sama. */
  assert.deepEqual(normalizeMappingOrder(hasil),hasil);
});

test('6. Mapping tersimpan bertahan lintas muat ulang dan tidak mengubah subjectId',()=>{
  useMemoryStorage();
  const sesi=guru();
  const diubah=reorderSubject(normalizeMappingOrder(SUBJECTS_DEFAULT),'bing',-1)
    .map(item=>item.id==='sunda'?{...item,active:false}:item);
  saveSubjectMapping(sesi,diubah);
  invalidateDbCache();
  const kembali=getSubjectMapping(sesi);
  assert.deepEqual(kembali.map(item=>item.id),diubah.map(item=>item.id),'urutan bertahan');
  assert.deepEqual(kembali.map(item=>item.order),Array.from({length:12},(_,i)=>i+1));
  assert.equal(kembali.find(item=>item.id==='sunda').active,false,'status aktif bertahan');
  assert.deepEqual(kembali.map(item=>item.id).sort(),SUBJECTS_DEFAULT.map(item=>item.id).sort(),
    'tidak ada subjectId yang berubah');
});

test('7. Backup lama bernomor per kelompok tetap diterima; berkas rusak tetap ditolak',()=>{
  useMemoryStorage();
  const sesi=guru();
  siapkanMapel(sesi,normalizeMappingOrder(SUBJECTS_DEFAULT));
  createStudent(sesi,{classId:'5B',nis:'5B-1',nisn:'4411000001',name:'Adwa',gender:'L',photo:''});
  const isi=buildBackup(sesi);
  const kunci=Object.keys(isi.data.subjectMappings)[0];
  /* Bentuk lama: nomor diulang per kelompok. Harus tetap diterima. */
  const jumlahA=SUBJECTS_DEFAULT.filter(item=>item.group==='A').length;
  const gayaLama=JSON.parse(JSON.stringify(isi));
  gayaLama.data.subjectMappings[kunci]=gayaLama.data.subjectMappings[kunci].map((item,index)=>
    ({...item,order:index<jumlahA?index+1:index+1-jumlahA}));
  assert.doesNotThrow(()=>parseBackupText(JSON.stringify(gayaLama)),'backup rilis lama tetap terbaca');
  /* Nomor kembar di luar bentuk lama tetap dianggap rusak. */
  const rusak=JSON.parse(JSON.stringify(isi));
  rusak.data.subjectMappings[kunci][1].order=1;
  assert.throws(()=>parseBackupText(JSON.stringify(rusak)),/urutan yang tidak valid/);
});

test('8. Baris Mapping memakai empat area terpisah dan tetap rapi di ponsel',()=>{
  const t=css();
  const baris=aturanDasar(t,'.subject-row','grid-template-areas');
  assert.match(baris,/grid-template-areas:"urut nomor nama aktif"/);
  for(const [selektor,area] of [['.order-actions','urut'],['.subject-order','nomor'],
    ['.subject-text','nama'],['.subject-row .switch','aktif']])
    assert.match(aturanDasar(t,selektor,'grid-area'),new RegExp(`grid-area:${area}`));
  const blok=t.slice(t.indexOf('B. MAPPING MATA PELAJARAN'));
  assert.match(blok,/@media\(max-width:767px\)[^@]*grid-template-areas:"nomor nama" "urut urut" "aktif aktif"/s);
});

/* ============================= B. ABSENSI MANUAL PADA LAYAR MENDATAR ============================= */

test('9. Layar mendatar: tabel manual mengikuti lebar konten, bukan lebar minimum 760px',()=>{
  const t=css();
  const blok=t.slice(t.indexOf('ABSENSI MANUAL PADA LAYAR MENDATAR'));
  assert.match(blok,/@media \(max-height:560px\) and \(orientation:landscape\)/,
    'aturannya khusus layar mendatar dan pendek');
  assert.match(blok,/\.attendance-manual\{min-width:0;width:100%;table-layout:fixed\}/,
    'lebar minimum dilepas sehingga tabel muat tanpa gulir mendatar');
  /* Kolom yang harus terlihat memang dijatah; kolom Sumber dilipat karena bukan bagian dari
     daftar kolom yang diminta terlihat. */
  assert.match(blok,/\.attendance-manual \.attendance-source\{display:none\}/);
  assert.match(blok,/\.attendance-manual \.attendance-manual-cell\{width:70px/);
  assert.match(blok,/\.attendance-manual \.cell-actions\{width:92px/);
});

test('10. Layar mendatar: kotak angka menyempit tetapi tetap nyaman disentuh',()=>{
  const t=css();
  const blok=t.slice(t.indexOf('ABSENSI MANUAL PADA LAYAR MENDATAR'));
  const kotak=blok.match(/\.attendance-manual \.attendance-manual-input\{[^}]*\}/)[0];
  const lebar=Number(kotak.match(/width:(\d+)px/)[1]);
  assert.ok(lebar>=60,`lebar ${lebar}px masih cukup untuk angka dua sampai tiga digit`);
  assert.match(kotak,/min-height:44px/,'tinggi sentuhnya tidak pernah dikurangi');
  const tombol=blok.match(/\.attendance-manual \.cell-actions \.btn-small\{[^}]*\}/)[0];
  assert.match(tombol,/min-height:44px/,'tombol Simpan tetap sasaran sentuh penuh');
});

test('11. Potret tidak diubah, dan kartu manual memakai seluruh lebar konten',()=>{
  const t=css();
  /* Aturan potret 1.3.1 tetap berlaku apa adanya: kotak 88px dan kolom Aksi statis. */
  const potret=t.slice(t.indexOf('A. ABSENSI MANUAL - KOTAK ANGKA'),t.indexOf('ABSENSI MANUAL PADA LAYAR MENDATAR'));
  assert.match(potret,/\.attendance-manual \.attendance-manual-input\{\s*width:88px;min-width:88px/);
  assert.match(potret,/\.attendance-manual \.cell-actions\{position:static/);
  /* Kartunya sendiri memakai seluruh lebar kisi rekap supaya tabelnya tidak terjepit. */
  assert.match(t,/\.attendance-manual-card\{grid-column:1\/-1\}/);
  assert.match(read('src/pages/attendance.js'),/class="card attendance-recap-card attendance-manual-card"/);
});

test('12. Logika Absensi, batas nilai, dan kolom Sumber tidak berubah',()=>{
  const halaman=read('src/pages/attendance.js');
  /* Kolomnya masih tujuh; yang berubah hanya penandaannya supaya dapat dilipat saat mendatar. */
  assert.equal((halaman.match(/class="attendance-source"/g)||[]).length,2,'kepala dan isi kolom Sumber ditandai');
  assert.match(halaman,/Manual<\/span>/,'keterangan sumber manual tetap ada');
  assert.match(halaman,/Absensi harian<\/span>/,'keterangan sumber harian tetap ada');
  assert.equal((halaman.match(/type="number" min="0" max="250" step="1"/g)||[]).length,3,
    'batas nilai tidak diubah');
  for(const fungsi of ['saveManualAttendance','clearManualAttendance','getManualAttendance',
    'semesterAttendanceRecap','monthlyAttendanceRecap'])
    assert.ok(halaman.includes(fungsi),`${fungsi} tetap dipakai`);
});
