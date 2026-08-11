/* Intro startup: begitu aplikasi dibuka, animasi langsung diputar beserta audio aslinya,
   lalu berpindah ke Login. Tidak ada logo statis tambahan dari sisi web, dan warna latar
   diambil dari frame pertama video sehingga tidak muncul kedip putih di antara keduanya. */
const screen=document.querySelector('[data-intro-screen]');
const video=screen?.querySelector('video');
const UNMUTE_EVENTS=['pointerdown','touchstart','keydown'];
let finished=false;
let unmuteOnGesture=null;

function clearGestureListener(){
  if(!unmuteOnGesture)return;
  UNMUTE_EVENTS.forEach(name=>globalThis.removeEventListener(name,unmuteOnGesture));
  unmuteOnGesture=null;
}

/* Audio dihentikan seketika dan sumbernya dilepas supaya tidak ada suara yang berjalan
   di latar setelah masuk Login. */
function stopPlayback(){
  if(!video)return;
  try{video.pause();video.removeAttribute('src');video.load();}catch{}
}

function finish(){
  if(finished)return;
  finished=true;
  clearGestureListener();
  stopPlayback();
  document.body.classList.remove('intro-active');
  if(!screen)return;
  screen.classList.add('is-hidden');
  setTimeout(()=>screen.remove(),400);
}

function paintBackgroundFromFirstFrame(){
  try{
    const canvas=document.createElement('canvas');
    canvas.width=8;canvas.height=8;
    const context=canvas.getContext('2d');
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const [red,green,blue]=context.getImageData(0,0,1,1).data;
    const color=`rgb(${red}, ${green}, ${blue})`;
    screen.style.backgroundColor=color;
    video.style.backgroundColor=color;
    document.documentElement.style.setProperty('--intro-bg',color);
  }catch{/* frame belum dapat dibaca, latar bawaan tetap dipakai */}
}

function play(){
  if(finished)return;
  video.muted=false;
  video.volume=1;
  const started=video.play();
  if(!started?.catch)return;
  started.catch(()=>{
    if(finished)return;
    /* Sebagian browser menolak autoplay bersuara tanpa interaksi. Animasi tetap jalan tanpa
       suara, lalu suara dinyalakan pada sentuhan pertama. */
    video.muted=true;
    video.play().catch(finish);
    unmuteOnGesture=()=>{clearGestureListener();if(finished)return;video.muted=false;video.volume=1;};
    UNMUTE_EVENTS.forEach(name=>globalThis.addEventListener(name,unmuteOnGesture,{once:true,passive:true}));
  });
}

if(screen&&video){
  video.addEventListener('loadeddata',()=>{paintBackgroundFromFirstFrame();play();},{once:true});
  video.addEventListener('ended',finish,{once:true});
  video.addEventListener('error',finish,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
  if(video.readyState>=2){paintBackgroundFromFirstFrame();play();}
  else play();
  setTimeout(()=>{if(video.readyState===0)finish();},8000);
}else document.body.classList.remove('intro-active');
