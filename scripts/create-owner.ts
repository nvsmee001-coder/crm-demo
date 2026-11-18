import { provisionOwner } from '../lib/auth/store';
import { pool } from '../lib/database';
import { readAuthInput } from './auth-cli-input';
try{const input=await readAuthInput();await provisionOwner(input.email,input.password,input.displayName);console.log('Đã tạo tài khoản chủ sở hữu. Mở website và đăng nhập bằng email/mật khẩu vừa đặt.');}
catch(error){console.error(error instanceof Error?error.message:'Không thể tạo chủ sở hữu.');process.exitCode=1;}
finally{await pool.end()}
