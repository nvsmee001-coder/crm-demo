'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AccountProjectProgress } from '../lib/project-progress';
import styles from './SalesWorkflow.module.css';

const day = (value:string) => value ? value.slice(0,10).split('-').reverse().join('/') : 'Chưa đặt';

export default function AccountProjectPanel({customerId}:{customerId:string}) {
  const [projects,setProjects] = useState<AccountProjectProgress[]|null>(null);
  const [error,setError] = useState('');
  const [refresh,setRefresh] = useState(0);

  useEffect(()=>{
    const controller=new AbortController();
    let loading=false;
    async function load() {
      if (loading) return;
      loading=true;
      try {
        const response=await fetch(`/api/crm/customers/${encodeURIComponent(customerId)}/projects`,{cache:'no-store',signal:controller.signal});
        const body=await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if ([401,403,404].includes(response.status)) setProjects(null);
          throw Error(body.error || 'Chưa tải được tiến độ dự án.');
        }
        setProjects(body.projects);
        setError('');
      } catch(error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Chưa tải được tiến độ dự án.');
      } finally {loading=false;}
    }
    void load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30_000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[customerId,refresh]);

  return <section className={styles.workflow} aria-label="Tiến độ dự án của khách hàng">
    <header className={styles.heading}><h3>Tiến độ dự án</h3><button className="btn small" onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={13}/>Tải lại tiến độ</button></header>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {!projects&&!error&&<p role="status">Đang tải tiến độ…</p>}
    {projects?.length===0&&<p>Khách hàng này chưa có dự án.</p>}
    <ul className={styles.rows}>{projects?.map(item=><li key={item.id}>
      <div><strong>{item.name}</strong><small>{item.status} · Hạn {day(item.dueDate)}</small>
        {item.acceptedAt&&<small>Nghiệm thu {new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(item.acceptedAt))}</small>}
        <p>{item.tasksTotal?`${item.tasksTotal-item.open.tasks}/${item.tasksTotal} công việc hoàn tất`:'Chưa có công việc'} · {item.open.contents} nội dung chưa đăng · {item.open.issues} vướng mắc mở</p>
      </div>
    </li>)}</ul>
  </section>;
}
