import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
export async function readAuthInput(reset=false):Promise<{email?:string;displayName?:string;password:string}>{
 if(process.argv.includes('--stdin')){
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>4096)throw new Error('Dữ liệu đầu vào quá lớn.');}
  let data:unknown;try{data=JSON.parse(input)}catch{throw new Error('Đầu vào cần JSON hợp lệ, không ghi nội dung bí mật vào nhật ký.')}
  if(!data || typeof data!=='object' || !('password' in data) || typeof data.password!=='string')throw new Error('Đầu vào cần JSON với trường password.');
  return data as {email?:string;displayName?:string;password:string};
 }
 if(!process.stdin.isTTY)throw new Error('Chạy trong terminal tương tác hoặc dùng --stdin với JSON được cấp qua stdin. Không truyền mật khẩu trong tham số dòng lệnh.');
 let muted=false;
 const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding as BufferEncoding);callback();}});
 const rl=createInterface({input:process.stdin,output,terminal:true});
 rl.on('SIGINT',()=>{process.stdout.write('\nĐã hủy.\n');rl.close();process.exit(130)});
 async function ask(label:string,secret=false){process.stdout.write(label);muted=secret;try{return await rl.question('')}finally{muted=false;if(secret)process.stdout.write('\n')}}
 try{
  const email=reset?undefined:await ask('Email chủ sở hữu (trùng SMEE_OWNER_EMAIL): ');
  const displayName=reset?undefined:await ask('Tên hiển thị: ');
  const password=await ask('Mật khẩu mới (12–128 ký tự, không hiển thị): ',true);
  const confirm=await ask('Nhập lại mật khẩu: ',true);
  if(password!==confirm)throw new Error('Hai mật khẩu không trùng nhau.');
  return{email,displayName,password};
 }finally{rl.close()}
}
