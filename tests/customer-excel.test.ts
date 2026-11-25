import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { prospectExcelFields, PROSPECT_TEMPLATE_URL } from '../lib/customer-excel.js';
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

test('cached formula values import as data and issues only affect rows with mapped cells',async()=>{
  const book=workbookWith([
    ['Tên khách hàng','SĐT','Ghi chú','Cột nội bộ'],
    ['Có kết quả',{formula:'912345678',result:912345678},{formula:'"Đã lưu"',result:'Đã lưu'},{error:'#N/A'}],
    ['Thiếu kết quả',{formula:'A1'}],
    ['Lỗi Excel',{error:'#REF!'}],
    ['Giá trị thường','0987654321'],
    [null,null,null,{error:'#N/A'}],
    ['Giá trị 0','0912345677',{formula:'0',result:0}],
    ['Giá trị false','0912345676',{formula:'FALSE',result:false}],
  ]);
  const {sheets:[sheet]}=await readCustomerExcel(await fileFrom(book));
  const rows=mapCustomerExcelRows(sheet,guessCustomerColumns(sheet.headers));
  assert.deepEqual(rows.map(row=>row.rowNumber),[2,3,4,5,7,8]);
  assert.equal(rows[0].data.phone,'0912345678');
  assert.equal(rows[0].data.notes,'Đã lưu');
  assert.equal(rows[0].issue,undefined);
  assert.match(rows[1].issue??'',/B3.*công thức.*Dán giá trị/);
  assert.match(rows[2].issue??'',/B4.*lỗi Excel/);
  assert.equal(rows[3].issue,undefined);
  assert.equal(rows[4].data.notes,'0');
  assert.equal(rows[5].data.notes,'Không');
  assert.match(mapCustomerExcelRows(sheet,{name:0,phone:1,notes:3})[0].issue??'',/D2.*lỗi Excel/);
});

test('recognizes a customer header below the report title and keeps the original Excel row numbers',async()=>{
  const book=workbookWith([
    ['Danh sách khách hàng tháng này'],
    [],
    ['STT','Tên doanh nghiệp','ĐT','Ghi chú'],
    [1,'Khách A','0912345678','Đã liên hệ'],
  ]);
  const {sheets:[sheet]}=await readCustomerExcel(await fileFrom(book));
  const mapping=guessCustomerColumns(sheet.headers);
  assert.equal(mapping.name,1);
  assert.equal(mapping.phone,2);
  const rows=mapCustomerExcelRows(sheet,mapping);
  assert.equal(rows.length,1);
  assert.equal(rows[0].rowNumber,4);
  assert.equal(rows[0].data.name,'Khách A');
});

test('prefixed spreadsheet parts and package-absolute sheet paths preserve all 147 customer rows',async()=>{
  const book=workbookWith([
    ['Tên khách hàng','SĐT','Ghi chú'],
    ...Array.from({length:147},(_,index)=>[
      `Khách ${index+1} & <Mẫu>`,
      '090812'+String(index).padStart(4,'0'),
      index===146?'Dòng cuối':'',
    ]),
  ]);
  book.addWorksheet('Hướng dẫn').addRows([['Hướng dẫn'],['Nội dung minh họa']]);
  const source=await fileFrom(book);
  const zip=await JSZip.loadAsync(await source.arrayBuffer());
  const namespace='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  for (const name of ['xl/workbook.xml','xl/styles.xml','xl/sharedStrings.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml']) {
    const xml=await zip.file(name)!.async('string');
    zip.file(name,xml.replace(`xmlns="${namespace}"`,`xmlns:x="${namespace}"`)
      .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g,'<$1x:$2')
      .replaceAll('xmlns:r=','xmlns:rel=').replaceAll(' r:id=',' rel:id='));
  }
  const relationships='xl/_rels/workbook.xml.rels';
  const relationXml=await zip.file(relationships)!.async('string');
  zip.file(relationships,relationXml.replace(/Target="(worksheets\/[^"]+)"/g,'Target="/xl/$1"'));
  const file=new File([await zip.generateAsync({type:'arraybuffer'})],'prefixed.xlsx');
  const {sheets,skippedSheets}=await readCustomerExcel(file);
  assert.deepEqual(skippedSheets,[]);
  assert.equal(sheets.length,2);
  const customerSheet=sheets[0];
  const rows=mapCustomerExcelRows(customerSheet,guessCustomerColumns(customerSheet.headers));
  assert.equal(rows.length,147);
  assert.equal(rows[0].rowNumber,2);
  assert.equal(rows[0].data.name,'Khách 1 & <Mẫu>');
  assert.equal(rows[146].rowNumber,148);
  assert.equal(rows[146].data.notes,'Dòng cuối');
  assert.equal(sheets[1].rows.length,1);
});

test('limits reject 501 populated rows and data outside 30 columns',async()=>{
  const rows=[['Tên khách hàng','SĐT'],...Array.from({length:501},(_,index)=>['Khách '+index,'0912345678'])];
  await assert.rejects(()=>fileFrom(workbookWith(rows)).then(readCustomerExcel),/500 dòng/);
  const wide=workbookWith([['Tên khách hàng','SĐT'],['A','0912345678']]);
  wide.worksheets[0].getCell('AE2').value='Ngoài giới hạn';
  await assert.rejects(()=>fileFrom(wide).then(readCustomerExcel),/30 cột/);
  wide.addWorksheet('Khách khác').addRows([['Tên khách hàng','SĐT'],['Khách B','0912345678']]);
  const {sheets,skippedSheets}=await readCustomerExcel(await fileFrom(wide));
  assert.deepEqual(sheets.map(sheet=>sheet.name),['Khách khác']);
  assert.match(skippedSheets[0],/Khách hàng.*30 cột/);
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

test('staff template starts empty and supports all fields, text phones and Excel follow-up dates', async()=>{
  const blob=await readFile('public'+PROSPECT_TEMPLATE_URL);
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(blob).buffer);
  const sheet=workbook.getWorksheet('Khách hàng')!;
  assert.equal(sheet.getCell('B2').numFmt,'@');
  assert.equal(sheet.getCell('K2').numFmt,'dd/mm/yyyy');
  assert.equal(sheet.getCell('H2').dataValidation.type,'list');
  assert.equal(sheet.getCell('I501').dataValidation.type,'list');
  const input=await readCustomerExcel(await fileFrom(workbook));
  assert.equal(input.sheets[0].rows.length,0);
  const mapping=guessCustomerColumns(input.sheets[0].headers,prospectExcelFields);
  assert.deepEqual(Object.values(mapping),Array.from({length:11},(_,i)=>i));
  sheet.getCell('A2').value='Khách thử';
  sheet.getCell('B2').value='0912345678';
  sheet.getCell('H2').value='Đang tư vấn';
  sheet.getCell('I2').value='Cao';
  sheet.getCell('K2').value=new Date('2026-12-01T00:00:00Z');
  sheet.getCell('A3').value='Khách tiếp theo';
  sheet.getCell('K3').value='2/12/2026';
  const filled=await readCustomerExcel(await fileFrom(workbook));
  const rows=mapCustomerExcelRows(filled.sheets[0],mapping,prospectExcelFields);
  assert.equal(rows[0].rowNumber,2);
  assert.equal(rows[0].data.phone,'0912345678');
  assert.equal(rows[0].data.status,'Đang tư vấn');
  assert.equal(rows[0].data.priority,'Cao');
  assert.equal(rows[0].data.nextFollowUp,'2026-12-01');
  assert.equal(rows[1].data.nextFollowUp,'2026-12-02');
});
