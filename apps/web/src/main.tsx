import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ProfileForm, type Profile } from './ProfileForm';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Evaluation = {
  technicalScore: number; depthScore: number; communicationScore: number; overallScore: number;
  feedback: string; strengths: string[]; missingConcepts: string[];
};
type Question = { interviewId: string; question: string; sequence: number; maxQuestions: number; topic?: string; difficulty?: string };
type JobGap = { name: string; priority: 'HIGH'|'MEDIUM'|'LOW'; reason: string };
type JobAnalysis = { fitScore:number; summary:string; strengths:string[]; gaps:JobGap[] };

function Score({label,value}:{label:string;value:number}) {
  return <div className="scoreBox"><span>{label}</span><strong>{value}</strong></div>;
}

function AuthScreen({ onAuth }: { onAuth: (result:any)=>void }) {
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const response=await fetch(`${API}/api/auth/${mode}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(mode==='register'?{name,email,password}:{email,password})
      });
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error || 'Authentication failed');
      onAuth(payload);
    } catch(err) { setError(err instanceof Error ? err.message : 'Authentication failed'); }
    finally { setLoading(false); }
  }

  return <main className="authPage">
    <div className="authCard">
      <div className="brandMark">AI INTERVIEW COACH</div>
      <h1>{mode==='login'?'Welcome back.':'Build your interview profile.'}</h1>
      <p>{mode==='login'?'Sign in to continue your interview journey.':'Create an account to save your interviews and progress.'}</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        {mode==='register' && <label>Name<input value={name} onChange={e=>setName(e.target.value)} required /></label>}
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        <button className="primary" disabled={loading}>{loading?'Please wait...':mode==='login'?'Sign in':'Create account'}</button>
      </form>
      <button className="linkButton" onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}}>
        {mode==='login'?'Create a new account':'Already have an account? Sign in'}
      </button>
    </div>
  </main>;
}

function App() {
  const [token,setToken]=useState(localStorage.getItem('authToken') || '');
  const [id,setId]=useState(localStorage.getItem('candidateId') || '');
  const [data,setData]=useState<any>(null);
  const [topic,setTopic]=useState('Node.js');
  const [profile,setProfile]=useState<Profile>({name:'',email:'',experienceYears:0,targetRole:'',resumeText:'',jobDescription:''});
  const [profileSaved,setProfileSaved]=useState(false);
  const [question,setQuestion]=useState<Question|null>(null);
  const [answer,setAnswer]=useState('');
  const [evaluation,setEvaluation]=useState<Evaluation|null>(null);
  const [report,setReport]=useState<any>(null);
  const [learningPlan,setLearningPlan]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [readinessHistory,setReadinessHistory]=useState<any>(null);
  const [jobUrl,setJobUrl]=useState('');
  const [jobUrlLoading,setJobUrlLoading]=useState(false);

  const jobAnalysis:JobAnalysis|null=data?.jobAnalysis||null;

  async function request(path:string,options:RequestInit={}) {
    const headers=new Headers(options.headers);
    if(token) headers.set('Authorization',`Bearer ${token}`);
    const response=await fetch(`${API}${path}`,{...options,headers});
    const payload=await response.json();
    if(response.status===401) { logout(); throw new Error('Your session has expired. Please sign in again.'); }
    if(!response.ok) throw new Error(payload.error||'Request failed');
    return payload;
  }

  async function load(candidateId=id) {
    if(!candidateId||!token) return;
    const candidate=await request(`/api/candidates/${candidateId}`);
    setData(candidate);
    request(`/api/candidates/${candidateId}/readiness`).then(setReadinessHistory).catch(()=>{});
    setProfile({name:candidate.name,email:candidate.email,experienceYears:candidate.experienceYears,targetRole:candidate.targetRole||'',resumeText:candidate.resumeText||'',jobDescription:candidate.jobDescription||''});
    setProfileSaved(Boolean(candidate.targetRole&&candidate.resumeText&&candidate.jobDescription));
  }

  useEffect(()=>{ if(token&&id) load().catch(e=>{setError(e.message);}); },[token,id]);

  function handleAuth(result:any) {
    localStorage.setItem('authToken',result.token);
    localStorage.setItem('candidateId',result.candidate.id);
    setToken(result.token); setId(result.candidate.id); setError('');
  }

  function logout() {
    localStorage.removeItem('authToken'); localStorage.removeItem('candidateId');
    setToken(''); setId(''); setData(null); setQuestion(null); setReport(null); setLearningPlan(null);
  }

  async function uploadResume(file:File) {
    setLoading(true);setError('');
    try { const form=new FormData();form.append('resume',file);const result=await request(`/api/candidates/${id}/resume`,{method:'POST',body:form});setProfile({...profile,resumeText:result.resumeText});setProfileSaved(false); }
    catch(e){setError(e instanceof Error?e.message:'Could not process resume');} finally{setLoading(false);}
  }

  async function importJobUrl() {
    if(!jobUrl.trim()) return; setJobUrlLoading(true);setError('');
    try { const result=await request(`/api/candidates/${id}/job-description/url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:jobUrl.trim()})});setProfile({...profile,jobDescription:result.jobDescription});setProfileSaved(false);setJobUrl(''); }
    catch(e){setError(e instanceof Error?e.message:'Could not import job description');} finally{setJobUrlLoading(false);}
  }

  async function saveProfile() {
    setLoading(true);setError('');
    try { const candidate=await request(`/api/candidates/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});setData({...data,...candidate,jobAnalysis:null,skills:[]});setProfileSaved(true);setReport(null);setLearningPlan(null); }
    catch(e){setError(e instanceof Error?e.message:'Could not save profile');} finally{setLoading(false);}
  }

  async function analyze() {
    setLoading(true);setError('');
    try { await request(`/api/candidates/${id}/analyze`,{method:'POST'});await load(); }
    catch(e){setError(e instanceof Error?e.message:'Analysis failed');} finally{setLoading(false);}
  }

  async function start() {
    setLoading(true);setError('');setReport(null);setEvaluation(null);setAnswer('');
    try { const result=await request('/api/interviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:id,topic,difficulty:'MEDIUM'})});setQuestion(result); }
    catch(e){setError(e instanceof Error?e.message:'Failed to start interview');} finally{setLoading(false);}
  }

  async function submit() {
    if(!question||!answer.trim()) return;setLoading(true);setError('');
    try {
      const result=await request(`/api/interviews/${question.interviewId}/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sequence:question.sequence,answer})});
      setEvaluation(result.evaluation);setAnswer('');
      if(result.completed){setQuestion(null);setReport(await request(`/api/interviews/${question.interviewId}/report`));await load();}
      else setQuestion({...question,question:result.nextQuestion,sequence:result.sequence,topic:result.topic,difficulty:result.difficulty});
    } catch(e){setError(e instanceof Error?e.message:'Evaluation failed');} finally{setLoading(false);}
  }

  async function createLearningPlan() {
    setLoading(true);setError('');
    try{setLearningPlan(await request(`/api/candidates/${id}/learning-plan`,{method:'POST'}));}
    catch(e){setError(e instanceof Error?e.message:'Could not create plan');}finally{setLoading(false);}
  }

  const readiness=useMemo(()=>report?.scores?.overall||0,[report]);
  if(!token) return <AuthScreen onAuth={handleAuth}/>;

  return <div className="appShell">
    <header className="siteHeader">
      <div className="headerInner">
        <div className="brand"><span>AI</span> Interview Coach</div>
        <nav><a href="#dashboard">Dashboard</a><a href="#history">History</a><a href="#interview">Interview</a></nav>
        <div className="account"><span>{data?.name||profile.name}</span><button className="headerButton" onClick={logout}>Sign out</button></div>
      </div>
    </header>
    <main id="dashboard">
      {error&&<div className="error">{error}</div>}
      <div className="pageIntro"><div><span className="eyebrow">DASHBOARD</span><h1>Become interview-ready.</h1><p>Practice against your target role, measure progress, and close your skill gaps.</p></div></div>
      {data&&<>
        <ProfileForm profile={profile} setProfile={setProfile} onSave={saveProfile} onResumeUpload={uploadResume} jobUrl={jobUrl} setJobUrl={setJobUrl} onJobUrlImport={importJobUrl} jobUrlLoading={jobUrlLoading} loading={loading} saved={profileSaved}/>
        <section className="grid">
          <div className="card"><div className="cardHeader"><div><span className="eyebrow">CANDIDATE</span><h2>{data.targetRole||'Target role not set'}</h2><p>{data.email}</p></div><button className="secondary" onClick={analyze} disabled={loading||!profileSaved}>Analyze skills</button></div><div className="skills">{(data.skills||[]).map((s:any)=><div className="skill" key={s.name}><span>{s.name}</span><b>{s.score}</b><div className="bar"><i style={{width:`${s.score}%`}}/></div></div>)}{!data.skills?.length&&<p>No skill assessment yet. Run AI analysis to create your baseline.</p>}</div></div>
          <div className="card jobAnalysis"><div className="cardHeader"><div><span className="eyebrow">JOB FIT</span><h2>Interview priorities</h2></div>{jobAnalysis&&<div className="fitScore"><strong>{jobAnalysis.fitScore}</strong><span>/100 fit</span></div>}</div>{!jobAnalysis?<p>Run AI analysis to compare your profile with the target job.</p>:<><p>{jobAnalysis.summary}</p><div className="gapList">{jobAnalysis.gaps.slice(0,4).map((gap)=><div className="gap" key={gap.name}><div><b>{gap.name}</b><p>{gap.reason}</p></div><span className={gap.priority.toLowerCase()}>{gap.priority}</span></div>)}{!jobAnalysis.gaps.length&&<p>No priority gaps were identified.</p>}</div></>}</div>
          <div className="card" id="interview"><span className="eyebrow">PROTECTED INTERVIEW</span><h2>AI technical interview</h2>{!question?<><p>Your interview history is tied to your account and can only be accessed after signing in.</p>{jobAnalysis?.gaps.some(g=>g.priority==='HIGH')&&<div className="aiHint"><b>AI focus:</b> {jobAnalysis.gaps.find(g=>g.priority==='HIGH')?.name}</div>}<select value={topic} onChange={e=>setTopic(e.target.value)}><option>Node.js</option><option>AWS</option><option>PostgreSQL</option><option>System Design</option><option>React</option></select><button className="primary" onClick={start} disabled={loading||!profileSaved}>Start interview</button></>:<><div className="progress"><span>Question {question.sequence} of {question.maxQuestions}</span><span>{question.difficulty||'MEDIUM'}</span></div><div className="question">{question.question}</div><textarea value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Explain your answer as you would to an interviewer..." autoFocus/><button className="primary" onClick={submit} disabled={!answer.trim()||loading}>{loading?'Evaluating...':'Submit answer'}</button></>}{evaluation&&<div className="evaluation"><h3>Latest evaluation</h3><div className="scoreGrid"><Score label="Technical" value={evaluation.technicalScore}/><Score label="Depth" value={evaluation.depthScore}/><Score label="Communication" value={evaluation.communicationScore}/><Score label="Overall" value={evaluation.overallScore}/></div><p>{evaluation.feedback}</p>{evaluation.strengths.length>0&&<><b>Strengths</b><ul>{evaluation.strengths.map(x=><li key={x}>{x}</li>)}</ul></>}{evaluation.missingConcepts.length>0&&<><b>Explore next</b><ul>{evaluation.missingConcepts.map(x=><li key={x}>{x}</li>)}</ul></>}</div>}</div>
        </section>
        {readinessHistory?.history?.length>0&&<section className="card progressCard"><div className="cardHeader"><div><span className="eyebrow">READINESS PROGRESS</span><h2>Cumulative readiness</h2><p>Average readiness across completed interviews.</p></div><div className="readiness"><strong>{readinessHistory.cumulativeReadinessScore}</strong><span>/100</span></div></div><div className="trend">{readinessHistory.history.map((item:any,index:number)=><div className="trendItem" key={item.interviewId}><span>Interview {index+1}</span><b>{item.readinessScore}</b><i style={{width:`${item.readinessScore}%`}}/></div>)}</div>{readinessHistory.latestChange!==0&&<p className="trendChange">{readinessHistory.latestChange>0?'+':''}{readinessHistory.latestChange} points since the previous interview.</p>}{readinessHistory.recurringGaps?.length>0&&<div className="recurringGaps"><h3>Recurring gaps</h3><p>Concepts that appeared as missing areas across multiple interviews.</p><div className="gapChips">{readinessHistory.recurringGaps.map((gap:any)=><span className="gapChip" key={gap.concept}>{gap.concept} · {gap.occurrences}×</span>)}</div></div>}</section>}
        <section className="card historyCard" id="history"><div className="cardHeader"><div><span className="eyebrow">INTERVIEW HISTORY</span><h2>Your complete history</h2><p>Every completed and in-progress interview is associated with your account.</p></div><strong>{data.interviews?.length||0} interviews</strong></div>{data.interviews?.length?<div className="historyList">{data.interviews.map((item:any)=><details className="historyItem historyDetails" key={item.id}><summary><div><b>{item.topic}</b><span>{item.difficulty} · {item.status}</span><small>{new Date(item.startedAt).toLocaleString()}</small></div><div className="historyScore">{item.readiness?.readinessScore??"—"}<small>readiness</small></div></summary><div className="historyExpanded"><div className="scoreGrid"><Score label="Technical" value={item.readiness?.technicalScore??0}/><Score label="Depth" value={item.readiness?.depthScore??0}/><Score label="Communication" value={item.readiness?.communicationScore??0}/><Score label="Questions" value={item.questions?.length??0}/></div>{item.readiness?.missingConcepts?.length>0&&<><b>Missing concepts</b><ul>{item.readiness.missingConcepts.map((x:any)=><li key={String(x)}>{String(x)}</li>)}</ul></>}{item.questions?.length>0&&<div className="questionHistory"><b>Questions</b>{item.questions.map((q:any)=><div key={q.id}><strong>Q{q.sequence}. {q.question}</strong>{q.answer&&<p>{q.answer}</p>}{q.feedback&&<small>{q.feedback}</small>}</div>)}</div>}</div></details>)}</div>:<p>No interviews yet. Start your first interview above.</p>}</section>
        {report&&<section className="card report"><div className="cardHeader"><div><span className="eyebrow">INTERVIEW REPORT</span><h2>Your readiness snapshot</h2></div><div className="readiness"><strong>{readiness}</strong><span>/100</span></div></div><p className="scoreNote">This score reflects technical accuracy, depth, communication, overall answer quality, consistency, and completion.</p><div className="scoreGrid reportScores"><Score label="Technical" value={report.scores.technical}/><Score label="Depth" value={report.scores.depth}/><Score label="Communication" value={report.scores.communication}/><Score label="Overall" value={report.scores.overall}/></div><div className="reportColumns"><div><h3>Topics to strengthen</h3>{report.missingConcepts.length?<ul>{report.missingConcepts.map((x:string)=><li key={x}>{x}</li>)}</ul>:<p>No recurring gaps were identified.</p>}</div><div><h3>Next step</h3><p>Turn the weaknesses from this interview into a focused preparation plan.</p><button onClick={createLearningPlan} disabled={loading}>Generate 14-day plan</button></div></div></section>}
        {learningPlan&&<section className="card plan"><span className="eyebrow">PERSONALIZED PLAN</span><h2>{learningPlan.title}</h2><div className="tasks">{learningPlan.tasks.map((task:any)=><div className="task" key={task.id}><strong>Day {task.day}</strong><div><b>{task.topic}</b><p>{task.activity}</p></div><span>{task.durationMinutes} min</span></div>)}</div></section>}
      </>}
    </main>
    <footer className="siteFooter"><div>AI Interview Coach</div><span>Practice. Measure. Improve.</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
