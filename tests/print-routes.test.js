import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('Route cetak membuka satu mode dokumen tanpa navigasi internal ganda',()=>{
  const app=read('src/app.js');
  assert.match(app,/case 'print-ledger': return renderPrint\(session,'ledger'\);/);
  assert.match(app,/case 'print-supplement': return renderPrint\(session,'supplement'\);/);
  assert.match(app,/case 'print-report': return renderPrint\(session,'report'\);/);
  const page=read('src/pages/print.js');
  assert.match(page,/export function renderPrint\(session,initialTab='ledger'\)/);
  assert.match(page,/PRINT_MODES/);
  /* Leger dan Nilai Rapor punya entri sidebar sendiri, jadi tidak boleh jadi tab internal. */
  assert.doesNotMatch(page,/data-tab="leger"/);
  assert.doesNotMatch(page,/data-tab="report"/);
});

test('Layar rapor menyediakan aksi per siswa dan satu kelas penuh',()=>{
  const page=read('src/pages/print.js');
  assert.match(page,/Generate Rapor Kelas Ini/);
  assert.match(page,/Cetak Langsung Rapor/);
  assert.match(page,/Tampilkan pada Siswa/);
  assert.match(page,/Semua Siswa/);
  /* Aksi per siswa yang sudah ada tetap dipertahankan. */
  assert.match(page,/data-print/);assert.match(page,/data-pdf/);assert.match(page,/data-preview/);
});

test('Status publikasi tampil untuk pelengkap dan rapor tanpa menghalangi cetak',()=>{
  const page=read('src/pages/print.js');
  assert.match(page,/isReportPublished/);
  assert.match(page,/publishReport/);assert.match(page,/unpublishReport/);
  assert.match(page,/Ditampilkan kepada Siswa/);
  assert.match(page,/data-document-type="\$\{documentType\}"/,'tombol publikasi memakai jenis dokumen yang diminta');
  assert.match(page,/publicationButton\(student,'supplement'\)/);
  assert.match(page,/publicationButton\(student,'report'\)/);
  /* assertReportPrintable hanya dipakai untuk validasi kelengkapan, bukan publikasi. */
  assert.doesNotMatch(page,/isReportPublished\([^)]*\)\s*\|\|\s*throw/);
});

test('Pengaturan cetak lengkap dirender sebelum pemilihan rombel',()=>{
  const page=read('src/pages/print.js');
  for(const field of ['paperSize','marginTopMm','marginBottomMm','marginLeftMm','marginRightMm','signatureMode','principalPosition','showTeacherName','firstPage'])
    assert.match(page,new RegExp(field),`kolom ${field} tersedia`);
  assert.match(page,/savePrintSettings/);
  assert.match(page,/setPrintPageSize/);
  assert.match(page,/print-settings-grid/);
  assert.match(read('src/styles/app.css'),/print-settings-grid/);
});

test('Tiga route cetak muncul sekali pada masing-masing menu',()=>{
  for(const role of ['admin','teacher']){
    const menu=flattenNavigation(role).map(item=>item.route);
    for(const route of ['print-ledger','print-supplement','print-report'])
      assert.equal(menu.filter(item=>item===route).length,1,`${route} muncul sekali pada menu ${role}`);
  }
});
