import React, { useRef, useState } from 'react';

export type Profile = { name:string; email:string; experienceYears:number; targetRole:string; resumeText:string; jobDescription:string };

export function ProfileForm({ profile, setProfile, onSave, onResumeUpload, jobUrl, setJobUrl, onJobUrlImport, jobUrlLoading, loading, saved }: { profile: Profile; setProfile: (p:Profile)=>void; onSave:()=>void; loading:boolean; saved:boolean; onResumeUpload:(file:File)=>Promise<void>; jobUrl:string; setJobUrl:(value:string)=>void; onJobUrlImport:()=>void; jobUrlLoading:boolean }) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const valid = profile.name && profile.email && profile.targetRole && profile.resumeText.length >= 20 && profile.jobDescription.length >= 20;
  const update = (key: keyof Profile, value: string | number) => setProfile({ ...profile, [key]: value });
  async function upload(file: File) { setUploading(true); try { await onResumeUpload(file); } finally { setUploading(false); } }
  return <section className="card profileCard">
    <div className="cardHeader"><div><span className="eyebrow">INTERVIEW PROFILE</span><h2>Resume & target job</h2><p>Use the resume and job description you want the AI interviewer to prepare against.</p></div><button className="secondary" onClick={onSave} disabled={loading || !valid}>{loading ? 'Saving...' : 'Save profile'}</button></div>
    <div className="profileGrid">
      <label>Name<input value={profile.name} onChange={e=>update('name',e.target.value)} /></label>
      <label>Email<input type="email" value={profile.email} onChange={e=>update('email',e.target.value)} /></label>
      <label>Experience (years)<input type="number" min="0" value={profile.experienceYears} onChange={e=>update('experienceYears',Number(e.target.value))} /></label>
      <label>Target role<input value={profile.targetRole} placeholder="e.g. Senior Node.js Engineer" onChange={e=>update('targetRole',e.target.value)} /></label>
    </div>
    <div className="uploadRow"><div><b>Resume file</b><p>Upload PDF or DOCX, up to 5 MB.</p></div><button type="button" className="secondary" onClick={()=>fileInput.current?.click()} disabled={uploading}>{uploading ? 'Extracting...' : 'Upload resume'}</button><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={e=>{const file=e.target.files?.[0]; if(file) upload(file).catch(()=>{}); e.currentTarget.value='';}} /></div>
    <label>Resume<textarea className="profileTextarea" value={profile.resumeText} placeholder="Paste your resume text here..." onChange={e=>update('resumeText',e.target.value)} /></label>
    <div className="jobUrlRow"><input value={jobUrl} placeholder="Paste job description URL" onChange={e=>setJobUrl(e.target.value)} /><button type="button" className="secondary" onClick={onJobUrlImport} disabled={jobUrlLoading || !jobUrl.trim()}>{jobUrlLoading ? 'Importing...' : 'Import from URL'}</button></div>
    <label>Job description<textarea className="profileTextarea" value={profile.jobDescription} placeholder="Paste the target job description here..." onChange={e=>update('jobDescription',e.target.value)} /></label>
    {saved && <div className="savedNotice">Profile saved. Run <b>Analyze skills</b> to refresh the job fit and interview priorities.</div>}
  </section>;
}