// Development/test database only. Never use this server for production data.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const port = Number(process.env.SMEE_TEST_PG_PORT || 55439);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid test port');
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`Temporary PostgreSQL-compatible test server listening on 127.0.0.1:${port}. Data is memory-only.`);
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await server.stop(); await db.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
