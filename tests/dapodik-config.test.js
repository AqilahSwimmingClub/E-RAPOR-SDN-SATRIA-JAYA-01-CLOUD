import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createDapodikConfigStore }=require('../electron/dapodik-config.cjs');

/* Filesystem palsu di memori supaya test tidak pernah menulis ke disk nyata dan dapat
   memeriksa persis apa yang tersimpan pada setiap berkas. */
function createMemoryFs(){
  const files=new Map(),dirs=new Set();
  const fs={
    mkdirSync:(dir)=>{dirs.add(dir);},
    writeFileSync:(file,data)=>{files.set(file,Buffer.isBuffer(data)?Buffer.from(data):Buffer.from(String(data)));},
    readFileSync:(file)=>{if(!files.has(file))throw Object.assign(new Error(`ENOENT: ${file}`),{code:'ENOENT'});return files.get(file);},
    existsSync:(file)=>files.has(file),
    rmSync:(file)=>{files.delete(file);}
  };
  const path={join:(...parts)=>parts.join('/')};
  return {fs,path,files,dirs,read:file=>String(files.get(file)||'')};
}
const safeStorageOk={
  isEncryptionAvailable:()=>true,
  encryptString:value=>Buffer.from(Buffer.from(String(value),'utf8').toString('base64'),'utf8'),
  decryptString:value=>Buffer.from(value.toString(),'base64').toString('utf8')
};
function buatStore(extra={}){
  const memory=createMemoryFs();
  const store=createDapodikConfigStore({safeStorage:safeStorageOk,fs:memory.fs,path:memory.path,userDataPath:'/user-data',...extra});
  return {store,memory};
}
const isian={baseUrl:'http://localhost:5774',npsn:'20218098',semesterId:'20262',token:'SECRET'};

test('Konfigurasi mengenkripsi token dan tidak pernah mengembalikannya secara publik',()=>{
  const {store,memory}=buatStore();
  const publicConfig=store.save(isian);
  assert.equal('token' in publicConfig,false);
  assert.equal(store.loadWithToken().token,'SECRET');
  assert.doesNotMatch(memory.read('/user-data/dapodik-config.json'),/SECRET/);
  assert.doesNotMatch(memory.read('/user-data/dapodik-token.bin'),/SECRET/);
  assert.equal(publicConfig.tokenConfigured,true);
  assert.equal('token' in store.loadPublic(),false);
  assert.equal(store.loadPublic().baseUrl,'http://localhost:5774');
});

test('Berkas ditulis di userData Electron dengan izin terbatas, bukan di repositori',()=>{
  const {store,memory}=buatStore();
  store.save(isian);
  assert.deepEqual([...memory.files.keys()].sort(),['/user-data/dapodik-config.json','/user-data/dapodik-token.bin']);
  assert.ok(memory.dirs.has('/user-data'));
  for(const key of memory.files.keys())assert.doesNotMatch(key,/dist|src|electron|node_modules/);
});

test('Penyimpanan aman yang tidak tersedia menggagalkan penyimpanan tanpa menulis apa pun',()=>{
  const memory=createMemoryFs();
  const store=createDapodikConfigStore({safeStorage:{isEncryptionAvailable:()=>false,encryptString:()=>Buffer.from(''),decryptString:()=>''},fs:memory.fs,path:memory.path,userDataPath:'/user-data'});
  assert.throws(()=>store.save(isian),/Penyimpanan aman Windows tidak tersedia/);
  assert.equal(memory.files.size,0,'tidak ada berkas yang tertulis saat gagal');
});

test('Konfigurasi divalidasi sebelum disimpan',()=>{
  const {store}=buatStore();
  assert.throws(()=>store.save({...isian,baseUrl:''}),/Alamat/);
  assert.throws(()=>store.save({...isian,npsn:''}),/NPSN/);
  assert.throws(()=>store.save({...isian,semesterId:''}),/Semester/);
  assert.throws(()=>store.save({...isian,token:'   '}),/Token/);
});

test('Membaca sebelum ada konfigurasi memberi bentuk kosong yang aman',()=>{
  const {store}=buatStore();
  const kosong=store.loadPublic();
  assert.equal(kosong.baseUrl,'');
  assert.equal(kosong.npsn,'');
  assert.equal(kosong.tokenConfigured,false);
  assert.equal('token' in kosong,false);
  assert.throws(()=>store.loadWithToken(),/belum dikonfigurasi/);
});

test('clear menghapus konfigurasi dan token',()=>{
  const {store,memory}=buatStore();
  store.save(isian);
  store.clear();
  assert.equal(memory.files.size,0);
  assert.equal(store.loadPublic().tokenConfigured,false);
});

test('Pesan kesalahan berkas dan kripto disunting sebelum keluar dari proses utama',()=>{
  const memory=createMemoryFs();
  const rahasia='C:\\Users\\Operator\\AppData\\dapodik-token.bin SECRET';
  const store=createDapodikConfigStore({
    safeStorage:{isEncryptionAvailable:()=>true,encryptString:()=>{throw new Error(rahasia);},decryptString:()=>''},
    fs:memory.fs,path:memory.path,userDataPath:'/user-data'
  });
  try{store.save(isian);assert.fail('seharusnya gagal');}
  catch(error){
    assert.doesNotMatch(error.message,/SECRET|AppData|Users/);
    assert.match(error.message,/Konfigurasi Dapodik/);
  }
});

test('Token tidak pernah muncul pada bentuk publik walau dikirim ulang',()=>{
  const {store}=buatStore();
  const hasil=store.save({...isian,token:'TOKEN-BARU'});
  const teks=JSON.stringify({hasil,publik:store.loadPublic()});
  assert.doesNotMatch(teks,/TOKEN-BARU/);
  assert.equal(store.loadWithToken().token,'TOKEN-BARU');
});
