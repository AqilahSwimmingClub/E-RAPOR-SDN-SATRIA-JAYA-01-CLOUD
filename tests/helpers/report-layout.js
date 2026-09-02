/* Pembaca aturan tampilan rapor.

   Dipakai dua kali dengan cara yang sama: sekali atas berkas gaya baseline d093b99 untuk
   membuat fixture, dan sekali atas berkas gaya yang berlaku sekarang untuk membandingkannya.
   Karena keduanya melewati kode yang sama, perbedaan apa pun pada hasilnya berarti tampilan
   rapor memang berubah, bukan pembacanya yang berbeda. */

/* Selector yang menentukan tampilan lembar rapor. Halaman lain memakai kelas di luar daftar
   ini, sehingga penambahan gaya baru pada aplikasi tidak pernah mengubah hasil pembacaan. */
export const REPORT_SELECTOR_MARKS=Object.freeze([
  'report-a4','report-cover','report-learning-table','report-lower-grid',
  'document-a4','document-table','document-identity','document-signatures','document-heading',
  'document-section','document-box','document-foot','document-sheet','absence-document-table',
  'activity-table','activity-title','activity-no','activity-name','activity-predicate',
  'activity-note','subject-no-cell','subject-name-cell','subject-score-cell',
  'subject-description-cell','subject-group-row','response-box','print-footer',
]);

function stripComments(css){return css.replace(/\/\*[\s\S]*?\*\//g,'');}

/* Menelusuri berkas gaya sambil mengingat konteks at-rule yang sedang berlaku, supaya aturan
   layar dan aturan cetak tidak pernah tertukar. */
export function extractReportLayout(cssText){
  const css=stripComments(cssText);
  const hasil={};
  const konteks=[];
  let mulai=0;
  for(let i=0;i<css.length;i+=1){
    const ch=css[i];
    if(ch==='{'){
      const prelude=css.slice(mulai,i).trim();
      if(prelude.startsWith('@')){
        konteks.push(prelude.replace(/\s+/g,' '));
        mulai=i+1;continue;
      }
      /* Blok deklarasi biasa: cari kurung tutupnya. */
      const tutup=css.indexOf('}',i);
      const body=css.slice(i+1,tutup).trim().replace(/\s+/g,' ');
      const scope=konteks.join(' ');
      for(const selector of prelude.split(',').map(item=>item.trim()).filter(Boolean)){
        if(!REPORT_SELECTOR_MARKS.some(mark=>selector.includes(mark)))continue;
        const kunci=scope?`${scope} :: ${selector}`:selector;
        hasil[kunci]=hasil[kunci]?`${hasil[kunci]} ${body}`:body;
      }
      i=tutup;mulai=i+1;continue;
    }
    if(ch==='}'){konteks.pop();mulai=i+1;}
  }
  /* Aturan @page menentukan ukuran kertas cetak, jadi ikut dikunci apa adanya. */
  hasil['@page']=[...css.matchAll(/@page\s*\{([^{}]*)\}/g)].map(item=>item[1].trim().replace(/\s+/g,' ')).join(' | ');
  return hasil;
}
