import * as XLSX from '../../assets/vendor/xlsx.mjs';

function pad(value){return String(value).padStart(2,'0');}
function cellValue(value){if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;return value??'';}

/* Nomor dokumen yang terlanjur tersimpan sebagai bilangan oleh Excel dibaca kembali menjadi
   teks yang utuh. String(1.2345678901234e+21) menghasilkan notasi ilmiah dan nomor peserta
   ujian pun rusak; toLocaleString('fullwide') menuliskan seluruh digitnya apa adanya. Nol di
   depan memang sudah hilang di sisi Excel dan tidak dapat dipulihkan di sini - itulah sebabnya
   template menandai kolom-kolom ini sebagai teks sejak awal. */
export function cellText(value){
  if(typeof value!=='number'||!Number.isFinite(value))return String(value??'').trim();
  return Number.isInteger(value)
    ? value.toLocaleString('fullwide',{useGrouping:false,maximumFractionDigits:0})
    : String(value);
}

/* `textColumns` menandai kolom yang isinya NOMOR DOKUMEN, bukan bilangan: NISN, nomor ijazah,
   nomor surat, nomor peserta ujian. Tanpa penandaan ini Excel memperlakukannya sebagai angka,
   sehingga nol di depan hilang ("007" menjadi 7) dan nomor panjang berubah menjadi notasi
   ilmiah (1,23457E+14). Selnya karena itu ditulis bertipe teks sekaligus diberi format angka
   "@" supaya Excel tetap memperlakukannya sebagai teks ketika guru mengetik atau menempel
   data baru di kolom itu. */
export function createWorkbookBytes(sheetName,rows,{columnWidths=[],textColumns=[]}={}){
  const worksheet=XLSX.utils.aoa_to_sheet(rows);
  if(columnWidths.length)worksheet['!cols']=columnWidths.map(width=>({wch:width}));
  if(textColumns.length&&worksheet['!ref']){
    const rentang=XLSX.utils.decode_range(worksheet['!ref']);
    for(const kolom of textColumns){
      if(!Number.isInteger(kolom)||kolom<rentang.s.c||kolom>rentang.e.c)continue;
      for(let baris=rentang.s.r;baris<=rentang.e.r;baris+=1){
        const alamat=XLSX.utils.encode_cell({r:baris,c:kolom});
        const sel=worksheet[alamat];
        if(!sel)continue;
        if(sel.v===''||sel.v===null||sel.v===undefined)continue;
        sel.t='s';sel.v=String(sel.v);sel.z='@';
        delete sel.f;delete sel.w;
      }
    }
  }
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,worksheet,String(sheetName||'Data').slice(0,31));
  return XLSX.write(workbook,{bookType:'xlsx',type:'array',compression:true});
}

export function readWorkbookRows(data){
  if(!(data instanceof ArrayBuffer)&&!ArrayBuffer.isView(data))throw new Error('Data workbook Excel tidak valid.');
  const workbook=XLSX.read(data,{type:'array',cellDates:true});const sheetName=workbook.SheetNames[0];if(!sheetName)throw new Error('Workbook Excel tidak memiliki worksheet.');
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:true}).map(row=>row.map(cellValue));
}

export function isExcelFileName(name){return /\.(xlsx|xls)$/i.test(String(name||''));}
