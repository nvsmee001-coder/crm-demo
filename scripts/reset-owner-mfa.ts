import { pool } from '../lib/database';
import { AuthError } from '../lib/auth/error';
import { resetOwnerMfa } from '../lib/auth/mfa-store';

async function main() {
  if (process.argv.slice(2).join(' ')!=='--confirm-reset-mfa') {
    throw new AuthError('Dùng npm run owner:mfa-reset -- --confirm-reset-mfa để xác nhận thu hồi thiết bị, mã khôi phục và các phiên cũ.');
  }
  await resetOwnerMfa();
  console.log('Đã thu hồi MFA của chủ sở hữu. Đăng nhập bằng mật khẩu hiện tại để thiết lập thiết bị mới.');
}

main().catch(error=>{
  console.error(error instanceof AuthError?error.message:'Không thể đặt lại MFA của chủ sở hữu.');
  process.exitCode=1;
}).finally(()=>pool.end());
