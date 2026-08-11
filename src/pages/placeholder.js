import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
export function renderPlaceholder(title, description='Modul ini akan dikerjakan pada milestone Codex berikutnya tanpa mengubah desain utama.'){
  return el(`<div><div class="page-head"><div><h1>${title}</h1><p>${description}</p></div></div><section class="card placeholder"><div class="placeholder-icon">${icon('file',26)}</div><h2>${title}</h2><p>Fondasi route sudah tersedia. Data modul akan dibuat terpisah agar tidak tumpang tindih dengan menu lain.</p></section></div>`);
}
