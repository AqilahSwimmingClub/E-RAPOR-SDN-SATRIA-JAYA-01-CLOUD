import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, CLASSES, RELIGIONS, RELIGION_SUBJECTS,
  SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { capaianPembelajaran, cpBerlaku, cpElementForObjective, cpElements, cpNaskahGaps,
  cpNaskahReport, cpPhasesFor, cpRegulationFor, CP_SUBJECTS } from '../src/data/curriculum-cp.js';
import { CP_NASKAH, naskahCp, naskahElemen } from '../src/data/curriculum-cp-naskah.js';
import { defaultLearningObjectives, phaseForClassId,
  TP_SOURCES } from '../src/data/learning-objective-defaults.js';
import { addReferenceObjectives, listActiveObjectives, listReferenceObjectives,
  listSchoolObjectives, setActiveObjective } from '../src/services/learning-objectives.js';
import { listCpButir, setCpButirActive } from '../src/services/cp-butir.js';
import { getAdminReadiness } from '../src/services/admin-readiness.js';
import { listIntracurricularObjectives } from '../src/services/intracurricular.js';
import { saveTeacherProfile } from '../src/services/master.js';
import { invalidateDbCache } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* CP RESMI SD — sumber resmi, fase benar, dan tidak ada CP karangan.

   Naskah nasional berasal dari Keputusan Kepala BSKAP Nomor 046/H/KR/2025 yang diberikan
   pengguna. Bahasa Sunda berasal dari Keputusan Kepala Dinas Pendidikan Provinsi Jawa Barat
   Nomor 32817/Pk.05.02/Sekre/2022. Koding & KA Fase C berasal dari Bab XXVIII Keputusan
   Kepala BSKAP Nomor 046/H/KR/2025. Produk hanya menyediakan PAI BP dan PAK BP sebagai mapel agama. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
}
const guru=classId=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,
  semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkanMapel(session,ids){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:ids.includes(item.id),order:index+1})));
}

/* ------------------------------------------------------------------ §24 Pemetaan fase */
test('1. Fase ditentukan tingkat kelas, dan huruf rombel tidak pernah ikut menentukan',()=>{
  const harapan={1:'A',2:'A',3:'B',4:'B',5:'C',6:'C'};
  assert.equal(CLASSES.length,24,'24 rombel');
  for(const classId of CLASSES){
    const tingkat=Number.parseInt(classId,10);
    assert.equal(phaseForClassId(classId),harapan[tingkat],`${classId} berada pada Fase ${harapan[tingkat]}`);
    assert.equal(capaianPembelajaran(classId,'mtk').phase,harapan[tingkat]);
  }
  for(const tingkat of [1,3,5]){
    const acuan=JSON.stringify(capaianPembelajaran(`${tingkat}A`,'bindo'));
    for(const huruf of ['B','C','D'])
      assert.equal(JSON.stringify(capaianPembelajaran(`${tingkat}${huruf}`,'bindo')),acuan,
        `${tingkat}${huruf} memakai CP yang sama dengan ${tingkat}A`);
  }
});

/* ------------------------------------------------------------- §25 CP nasional non-Agama */
test('2. CP mapel nasional menyebut keputusan resmi yang benar beserta metadatanya',()=>{
  for(const kelas of ['1A','3A','5A']){
    const cp=capaianPembelajaran(kelas,'mtk');
    assert.equal(cp.regulation.id,'cp_umum');
    assert.match(cp.regulation.decision,/046\/H\/KR\/2025/);
    assert.equal(cp.regulation.year,2025);
    assert.equal(cp.regulation.verified,true);
    assert.match(cp.regulation.url,/^https:\/\//);
    assert.equal(cp.status,'rujukan');
  }
  for(const subjectId of ['bindo','ipas','pancasila','pjok','seni','seni_rupa','bing']){
    const cp=capaianPembelajaran('5B',subjectId);
    assert.equal(cp.regulation.id,'cp_umum',`${subjectId} memakai CP nasional umum`);
    assert.ok(cp.regulation.authority.length>10,`${subjectId} menyebut lembaga berwenang`);
  }
  assert.ok(cpElements('mtk').length>=4,'elemen CP Matematika tersimpan');
  assert.ok(cpElements('ipas').length>=2,'elemen CP IPAS tersimpan');
});

test('3. Dataset memuat tepat 29 kombinasi CP SD yang sudah diverifikasi',()=>{
  const expected=[];
  for(const id of ['agama','agama_kristen','pancasila','bindo','mtk','seni_rupa','pjok','sunda'])
    for(const phase of ['A','B','C'])expected.push(`${id}|${phase}`);
  for(const id of ['ipas','bing'])for(const phase of ['B','C'])expected.push(`${id}|${phase}`);
  expected.push('koding|C');
  assert.deepEqual(Object.keys(CP_NASKAH).sort(),expected.sort());
  assert.equal(Object.keys(CP_NASKAH).length,29);
  const contoh={A:'1A',B:'3A',C:'5A'};
  for(const key of Object.keys(CP_NASKAH)){
    const [subjectId,phase]=key.split('|');
    const cp=capaianPembelajaran(contoh[phase],subjectId);
    assert.equal(cp.naskah,naskahCp(subjectId,phase));
    assert.ok(cp.naskah.length>40,`${key} memiliki naskah CP resmi`);
    assert.equal(cp.regulation.verified,true,`${key} hanya menempel pada sumber terverifikasi`);
    assert.equal(cp.available,true,`${key} hanya dimuat pada fase yang berlaku`);
    assert.equal(cp.naskahReason,null,`${key} tidak menyisakan alasan kosong`);
  }
  for(const id of ['agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    assert.equal(Object.keys(CP_NASKAH).some(key=>key.startsWith(`${id}|`)),false,`${id} tidak dimasukkan`);
});

/* -------------------------------------------------------------- §26 Koding & fase khusus */
test('4. Koding & KA tidak mempunyai CP palsu pada Fase A maupun Fase B',()=>{
  for(const kelas of ['1A','1B','2A','2D','3A','3D','4A','4D']){
    const cp=capaianPembelajaran(kelas,'koding');
    assert.equal(cp.available,false,`${kelas} belum berlaku untuk Koding & KA`);
    assert.deepEqual(cp.elements,[]);
    assert.equal(cp.naskah,null);
    assert.match(cp.naskahReason,/dimulai pada Fase C/i);
    assert.equal(listReferenceObjectives(guru(kelas),'koding').length,0);
  }
  assert.deepEqual(cpPhasesFor('koding'),['C']);
  assert.equal(cpBerlaku('koding','A'),false);
  assert.equal(cpBerlaku('koding','B'),false);
  assert.equal(cpBerlaku('koding','C'),true);
});

test('5. IPAS dan Bahasa Inggris tidak menawarkan TP baru pada Fase A',()=>{
  for(const subjectId of ['ipas','bing']){
    assert.deepEqual(cpPhasesFor(subjectId),['B','C']);
    assert.equal(capaianPembelajaran('1A',subjectId).available,false);
    assert.equal(listReferenceObjectives(guru('1A'),subjectId).length,0,
      `${subjectId} Fase A tidak menawarkan TP referensi`);
    assert.ok(listReferenceObjectives(guru('3A'),subjectId).length>0,
      `${subjectId} Fase B menawarkan TP referensi`);
  }
});

test('6. Koding & KA memakai sumber resminya sendiri dan Fase C tetap operasional',()=>{
  const sumber=cpRegulationFor('koding');
  /* CP Koding & KA ditetapkan pada Bab XXVIII keputusan yang sama dengan mapel nasional lain.
     Panduan Mata Pelajaran adalah dokumen penerapan, bukan penetap CP, sehingga tidak boleh
     dikutip sebagai sumber CP-nya. */
  assert.equal(sumber.id,'cp_koding_ka');
  assert.match(sumber.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  assert.match(sumber.section,/XXVIII/);
  assert.match(sumber.title,/Koding dan Kecerdasan Artifisial/);
  assert.equal(sumber.year,2025);
  assert.equal(sumber.verified,true);
  assert.match(sumber.authority,/Badan Standar, Kurikulum, dan Asesmen Pendidikan/);
  assert.equal(/Panduan Mata Pelajaran/.test(String(sumber.decision)),false,
    'panduan penerapan tidak dikutip sebagai penetap CP');
  /* Entrinya tetap terpisah dari cp_umum karena hanya mapel ini yang mulai pada Fase C. */
  assert.notEqual(sumber.id,'cp_umum');
  assert.match(sumber.note,/Fase C/);
  assert.deepEqual(cpPhasesFor('koding'),['C']);
  for(const kelas of ['5A','5B','5C','5D','6A','6B','6C','6D']){
    const cp=capaianPembelajaran(kelas,'koding');
    assert.equal(cp.available,true);
    assert.ok(cp.naskah?.length>100);
    assert.equal(cp.naskahReason,null);
    assert.ok(listReferenceObjectives(guru(kelas),'koding').length>=2);
  }
});

test('7. Empat elemen CP Koding & KA Fase C tersimpan dan TP-nya berelasi dengan elemen',()=>{
  const elemen=cpElements('koding','C');
  assert.deepEqual(elemen.map(item=>item.name),['Berpikir Komputasional','Literasi Digital',
    'Literasi dan Etika Kecerdasan Artifisial','Pemanfaatan dan Pengembangan Kecerdasan Artifisial']);
  assert.equal(elemen.length,4);
  for(const item of elemen){
    assert.ok(item.id.startsWith('koding:'));
    assert.equal(item.naskah,naskahElemen('koding','C',item.name));
    assert.ok(item.naskah?.length>20);
  }
  const butir=defaultLearningObjectives('5B','koding');
  const namaElemen=new Set(elemen.map(item=>item.name));
  for(const tp of butir){
    const terkait=cpElementForObjective('koding','C',tp.order);
    assert.ok(terkait);
    assert.ok(namaElemen.has(terkait.name));
  }
  assert.deepEqual(cpElements('koding','A'),[]);
  assert.deepEqual(cpElements('koding','B'),[]);
});

/* --------------------------------------------------------------- §27 Bahasa Sunda mulok */
test('8. Bahasa Sunda tetap tersedia dan berstatus Muatan Lokal',()=>{
  const mapel=SUBJECTS_DEFAULT.find(item=>item.id==='sunda');
  assert.ok(mapel);
  assert.equal(mapel.parent,'Muatan Lokal');
  assert.equal(mapel.name,'Bahasa Sunda');
  assert.equal(mapel.active,true);
  for(const kelas of ['1A','3C','5B','6D'])assert.ok(capaianPembelajaran(kelas,'sunda'));
});

test('9. Bahasa Sunda memakai keputusan Jawa Barat dan naskah resmi Fase A-C sudah dimuat',()=>{
  const sumber=cpRegulationFor('sunda');
  assert.equal(sumber.id,'cp_mulok_jabar');
  assert.equal(sumber.decisionNumber,'32817/Pk.05.02/Sekre/2022');
  assert.match(sumber.decision,/Dinas Pendidikan Provinsi Jawa Barat/);
  assert.equal(sumber.authority,'Dinas Pendidikan Provinsi Jawa Barat');
  assert.equal(sumber.year,2022);
  assert.equal(sumber.verified,true);
  assert.equal(sumber.scope,'muatan_lokal');
  for(const [kelas,phase] of [['1A','A'],['3A','B'],['5A','C']]){
    const cp=capaianPembelajaran(kelas,'sunda');
    assert.equal(cp.regulation.id,'cp_mulok_jabar');
    assert.equal(cp.naskah,naskahCp('sunda',phase));
    assert.ok(cp.naskah.length>100);
    assert.equal(cp.naskahReason,null);
  }
});

test('9b. Elemen Bahasa Sunda mengikuti dokumen Jawa Barat beserta istilah Sundanya',()=>{
  const elemen=cpElements('sunda','A');
  assert.deepEqual(elemen.map(item=>item.name),
    ['Menyimak','Membaca dan Memirsa','Berbicara dan Menyajikan/Mempresentasikan','Menulis']);
  assert.deepEqual(elemen.map(item=>item.nameLokal),
    ['Ngaregepkeun','Maca jeung Miarsa','Nyarita jeung Midangkeun','Nulis']);
  for(const phase of ['A','B','C']){
    assert.equal(cpBerlaku('sunda',phase),true);
    assert.deepEqual(cpElements('sunda',phase).map(item=>item.name),elemen.map(item=>item.name));
    for(const item of cpElements('sunda',phase))
      assert.equal(item.naskah,naskahElemen('sunda',phase,item.name));
  }
});

/* -------------------------------------------------------------------- §28 Agama */
test('10. CP Agama hanya PAI BP dan PAK BP, memakai keputusan resmi 2025',()=>{
  const ids=['agama','agama_kristen'];
  const pabp=cpRegulationFor('agama');
  assert.equal(pabp.id,'cp_pabp');
  assert.match(pabp.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  assert.equal(pabp.year,2025);
  assert.equal(pabp.authority,'BSKAP Kemendikdasmen');
  assert.equal(pabp.verified,true);
  assert.match(pabp.note,/020 Tahun 2026/);
  for(const subjectId of ids){
    assert.equal(cpRegulationFor(subjectId).id,'cp_pabp');
    for(const [kelas,phase] of [['1A','A'],['3A','B'],['5A','C']]){
      const cp=capaianPembelajaran(kelas,subjectId);
      assert.equal(cp.naskah,naskahCp(subjectId,phase));
      assert.ok(cp.naskah.length>100);
      assert.equal(cp.naskahReason,null);
      assert.equal(cp.available,true);
    }
  }
  const defaultIds=new Set(SUBJECTS_DEFAULT.map(item=>item.id));
  for(const id of ['agama_katolik','agama_hindu','agama_buddha','agama_khonghucu']){
    assert.equal(defaultIds.has(id),false,`${id} bukan master mapel bawaan`);
    assert.equal(CP_SUBJECTS.includes(id),false,`${id} bukan mapel CP/TP aplikasi`);
  }
});

test('11. TP sekolah tetap berjalan untuk CP nasional, Koding, dan Bahasa Sunda',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk','koding','sunda']);
  for(const subjectId of ['mtk','koding','sunda']){
    const referensi=listReferenceObjectives(sesi,subjectId);
    assert.ok(Array.isArray(referensi));
    assert.ok(referensi.length>0);
    const hasil=addReferenceObjectives(sesi,subjectId,referensi.map(item=>item.id));
    assert.ok(hasil.added>0);
    assert.ok(listActiveObjectives(sesi,subjectId).length>0);
  }
});

/* ----------------------------------------------------------------- §19/§33 Laporan audit */
test('12. Laporan naskah CP menghitung 29 terisi dan 7 gap yang dapat dijelaskan',()=>{
  const laporan=cpNaskahReport();
  assert.equal(laporan.total,36);
  assert.equal(laporan.terisi,29);
  assert.equal(laporan.kosong,7);
  assert.equal(laporan.diLuarFase,4,'IPAS A, Inggris A, Koding A/B berada di luar fase');
  assert.equal(laporan.sumberBelumTerverifikasi,0);
  assert.equal(laporan.menungguDokumen,0);
  assert.equal(laporan.menungguNaskah,3,'hanya Seni generic A-C masih menunggu naskah');
  assert.equal(cpNaskahGaps().some(item=>item.subjectId==='sunda'),false,'Sunda sudah terisi');
  assert.equal(cpNaskahGaps().some(item=>item.subjectId==='koding'&&item.phase==='C'),false,
    'Koding Fase C sudah terisi');
  assert.equal(cpNaskahGaps().filter(item=>item.subjectId==='seni').length,3);
  for(const entri of cpNaskahGaps()){
    assert.equal(entri.naskah,null);
    assert.ok(entri.reason.length>20);
    assert.ok(entri.authority);
  }
});

test('13. Seluruh mapel yang wajib diaudit dikenal aplikasi dan sebaliknya',()=>{
  const dikenal=new Set(SUBJECTS_DEFAULT.map(item=>item.id));
  assert.equal(CP_SUBJECTS.length,SUBJECTS_DEFAULT.length);
  for(const subjectId of CP_SUBJECTS){
    assert.ok(dikenal.has(subjectId));
    assert.ok(TP_SOURCES[cpRegulationFor(subjectId).id]);
  }
  for(const item of SUBJECTS_DEFAULT)assert.ok(CP_SUBJECTS.includes(item.id));
});

/* ------------------------------------------------- §29-§31 Regresi TP, Penilaian, Intra */
test('14. Menu Penilaian tidak mempunyai satu pun checkbox pemilihan TP',()=>{
  const halaman=read('src/pages/assessment.js');
  assert.equal(/data-ref|data-tp|pilih-tp|objective-reference-item/i.test(halaman),false,
    'Penilaian tidak menawarkan pemilihan TP');
  assert.equal(/addReferenceObjectives|setActiveObjective/.test(halaman),false,
    'Penilaian tidak mengubah TP sekolah');
});

test('15. Tabel TP berangkat kosong dan hanya berisi TP yang benar-benar disimpan guru',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['koding']);
  assert.deepEqual(listSchoolObjectives(sesi,'koding'),[]);
  const referensi=listReferenceObjectives(sesi,'koding');
  assert.ok(referensi.length>=2);
  const dipilih=referensi.slice(0,2).map(item=>item.id);
  assert.equal(addReferenceObjectives(sesi,'koding',dipilih).added,2);
  assert.equal(listSchoolObjectives(sesi,'koding').length,2);
  addReferenceObjectives(sesi,'koding',dipilih);
  assert.equal(listSchoolObjectives(sesi,'koding').length,2,'tidak ada duplikasi');
  invalidateDbCache();
  assert.equal(listSchoolObjectives(sesi,'koding').length,2,'TP existing tidak hilang');
});

test('16. Intrakurikuler hanya menawarkan TP aktif tanpa menghapus TP nonaktif',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['koding']);
  const referensi=listReferenceObjectives(sesi,'koding');
  addReferenceObjectives(sesi,'koding',referensi.map(item=>item.id));
  const semua=listSchoolObjectives(sesi,'koding');
  assert.ok(semua.length>=2);
  assert.equal(listIntracurricularObjectives(sesi,'koding').length,semua.length);
  setActiveObjective(sesi,'koding',semua[0].id,false);
  const tersedia=listIntracurricularObjectives(sesi,'koding');
  assert.equal(tersedia.length,semua.length-1);
  assert.equal(tersedia.some(item=>item.id===semua[0].id),false);
  const tersimpan=listSchoolObjectives(sesi,'koding').find(item=>item.id===semua[0].id);
  assert.ok(tersimpan);
  assert.equal(tersimpan.active,false);
});

test('17. Kesiapan Guru tidak menuntut TP untuk mapel yang belum berlaku pada fase itu',()=>{
  useMemoryStorage();
  const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`,userName:'Admin'};
  const kelasSatu=guru('1A');
  aktifkanMapel(kelasSatu,['mtk','koding','bing']);
  saveTeacherProfile(admin,'1A',{name:'Wali Kelas Satu',nip:'198501012010011001',phone:'08',email:'a@b.id',photo:''});
  const referensi=listReferenceObjectives(kelasSatu,'mtk');
  addReferenceObjectives(kelasSatu,'mtk',referensi.map(item=>item.id));
  const butir=getAdminReadiness(admin).items.find(item=>item.id==='learning-objectives');
  assert.equal(butir.detail.some(teks=>/Koding/.test(teks)),false);
  assert.equal(butir.detail.some(teks=>/Bahasa Inggris/.test(teks)),false,
    'Bahasa Inggris Fase A tidak boleh menjadi syarat TP');
  assert.equal(butir.detail.some(teks=>teks.startsWith('Butir CP Matematika 1A')),false);

  /* Pada Fase C, Koding & KA MEMANG dituntut - dan syaratnya terpenuhi sendiri karena Butir CP
     dibawa aplikasi. Yang diperiksa di sini adalah bahwa mapel itu benar-benar dievaluasi:
     begitu seluruh Butir CP-nya dinonaktifkan, penyebabnya muncul menyebut mapel dan rombel. */
  const kelasLima=guru('5B');
  aktifkanMapel(kelasLima,['koding']);
  saveTeacherProfile(admin,'5B',{name:'Wali Kelas Lima',nip:'198501012010011002',phone:'08',email:'c@d.id',photo:''});
  const lima=getAdminReadiness(admin).items.find(item=>item.id==='learning-objectives');
  assert.equal(lima.detail.some(teks=>/Koding.*5B/.test(teks)),false,
    'Butir CP Koding Fase C tersedia sejak awal');
  for(const item of listCpButir(kelasLima,'koding'))setCpButirActive(kelasLima,'koding',item.id,false);
  const limaKosong=getAdminReadiness(admin).items.find(item=>item.id==='learning-objectives');
  assert.ok(limaKosong.detail.some(teks=>/Koding.*5B/.test(teks)),
    'Koding & KA Fase C tetap dievaluasi sebagai syarat kesiapan');
});

test('18. Naskah CP hanya berasal dari berkas data dan sumber terverifikasi',()=>{
  for(const subjectId of CP_SUBJECTS)
    for(const [kelas,phase] of [['1A','A'],['3A','B'],['5A','C']]){
      const cp=capaianPembelajaran(kelas,subjectId);
      if(cp.naskah===null){
        for(const elemen of cp.elements)
          assert.equal(elemen.naskah,naskahElemen(subjectId,phase,elemen.name));
        continue;
      }
      assert.equal(cp.naskah,naskahCp(subjectId,phase));
      assert.equal(cp.regulation.verified,true);
      assert.equal(cp.available,true);
      assert.equal(cp.naskahReason,null);
    }
  const logika=read('src/data/curriculum-cp.js');
  assert.match(logika,/naskahCp|naskahElemen/);
  assert.equal(/ringkas\s*:\s*['"`]/.test(logika),false,'naskah tidak ditulis di logika CP');
});

test('19. Biodata tetap mengenal enam agama, tetapi master CP/TP agama hanya PAI dan PAK',()=>{
  assert.deepEqual([...RELIGIONS].sort(),['Buddha','Hindu','Islam','Katolik','Konghucu','Kristen'].sort());
  assert.deepEqual(Object.keys(RELIGION_SUBJECTS).sort(),['agama','agama_kristen']);
  assert.deepEqual(Object.values(RELIGION_SUBJECTS).sort(),['Islam','Kristen']);
  const agamaDefault=SUBJECTS_DEFAULT.filter(item=>item.id.startsWith('agama')).map(item=>item.id).sort();
  assert.deepEqual(agamaDefault,['agama','agama_kristen']);
  assert.deepEqual(CP_SUBJECTS.filter(id=>id.startsWith('agama')).sort(),['agama','agama_kristen']);
});
