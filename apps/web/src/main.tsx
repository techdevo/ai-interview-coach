import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ProfileForm, type Profile } from './ProfileForm';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Evaluation = {
  technicalScore: number;
  depthScore: number;
  communicationScore: number;
  overallScore: number;
  feedback: string;
  strengths: string[];
  missingConcepts: string[];
};

type Question = {
  interviewId: string;
  question: string;
  sequence: number;
  maxQuestions: number;
  topic?: string;
  difficulty?: string;
};

type JobGap = {
  name: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
};

type JobAnalysis = {
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: JobGap[];
};

function Score({ label, value }: { label: string; value: number }) {
  return <div className="scoreBox"><span>{label}</span><strong>{value}</strong></div>;
}

function App() {
  const [id, setId] = useState('');
  const [data, setData] = useState<any>(null);
  const [topic, setTopic] = useState('Node.js');
  const [profile, setProfile] = useState<Profile>({ name:'', email:'', experienceYears:0, targetRole:'', resumeText:'', jobDescription:'' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [report, setReport] = useState<any>(null);
  const [learningPlan, setLearningPlan] = useState<any>(null);

  const jobAnalysis: JobAnalysis | null = data?.jobAnalysis || null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [readinessHistory, setReadinessHistory] = useState<any>(null);
  const [jobUrl, setJobUrl] = useState('');
  const [jobUrlLoading, setJobUrlLoading] = useState(false);

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(`${API}${path}`, options);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return payload;
  }

  async function load(candidateId = id) {
    if (!candidateId) return;
    const candidate = await request(`/api/candidates/${candidateId}`);
    setData(candidate);
    request(`/api/candidates/${candidateId}/readiness`).then(setReadinessHistory).catch(()=>{});
    setProfile({ name:candidate.name, email:candidate.email, experienceYears:candidate.experienceYears, targetRole:candidate.targetRole || '', resumeText:candidate.resumeText || '', jobDescription:candidate.jobDescription || '' });
    setProfileSaved(true);
  }

  useEffect(() => {
    const saved = localStorage.getItem('candidateId');
    if (saved) {
      setId(saved);
      load(saved).catch((e) => setError(e.message));
    }
  }, []);

  async function create() {
    setLoading(true); setError('');
    try {
      const candidate = await request('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Candidate',
          email: `demo-${Date.now()}@example.com`,
          experienceYears: 0,
          targetRole: '',
          resumeText: '',
          jobDescription: '',
        }),
      });
      localStorage.setItem('candidateId', candidate.id);
      setId(candidate.id); setData(candidate); setReport(null); setLearningPlan(null);
      setProfile({ name:candidate.name, email:candidate.email, experienceYears:candidate.experienceYears, targetRole:candidate.targetRole || '', resumeText:candidate.resumeText || '', jobDescription:candidate.jobDescription || '' });
      setProfileSaved(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }

  async function uploadResume(file: File) {
    setLoading(true); setError('');
    try {
      const form = new FormData(); form.append('resume', file);
      const result = await request(`/api/candidates/${id}/resume`, { method:'POST', body:form });
      setProfile({ ...profile, resumeText: result.resumeText });
      setProfileSaved(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not process resume'); }
    finally { setLoading(false); }
  }

  async function importJobUrl() {
    if (!jobUrl.trim()) return;
    setJobUrlLoading(true); setError('');
    try {
      const result = await request(`/api/candidates/${id}/job-description/url`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:jobUrl.trim()}) });
      setProfile({ ...profile, jobDescription: result.jobDescription }); setProfileSaved(false); setJobUrl('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import job description'); }
    finally { setJobUrlLoading(false); }
  }

  async function saveProfile() {
    setLoading(true); setError('');
    try {
      const candidate = await request(`/api/candidates/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(profile) });
      setData({ ...data, ...candidate, jobAnalysis:null, skills:[] });
      setProfileSaved(true); setReport(null); setLearningPlan(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save profile'); }
    finally { setLoading(false); }
  }

  async function analyze() {
    setLoading(true); setError('');
    try { await request(`/api/candidates/${id}/analyze`, { method: 'POST' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed'); }
    finally { setLoading(false); }
  }

  async function start() {
    setLoading(true); setError(''); setReport(null); setEvaluation(null); setAnswer('');
    try {
      const result = await request('/api/interviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: id, topic, difficulty: 'MEDIUM' }),
      });
      setQuestion(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to start interview'); }
    finally { setLoading(false); }
  }

  async function submit() {
    if (!question || !answer.trim()) return;
    setLoading(true); setError('');
    try {
      const result = await request(`/api/interviews/${question.interviewId}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: question.sequence, answer }),
      });
      setEvaluation(result.evaluation);
      setAnswer('');
      if (result.completed) {
        setQuestion(null);
        setReport(await request(`/api/interviews/${question.interviewId}/report`));
        await load();
      } else {
        setQuestion({
          interviewId: question.interviewId,
          question: result.nextQuestion,
          sequence: result.sequence,
          maxQuestions: result.maxQuestions,
          topic: result.topic,
          difficulty: result.difficulty,
        });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Evaluation failed'); }
    finally { setLoading(false); }
  }

  async function createLearningPlan() {
    setLoading(true); setError('');
    try {
      const plan = await request(`/api/candidates/${id}/learning-plan`, { method: 'POST' });
      setLearningPlan(plan);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create plan'); }
    finally { setLoading(false); }
  }

  const readiness = useMemo(() => {
    if (!report) return 0;
    return report.scores.overall;
  }, [report]);

  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">AI INTERVIEW COACH</span>
          <h1>Become interview-ready.</h1>
          <p>Practice against your target role, get evaluated, and close your skill gaps.</p>
        </div>
        <button onClick={create} disabled={loading}>{id ? 'Create new profile' : 'Start MVP'}</button>
      </header>

      {error && <div className="error">{error}</div>}

      {data && <>
        <ProfileForm profile={profile} setProfile={setProfile} onSave={saveProfile} onResumeUpload={uploadResume} jobUrl={jobUrl} setJobUrl={setJobUrl} onJobUrlImport={importJobUrl} jobUrlLoading={jobUrlLoading} loading={loading} saved={profileSaved} />
        <section className="grid">
          <div className="card">
            <div className="cardHeader"><div><span className="eyebrow">CANDIDATE</span><h2>{data.targetRole}</h2><p>{data.email}</p></div><button className="secondary" onClick={analyze} disabled={loading || !profileSaved}>Analyze skills</button></div>
            <div className="skills">
              {(data.skills || []).map((s: any) => <div className="skill" key={s.name}><span>{s.name}</span><b>{s.score}</b><div className="bar"><i style={{ width: `${s.score}%` }} /></div></div>)}
              {!data.skills?.length && <p>No skill assessment yet. Run AI analysis to create your baseline.</p>}
            </div>
          </div>

          <div className="card jobAnalysis">
            <div className="cardHeader">
              <div>
                <span className="eyebrow">JOB FIT</span>
                <h2>Interview priorities</h2>
              </div>
              {jobAnalysis && (
                <div className="fitScore">
                  <strong>{jobAnalysis.fitScore}</strong>
                  <span>/100 fit</span>
                </div>
              )}
            </div>
            {!jobAnalysis ? (
              <p>Run AI analysis to compare the candidate profile with the target job and identify the areas the interviewer should probe.</p>
            ) : (
              <>
                <p>{jobAnalysis.summary}</p>
                <div className="gapList">
                  {jobAnalysis.gaps.slice(0, 4).map((gap) => (
                    <div className="gap" key={gap.name}>
                      <div>
                        <b>{gap.name}</b>
                        <p>{gap.reason}</p>
                      </div>
                      <span className={gap.priority.toLowerCase()}>{gap.priority}</span>
                    </div>
                  ))}
                  {!jobAnalysis.gaps.length && <p>No priority gaps were identified.</p>}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <span className="eyebrow">ADAPTIVE INTERVIEW</span>
            <h2>AI technical interview</h2>
            {!question ? <>
              <p>Choose a topic. The interviewer will adapt its next question using your answers and the job gaps identified above.</p>
              {jobAnalysis?.gaps.some((gap) => gap.priority === 'HIGH') && (
                <div className="aiHint">
                  <b>AI focus:</b> {jobAnalysis.gaps.find((gap) => gap.priority === 'HIGH')?.name}
                </div>
              )}
              <select value={topic} onChange={e => setTopic(e.target.value)}><option>Node.js</option><option>AWS</option><option>PostgreSQL</option><option>System Design</option><option>React</option></select>
              <button className="primary" onClick={start} disabled={loading}>Start interview</button>
            </> : <>
              <div className="progress"><span>Question {question.sequence} of {question.maxQuestions}</span><span>{question.difficulty || 'MEDIUM'}</span></div>
              <div className="question">{question.question}</div>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Explain your answer as you would to an interviewer..." autoFocus />
              <button className="primary" onClick={submit} disabled={!answer.trim() || loading}>{loading ? 'Evaluating...' : 'Submit answer'}</button>
            </>}
            {evaluation && <div className="evaluation"><h3>Latest evaluation</h3><div className="scoreGrid"><Score label="Technical" value={evaluation.technicalScore}/><Score label="Depth" value={evaluation.depthScore}/><Score label="Communication" value={evaluation.communicationScore}/><Score label="Overall" value={evaluation.overallScore}/></div><p>{evaluation.feedback}</p>{evaluation.strengths?.length > 0 && <><b>Strengths</b><ul>{evaluation.strengths.map(x => <li key={x}>{x}</li>)}</ul></>}{evaluation.missingConcepts?.length > 0 && <><b>Explore next</b><ul>{evaluation.missingConcepts.map(x => <li key={x}>{x}</li>)}</ul></>}</div>}
          </div>
        </section>

        {readinessHistory?.history?.length > 0 && <section className="card progressCard">
          <div className="cardHeader"><div><span className="eyebrow">READINESS PROGRESS</span><h2>Cumulative readiness</h2><p>Average readiness across completed interviews.</p></div><div className="readiness"><strong>{readinessHistory.cumulativeReadinessScore}</strong><span>/100</span></div></div>
          <div className="trend">{readinessHistory.history.map((item:any, index:number)=><div className="trendItem" key={item.interviewId}><span>Interview {index+1}</span><b>{item.readinessScore}</b><i style={{width:`${item.readinessScore}%`}} /></div>)}</div>
          {readinessHistory.latestChange !== 0 && <p className="trendChange">{readinessHistory.latestChange > 0 ? '+' : ''}{readinessHistory.latestChange} points since the previous interview.</p>}
          {readinessHistory.recurringGaps?.length > 0 && <div className="recurringGaps"><h3>Recurring gaps</h3><p>Concepts that appeared as missing areas across multiple interviews.</p><div className="gapChips">{readinessHistory.recurringGaps.map((gap:any) => <span className="gapChip" key={gap.concept}>{gap.concept} · {gap.occurrences}×</span>)}</div></div>}
        </section>}

        {report && <section className="card report">
          <div className="cardHeader"><div><span className="eyebrow">INTERVIEW REPORT</span><h2>Your readiness snapshot</h2></div><div className="readiness"><strong>{readiness}</strong><span>/100</span></div></div>
          <p className="scoreNote">This interview score reflects technical accuracy, depth, communication, overall answer quality, consistency, and interview completion.</p>
          <div className="scoreGrid reportScores"><Score label="Technical" value={report.scores.technical}/><Score label="Depth" value={report.scores.depth}/><Score label="Communication" value={report.scores.communication}/><Score label="Overall" value={report.scores.overall}/></div>
          <div className="reportColumns"><div><h3>Topics to strengthen</h3>{report.missingConcepts.length ? <ul>{report.missingConcepts.map((x: string) => <li key={x}>{x}</li>)}</ul> : <p>No recurring gaps were identified.</p>}</div><div><h3>Next step</h3><p>Turn the weaknesses from this interview into a focused preparation plan.</p><button onClick={createLearningPlan} disabled={loading}>Generate 14-day plan</button></div></div>
        </section>}

        {learningPlan && <section className="card plan"><span className="eyebrow">PERSONALIZED PLAN</span><h2>{learningPlan.title}</h2><div className="tasks">{learningPlan.tasks.map((task: any) => <div className="task" key={task.id}><strong>Day {task.day}</strong><div><b>{task.topic}</b><p>{task.activity}</p></div><span>{task.durationMinutes} min</span></div>)}</div></section>}
      </>}

      {!data && <section className="empty"><h2>Build your first AI interview</h2><p>The MVP is ready. Click Start MVP to create a demo candidate and begin testing the interview loop.</p></section>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
