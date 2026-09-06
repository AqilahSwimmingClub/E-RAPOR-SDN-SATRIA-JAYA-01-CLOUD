/* Perantara halaman pembelian dengan server pesanan.

   Modul ini TIDAK menyentuh DOM dan TIDAK menyimpan apa pun; fetch disuntikkan sehingga
   seluruh perilakunya - termasuk jaringan yang gagal - dapat diuji di Node tanpa browser.

   Alamatnya RELATIF terhadap origin halaman. Halaman pembelian dan API dilayani oleh
   deployment yang sama - vercel.json menulis ulang /beli dan /api/v1/* pada proyek yang sama -
   sehingga alamat relatif selalu menunjuk ke server yang benar tanpa perlu menanam nama
   domain di sini. Parameter base tetap disediakan supaya perilakunya dapat diuji.

   Tidak ada satu pun credential di sini: tidak ada token Owner, tidak ada API secret, dan
   tidak ada password. Endpoint pesanan memang publik dan hanya bisa MEMBUAT pesanan - ia
   tidak dapat membaca daftar pesanan, tidak dapat membuat lisensi, dan tidak dapat mengubah
   lisensi mana pun. */

export function apiUrl(path,base=''){
  const alamat=String(base||'').replace(/\/+$/,'');
  return `${alamat}${path}`;
}

/* Pesan galat yang ditampilkan ke pembeli. Kode teknis server diterjemahkan menjadi kalimat
   yang dapat ditindaklanjuti; yang tidak dikenal ditampilkan apa adanya dari server, BUKAN
   disembunyikan seolah-olah pesanannya berhasil. */
export function orderErrorMessage(error){
  const kode=String(error?.code||'');
  if(kode==='RATE_LIMITED')return 'Terlalu banyak pemesanan dari jaringan ini. Tunggu beberapa menit lalu coba lagi.';
  if(kode==='PESANAN_TIDAK_LENGKAP'||kode==='EMAIL_TIDAK_VALID')return error.message;
  if(kode==='JARINGAN')return 'Pesanan belum tersimpan karena sambungan internet terputus. Periksa koneksi Anda lalu coba lagi.';
  return error?.message||'Pesanan belum tersimpan. Coba lagi beberapa saat lagi.';
}

class OrderError extends Error{
  constructor(code,message){super(message);this.code=code;}
}

/* Mengirim pesanan ke server. Mengembalikan {order,duplicate} apa adanya dari server.

   Kegagalan TIDAK PERNAH disembunyikan: halaman pemanggil harus tahu bahwa pesanannya belum
   tersimpan supaya ia tidak menampilkan Order ID karangan. */
export async function submitOrder(payload,{fetchImpl=globalThis.fetch,base='',timeoutMs=15000}={}){
  if(typeof fetchImpl!=='function')throw new OrderError('JARINGAN','Peramban ini tidak dapat mengirim pesanan.');
  const pembatal=typeof AbortController==='function'?new AbortController():null;
  const jam=pembatal?setTimeout(()=>pembatal.abort(),timeoutMs):null;
  let res;
  try{
    res=await fetchImpl(apiUrl('/api/v1/orders',base),{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(payload),signal:pembatal?.signal,
    });
  }catch{
    throw new OrderError('JARINGAN','Sambungan ke server pesanan gagal.');
  }finally{if(jam)clearTimeout(jam);}
  let data={};
  try{data=await res.json();}catch{data={};}
  if(!res.ok)throw new OrderError(data?.error?.code||'SERVER',data?.error?.message||'Server pesanan menolak permintaan.');
  if(!data?.order?.order_code)throw new OrderError('SERVER','Server tidak mengembalikan Order ID.');
  return data;
}

/* Katalog unduhan resmi. Kegagalannya TIDAK fatal: halaman tetap tampil, bagian unduhan
   sekadar menyatakan datanya belum dapat dimuat. */
export async function fetchDownloads({fetchImpl=globalThis.fetch,base='',timeoutMs=10000}={}){
  if(typeof fetchImpl!=='function')return null;
  const pembatal=typeof AbortController==='function'?new AbortController():null;
  const jam=pembatal?setTimeout(()=>pembatal.abort(),timeoutMs):null;
  try{
    const res=await fetchImpl(apiUrl('/api/v1/downloads',base),{signal:pembatal?.signal});
    if(!res.ok)return null;
    const data=await res.json();
    return Array.isArray(data?.downloads)?data.downloads:null;
  }catch{return null;}
  finally{if(jam)clearTimeout(jam);}
}
