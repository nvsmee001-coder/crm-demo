'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CalendarDays, Check, FileText, FolderKanban, ListChecks, Plus, RefreshCw } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';
import type { Command } from '../lib/crm-types';
import { TASK_STATUSES } from '../lib/crm-types';
import type { DeliveryContent, DeliveryDashboard, DeliveryIssue, DeliveryProject, DeliveryTask } from '../lib/delivery-types';
import styles from './DeliveryWorkspace.module.css';

const tabs=[['tasks','Công việc',ListChecks],['contents','Nội dung',FileText],['issues','Vướng mắc',AlertCircle]] as const;
type Tab=typeof tabs[number][0];
type Editor=
  | {kind:'task';item:DeliveryTask;revision:number}
  | {kind:'content';item:DeliveryContent;revision:number}
  | {kind:'resolve';item:DeliveryIssue;revision:number}
  | {kind:'issue';project:DeliveryProject;revision:number};
const dateLabel=(date:string)=>date?date.slice(0,10).split('-').reverse().join('/'):'Chưa có hạn';
const workLink=(url:string)=>url?.startsWith('/api/uploads/')||/^https?:\/\//i.test(url)?url:'';
const closedIssue=(issue:DeliveryIssue)=>['Đã xử lý','Đã giải quyết'].includes(issue.status);

export default function DeliveryWorkspace() {
  const [dashboard,setDashboard]=useState<DeliveryDashboard|null>(null);
  const [projectId,setProjectId]=useState('');
  const [tab,setTab]=useState<Tab>('tasks');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [editor,setEditor]=useState<Editor|null>(null);
  const [formError,setFormError]=useState('');
  const request=useRef(0);
  const saving=useRef(false);
  const dialog=useRef<HTMLDialogElement>(null);

  async function load(signal?:AbortSignal) {
    const version=++request.current;
    setLoading(true);
    try {
      const response=await fetch('/api/delivery',{cache:'no-store',signal});
      const body=await response.json();
      if(signal?.aborted||version!==request.current)return;
      if(!response.ok) {
        if(response.status===401||response.status===403){setDashboard(null);setEditor(null);}
        throw Error(body.error||'Chưa tải được việc triển khai.');
      }
      const next=body as DeliveryDashboard;
      setDashboard(next);setError('');
      setProjectId(current=>next.projects.some(project=>project.id===current)?current:next.projects[0]?.id||'');
    } catch(error) {
      if(!signal?.aborted&&version===request.current)setError(error instanceof Error?error.message:'Chưa tải được việc triển khai.');
    } finally {if(!signal?.aborted&&version===request.current)setLoading(false);}
  }

  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal);
    const interval=setInterval(()=>{if(!saving.current&&document.visibilityState==='visible')void load(controller.signal);},30_000);
    return ()=>{clearInterval(interval);controller.abort();};
  },[]);
  useEffect(()=>{
    if(editor&&!dialog.current?.open)dialog.current?.showModal();
    else if(!editor&&dialog.current?.open)dialog.current.close();
  },[editor]);

  function openEditor(draft:Editor) {setFormError('');setNotice('');setEditor(draft);}

  async function save(command:Omit<Command,'expectedRevision'>,revision:number) {
    if (saving.current) return;
    saving.current=true;setBusy(true);setFormError('');setNotice('');
    try {
      const response=await fetch('/api/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...command,expectedRevision:revision})});
      const body=await response.json();
      if(!response.ok) {
        if (response.status===401||response.status===403) await load();
        if (response.status===409) {
          await load();
          throw Error('Dữ liệu vừa thay đổi. Bản nháp vẫn còn. Bạn có thể sao chép nội dung rồi mở lại mục để đối chiếu.');
        }
        throw Error(body.error||'Chưa lưu được công việc.');
      }
      setEditor(null);setNotice('Đã lưu thay đổi.');
      await load();
    } catch(error) {
      const message=error instanceof Error?error.message:'Chưa lưu được công việc.';
      setFormError(message);setError(message);
    } finally {saving.current=false;setBusy(false);}
  }

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!editor)return;
    const fields=new FormData(event.currentTarget);
    const input=(key:string)=>String(fields.get(key)??'');
    switch(editor.kind) {
      case 'task':
        void save({action:'update',collection:'tasks',id:editor.item.id,data:{status:input('status'),hours:Number(input('hours')),deliveryResult:input('result')}},editor.revision);
        break;
      case 'content':
        void save({action:'update',collection:'contents',id:editor.item.id,data:{body:input('body')}},editor.revision);
        break;
      case 'resolve':
        void save({action:'resolve_issue',id:editor.item.id,data:{resolution:input('resolution')}},editor.revision);
        break;
      case 'issue':
        void save({action:'create',collection:'issues',data:{projectId:editor.project.id,title:input('title'),description:input('description'),priority:input('priority')}},editor.revision);
        break;
    }
  }

  const current=dashboard?.projects.find(project=>project.id===projectId);
  const editable=!!current&&current.status!=='Hoàn tất';
  const tasks=dashboard?.tasks.filter(item=>item.projectId===projectId)??[];
  const contents=dashboard?.contents.filter(item=>item.projectId===projectId)??[];
  const issues=dashboard?.issues.filter(item=>item.projectId===projectId)??[];
  const groups={tasks,contents,issues};
  const revision=dashboard?.revision??0;
  const editorTitle=editor?.kind==='task'?'Cập nhật công việc':editor?.kind==='content'?'Sửa bản nội dung':editor?.kind==='resolve'?'Giải quyết vướng mắc':'Báo vướng mắc';

  return <div className={styles.shell}>
    <header className={styles.header}><BrandLogo/><div><strong>{dashboard?.viewer.name||'Triển khai'}</strong><small>{dashboard?.viewer.email}</small></div>
      <a className="btn small" href="/account/password">Đổi mật khẩu</a><LogoutButton className="btn small">Đăng xuất</LogoutButton></header>
    <main className={styles.main}>
      <div className={styles.heading}><div><p className={styles.company}>{dashboard?.companyName}</p><h1>Việc triển khai</h1></div>
        <button type="button" className="btn" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={15}/>{loading?'Đang tải…':'Tải lại'}</button></div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      {notice&&<p className={styles.notice} role="status"><Check size={15}/>{notice}</p>}
      {dashboard&&!dashboard.projects.length&&<section className={styles.empty}><FolderKanban size={28}/><h2>Chưa có dự án được giao</h2><p>Dự án sẽ xuất hiện sau khi quản lý thêm bạn vào nhóm hoặc giao việc.</p></section>}
      {dashboard&&current&&<div className={styles.layout}>
        <nav aria-label="Dự án được giao" className={styles.projects}>{dashboard.projects.map(project=><button type="button" key={project.id} aria-pressed={project.id===projectId} onClick={()=>setProjectId(project.id)}>
          <FolderKanban size={18}/><span><strong>{project.name}</strong><small>{project.status} · Hạn {dateLabel(project.dueDate)}</small></span></button>)}</nav>
        <section className={styles.panel}>
          <div className={styles.heading}><div><h2>{current.name}</h2><p>{current.customerName}</p></div>{editable&&<button className="btn small" disabled={busy} onClick={()=>openEditor({kind:'issue',project:current,revision})}><Plus size={15}/>Báo vướng mắc</button>}</div>
          <dl className={styles.metadata}><div><dt>Trạng thái</dt><dd>{current.status}</dd></div><div><dt><CalendarDays size={14}/> Thời gian</dt><dd>{dateLabel(current.startDate)} – {dateLabel(current.dueDate)}</dd></div></dl>
          <p className={styles.scope}>{current.scope || 'Chưa ghi phạm vi thực hiện.'}</p>
          <nav className={styles.tabs} aria-label="Loại việc triển khai">{tabs.map(([key,label,Icon])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)}><Icon size={16}/>{label} <span>{groups[key].length}</span></button>)}</nav>
          {!groups[tab].length&&<p className={styles.muted}>Chưa có mục nào được giao cho bạn.</p>}
          <div className={styles.items}>
            {tab==='tasks'&&tasks.map(task=><article key={task.id}><div><h3>{task.name}</h3><p>{task.status} · Hạn {dateLabel(task.dueDate)} · {task.hours} giờ</p>{task.notes&&<p className={styles.copy}>{task.notes}</p>}{task.deliveryResult&&<p className={styles.copy}>Kết quả {task.deliveryResult}</p>}</div>
              {editable&&<button className="btn small" disabled={busy} onClick={()=>openEditor({kind:'task',item:task,revision})}>Cập nhật</button>}</article>)}
            {tab==='contents'&&contents.map(content=><article key={content.id}><div><h3>{content.title}</h3><p>{content.channel} · {dashboard.contentApprovalRequired&&content.status==='Sẵn sàng đăng'?(content.publicationApproved?'Đã duyệt':'Chờ duyệt'):content.status} · Phiên bản {content.version}</p>{content.body&&<p className={styles.copy}>{content.body}</p>}{content.feedback&&<p className={styles.copy}>Phản hồi {content.feedback}</p>}{content.publicationFeedback&&<p className={styles.copy}>Trả lại · {content.publicationFeedback}</p>}{workLink(content.url)&&<a href={workLink(content.url)} target="_blank" rel="noopener noreferrer">Mở tài liệu</a>}</div>
              {editable&&content.status!=='Đã đăng'&&<div className="button-row"><button className="btn small" disabled={busy} onClick={()=>openEditor({kind:'content',item:content,revision})}>Sửa bản nội dung</button>
              {content.status!=='Sẵn sàng đăng'&&<button className="btn small" disabled={busy||!content.body.trim()} onClick={()=>void save({action:'update',collection:'contents',id:content.id,data:{status:'Sẵn sàng đăng'}},revision)}>{dashboard.contentApprovalRequired?'Gửi duyệt':'Sẵn sàng đăng'}</button>}</div>}</article>)}
            {tab==='issues'&&issues.map(issue=><article key={issue.id}><div><h3>{issue.title}</h3><p>{issue.priority} · {issue.status}</p>{issue.description&&<p className={styles.copy}>{issue.description}</p>}{issue.resolution&&<p className={styles.copy}>Kết quả {issue.resolution}</p>}</div>
              {editable&&!closedIssue(issue)&&<div className="button-row">{issue.status==='Đang mở'&&<button className="btn small" disabled={busy} onClick={()=>void save({action:'update',collection:'issues',id:issue.id,data:{status:'Đang xử lý'}},revision)}>Bắt đầu xử lý</button>}<button className="btn small" disabled={busy} onClick={()=>openEditor({kind:'resolve',item:issue,revision})}>Giải quyết</button></div>}</article>)}
          </div>
        </section>
      </div>}
    </main>
    <dialog ref={dialog} className={styles.dialog} aria-label={editorTitle} onCancel={event=>{event.preventDefault();if(!busy)setEditor(null);}}>
      {editor&&<form onSubmit={submit}>
        <h2>{editorTitle}</h2>
        {formError&&<div className="form-error" role="alert">{formError}</div>}
        {editor.kind==='task'&&<><p>{editor.item.name}</p><label>Trạng thái<select name="status" defaultValue={editor.item.status}>{TASK_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label>
          <label>Số giờ thực tế<input name="hours" type="number" min={0} max={100000} step="any" defaultValue={editor.item.hours} required/></label>
          <label>Kết quả công việc<textarea name="result" defaultValue={editor.item.deliveryResult||''} maxLength={30000} rows={4}/></label></>}
        {editor.kind==='content'&&<><p>{editor.item.title}</p><label>Bản nội dung<textarea name="body" defaultValue={editor.item.body} maxLength={30000} rows={8}/></label></>}
        {editor.kind==='resolve'&&<><p>{editor.item.title}</p><label>Kết quả xử lý<textarea name="resolution" required maxLength={30000} rows={4}/></label></>}
        {editor.kind==='issue'&&<><p>{editor.project.name}</p><label>Tiêu đề<input name="title" required maxLength={30000}/></label><label>Mức ưu tiên<select name="priority"><option>Bình thường</option><option>Cao</option><option>Khẩn cấp</option></select></label>
          <label>Mô tả vướng mắc<textarea name="description" required maxLength={30000} rows={4}/></label></>}
        <div className="button-row"><button className="btn" type="button" disabled={busy} onClick={()=>setEditor(null)}>Hủy</button><button className="btn primary" type="submit" disabled={busy}>{busy?'Đang lưu…':'Lưu thay đổi'}</button></div>
      </form>}
    </dialog>
  </div>;
}
