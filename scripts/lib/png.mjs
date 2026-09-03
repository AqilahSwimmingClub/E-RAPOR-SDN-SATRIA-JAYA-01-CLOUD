/* Pembaca dan penulis PNG seadanya untuk keperluan pembuatan ikon.

   Ditulis sendiri supaya proyek tidak perlu menambah dependensi native (sharp) yang harus
   diunduh dan dikompilasi ulang di setiap mesin. Yang dibutuhkan hanya: membaca satu berkas
   master, mengubah ukurannya, lalu menulisnya kembali. zlib sudah tersedia di Node.

   Cakupannya sengaja sempit: PNG 8-bit non-interlaced, grayscale/RGB/RGBA/palette. Format di
   luar itu ditolak dengan pesan jelas, bukan diam-diam menghasilkan gambar rusak. */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
/* Jumlah kanal per jenis warna PNG: 0 abu-abu, 2 RGB, 3 palet, 4 abu-abu+alfa, 6 RGBA. */
const KANAL={0:1,2:3,3:1,4:2,6:4};

function crc32(buf){
  let c=~0;
  for(let i=0;i<buf.length;i++){
    c^=buf[i];
    for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));
  }
  return ~c>>>0;
}

function* potongan(buf){
  let off=8;
  while(off<buf.length){
    const panjang=buf.readUInt32BE(off);
    const tipe=buf.toString('ascii',off+4,off+8);
    yield {tipe,data:buf.subarray(off+8,off+8+panjang)};
    off+=12+panjang;
  }
}

function bukaFilter(mentah,lebar,tinggi,bpp){
  const stride=lebar*bpp;
  const keluar=Buffer.alloc(tinggi*stride);
  let posisi=0;
  for(let y=0;y<tinggi;y++){
    const filter=mentah[posisi++];
    const baris=mentah.subarray(posisi,posisi+stride);posisi+=stride;
    const tujuan=keluar.subarray(y*stride,(y+1)*stride);
    const atas=y>0?keluar.subarray((y-1)*stride,y*stride):null;
    for(let x=0;x<stride;x++){
      const a=x>=bpp?tujuan[x-bpp]:0;
      const b=atas?atas[x]:0;
      const c=(atas&&x>=bpp)?atas[x-bpp]:0;
      let nilai=baris[x];
      if(filter===1)nilai+=a;
      else if(filter===2)nilai+=b;
      else if(filter===3)nilai+=(a+b)>>1;
      else if(filter===4){
        const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
        nilai+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);
      }else if(filter!==0)throw new Error(`Filter PNG ${filter} tidak dikenal.`);
      tujuan[x]=nilai&0xff;
    }
  }
  return keluar;
}

/* Mengembalikan {lebar,tinggi,piksel} dengan piksel selalu RGBA 8-bit. */
export function bacaPng(buf){
  if(!buf.subarray(0,8).equals(SIGNATURE))throw new Error('Berkas bukan PNG.');
  let ihdr=null,palet=null,alfaPalet=null;
  const bagian=[];
  for(const {tipe,data} of potongan(buf)){
    if(tipe==='IHDR')ihdr={lebar:data.readUInt32BE(0),tinggi:data.readUInt32BE(4),
      kedalaman:data[8],jenis:data[9],interlace:data[12]};
    else if(tipe==='PLTE')palet=data;
    else if(tipe==='tRNS')alfaPalet=data;
    else if(tipe==='IDAT')bagian.push(data);
    else if(tipe==='IEND')break;
  }
  if(!ihdr)throw new Error('PNG tanpa header IHDR.');
  if(ihdr.kedalaman!==8)throw new Error(`PNG ${ihdr.kedalaman}-bit belum didukung; pakai PNG 8-bit.`);
  if(ihdr.interlace!==0)throw new Error('PNG interlaced belum didukung; simpan ulang tanpa interlace.');
  const kanal=KANAL[ihdr.jenis];
  if(!kanal)throw new Error(`Jenis warna PNG ${ihdr.jenis} tidak dikenal.`);
  const {lebar,tinggi}=ihdr;
  const baris=bukaFilter(inflateSync(Buffer.concat(bagian)),lebar,tinggi,kanal);
  const piksel=Buffer.alloc(lebar*tinggi*4);
  for(let i=0;i<lebar*tinggi;i++){
    const s=i*kanal,d=i*4;
    if(ihdr.jenis===3){
      const idx=baris[s];
      piksel[d]=palet[idx*3];piksel[d+1]=palet[idx*3+1];piksel[d+2]=palet[idx*3+2];
      piksel[d+3]=alfaPalet&&idx<alfaPalet.length?alfaPalet[idx]:255;
    }else if(ihdr.jenis===0||ihdr.jenis===4){
      piksel[d]=piksel[d+1]=piksel[d+2]=baris[s];
      piksel[d+3]=ihdr.jenis===4?baris[s+1]:255;
    }else{
      piksel[d]=baris[s];piksel[d+1]=baris[s+1];piksel[d+2]=baris[s+2];
      piksel[d+3]=ihdr.jenis===6?baris[s+3]:255;
    }
  }
  return {lebar,tinggi,piksel};
}

export function tulisPng({lebar,tinggi,piksel}){
  const stride=lebar*4;
  const mentah=Buffer.alloc(tinggi*(stride+1));
  for(let y=0;y<tinggi;y++){
    mentah[y*(stride+1)]=0;
    piksel.copy(mentah,y*(stride+1)+1,y*stride,(y+1)*stride);
  }
  const bagian=(tipe,data)=>{
    const kepala=Buffer.alloc(8);
    kepala.writeUInt32BE(data.length,0);kepala.write(tipe,4,'ascii');
    const crc=Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([kepala.subarray(4),data])),0);
    return Buffer.concat([kepala,data,crc]);
  };
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(lebar,0);ihdr.writeUInt32BE(tinggi,4);
  ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([SIGNATURE,bagian('IHDR',ihdr),
    bagian('IDAT',deflateSync(mentah,{level:9})),bagian('IEND',Buffer.alloc(0))]);
}

/* Penskalaan kotak (box filter): setiap piksel tujuan adalah rata-rata seluruh piksel sumber
   yang jatuh di dalamnya. Untuk pengecilan ikon hasilnya jauh lebih bersih daripada mengambil
   satu piksel terdekat, dan alfa ikut dirata-rata sehingga tepi membulat tidak bergerigi. */
export function ubahUkuran(gambar,lebarBaru,tinggiBaru){
  const {lebar,tinggi,piksel}=gambar;
  const keluar=Buffer.alloc(lebarBaru*tinggiBaru*4);
  const skalaX=lebar/lebarBaru,skalaY=tinggi/tinggiBaru;
  for(let y=0;y<tinggiBaru;y++){
    const y0=Math.floor(y*skalaY),y1=Math.max(y0+1,Math.ceil((y+1)*skalaY));
    for(let x=0;x<lebarBaru;x++){
      const x0=Math.floor(x*skalaX),x1=Math.max(x0+1,Math.ceil((x+1)*skalaX));
      let r=0,g=0,b=0,a=0,n=0;
      for(let sy=y0;sy<Math.min(y1,tinggi);sy++)
        for(let sx=x0;sx<Math.min(x1,lebar);sx++){
          const i=(sy*lebar+sx)*4,alfa=piksel[i+3];
          /* Warna dibobot alfa supaya piksel transparan tidak menarik tepi ke arah hitam. */
          r+=piksel[i]*alfa;g+=piksel[i+1]*alfa;b+=piksel[i+2]*alfa;a+=alfa;n++;
        }
      const d=(y*lebarBaru+x)*4;
      if(a>0){keluar[d]=Math.round(r/a);keluar[d+1]=Math.round(g/a);keluar[d+2]=Math.round(b/a);}
      keluar[d+3]=n?Math.round(a/n):0;
    }
  }
  return {lebar:lebarBaru,tinggi:tinggiBaru,piksel:keluar};
}

/* Menempatkan gambar di tengah kanvas persegi yang lebih besar, dipakai untuk foreground
   adaptive icon Android yang bagian tepinya dipangkas sistem. */
export function beriMargin(gambar,sisi,rasioIsi){
  const isi=Math.round(sisi*rasioIsi);
  const kecil=ubahUkuran(gambar,isi,isi);
  const piksel=Buffer.alloc(sisi*sisi*4);
  const offset=Math.floor((sisi-isi)/2);
  for(let y=0;y<isi;y++)
    kecil.piksel.copy(piksel,((y+offset)*sisi+offset)*4,y*isi*4,(y+1)*isi*4);
  return {lebar:sisi,tinggi:sisi,piksel};
}

/* Menembuskan latar polos di luar bentuk logo.

   Logo master dikirim sebagai PNG tanpa alfa, sehingga di luar bentuk membulatnya masih ada
   bidang rata — putih pada logo aplikasi, abu gelap pada logo Owner. Dibiarkan begitu, ikon
   peluncur dan maskable icon akan tampak sebagai kotak berlatar, bukan sebagai lambang.

   Latar dikenali dengan perambatan dari tepi bingkai, bukan dengan mencocokkan warna di
   seluruh gambar. Dengan begitu bidang putih DI DALAM lambang (halaman buku, tulisan
   "e-Rapor") tidak ikut ditembuskan. Bentuk, warna, dan proporsi logo tidak diubah. */
export function bersihkanLatarTepi(gambar,ambang=42){
  const {lebar,tinggi,piksel}=gambar;
  const keluar=Buffer.from(piksel);
  const acuan=[piksel[0],piksel[1],piksel[2]];
  const mirip=i=>Math.abs(piksel[i]-acuan[0])+Math.abs(piksel[i+1]-acuan[1])+Math.abs(piksel[i+2]-acuan[2])<=ambang;
  const sudahDilihat=new Uint8Array(lebar*tinggi);
  const antrean=[];
  const dorong=(x,y)=>{
    if(x<0||y<0||x>=lebar||y>=tinggi)return;
    const p=y*lebar+x;
    if(sudahDilihat[p])return;
    sudahDilihat[p]=1;
    if(mirip(p*4))antrean.push(p);
  };
  for(let x=0;x<lebar;x++){dorong(x,0);dorong(x,tinggi-1);}
  for(let y=0;y<tinggi;y++){dorong(0,y);dorong(lebar-1,y);}
  while(antrean.length){
    const p=antrean.pop();
    keluar[p*4+3]=0;
    const x=p%lebar,y=(p-x)/lebar;
    dorong(x-1,y);dorong(x+1,y);dorong(x,y-1);dorong(x,y+1);
  }
  return {lebar,tinggi,piksel:keluar};
}
