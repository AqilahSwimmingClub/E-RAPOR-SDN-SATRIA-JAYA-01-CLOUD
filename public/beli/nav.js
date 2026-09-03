/* Aturan penentuan menu navigasi yang sedang aktif, tanpa satu pun sentuhan DOM.

   Dipisahkan supaya aturannya dapat diuji apa adanya di Node, bukan hanya lewat browser:
   bagian aktif adalah bagian TERAKHIR yang batas atasnya sudah melewati garis baca di bawah
   navbar. Cara ini pasti dan tidak bergantung pada tinggi bagian, sehingga bagian Tutorial
   yang jauh lebih tinggi daripada layar tetap dihitung benar. */

/* posisi: [{id, top}] dengan top relatif terhadap layar, seperti getBoundingClientRect().top.
   Bila halaman sudah menyentuh dasar, bagian terakhir dianggap aktif meski batas atasnya belum
   terlewati — jika tidak, bagian penutup yang pendek tidak akan pernah bisa aktif. */
export function activeSectionId(posisi,{line=0,atBottom=false}={}){
  const daftar=(posisi||[]).filter(item=>item&&typeof item.id==='string');
  if(!daftar.length)return '';
  if(atBottom)return daftar[daftar.length-1].id;
  let terpilih=daftar[0].id;
  for(const bagian of daftar){
    if(Number(bagian.top)-line<=0)terpilih=bagian.id;
  }
  return terpilih;
}
