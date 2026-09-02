import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Panel Masuk di kolom kanan dibuka oleh satu kelompok tiga lambang yang rapat dan center,
   lalu judul dan form. Identitas pengembang tidak lagi berada di kolom kanan; tempatnya
   hanya di kiri bawah kolom foto. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const login=()=>read('src/pages/login.js');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){
  const cocok=css().match(new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));
  return cocok?cocok[2]:'';
}
function bagianPanel(){
  const source=login();
  const mulai=source.indexOf('<section class="login-panel">');
  assert.ok(mulai>-1,'kolom form kanan tetap ada');
  return source.slice(mulai);
}
/* Dua lambang pertama adalah lambang nasional dan daerah yang memang aset aplikasi.
   Lambang ketiga adalah logo sekolah pengguna, dibaca dari identitas sekolah. */
const LOGO=[
  ['./assets/logo-tut-wuri-handayani.png','Tut Wuri Handayani'],
  ['./assets/logo-kabupaten-bekasi.png','Kabupaten Bekasi'],
  ['${escapeHtml(crest)}',null],
];

test('Tiga lambang tampil berurutan tepat di atas judul Masuk ke e-Rapor',()=>{
  const panel=bagianPanel();
  const grup=panel.indexOf('class="login-crest-row"');
  const judul=panel.indexOf('<h2>Masuk ke e-Rapor</h2>');
  assert.ok(grup>-1,'ada satu kelompok lambang di panel kanan');
  assert.ok(judul>grup,'kelompok lambang berada di atas judul');
  let posisi=grup;
  for(const [src,nama] of LOGO){
    const kini=panel.indexOf(src,grup);
    assert.ok(kini>-1,`memakai berkas ${src}`);
    assert.ok(kini>posisi,`${nama} berada pada urutan yang benar`);
    assert.ok(kini<judul,`${nama} berada sebelum judul`);
    posisi=kini;
  }
  /* Setiap lambang punya teks alternatif dan tidak ada gambar yang ditanam di kode. */
  for(const [,nama] of LOGO)
    if(nama)assert.match(panel,new RegExp(`alt="Logo ${nama}"`),`${nama} punya teks alternatif`);
  assert.match(panel,/alt="\$\{escapeHtml\(crestAlt\)\}"/,'logo sekolah punya teks alternatif dinamis');
  assert.doesNotMatch(panel,/data:image\/(png|jpe?g|webp);base64/,'lambang diambil dari berkas aset, bukan base64');
});

test('Kelompok lambang rapat dan center, tidak melebar mengikuti panel',()=>{
  const grup=rule('.login-crest-row');
  assert.match(grup,/display:flex/,'memakai flex');
  assert.match(grup,/justify-content:center/,'kelompok berada di tengah');
  assert.match(grup,/align-items:center/,'ketiganya sejajar vertikal');
  const jarak=grup.match(/gap:(\d+)px/);
  assert.ok(jarak,'jarak antarlambang ditetapkan');
  assert.ok(Number(jarak[1])>=8&&Number(jarak[1])<=10,`jarak antarlambang ${jarak[1]}px berada pada 8-10px`);
  /* Tata letak yang membuat lambang saling berjauhan tidak boleh dipakai. */
  for(const larangan of ['space-between','space-around','space-evenly','width:100%'])
    assert.equal(grup.includes(larangan),false,`${larangan} tidak dipakai pada kelompok lambang`);
});

test('Ukuran lambang kecil dan proporsional, tidak membesar di layar lebar',()=>{
  const logo=rule('.login-crest');
  const tinggi=logo.match(/height:(\d+)px/);
  assert.ok(tinggi,'tinggi lambang ditetapkan');
  assert.ok(Number(tinggi[1])>=42&&Number(tinggi[1])<=46,`tinggi desktop ${tinggi[1]}px berada pada 42-46px`);
  assert.match(logo,/object-fit:contain/,'rasio asli dijaga, tidak gepeng maupun terpotong');
  assert.match(logo,/width:auto/,'lebar mengikuti rasio masing-masing lambang');
  assert.match(logo,/flex:none/,'lambang tidak ikut melar oleh lebar panel');
  /* Ukuran tetap dalam piksel, sehingga layar besar tidak membuatnya membesar. */
  assert.doesNotMatch(logo,/height:(clamp|calc|[\d.]+(vw|vh|%))/,'tinggi tidak ikut ukuran layar');
  /* Lambang Kabupaten Bekasi menyimpan ruang kosong di dalam bingkainya, jadi kotaknya
     dibesarkan agar gambarnya tampak sebesar dua lambang lain. Ruang kosong itu ditarik
     kembali dengan margin negatif supaya jarak antarlambang tetap rapat. */
  const region=rule('.login-crest-region');
  const tinggiRegion=Number(region.match(/height:(\d+)px/)[1]);
  assert.ok(tinggiRegion>Number(tinggi[1]),'kotak lambang kabupaten dibesarkan agar seimbang');
  const margin=region.match(/margin:-(\d+)px -(\d+)px/);
  assert.ok(margin,'ruang kosong bingkai ditarik kembali dengan margin negatif');
  /* Tinggi tampak dan tinggi baris tetap setara dengan dua lambang lain. */
  const tampak=tinggiRegion*0.5664,tinggiBaris=tinggiRegion-2*Number(margin[1]);
  assert.ok(Math.abs(tampak-Number(tinggi[1])*0.97)<=4,`tinggi tampak ${tampak.toFixed(1)}px setara lambang lain`);
  assert.ok(Math.abs(tinggiBaris-Number(tinggi[1]))<=4,`tinggi baris ${tinggiBaris}px tidak melar`);

  /* Di ponsel lambang mengecil. Berkas gaya memuat beberapa blok @media dengan ambang yang
     sama, jadi seluruhnya ditelusuri. */
  const ponsel=[...css().matchAll(/@media\(max-width:767px\)\{\n([\s\S]*?)\n\}/g)]
    .map(blok=>blok[1].match(/\.login-crest\{[^}]*height:(\d+)px/))
    .filter(Boolean);
  assert.equal(ponsel.length,1,'lambang mengecil di ponsel, ditetapkan satu kali');
  assert.ok(Number(ponsel[0][1])<Number(tinggi[1]),`di ponsel ${ponsel[0][1]}px lebih kecil daripada ${tinggi[1]}px`);
});

test('Identitas pengembang tidak lagi berada di kolom kanan',()=>{
  const panel=bagianPanel();
  assert.equal(panel.includes('login-footer'),false,'footer kanan sudah dihapus');
  assert.equal(panel.includes('FAHMI DJAWAS, S.Pd.'),false,'nama pengembang tidak ada di panel kanan');
  assert.equal(panel.includes('Dirancang'),false,'baris Dirancang tidak ada di panel kanan');
  assert.equal(panel.includes('Semua Hak Dilindungi'),false,'hak cipta tidak ada di panel kanan');
  assert.doesNotMatch(css(),/\.login-footer\{/,'gaya footer kanan ikut dibersihkan');
  /* Nomor versi menjadi elemen terakhir panel kanan. */
  const versi=panel.indexOf('class="login-version"');
  assert.ok(versi>-1,'nomor versi tetap ada');
  assert.equal(panel.slice(versi).includes('<footer'),false,'tidak ada apa pun setelah nomor versi');
});

test('Identitas pengembang di kiri bawah tetap utuh',()=>{
  const source=login();
  const foto=source.slice(source.indexOf('<section class="login-photo">'),source.indexOf('<section class="login-panel">'));
  for(const teks of ['DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'])
    assert.ok(foto.includes(teks),`${teks} tetap di kolom foto`);
  assert.match(foto,/class="login-credit-name"/,'nama pengembang tetap jadi fokus di kiri bawah');
});

test('Sisa halaman Masuk tidak ikut berubah',()=>{
  const source=login(),t=css();
  const foto=source.slice(source.indexOf('<section class="login-photo">'),source.indexOf('<section class="login-panel">'));
  /* Kolom foto, header kiri, tagline, dan mekanisme latar yang dapat ditimpa tetap sama. */
  for(const teks of ['e-Rapor','schoolLabel.toUpperCase()','Cerdas • Berkarakter • Berprestasi','class="login-logo"'])
    assert.ok(foto.includes(teks),`${teks} tetap di kolom foto`);
  assert.equal((t.match(/login-background\.jpg/g)||[]).length,1,'berkas latar tetap disebut sekali');
  assert.match(t,/\.login-stage\{[^}]*grid-template-columns:1\.05fr \.95fr/,'tata letak dua kolom tetap');
  /* Seluruh kendali dan logika masuk tidak tersentuh. */
  for(const id of ['semester','username','password','loginForm','loginError','forgot','loginHelp'])
    assert.match(source,new RegExp(`id="${id}"`),`kontrol ${id} tetap ada`);
  for(const teks of ['Masuk ke e-Rapor','Pilih peran, semester, lalu masukkan akun Anda.','Admin','Guru / Wali Kelas','MASUK','Lupa Password?','Aktivasi Admin Pertama'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
  for(const fungsi of ['authenticate(','saveSession(','recoverAdmin','ensureSecurityBootstrap','getSecurityStatus'])
    assert.ok(source.includes(fungsi),`${fungsi} tidak diubah`);
});

test('Ketiga lambang sudah ikut disimpan service worker tanpa perubahan tambahan',()=>{
  const sw=read('sw.js');
  for(const berkas of ['logo-tut-wuri-handayani.png','logo-kabupaten-bekasi.png','app-icon.svg'])
    assert.match(sw,new RegExp(berkas.replace('.','\\.')),`${berkas} tersedia saat offline`);
});
