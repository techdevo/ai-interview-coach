import { prisma } from '../lib/prisma';
import { jsonCompletion } from '../ai/openai';
import { evaluationSchema, nextQuestionSchema } from '../ai/schemas';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
const MAX_QUESTIONS = 10;

function questionContext(
  candidate: {
    targetRole: string | null;
    skills: Array<{ name: string; score: number }>;
    jobAnalysis: { fitScore: number; gaps: unknown } | null;
  },
  topic: string,
  difficulty: Difficulty,
) {
  return [
    `Candidate role: ${candidate.targetRole || 'Software Engineer'}`,
    `Interview topic: ${topic}`,
    `Starting difficulty: ${difficulty}`,
    `Known skills: ${candidate.skills.map((skill) => `${skill.name}(${skill.score})`).join(', ') || 'Not assessed yet'}`,
    `Job fit score: ${candidate.jobAnalysis?.fitScore ?? 'Not analyzed'}`,
    `Priority job gaps: ${formatJobGaps(candidate.jobAnalysis?.gaps)}`,
  ].join('\n');
}

export async function startInterview(candidateId: string, topic: string, difficulty: Difficulty = 'MEDIUM') {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { skills: true, jobAnalysis: true },
  });

  if (!candidate) throw new Error('Candidate not found');

  const interview = await prisma.interview.create({
    data: { candidateId, topic, difficulty },
  });

  const question = await jsonCompletion(
    [
      'You are a senior technical interviewer.',
      'Generate the first question for a realistic software-engineering interview.',
      'Test understanding, reasoning, trade-offs and practical experience rather than trivia.',
      'The question must be answerable verbally by an experienced engineer.',
      'Return one focused question and classify its topic and difficulty.',
      'When job analysis exists, prioritize a relevant high-priority job gap.',
      'Treat job-analysis gaps as hypotheses to validate, not conclusions about the candidate.',
    ].join(' '),
    questionContext(candidate, topic, difficulty),
    nextQuestionSchema,
  );

  await prisma.interviewQuestion.create({
    data: {
      interviewId: interview.id,
      sequence: 1,
      question: question.question,
      topic: question.topic,
      difficulty: question.difficulty,
    },
  });

  return {
    interviewId: interview.id,
    question: question.question,
    topic: question.topic,
    difficulty: question.difficulty,
    sequence: 1,
    maxQuestions: MAX_QUESTIONS,
  };
}

function formatJobGaps(gaps: unknown) {
  if (!Array.isArray(gaps) || gaps.length === 0) return 'None identified';

  return gaps
    .map((gap) => {
      if (!gap || typeof gap !== 'object') return null;
      const item = gap as { name?: unknown; priority?: unknown; reason?: unknown };
      return item.name
        ? String(item.name) + '[' + String(item.priority || 'MEDIUM') + ']: ' + String(item.reason || '')
        : null;
    })
    .filter(Boolean)
    .join('; ') || 'None identified';
}

function average(values: number[]) {
  return values.length
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : 0;
}

async function completeInterview(interviewId: string, strengths: string[] = []) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { questions: { orderBy: { sequence: 'asc' } } },
  });

  if (!interview) throw new Error('Interview not found');

  const answered = interview.questions.filter((question) => question.answer !== null);
  const technical = average(answered.flatMap((q) => q.technicalScore == null ? [] : [q.technicalScore]));
  const depth = average(answered.flatMap((q) => q.depthScore == null ? [] : [q.depthScore]));
  const communication = average(answered.flatMap((q) => q.communicationScore == null ? [] : [q.communicationScore]));
  const overall = average(answered.flatMap((q) => q.overallScore == null ? [] : [q.overallScore]));
  const missingConcepts = [...new Set(answered.flatMap((q) =>
    Array.isArray(q.missingConcepts) ? q.missingConcepts.map(String) : [],
  ))];

  const allStrengths = [...new Set(strengths.map(String))];

  const consistencyBonus = answered.length >= 5
    ? Math.min(5, Math.max(0, 5 - Math.round(
      Math.sqrt(answered.reduce((sum, q) => sum + Math.pow((q.overallScore ?? 0) - overall, 2), 0) / answered.length),
    )))
    : 0;

  const completionFactor = Math.min(1, answered.length / MAX_QUESTIONS);
  const weightedScore =
    technical * 0.4 +
    depth * 0.3 +
    communication * 0.15 +
    overall * 0.15;

  const readinessScore = Math.round(
    Math.min(100, weightedScore * (0.9 + completionFactor * 0.1) + consistencyBonus),
  );

  await prisma.readinessSnapshot.upsert({
    where: { interviewId },
    update: {
      readinessScore,
      technicalScore: technical,
      depthScore: depth,
      communicationScore: communication,
      strengths: allStrengths,
      missingConcepts,
    },
    create: {
      candidateId: interview.candidateId,
      interviewId,
      readinessScore,
      technicalScore: technical,
      depthScore: depth,
      communicationScore: communication,
      strengths: allStrengths,
      missingConcepts,
    },
  });

  return {
    readinessScore,
    technical,
    depth,
    communication,
    overall,
    missingConcepts,
  };
}

export async function answerInterview(interviewId: string, sequence: number, answer: string) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      questions: { orderBy: { sequence: 'asc' } },
      candidate: { include: { skills: true, jobAnalysis: true } },
    },
  });

  if (!interview) throw new Error('Interview not found');
  if (interview.status === 'COMPLETED') throw new Error('Interview is already completed');

  const question = interview.questions.find((item) => item.sequence === sequence);
  if (!question) throw new Error('Question not found');
  if (question.answer) throw new Error('This question has already been answered');

  const evaluation = await jsonCompletion(
    [
      'Evaluate the candidate answer objectively.',
      'Score only what is demonstrated in the answer; do not infer knowledge that is not shown.',
      'For an experienced engineer, reward correct reasoning, trade-offs, production awareness and precise communication.',
      'Keep feedback actionable and concise.',
      'Identify the specific concepts that should be tested or learned next.',
      'Use FOLLOW_UP when the answer exposes a meaningful gap or deserves deeper probing.',
      'Use NEW_TOPIC when the current area has been adequately tested.',
      `Use END only when this is question ${MAX_QUESTIONS} or there is enough evidence to conclude.`,
    ].join(' '),
    [
      `Role: ${interview.candidate.targetRole || 'Software Engineer'}`,
      `Interview topic: ${interview.topic}`,
      `Question ${sequence} of ${MAX_QUESTIONS}: ${question.question}`,
      `Question topic: ${question.topic || interview.topic}`,
      `Question difficulty: ${question.difficulty || interview.difficulty}`,
      `Candidate answer: ${answer}`,
      `Prior skill scores: ${interview.candidate.skills.map((skill) => `${skill.name}:${skill.score}`).join(', ') || 'Not assessed'}`,
      `Job fit score: ${interview.candidate.jobAnalysis?.fitScore ?? 'Not analyzed'}`,
      `Job gaps: ${formatJobGaps(interview.candidate.jobAnalysis?.gaps)}`,
    ].join('\n'),
    evaluationSchema,
  );

  const shouldEnd = sequence >= MAX_QUESTIONS || evaluation.nextAction === 'END';

  await prisma.interviewQuestion.update({
    where: { id: question.id },
    data: {
      answer,
      technicalScore: evaluation.technicalScore,
      depthScore: evaluation.depthScore,
      communicationScore: evaluation.communicationScore,
      overallScore: evaluation.overallScore,
      feedback: evaluation.feedback,
      missingConcepts: evaluation.missingConcepts,
    },
  });

  if (shouldEnd) {
    await prisma.interview.update({
      where: { id: interview.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    const readiness = await completeInterview(interview.id, evaluation.strengths);

    return {
      evaluation,
      nextQuestion: null,
      sequence,
      completed: true,
      maxQuestions: MAX_QUESTIONS,
      readiness,
    };
  }

  const answeredQuestions = interview.questions
    .filter((item) => item.answer)
    .map((item) =>
      `Q${item.sequence} [${item.topic || interview.topic}/${item.difficulty || interview.difficulty}]: ${item.question}\nA: ${item.answer}`,
    )
    .join('\n');

  const nextQuestion = await jsonCompletion(
    [
      'Continue a realistic adaptive technical interview.',
      'Ask exactly one question.',
      'Use the latest answer and evaluation to decide what to test next.',
      'If there is a meaningful misconception or missing concept, probe it before moving on.',
      'If the candidate demonstrates mastery, increase difficulty or move to a related topic.',
      'Avoid repeating questions or testing the same concept unnecessarily.',
      'Keep the interview balanced across the requested topic when possible.',
      'Prioritize unresolved high-priority job gaps when relevant to the current topic.',
      'Do not repeatedly test a gap once sufficient evidence of competence has been established.',
    ].join(' '),
    [
      `Role: ${interview.candidate.targetRole || 'Software Engineer'}`,
      `Interview topic: ${interview.topic}`,
      `Question ${sequence} of ${MAX_QUESTIONS} was just answered.`,
      `Latest question: ${question.question}`,
      `Latest topic/difficulty: ${question.topic || interview.topic}/${question.difficulty || interview.difficulty}`,
      `Latest answer: ${answer}`,
      `Latest evaluation: ${evaluation.feedback}`,
      `Missing concepts: ${evaluation.missingConcepts.join(', ') || 'None identified'}`,
      `Next-action signal: ${evaluation.nextAction}`,
      `Job fit score: ${interview.candidate.jobAnalysis?.fitScore ?? 'Not analyzed'}`,
      `Job gaps: ${formatJobGaps(interview.candidate.jobAnalysis?.gaps)}`,
      `Previous interview context:\n${answeredQuestions || 'None'}`,
    ].join('\n'),
    nextQuestionSchema,
  );

  const savedQuestion = await prisma.interviewQuestion.create({
    data: {
      interviewId,
      sequence: sequence + 1,
      question: nextQuestion.question,
      topic: nextQuestion.topic,
      difficulty: nextQuestion.difficulty,
    },
  });

  return {
    evaluation,
    nextQuestion: savedQuestion.question,
    sequence: savedQuestion.sequence,
    topic: nextQuestion.topic,
    difficulty: nextQuestion.difficulty,
    completed: false,
    maxQuestions: MAX_QUESTIONS,
  };
}

export async function getInterviewReport(interviewId: string) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      questions: { orderBy: { sequence: 'asc' } },
      candidate: true,
      readiness: true,
    },
  });

  if (!interview) throw new Error('Interview not found');

  const answered = interview.questions.filter((q) => q.answer !== null);
  const technical = average(answered.flatMap((q) => q.technicalScore == null ? [] : [q.technicalScore]));
  const depth = average(answered.flatMap((q) => q.depthScore == null ? [] : [q.depthScore]));
  const communication = average(answered.flatMap((q) => q.communicationScore == null ? [] : [q.communicationScore]));
  const overall = average(answered.flatMap((q) => q.overallScore == null ? [] : [q.overallScore]));
  const missingConcepts = [...new Set(answered.flatMap((q) =>
    Array.isArray(q.missingConcepts) ? q.missingConcepts.map(String) : [],
  ))];

  return {
    interviewId: interview.id,
    candidateId: interview.candidateId,
    role: interview.candidate.targetRole || 'Software Engineer',
    topic: interview.topic,
    status: interview.status,
    startedAt: interview.startedAt,
    completedAt: interview.completedAt,
    questionCount: answered.length,
    readinessScore: interview.readiness?.readinessScore ?? null,
    scores: { technical, depth, communication, overall },
    missingConcepts,
    questions: answered.map((q) => ({
      sequence: q.sequence,
      topic: q.topic,
      difficulty: q.difficulty,
      question: q.question,
      answer: q.answer,
      scores: {
        technical: q.technicalScore,
        depth: q.depthScore,
        communication: q.communicationScore,
        overall: q.overallScore,
      },
      feedback: q.feedback,
      missingConcepts: Array.isArray(q.missingConcepts) ? q.missingConcepts : [],
    })),
  };
}

export async function getCandidateReadiness(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      skills: true,
      readiness: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!candidate) throw new Error('Candidate not found');

  const history = candidate.readiness.map((snapshot) => ({
    interviewId: snapshot.interviewId,
    readinessScore: snapshot.readinessScore,
    technicalScore: snapshot.technicalScore,
    depthScore: snapshot.depthScore,
    communicationScore: snapshot.communicationScore,
    strengths: Array.isArray(snapshot.strengths) ? snapshot.strengths : [],
    createdAt: snapshot.createdAt,
    missingConcepts: Array.isArray(snapshot.missingConcepts)
      ? snapshot.missingConcepts
      : [],
  }));

  const cumulativeReadinessScore = history.length
    ? Math.round(history.reduce((sum, item) => sum + item.readinessScore, 0) / history.length)
    : 0;

  const latest = history.at(-1) || null;
  const previous = history.length > 1 ? history.at(-2) : null;

  const conceptCounts = new Map<string, number>();
  for (const item of history) {
    for (const concept of item.missingConcepts) {
      const normalized = String(concept).trim();
      if (normalized) conceptCounts.set(normalized, (conceptCounts.get(normalized) || 0) + 1);
    }
  }

  const recurringGaps = [...conceptCounts.entries()]
    .filter(([, count]) => count >= Math.min(2, history.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([concept, occurrences]) => ({ concept, occurrences }));

  return {
    candidateId,
    role: candidate.targetRole || 'Software Engineer',
    skills: candidate.skills,
    cumulativeReadinessScore,
    latestChange: latest && previous ? latest.readinessScore - previous.readinessScore : 0,
    history,
    latest,
    recurringGaps,
  };
}
