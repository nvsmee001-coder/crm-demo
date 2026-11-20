'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ProjectAssignment } from '../lib/delivery-types';

export default function ProjectMembersForm({projectId,onSave,onClose}:{projectId:string;onSave:()=>void;onClose:()=>void}) {
  const [assignment,setAssignment]=useState<ProjectAssignment|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [conflict,setConflict]=useState(false);
  const url='/api/projects/'+encodeURIComponent(projectId)+'/participants';

  async function load(signal?:AbortSignal) {
    setLoading(true);setError('');
    try {
      const response=await fetch(url,{cache:'no-store',signal});
      const body=await response.json();
      if(signal?.aborted)return;
      if(!response.ok)throw Error(body.error||'Chưa tải được nhóm triển khai.');
      const data=body as ProjectAssignment;
      setAssignment(data);setSelected(data.members);setConflict(false);
    } catch(error) {
      if(!signal?.aborted)setError(error instanceof Error?error.message:'Chưa tải được nhóm triển khai.');
    } finally {if(!signal?.aborted)setLoading(false);}
  }

  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[projectId]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!assignment||saving||loading||conflict)return;
    setSaving(true);setError('');
    try {
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({memberIds:selected,expectedRevision:assignment.revision})});
      const body=await response.json();
      if(!response.ok) {
        if(response.status===409)setConflict(true);
        throw Error(body.error||'Chưa lưu được nhóm triển khai.');
      }
      onSave();
    } catch(error) {setError(error instanceof Error?error.message:'Chưa lưu được nhóm triển khai.');}
    finally {setSaving(false);}
  }

  return <form onSubmit={submit}>
    <p>Thành viên nhóm thấy thông tin dự án. Người được giao một công việc, nội dung hoặc vướng mắc cũng thấy thông tin dự án đó.</p>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {loading&&<p role="status">Đang tải danh sách nhân sự…</p>}
    {!loading&&assignment&&!assignment.candidates.length&&<p className="hint">Chưa có tài khoản Triển khai đã kích hoạt. Chủ sở hữu có thể tạo tài khoản trong Quản trị.</p>}
    <div className="detail-list">
      {assignment?.candidates.map(member=>{const checked=selected.includes(member.id);return <label key={member.id} className="detail-row">
        <span><strong>{member.name}</strong>{!member.assignable&&<small className="hint"> · Tài khoản hiện không đủ quyền</small>}</span>
        <input type="checkbox" checked={checked} disabled={loading||saving||(!member.assignable&&!checked)}
          onChange={event=>setSelected(previous=>event.target.checked?[...previous,member.id]:previous.filter(id=>id!==member.id))}/>
      </label>;})}
    </div>
    <div className="button-row" style={{marginTop:16}}>
      <button type="button" className="btn" disabled={saving} onClick={onClose}>Đóng</button>
      {((error&&!assignment)||conflict)&&<button type="button" className="btn" disabled={loading||saving} onClick={()=>void load()}>Tải lại danh sách</button>}
      <button className="btn primary" type="submit" disabled={!assignment||loading||saving||conflict}>{saving?'Đang lưu…':'Lưu nhóm triển khai'}</button>
    </div>
  </form>;
}
