'use client';
import { useState, type ButtonHTMLAttributes } from 'react';
type Props=ButtonHTMLAttributes<HTMLButtonElement> & {redirectTo?:string};
export default function LogoutButton({children='Đăng xuất',className='btn',redirectTo='/login',disabled,...props}:Props){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function logout(){setBusy(true);setError('');try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('Chưa đăng xuất được. Thử lại.');window.location.assign(redirectTo.startsWith('/')&&!redirectTo.startsWith('//')?redirectTo:'/login')}catch(reason){setError(reason instanceof Error?reason.message:'Chưa đăng xuất được.');setBusy(false)}}
 return <span><button type="button" className={className} {...props} disabled={disabled||busy} onClick={()=>void logout()}>{busy?'Đang thoát…':children}</button>{error&&<small role="alert">{error}</small>}</span>;
}
