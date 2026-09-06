import { newId } from './crypto.js';
import { nowIso } from './db.js';
import { isUniqueViolation } from './store.js';
import { LicenseError, ensureCustomer, logEvent } from './licenses.js';

/* PESANAN LISENSI.

   Pesanan adalah catatan permintaan pembelian, BUKAN lisensi. Ia dibuat oleh Web Pembelian
   tanpa sesi apa pun, lalu diperiksa Pemilik di Owner Panel. Lisensi baru terbit sesudah
   Pemilik menekan Buat Lisensi, tidak pernah otomatis.

   Tiga hal yang dijaga modul ini:

   1. PESANAN TERSIMPAN LEBIH DULU. WhatsApp hanyalah pemberitahuan; bila pesannya tidak
      pernah terkirim, pesanannya tetap ada di server dan tidak hilang.
   2. NPSN BUKAN IDENTITAS TRANSAKSI. Satu sekolah boleh memesan berkali-kali - untuk
      perangkat kedua, untuk tahun berikutnya, atau karena pesanan sebelumnya batal.
      Identitas transaksi adalah Order ID, dan hanya Order ID.
   3. TIDAK ADA RAHASIA YANG KELUAR. Jawaban untuk pemesan hanya memuat Order ID, status,
      dan data yang ia ketikkan sendiri. License Key tidak pernah ikut. */

export const ORDER_STATUS=Object.freeze(['BARU','MENUNGGU_PEMBAYARAN','DIVERIFIKASI','LISENSI_DITERBITKAN','DIBATALKAN']);
export const PAYMENT_STATUS=Object.freeze(['BELUM_BAYAR','MENUNGGU_KONFIRMASI','LUNAS','DIBATALKAN']);
export const PAYMENT_METHODS=Object.freeze(['qris','gopay','mandiri','belum-dipilih']);

function bersih(nilai,batas=200){return String(nilai??'').replace(/\s+/g,' ').trim().slice(0,batas);}

/* Nomor Indonesia dinormalkan ke bentuk internasional tanpa tanda plus, sama persis dengan
   aturan di halaman pembelian, sehingga nomor yang sama tidak tersimpan dalam dua bentuk. */
export function normalizeWhatsapp(nilai){
  const angka=String(nilai??'').replace(/[^\d+]/g,'').replace(/(?!^)\+/g,'').replace(/^\+/,'');
  if(!angka)return '';
  let hasil=angka;
  if(hasil.startsWith('0'))hasil=`62${hasil.slice(1)}`;
  else if(hasil.startsWith('8'))hasil=`62${hasil}`;
  return /^62\d{8,13}$/.test(hasil)?hasil:'';
}

/* ORD-YYYYMMDD-NNNNNN. Bagian tanggal memakai waktu setempat WIB supaya nomor pesanan yang
   dilihat pembeli dan Pemilik sama dengan tanggal yang mereka baca di layar. */
export function formatOrderCode(tanggal,nomor){
  const wib=new Date(new Date(tanggal).getTime()+7*3600_000);
  const hari=[wib.getUTCFullYear(),String(wib.getUTCMonth()+1).padStart(2,'0'),String(wib.getUTCDate()).padStart(2,'0')].join('');
  return `ORD-${hari}-${String(nomor).padStart(6,'0')}`;
}

export function orderCodePrefix(tanggal){return formatOrderCode(tanggal,0).slice(0,13);}

function periksaWajib(input){
  const nilai={
    schoolName:bersih(input?.schoolName,120),
    npsn:String(input?.npsn??'').replace(/\D/g,'').slice(0,8),
    contactName:bersih(input?.contactName,120),
    whatsapp:normalizeWhatsapp(input?.whatsapp),
    email:bersih(input?.email,120),
    city:bersih(input?.city,80),
    province:bersih(input?.province,80),
    paymentMethod:bersih(input?.paymentMethod,30).toLowerCase()||'belum-dipilih',
    message:bersih(input?.message,1000),
  };
  const kurang=[];
  if(!nilai.schoolName)kurang.push('Nama Sekolah');
  if(!/^\d{8}$/.test(nilai.npsn))kurang.push('NPSN 8 digit');
  if(!nilai.contactName)kurang.push('Nama Pemesan');
  if(!nilai.whatsapp)kurang.push('Nomor WhatsApp');
  if(!nilai.city)kurang.push('Kabupaten/Kota');
  if(!nilai.province)kurang.push('Provinsi');
  if(kurang.length)
    throw new LicenseError('PESANAN_TIDAK_LENGKAP',`Lengkapi data pemesanan: ${kurang.join(', ')}.`,400);
  if(nilai.email&&!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(nilai.email))
    throw new LicenseError('EMAIL_TIDAK_VALID','Format email belum benar.',400);
  if(!PAYMENT_METHODS.includes(nilai.paymentMethod))nilai.paymentMethod='belum-dipilih';
  return nilai;
}

/* Kolom yang boleh dilihat pemesan. Catatan internal Pemilik dan tautan lisensi TIDAK ikut. */
export function ringkasUntukPemesan(row){
  if(!row)return null;
  return {
    order_code:row.order_code,status:row.status,payment_status:row.payment_status,
    payment_method:row.payment_method,school_name:row.school_name,npsn:row.npsn,
    contact_name:row.contact_name,created_at:row.created_at,
  };
}

/* Penjaga kiriman ganda. Tombol yang tertekan dua kali, atau jaringan yang mengulang
   permintaan yang sama, tidak boleh melahirkan dua pesanan. Browser mengirim client_ref yang
   sama untuk satu isian formulir; UNIQUE INDEX pada kolom itulah yang menegakkannya, bukan
   pemeriksaan berurutan yang dapat dilewati dua permintaan bersamaan. */
async function pesananDenganRef(store,ref){
  if(!ref)return null;
  return store.one('SELECT * FROM license_orders WHERE client_ref=$1',[ref]);
}

export async function createOrder(store,input={}){
  const nilai=periksaWajib(input);
  const ref=bersih(input?.clientRef,80)||null;
  const sudahAda=await pesananDenganRef(store,ref);
  if(sudahAda)return {order:sudahAda,duplicate:true};

  const waktu=nowIso();
  /* Nomor urut harian dihitung dari pesanan hari itu. Bila dua pesanan datang bersamaan dan
     memperoleh nomor yang sama, UNIQUE pada order_code menolak yang kedua dan percobaan
     berikutnya mengambil nomor sesudahnya. */
  const awalan=orderCodePrefix(waktu);
  const hitung=await store.one('SELECT COUNT(*) AS jumlah FROM license_orders WHERE order_code LIKE $1',[`${awalan}%`]);
  let nomor=Number(hitung?.jumlah||0)+1;
  for(let percobaan=0;percobaan<25;percobaan++,nomor++){
    const id=newId('ord');
    const kode=formatOrderCode(waktu,nomor);
    try{
      await store.run(`INSERT INTO license_orders(id,order_code,school_name,npsn,contact_name,whatsapp,email,
          city,province,payment_method,status,payment_status,message,client_ref,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BARU','BELUM_BAYAR',$11,$12,$13,$13)`,
        [id,kode,nilai.schoolName,nilai.npsn,nilai.contactName,nilai.whatsapp,nilai.email||null,
         nilai.city,nilai.province,nilai.paymentMethod,nilai.message||null,ref,waktu]);
      await logEvent(store,{type:'ORDER_CREATED',actor:'web-pembelian',detail:{order_code:kode,npsn:nilai.npsn}});
      return {order:await store.one('SELECT * FROM license_orders WHERE id=$1',[id]),duplicate:false};
    }catch(error){
      if(!isUniqueViolation(error))throw error;
      /* client_ref yang bentrok berarti permintaan kembar benar-benar datang bersamaan:
         yang kalah mengembalikan pesanan yang sudah tersimpan, bukan galat. */
      const kembar=await pesananDenganRef(store,ref);
      if(kembar)return {order:kembar,duplicate:true};
    }
  }
  throw new LicenseError('ORDER_GAGAL','Gagal membuat Order ID. Coba lagi beberapa saat lagi.',500);
}

export async function listOrders(store,{q='',status='',paymentStatus='',limit=200}={}){
  const syarat=[];const nilai=[];
  const cari=bersih(q,80);
  if(cari){
    nilai.push(`%${cari.toLowerCase()}%`);
    const p=`$${nilai.length}`;
    syarat.push(`(LOWER(order_code) LIKE ${p} OR LOWER(school_name) LIKE ${p} OR npsn LIKE ${p}
      OR LOWER(contact_name) LIKE ${p} OR whatsapp LIKE ${p})`);
  }
  const st=bersih(status,40).toUpperCase();
  if(st&&ORDER_STATUS.includes(st)){nilai.push(st);syarat.push(`status=$${nilai.length}`);}
  const bayar=bersih(paymentStatus,40).toUpperCase();
  if(bayar&&PAYMENT_STATUS.includes(bayar)){nilai.push(bayar);syarat.push(`payment_status=$${nilai.length}`);}
  nilai.push(Math.min(Math.max(Number.parseInt(limit,10)||200,1),500));
  const hasil=await store.query(`SELECT * FROM license_orders
    ${syarat.length?`WHERE ${syarat.join(' AND ')}`:''}
    ORDER BY created_at DESC, order_code DESC LIMIT $${nilai.length}`,nilai);
  return hasil.rows;
}

export async function orderDetail(store,id){
  const pesanan=await store.one('SELECT * FROM license_orders WHERE id=$1 OR order_code=$1',[id]);
  if(!pesanan)throw new LicenseError('ORDER_NOT_FOUND','Pesanan tidak ditemukan.',404);
  const lisensi=pesanan.license_id
    ? await store.one('SELECT id,license_hint,status,license_type,school_name,npsn,created_at FROM licenses WHERE id=$1',[pesanan.license_id])
    : null;
  return {order:pesanan,license:lisensi};
}

export async function ringkasanPesanan(store){
  const baris=await store.query('SELECT status, COUNT(*) AS jumlah FROM license_orders GROUP BY status');
  const per=Object.fromEntries(ORDER_STATUS.map(nama=>[nama,0]));
  let total=0;
  for(const item of baris.rows){per[item.status]=Number(item.jumlah)||0;total+=Number(item.jumlah)||0;}
  return {total,per_status:per};
}

/* Perubahan status pesanan selalu lewat satu pintu supaya setiap perubahan tercatat dan
   tidak ada jalan pintas yang melewatkan jejaknya. */
export async function setOrderStatus(store,id,{status=null,paymentStatus=null,notes=null,actor='owner',reason=''}={}){
  const {order}=await orderDetail(store,id);
  const statusBaru=status?bersih(status,40).toUpperCase():order.status;
  const bayarBaru=paymentStatus?bersih(paymentStatus,40).toUpperCase():order.payment_status;
  if(!ORDER_STATUS.includes(statusBaru))throw new LicenseError('STATUS_TIDAK_DIKENAL','Status pesanan tidak dikenal.',400);
  if(!PAYMENT_STATUS.includes(bayarBaru))throw new LicenseError('STATUS_BAYAR_TIDAK_DIKENAL','Status pembayaran tidak dikenal.',400);
  /* Pesanan yang lisensinya sudah terbit tidak boleh dimundurkan diam-diam: lisensinya sudah
     ada di tangan pembeli, jadi status pesanan tidak lagi menggambarkan apa pun bila diubah. */
  if(order.status==='LISENSI_DITERBITKAN'&&statusBaru!=='LISENSI_DITERBITKAN')
    throw new LicenseError('ORDER_TERKUNCI','Pesanan yang lisensinya sudah terbit tidak dapat diubah statusnya.',409);
  const catatan=notes===null?order.notes:bersih(notes,1000);
  await store.run('UPDATE license_orders SET status=$1,payment_status=$2,notes=$3,updated_at=$4 WHERE id=$5',
    [statusBaru,bayarBaru,catatan||null,nowIso(),order.id]);
  await logEvent(store,{licenseId:order.license_id||null,type:'ORDER_UPDATED',actor,
    detail:{order_code:order.order_code,status:statusBaru,payment_status:bayarBaru,reason:bersih(reason,200)}});
  return (await orderDetail(store,order.id)).order;
}

/* BUAT LISENSI DARI PESANAN.

   Lisensi dibuat memakai jalur yang sama dengan pembuatan manual di Owner Panel, sehingga
   aturan identitas, dedup customer, dan pencatatan peristiwanya identik. Yang ditambahkan di
   sini hanyalah hubungan dua arah: pesanan menunjuk lisensinya, dan lisensi menunjuk pesanannya.

   Satu pesanan hanya boleh melahirkan satu lisensi. Menekan tombolnya dua kali mengembalikan
   galat, bukan lisensi kedua. */
export async function issueLicenseForOrder(store,id,{actor='owner',notes='',createLicenses}={},secrets){
  const {order}=await orderDetail(store,id);
  if(order.license_id)throw new LicenseError('ORDER_SUDAH_BERLISENSI','Pesanan ini sudah memiliki lisensi.',409);
  if(order.status==='DIBATALKAN')throw new LicenseError('ORDER_DIBATALKAN','Pesanan yang dibatalkan tidak dapat diterbitkan lisensinya.',409);

  const customer=await ensureCustomer(store,{name:order.school_name,npsn:order.npsn,contact:order.whatsapp,actor});
  const dibuat=await createLicenses(store,{count:1,customerId:customer?.id||null,buyerName:order.contact_name,
    schoolName:order.school_name,npsn:order.npsn,licenseType:'CUSTOMER',
    notes:bersih(notes,400)||`Dari pesanan ${order.order_code}`,actor,recoverySecret:secrets});
  const lisensi=dibuat[0];
  await store.run('UPDATE license_orders SET license_id=$1,status=$2,payment_status=$3,updated_at=$4 WHERE id=$5',
    [lisensi.id,'LISENSI_DITERBITKAN',order.payment_status==='LUNAS'?'LUNAS':order.payment_status,nowIso(),order.id]);
  await logEvent(store,{licenseId:lisensi.id,type:'ORDER_LICENSE_ISSUED',actor,
    detail:{order_code:order.order_code,hint:lisensi.hint}});
  return {order:(await orderDetail(store,order.id)).order,license:lisensi};
}
