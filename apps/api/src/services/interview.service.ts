import { prisma } from '../lib/prisma';
import { jsonCompletion } from '../ai/openai';
import { evaluationSchema, nextQuestionSchema } from '../ai/schemas';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
const MAX_QUESTIONS = 10;

function questionContext(
  candidate: { targetRole: string | null; skills: Array<{ name: string; score: number }> },
  topic: string,
  difficulty: Difficulty,
) {
  return [
    `Candidate role: ${candidate.targetRole || 'Software Engineer'}`,
    `Topic: ${topic}`,
    `Difficulty: ${difficulty}`,
    `Known skills: ${candidate.skills.map((skill) => `${skill.name}(${skill.score})`).join(', ') || 'Not assessed yet'}`,
  ].join('\n');
}

export async function startInterview(candidateId: string, topic: string, difficulty: Difficulty = 'MEDIUM') {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { skills: true },
  });

  if (!candidate) throw new Error('Candidate not found');

  const interview = await prisma.interview.create({
    data: { candidateId, topic, difficulty },
  });

  const question = await jsonCompletion(
    [
      'You are a senior technical interviewer.',
      'Generate the first question for a realistic software-engineering interview.',
      'Test understanding and reasoning, not trivia.',
      'The question must be answerable verbally by an experienced engineer.',
    ].join(' '),
    questionContext(candidate, topic, difficulty),
    nextQuestionSchema,
  );

  await prisma.interviewQuestion.create({
    data: { interviewId: interview.id, sequence: 1, question: question.question },
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

export async function answerInterview(interviewId: string, sequence: number, answer: string) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      questions: { orderBy: { sequence: 'asc' } },
      candidate: { include: { skills: true } },
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
      'For a senior role, reward correct reasoning, trade-offs, production awareness and precise communication.',
      'Keep feedback actionable and concise.',
      'Use FOLLOW_UP when the answer reveals a meaningful gap or deserves deeper probing.',
      'Use NEW_TOPIC when this area has been adequately tested.',
      `Use END only when this is question ${MAX_QUESTIONS} or the interview has enough evidence to conclude.`,
    ].join(' '),
    [
      `Role: ${interview.candidate.targetRole || 'Software Engineer'}`,
      `Interview topic: ${interview.topic}`,
      `Question ${sequence} of ${MAX_QUESTIONS}: ${question.question}`,
      `Candidate answer: ${answer}`,
      `Prior skill scores: ${interview.candidate.skills.map((skill) => `${skill.name}:${skill.score}`).join(', ') || 'Not assessed'}`,
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

    return { evaluation, nextQuestion: null, sequence, completed: true, maxQuestions: MAX_QUESTIONS };
  }

  const answeredQuestions = interview.questions
    .filter((item) => item.answer)
    .map((item) => `Q${item.sequence}: ${item.question}\nA: ${item.answer}`)
    .join('\n');

  const nextQuestion = await jsonCompletion(
    [
      'Continue a realistic technical interview.',
      'Ask exactly one question.',
      'Use the candidate answer and evaluation to choose the next question.',
      'If there is a misconception, probe it before moving on.',
      'Do not repeat an already-tested question.',
    ].join(' '),
    [
      `Role: ${interview.candidate.targetRole || 'Software Engineer'}`,
      `Topic: ${interview.topic}`,
      `Question ${sequence} of ${MAX_QUESTIONS} was just answered.`,
      `Latest question: ${question.question}`,
      `Latest answer: ${answer}`,
      `Latest evaluation: ${evaluation.feedback}`,
      `Missing concepts: ${evaluation.missingConcepts.join(', ') || 'None identified'}`,
      `Previous interview context:\n${answeredQuestions || 'None'}`,
    ].join('\n'),
    nextQuestionSchema,
  );

  const savedQuestion = await prisma.interviewQuestion.create({
    data: { interviewId, sequence: sequence + 1, question: nextQuestion.question },
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
    include: { questions: { orderBy: { sequence: 'asc' } }, candidate: true },
  });

  if (!interview) throw new Error('Interview not found');

  const answered = interview.questions.filter((q) => q.answer !== null);
  const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const technical = average(answered.flatMap((q) => q.technicalScore == null ? [] : [q.technicalScore]));
  const depth = average(answered.flatMap((q) => q.depthScore == null ? [] : [q.depthScore]));
  const communication = average(answered.flatMap((q) => q.communicationScore == null ? [] : [q.communicationScore]));
  const overall = average(answered.flatMap((q) => q.overallScore == null ? [] : [q.overallScore]));
  const missingConcepts = [...new Set(answered.flatMap((q) => Array.isArray(q.missingConcepts) ? q.missingConcepts.map(String) : []))];

  return {
    interviewId: interview.id,
    candidateId: interview.candidateId,
    role: interview.candidate.targetRole || 'Software Engineer',
    topic: interview.topic,
    status: interview.status,
    completedAt: interview.completedAt,
    questionCount: answered.length,
    scores: { technical, depth, communication, overall },
    missingConcepts,
    questions: answered.map((q) => ({
      sequence: q.sequence,
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
