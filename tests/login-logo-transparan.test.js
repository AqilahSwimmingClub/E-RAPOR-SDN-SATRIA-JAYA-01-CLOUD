import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/* Logo sekolah pada header Login harus benar-benar transparan di dalam berkasnya,
   bukan sekadar disamarkan oleh CSS, supaya foto latar terlihat langsung di sekeliling
   lambang pada semua ukuran layar. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){
  const cocok=css().match(new RegExp(`(^|[;}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));
  return cocok?cocok[2]:'';
}

/* Pembaca PNG seadanya: cukup untuk berkas 8 bit non-interlaced yang dipakai aplikasi. */
function bacaPng(path){
  const buf=readFileSync(new URL(path,root));
  assert.equal(buf.readUInt32BE(0),0x89504e47,'berkas benar-benar PNG');
  let off=8,ihdr=null;const idat=[];
  while(off<buf.length){
    const len=buf.readUInt32BE(off),type=buf.toString('ascii',off+4,off+8);
    const data=buf.subarray(off+8,off+8+len);
    if(type==='IHDR')ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),depth:data[8],color:data[9],interlace:data[12]};
    if(type==='IDAT')idat.push(data);
    if(type==='IEND')break;
    off+=len+12;
  }
  assert.ok(ihdr,'IHDR terbaca');
  assert.equal(ihdr.color,6,'PNG memakai kanal alpha (color type 6 = RGBA)');
  assert.equal(ihdr.depth,8,'kedalaman 8 bit');
  assert.equal(ihdr.interlace,0,'tidak interlaced');
  const {w,h}=ihdr,bpp=4,stride=w*bpp;
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const px=Buffer.alloc(w*h*4);
  let prev=Buffer.alloc(stride);
  for(let y=0;y<h;y++){
    const ft=raw[y*(stride+1)];
    const line=Buffer.from(raw.subarray(y*(stride+1)+1,y*(stride+1)+1+stride));
    for(let i=0;i<stride;i++){
      const a=i>=bpp?line[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;
      let v=line[i];
      if(ft===1)v+=a;else if(ft===2)v+=b;else if(ft===3)v+=(a+b)>>1;
      else if(ft===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
      line[i]=v&255;
    }
    prev=line;
    line.copy(px,y*stride);
  }
  return {w,h,px};
}

test('Berkas logo Login menyimpan latar transparan, bukan kotak hitam',()=>{
  const {w,h,px}=bacaPng('assets/logo-sekolah.png');
  const alpha=(x,y)=>px[(y*w+x)*4+3];
  for(const [x,y] of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]])
    assert.equal(alpha(x,y),0,`sudut (${x},${y}) tembus pandang`);
  /* Bentuk perisai menyisakan ruang kosong yang cukup besar di keempat sudut. */
  let kosong=0;
  for(let i=0;i<w*h;i++)if(px[i*4+3]===0)kosong++;
  assert.ok(kosong/(w*h)>0.15,`latar transparan ${(kosong/(w*h)*100).toFixed(1)}% dari bingkai`);
  /* Lambangnya sendiri tetap utuh dan tidak ikut ditembuskan. */
  let padat=0;
  for(let i=0;i<w*h;i++)if(px[i*4+3]===255)padat++;
  assert.ok(padat/(w*h)>0.55,`lambang tetap padat ${(padat/(w*h)*100).toFixed(1)}%`);
});

test('Tidak ada kotak hitam sisa di tepi lambang',()=>{
  const {w,h,px}=bacaPng('assets/logo-sekolah.png');
  /* Piksel gelap pekat yang masih tampak penuh akan terlihat sebagai bingkai kotak. */
  let gelapPenuh=0;
  for(let i=0;i<w*h;i++){
    if(px[i*4+3]<200)continue;
    if(Math.max(px[i*4],px[i*4+1],px[i*4+2])<=24)gelapPenuh++;
  }
  assert.ok(gelapPenuh/(w*h)<0.01,`sisa piksel hitam pekat ${(gelapPenuh/(w*h)*100).toFixed(2)}%`);
});

test('CSS tidak menambah kotak, kartu, atau bingkai di belakang logo',()=>{
  for(const selector of ['.login-brand-mark','.login-logo']){
    const isi=rule(selector);
    assert.doesNotMatch(isi,/(^|;)\s*background(-color)?:/,`${selector} tanpa latar sendiri`);
    assert.doesNotMatch(isi,/(^|;)\s*border:/,`${selector} tanpa garis bingkai`);
    assert.doesNotMatch(isi,/box-shadow:/,`${selector} tanpa bayangan kotak`);
    assert.doesNotMatch(isi,/backdrop-filter:/,`${selector} tanpa panel kaca`);
  }
  /* Ukuran dan posisi logo tidak berubah oleh perbaikan ini. */
  const logo=rule('.login-logo');
  assert.match(logo,/width:58px/,'lebar desktop tetap 58px');
  assert.match(logo,/object-fit:contain/,'rasio asli tetap dijaga');
});

test('Identitas header tetap, sambutan WELCOME dihapus',()=>{
  const source=read('src/pages/login.js');
  for(const teks of ['e-Rapor','schoolLabel.toUpperCase()','Cerdas • Berkarakter • Berprestasi'])
    assert.ok(source.includes(teks),`${teks} tetap ada`);
  assert.doesNotMatch(source,/WELCOME/i,'tulisan WELCOME sudah dihapus');
  assert.doesNotMatch(css(),/\.login-photo-caption h1\{/,'gaya sambutan lama ikut dibersihkan');
  assert.ok(source.includes('Cerdas • Berkarakter • Berprestasi'),'tagline tetap dipertahankan');
});
