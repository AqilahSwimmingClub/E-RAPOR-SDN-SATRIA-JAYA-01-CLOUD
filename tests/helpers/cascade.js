/* PENYELESAI CASCADE SEDERHANA UNTUK SEL TABEL RAPOR.

   Test yang hanya memastikan sebuah deklarasi ADA di berkas CSS tidak cukup, dan justru
   itulah kelas bug yang membuat nama mata pelajaran menempel ke atas: deklarasinya memang
   tidak ada, tetapi yang MENANG adalah aturan lain yang kekhususannya lebih tinggi
   (.document-table td, 0-1-1) daripada aturan yang dikira mengaturnya (.subject-name-cell,
   0-1-0).

   Modul ini menghitung pemenang sebenarnya untuk satu elemen, memakai aturan CSS yang
   sesungguhnya: !important menang lebih dulu, lalu kekhususan, lalu urutan kemunculan.
   Blok @media print dan @media lain ikut dibaca supaya penimpaan khusus cetak tidak lolos. */

/* Kekhususan satu selektor sederhana: [id, kelas/atribut/pseudo-kelas, elemen/pseudo-elemen]. */
export function specificity(selector){
  const bersih=selector.trim();
  const id=(bersih.match(/#[\w-]+/g)||[]).length;
  const kelas=(bersih.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)(?!not\b)[\w-]+(?:\([^)]*\))?/g)||[]).length;
  const elemen=(bersih.replace(/\.[\w-]+|#[\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?/g,' ')
    .match(/[a-z][\w-]*/gi)||[]).length;
  return [id,kelas,elemen];
}
const lebihTinggi=(a,b)=>a[0]!==b[0]?a[0]>b[0]:a[1]!==b[1]?a[1]>b[1]:a[2]>b[2];

/* Apakah selektor ini cocok untuk elemen yang digambarkan `konteks`?
   `konteks.kelas` = kelas pada elemen itu sendiri; `konteks.tag` = nama tag;
   `konteks.leluhur` = kumpulan kelas yang ada pada leluhurnya. Dukungan sengaja dibatasi pada
   bentuk yang benar-benar dipakai lembar rapor: keturunan (spasi) dan :nth-child. */
function cocok(selector,konteks){
  const bagian=selector.trim().split(/\s+/);
  const terakhir=bagian[bagian.length-1];
  if(!cocokSederhana(terakhir,konteks))return false;
  /* Seluruh bagian di depannya harus ada pada leluhur, berurutan dari kanan ke kiri. */
  let sisa=bagian.slice(0,-1);
  for(const potongan of sisa){
    const kelas=(potongan.match(/\.[\w-]+/g)||[]).map(x=>x.slice(1));
    const tag=potongan.replace(/[.#[][^.#[]*/g,'');
    if(kelas.length&&!kelas.every(k=>konteks.leluhur.includes(k)))return false;
    if(tag&&!konteks.leluhurTag?.includes(tag))return false;
  }
  return true;
}
function cocokSederhana(potongan,konteks){
  const kelas=(potongan.match(/\.[\w-]+/g)||[]).map(x=>x.slice(1));
  if(!kelas.every(k=>konteks.kelas.includes(k)))return false;
  const nth=potongan.match(/:nth-child\((\d+)\)/);
  if(nth&&Number(nth[1])!==konteks.nthChild)return false;
  const pseudoLain=potongan.match(/:(first-child|last-child)/);
  if(pseudoLain){
    if(pseudoLain[1]==='first-child'&&konteks.nthChild!==1)return false;
    if(pseudoLain[1]==='last-child'&&!konteks.lastChild)return false;
  }
  const tag=potongan.replace(/[.:#[][^.:#[]*/g,'');
  if(tag&&tag!==konteks.tag)return false;
  return true;
}

/* Komentar dibuang lebih dulu supaya kurung kurawal di dalamnya tidak dikira awal blok. */
const buangKomentar=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');

/* Membaca seluruh aturan CSS termasuk yang berada di dalam @media. */
function bacaAturan(cssTextMentah){
  const cssText=buangKomentar(cssTextMentah);
  const aturan=[];
  let urutan=0;
  const telusuri=(teks,media)=>{
    const re=/([^{}]+)\{([^{}]*)\}/g;
    let m;
    while((m=re.exec(teks))){
      const selektor=m[1].trim();
      if(selektor.startsWith('@'))continue;
      for(const satu of selektor.split(','))
        aturan.push({selektor:satu.trim(),deklarasi:m[2],urutan:urutan++,media});
    }
  };
  /* Blok @media dipisahkan lebih dulu supaya isinya tidak tertelan regex di atas. */
  const media=/@media([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g;
  let m,tanpaMedia=cssText;
  const potongan=[];
  while((m=media.exec(cssText)))potongan.push({query:m[1].trim(),isi:m[2]});
  tanpaMedia=cssText.replace(media,'');
  telusuri(tanpaMedia,null);
  for(const p of potongan)telusuri(p.isi,p.query);
  return aturan;
}

/* Nilai properti yang MENANG untuk elemen `konteks`.
   `mediaAktif` menyaring blok @media: null = hanya aturan tanpa media (layar biasa),
   fungsi = penyaring sendiri, misalnya untuk menyertakan blok print. */
export function nilaiMenang(cssText,konteks,properti,{mediaAktif=null}={}){
  const semua=bacaAturan(cssText).filter(a=>a.media===null||(mediaAktif&&mediaAktif(a.media)));
  let juara=null;
  for(const a of semua){
    if(!cocok(a.selektor,konteks))continue;
    const cocokProp=new RegExp(`(?:^|;)\\s*${properti}\\s*:\\s*([^;!]+)(\\s*!important)?`,'i').exec(a.deklarasi);
    if(!cocokProp)continue;
    const kandidat={nilai:cocokProp[1].trim(),penting:Boolean(cocokProp[2]),
      khusus:specificity(a.selektor),urutan:a.urutan,selektor:a.selektor};
    if(!juara){juara=kandidat;continue;}
    if(kandidat.penting!==juara.penting){if(kandidat.penting)juara=kandidat;continue;}
    if(lebihTinggi(kandidat.khusus,juara.khusus)){juara=kandidat;continue;}
    if(!lebihTinggi(juara.khusus,kandidat.khusus)&&kandidat.urutan>juara.urutan)juara=kandidat;
  }
  return juara;
}
