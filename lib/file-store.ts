import { constants } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { query } from './database';
import { scanForMalware } from './malware-scan';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export class FileStoreError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type StoredFile = { id: string; owner_id: string; uploaded_by: string; name: string; content_type: string; size_bytes: number; sha256: string; created_at: string };
function directory(): string {
  const configured = process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
  if (!isAbsolute(configured)) throw new FileStoreError('UPLOAD_DIR phải là đường dẫn tuyệt đối.', 503);
  return configured;
}
export function validFileId(id: string): boolean { return FILE_ID.test(id); }
export async function validateFile(bytes: Uint8Array, declaredType: string): Promise<string> {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new FileStoreError('Mỗi tệp cần có dữ liệu và tối đa 10 MB.', 413);
  let detected;
  try { detected = await fileTypeFromBuffer(bytes); } catch { throw new FileStoreError('Không đọc được định dạng thật của tệp.', 415); }
  if (!detected || !TYPES.has(detected.mime)) throw new FileStoreError('Nội dung tệp không thuộc định dạng ảnh, PDF, MP4, DOCX hoặc XLSX được hỗ trợ.', 415);
  if (declaredType && declaredType !== 'application/octet-stream' && declaredType !== detected.mime) throw new FileStoreError('Định dạng khai báo không khớp nội dung tệp. Hãy xuất lại file đúng định dạng.', 415);
  return detected.mime;
}
export async function saveFile(input: {bytes: Uint8Array; type: string; name: string; ownerId: string; userId: string}): Promise<StoredFile> {
  const type = await validateFile(input.bytes, input.type); await scanForMalware(input.bytes);
  const id = randomUUID(), dir = directory(), destination = join(dir, id), temporary = join(dir, '.' + id + '.tmp');
  const name = input.name.normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(-140) || 'tai-lieu';
  const digest = createHash('sha256').update(input.bytes).digest('hex');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(input.bytes); await handle.sync(); }
  catch (error) { await handle.close(); await unlink(temporary).catch(() => {}); throw error; }
  await handle.close();
  try {
    await rename(temporary, destination);
    const result = await query<StoredFile>('INSERT INTO crm_files (id, owner_id, uploaded_by, name, content_type, size_bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [id,input.ownerId,input.userId,name,type,input.bytes.length,digest]);
    return result.rows[0];
  } catch (error) { await unlink(temporary).catch(() => {}); await unlink(destination).catch(() => {}); throw error; }
}
export async function fileMetadata(id: string): Promise<StoredFile | null> {
  if (!validFileId(id)) return null;
  return (await query<StoredFile>('SELECT * FROM crm_files WHERE id=$1', [id])).rows[0] || null;
}
/** Bounded read, no symlinks, integrity check before private download. */
export async function readFileBytes(file: StoredFile): Promise<Uint8Array> {
  if (!validFileId(file.id)) throw new FileStoreError('Không tìm thấy tệp.', 404);
  const handle = await open(join(directory(), file.id), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== file.size_bytes || stat.size > MAX_FILE_BYTES) throw new FileStoreError('Tệp không còn nguyên vẹn. Liên hệ quản trị để khôi phục.', 503);
    const bytes = await handle.readFile();
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new FileStoreError('Tệp không còn nguyên vẹn. Liên hệ quản trị để khôi phục.', 503);
    return bytes;
  } finally { await handle.close(); }
}
