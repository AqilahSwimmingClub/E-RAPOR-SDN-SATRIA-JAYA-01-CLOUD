import { naskahCp, naskahElemen } from './curriculum-cp-naskah.js';
import { TP_SOURCES, phaseForClassId } from './learning-objective-defaults.js';

/* CAPAIAN PEMBELAJARAN (CP) — entitas tersendiri, BUKAN daftar TP.

   CP ditetapkan pemerintah per mata pelajaran dan fase. TP disusun satuan pendidikan/guru
   dengan menurunkannya dari CP. Naskah resmi yang sudah diverifikasi disimpan terpisah pada
   dataset `curriculum-cp-naskah.js`; kombinasi yang belum memiliki sumber lokal resmi tetap
   dibiarkan kosong daripada diisi teks buatan aplikasi.

   Alasan pemisahan itu: naskah yang dikutip harus dapat ditelusuri ke dokumen penetapnya.
   Aplikasi tidak boleh menjadi sumber kedua yang bisa berbeda dari dokumen resmi, karena guru
   memakainya sebagai acuan penilaian tanpa tahu bedanya. Karena itu berkas ini memuat aturan -
   mata pelajaran, fase, elemen, regulasi - dan tidak pernah memuat naskah itu sendiri. */

export const CP_STATUS='rujukan';

const ELEMENTS=Object.freeze({
  /* Nama elemen mengikuti naskah resmi. Slot ketiga adalah ID LAMA yang dipatok: id elemen
     dulu diturunkan dari namanya, sehingga menyamakan nama tanpa mematok id akan mengubah id
     dan memutus catatan yang sudah tersimpan - Butir CP, nilai murid, dan tautan TP lama. */
  agama:[['Al-Qur\u2019an Hadis',null,'al-qur-an-dan-hadis'],'Akidah','Akhlak','Fikih','Sejarah Peradaban Islam'],
  agama_kristen:['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Gereja dan Masyarakat Majemuk',
    ['Alam dan Lingkungan Hidup',null,'alam-dan-lingkungan']],
  pancasila:['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Bhinneka Tunggal Ika','Negara Kesatuan Republik Indonesia'],
  bindo:['Menyimak','Membaca dan Memirsa','Berbicara dan Mempresentasikan','Menulis'],
  mtk:['Bilangan','Aljabar','Pengukuran','Geometri','Analisis Data dan Peluang'],
  ipas:['Pemahaman IPAS','Keterampilan Proses'],
  pjok:['Terampil Bergerak','Belajar Melalui Gerak','Bergaya Hidup Aktif','Memilih Hidup yang Menyehatkan'],
  seni:['Mengalami','Menciptakan','Merefleksikan','Berpikir dan Bekerja Artistik','Berdampak'],
  seni_rupa:['Mengalami','Menciptakan','Merefleksikan','Berpikir dan Bekerja Artistik','Berdampak'],
  /* Naskah resmi memakai tanda hubung biasa, bukan en dash. Slug keduanya sama, jadi id elemen
     tidak berubah. */
  bing:['Menyimak - Berbicara','Membaca - Memirsa','Menulis - Mempresentasikan'],
  /* Fase C SD pada Bab XXVIII memuat empat elemen berikut. */
  koding:['Berpikir Komputasional','Literasi Digital','Literasi dan Etika Kecerdasan Artifisial','Pemanfaatan dan Pengembangan Kecerdasan Artifisial'],
  sunda:[['Menyimak','Ngaregepkeun'],['Membaca dan Memirsa','Maca jeung Miarsa'],
    ['Berbicara dan Menyajikan/Mempresentasikan','Nyarita jeung Midangkeun'],['Menulis','Nulis']],
});

/* Fase SD yang benar-benar berlaku menurut sumber resmi. */
const PHASES_BY_SUBJECT=Object.freeze({
  koding:Object.freeze(['C']),
  ipas:Object.freeze(['B','C']),
  bing:Object.freeze(['B','C']),
});

const ALASAN_DI_LUAR_FASE=Object.freeze({
  koding:'Pada jenjang SD, Koding dan Kecerdasan Artifisial dimulai pada Fase C (kelas 5-6).',
  ipas:'IPAS berdiri sebagai mata pelajaran tersendiri mulai Fase B (kelas 3-4).',
  bing:'Bahasa Inggris pada dokumen CP SD diwajibkan mulai Fase B (kelas 3-4).',
});

export function cpPhasesFor(subjectId){
  return [...(PHASES_BY_SUBJECT[subjectId]||['A','B','C'])];
}

export function cpBerlaku(subjectId,phase){
  return cpPhasesFor(subjectId).includes(phase);
}

/* Produk hanya menyediakan dua mapel agama: PAI BP dan PAK BP. */
const PABP=new Set(['agama','agama_kristen']);

export function elementIdOf(subjectId,name){
  return `${subjectId}:${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
}

export function cpElements(subjectId,phase){
  if(phase&&!cpBerlaku(subjectId,phase))return [];
  return (ELEMENTS[subjectId]||[]).map((entry,index)=>{
    const [name,nameLokal,idLegacy]=Array.isArray(entry)?entry:[entry,null,null];
    return Object.freeze({
      id:idLegacy?`${subjectId}:${idLegacy}`:elementIdOf(subjectId,name),
      name,nameLokal,order:index+1,subjectId,
      naskah:phase?naskahElemen(subjectId,phase,name):null,
    });
  });
}

const REGULASI_KHUSUS=Object.freeze({koding:'cp_koding_ka',sunda:'cp_mulok_jabar'});

export function cpRegulationFor(subjectId){
  if(Object.hasOwn(REGULASI_KHUSUS,subjectId))return TP_SOURCES[REGULASI_KHUSUS[subjectId]];
  return TP_SOURCES[PABP.has(subjectId)?'cp_pabp':'cp_umum'];
}

export function capaianPembelajaran(classId,subjectId){
  const phase=phaseForClassId(classId);
  if(!phase||!subjectId)return null;
  const regulation=cpRegulationFor(subjectId);
  const berlaku=cpBerlaku(subjectId,phase);
  const elements=cpElements(subjectId,phase);
  const naskah=berlaku?naskahCp(subjectId,phase):null;
  return {
    subjectId,phase,
    grade:Number.parseInt(String(classId||'').trim(),10)||null,
    status:CP_STATUS,
    available:berlaku,
    elements,
    naskah,
    naskahReason:naskah?null:alasanNaskahKosong(subjectId,phase,regulation,berlaku),
    regulation:{
      id:regulation.id,title:regulation.title,decision:regulation.decision,
      decisionNumber:regulation.decisionNumber??null,document:regulation.document??null,
      section:regulation.section??null,
      authority:regulation.authority,scope:regulation.scope,verified:regulation.verified,
      year:regulation.year,url:regulation.url,note:regulation.note,
    },
  };
}

function alasanNaskahKosong(subjectId,phase,regulation,berlaku){
  if(!berlaku)
    return ALASAN_DI_LUAR_FASE[subjectId]
      ||`Mata pelajaran ini tidak mempunyai CP pada Fase ${phase} untuk jenjang SD.`;
  if(regulation.verified===false)
    return `Sumber resmi CP belum berhasil diverifikasi. Kewenangan penetapannya ada pada ${regulation.authority}.`;
  if(regulation.document)
    return `Naskah resmi belum dimuat. Sumbernya adalah ${regulation.document} (${regulation.decision}).`;
  return `Naskah resmi ${regulation.decision} belum dimuat ke dataset aplikasi.`;
}

/* Empat agama lain sengaja tidak menjadi CP_SUBJECTS karena aplikasi hanya menyediakan PAI BP
   dan PAK BP. `seni` tetap dipertahankan demi kompatibilitas mapel lama, tetapi tidak diberi
   naskah Seni Rupa secara otomatis karena nama itu bukan CP resmi yang sama. */
export const CP_SUBJECTS=Object.freeze(['agama','agama_kristen','pancasila','bindo','mtk','ipas',
  'pjok','seni','seni_rupa','bing','sunda','koding']);

export function cpElementById(subjectId,elementId){
  return cpElements(subjectId).find(item=>item.id===elementId)||null;
}

const OBJECTIVE_ELEMENTS=Object.freeze({
  'agama|A':['Al-Qur\u2019an Hadis','Akhlak','Akidah','Fikih'],
  'agama|B':['Al-Qur\u2019an Hadis','Akhlak','Fikih','Sejarah Peradaban Islam'],
  'agama|C':['Al-Qur\u2019an Hadis','Akhlak','Fikih','Sejarah Peradaban Islam'],
  'agama_kristen|A':['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Allah Berkarya'],
  'agama_kristen|B':['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Manusia dan Nilai-nilai Kristiani'],
  'agama_kristen|C':['Allah Berkarya','Manusia dan Nilai-nilai Kristiani','Gereja dan Masyarakat Majemuk'],
  'pancasila|A':['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Negara Kesatuan Republik Indonesia','Bhinneka Tunggal Ika'],
  'pancasila|B':['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Bhinneka Tunggal Ika','Negara Kesatuan Republik Indonesia'],
  'pancasila|C':['Pancasila','Undang-Undang Dasar Negara Republik Indonesia Tahun 1945','Bhinneka Tunggal Ika','Negara Kesatuan Republik Indonesia'],
  'bindo|A':['Menyimak','Membaca dan Memirsa','Menulis','Berbicara dan Mempresentasikan'],
  'bindo|B':['Menyimak','Membaca dan Memirsa','Menulis','Berbicara dan Mempresentasikan'],
  'bindo|C':['Menyimak','Membaca dan Memirsa','Menulis','Berbicara dan Mempresentasikan'],
  'mtk|A':['Bilangan','Bilangan','Geometri','Pengukuran'],
  'mtk|B':['Bilangan','Bilangan','Pengukuran','Analisis Data dan Peluang'],
  'mtk|C':['Bilangan','Bilangan','Pengukuran','Analisis Data dan Peluang'],
  'ipas|B':['Keterampilan Proses','Pemahaman IPAS','Pemahaman IPAS','Pemahaman IPAS'],
  'ipas|C':['Keterampilan Proses','Pemahaman IPAS','Pemahaman IPAS','Pemahaman IPAS'],
  'pjok|A':['Terampil Bergerak','Bergaya Hidup Aktif','Memilih Hidup yang Menyehatkan'],
  'pjok|B':['Terampil Bergerak','Bergaya Hidup Aktif','Memilih Hidup yang Menyehatkan'],
  'pjok|C':['Terampil Bergerak','Bergaya Hidup Aktif','Memilih Hidup yang Menyehatkan'],
  'seni|A':['Mengalami','Menciptakan'],
  'seni|B':['Menciptakan','Berdampak'],
  'seni|C':['Menciptakan','Berdampak'],
  'seni_rupa|A':['Mengalami','Menciptakan'],
  'seni_rupa|B':['Menciptakan','Merefleksikan'],
  'seni_rupa|C':['Menciptakan','Berdampak'],
  'bing|B':['Membaca - Memirsa','Menyimak - Berbicara'],
  'bing|C':['Membaca - Memirsa','Menulis - Mempresentasikan'],
  'koding|C':['Berpikir Komputasional','Literasi Digital','Literasi dan Etika Kecerdasan Artifisial'],
});

export function cpElementForObjective(subjectId,phase,order){
  const nama=OBJECTIVE_ELEMENTS[`${subjectId}|${phase}`]?.[Number(order)-1];
  if(!nama)return null;
  return cpElementById(subjectId,elementIdOf(subjectId,nama));
}

export function cpNaskahGaps(subjectIds=CP_SUBJECTS){
  const contoh={A:'1A',B:'3A',C:'5A'};
  const kurang=[];
  for(const subjectId of subjectIds)
    for(const phase of ['A','B','C']){
      const cp=capaianPembelajaran(contoh[phase],subjectId);
      if(cp&&cp.naskah===null)
        kurang.push({
          subjectId,phase,
          decision:cp.regulation.decision,
          authority:cp.regulation.authority,
          verified:cp.regulation.verified,
          document:cp.regulation.document,
          available:cp.available,
          naskah:null,
          reason:cp.naskahReason,
        });
    }
  return kurang;
}

export function cpNaskahReport(subjectIds=CP_SUBJECTS){
  const gaps=cpNaskahGaps(subjectIds);
  const total=subjectIds.length*3;
  return {
    total,
    kosong:gaps.length,
    terisi:total-gaps.length,
    diLuarFase:gaps.filter(item=>!item.available).length,
    sumberBelumTerverifikasi:gaps.filter(item=>item.available&&item.verified===false).length,
    menungguDokumen:gaps.filter(item=>item.available&&item.verified!==false&&item.document).length,
    menungguNaskah:gaps.filter(item=>item.available&&item.verified!==false&&!item.document).length,
    gaps,
  };
}
