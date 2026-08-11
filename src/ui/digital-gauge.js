import { escapeHtml } from './dom.js';

export function digitalGauge(value,{label='',caption='',suffix='%',tone='maroon',size='normal'}={}){
  const number=Number(value);const normalized=Number.isFinite(number)?Math.max(0,Math.min(100,Math.round(number))):0;
  return `<div class="digital-gauge digital-gauge-${escapeHtml(tone)} digital-gauge-${escapeHtml(size)}" style="--gauge-value:${normalized}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${normalized}" aria-label="${escapeHtml(label||caption||'Progres')}"><div class="digital-gauge-ring"><div class="digital-gauge-core"><strong>${normalized}${escapeHtml(suffix)}</strong><span>${escapeHtml(label)}</span></div></div>${caption?`<small>${escapeHtml(caption)}</small>`:''}</div>`;
}
