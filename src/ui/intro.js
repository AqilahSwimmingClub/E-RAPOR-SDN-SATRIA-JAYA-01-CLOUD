const screen=document.querySelector('[data-intro-screen]');const video=screen?.querySelector('video');
function finish(){if(!screen)return;screen.classList.add('is-hidden');document.body.classList.remove('intro-active');setTimeout(()=>screen.remove(),400);}
if(screen&&video){video.addEventListener('ended',finish,{once:true});video.addEventListener('error',finish,{once:true});const attempt=video.play();if(attempt?.catch)attempt.catch(()=>{video.muted=true;video.play().catch(finish);});setTimeout(()=>{if(video.readyState===0)finish();},8000);}else document.body.classList.remove('intro-active');
