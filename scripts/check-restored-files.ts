import type { QueryResult } from 'pg';
import { pool, query } from '../lib/database';
import { readFileBytes, type StoredFile } from '../lib/file-store';

let cursor: string | null = null;
let checked = 0;
try {
  // Restore runs while the application is stopped. Iterate in primary-key order
  // and reuse the private download integrity check for each restored attachment.
  for (;;) {
    const page: QueryResult<StoredFile> = await query<StoredFile>(
      'SELECT * FROM crm_files WHERE ($1::text IS NULL OR id > $1) ORDER BY id LIMIT 200',
      [cursor],
    );
    if (!page.rows.length) break;
    for (const file of page.rows) {
      try {
        await readFileBytes(file);
      } catch {
        throw new Error('Restored attachment does not match database metadata. Check the backup and upload volume.');
      }
      checked++;
    }
    cursor = page.rows[page.rows.length - 1].id;
  }
  console.log(`Verified ${checked} restored attachments.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Attachment verification failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
