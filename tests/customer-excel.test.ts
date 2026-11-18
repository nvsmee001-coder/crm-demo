import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createCustomerTemplate, guessCustomerColumns, mapCustomerExcelRows, readCustomerExcel, CUSTOMER_EXCEL_MAX_BYTES } from '../lib/customer-excel.js';

async function fileFrom(workbook:ExcelJS.Workbook,name='khach-hang.xlsx') {
  const bytes=await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(bytes)],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function workbookWith(rows:unknown[][]) {
  const book=new ExcelJS.Workbook();
  book.addWorksheet('Khách hàng').addRows(rows);
  return book;
}

test('xlsx roundtrip preserves text phones and recovers leading zero only for numeric Vietnamese mobile cells',async()=>{
  const file=await fileFrom(workbookWith([['Tên khách hàng','Số điện thoại','Email'],['A','0912345678','a@example.test'],['B','+84987654321','b@example.test'],['C',912345679,'c@example.test'],['D','912345680','d@example.test'],['E',12025550123,'e@example.test']]));
  const {sheets}=await readCustomerExcel(file);
  const mapped=mapCustomerExcelRows(sheets[0],guessCustomerColumns(sheets[0].headers));
  assert.deepEqual(mapped.map(row=>row.data.phone),['0912345678','+84987654321','0912345679','912345680','12025550123']);
  assert.deepEqual(mapped.map(row=>row.rowNumber),[2,3,4,5,6]);
});

test('reader keeps original row numbers, ignores blank/hidden sheets, reads rich text and dates',async()=>{
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('Danh sách');
  sheet.getRow(3).values=['Khách hàng','ĐT','Ghi chú'];
  sheet.getRow(5).values=[{richText:[{text:'Khách '},{text:'mẫu'}]},'0912345678',new Date('2026-11-20T00:00:00Z')];
  sheet.getRow(8).values=['B','0987654321',''];
  book.addWorksheet('Trống');
  book.addWorksheet('Ẩn',{state:'hidden'}).addRows([['Tên','Số'],['Ẩn','0999999999']]);
  const {sheets}=await readCustomerExcel(await fileFrom(book));
  assert.equal(sheets.length,1);
  assert.deepEqual(sheets[0].rows.map(row=>row.rowNumber),[5,8]);
  assert.deepEqual(sheets[0].rows[0].cells,['Khách mẫu','0912345678','2026-11-20']);
});

test('column guessing handles Vietnamese accents/punctuation and mapping uses indexes for duplicate headers',()=>{
  const mapping=guessCustomerColumns(['Tên công ty / khách hàng *','SĐT','Email chính','Người liên hệ chính','Ghi chú']);
  assert.equal(mapping.name,0);assert.equal(mapping.phone,1);assert.equal(mapping.email,2);assert.equal(mapping.contact,3);assert.equal(mapping.notes,4);
  const sheet={name:'S',headers:['Tên khách hàng','SĐT','SĐT'],rows:[{rowNumber:2,cells:['A','0912345678','0987654321']}]};
  assert.equal(mapCustomerExcelRows(sheet,{name:0,phone:2})[0].data.phone,'0987654321');
  assert.throws(()=>mapCustomerExcelRows(sheet,{name:0,phone:0}),/Mỗi cột/);
  assert.throws(()=>mapCustomerExcelRows(sheet,{name:0,phone:-1}),/Tên khách hàng và Số điện thoại/);
});

test('formula cells are rejected with actionable paste-values guidance',async()=>{
  const book=workbookWith([['Tên khách hàng','SĐT'],['A',{formula:'"0912345678"',result:'0912345678'}]]);
  await assert.rejects(()=>fileFrom(book).then(readCustomerExcel),/công thức.*Dán giá trị/);
});

test('limits reject 501 populated rows and data outside 30 columns',async()=>{
  const rows=[['Tên khách hàng','SĐT'],...Array.from({length:501},(_,index)=>['Khách '+index,'0912345678'])];
  await assert.rejects(()=>fileFrom(workbookWith(rows)).then(readCustomerExcel),/500 dòng/);
  const wide=workbookWith([['Tên khách hàng','SĐT'],['A','0912345678']]);
  wide.worksheets[0].getCell('AE2').value='Ngoài giới hạn';
  await assert.rejects(()=>fileFrom(wide).then(readCustomerExcel),/30 cột/);
});

test('invalid archives, legacy files and oversized files fail before workbook decoding',async()=>{
  await assert.rejects(()=>readCustomerExcel(new File(['not-excel'],'wrong.xlsx')),/không hợp lệ/);
  await assert.rejects(()=>readCustomerExcel(new File(['legacy'],'old.xls')),/Lưu thành .xlsx/);
  await assert.rejects(()=>readCustomerExcel(new File([new Uint8Array(CUSTOMER_EXCEL_MAX_BYTES+1)],'big.xlsx')),/5 MB/);
  await assert.rejects(()=>readCustomerExcel(new File([],'empty.xlsx')),/đang trống/);
});

test('declared oversized ZIP expansion is rejected before loading',async()=>{
  const file=await fileFrom(workbookWith([['Tên khách hàng','SĐT'],['A','0912345678']]));
  const bytes=await file.arrayBuffer(), view=new DataView(bytes);
  for(let i=0;i<bytes.byteLength-46;i++) if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,31*1024*1024,true);break;}
  await assert.rejects(()=>readCustomerExcel(new File([bytes],'expanded.xlsx')),/quá lớn sau khi giải nén/);
});

test('template is a real red-white workbook with phone text formatting and explicit sample rows',async()=>{
  const blob=await createCustomerTemplate();
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const result=await readCustomerExcel(new File([blob],'SMEE-template.xlsx'));
  assert.equal(result.sheets[0].name,'Khách hàng');assert.equal(result.sheets[0].rows.length,2);
  assert.match(result.sheets[0].rows[0].cells[0],/XÓA TRƯỚC KHI NHẬP/);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());
  assert.equal(book.worksheets[0].getColumn(2).numFmt,'@');
  assert.equal((book.worksheets[0].getCell('A1').fill as ExcelJS.FillPattern).fgColor?.argb,'FFE92B22');
  assert.equal(result.sheets[1].name,'Hướng dẫn');
});
