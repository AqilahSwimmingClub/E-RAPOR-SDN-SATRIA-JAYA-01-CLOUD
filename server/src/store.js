/* Lapisan penyimpanan lisensi.

   Aturan komersial ditulis satu kali di licenses.js dan berjalan di atas adapter ini, sehingga
   PostgreSQL (Neon di produksi) dan SQLite (pengembangan lokal) memakai logika yang sama persis
   dan tidak mungkin berbeda perilaku.

   SQL ditulis dalam gaya PostgreSQL memakai penanda $1, $2, ... Adapter SQLite menerjemahkannya
   menjadi ? sesuai urutan. Kolom boolean dinormalkan menjadi true/false pada kedua adapter
   supaya pemanggil tidak perlu tahu ia sedang bicara dengan database yang mana. */

const BOOLEAN_COLUMNS=new Set(['is_active','active']);

function normalizeRow(row){
  if(!row||typeof row!=='object')return row;
  const hasil={...row};
  for(const kolom of BOOLEAN_COLUMNS)
    if(kolom in hasil&&hasil[kolom]!==null&&hasil[kolom]!==undefined)hasil[kolom]=Boolean(hasil[kolom]);
  return hasil;
}

/* $1 diterjemahkan ke ? sesuai urutan kemunculan. Penanda yang sama dipakai ulang akan
   menghasilkan parameter yang diulang pula, sehingga urutan tetap benar. */
function toSqlite(sql,params){
  const urutan=[];
  /* undefined bukan nilai SQL. Driver PostgreSQL memperlakukannya sebagai NULL, jadi adapter
     SQLite disamakan supaya kedua database berperilaku identik. */
  const nilai=value=>value===undefined?null:(typeof value==='boolean'?(value?1:0):value);
  const terjemah=sql.replace(/\$(\d+)/g,(_,nomor)=>{urutan.push(nilai(params[Number(nomor)-1]));return '?';});
  return {sql:terjemah,params:urutan};
}

/* --------------------------------------------------------------------------- SQLite */

export function createSqliteStore(db){
  const jalankan=(sql,params=[],mode='all')=>{
    const kueri=toSqlite(sql,params);
    const statement=db.prepare(kueri.sql);
    if(mode==='run')return {rows:[],rowCount:statement.run(...kueri.params).changes};
    const rows=statement.all(...kueri.params).map(normalizeRow);
    return {rows,rowCount:rows.length};
  };
  return {
    dialect:'sqlite',
    raw:db,
    async query(sql,params){return jalankan(sql,params,'all');},
    async run(sql,params){return jalankan(sql,params,'run');},
    async one(sql,params){return jalankan(sql,params,'all').rows[0]??null;},
    /* SQLite memakai satu koneksi, jadi transaksi dijalankan langsung di koneksi itu. */
    async transaction(fn){
      db.exec('BEGIN IMMEDIATE');
      try{const hasil=await fn(this);db.exec('COMMIT');return hasil;}
      catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    },
    async close(){db.close();},
  };
}

/* ----------------------------------------------------------------------- PostgreSQL */

/* Menerima klien apa pun yang punya query(sql, params) dan mengembalikan {rows}: node-postgres
   maupun PGlite. Tidak ada koneksi global yang disimpan, sehingga adapter ini aman dipakai di
   Vercel Functions yang setiap permintaannya berdiri sendiri. */
export function createPostgresStore({client,connectionString=process.env.DATABASE_URL}={}){
  if(!client&&!connectionString)
    throw new Error('DATABASE_URL belum diisi. Isi environment tersebut pada Vercel/Neon.');
  let aktif=client||null;
  let milikSendiri=false;

  async function klien(){
    if(aktif)return aktif;
    const { default:pg }=await import('pg');
    aktif=new pg.Client({connectionString,ssl:sslDari(connectionString)});
    await aktif.connect();
    milikSendiri=true;
    return aktif;
  }

  const bungkus=async(sql,params=[])=>{
    const hasil=await (await klien()).query(sql,params);
    return {rows:(hasil.rows||[]).map(normalizeRow),rowCount:hasil.rowCount??(hasil.rows||[]).length};
  };

  const store={
    dialect:'postgres',
    async query(sql,params){return bungkus(sql,params);},
    async run(sql,params){return bungkus(sql,params);},
    async one(sql,params){return (await bungkus(sql,params)).rows[0]??null;},
    /* Serialisasi dipakai supaya dua aktivasi bersamaan tidak dapat sama-sama lolos; yang
       kalah menerima kegagalan constraint atau konflik serialisasi, bukan aktivasi kedua. */
    async transaction(fn){
      await bungkus('BEGIN');
      try{const hasil=await fn(store);await bungkus('COMMIT');return hasil;}
      catch(error){try{await bungkus('ROLLBACK');}catch{}throw error;}
    },
    async close(){if(aktif&&milikSendiri){await aktif.end();aktif=null;milikSendiri=false;}},
  };
  return store;
}

/* Neon selalu menuntut TLS; hanya server lokal tanpa sslmode yang dibiarkan polos. */
function sslDari(connectionString){
  const teks=String(connectionString||'');
  if(/sslmode=disable/.test(teks))return false;
  if(/localhost|127\.0\.0\.1/.test(teks)&&!/sslmode=require/.test(teks))return false;
  return {rejectUnauthorized:true};
}

/* Kegagalan unique constraint dikenali sama pada kedua database. */
export function isUniqueViolation(error,indexName=''){
  const pesan=String(error?.message||'');
  const kode=String(error?.code||'');
  if(kode==='23505')return !indexName||pesan.includes(indexName)||String(error?.constraint||'')===indexName;
  return /UNIQUE constraint failed/i.test(pesan)&&(!indexName||pesan.includes(indexName.replace('ux_one_active_device','device_activations.license_id')));
}
