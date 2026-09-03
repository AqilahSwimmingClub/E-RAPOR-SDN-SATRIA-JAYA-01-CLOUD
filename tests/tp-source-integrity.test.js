import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { defaultLearningObjectives, hasDefaultsFor, OBJECTIVE_STATUS, phaseForClassId,
  subjectsWithDefaults, TP_SOURCES } from '../src/data/learning-objective-defaults.js';

/* Integritas katalog TP bawaan.

   Katalog ini bersifat INSPIRATIF. Pemerintah menetapkan Capaian Pembelajaran; Tujuan
   Pembelajaran disusun satuan pendidikan. Suite ini menjaga agar klaim itu tidak bergeser:
   setiap butir wajib menyebut dokumen sumbernya, tidak ada mapel wajib yang kosong pada
   fasenya, dan tidak ada ID yang bertabrakan. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const FASE=Object.freeze({A:['1A','2A'],B:['3A','4A'],C:['5A','6A']});
/* Mapel wajib yang harus punya TP pada seluruh fase. IPAS sengaja dikecualikan pada Fase A
   karena baru berdiri sebagai mapel tersendiri mulai Fase B. */
const WAJIB=Object.freeze(['agama','agama_kristen','pancasila','bindo','mtk','pjok']);
const OPSIONAL=Object.freeze(['bing','sunda','koding','seni','seni_rupa']);

test('Setiap mapel wajib punya TP pada Fase A, B, dan C',()=>{
  for(const subjectId of WAJIB){
    for(const [fase,kelas] of Object.entries(FASE)){
      const butir=defaultLearningObjectives(kelas[0],subjectId);
      assert.ok(butir.length>=2,`${subjectId} Fase ${fase} wajib punya minimal dua TP`);
      for(const lain of kelas.slice(1)){
        assert.deepEqual(defaultLearningObjectives(lain,subjectId),butir,
          `${subjectId} konsisten untuk seluruh kelas pada Fase ${fase}`);
      }
    }
  }
});

test('IPAS kosong pada Fase A dan terisi mulai Fase B',()=>{
  assert.equal(defaultLearningObjectives('1A','ipas').length,0);
  assert.equal(defaultLearningObjectives('2C','ipas').length,0);
  assert.ok(defaultLearningObjectives('3A','ipas').length>=2);
  assert.ok(defaultLearningObjectives('5B','ipas').length>=2);
});

test('Mapel opsional tetap tersedia tetapi tidak dipaksakan',()=>{
  for(const subjectId of OPSIONAL){
    assert.ok(subjectsWithDefaults().includes(subjectId),`${subjectId} ada di katalog`);
    assert.ok(hasDefaultsFor('5A',subjectId),`${subjectId} punya TP bila sekolah mengaktifkannya`);
  }
});

test('Koding & KA hanya berkatalog pada Fase C, sesuai jenjang SD',()=>{
  for(const kelas of ['1A','1D','2A','2D','3A','3D','4A','4D'])
    assert.equal(defaultLearningObjectives(kelas,'koding').length,0,
      `${kelas} tidak boleh punya TP Koding & KA — CP-nya belum ada pada fase itu`);
  for(const kelas of ['5A','5B','5C','5D','6A','6B','6C','6D'])
    assert.ok(defaultLearningObjectives(kelas,'koding').length>=2,`${kelas} punya TP Koding & KA`);
  assert.equal(hasDefaultsFor('1A','koding'),false);
  assert.equal(hasDefaultsFor('3C','koding'),false);
  assert.equal(hasDefaultsFor('6D','koding'),true);
});

test('Seluruh mapel katalog terdaftar pada daftar mapel aplikasi',()=>{
  const dikenal=new Set(SUBJECTS_DEFAULT.map(subject=>subject.id));
  for(const subjectId of subjectsWithDefaults())
    assert.ok(dikenal.has(subjectId),`${subjectId} dikenal aplikasi`);
});

test('Tidak ada ID atau kode TP yang bertabrakan',()=>{
  const semuaId=new Set();
  for(const subjectId of subjectsWithDefaults()){
    for(const kelas of ['1A','3A','5A']){
      const kode=new Set();
      for(const tp of defaultLearningObjectives(kelas,subjectId)){
        assert.equal(semuaId.has(tp.id),false,`ID ${tp.id} tidak boleh ganda`);
        semuaId.add(tp.id);
        assert.equal(kode.has(tp.code),false,`Kode ${tp.code} ganda pada ${subjectId} ${kelas}`);
        kode.add(tp.code);
      }
    }
  }
  assert.ok(semuaId.size>=60,'katalog memuat cukup banyak TP');
});

test('Setiap TP mencantumkan metadata sumber resmi yang lengkap',()=>{
  const sumberDikenal=new Set(Object.keys(TP_SOURCES));
  for(const subjectId of subjectsWithDefaults()){
    for(const kelas of ['1A','3A','5A']){
      for(const tp of defaultLearningObjectives(kelas,subjectId)){
        assert.ok(tp.source,`${subjectId} ${tp.code} punya sumber`);
        assert.ok(sumberDikenal.has(tp.source.id),`sumber ${tp.source.id} dikenal`);
        assert.ok(tp.source.title.length>10);
        assert.ok(tp.source.authority.length>10,`${subjectId} menyebut lembaga berwenang`);
        /* Dua kontrak berbeda, dan yang belum terverifikasi justru yang lebih ketat: ia harus
           benar-benar kosong. Sumber Muatan Lokal yang diam-diam memakai nomor keputusan
           nasional akan lolos pemeriksaan "ada isinya", padahal itu persis kesalahannya. */
        if(tp.source.verified===false){
          assert.equal(tp.source.decision,null,`${subjectId} tidak meminjam nomor keputusan`);
          assert.equal(tp.source.year,null,`${subjectId} tidak meminjam tahun regulasi`);
          assert.equal(tp.source.url,null,`${subjectId} tidak meminjam tautan regulasi`);
        }else{
          assert.ok(tp.source.decision.length>5);
          assert.ok(Number.isInteger(tp.source.year)&&tp.source.year>=2024);
          assert.match(tp.source.url,/^https:\/\//);
        }
        assert.ok(tp.description.length>=20,`${subjectId} ${tp.code} deskripsi operasional`);
        assert.equal(tp.status,OBJECTIVE_STATUS);
        assert.equal(tp.editable,true);
      }
    }
  }
});

test('PABP memakai keputusan 2026 dan mapel umum memakai CP yang masih berlaku',()=>{
  for(const subjectId of ['agama','agama_kristen'])
    assert.equal(defaultLearningObjectives('5A',subjectId)[0].source.id,'cp_pabp');
  for(const subjectId of ['pancasila','bindo','mtk','ipas','pjok'])
    assert.equal(defaultLearningObjectives('5A',subjectId)[0].source.id,'cp_umum');
  /* Koding & KA dan Muatan Lokal punya sumber sendiri; keduanya tidak boleh jatuh ke cp_umum. */
  assert.equal(defaultLearningObjectives('5A','koding')[0].source.id,'cp_koding_ka');
  assert.equal(defaultLearningObjectives('5A','sunda')[0].source.id,'cp_mulok_jabar');
  assert.equal(TP_SOURCES.cp_pabp.year,2026);
  assert.match(TP_SOURCES.cp_pabp.decision,/020/);
  assert.match(TP_SOURCES.cp_umum.decision,/046\/H\/KR\/2025/);
});

test('Fase mengikuti tingkat kelas dan menolak rombel di luar SD',()=>{
  assert.equal(phaseForClassId('1A'),'A');
  assert.equal(phaseForClassId('4B'),'B');
  assert.equal(phaseForClassId('6C'),'C');
  assert.equal(phaseForClassId('7A'),null);
  assert.equal(phaseForClassId(''),null);
  assert.equal(defaultLearningObjectives('7A','mtk').length,0);
});

test('Katalog tidak mengklaim TP sebagai teks nasional wajib',()=>{
  const sumber=read('src/data/learning-objective-defaults.js');
  assert.match(sumber,/CAPAIAN PEMBELAJARAN \(CP\), bukan Tujuan\s+Pembelajaran/,
    'berkas menegaskan pemerintah menetapkan CP, bukan TP');
  assert.equal(/TP nasional wajib|wajib dipakai seluruh sekolah/.test(sumber.replace(/BUKAN teks nasional yang wajib dipakai/,'')),false);
  assert.equal(OBJECTIVE_STATUS,'inspiratif');
});

test('Dokumentasi sumber TP tersedia dan menyebut ketiga rujukan',()=>{
  const dokumen=read('docs/TP-SOURCES.md');
  for(const sumber of Object.values(TP_SOURCES)){
    assert.ok(dokumen.includes(sumber.title),`${sumber.id} tercantum di dokumentasi`);
    assert.ok(dokumen.includes(sumber.authority),`lembaga ${sumber.id} tercantum di dokumentasi`);
    if(sumber.verified===false)continue;
    assert.ok(dokumen.includes(sumber.decision),`${sumber.decision} tercantum di dokumentasi`);
    assert.ok(dokumen.includes(sumber.url),`URL ${sumber.id} tercantum di dokumentasi`);
  }
  assert.match(dokumen,/inspiratif/i);
  assert.match(dokumen,/Capaian Pembelajaran/);
  assert.match(dokumen,/bukan nilai per TP|BUKAN nilai per TP/i);
});
