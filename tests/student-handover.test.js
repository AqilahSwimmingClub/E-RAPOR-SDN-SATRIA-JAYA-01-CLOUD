import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import { exportStudentHandover, importStudentHandover, previewStudentHandover,
  suggestPromotionClass, HANDOVER_SCHEMA, HANDOVER_BIODATA_FIELDS } from '../src/services/student-handover.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, updateDb } from '../src/services/storage.js';

/* Serah terima biodata siswa antar kelas, tahun pelajaran, dan perangkat.

   Berkasnya sengaja hanya membawa biodata. Nilai, absensi, akun, dan lisensi tidak pernah ikut
   dan tidak bisa ikut, karena isinya disusun dari daftar putih field, bukan dengan membuang
   field terlarang satu per satu. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:k=>values.has(k)?values.get(k):null,
  setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear()};invalidateDbCache();return values;}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`,academicYear=ACADEMIC_YEAR)=>({role:'teacher',classId,academicYear,semester});
const admin=(academicYear=ACADEMIC_YEAR,semester=`Ganjil ${ACADEMIC_YEAR}`)=>({role:'admin',classId:null,academicYear,semester});

function siswa(session,suffix,extra={}){
  return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,
    gender:suffix%2?'L':'P',religion:'Islam',birthPlace:'Kota Uji',birthDate:'2015-01-02',parentName:`Orang Tua ${suffix}`,
    phone:'0812',address:`Jalan Contoh ${suffix}`,photo:'',...extra});
}
function isiKelas(session,jumlah=3){return Array.from({length:jumlah},(_,i)=>siswa(session,i+1));}

/* --------------------------------------------------- Isi berkas hanya biodata */

test('Berkas serah terima hanya membawa biodata dan metadata sumber',()=>{
  useMemoryStorage();
  const sumber=guru();
  const daftar=isiKelas(sumber);
  /* Data akademik dan rahasia perangkat sengaja diisi agar terbukti tidak ikut terbawa. */
  updateDb(db=>{
    db.assessmentScores[`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|mtk|formative|${daftar[0].id}`]={studentId:daftar[0].id,score:88};
    db.attendance[`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B|2026-08-10`]={date:'2026-08-10',statuses:{[daftar[0].id]:'Sakit'}};
    db.userAccounts['guru-5b']={username:'Guru5B',passwordHash:'RAHASIA-HASH',salt:'GARAM'};
    return db;
  });
  globalThis.localStorage.setItem('erapor_license_v1',JSON.stringify({activation_token:'TOKEN-RAHASIA',license_id:'lic-a'}));
  globalThis.localStorage.setItem('erapor_installation_v1','inst_'+'a'.repeat(32));

  const berkas=exportStudentHandover(sumber,{studentIds:daftar.map(item=>item.id)});
  /* `exportedAt` adalah cap waktu ISO, dan milidetiknya kadang kebetulan memuat "88" - angka
     nilai yang justru sedang dibuktikan TIDAK terbawa. Tanpa dikecualikan, test ini gagal
     sendiri kira-kira dua kali dari seratus jalan tanpa ada yang berubah pada kodenya. Yang
     diperiksa adalah ISI berkasnya, jadi cap waktunya dikeluarkan lebih dulu. */
  const teks=JSON.stringify({...berkas,source:{...berkas.source,exportedAt:''}});
  assert.equal(berkas.schema,HANDOVER_SCHEMA);
  assert.equal(berkas.students.length,3);
  assert.ok(berkas.source.academicYear&&berkas.source.semester&&berkas.source.classId&&berkas.source.exportedAt);

  for(const terlarang of ['88','RAHASIA-HASH','GARAM','TOKEN-RAHASIA','lic-a','inst_aaaa','Sakit',
    'assessmentScores','attendance','reportScores','userAccounts','passwordHash','activation_token','installation_id','license'])
    assert.equal(teks.includes(terlarang),false,`berkas tidak memuat ${terlarang}`);

  /* Setiap baris siswa hanya berisi field pada daftar putih. */
  for(const row of berkas.students){
    for(const field of Object.keys(row))
      assert.ok(HANDOVER_BIODATA_FIELDS.includes(field),`field ${field} termasuk daftar putih biodata`);
    assert.ok(row.name&&row.gender,'biodata inti tetap terbawa');
  }
});

test('Daftar putih biodata memang hanya identitas, bukan data akademik',()=>{
  for(const field of HANDOVER_BIODATA_FIELDS)
    assert.ok(['nis','nisn','name','gender','birthPlace','birthDate','religion','parentName','phone','address','photo'].includes(field),
      `${field} adalah biodata`);
  /* Implementasinya memakai daftar putih, bukan membuang field terlarang. */
  const layanan=read('src/services/student-handover.js');
  assert.match(layanan,/HANDOVER_BIODATA_FIELDS/);
  for(const larangan of ['delete row.','delete student.','blacklist'])
    assert.equal(layanan.includes(larangan),false,`tidak memakai pendekatan ${larangan}`);
});

/* ------------------------------------------------- Pemilihan, saran, dan tujuan */

test('Guru dapat memilih sebagian siswa saja',()=>{
  useMemoryStorage();
  const sumber=guru();
  const daftar=isiKelas(sumber,4);
  const sebagian=exportStudentHandover(sumber,{studentIds:[daftar[0].id,daftar[2].id]});
  assert.deepEqual(sebagian.students.map(item=>item.nis).sort(),['NIS-1','NIS-3']);
  const semua=exportStudentHandover(sumber);
  assert.equal(semua.students.length,4,'tanpa pilihan berarti seluruh rombel');
});

test('Saran kenaikan kelas 1A menjadi 2A, tetapi tujuan selalu dapat diubah',()=>{
  assert.equal(suggestPromotionClass('1A'),'2A');
  assert.equal(suggestPromotionClass('5B'),'6B');
  assert.equal(suggestPromotionClass('6C'),null,'kelas 6 lulus, tidak ada saran kenaikan');
  useMemoryStorage();
  const sumber=guru('1A');
  isiKelas(sumber,2);
  const berkas=exportStudentHandover(sumber);
  assert.equal(berkas.source.suggestedClassId,'2A');
  /* Tujuan yang dipakai adalah yang dipilih pengguna, bukan sarannya. Serah terima memang
     ditujukan untuk pindah tahun pelajaran, sehingga tujuannya berada di periode berikutnya. */
  const tahunBaru='2027/2028';
  const tujuan=guru('3C',`Ganjil ${tahunBaru}`,tahunBaru);
  const hasil=importStudentHandover(admin(tahunBaru,`Ganjil ${tahunBaru}`),berkas,
    {targetClassId:'3C',targetAcademicYear:tahunBaru,targetSemester:`Ganjil ${tahunBaru}`});
  assert.equal(hasil.imported,2,'tujuan mengikuti pilihan pengguna, bukan saran 2A');
  assert.equal(listStudents(tujuan,{classId:'3C'}).length,2);
});

test('Pratinjau menampilkan rencana sebelum apa pun ditulis',()=>{
  useMemoryStorage();
  const sumber=guru('1A');
  isiKelas(sumber,3);
  const berkas=exportStudentHandover(sumber);
  const sebelum=JSON.stringify(loadDb());
  const tahunBaru='2027/2028';
  const pratinjau=previewStudentHandover(admin(tahunBaru,`Ganjil ${tahunBaru}`),berkas,
    {targetClassId:'2A',targetAcademicYear:tahunBaru,targetSemester:`Ganjil ${tahunBaru}`});
  assert.equal(pratinjau.total,3);
  assert.equal(pratinjau.newStudents,3);
  assert.equal(pratinjau.duplicates,0);
  assert.equal(pratinjau.targetClassId,'2A');
  assert.equal(JSON.stringify(loadDb()),sebelum,'pratinjau tidak menulis apa pun');
});

/* --------------------------------------------------------- Konflik dan arsip */

test('Siswa yang sudah ada di tujuan tidak digandakan',()=>{
  useMemoryStorage();
  const sumber=guru('1A');
  isiKelas(sumber,3);
  const berkas=exportStudentHandover(sumber);
  const tahunBaru='2027/2028';
  const sesi=admin(tahunBaru,`Ganjil ${tahunBaru}`);
  const opsi={targetClassId:'2A',targetAcademicYear:tahunBaru,targetSemester:`Ganjil ${tahunBaru}`};
  assert.equal(importStudentHandover(sesi,berkas,opsi).imported,3);
  const ulang=importStudentHandover(sesi,berkas,opsi);
  assert.equal(ulang.imported,0,'impor kedua tidak menambah siapa pun');
  assert.equal(ulang.skipped,3);
  assert.equal(listStudents(guru('2A',`Ganjil ${tahunBaru}`,tahunBaru),{classId:'2A'}).length,3,'tidak ada duplikat NIS/NISN');
  /* Siswa yang sudah terdaftar di rombel lain pada periode yang sama juga dilewati, karena
     aplikasi melarang satu NIS muncul dua kali pada satu periode. */
  const keRombelLain=importStudentHandover(sesi,berkas,{...opsi,targetClassId:'2B'});
  assert.equal(keRombelLain.imported,0);
  assert.equal(keRombelLain.skipped,3);
});

test('Data rombel dan tahun sumber tetap tersimpan sebagai arsip',()=>{
  useMemoryStorage();
  const sumber=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const daftar=isiKelas(sumber,3);
  updateDb(db=>{db.reportScores[`${ACADEMIC_YEAR}|Genap ${ACADEMIC_YEAR}|5B|mtk|${daftar[0].id}`]={finalScore:85};return db;});
  const berkas=exportStudentHandover(sumber);
  const tahunBaru='2027/2028';
  importStudentHandover(admin(tahunBaru,`Ganjil ${tahunBaru}`),berkas,
    {targetClassId:'6B',targetAcademicYear:tahunBaru,targetSemester:`Ganjil ${tahunBaru}`});

  assert.equal(listStudents(sumber,{classId:'5B'}).length,3,'siswa di scope sumber tidak dihapus');
  assert.equal(loadDb().reportScores[`${ACADEMIC_YEAR}|Genap ${ACADEMIC_YEAR}|5B|mtk|${daftar[0].id}`].finalScore,85,
    'nilai lama tetap utuh sebagai arsip');
  assert.equal(listStudents(admin(tahunBaru,`Ganjil ${tahunBaru}`),{classId:'6B'}).length,3,'siswa hadir di scope tujuan');
});

test('Impor menolak berkas yang bukan serah terima siswa',()=>{
  useMemoryStorage();
  const opsi={targetClassId:'2A'};
  for(const buruk of [null,{},{schema:'lain'},{schema:HANDOVER_SCHEMA},
    {schema:HANDOVER_SCHEMA,students:'bukan-array'},
    {schema:HANDOVER_SCHEMA,students:[{name:'Tanpa Identitas'}]}])
    assert.throws(()=>importStudentHandover(admin(),buruk,opsi),/tidak|wajib/i,`berkas ${JSON.stringify(buruk)} ditolak`);
  /* Field asing di dalam berkas diabaikan, tidak ikut tertulis ke database. */
  const menyusup={schema:HANDOVER_SCHEMA,source:{},students:[
    {nis:'X1',nisn:'X1',name:'Siswa Sah',gender:'L',birthPlace:'Kota',birthDate:'2015-01-01',religion:'Islam',
     parentName:'Ortu',phone:'08',address:'Jl',photo:'',
     passwordHash:'JANGAN-MASUK',activation_token:'JANGAN-MASUK',finalScore:99}]};
  importStudentHandover(admin(),menyusup,{targetClassId:'2A',targetAcademicYear:ACADEMIC_YEAR,targetSemester:`Ganjil ${ACADEMIC_YEAR}`});
  const isi=JSON.stringify(loadDb().students);
  for(const terlarang of ['JANGAN-MASUK','passwordHash','activation_token','finalScore'])
    assert.equal(isi.includes(terlarang),false,`field ${terlarang} tidak ikut tersimpan`);
});

test('Serah terima tidak menyentuh lisensi maupun kunci penyimpanan perangkat',()=>{
  const layanan=read('src/services/student-handover.js');
  for(const larangan of ['erapor_license_v1','erapor_installation_v1','activation_token','installationId','getInstallationId'])
    assert.equal(layanan.includes(larangan),false,`layanan serah terima tidak menyentuh ${larangan}`);
  const halaman=read('src/pages/student-handover.js');
  assert.match(halaman,/exportStudentHandover|importStudentHandover/);
  /* Menu tersedia untuk Admin maupun Guru yang berwenang. */
  const navigasi=read('src/data/navigation.js');
  assert.match(navigasi,/student-handover/);
});
