import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { prisma } from './lib/prisma';
import { jsonCompletion } from './ai/openai';
import { analysisSchema, planSchema } from './ai/schemas';
import {
  startInterview,
  answerInterview,
  getInterviewReport,
  getCandidateReadiness,
} from './services/interview.service';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const asyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Request failed';
      res.status(400).json({ error: message });
    });
  };

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get(
  '/api/candidates/:id',
  asyncRoute(async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params.id },
      include: {
        skills: true,
        interviews: {
          include: { questions: true, readiness: true },
          orderBy: { startedAt: 'desc' },
        },
        learningPlans: {
          include: { tasks: true },
          orderBy: { createdAt: 'desc' },
        },
        readiness: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    res.json(candidate);
  }),
);

app.post(
  '/api/candidates',
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        experienceYears: z.number().int().min(0),
        targetRole: z.string().optional(),
        resumeText: z.string().optional(),
        jobDescription: z.string().optional(),
      })
      .parse(req.body);

    const candidate = await prisma.candidate.create({ data: body });
    res.status(201).json(candidate);
  }),
);

app.post(
  '/api/candidates/:id/analyze',
  asyncRoute(async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params.id },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const result = await jsonCompletion(
      'Analyze the candidate against the target job. Score demonstrated skills from 0-100 and identify important gaps.',
      `Target role: ${candidate.targetRole || 'Software Engineer'}\nResume:\n${candidate.resumeText || 'Not provided'}\nJob description:\n${candidate.jobDescription || 'Not provided'}`,
      analysisSchema,
    );

    await prisma.$transaction([
      prisma.candidateSkill.deleteMany({ where: { candidateId: candidate.id } }),
      prisma.candidateSkill.createMany({
        data: result.skills.map((skill) => ({
          candidateId: candidate.id,
          name: skill.name,
          score: skill.score,
          evidence: skill.evidence,
        })),
      }),
    ]);

    res.json(result);
  }),
);

app.post(
  '/api/interviews',
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        candidateId: z.string().min(1),
        topic: z.string().min(1),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
      })
      .parse(req.body);

    const interview = await startInterview(
      body.candidateId,
      body.topic,
      body.difficulty,
    );

    res.status(201).json(interview);
  }),
);

app.post(
  '/api/interviews/:id/answer',
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        sequence: z.number().int().positive(),
        answer: z.string().min(1),
      })
      .parse(req.body);

    const result = await answerInterview(
      req.params.id,
      body.sequence,
      body.answer,
    );

    res.json(result);
  }),
);

app.get(
  '/api/interviews/:id/report',
  asyncRoute(async (req, res) => {
    const report = await getInterviewReport(req.params.id);
    res.json(report);
  }),
);

app.get(
  '/api/candidates/:id/readiness',
  asyncRoute(async (req, res) => {
    const readiness = await getCandidateReadiness(req.params.id);
    res.json(readiness);
  }),
);

app.post(
  '/api/candidates/:id/learning-plan',
  asyncRoute(async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params.id },
      include: { skills: true },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const plan = await jsonCompletion(
      'Create a practical 14-day software-engineering interview preparation plan. Prioritize weak skills.',
      `Role: ${candidate.targetRole || 'Software Engineer'}\nSkill scores: ${candidate.skills.map((skill) => `${skill.name}:${skill.score}`).join(', ')}`,
      planSchema,
    );

    const saved = await prisma.learningPlan.create({
      data: {
        candidateId: candidate.id,
        title: plan.title,
        tasks: {
          create: plan.tasks.map((task) => ({
            day: task.day,
            topic: task.topic,
            activity: task.activity,
            durationMinutes: task.durationMinutes,
          })),
        },
      },
      include: { tasks: true },
    });

    res.status(201).json(saved);
  }),
);

app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
