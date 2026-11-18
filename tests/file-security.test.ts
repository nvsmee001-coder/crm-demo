import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:net';
import {validateFile,validFileId,MAX_FILE_BYTES} from '../lib/file-store';
import {scanForMalware} from '../lib/malware-scan';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=','base64');
test('file signature is verified independently of submitted MIME', async()=>{
 assert.equal(await validateFile(png,'image/png'),'image/png');
 await assert.rejects(validateFile(png,'application/pdf'), /không khớp/);
 await assert.rejects(validateFile(Buffer.from('<script>alert(1)</script>'),'image/png'), /không thuộc/);
 await assert.rejects(validateFile(new Uint8Array(MAX_FILE_BYTES+1),'image/png'), /10 MB/);
});
test('only strict v4 UUID storage keys can be resolved',()=>{
 assert.equal(validFileId('8f594f90-bc0a-4313-b510-ecfb4f9bb4ef'),true);
 for(const id of ['../../etc/passwd','-'.repeat(36),'8f594f90-bc0a-1313-b510-ecfb4f9bb4ef','8f594f90-bc0a-4313-b510-ecfb4f9bb4ef/file']) assert.equal(validFileId(id),false);
});
test('scanner uses bounded INSTREAM frames and fails closed for malware/errors', async()=>{
 const old={host:process.env.CLAMAV_HOST,port:process.env.CLAMAV_PORT,required:process.env.CLAMAV_REQUIRED};
 process.env.CLAMAV_HOST='127.0.0.1';process.env.CLAMAV_REQUIRED='true';
 let reply='stream: OK\0'; const received:Buffer[]=[];
 const server=createServer(socket=>{
  let buffer=Buffer.alloc(0), started=false;
  socket.on('data',chunk=>{
   buffer=Buffer.concat([buffer,chunk]);
   if(!started){if(buffer.length<10)return;assert.equal(buffer.subarray(0,10).toString(),'zINSTREAM\0');buffer=buffer.subarray(10);started=true;}
   while(buffer.length>=4){const length=buffer.readUInt32BE(0);if(buffer.length<4+length)return;if(length===0){socket.end(reply);return;}received.push(buffer.subarray(4,4+length));buffer=buffer.subarray(4+length);}
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');process.env.CLAMAV_PORT=String(address.port);
 try {
  await scanForMalware(png);assert.deepEqual(Buffer.concat(received),png);
  reply='stream: Eicar-Test-Signature FOUND\0';await assert.rejects(scanForMalware(png),/nguy hiểm/);
  reply='stream: scanner error ERROR\0';await assert.rejects(scanForMalware(png),/Không xác nhận/);
  reply='';await assert.rejects(scanForMalware(png),/đóng kết nối/);
 } finally {
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  for(const [key,value] of Object.entries({CLAMAV_HOST:old.host,CLAMAV_PORT:old.port,CLAMAV_REQUIRED:old.required})) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
