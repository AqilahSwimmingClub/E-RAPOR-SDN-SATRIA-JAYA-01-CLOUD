export function el(html){ const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild; }
export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }
export function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
export function toast(message,type='success'){
  let host=document.querySelector('.toast-host');if(!host){host=document.createElement('div');host.className='toast-host';document.body.append(host)}
  const node=el(`<div class="toast toast-${type}">${escapeHtml(message)}</div>`);host.append(node);setTimeout(()=>node.remove(),3200);
}
export function confirmDialog({title,message,confirmText='Lanjutkan',danger=false}){
  return new Promise(resolve=>{
    const overlay=el(`<div class="modal-backdrop"><div class="modal-card" role="dialog" aria-modal="true"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p><div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn ${danger?'btn-danger':'btn-primary'}" data-ok>${escapeHtml(confirmText)}</button></div></div></div>`);
    document.body.append(overlay);overlay.querySelector('[data-cancel]').onclick=()=>{overlay.remove();resolve(false)};overlay.querySelector('[data-ok]').onclick=()=>{overlay.remove();resolve(true)};
  });
}
