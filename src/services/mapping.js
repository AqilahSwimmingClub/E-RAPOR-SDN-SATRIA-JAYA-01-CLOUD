function copyMapping(mapping){ return mapping.map(item=>({...item})); }

/* MAPPING MATA PELAJARAN 1.3.2 - SATU DAFTAR, SATU URUTAN.

   Sampai 1.3.1 mapel dibagi menjadi Kelompok A dan Kelompok B, dan nomor urutnya dihitung
   ULANG DI DALAM tiap kelompok. Akibatnya `order` tidak pernah menjadi urutan yang sebenarnya:
   ada dua mapel bernomor 1, dua bernomor 2, dan seterusnya. Setiap halaman yang ingin
   menampilkan daftar mapel karena itu terpaksa mengurutkan `group` lebih dulu, baru `order` -
   sebuah aturan tersembunyi yang mudah terlewat dan sudah beberapa kali membuat urutan
   Rapor berbeda dari urutan Mapping.

   Sekarang urutannya TUNGGAL: 1..N untuk seluruh mapel, dan `order` itulah satu-satunya
   sumber kebenaran urutan di mana pun mapel ditampilkan.

   FIELD `group` TIDAK DIHAPUS dari data. Ia tetap ikut tersimpan apa adanya supaya berkas
   backup lama, mapping lama, dan penugasan Guru lama tetap terbaca. Yang berubah: `group`
   tidak pernah lagi menentukan urutan maupun tampilan. */

/* Urutan legacy dipakai SEKALI SAJA, saat mapping lama pertama kali dibaca. Sesudah itu
   nomor urut sudah tunggal dan kelompok tidak lagi ikut menentukan apa pun - kalau tidak,
   memindahkan mapel Kelompok B ke atas mapel Kelompok A akan selalu terlempar balik. */
const URUTAN_LEGACY={A:0,B:1};

/* Mapping yang SUDAH bernomor tunggal dikenali dari nomornya sendiri: bilangan bulat >= 1
   dan tidak ada yang kembar. Mapping lama selalu gagal syarat ini karena tiap kelompok
   memulai penomoran dari 1, sehingga nomornya pasti kembar. */
function sudahSatuUrutan(daftar){
  if(!daftar.length)return true;
  const nomor=daftar.map(item=>Number(item.order));
  if(nomor.some(angka=>!Number.isInteger(angka)||angka<1))return false;
  return new Set(nomor).size===nomor.length;
}

export function normalizeMappingOrder(mapping){
  if(!Array.isArray(mapping))return [];
  const next=copyMapping(mapping).map((item,index)=>({...item,_index:index}));
  const tunggal=sudahSatuUrutan(next);
  next.sort((a,b)=>{
    /* Data lama: kelompok dipakai sekali supaya urutan yang selama ini dilihat guru tidak
       berubah saat dipindahkan ke penomoran tunggal. Data baru: nomornya sudah benar. */
    if(!tunggal){
      const kelompok=(URUTAN_LEGACY[a.group]??1)-(URUTAN_LEGACY[b.group]??1);
      if(kelompok)return kelompok;
    }
    const nomor=(Number(a.order)||Number.MAX_SAFE_INTEGER)-(Number(b.order)||Number.MAX_SAFE_INTEGER);
    return nomor||a._index-b._index;
  });
  return next.map((item,index)=>{
    const {_index,...record}=item;
    return {...record,order:index+1};
  });
}

/* Nama lama dipertahankan sebagai alias supaya seluruh pemanggil yang sudah ada - storage,
   migrations, seed - tidak perlu diubah serentak, dan berkas backup lama tetap terbaca. */
export const normalizeMappingGroups=normalizeMappingOrder;

export function canReorderSubject(mapping,id,direction){
  if(!Array.isArray(mapping)||![-1,1].includes(direction))return false;
  const index=mapping.findIndex(item=>item.id===id);
  if(index<0)return false;
  const tujuan=index+direction;
  return tujuan>=0&&tujuan<mapping.length;
}

export function reorderSubject(mapping,id,direction){
  const next=normalizeMappingOrder(mapping);
  if(!canReorderSubject(next,id,direction))return next;
  const index=next.findIndex(item=>item.id===id);
  const tujuan=index+direction;
  [next[index],next[tujuan]]=[next[tujuan],next[index]];
  return normalizeMappingOrder(next.map((item,posisi)=>({...item,order:posisi+1})));
}

export const canReorderWithinGroup=canReorderSubject;
export const reorderWithinGroup=reorderSubject;

/* Dipertahankan untuk data dan test lama yang masih menyimpan kelompok. Ia hanya mengganti
   label kelompok pada catatannya; urutan daftar TIDAK ikut berubah, karena kelompok memang
   bukan lagi penentu urutan. */
export function moveSubjectToGroup(mapping,id,targetGroup){
  if(!['A','B'].includes(targetGroup))throw new Error('Kelompok mata pelajaran harus A atau B.');
  const next=normalizeMappingOrder(mapping);
  const item=next.find(subject=>subject.id===id);
  if(!item)throw new Error('Mata pelajaran tidak ditemukan pada Mapping.');
  item.group=targetGroup;
  item.groupLabel=targetGroup==='A'?'Kelompok Mata Pelajaran Wajib':'Kelompok Mata Pelajaran Pilihan';
  return next;
}
