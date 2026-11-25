/** Decode XLSX in the browser. Only mapped customer fields are sent for staff preflight. */
import type { Cell, CellValue } from 'exceljs';
import { compatibleXlsx } from './xlsx-compat.js';

export const CUSTOMER_EXCEL_MAX_BYTES = 5 * 1024 * 1024;
export const CUSTOMER_EXCEL_MAX_ROWS = 500;
const MAX_UNCOMPRESSED = 30 * 1024 * 1024;
const MAX_COLUMNS = 30;
const HEADER_SCAN_ROWS = 15;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type CustomerExcelRow = { rowNumber: number; cells: string[]; numericColumns?: number[]; cellIssues?: Record<number,string> };
export type CustomerExcelSheet = { name: string; headers: string[]; rows: CustomerExcelRow[] };
export type CustomerExcelWorkbook = { sheets: CustomerExcelSheet[]; skippedSheets: string[] };
export type CustomerColumnMapping = Record<string, number>;
type MappedExcelRow = { rowNumber:number; data:Record<string,unknown>; issue?:string };
const contactColumns = [
  {key:'name',label:'Tên khách hàng',required:true},
  {key:'phone',label:'Số điện thoại',required:true},
  {key:'contact',label:'Người liên hệ'},
  {key:'email',label:'Email'},
  {key:'industry',label:'Ngành nghề'},
  {key:'source',label:'Nguồn khách'},
] as const;
export const CUSTOMER_EXCEL_FIELDS = [
  ...contactColumns,
  {key:'notes',label:'Ghi chú'},
  {key:'address',label:'Địa chỉ'},
  {key:'website',label:'Website'},
  {key:'jobTitle',label:'Chức danh'},
] as const;
export type CustomerExcelField = { key: string; label: string; required?: boolean };
export const PROSPECT_TEMPLATE_URL = '/templates/SMEE-mau-khach-khai-thac.xlsx';
export const prospectExcelFields: readonly CustomerExcelField[] = [
  ...contactColumns,
  {key:'notes',label:'Nhu cầu / Ghi chú'},
  {key:'status',label:'Trạng thái'},
  {key:'priority',label:'Mức ưu tiên'},
  {key:'nextAction',label:'Việc tiếp theo'},
  {key:'nextFollowUp',label:'Ngày chăm sóc tiếp theo'},
];
const folded = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');

/** Check directory sizes before handing an archive to the workbook decoder. */
function preflightXlsx(buffer:ArrayBuffer):void {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  const invalid = () => new Error('File Excel không hợp lệ hoặc bị hỏng. Hãy lưu lại dưới định dạng .xlsx rồi thử lại.');
  if (buffer.byteLength < 22 || view.getUint32(0,true) !== 0x04034b50) throw invalid();
  let end = -1;
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0,buffer.byteLength - 65557); offset--) {
    if (view.getUint32(offset,true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20,true) === buffer.byteLength) { end = offset; break; }
  }
  if (end < 0) throw invalid();
  const entries = view.getUint16(end + 10,true), length = view.getUint32(end + 12,true), start = view.getUint32(end + 16,true);
  if (view.getUint16(end + 4,true) !== 0 || view.getUint16(end + 6,true) !== 0 || view.getUint16(end + 8,true) !== entries || entries === 0 || entries > 5000 || length === 0xffffffff || start === 0xffffffff || start + length !== end) throw invalid();
  let cursor = start, total = 0;
  const decoder = new TextDecoder();
  const names = new Set<string>();
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || view.getUint32(cursor,true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(cursor + 8,true), method = view.getUint16(cursor + 10,true);
    const compressed = view.getUint32(cursor + 20,true), uncompressed = view.getUint32(cursor + 24,true);
    const nameLength = view.getUint16(cursor + 28,true), extraLength = view.getUint16(cursor + 30,true), commentLength = view.getUint16(cursor + 32,true);
    const local = view.getUint32(cursor + 42,true), next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || local + 30 > start || view.getUint32(local,true) !== 0x04034b50 || compressed === 0xffffffff || uncompressed === 0xffffffff) throw invalid();
    if ((flags & 1) !== 0) throw new Error('File có mật khẩu. Hãy bỏ mật khẩu và lưu bản .xlsx trước khi nhập.');
    if (method !== 0 && method !== 8) throw invalid();
    const localName = view.getUint16(local + 26,true), localExtra = view.getUint16(local + 28,true);
    if (local + 30 + localName + localExtra + compressed > start) throw invalid();
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED || uncompressed > MAX_UNCOMPRESSED || (uncompressed > 1024 * 1024 && uncompressed > Math.max(compressed,1) * 250)) throw new Error('File Excel quá lớn sau khi giải nén. Hãy tạo file gọn chỉ chứa dữ liệu khách hàng, tối đa 500 dòng.');
    const name = decoder.decode(bytes.subarray(cursor + 46,cursor + 46 + nameLength));
    if (names.has(name)) throw invalid();
    names.add(name);
    cursor = next;
  }
  if (cursor !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw invalid();
}

function readCell(cell:Cell, sheet:string):{text:string;numeric?:boolean;issue?:string} {
  const issue=(message:string)=>({text:'',issue:`Ô ${sheet}!${cell.address} ${message}`});
  let value:CellValue=cell.value;
  if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    // The formula value snapshot omits falsy results such as 0 and false.
    const cached=value.result ?? cell.result;
    if (cached === undefined || cached === null) {
      return issue('chứa công thức chưa có kết quả lưu. Hãy mở và lưu lại file trong Excel hoặc Dán giá trị (Paste Values).');
    }
    value = cached;
  }
  if (value === null || value === undefined) return {text:''};
  if (typeof value === 'string') {
    return value.length > 30000 ? issue('quá dài (tối đa 30.000 ký tự).') : {text:value.trim()};
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? {text:String(value),numeric:true} : issue('không phải số hợp lệ.');
  }
  if (typeof value === 'boolean') return {text:value ? 'Có' : 'Không'};
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? {text:value.toISOString().slice(0,10)} : issue('chứa ngày không hợp lệ.');
  }
  if ('error' in value) return issue('chứa lỗi Excel. Hãy sửa ô này trước khi nhập.');
  const text = 'richText' in value ? value.richText.map(part => part.text).join('') : 'text' in value ? String(value.text || '') : '';
  return text.length > 30000 ? issue('quá dài (tối đa 30.000 ký tự).') : {text:text.trim()};
}

class SheetLimitError extends Error {}

export async function readCustomerExcel(file:File):Promise<CustomerExcelWorkbook> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error(/\.xls$/i.test(file.name) ? 'File .xls chưa được hỗ trợ. Mở file bằng Excel và chọn Lưu thành .xlsx.' : 'Vui lòng chọn file Excel có đuôi .xlsx.');
  if (!file.size) throw new Error('File Excel đang trống.');
  if (file.size > CUSTOMER_EXCEL_MAX_BYTES) throw new Error('File Excel tối đa 5 MB. Hãy tách file lớn thành các lần nhập nhỏ hơn.');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > CUSTOMER_EXCEL_MAX_BYTES) throw new Error('File Excel tối đa 5 MB.');
  preflightXlsx(buffer);
  const module = await import('exceljs');
  const workbook = new (module.Workbook || module.default.Workbook)();
  try { await workbook.xlsx.load(await compatibleXlsx(buffer)); }
  catch { throw new Error('Không đọc được file Excel. Kiểm tra file không có mật khẩu và lưu lại dưới định dạng .xlsx.'); }
  const sheets:CustomerExcelSheet[] = [];
  const skippedSheets:string[] = [];
  if (workbook.worksheets.length > 30) throw new Error('File có quá nhiều trang tính. Hãy giữ tối đa 30 trang tính cần nhập.');
  for (const worksheet of workbook.worksheets) {
    if (worksheet.state !== 'visible') continue;
    const nonempty:CustomerExcelRow[] = [];
    let width = 0;
    const tooManyRows = () => new SheetLimitError(`Trang “${worksheet.name}” vượt quá 500 dòng dữ liệu. Hãy tách file và nhập từng phần.`);
    try {
      worksheet.eachRow({includeEmpty:false}, row => {
        const cells:string[] = [], numericColumns:number[] = [];
        const cellIssues:Record<number,string> = {};
        row.eachCell({includeEmpty:false}, (cell,column) => {
          const value = readCell(cell,worksheet.name);
          if (!value.text && !value.issue) return;
          if (column > MAX_COLUMNS) throw new SheetLimitError(`Trang “${worksheet.name}” có dữ liệu ngoài 30 cột. Hãy giữ lại các cột khách hàng cần nhập.`);
          width = Math.max(width,column);
          cells[column - 1] = value.text;
          if (value.issue) cellIssues[column - 1] = value.issue;
          if (value.numeric) numericColumns.push(column - 1);
        });
        if (cells.length) nonempty.push({rowNumber:row.number,cells,numericColumns,...(Object.keys(cellIssues).length ? {cellIssues} : {})});
        if (nonempty.length > CUSTOMER_EXCEL_MAX_ROWS + HEADER_SCAN_ROWS) throw tooManyRows();
      });
      if (!nonempty.length) continue;
      const index = nonempty.slice(0,HEADER_SCAN_ROWS).findIndex(row => {
        const mapping = guessCustomerColumns(Array.from(row.cells,cell=>cell ?? ''));
        return mapping.name >= 0 && mapping.phone >= 0;
      });
      const headerIndex = Math.max(index,0);
      const rows = nonempty.slice(headerIndex+1);
      if (rows.length > CUSTOMER_EXCEL_MAX_ROWS) throw tooManyRows();
      const headers = Array.from({length:width},(_,index) => nonempty[headerIndex].cells[index] || `Cột ${index + 1}`);
      sheets.push({name:worksheet.name,headers,rows:rows.map(row=>({...row,cells:Array.from({length:width},(_,index)=>row.cells[index] || '')}))});
    } catch (error) {
      if (!(error instanceof SheetLimitError)) throw error;
      skippedSheets.push(error.message);
    }
  }
  if (!sheets.length) throw new Error(skippedSheets[0] || 'File không có trang tính hiển thị chứa dữ liệu.');
  return {sheets,skippedSheets};
}

const aliases:Record<string,string[]> = {
  name:['tenkhachhang','tenkhach','khachhang','tencongty','congty','tencongtykhachhang','tendoanhnghiep','customername','companyname','company','name','hovaten','hoten','ten'],
  phone:['sodienthoai','dienthoai','dienthoaichinh','sodienthoaichinh','sodienthoaikhachhang','sdt','sdtkhachhang','dt','phone','phonenumber','mobile','tel'],
  contact:['nguoilienhe','nguoilienhechinh','tennguoilienhe','contact','contactname'],
  email:['email','emailchinh','diachiemail','thu dientu'],
  industry:['nganh','nganhnghe','linhvuc','industry'],
  source:['nguon','nguonkhach','nguonkhachhang','source','leadsource'],
  notes:['ghichu','nhucau','notes','note','mota','nhucaughichu','nhucaughichutongquan'],
  address:['diachi','address'],
  website:['website','trangweb','web'],
  jobTitle:['chucdanh','chucvu','chucdanhnguoilienhe','jobtitle','position'],
  status:['trangthai','trangthaikhachhang','status'],
  priority:['mucuutien','uutien','priority'],
  nextAction:['viectieptheo','buoctieptheo','hanhdongtieptheo','nextaction'],
  nextFollowUp:['ngaychamsoctieptheo','ngaychamsoc','ngayhen','lichhen','ngaylienhetiep','nextfollowup'],
};
export function guessCustomerColumns(headers:string[], fields:readonly CustomerExcelField[]=CUSTOMER_EXCEL_FIELDS):CustomerColumnMapping {
  const result:CustomerColumnMapping = {};
  const used = new Set<number>();
  for (const field of fields) {
    const names = aliases[field.key].map(folded);
    const index = headers.findIndex((header,index) => !used.has(index) && names.includes(folded(header)));
    result[field.key] = index;
    if (index >= 0) used.add(index);
  }
  return result;
}

export function mapCustomerExcelRows(sheet:CustomerExcelSheet,mapping:CustomerColumnMapping,fields:readonly CustomerExcelField[]=CUSTOMER_EXCEL_FIELDS):MappedExcelRow[] {
  const used = new Set<number>();
  const fieldKeys = new Set(fields.map(field => field.key));
  for (const [key,index] of Object.entries(mapping)) {
    if (!fieldKeys.has(key)) continue;
    if (index === -1) continue;
    if (!Number.isInteger(index) || index < 0 || index >= sheet.headers.length) throw new Error('Cột dữ liệu được chọn không hợp lệ.');
    if (used.has(index)) throw new Error('Mỗi cột Excel chỉ được ghép với một trường khách hàng.');
    used.add(index);
  }
  if (!(mapping.name >= 0) || !(mapping.phone >= 0)) throw new Error('Hãy chọn cột Tên khách hàng và Số điện thoại.');
  const result:MappedExcelRow[] = [];
  for (const row of sheet.rows) {
    const data:Record<string,unknown> = {};
    let issue:string|undefined;
    for (const field of fields) {
      const index = mapping[field.key];
      if (index === undefined || index < 0) continue;
      issue ??= row.cellIssues?.[index];
      let value = (row.cells[index] || '').trim();
      if (field.key === 'phone' && row.numericColumns?.includes(index) && /^[35789]\d{8}$/.test(value)) value = '0' + value;
      if (field.key === 'nextFollowUp') {
        const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
        if (parts) value = parts[3]+'-'+parts[2].padStart(2,'0')+'-'+parts[1].padStart(2,'0');
      }
      data[field.key] = value;
    }
    if (issue || Object.values(data).some(Boolean)) result.push({rowNumber:row.rowNumber,data,...(issue ? {issue} : {})});
  }
  return result;
}

export async function createCustomerTemplate():Promise<Blob> {
  const module = await import('exceljs');
  const workbook = new (module.Workbook || module.default.Workbook)();
  workbook.creator = 'SMEE agency';
  workbook.subject = 'Mẫu nhập khách hàng vào SMEE CRM';
  const sheet = workbook.addWorksheet('Khách hàng');
  sheet.columns = CUSTOMER_EXCEL_FIELDS.map(field => ({header:field.label,key:field.key,width:field.key === 'notes' ? 45 : field.key === 'name' ? 33 : 25}));
  sheet.getColumn('phone').numFmt = '@';
  sheet.addRow({name:'KHÁCH MẪU 01 — XÓA TRƯỚC KHI NHẬP',phone:'+12025550110',contact:'Liên hệ mẫu 01',email:'mau01@example.com',industry:'Dịch vụ',source:'File Excel',notes:'Dòng minh họa. Xóa và thay bằng khách hàng thực tế.',address:'Địa chỉ mẫu',website:'https://example.com',jobTitle:'Người phụ trách'});
  sheet.addRow({name:'KHÁCH MẪU 02 — XÓA TRƯỚC KHI NHẬP',phone:'+12025550111',contact:'Liên hệ mẫu 02',email:'mau02@example.com',industry:'Thương mại',source:'Giới thiệu',notes:'Dòng minh họa. Số điện thoại cần giữ ở định dạng Văn bản (Text).'});
  sheet.views = [{state:'frozen',ySplit:1}];
  sheet.autoFilter = {from:'A1',to:'J1'};
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell(cell => {cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE92B22'}};cell.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'},size:11};cell.alignment={vertical:'middle',wrapText:true};});
  for (const rowNumber of [2,3]) {sheet.getRow(rowNumber).height=42;sheet.getRow(rowNumber).eachCell(cell=>{cell.font={name:'Arial',size:11,color:{argb:'FF52525B'}};cell.alignment={vertical:'middle',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:rowNumber===2?'FFFFF1F0':'FFFFFFFF'}};});}
  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 110;
  for (const text of ['HƯỚNG DẪN NHẬP KHÁCH HÀNG — SMEE CRM','1. Dùng trang Khách hàng. Xóa hai dòng mẫu và điền dữ liệu của công ty.','2. Bắt buộc có Tên khách hàng và Số điện thoại. Giữ số điện thoại ở định dạng Văn bản để không mất số 0 đầu.','3. Số 09…, +849… và 849… được chuẩn hóa để phát hiện trùng. Số trùng trong file hoặc CRM sẽ được báo ở màn hình xem trước.','4. Các cột khác không bắt buộc. Có thể ghép lại tên cột khi nhập.','5. Tối đa 500 dòng khách hàng và file 5 MB mỗi lần. Với công thức chưa có kết quả lưu, hãy Dán giá trị trước khi nhập.','6. Chỉ những dòng hợp lệ được chọn mới được nhập sau khi bạn xác nhận. Phân chia telesales là bước riêng sau khi nhập.']) guide.addRow([text]);
  guide.eachRow(row=>{row.height=34;row.alignment={wrapText:true,vertical:'middle'};row.font={name:'Arial',size:11};});
  guide.getRow(1).font={name:'Arial',bold:true,color:{argb:'FFB71F1A'},size:14};
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)],{type:XLSX_TYPE});
}
