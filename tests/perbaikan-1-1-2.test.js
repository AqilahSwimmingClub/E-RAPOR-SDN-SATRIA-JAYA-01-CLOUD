import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, RELIGIONS, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { APP_SCHEMA_VERSION, APP_VERSION, PREVIOUS_RELEASE, VERSION_CODE } from '../src/data/version.js';
import { DEFAULT_RELIGION_SUBJECT, listActiveSubjects, listSubjectsForStudent, religionSubjectIdFor } from '../src/services/subjects.js';
import { getReportCompleteness, getReportDocument } from '../src/services/documents.js';
import { saveManualReportScoresBulk } from '../src/services/report.js';
import { getTranscriptRows, transcriptTemplateCsv } from '../src/services/transcript.js';
import { createStudent, updateStudent } from '../src/services/students.js';
import { saveSubjectMapping, loadDb, storageKey } from '../src/services/storage.js';
import { getTeacherProfile, saveTeacherProfile } from '../src/services/master.js';
import { runAppMigrations } from '../src/services/migrations.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}
const PAI='Pendidikan Agama Islam dan Budi Pekerti';
const PAK='Pendidikan Agama Kristen dan Budi Pekerti';

/* ------------------------------------------------------ A. Siswa Islam hanya menerima PAI BP */

test('A. Siswa Islam: PAI BP muncul, PAK BP tidak muncul di mana pun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'ISL',{religion:'Islam'});
  saveManualReportScoresBulk(session,[{subjectId:'agama',studentId:anak.id,value:85},{subjectId:'mtk',studentId:anak.id,value:80}]);

  const mapel=listSubjectsForStudent(session,anak).map(item=>item.id);
  assert.deepEqual(mapel,['agama','mtk'],'daftar mapel siswa hanya memuat Agama Islam');

  const dokumen=getReportDocument(session,anak.id);
  const nama=dokumen.subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAI),'PAI BP muncul pada dokumen rapor');
  assert.equal(nama.includes(PAK),false,'PAK BP tidak boleh muncul sama sekali');

  const transkrip=getTranscriptRows(session,anak.id).map(row=>row.subject.id);
  assert.ok(transkrip.includes('agama')&&!transkrip.includes('agama_kristen'),'Transkrip Nilai ikut tersaring');
  assert.equal(transcriptTemplateCsv(session).includes(PAK),false,'template transkrip tidak memuat PAK BP untuk siswa Islam');

  /* Mapping global tidak diubah: PAK BP tetap tersedia untuk siswa lain. */
  const mapping=loadDb().subjectMappings[`${session.academicYear}|${session.semester}|${session.classId}`];
  assert.ok(mapping.find(item=>item.id==='agama_kristen')?.active,'Mapping global tetap mengaktifkan PAK BP');
  assert.ok(listActiveSubjects(session).some(item=>item.id==='agama_kristen'),'mapel PAK BP masih ada pada Mapping aktif');
});

/* --------------------------------------------------- B. Siswa Kristen hanya menerima PAK BP */

test('B. Siswa Kristen: PAK BP muncul, PAI BP tidak muncul di mana pun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'KRS',{religion:'Kristen'});
  saveManualReportScoresBulk(session,[{subjectId:'agama_kristen',studentId:anak.id,value:88},{subjectId:'mtk',studentId:anak.id,value:79}]);

  const mapel=listSubjectsForStudent(session,anak).map(item=>item.id);
  assert.deepEqual(mapel,['agama_kristen','mtk'],'daftar mapel siswa hanya memuat Agama Kristen');

  const nama=getReportDocument(session,anak.id).subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAK),'PAK BP muncul pada dokumen rapor');
  assert.equal(nama.includes(PAI),false,'PAI BP tidak boleh muncul sama sekali');

  const transkrip=getTranscriptRows(session,anak.id).map(row=>row.subject.id);
  assert.ok(transkrip.includes('agama_kristen')&&!transkrip.includes('agama'),'Transkrip Nilai ikut tersaring');
});

test('Tidak ada siswa yang pernah menerima dua mapel agama sekaligus',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  /* Termasuk agama kosong dan agama yang belum punya mapel khusus. */
  const daftar=['',...RELIGIONS].map((religion,index)=>siswa(session,`AG${index}`,religion?{religion}:{}));
  daftar.forEach(anak=>{
    const agama=listSubjectsForStudent(session,anak).filter(item=>item.id==='agama'||item.id==='agama_kristen');
    assert.equal(agama.length,1,`siswa dengan agama "${anak.religion||'(kosong)'}" menerima tepat satu mapel agama`);
  });
  assert.equal(religionSubjectIdFor({religion:'Islam'}),'agama');
  assert.equal(religionSubjectIdFor({religion:'Kristen'}),'agama_kristen');
  assert.equal(religionSubjectIdFor({}),DEFAULT_RELIGION_SUBJECT,'agama kosong memakai mapel bawaan');
});

test('Kelengkapan rapor memakai mapel sesuai agama siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const kristen=siswa(session,'KRS2',{religion:'Kristen'});
  saveManualReportScoresBulk(session,[{subjectId:'agama_kristen',studentId:kristen.id,value:90},{subjectId:'mtk',studentId:kristen.id,value:85}]);
  const ringkasan=getReportCompleteness(session).students.find(row=>row.student.id===kristen.id);
  assert.equal(ringkasan.categories.scores,true,'nilai dianggap lengkap tanpa mengisi Agama Islam');
});

test('Agama siswa dapat diisi dan diubah dari halaman Data Siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const halaman=read('src/pages/students.js');
  assert.match(halaman,/name="religion"/,'form Data Siswa menyediakan pilihan Agama');
  assert.match(halaman,/religion:form\.elements\.religion\.value/,'nilai Agama ikut tersimpan saat menyimpan siswa');
  assert.match(halaman,/RELIGIONS/,'pilihan agama diambil dari daftar resmi aplikasi');

  const anak=siswa(session,'UBAH',{religion:'Islam'});
  const sesudah=updateStudent(session,anak.id,{...anak,religion:'Kristen'});
  assert.equal(sesudah.religion,'Kristen','agama tersimpan setelah diubah');
  assert.equal(sesudah.nis,anak.nis,'NIS tidak berubah');
  assert.equal(sesudah.nisn,anak.nisn,'NISN tidak berubah');
  assert.deepEqual(listSubjectsForStudent(session,sesudah).map(item=>item.id),['agama_kristen','mtk'],'daftar mapel ikut menyesuaikan');
});

/* ------------------------------------------------------------------- C. Kolom Nilai Akhir */

test('C. Kolom Nilai Akhir rata tengah pada Preview, Cetak, dan Simpan PDF',()=>{
  const css=read('src/styles/app.css');
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/<td class="subject-score-cell">\$\{row\.score\?\?'—'\}<\/td>/,'sel nilai akhir punya kelas sendiri termasuk saat nilai kosong');
  assert.match(css,/\.report-learning-table th:nth-child\(3\),\.report-learning-table \.subject-score-cell\{text-align:center;vertical-align:middle\}/,'header dan isi kolom rata tengah horizontal serta vertikal');
  /* Aturan tidak berada di dalam media query mana pun sehingga Preview, Cetak, dan PDF sama. */
  const posisi=css.indexOf('.report-learning-table .subject-score-cell');
  const sebelum=css.slice(0,posisi);
  const buka=(sebelum.match(/@media[^{]*\{/g)||[]).length;
  const tutupBlok=(sebelum.match(/\n\}/g)||[]).length;
  assert.ok(buka===0||tutupBlok>0,'aturan berlaku pada layar maupun cetak');
  assert.equal(/\.report-learning-table[^{]*\.subject-score-cell[^}]*text-align:(left|right)/.test(css),false,'tidak ada aturan lain yang menggeser kolom nilai');
});

/* ------------------------------------------------------------------------------- D. Foto */

test('D. Foto kanan atas mengikuti foto profil guru',()=>{
  useMemoryStorage();
  const session=guru('5B');
  saveTeacherProfile(session,'5B',{name:'Fahmi Djawas, S.Pd.',nip:'1987',phone:'',email:'',photo:'data:image/png;base64,FOTOGURULAMA'});
  assert.equal(getTeacherProfile('5B').photo,'data:image/png;base64,FOTOGURULAMA');
  saveTeacherProfile(session,'5B',{name:'Fahmi Djawas, S.Pd.',nip:'1987',phone:'',email:'',photo:'data:image/png;base64,FOTOGURUBARU'});
  assert.equal(getTeacherProfile('5B').photo,'data:image/png;base64,FOTOGURUBARU','foto profil guru tersimpan setelah diganti');

  const layout=read('src/ui/layout.js');
  assert.match(layout,/profile\.photo\s*\n?\s*\?\s*`<img class="avatar" src="\$\{escapeHtml\(profile\.photo\)\}"/,'foto kanan atas dibaca dari foto profil guru');
  assert.match(layout,/avatar-placeholder/,'tanpa foto profil dipakai placeholder, bukan foto orang lain');
  assert.equal(/<img class="avatar" src="\$\{BRAND_PHOTO\}/.test(layout),false,'foto pembuat tidak pernah dipakai sebagai foto profil guru');
  assert.match(layout,/document\.addEventListener\(PROFILE_UPDATED_EVENT/,'header mendengarkan perubahan profil');
  assert.match(read('src/pages/profile.js'),/dispatchEvent\(new CustomEvent\(PROFILE_UPDATED_EVENT\)\)/,'menyimpan profil memicu pembaruan header');
});

test('D. Branding pembuat e-Rapor tidak ikut berubah saat foto profil guru diganti',()=>{
  const layout=read('src/ui/layout.js');
  assert.match(layout,/export const BRAND_PHOTO='\.\/assets\/fahmi-djawas\.jpg'/,'branding memakai foto pembuat yang tetap');
  assert.match(layout,/<img class="brand-photo" src="\$\{BRAND_PHOTO\}"/,'sidebar memakai foto pembuat');
  /* Susunan sidebar: foto pembuat, lalu "e-Rapor", lalu nama sekolah. */
  const brand=layout.match(/<div class="brand">.*?<\/div><\/div>/s)[0];
  assert.ok(brand.indexOf('brand-photo')<brand.indexOf('brand-title'),'foto berada di atas judul');
  assert.ok(brand.indexOf('brand-title')<brand.indexOf('brand-sub'),'judul di atas nama sekolah');
  assert.equal(/brand-photo[^>]*\$\{profile/.test(layout),false,'branding tidak pernah membaca profil guru');
  const css=read('src/styles/app.css');
  assert.match(css,/\.brand-photo\{width:78px;height:78px/,'foto branding dibuat lebih besar dan jelas');
  assert.match(css,/\.sidebar \.brand\{flex-direction:column/,'susunan branding bertumpuk ke bawah');
});

test('D. Tidak ada foto guru atau pembuat pada kertas rapor dan dokumen cetak',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','mtk']);
  const anak=siswa(session,'FOTO',{religion:'Islam',photo:'data:image/png;base64,FOTOSISWA'});
  saveManualReportScoresBulk(session,[{subjectId:'agama',studentId:anak.id,value:85},{subjectId:'mtk',studentId:anak.id,value:80}]);
  saveTeacherProfile(session,'5B',{name:'Fahmi Djawas, S.Pd.',nip:'1987',phone:'',email:'',photo:'data:image/png;base64,FOTOGURU'});

  const dokumen=getReportDocument(session,anak.id);
  const teks=JSON.stringify(dokumen);
  assert.equal(teks.includes('FOTOGURU'),false,'foto guru tidak ikut ke dokumen rapor');
  assert.equal(teks.includes('fahmi-djawas.jpg'),false,'foto pembuat tidak ikut ke dokumen rapor');
  assert.equal(Object.hasOwn(dokumen.master.teacher,'photo'),false,'identitas guru pada dokumen tidak membawa field foto sama sekali');

  /* Penanda cetak: seluruh foto antarmuka disembunyikan saat mencetak. */
  const css=read('src/styles/app.css');
  assert.match(css,/@media print\{\.brand-photo,\.avatar,\.avatar-placeholder,\.profile-mini\{display:none!important\}\}/,'foto antarmuka tidak pernah tercetak');
  assert.match(css,/\.sidebar,\.topbar,\.footer,\.no-print,\.toast-host\{display:none!important\}/,'sidebar dan topbar memang tidak ikut dicetak');

  /* Satu-satunya foto pada kertas adalah slot foto 3x4 siswa pada Perlengkapan yang sudah final. */
  const cetak=read('src/pages/print.js');
  const fotoDiDokumen=[...cetak.matchAll(/<img[^>]*src="\$\{([^}]*)\}/g)].map(match=>match[1]);
  fotoDiDokumen.forEach(sumber=>{
    assert.ok(/student\.photo|source\|\|fallback|escapeHtml\(source/.test(sumber),`hanya foto siswa dan logo Cover yang boleh dicetak, ditemukan: ${sumber}`);
  });
});

/* ---------------------------------------------------------------------------- E. Update */

test('E. Update dari data versi 1.1.1 tanpa uninstall: data lama tetap utuh',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'U1',{religion:'Islam'});
  const kristen=siswa(session,'U2',{religion:'Kristen'});
  saveManualReportScoresBulk(session,[
    {subjectId:'agama',studentId:islam.id,value:85},
    {subjectId:'mtk',studentId:islam.id,value:80},
    {subjectId:'agama_kristen',studentId:kristen.id,value:88},
    {subjectId:'mtk',studentId:kristen.id,value:79},
  ]);
  saveTeacherProfile(session,'5B',{name:'Wali Kelas',nip:'1987',phone:'',email:'',photo:'data:image/png;base64,FOTO'});

  /* Instalasi yang sudah memakai rilis 1.1.1 lalu menerima APK berikutnya. */
  const db=loadDb();db.appVersion=PREVIOUS_RELEASE.version;db.appSchemaVersion=APP_SCHEMA_VERSION;
  localStorage.setItem(storageKey(),JSON.stringify(db));
  const sebelum=JSON.parse(localStorage.getItem(storageKey()));

  const hasil=runAppMigrations();
  assert.equal(hasil.migrated,false,'tidak ada migrasi paksa karena schema tidak berubah');

  const sesudah=loadDb();
  for(const bagian of ['students','reportScores','reportDescriptions','attendance','learningObjectives','assessmentSettings','subjectMappings','homeroomNotes','extracurricularScores','cocurricularActivities','cocurricularScores','attitudeProfiles','printSettings','transcriptScores'])
    assert.deepEqual(sesudah[bagian],sebelum[bagian],`${bagian} tidak berubah oleh update`);
  assert.equal(sesudah.masterData.teachers['5B'].photo,'data:image/png;base64,FOTO','foto profil guru tidak hilang');
  assert.equal(loadDb().students[`${session.academicYear}|${session.semester}|5B|${islam.id}`].religion,'Islam','agama siswa tidak hilang');
  assert.deepEqual(listSubjectsForStudent(session,islam).map(item=>item.id),['agama','mtk'],'filter agama tetap benar setelah update');
  assert.deepEqual(listSubjectsForStudent(session,kristen).map(item=>item.id),['agama_kristen','mtk'],'filter agama tetap benar setelah update');
});

test('E. Mekanisme update APK versi 1.1.1 tidak diubah dan berkas baru ikut di-precache',()=>{
  const sw=read('sw.js');
  assert.match(sw,new RegExp(`APP_CACHE_VERSION='${APP_VERSION.replace(/\./g,'\\.')}-${VERSION_CODE}'`),'nama cache mengikuti versi rilis');
  assert.match(sw,/isAppCode\(event\.request\.url\)\?networkFirst\(event\.request\):cacheFirst\(event\.request\)/,'kode aplikasi tetap network-first');
  assert.match(read('src/app.js'),/updateViaCache:'none'/,'pemeriksaan sw.js tetap tidak memakai HTTP cache lama');
  assert.ok(VERSION_CODE>PREVIOUS_RELEASE.versionCode,'versionCode tetap lebih tinggi dari rilis sebelumnya');

  const daftar=new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map(match=>match[1]));
  const berkas=[];
  (function telusuri(folder){
    for(const entri of readdirSync(new URL(folder,root),{withFileTypes:true})){
      const jalur=`${folder}/${entri.name}`;
      if(entri.isDirectory())telusuri(jalur);else berkas.push(jalur);
    }
  })('src');
  assert.deepEqual(berkas.filter(item=>!daftar.has(item)),[],'setiap berkas src tetap terdaftar di APP_SHELL');
});

test('E. Tidak ada kode yang menghapus atau mereset data pengguna',()=>{
  for(const berkas of ['src/services/migrations.js','src/services/seed.js','src/app.js','src/ui/layout.js','src/pages/profile.js','src/pages/students.js','src/services/subjects.js','src/services/transcript.js']){
    const isi=read(berkas);
    assert.equal(/localStorage\.clear\(\)/.test(isi),false,`${berkas} tidak boleh mengosongkan localStorage`);
    assert.equal(/removeItem\(storageKey\(\)\)/.test(isi),false,`${berkas} tidak boleh menghapus database`);
  }
});
