import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { ASSESSMENT_TYPES, SCOPE_SUMMATIVE_TYPE, getAssessmentSettings, getAssessmentSheet,
  saveAllAssessmentSettings, saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { ASSESSMENT_HEADERS, commitAssessmentImport, previewAssessmentImport } from '../src/services/assessment-import.js';
import { saveAttendance } from '../src/services/attendance.js';
import { calculateReportScore, dailyEffectiveSheet, getReportScore, saveAttendanceConversion,
  saveAutomaticReportScores, saveDailyAttendanceMode } from '../src/services/report.js';

/* MESIN NILAI AKHIR: DUA MODE PERHITUNGAN, SATU JALUR.

   Aplikasi kini punya dua toggle yang berbeda tugas dan harus tetap berdiri sendiri-sendiri:

     "Penilaian Harian dari Absensi"  menentukan SUMBER nilai komponen Harian.
     "Gunakan Bobot Penilaian"        menentukan CARA Nilai Akhir dihitung.

   Berkas ini mengunci keduanya sekaligus: empat kombinasi toggle, tiga asal nilai (input
   manual, Isi Semua Nilai, Import Nilai), dan SELURUH mata pelajaran yang dikonfigurasi
   aplikasi - daftarnya diambil dari source, tidak pernah ditulis ulang di sini.

   Angka harapan TIDAK di-hardcode. Setiap test menyusun ulang perhitungannya sendiri dari
   angka komponen dan bobot yang dibacanya kembali dari aplikasi, sehingga rumus yang salah
   akan tertangkap - bukan sekadar "fungsinya mengembalikan sebuah angka". */

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),
    clear:()=>values.clear()};
  globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};
  invalidateDbCache();
  return values;
}

const guru=(classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

const MAPEL=SUBJECTS_DEFAULT.map(item=>item.id);
const KOMPONEN=ASSESSMENT_TYPES.map(type=>type.id);

/* Bobot uji sengaja TIDAK membuat Harian bernilai seperlima. Dengan 10% pada Harian, mode
   berbobot dan mode rata-rata tidak mungkin kebetulan menghasilkan angka yang sama saat
   sumber Harian berpindah - jadi tertukarnya dua mode langsung terlihat. Totalnya tetap
   100% sesuai kontrak existing. */
const BOBOT=Object.freeze({formative:40,daily:10,practice:20,scopeSummative:15,semesterSummative:15});
/* Lima angka yang berbeda-beda supaya kolom yang tertukar langsung ketahuan. */
const NILAI=Object.freeze({formative:60,daily:70,practice:80,scopeSummative:90,semesterSummative:100});

const SISWA=Object.freeze([
  {nis:'901',nisn:'0091',name:'Ayu Islam',religion:'Islam'},
  {nis:'902',nisn:'0092',name:'Beni Kristen',religion:'Kristen'},
  {nis:'903',nisn:'0093',name:'Cinta Islam',religion:'Islam'},
]);

function siapkan({classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`}={}){
  const scope=guru(classId,semester);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  const awalan=classId.replace(/\W/g,'');
  for(const item of SISWA)createStudent(scope,{classId,nis:`${awalan}-${item.nis}`,nisn:`${awalan}-${item.nisn}`,
    name:item.name,gender:'P',birthPlace:'Bekasi',birthDate:'2014-02-10',parentName:'Wali',religion:item.religion});
  return {scope,siswa:listStudents(scope,{classId})};
}
function awal(pilihan){useMemoryStorage();return siapkan(pilihan);}

/* ------------------------------------------------------------------ PENGATURAN PER MAPEL */

function aturMapel(scope,subjectId,{useWeights=true,bobot=BOBOT,kktp=75}={}){
  return saveAssessmentSettings(scope,subjectId,{...bobot,kktp,useWeights});
}
function aturSemuaMapel(scope,pilihan={}){
  for(const subjectId of MAPEL)aturMapel(scope,subjectId,pilihan);
}

/* ---------------------------------------------------------------------- TIGA ASAL NILAI */

const butirPertama=(scope,subjectId)=>listCpButir(scope,subjectId,{activeOnly:true})[0]?.id||null;
const pemilik=(scope,subjectId)=>getAssessmentSheet(scope,subjectId,'formative').rows.map(row=>row.studentId);

function isiManual(scope,subjectId,ids,nilai=NILAI){
  for(const type of KOMPONEN)
    saveAssessmentScores(scope,subjectId,type,Object.fromEntries(ids.map(id=>[id,nilai[type]])));
}
function isiSemuaNilai(scope,subjectId,_ids,nilaiTunggal=80){
  fillAllAssessmentScores(scope,subjectId,nilaiTunggal,{cpButirId:butirPertama(scope,subjectId)});
}
const kolom=label=>ASSESSMENT_HEADERS.indexOf(label);
/* Baris import memakai judul kolom template sungguhan; Sumatif Lingkup Materi masuk lewat
   kolom LM seperti berkas yang benar-benar diisi guru. */
function barisImport(student,nilai){
  const row=new Array(ASSESSMENT_HEADERS.length).fill('');
  row[kolom('NIS')]=student.nis;row[kolom('NISN')]=student.nisn;row[kolom('Nama')]=student.name;
  row[ASSESSMENT_HEADERS.length-1]=student.id;
  row[kolom('Formatif')]=nilai.formative;
  row[kolom('Penilaian Harian')]=nilai.daily;
  row[kolom('Penilaian Praktik')]=nilai.practice;
  row[kolom('Sumatif LM1')]=nilai.scopeSummative;
  row[kolom('Sumatif Akhir Semester')]=nilai.semesterSummative;
  return row;
}
function isiImport(scope,subjectId,ids,nilai=NILAI){
  const daftar=listStudents(scope,{classId:scope.classId}).filter(student=>ids.includes(student.id));
  const tabel=[[...ASSESSMENT_HEADERS],...daftar.map(student=>barisImport(student,nilai))];
  const preview=previewAssessmentImport(scope,subjectId,tabel);
  assert.equal(preview.invalidCount,0,`${subjectId}: ${JSON.stringify(preview.rows.flatMap(row=>row.errors))}`);
  commitAssessmentImport(scope,preview);
}
const SUMBER=Object.freeze([
  ['A. Input Manual',isiManual],
  ['B. Isi Semua Nilai',isiSemuaNilai],
  ['C. Import Nilai',isiImport],
]);

/* ------------------------------------------------------------------------------ ABSENSI */

/* Kehadiran dibuat dari absensi harian sungguhan, bukan ditanam: 41 hadir dari 50 hari dengan
   konversi Hadir 100 dan sisanya 0 menghasilkan tepat 82. */
function aturKehadiran(scope,{hadir=41,total=50}={}){
  saveAttendanceConversion(scope,{Hadir:100,Sakit:0,Izin:0,Alpa:0});
  const daftar=listStudents(scope,{classId:scope.classId});
  const bulan=String(scope.semester).startsWith('Ganjil')?7:1;
  const tahun=Number(ACADEMIC_YEAR.slice(0,4))+(bulan===7?0:1);
  for(let hari=0;hari<total;hari+=1){
    const tanggal=new Date(Date.UTC(tahun,bulan,1+hari)).toISOString().slice(0,10);
    const status=hari<hadir?'Hadir':'Alpa';
    saveAttendance(scope,tanggal,Object.fromEntries(daftar.map(student=>[student.id,status])));
  }
}
const NILAI_KEHADIRAN=82;

function aturAbsensiSemuaMapel(scope,aktif){
  for(const subjectId of MAPEL)saveDailyAttendanceMode(scope,subjectId,aktif);
}

/* ------------------------------------------------------- HARAPAN DIHITUNG ULANG DI TEST */

/* Rumus disusun ulang di sini dari nol, memakai semantics komponen kosong yang berlaku pada
   KEDUA mode: yang kosong tidak dianggap nol, tidak ikut pembilang, dan tidak ikut penyebut. */
function harapanMentah(nilai,{useWeights,bobot=BOBOT}){
  const terisi=KOMPONEN.filter(type=>nilai[type]!==null&&nilai[type]!==undefined);
  if(!terisi.length)return null;
  if(!useWeights)return terisi.reduce((sum,type)=>sum+nilai[type],0)/terisi.length;
  const penyebut=terisi.reduce((sum,type)=>sum+bobot[type],0);
  if(penyebut<=0)return terisi.reduce((sum,type)=>sum+nilai[type],0)/terisi.length;
  return terisi.reduce((sum,type)=>sum+nilai[type]*bobot[type],0)/penyebut;
}
/* Aturan pembulatan canonical aplikasi: satu pembulatan, di satu tempat, ke bilangan bulat
   terdekat. Disusun ulang di sini supaya test tidak sekadar mengulang kode produksi. */
const bulatkan=value=>value===null?null:Math.round(value);

function nilaiBerlaku({absensi}){
  return absensi?{...NILAI,daily:NILAI_KEHADIRAN}:{...NILAI};
}
const dekat=(a,b,pesan)=>assert.ok(Math.abs(a-b)<1e-9,`${pesan}: ${a} bukan ${b}`);

/* ================================================================= MATRIX UTAMA (§X) */

for(const [namaSumber,isi] of SUMBER){
  for(const absensi of [false,true]){
    for(const useWeights of [false,true]){
      test(`MATRIX ${namaSumber} × Absensi ${absensi?'ON':'OFF'} × Bobot ${useWeights?'ON':'OFF'} - SELURUH mapel`,()=>{
        const {scope}=awal();
        aturSemuaMapel(scope,{useWeights});
        aturKehadiran(scope);
        aturAbsensiSemuaMapel(scope,absensi);
        const gagal=[];
        for(const subjectId of MAPEL){
          const ids=pemilik(scope,subjectId);
          assert.ok(ids.length,`${subjectId} wajib punya siswa`);
          isi(scope,subjectId,ids);
          /* Isi Semua Nilai memang menulis satu angka yang sama ke kelima komponen - itulah
             sifat fiturnya - jadi harapannya disusun dari angka itu, bukan dari lima angka
             berbeda yang tidak mungkin dihasilkannya. */
          const mentah=isi===isiSemuaNilai
            ? nilaiBerlaku({absensi}) && {...Object.fromEntries(KOMPONEN.map(type=>[type,80])),...(absensi?{daily:NILAI_KEHADIRAN}:{})}
            : nilaiBerlaku({absensi});
          const harap=bulatkan(harapanMentah(mentah,{useWeights}));
          for(const id of ids){
            const hitung=calculateReportScore(scope,subjectId,id);
            if(hitung.finalScore!==harap)gagal.push(`${subjectId}/${id}: ${hitung.finalScore} bukan ${harap}`);
            if(hitung.useWeights!==useWeights)gagal.push(`${subjectId}/${id}: mode ${hitung.weightMode} tidak sesuai toggle`);
            if(hitung.dailyFromAttendance!==absensi)gagal.push(`${subjectId}/${id}: sumber Harian tidak sesuai toggle`);
          }
        }
        assert.deepEqual(gagal,[],`kombinasi yang masih salah:\n${gagal.join('\n')}`);
      });
    }
  }
}

/* ==================================================== TEST 1-12: EMPAT KOMBINASI × 3 SUMBER */

/* Satu mapel diperiksa angka demi angka supaya kesalahan rumus terbaca langsung, bukan hanya
   sebagai "ada yang tidak sama" pada matriks di atas. */
function siapkanSatuMapel({absensi,useWeights,isi,subjectId='mtk'}){
  const {scope}=awal();
  aturMapel(scope,subjectId,{useWeights});
  aturKehadiran(scope);
  saveDailyAttendanceMode(scope,subjectId,absensi);
  const ids=pemilik(scope,subjectId);
  isi(scope,subjectId,ids);
  return {scope,ids,subjectId};
}

let nomor=0;
for(const [namaSumber,isi] of SUMBER){
  for(const absensi of [false,true]){
    for(const useWeights of [false,true]){
      nomor+=1;
      const ke=nomor;
      test(`TEST ${ke}. ${namaSumber.slice(3)} + Absensi ${absensi?'ON':'OFF'} + Bobot ${useWeights?'ON':'OFF'}`,()=>{
        const {scope,ids,subjectId}=siapkanSatuMapel({absensi,useWeights,isi});
        const dasar=isi===isiSemuaNilai?Object.fromEntries(KOMPONEN.map(type=>[type,80])):{...NILAI};
        const mentah=absensi?{...dasar,daily:NILAI_KEHADIRAN}:dasar;
        const harapMentah=harapanMentah(mentah,{useWeights});
        for(const id of ids){
          const hitung=calculateReportScore(scope,subjectId,id);
          dekat(hitung.rawScore,harapMentah,'nilai mentah');
          assert.equal(hitung.finalScore,bulatkan(harapMentah),'Nilai Akhir sesudah pembulatan');
          /* Komponen Harian memang memakai sumber yang dipilih toggle. */
          const harian=hitung.components.find(item=>item.id==='daily');
          assert.equal(harian.score,absensi?NILAI_KEHADIRAN:dasar.daily);
          assert.equal(harian.source,absensi?'attendance':'manual');
        }
      });
    }
  }
}

/* ===================================== TEST 13-15: ABSENSI TIDAK MERUSAK NILAI TERSIMPAN */

test('TEST 13. Absensi ON tidak menghapus Harian manual',()=>{
  const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights:true,isi:isiManual});
  aturKehadiran(scope);
  saveDailyAttendanceMode(scope,subjectId,true);
  for(const id of ids){
    const tersimpan=getAssessmentSheet(scope,subjectId,'daily').rows.find(row=>row.studentId===id).score;
    assert.equal(tersimpan,NILAI.daily,'nilai manual tetap utuh di penyimpanan');
    const berlaku=dailyEffectiveSheet(scope,subjectId).rows.find(row=>row.studentId===id);
    assert.equal(berlaku.manualScore,NILAI.daily,'nilai manual tetap terbawa');
    assert.equal(berlaku.score,NILAI_KEHADIRAN,'yang berlaku adalah hasil konversi absensi');
  }
});

test('TEST 14. Absensi ON tidak menghapus Harian hasil Import',()=>{
  const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights:true,isi:isiImport});
  aturKehadiran(scope);
  saveDailyAttendanceMode(scope,subjectId,true);
  for(const id of ids)
    assert.equal(getAssessmentSheet(scope,subjectId,'daily').rows.find(row=>row.studentId===id).score,
      NILAI.daily,'nilai hasil import tetap utuh');
});

test('TEST 15. Absensi ON lalu OFF mengembalikan Harian manual/import tanpa input ulang',()=>{
  for(const isi of [isiManual,isiImport]){
    const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights:true,isi});
    aturKehadiran(scope);
    const efektif=id=>dailyEffectiveSheet(scope,subjectId).rows.find(row=>row.studentId===id).score;
    for(const id of ids)assert.equal(efektif(id),NILAI.daily,'OFF: nilai tersimpan');
    saveDailyAttendanceMode(scope,subjectId,true);
    for(const id of ids)assert.equal(efektif(id),NILAI_KEHADIRAN,'ON: nilai kehadiran');
    saveDailyAttendanceMode(scope,subjectId,false);
    for(const id of ids)assert.equal(efektif(id),NILAI.daily,'OFF kembali: nilai tersimpan kembali berlaku');
  }
});

/* ================================= TEST 16-20: KONFIGURASI BOBOT DAN VALIDASINYA (§E) */

test('TEST 16. Bobot OFF tidak menghapus konfigurasi bobot',()=>{
  const {scope}=awal();
  aturMapel(scope,'mtk',{useWeights:true});
  aturMapel(scope,'mtk',{useWeights:false});
  const pengaturan=getAssessmentSettings(scope,'mtk');
  assert.equal(pengaturan.useWeights,false,'togglenya memang OFF');
  for(const type of KOMPONEN)
    assert.equal(pengaturan[type],BOBOT[type],`bobot ${type} tetap tersimpan apa adanya`);
  assert.equal(pengaturan.kktp,75,'KKTP tidak ikut tersentuh');
});

test('TEST 17. Bobot OFF lalu ON memakai kembali bobot yang tersimpan',()=>{
  const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights:false,isi:isiManual});
  const rataRata=bulatkan(harapanMentah(NILAI,{useWeights:false}));
  for(const id of ids)assert.equal(calculateReportScore(scope,subjectId,id).finalScore,rataRata);
  /* Dinyalakan kembali TANPA mengirim ulang satu angka bobot pun. */
  saveAssessmentSettings(scope,subjectId,{...BOBOT,kktp:75,useWeights:true});
  const berbobot=bulatkan(harapanMentah(NILAI,{useWeights:true}));
  assert.notEqual(rataRata,berbobot,'contoh uji memang membedakan kedua mode');
  for(const id of ids)assert.equal(calculateReportScore(scope,subjectId,id).finalScore,berbobot,
    'bobot yang tersimpan dipakai lagi');
});

test('TEST 18. Bobot ON -> OFF -> ON konsisten',()=>{
  const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights:true,isi:isiManual});
  const berbobot=bulatkan(harapanMentah(NILAI,{useWeights:true}));
  const rataRata=bulatkan(harapanMentah(NILAI,{useWeights:false}));
  const nilaiAkhir=()=>calculateReportScore(scope,subjectId,ids[0]).finalScore;
  const nilaiKomponen=()=>KOMPONEN.map(type=>
    getAssessmentSheet(scope,subjectId,type).rows.find(row=>row.studentId===ids[0]).score);
  const komponenAwal=nilaiKomponen();
  assert.equal(nilaiAkhir(),berbobot);
  aturMapel(scope,subjectId,{useWeights:false});
  assert.equal(nilaiAkhir(),rataRata);
  aturMapel(scope,subjectId,{useWeights:true});
  assert.equal(nilaiAkhir(),berbobot,'kembali persis ke hasil semula');
  assert.deepEqual(nilaiKomponen(),komponenAwal,'nilai mentah lima komponen tidak pernah berubah');
});

test('TEST 19. Bobot total 100% diterima',()=>{
  const {scope}=awal();
  const pengaturan=aturMapel(scope,'mtk',{useWeights:true});
  assert.equal(KOMPONEN.reduce((sum,type)=>sum+pengaturan[type],0),100);
});

test('TEST 20. Bobot invalid tetap ditolak validasi existing - juga saat toggle OFF',()=>{
  const {scope}=awal();
  /* Kontrak existing tidak dilonggarkan oleh toggle: bobot yang tidak berjumlah 100% tetap
     ditolak, sehingga menyalakannya kembali tidak pernah memakai konfigurasi yang rusak. */
  for(const useWeights of [true,false])
    assert.throws(()=>saveAssessmentSettings(scope,'mtk',
      {formative:50,daily:10,practice:20,scopeSummative:15,semesterSummative:15,kktp:75,useWeights}),
    /Total bobot wajib 100%/,`bobot 110% ditolak saat toggle ${useWeights?'ON':'OFF'}`);
});

/* ============================================ TEST 21-22: KOMPONEN KOSONG DAN PEMBULATAN */

test('TEST 21. Komponen kosong tidak dianggap nol pada KEDUA mode',()=>{
  for(const useWeights of [false,true]){
    const {scope}=awal();
    aturMapel(scope,'mtk',{useWeights});
    const ids=pemilik(scope,'mtk');
    /* Hanya dua komponen yang diisi; tiga lainnya belum dinilai sama sekali. */
    const sebagian={formative:60,practice:80};
    saveAssessmentScores(scope,'mtk','formative',Object.fromEntries(ids.map(id=>[id,60])));
    saveAssessmentScores(scope,'mtk','practice',Object.fromEntries(ids.map(id=>[id,80])));
    const harap=harapanMentah(sebagian,{useWeights});
    const hitung=calculateReportScore(scope,'mtk',ids[0]);
    dekat(hitung.rawScore,harap,`mode ${useWeights?'bobot':'rata-rata'}`);
    assert.equal(hitung.filledCount,2,'hanya dua komponen yang terisi');
    /* Kalau yang kosong diam-diam dihitung sebagai nol, hasilnya akan jauh lebih rendah. */
    const seolahNol=(60+80+0+0+0)/5;
    assert.ok(hitung.rawScore>seolahNol,'komponen kosong tidak pernah menjadi nol');
    if(!useWeights)dekat(hitung.rawScore,70,'rata-rata dibagi jumlah komponen yang BERLAKU, bukan selalu lima');
  }
});

test('TEST 22. Pembulatan konsisten: Menu Penilaian sama dengan Nilai Rapor',()=>{
  /* Empat angka mentah dari brief dibentuk dari nilai sungguhan, lalu dibandingkan pada dua
     tempat yang berbeda: hasil hitung dan catatan rapor yang tersimpan. */
  for(const useWeights of [false,true]){
    const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights,isi:isiManual});
    const hitung=calculateReportScore(scope,subjectId,ids[0]);
    assert.equal(hitung.finalScore,Math.round(hitung.rawScore),'satu aturan pembulatan');
    assert.equal(hitung.roundedScore,hitung.finalScore,'tidak ada dua angka akhir yang berbeda');
    saveAutomaticReportScores(scope,subjectId);
    const rapor=getReportScore(scope,subjectId,ids[0]);
    assert.equal(rapor.finalScore,hitung.finalScore,'Rapor membulatkan dengan cara yang sama');
    dekat(rapor.rawScore,hitung.rawScore,'nilai mentah diteruskan apa adanya');
  }
});

/* ======================================== TEST 23-25: KKTP, RUBRIK, DAN BUTIR CP UTUH */

test('TEST 23. Toggle Bobot tidak mengubah KKTP',()=>{
  const {scope}=awal();
  aturMapel(scope,'mtk',{useWeights:true,kktp:78});
  assert.equal(getAssessmentSettings(scope,'mtk').kktp,78);
  saveAssessmentSettings(scope,'mtk',{...BOBOT,kktp:78,useWeights:false});
  assert.equal(getAssessmentSettings(scope,'mtk').kktp,78,'KKTP tidak tersentuh toggle');
});

test('TEST 24. Toggle Bobot tidak mengubah rubrik Deskripsi Rapor',()=>{
  const {scope}=awal();
  aturMapel(scope,'mtk',{useWeights:true});
  const sebelum=JSON.stringify(getAssessmentSettings(scope,'mtk').rubric);
  aturMapel(scope,'mtk',{useWeights:false});
  assert.equal(JSON.stringify(getAssessmentSettings(scope,'mtk').rubric),sebelum,'rubrik utuh');
});

test('TEST 25. Toggle Bobot tidak menyentuh bukti Butir CP',()=>{
  const {scope}=awal();
  const subjectId='mtk';
  aturMapel(scope,subjectId,{useWeights:true});
  const butir=butirPertama(scope,subjectId);
  const ids=pemilik(scope,subjectId);
  saveAssessmentScores(scope,subjectId,'formative',Object.fromEntries(ids.map(id=>[id,85])),{cpButirId:butir});
  const bukti=()=>getAssessmentSheet(scope,subjectId,'formative',{cpButirId:butir}).rows
    .find(row=>row.studentId===ids[0]).score;
  assert.equal(bukti(),85);
  aturMapel(scope,subjectId,{useWeights:false});
  assert.equal(bukti(),85,'bukti butir tidak ditulis ulang oleh perubahan mode');
  aturMapel(scope,subjectId,{useWeights:true});
  assert.equal(bukti(),85);
});

/* ====================================== TEST 26-27: IMPORT TETAP BENAR DAN SETARA (§K) */

test('TEST 26. Import tetap menimpa nilai lama pada SELURUH mapel - kedua mode',()=>{
  for(const useWeights of [false,true]){
    const {scope}=awal();
    aturSemuaMapel(scope,{useWeights});
    const gagal=[];
    for(const subjectId of MAPEL){
      const ids=pemilik(scope,subjectId);
      isiSemuaNilai(scope,subjectId,ids,80);
      isiImport(scope,subjectId,ids);
      for(const id of ids){
        const butir=butirPertama(scope,subjectId);
        const terlihat=getAssessmentSheet(scope,subjectId,'formative',butir?{cpButirId:butir}:{}).rows
          .find(row=>row.studentId===id)?.score;
        if(terlihat!==NILAI.formative)gagal.push(`${subjectId}/${id}: ${terlihat} bukan ${NILAI.formative}`);
      }
    }
    assert.deepEqual(gagal,[],`mode ${useWeights?'bobot':'rata-rata'}:\n${gagal.join('\n')}`);
  }
});

test('TEST 27. Manual, Isi Semua Nilai, dan Import dengan angka sama = Nilai Akhir identik',()=>{
  const sama=Object.fromEntries(KOMPONEN.map(type=>[type,84]));
  for(const absensi of [false,true]){
    for(const useWeights of [false,true]){
      const hasil=[];
      for(const isi of [isiManual,isiImport,(scope,subjectId,ids)=>isiSemuaNilai(scope,subjectId,ids,84)]){
        const {scope}=awal();
        aturSemuaMapel(scope,{useWeights});
        aturKehadiran(scope);
        aturAbsensiSemuaMapel(scope,absensi);
        const perMapel={};
        for(const subjectId of MAPEL){
          const ids=pemilik(scope,subjectId);
          isi(scope,subjectId,ids,sama);
          perMapel[subjectId]=ids.map(id=>calculateReportScore(scope,subjectId,id).finalScore);
        }
        hasil.push(perMapel);
      }
      assert.deepEqual(hasil[1],hasil[0],`Import = Manual (absensi ${absensi}, bobot ${useWeights})`);
      assert.deepEqual(hasil[2],hasil[0],`Isi Semua = Manual (absensi ${absensi}, bobot ${useWeights})`);
    }
  }
});

/* ====================================== TEST 28-30: BATAS MENUJU NILAI RAPOR (§W) */

test('TEST 28. Import tidak langsung menulis Nilai Rapor',()=>{
  const {scope}=awal();
  aturMapel(scope,'mtk',{useWeights:true});
  const ids=pemilik(scope,'mtk');
  isiImport(scope,'mtk',ids);
  for(const id of ids)assert.equal(getReportScore(scope,'mtk',id),null,'rapor belum ditulis oleh import');
});

test('TEST 29. Perubahan toggle tidak langsung menulis Nilai Rapor',()=>{
  const {scope,ids,subjectId}=siapkanSatuMapel({absensi:false,useWeights:true,isi:isiManual});
  saveAutomaticReportScores(scope,subjectId);
  const lama=getReportScore(scope,subjectId,ids[0]).finalScore;
  assert.equal(lama,bulatkan(harapanMentah(NILAI,{useWeights:true})));
  /* Kedua toggle diubah - rapor tersimpan tetap memegang angka lama. */
  aturMapel(scope,subjectId,{useWeights:false});
  aturKehadiran(scope);
  saveDailyAttendanceMode(scope,subjectId,true);
  const baru=calculateReportScore(scope,subjectId,ids[0]).finalScore;
  assert.notEqual(baru,lama,'contoh uji memang mengubah Nilai Akhir');
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,lama,'Rapor belum berubah');
  saveAutomaticReportScores(scope,subjectId);
  assert.equal(getReportScore(scope,subjectId,ids[0]).finalScore,baru,'sesudah Simpan Otomatis barulah berubah');
});

test('TEST 30. Simpan Otomatis Semua Mapel mengambil Nilai Akhir terbaru pada SELURUH mapel',()=>{
  const {scope}=awal();
  aturSemuaMapel(scope,{useWeights:true});
  for(const subjectId of MAPEL)isiManual(scope,subjectId,pemilik(scope,subjectId));
  for(const subjectId of MAPEL)saveAutomaticReportScores(scope,subjectId);
  const berbobot=bulatkan(harapanMentah(NILAI,{useWeights:true}));
  const rataRata=bulatkan(harapanMentah(NILAI,{useWeights:false}));
  for(const subjectId of MAPEL)for(const id of pemilik(scope,subjectId))
    assert.equal(getReportScore(scope,subjectId,id).finalScore,berbobot,`${subjectId} berbobot`);
  aturSemuaMapel(scope,{useWeights:false});
  for(const subjectId of MAPEL)saveAutomaticReportScores(scope,subjectId);
  for(const subjectId of MAPEL)for(const id of pemilik(scope,subjectId))
    assert.equal(getReportScore(scope,subjectId,id).finalScore,rataRata,`${subjectId} rata-rata`);
});

/* ============================================================ TEST 31-36: ISOLASI SCOPE */

test('TEST 31. Isolasi siswa: satu siswa tidak menarik siswa lain',()=>{
  const {scope,siswa}=awal();
  aturMapel(scope,'mtk',{useWeights:false});
  saveAssessmentScores(scope,'mtk','formative',{[siswa[0].id]:90});
  saveAssessmentScores(scope,'mtk','formative',{[siswa[1].id]:60});
  assert.equal(calculateReportScore(scope,'mtk',siswa[0].id).finalScore,90);
  assert.equal(calculateReportScore(scope,'mtk',siswa[1].id).finalScore,60);
  assert.equal(calculateReportScore(scope,'mtk',siswa[2].id).finalScore,null,'yang belum dinilai tetap kosong');
});

test('TEST 32. Isolasi mapel: mode satu mapel tidak menular ke mapel lain',()=>{
  const {scope}=awal();
  aturSemuaMapel(scope,{useWeights:true});
  for(const subjectId of MAPEL)isiManual(scope,subjectId,pemilik(scope,subjectId));
  aturMapel(scope,'mtk',{useWeights:false});
  const rataRata=bulatkan(harapanMentah(NILAI,{useWeights:false}));
  const berbobot=bulatkan(harapanMentah(NILAI,{useWeights:true}));
  const id=pemilik(scope,'mtk')[0];
  assert.equal(calculateReportScore(scope,'mtk',id).finalScore,rataRata,'mapel yang diubah');
  for(const subjectId of MAPEL.filter(item=>item!=='mtk'))
    assert.equal(calculateReportScore(scope,subjectId,id).finalScore,berbobot,`${subjectId} tidak ikut berubah`);
});

test('TEST 33. Isolasi rombel',()=>{
  useMemoryStorage();
  const a=siapkan({classId:'5A'});const b=siapkan({classId:'5B'});
  aturMapel(a.scope,'mtk',{useWeights:true});
  aturMapel(b.scope,'mtk',{useWeights:false});
  isiManual(a.scope,'mtk',pemilik(a.scope,'mtk'));
  isiManual(b.scope,'mtk',pemilik(b.scope,'mtk'));
  assert.equal(calculateReportScore(a.scope,'mtk',a.siswa[0].id).finalScore,
    bulatkan(harapanMentah(NILAI,{useWeights:true})));
  assert.equal(calculateReportScore(b.scope,'mtk',b.siswa[0].id).finalScore,
    bulatkan(harapanMentah(NILAI,{useWeights:false})),'rombel lain memakai modenya sendiri');
});

test('TEST 34. Isolasi semester',()=>{
  useMemoryStorage();
  const ganjil=siapkan({classId:'5A',semester:`Ganjil ${ACADEMIC_YEAR}`});
  const genap=guru('5A',`Genap ${ACADEMIC_YEAR}`);
  saveSubjectMapping(genap,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  aturMapel(ganjil.scope,'mtk',{useWeights:true});
  aturMapel(genap,'mtk',{useWeights:false});
  assert.equal(getAssessmentSettings(ganjil.scope,'mtk').useWeights,true);
  assert.equal(getAssessmentSettings(genap,'mtk').useWeights,false,'semester lain berdiri sendiri');
});

test('TEST 35. Isolasi tahun pelajaran',()=>{
  useMemoryStorage();
  const sekarang=siapkan({classId:'5A'});
  const lain={role:'teacher',classId:'5A',academicYear:'2019/2020',semester:'Ganjil 2019/2020'};
  saveSubjectMapping(lain,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  aturMapel(sekarang.scope,'mtk',{useWeights:false});
  assert.equal(getAssessmentSettings(lain,'mtk').useWeights,true,'tahun lain memakai bawaan ON');
  assert.equal(getAssessmentSettings(sekarang.scope,'mtk').useWeights,false);
});

test('TEST 36. Persistence: pilihan toggle dan hasil hitung bertahan sesudah reload',()=>{
  const {scope,ids,subjectId}=siapkanSatuMapel({absensi:true,useWeights:false,isi:isiManual});
  const sebelum=calculateReportScore(scope,subjectId,ids[0]).finalScore;
  const tersimpan=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');
  invalidateDbCache();
  const values=new Map([['erapor_satria_jaya_01_v1',tersimpan]]);
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
  assert.equal(getAssessmentSettings(scope,subjectId).useWeights,false,'pilihan guru bertahan');
  assert.equal(calculateReportScore(scope,subjectId,ids[0]).finalScore,sebelum,'hasilnya sama sesudah reload');
});

/* ========================================= TEST 37-38: DUA TAB PENGATURAN BOBOT (§N, §O) */

test('TEST 37. Per Mata Pelajaran tetap bekerja: satu mapel, satu pilihan',()=>{
  const {scope}=awal();
  aturSemuaMapel(scope,{useWeights:true});
  aturMapel(scope,'bindo',{useWeights:false});
  assert.equal(getAssessmentSettings(scope,'bindo').useWeights,false);
  for(const subjectId of MAPEL.filter(item=>item!=='bindo'))
    assert.equal(getAssessmentSettings(scope,subjectId).useWeights,true,`${subjectId} tidak ikut berubah`);
});

test('TEST 38. Semua Mapel Sekaligus tetap bekerja, lalu kembali ke satu mapel',()=>{
  const {scope}=awal();
  /* Massal: seluruh mapel dimatikan bobotnya dalam satu simpan. */
  saveAllAssessmentSettings(scope,MAPEL.map(subjectId=>({subjectId,...BOBOT,kktp:75,useWeights:false})));
  for(const subjectId of MAPEL){
    const pengaturan=getAssessmentSettings(scope,subjectId);
    assert.equal(pengaturan.useWeights,false,`${subjectId} OFF`);
    for(const type of KOMPONEN)assert.equal(pengaturan[type],BOBOT[type],`${subjectId} bobot tetap tersimpan`);
  }
  /* Lalu satu mapel dikembalikan sendiri - tanpa mengganggu yang lain. */
  aturMapel(scope,'ipas',{useWeights:true});
  assert.equal(getAssessmentSettings(scope,'ipas').useWeights,true);
  for(const subjectId of MAPEL.filter(item=>item!=='ipas'))
    assert.equal(getAssessmentSettings(scope,subjectId).useWeights,false,`${subjectId} tetap OFF`);
  /* Simpan massal yang TIDAK menyebut toggle tidak boleh diam-diam menyalakannya kembali. */
  saveAllAssessmentSettings(scope,MAPEL.map(subjectId=>({subjectId,...BOBOT,kktp:80})));
  assert.equal(getAssessmentSettings(scope,'bindo').useWeights,false,'pilihan lama dipertahankan');
  assert.equal(getAssessmentSettings(scope,'ipas').useWeights,true);
  assert.equal(getAssessmentSettings(scope,'bindo').kktp,80,'yang memang dikirim tetap tersimpan');
});

/* ====================================================== BACKWARD COMPATIBILITY (§AE) */

test('KOMPATIBILITAS. Catatan pengaturan lama tanpa kolom useWeights dibaca sebagai ON',()=>{
  const {scope}=awal();
  aturMapel(scope,'mtk',{useWeights:true});
  /* Catatan dibuat menyerupai database sekolah yang sudah berjalan sebelum rilis ini:
     kolomnya memang belum ada sama sekali. */
  const db=loadDb();
  const kunci=Object.keys(db.assessmentSettings).find(key=>key.endsWith('|mtk'));
  assert.ok(kunci,'catatan pengaturan ditemukan');
  delete db.assessmentSettings[kunci].useWeights;
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  invalidateDbCache();
  assert.equal(getAssessmentSettings(scope,'mtk').useWeights,true,'dibaca sebagai ON, bukan OFF');
  const ids=pemilik(scope,'mtk');
  isiManual(scope,'mtk',ids);
  assert.equal(calculateReportScore(scope,'mtk',ids[0]).finalScore,
    bulatkan(harapanMentah(NILAI,{useWeights:true})),
    'database lama menghitung persis seperti sebelum rilis ini - tanpa migrasi');
});

/* ======================================================== CONTOH ANGKA DARI BRIEF (§C-§I) */

test('CONTOH BRIEF. Empat contoh angka pada brief menghasilkan angka yang sama',()=>{
  const contoh={formative:85,daily:86,practice:87,scopeSummative:88,semesterSummative:89};
  const bobotBrief={formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15};
  /* §C: rata-rata lima komponen = 87. */
  dekat(harapanMentah(contoh,{useWeights:false,bobot:bobotBrief}),87,'§C rata-rata');
  /* §D: berbobot 30/20/20/15/15 = 86.65. */
  dekat(harapanMentah(contoh,{useWeights:true,bobot:bobotBrief}),86.65,'§D berbobot');
  /* §H: Absensi ON (Harian 82) + Bobot OFF = 86.2. */
  const denganAbsensi={...contoh,daily:82};
  dekat(harapanMentah(denganAbsensi,{useWeights:false,bobot:bobotBrief}),86.2,'§H rata-rata dengan absensi');
  /* §I: Absensi ON + Bobot ON = 85.85. */
  dekat(harapanMentah(denganAbsensi,{useWeights:true,bobot:bobotBrief}),85.85,'§I berbobot dengan absensi');

  /* Lalu angka-angka itu dibuktikan lahir dari aplikasi, bukan hanya dari aritmetika test. */
  const {scope}=awal();
  const ids=pemilik(scope,'mtk');
  saveAssessmentSettings(scope,'mtk',{...bobotBrief,kktp:75,useWeights:false});
  isiManual(scope,'mtk',ids,contoh);
  dekat(calculateReportScore(scope,'mtk',ids[0]).rawScore,87,'aplikasi §C');
  assert.equal(calculateReportScore(scope,'mtk',ids[0]).finalScore,87);
  saveAssessmentSettings(scope,'mtk',{...bobotBrief,kktp:75,useWeights:true});
  dekat(calculateReportScore(scope,'mtk',ids[0]).rawScore,86.65,'aplikasi §D');
  assert.equal(calculateReportScore(scope,'mtk',ids[0]).finalScore,87,'86.65 dibulatkan menjadi 87');
});
