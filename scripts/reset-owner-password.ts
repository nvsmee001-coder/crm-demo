import { resetOwnerPassword } from '../lib/auth/store';
import { pool } from '../lib/database';
import { readAuthInput } from './auth-cli-input';
try{const input=await readAuthInput(true);await resetOwnerPassword(input.password);console.log('Đã đặt lại mật khẩu chủ sở hữu và thu hồi các phiên đăng nhập cũ.');}
catch(error){console.error(error instanceof Error?error.message:'Không thể đặt lại mật khẩu.');process.exitCode=1;}
finally{await pool.end()}
