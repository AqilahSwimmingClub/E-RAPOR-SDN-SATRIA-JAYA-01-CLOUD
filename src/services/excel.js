import * as XLSX from '../../assets/vendor/xlsx.mjs';

function pad(value){return String(value).padStart(2,'0');}
function cellValue(value){if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;return value??'';}

export function createWorkbookBytes(sheetName,rows,{columnWidths=[]}={}){
  const worksheet=XLSX.utils.aoa_to_sheet(rows);
  if(columnWidths.length)worksheet['!cols']=columnWidths.map(width=>({wch:width}));
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,worksheet,String(sheetName||'Data').slice(0,31));
  return XLSX.write(workbook,{bookType:'xlsx',type:'array',compression:true});
}

export function readWorkbookRows(data){
  if(!(data instanceof ArrayBuffer)&&!ArrayBuffer.isView(data))throw new Error('Data workbook Excel tidak valid.');
  const workbook=XLSX.read(data,{type:'array',cellDates:true});const sheetName=workbook.SheetNames[0];if(!sheetName)throw new Error('Workbook Excel tidak memiliki worksheet.');
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:true}).map(row=>row.map(cellValue));
}

export function isExcelFileName(name){return /\.(xlsx|xls)$/i.test(String(name||''));}
