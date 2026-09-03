import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('Route Intrakurikuler Admin memakai halaman dan store tersendiri',()=>{
  const app=read('src/app.js'),page=read('src/pages/intracurricular.js');
  assert.match(app,/case 'intracurricular': return renderIntracurricular\(session\)/);
  assert.match(app,/import \{ renderIntracurricular \} from '\.\/pages\/intracurricular\.js'/);
  assert.match(page,/listIntracurricularActivities/);
  assert.match(page,/Tambah Kegiatan Intrakurikuler/);
  /* Halaman ini tidak boleh menyentuh penyimpanan Kokurikuler supaya kedua daftar kegiatan
     benar-benar terpisah seperti syarat Plan 2. */
  assert.doesNotMatch(page,/cocurricular/i);
});

test('Halaman Intrakurikuler memakai keempat fungsi layanan dan referensi rombel',()=>{
  const page=read('src/pages/intracurricular.js');
  for(const fungsi of ['listIntracurricularActivities','createIntracurricularActivity','updateIntracurricularActivity','deleteIntracurricularActivity']){
    assert.match(page,new RegExp(fungsi),`${fungsi} dipakai halaman`);
  }
  assert.match(page,/listReferenceClasses/);assert.match(page,/listReferenceAcademicYears/);assert.match(page,/listReferenceSemesters/);
  assert.match(page,/Belum ada kegiatan intrakurikuler/);
  assert.match(page,/export function renderIntracurricular\(session\)/);
});

test('Intrakurikuler hanya muncul sekali pada menu Admin dan tidak ada di menu Guru',()=>{
  const nav=read('src/data/navigation.js');
  /* Input kegiatan adalah pekerjaan Guru, jadi Admin tidak lagi punya menunya. Halaman dan
     layanannya TIDAK dihapus: yang hilang hanya akses menu yang menduplikasi. */
  assert.equal((nav.match(/'intracurricular'/g)||[]).length,0,'Admin tidak lagi punya menu input Intrakurikuler');
  assert.match(nav,/'intracurricular-input','Intrakurikuler'/,'Guru pemiliknya');
  assert.match(read('src/app.js'),/case 'intracurricular':/,'route dan halamannya tetap ada');
  /* Route ini harus memakai halaman sungguhan, bukan lagi stub renderPlaceholder. */
  assert.doesNotMatch(read('src/pages/intracurricular.js'),/pages\/placeholder\.js/);
  assert.doesNotMatch(read('src/app.js'),/case 'intracurricular': return renderPlaceholder/);
});

test('Halaman dan gaya Intrakurikuler terdaftar pada check, precache, dan CSS',()=>{
  assert.match(read('package.json'),/node --check src\/pages\/intracurricular\.js/);
  assert.match(read('sw.js'),/\.\/src\/pages\/intracurricular\.js/);
  assert.match(read('src/styles/app.css'),/intracurricular-filter/);
});
