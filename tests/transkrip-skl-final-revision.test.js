import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveSchoolMaster } from '../src/services/master.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping as saveOfficialSubjectMapping } from '../src/services/storage.js';
import { saveTranscriptScores } from '../src/services/transcript.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { buildSklDocument, buildTranscriptDocument, saveGraduationSettings } from '../src/services/graduation-documents.js';
import { sklSheet, subjectScoreTable, transcriptSheet } from '../src/pages/graduation-print.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`};
const guru={role:'teacher',classId:'6A',academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`};
const sekolah={name:'SD Negeri Contoh 01',npsn:'20218098',status:'Negeri',address:'Jalan Contoh',
  city:'Bekasi',reportCity:'Bekasi',principalName:'Budi Santoso, S.Pd.',principalNip:'197001011999031001',
  regionLogo:'data:image/png;base64,AAAA'};

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}

function mapping(activeOrder){
  const active=new Set(activeOrder);
  const byId=new Map(SUBJECTS_DEFAULT.map(subject=>[subject.id,subject]));
  const ids=[...activeOrder,...SUBJECTS_DEFAULT.map(subject=>subject.id).filter(id=>!active.has(id))];
  return ids.map((id,index)=>({...byId.get(id),active:active.has(id),order:index+1}));
}

function officialMapping(activeIds){
  const active=new Set(activeIds);
  return SUBJECTS_DEFAULT.map(subject=>({...subject,active:active.has(subject.id)}));
}

function setup(activeOrder,school=sekolah){
  useMemoryStorage();
  saveSchoolMaster(admin,school);
  saveSubjectMapping(guru,mapping(activeOrder));
  const student=createStudent(guru,{classId:'6A',nis:'601',nisn:'3152513003',name:'Adwa Habibi Rizky',
    gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-09-04',parentName:'Orang Tua'});
  saveGraduationSettings(admin,{graduationDate:'2026-06-15',documentDate:'2026-09-08',documentCity:''});
  return student;
}

function documents(student){
  return [buildTranscriptDocument(admin,'6A',student.id),buildSklDocument(admin,'6A',student.id)];
}

test('Mapping aktif mengalahkan fallback agama tanpa menghapus nilai historis',()=>{
  const student=setup(['agama','pancasila','mtk']);
  saveTranscriptScores(guru,student.id,{agama:80,pancasila:81,mtk:82});
  const before=Object.values(loadDb().transcriptScores).filter(record=>record.studentId===student.id);
  assert.equal(before.length,3);

  saveSubjectMapping(guru,mapping(['pancasila']));
  for(const doc of documents(student))
    assert.deepEqual(doc.rows.map(row=>row.subjectId),['pancasila'],`${doc.type}: mapel nonaktif hilang`);
  const hidden=Object.values(loadDb().transcriptScores).filter(record=>record.studentId===student.id);
  assert.deepEqual(hidden.map(record=>record.score).sort((a,b)=>a-b),[80,81,82],
    'menonaktifkan Mapping tidak menghapus nilai tersimpan');

  saveSubjectMapping(guru,mapping(['pancasila','agama','mtk']));
  for(const doc of documents(student)){
    assert.deepEqual(doc.rows.map(row=>row.subjectId),['pancasila','agama','mtk']);
    assert.deepEqual(doc.rows.map(row=>row.score),[81,80,82],`${doc.type}: reaktivasi membaca nilai lama`);
  }
});

test('Mapping Admin menjadi sumber tunggal visibility meski Mapping rombel dan nilai lama masih aktif',()=>{
  useMemoryStorage();
  saveSchoolMaster(admin,sekolah);
  const activeIds=['pancasila','pjok','sunda','koding'];
  const legacyMapping=mapping(activeIds).map(subject=>subject.id==='koding'
    ?{...subject,parent:'Muatan Lokal'}:subject);
  saveSubjectMapping(guru,legacyMapping);
  const student=createStudent(guru,{classId:'6A',nis:'601',nisn:'3152513003',name:'Adwa Habibi Rizky',
    gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-09-04',parentName:'Orang Tua'});
  saveGraduationSettings(admin,{graduationDate:'2026-06-15',documentDate:'2026-09-08',documentCity:''});
  saveTranscriptScores(guru,student.id,{pancasila:84,pjok:89,sunda:85,koding:91});

  saveOfficialSubjectMapping(admin,officialMapping(['pancasila','sunda']));

  for(const doc of documents(student)){
    assert.deepEqual(doc.rows.map(row=>row.subjectId),['pancasila','sunda'],
      `${doc.type}: hanya status aktif Mapping Admin yang menentukan visibility`);
    assert.equal(doc.rows.find(row=>row.subjectId==='sunda')?.number,11,
      `${doc.type}: nomor Muatan Lokal berasal dari subject.order Mapping Admin`);
    const html=doc.type==='TRANSKRIP'?transcriptSheet(doc):sklSheet(doc);
    assert.equal(html.includes('Pendidikan Jasmani'),false,`${doc.type}: PJOK nonaktif harus hilang`);
    assert.equal(html.includes('Koding dan Kecerdasan Artifisial'),false,
      `${doc.type}: Koding nonaktif tidak boleh menjadi child Muatan Lokal`);
    assert.match(html,/<td class="letter-no">11\.<\/td><td class="letter-subject">Muatan Lokal<\/td>/);
    assert.match(html,/>a\. Bahasa Sunda<\/td><td class="letter-score">85,00<\/td>/);
  }

  const saved=Object.values(loadDb().transcriptScores).filter(record=>record.studentId===student.id);
  assert.equal(saved.some(record=>record.subjectId==='pjok'&&record.score===89),true);
  assert.equal(saved.some(record=>record.subjectId==='koding'&&record.score===91),true);

  saveOfficialSubjectMapping(admin,officialMapping(activeIds));
  for(const doc of documents(student)){
    const rows=new Map(doc.rows.map(row=>[row.subjectId,row.score]));
    assert.equal(rows.get('pjok'),89,`${doc.type}: nilai lama PJOK kembali saat diaktifkan`);
    assert.equal(rows.get('koding'),91,`${doc.type}: nilai lama Koding kembali saat diaktifkan`);
  }
});

test('Muatan Lokal tidak dicetak ketika seluruh mapel kategori itu nonaktif pada Mapping Admin',()=>{
  const student=setup(['pancasila','sunda']);
  saveTranscriptScores(guru,student.id,{pancasila:84,sunda:85});
  saveOfficialSubjectMapping(admin,officialMapping(['pancasila']));
  for(const doc of documents(student)){
    const html=doc.type==='TRANSKRIP'?transcriptSheet(doc):sklSheet(doc);
    assert.equal(html.includes('Bahasa Sunda'),false);
    assert.equal(html.includes('Muatan Lokal'),false);
  }
});

test('Muatan Lokal memakai posisi Mapping dan menaruh Bahasa Sunda sebagai child tanpa nomor utama',()=>{
  const scenarios=[
    {order:['agama','pancasila','bindo','mtk','ipas','pjok','seni','sunda','bing'],number:8},
    {order:['agama','pancasila','bindo','mtk','ipas','pjok','seni','bing','koding','sunda'],number:10},
  ];
  for(const scenario of scenarios){
    const student=setup(scenario.order);
    saveTranscriptScores(guru,student.id,Object.fromEntries(scenario.order.map((id,index)=>[id,id==='sunda'?85:70+index])));
    for(const doc of documents(student)){
      assert.deepEqual(doc.rows.map(row=>row.subjectId),scenario.order,`${doc.type}: urutan mengikuti Mapping`);
      const html=doc.type==='TRANSKRIP'?transcriptSheet(doc):sklSheet(doc);
      assert.match(html,new RegExp(`<tr class="letter-local-heading"><td class="letter-no">${scenario.number}\\.<\\/td><td class="letter-subject">Muatan Lokal<\\/td><td class="letter-score"><\\/td><\\/tr>`));
      assert.match(html,/<tr class="letter-local-subject"><td class="letter-no"><\/td><td class="letter-subject">a\. Bahasa Sunda<\/td><td class="letter-score">85,00<\/td><\/tr>/);
      assert.equal(new RegExp(`<td class="letter-no">${scenario.number}\\.<\\/td><td class="letter-subject">a\\. Bahasa Sunda`).test(html),false,
        'nomor utama tidak ditempelkan pada Bahasa Sunda');
      assert.equal(/Kelompok A|Kelompok B/.test(html),false);
    }
  }
});

test('nomor Muatan Lokal tetap memakai slot Mapping ketika mapel sebelumnya nonaktif',()=>{
  useMemoryStorage();
  saveSchoolMaster(admin,sekolah);
  const urutan=['agama','pancasila','bindo','mtk','ipas','pjok','seni','sunda','bing'];
  const byId=new Map(SUBJECTS_DEFAULT.map(subject=>[subject.id,subject]));
  const seluruh=[...urutan,...SUBJECTS_DEFAULT.map(subject=>subject.id).filter(id=>!urutan.includes(id))];
  const aktif=new Set(urutan.filter(id=>id!=='bindo'));
  saveSubjectMapping(guru,seluruh.map((id,index)=>({...byId.get(id),active:aktif.has(id),order:index+1})));
  const student=createStudent(guru,{classId:'6A',nis:'601',nisn:'3152513003',name:'Adwa Habibi Rizky',
    gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-09-04',parentName:'Orang Tua'});
  saveGraduationSettings(admin,{graduationDate:'2026-06-15',documentDate:'2026-09-08',documentCity:''});
  saveTranscriptScores(guru,student.id,Object.fromEntries([...aktif].map((id,index)=>[id,70+index])));

  for(const doc of documents(student)){
    assert.equal(doc.rows.find(row=>row.subjectId==='sunda')?.number,8,
      `${doc.type}: nomor berasal dari subject.order, bukan indeks daftar aktif`);
    const html=doc.type==='TRANSKRIP'?transcriptSheet(doc):sklSheet(doc);
    assert.match(html,/<tr class="letter-local-heading"><td class="letter-no">8\.<\/td><td class="letter-subject">Muatan Lokal<\/td>/);
    assert.equal(html.includes('Bahasa Indonesia'),false,'mapel nonaktif sebelum Sunda tetap tersembunyi');
  }
});

test('Bahasa Sunda nonaktif tidak meninggalkan header Muatan Lokal kosong',()=>{
  const student=setup(['pancasila','sunda']);
  saveTranscriptScores(guru,student.id,{pancasila:84,sunda:85});
  saveSubjectMapping(guru,mapping(['pancasila']));
  for(const doc of documents(student)){
    const html=doc.type==='TRANSKRIP'?transcriptSheet(doc):sklSheet(doc);
    assert.equal(html.includes('Muatan Lokal'),false);
    assert.equal(html.includes('Bahasa Sunda'),false);
  }
  assert.equal(Object.values(loadDb().transcriptScores).some(record=>record.subjectId==='sunda'&&record.score===85),true,
    'nilai Sunda tetap tersimpan ketika Mapping dinonaktifkan');
});

test('beberapa Muatan Lokal tetap memakai satu nomor induk dengan child a, b, c',()=>{
  const html=subjectScoreTable({rows:[
    {number:8,name:'Bahasa Sunda',parent:'Muatan Lokal',score:85},
    {number:9,name:'Bahasa Jawa',parent:'Muatan Lokal',score:86},
    {number:10,name:'Bahasa Cirebon',parent:'Muatan Lokal',score:87},
    {number:11,name:'Bahasa Inggris',parent:'',score:88},
  ]});
  assert.equal((html.match(/letter-local-heading/g)||[]).length,1,'hanya satu header Muatan Lokal');
  assert.match(html,/<td class="letter-no">8\.<\/td><td class="letter-subject">Muatan Lokal<\/td>/);
  for(const [marker,name,score] of [['a','Bahasa Sunda','85,00'],['b','Bahasa Jawa','86,00'],['c','Bahasa Cirebon','87,00']])
    assert.match(html,new RegExp(`<td class="letter-no"><\\/td><td class="letter-subject">${marker}\\. ${name}<\\/td><td class="letter-score">${score.replace('.','\\.')}<\\/td>`));
  assert.match(html,/<td class="letter-no">11\.<\/td><td class="letter-subject">Bahasa Inggris<\/td>/);
});

test('Transkrip dan SKL tidak menghasilkan presentation nilai rata-rata',()=>{
  const student=setup(['agama','pancasila']);
  saveTranscriptScores(guru,student.id,{agama:80,pancasila:90});
  for(const [doc,render] of [[buildTranscriptDocument(admin,'6A',student.id),transcriptSheet],
    [buildSklDocument(admin,'6A',student.id),sklSheet]]){
    const html=render(doc);
    assert.equal(/NILAI RATA-RATA|Nilai Rata-rata|Rata-rata/i.test(html),false,`${doc.type}: label rata-rata hilang`);
    assert.equal(html.includes('letter-average-row'),false,`${doc.type}: markup rata-rata tidak dibuat`);
    assert.equal(html.includes('<tfoot>'),false,`${doc.type}: tabel selesai setelah mapel terakhir`);
  }
});

test('identitas memakai tiga kolom struktural dengan label satu baris dan gap value konsisten',()=>{
  const student=setup(['agama','pancasila']);
  for(const html of [transcriptSheet(buildTranscriptDocument(admin,'6A',student.id)),
    sklSheet(buildSklDocument(admin,'6A',student.id))]){
    assert.match(html,/<table class="letter-identity"><colgroup><col class="letter-label-column"\/><col class="letter-colon-column"\/><col class="letter-value-column"\/><\/colgroup><tbody>/);
    assert.match(html,/<td class="letter-label">[^<]+<\/td><td class="letter-colon">:<\/td><td class="letter-value">/);
    assert.equal(/Nomor (Pokok Sekolah|Induk Siswa) Nasional[\s\S]*?<br/i.test(html),false);
  }
  const css=read('src/styles/app.css');
  assert.match(css,/\.letter-label\{[^}]*white-space:nowrap[^}]*padding-right:[1-9][0-9]*px/);
  assert.match(css,/\.letter-value\{[^}]*padding-left:[1-9][0-9]*px/);
});

test('tanda tangan dinamis berada di kanan dengan seluruh isi rata kiri dan ruang stabil',()=>{
  const student=setup(['agama','pancasila']);
  const html=transcriptSheet(buildTranscriptDocument(admin,'6A',student.id));
  assert.match(html,/<span class="letter-sign-date">Bekasi, 8 September 2026<\/span>/);
  assert.match(html,/<span class="letter-sign-role">Kepala Sekolah<\/span><span class="letter-sign-school">SD Negeri Contoh 01<\/span>/);
  assert.match(html,/<div class="letter-sign-space" aria-hidden="true"><\/div><strong>Budi Santoso, S\.Pd\.<\/strong><small>NIP\. 197001011999031001<\/small>/);
  const css=read('src/styles/app.css');
  assert.match(css,/\.letter-sign\{[^}]*justify-content:flex-end/,'blok tetap di area kanan');
  assert.match(css,/\.letter-sign-block\{[^}]*text-align:left/,'isi blok rata kiri');
  assert.match(css,/\.letter-sign-space\{[^}]*height:/,'ruang tanda tangan diatur CSS');

  const otherSchool={...sekolah,name:'SD Negeri Cipta Karya 02',city:'Bandung',reportCity:'Bandung',
    principalName:'Dewi Lestari, S.Pd.',principalNip:'198004122005012003'};
  const otherStudent=setup(['agama','pancasila'],otherSchool);
  const otherHtml=sklSheet(buildSklDocument(admin,'6A',otherStudent.id));
  assert.match(otherHtml,/<span class="letter-sign-date">Bandung, 8 September 2026<\/span>/);
  assert.match(otherHtml,/<span class="letter-sign-school">SD Negeri Cipta Karya 02<\/span>/);
  assert.match(otherHtml,/<strong>Dewi Lestari, S\.Pd\.<\/strong><small>NIP\. 198004122005012003<\/small>/);
});
