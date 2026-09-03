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
import { getAdminReadiness } from '../src/services/admin-readiness.js';
import { listIntracurricularObjectives } from '../src/services/intracurricular.js';
import { saveTeacherProfile } from '../src/services/master.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';

/* CP RESMI — KODING & KA, MUATAN LOKAL, DAN LARANGAN CP KARANGAN.

   Suite ini menjaga satu pendirian: aplikasi boleh KOSONG, tetapi tidak boleh MENGARANG.

   Konsekuensinya dua arah, dan keduanya diuji di sini. Ke satu arah, mata pelajaran yang
   belum punya CP pada suatu fase harus benar-benar kosong — Koding & KA tidak boleh muncul
   di kelas 1-4 hanya supaya tabelnya terlihat penuh. Ke arah lain, kekosongan itu harus
   dapat dipertanggungjawabkan: setiap naskah null wajib menyebutkan alasannya, dan setiap
   mata pelajaran wajib menyebut lembaga yang benar-benar berwenang atasnya. */

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
  /* Empat rombel pada satu tingkat wajib menghasilkan CP yang identik. */
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

test('3. Tidak ada satu pun naskah CP yang diisi teks buatan aplikasi',()=>{
  for(const subjectId of CP_SUBJECTS)
    for(const kelas of ['1A','3A','5A']){
      const cp=capaianPembelajaran(kelas,subjectId);
      assert.equal(cp.naskah,null,`${subjectId} ${kelas} tidak menyimpan naskah karangan`);
      for(const elemen of cp.elements)
        assert.equal(elemen.naskah,null,`elemen ${elemen.id} tidak diisi naskah karangan`);
    }
  /* Kode sumbernya sendiri harus menyatakan alasannya, supaya aturan ini tidak hilang
     bersama ingatan orang yang menulisnya. */
  const sumber=read('src/data/curriculum-cp.js');
  assert.match(sumber,/naskah:null/);
  assert.match(sumber,/tidak boleh menjadi sumber kedua/);
});

/* -------------------------------------------------------------- §26 Koding & KA Fase C */

test('4. Koding & KA tidak mempunyai CP palsu pada Fase A maupun Fase B',()=>{
  for(const kelas of ['1A','1B','1C','1D','2A','2B','2C','2D','3A','3B','3C','3D','4A','4B','4C','4D']){
    const cp=capaianPembelajaran(kelas,'koding');
    assert.equal(cp.available,false,`${kelas} belum berlaku untuk Koding & KA`);
    assert.deepEqual(cp.elements,[],`${kelas} tidak menampilkan elemen CP yang belum ada`);
    assert.equal(cp.naskah,null);
    assert.match(cp.naskahReason,/dimulai pada Fase C/i,`${kelas} menyebut alasannya`);
    assert.equal(defaultLearningObjectives(kelas,'koding').length,0,
      `${kelas} tidak menurunkan TP dari CP yang tidak ada`);
  }
  assert.deepEqual(cpPhasesFor('koding'),['C']);
  assert.equal(cpBerlaku('koding','A'),false);
  assert.equal(cpBerlaku('koding','B'),false);
  assert.equal(cpBerlaku('koding','C'),true);
});

test('5. Koding & KA tersedia pada seluruh rombel kelas 5 dan 6 sebagai Fase C',()=>{
  for(const kelas of ['5A','5B','5C','5D','6A','6B','6C','6D']){
    const cp=capaianPembelajaran(kelas,'koding');
    assert.equal(cp.phase,'C',`${kelas} berada pada Fase C`);
    assert.equal(cp.available,true,`${kelas} mempunyai CP Koding & KA`);
    assert.ok(defaultLearningObjectives(kelas,'koding').length>=2,`${kelas} punya TP referensi`);
  }
  /* Rombel tidak boleh melahirkan CP yang berbeda-beda. Tingkat kelas ikut dilaporkan sebagai
     konteks tampilan, tetapi CP-nya sendiri — elemen, regulasi, naskah — wajib identik. */
  const tanpaTingkat=kelas=>{
    const {grade,...cp}=capaianPembelajaran(kelas,'koding');
    return JSON.stringify(cp);
  };
  const acuan=tanpaTingkat('5A');
  for(const kelas of ['5B','5C','5D','6A','6B','6C','6D']){
    assert.equal(tanpaTingkat(kelas),acuan,`${kelas} memakai CP Fase C yang sama`);
    assert.equal(capaianPembelajaran(kelas,'koding').grade,Number.parseInt(kelas,10),
      `${kelas} tetap melaporkan tingkatnya sendiri`);
  }
});

test('6. Koding & KA memakai sumber resminya sendiri, bukan keputusan CP umum',()=>{
  const sumber=cpRegulationFor('koding');
  assert.equal(sumber.id,'cp_koding_ka');
  assert.notEqual(sumber.id,'cp_umum','Koding & KA tidak ditetapkan lewat 046/H/KR/2025');
  assert.match(sumber.decision,/Koding dan Kecerdasan Artifisial/);
  assert.equal(sumber.year,2025);
  assert.equal(sumber.verified,true);
  assert.match(sumber.authority,/Pusat Kurikulum dan Pembelajaran/);
  assert.match(sumber.url,/^https:\/\/kurikulum\.kemendikdasmen\.go\.id\//);
  assert.match(sumber.note,/Fase C/);
  assert.equal(defaultLearningObjectives('5B','koding')[0].source.id,'cp_koding_ka');
});

test('7. Elemen CP Koding & KA Fase C tersimpan dan TP-nya berelasi dengan elemen',()=>{
  const elemen=cpElements('koding','C');
  assert.ok(elemen.length>=4,'elemen CP Fase C tersimpan');
  for(const item of elemen){
    assert.ok(item.id.startsWith('koding:'),`${item.name} beridentitas mapel`);
    assert.equal(item.naskah,null,'rumusan tiap elemen tetap milik dokumen resmi');
  }
  /* Setiap TP referensi wajib dapat menjawab "menurunkan elemen CP yang mana". */
  const butir=defaultLearningObjectives('5B','koding');
  const namaElemen=new Set(elemen.map(item=>item.name));
  for(const tp of butir){
    const terkait=cpElementForObjective('koding','C',tp.order);
    assert.ok(terkait,`${tp.code} tertaut ke elemen CP`);
    assert.ok(namaElemen.has(terkait.name),`${terkait.name} adalah elemen CP Koding & KA`);
  }
  /* Fase yang tidak berlaku tidak boleh membocorkan elemen lewat pintu lain. */
  assert.deepEqual(cpElements('koding','A'),[]);
  assert.deepEqual(cpElements('koding','B'),[]);
});

/* --------------------------------------------------------------- §27 Bahasa Sunda mulok */

test('8. Bahasa Sunda tetap tersedia dan berstatus Muatan Lokal',()=>{
  const mapel=SUBJECTS_DEFAULT.find(item=>item.id==='sunda');
  assert.ok(mapel,'Bahasa Sunda tidak dihapus dari daftar mapel aplikasi');
  assert.equal(mapel.parent,'Muatan Lokal');
  assert.equal(mapel.name,'Bahasa Sunda');
  assert.equal(mapel.active,true);
  for(const kelas of ['1A','3C','5B','6D'])
    assert.ok(capaianPembelajaran(kelas,'sunda'),`${kelas} tetap mengenal Bahasa Sunda`);
});

test('9. Bahasa Sunda memakai keputusan Jawa Barat, bukan regulasi CP nasional',()=>{
  const sumber=cpRegulationFor('sunda');
  assert.equal(sumber.id,'cp_mulok_jabar');
  assert.notEqual(sumber.id,'cp_umum');
  /* Inti aturannya: yang menetapkan CP Bahasa Sunda adalah pemerintah daerah, sehingga
     kutipannya wajib menyebut keputusan daerah - bukan nomor keputusan nasional. */
  assert.equal(sumber.decisionNumber,'32817/Pk.05.02/Sekre/2022');
  assert.match(sumber.decision,/Dinas Pendidikan Provinsi Jawa Barat/);
  assert.match(sumber.decision,/32817\/Pk\.05\.02\/Sekre\/2022/);
  assert.equal(sumber.authority,'Dinas Pendidikan Provinsi Jawa Barat');
  assert.equal(sumber.year,2022);
  assert.equal(sumber.verified,true);
  assert.equal(sumber.scope,'muatan_lokal');
  assert.equal(/BSKAP|046\/H\/KR\/2025|Kemendikdasmen/.test(sumber.decision),false,
    'nomor keputusan nasional tidak boleh menempel pada muatan lokal');
  assert.equal(/BSKAP|Kemendikdasmen/.test(sumber.authority),false,
    'kewenangannya bukan pada Kemendikdasmen');
  for(const kelas of ['1A','3A','5A']){
    const cp=capaianPembelajaran(kelas,'sunda');
    assert.equal(cp.regulation.id,'cp_mulok_jabar');
    assert.equal(cp.regulation.decisionNumber,'32817/Pk.05.02/Sekre/2022');
    /* Naskahnya belum ada karena berkas dokumennya belum tersedia - bukan karena dikarang. */
    assert.equal(cp.naskah,null,`${kelas} tidak memakai CP nasional palsu`);
    assert.match(cp.naskahReason,/belum tersedia di workspace/i,
      `${kelas} menyebut apa yang sebenarnya kurang`);
    assert.match(cp.regulation.note,/tidak tercantum sebagai CP nasional/i,
      `${kelas} menyatakan mengapa 046\/H\/KR\/2025 bukan sumbernya`);
  }
});

test('9b. Elemen Bahasa Sunda mengikuti dokumen Jawa Barat beserta istilah Sundanya',()=>{
  const elemen=cpElements('sunda','A');
  assert.deepEqual(elemen.map(item=>item.name),
    ['Menyimak','Membaca dan Memirsa','Berbicara dan Menyajikan/Mempresentasikan','Menulis']);
  assert.deepEqual(elemen.map(item=>item.nameLokal),
    ['Ngaregepkeun','Maca jeung Miarsa','Nyarita jeung Midangkeun','Nulis']);
  /* Bahasa Sunda berlaku pada ketiga fase SD, dan elemennya sama untuk ketiganya. */
  for(const phase of ['A','B','C']){
    assert.equal(cpBerlaku('sunda',phase),true,`Fase ${phase} berlaku`);
    assert.deepEqual(cpElements('sunda',phase).map(item=>item.name),elemen.map(item=>item.name));
    for(const item of cpElements('sunda',phase))
      assert.equal(item.naskah,null,'rumusan tiap elemen menunggu dokumen resminya');
  }
});

/* -------------------------------------------------------------------- §28 Agama */

test('10. CP Agama memakai keputusan resmi 2025 untuk seluruh agama yang didukung',()=>{
  const pabp=cpRegulationFor('agama');
  assert.equal(pabp.id,'cp_pabp');
  assert.match(pabp.decision,/BSKAP Nomor 046\/H\/KR\/2025/);
  assert.equal(pabp.year,2025);
  assert.equal(pabp.authority,'BSKAP Kemendikdasmen');
  assert.equal(pabp.verified,true);
  /* Keputusan 2026 sengaja belum dipakai pada tahap ini, tetapi tidak boleh terlupakan. */
  assert.match(pabp.note,/020 Tahun 2026/,'catatan menyimpan keberadaan pembaruan 2026');
  /* Seluruh agama yang didukung aplikasi wajib memakai regulasi yang sama. */
  for(const subjectId of ['agama','agama_kristen','agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    assert.equal(cpRegulationFor(subjectId).id,'cp_pabp',`${subjectId} memakai keputusan 2026`);
  for(const subjectId of ['agama','agama_kristen','agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'])
    for(const kelas of ['1A','3A','5A']){
      const cp=capaianPembelajaran(kelas,subjectId);
      assert.equal(cp.naskah,null,`${subjectId} ${kelas} tidak memakai naskah lama sebagai pengganti`);
      assert.match(cp.naskahReason,/046\/H\/KR\/2025/,'menyebut naskah mana yang ditunggu');
      assert.equal(/032\/H\/KR\/2024/.test(String(cp.regulation.decision)),false,
        'keputusan 2024 yang sudah diganti tidak dipakai');
    }
});

test('11. Aplikasi tetap berjalan normal walau seluruh naskah CP masih null',()=>{
  useMemoryStorage();
  const sesi=guru('5B');
  aktifkanMapel(sesi,['mtk','koding','sunda']);
  for(const subjectId of ['mtk','koding','sunda']){
    const referensi=listReferenceObjectives(sesi,subjectId);
    assert.ok(Array.isArray(referensi),`${subjectId} tidak melempar galat`);
    if(!referensi.length)continue;
    const hasil=addReferenceObjectives(sesi,subjectId,referensi.map(item=>item.id));
    assert.ok(hasil.added>0,`${subjectId} dapat menyimpan TP`);
    assert.ok(listActiveObjectives(sesi,subjectId).length>0,`${subjectId} punya TP aktif`);
  }
});

/* ----------------------------------------------------------------- §19/§33 Laporan audit */

test('12. Laporan naskah CP dihitung dari data dan menyebut alasan tiap kekosongan',()=>{
  const laporan=cpNaskahReport();
  assert.equal(laporan.total,CP_SUBJECTS.length*3);
  assert.equal(laporan.terisi+laporan.kosong,laporan.total);
  assert.equal(laporan.diLuarFase+laporan.sumberBelumTerverifikasi+laporan.menungguDokumen
    +laporan.menungguNaskah,laporan.kosong,'setiap kekosongan masuk tepat satu golongan');
  /* Laporan dihitung dari data: selama berkas naskah masih kosong, seluruh kombinasi masuk
     daftar. Begitu satu naskah dimuat, angka `terisi` naik dengan sendirinya. */
  assert.equal(laporan.terisi,Object.keys(CP_NASKAH).length===0?0:laporan.terisi,
    'tidak ada naskah yang muncul tanpa data');
  assert.ok(laporan.diLuarFase>=3,'Koding & KA Fase A/B dan IPAS Fase A masuk laporan');
  assert.equal(laporan.menungguDokumen,3,'tiga fase Bahasa Sunda menunggu berkas dokumennya');
  for(const entri of cpNaskahGaps()){
    assert.equal(entri.naskah,null);
    assert.ok(entri.reason.length>20,`${entri.subjectId} ${entri.phase} beralasan jelas`);
    assert.ok(entri.authority,`${entri.subjectId} menyebut lembaga berwenang`);
  }
  /* Mata pelajaran yang elemennya belum diketahui justru wajib ikut terlaporkan. */
  assert.ok(cpNaskahGaps().some(item=>item.subjectId==='sunda'),'Bahasa Sunda ikut dilaporkan');
  assert.ok(cpNaskahGaps().some(item=>item.subjectId==='koding'),'Koding & KA ikut dilaporkan');
});

test('13. Seluruh mapel yang wajib diaudit dikenal aplikasi dan sebaliknya',()=>{
  const dikenal=new Set(SUBJECTS_DEFAULT.map(item=>item.id));
  for(const subjectId of CP_SUBJECTS)
    assert.ok(dikenal.has(subjectId),`${subjectId} terdaftar pada mapel aplikasi`);
  for(const item of SUBJECTS_DEFAULT)
    assert.ok(CP_SUBJECTS.includes(item.id),`${item.id} ikut diaudit CP-nya`);
  /* Sumber yang dipakai mapel apa pun harus terdaftar pada TP_SOURCES. */
  for(const subjectId of CP_SUBJECTS)
    assert.ok(TP_SOURCES[cpRegulationFor(subjectId).id],`sumber ${subjectId} terdaftar`);
});

test('17. Kesiapan Guru tidak menuntut TP untuk mapel yang belum berlaku pada fase itu',()=>{
  useMemoryStorage();
  /* Ditemukan lewat penelusuran browser: dengan Koding & KA aktif di rombel Fase A, butir
     kesiapan "CP dan Tujuan Pembelajaran" menuntut TP yang menurut dokumen resmi memang belum
     ada. Syarat yang mustahil dipenuhi itu mengunci tombol Aktifkan e-Rapor untuk Guru
     selamanya. Yang belum berlaku tidak boleh menjadi syarat. */
  const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`,userName:'Admin'};
  const kelasSatu=guru('1A');
  aktifkanMapel(kelasSatu,['mtk','koding']);
  saveTeacherProfile(admin,'1A',{name:'Wali Kelas Satu',nip:'198501012010011001',
    phone:'08',email:'a@b.id',photo:''});
  const referensi=listReferenceObjectives(kelasSatu,'mtk');
  addReferenceObjectives(kelasSatu,'mtk',referensi.map(item=>item.id));
  const butir=getAdminReadiness(admin).items.find(item=>item.id==='learning-objectives');
  assert.equal(butir.detail.some(teks=>/Koding/.test(teks)),false,
    'Koding & KA Fase A tidak boleh diminta TP');
  assert.equal(butir.detail.some(teks=>teks.startsWith('TP Matematika 1A')),false,
    'Matematika 1A sudah punya TP');
  /* Sebaliknya, pada Fase C mapel ini kembali menjadi syarat penuh. */
  const kelasLima=guru('5B');
  aktifkanMapel(kelasLima,['koding']);
  saveTeacherProfile(admin,'5B',{name:'Wali Kelas Lima',nip:'198501012010011002',
    phone:'08',email:'c@d.id',photo:''});
  const lima=getAdminReadiness(admin).items.find(item=>item.id==='learning-objectives');
  assert.ok(lima.detail.some(teks=>/Koding.*5B/.test(teks)),
    'Koding & KA Fase C tetap wajib punya TP');
});

test('18. Naskah CP hanya boleh berasal dari berkas data, dari sumber yang terverifikasi',()=>{
  /* Penjaga ke DEPAN. Hari ini berkas naskah masih kosong, sehingga test ini seolah tidak
     menguji apa pun. Justru di situ gunanya: begitu naskah resmi mulai dimuat, aturannya sudah
     berdiri lebih dulu, sehingga tidak ada naskah yang bisa masuk lewat jalan belakang -
     ditulis langsung di logika, atau dilekatkan pada sumber yang belum terverifikasi. */
  for(const subjectId of CP_SUBJECTS)
    for(const [kelas,phase] of [['1A','A'],['3A','B'],['5A','C']]){
      const cp=capaianPembelajaran(kelas,subjectId);
      if(cp.naskah===null){
        for(const elemen of cp.elements)
          assert.equal(elemen.naskah,naskahElemen(subjectId,phase,elemen.name),
            `${subjectId} ${phase}: naskah elemen hanya dari berkas data`);
        continue;
      }
      assert.equal(cp.naskah,naskahCp(subjectId,phase),
        `${subjectId} ${phase}: naskah CP hanya dari berkas data`);
      assert.equal(cp.regulation.verified,true,
        `${subjectId} ${phase}: naskah tidak boleh menempel pada sumber yang belum terverifikasi`);
      assert.equal(cp.available,true,
        `${subjectId} ${phase}: fase yang tidak berlaku tidak boleh punya naskah`);
      assert.equal(cp.naskahReason,null,'keterangan kekosongan tidak tertinggal');
    }
  /* Logika CP tidak boleh memuat naskah sendiri: berkas datanya yang menjadi satu-satunya pintu. */
  const logika=read('src/data/curriculum-cp.js');
  assert.match(logika,/naskahCp|naskahElemen/,'naskah dibaca dari berkas data');
  assert.equal(/naskah:'[^']{40,}'/.test(logika),false,'tidak ada naskah yang ditulis di logika');
});

test('19. Keenam agama yang didukung Data Siswa punya mapel dan CP-nya masing-masing',()=>{
  const enam=['agama','agama_kristen','agama_katolik','agama_hindu','agama_buddha','agama_khonghucu'];
  const dikenal=new Set(SUBJECTS_DEFAULT.map(item=>item.id));
  for(const subjectId of enam){
    assert.ok(dikenal.has(subjectId),`${subjectId} ada pada master mapel`);
    assert.ok(CP_SUBJECTS.includes(subjectId),`${subjectId} ikut diaudit CP-nya`);
    for(const kelas of ['1A','3C','5B']){
      const cp=capaianPembelajaran(kelas,subjectId);
      assert.equal(cp.regulation.id,'cp_pabp',`${subjectId} ${kelas} memakai sumber PABP`);
      assert.equal(cp.available,true,`${subjectId} berlaku pada seluruh fase SD`);
      assert.ok(cp.elements.length===0||cp.elements.every(item=>item.naskah===null));
    }
  }
  /* Setiap agama pada Data Siswa terpetakan ke tepat satu mapel, dan sebaliknya. */
  assert.equal(Object.keys(RELIGION_SUBJECTS).length,enam.length);
  assert.deepEqual([...new Set(Object.values(RELIGION_SUBJECTS))].sort(),[...RELIGIONS].sort());
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
  assert.deepEqual(listSchoolObjectives(sesi,'koding'),[],'tabel TP tidak terisi otomatis');
  const referensi=listReferenceObjectives(sesi,'koding');
  assert.ok(referensi.length>=2,'+ Tambah TP membuka daftar TP referensi');
  const dipilih=referensi.slice(0,2).map(item=>item.id);
  assert.equal(addReferenceObjectives(sesi,'koding',dipilih).added,2);
  assert.equal(listSchoolObjectives(sesi,'koding').length,2);
  /* Simpan ulang tidak boleh menggandakan. */
  addReferenceObjectives(sesi,'koding',dipilih);
  assert.equal(listSchoolObjectives(sesi,'koding').length,2,'tidak ada duplikasi');
  /* TP tersimpan bertahan lintas pembacaan ulang. */
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
  assert.equal(tersedia.length,semua.length-1,'TP nonaktif tidak ditawarkan untuk input baru');
  assert.equal(tersedia.some(item=>item.id===semua[0].id),false);
  /* Nonaktif berarti tidak dipakai lagi, BUKAN dihapus. */
  const tersimpan=listSchoolObjectives(sesi,'koding').find(item=>item.id===semua[0].id);
  assert.ok(tersimpan,'TP nonaktif tetap tersimpan sebagai referensi riwayat');
  assert.equal(tersimpan.active,false);
});
