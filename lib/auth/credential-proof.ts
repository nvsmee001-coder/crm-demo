import type { PoolClient } from 'pg';
import { query } from '../database';
import { verifyPassword } from './crypto';
import { AuthError } from './error';

type Proof = {id:string;credential_version:number;password_hash:string};

export async function verifyCurrentPassword(userId:string,password:unknown):Promise<Proof> {
  if (typeof password!=='string' || password.length>128 || !password) throw new AuthError('Nhập mật khẩu hiện tại.');
  const {rows:[user]}=await query<Proof>('SELECT id,credential_version,password_hash FROM auth_users WHERE id=$1',[userId]);
  if (!user || !await verifyPassword(password,user.password_hash)) throw new AuthError('Mật khẩu hiện tại không đúng.');
  return user;
}

export async function lockPasswordProof(client:PoolClient,proof:Proof) {
  const result=await client.query('SELECT id FROM auth_users WHERE id=$1 AND credential_version=$2 AND password_hash=$3 FOR UPDATE',
    [proof.id,proof.credential_version,proof.password_hash]);
  if (!result.rowCount) throw new AuthError('Tài khoản vừa thay đổi. Hãy đăng nhập lại.',409);
}
