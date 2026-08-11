function copyMapping(mapping){ return mapping.map(item=>({...item})); }

export function normalizeMappingGroups(mapping){
  if(!Array.isArray(mapping)) return [];
  const next=copyMapping(mapping).map((item,index)=>({...item,group:['A','B'].includes(item.group)?item.group:'B',_index:index}));
  return ['A','B'].flatMap(group=>next.filter(item=>item.group===group).sort((a,b)=>(Number(a.order)||Number.MAX_SAFE_INTEGER)-(Number(b.order)||Number.MAX_SAFE_INTEGER)||a._index-b._index).map((item,index)=>{const {_index,...record}=item;return {...record,group,groupLabel:group==='A'?'Kelompok Mata Pelajaran Wajib':'Kelompok Mata Pelajaran Pilihan',order:index+1};}));
}

export function canReorderWithinGroup(mapping,id,direction){
  if(!Array.isArray(mapping) || ![-1,1].includes(direction)) return false;
  const index=mapping.findIndex(item=>item.id===id);
  if(index<0) return false;
  const groupIndexes=mapping
    .map((item,itemIndex)=>item.group===mapping[index].group?itemIndex:-1)
    .filter(itemIndex=>itemIndex>=0);
  const groupPosition=groupIndexes.indexOf(index);
  return groupPosition+direction>=0 && groupPosition+direction<groupIndexes.length;
}

export function reorderWithinGroup(mapping,id,direction){
  const next=normalizeMappingGroups(mapping);
  if(!canReorderWithinGroup(next,id,direction)) return next;
  const index=next.findIndex(item=>item.id===id);
  const groupIndexes=next
    .map((item,itemIndex)=>item.group===next[index].group?itemIndex:-1)
    .filter(itemIndex=>itemIndex>=0);
  const groupPosition=groupIndexes.indexOf(index);
  const targetIndex=groupIndexes[groupPosition+direction];
  const currentOrder=next[index].order;
  next[index].order=next[targetIndex].order;
  next[targetIndex].order=currentOrder;
  [next[index],next[targetIndex]]=[next[targetIndex],next[index]];
  return normalizeMappingGroups(next);
}

export function moveSubjectToGroup(mapping,id,targetGroup){
  if(!['A','B'].includes(targetGroup))throw new Error('Kelompok mata pelajaran harus A atau B.');
  const next=normalizeMappingGroups(mapping);const item=next.find(subject=>subject.id===id);
  if(!item)throw new Error('Mata pelajaran tidak ditemukan pada Mapping.');
  if(item.group===targetGroup)return next;
  const targetCount=next.filter(subject=>subject.group===targetGroup).length;
  item.group=targetGroup;item.order=targetCount+1;
  return normalizeMappingGroups(next);
}
