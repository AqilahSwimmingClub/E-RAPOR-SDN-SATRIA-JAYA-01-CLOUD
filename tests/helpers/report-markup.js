/* Mengambil satu fungsi utuh dari berkas sumber, dipakai untuk membandingkan penyusun markup
   rapor yang berlaku sekarang dengan salinan baseline d093b99. Pemindaian kurung dilakukan
   sendiri supaya daftar parameter berbentuk objek tidak salah dikira awal badan fungsi. */

export function extractFunctionSource(source,name){
  const anchor=source.indexOf(`function ${name}(`);
  if(anchor<0)throw new Error(`Fungsi ${name} tidak ditemukan pada berkas sumber.`);
  const start=source.lastIndexOf('\n',anchor)+1;
  let i=source.indexOf('(',anchor);
  let depth=0;
  for(;;i+=1){
    if(source[i]==='(')depth+=1;
    else if(source[i]===')'){depth-=1;if(!depth)break;}
  }
  let j=source.indexOf('{',i);
  depth=0;
  for(;;j+=1){
    if(source[j]==='{')depth+=1;
    else if(source[j]==='}'){depth-=1;if(!depth)return source.slice(start,j+1);}
  }
}
