import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import multer from 'multer';
import { extractResumeText } from './services/resume.service';
import { extractJobDescriptionFromUrl } from './services/job.service';
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
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw new Error(`Invalid route parameter: ${name}`);
  return value;
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }).parse(req.body);

  const passwordHash = await hashPassword(body.password);
  const candidate = await prisma.candidate.create({
    data: { name: body.name, email: body.email, passwordHash },
  });

  res.status(201).json({
    token: signToken(candidate.id),
    candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const candidate = await prisma.candidate.findUnique({ where: { email: body.email } });
  if (!candidate || !(await verifyPassword(body.password, candidate.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  res.json({
    token: signToken(candidate.id),
    candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
  });
}));

app.use('/api', requireAuth);

app.use('/api/candidates/:id', (req, res, next) => {
  if (routeParam(req, 'id') !== authCandidateId(req)) {
    res.status(403).json({ error: 'You do not have access to this candidate' });
    return;
  }
  next();
});

app.use('/api/interviews/:id', asyncRoute(async (req, res, next) => {
  const interview = await prisma.interview.findUnique({
    where: { id: routeParam(req, 'id') },
    select: { candidateId: true },
  });
  if (!interview) { res.status(404).json({ error: 'Interview not found' }); return; }
  if (interview.candidateId !== authCandidateId(req)) {
    res.status(403).json({ error: 'You do not have access to this interview' });
    return;
  }
  next();
});

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
      where: { id: routeParam(req, 'id') },
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
        jobAnalysis: true,
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
        password: z.string().min(8),
      })
      .parse(req.body);

    const { password, ...candidateData } = body;
    const candidate = await prisma.candidate.create({
      data: { ...candidateData, passwordHash: await hashPassword(password) },
    });
    res.status(201).json(candidate);
  }),
);

app.post(
  '/api/candidates/:id/job-description/url',
  asyncRoute(async (req, res) => {
    const body = z.object({ url: z.string().url() }).parse(req.body);
    const jobDescription = await extractJobDescriptionFromUrl(body.url);

    const candidate = await prisma.candidate.update({
      where: { id: routeParam(req, 'id') },
      data: { jobDescription },
    });

    await prisma.jobAnalysis.deleteMany({
      where: { candidateId: candidate.id },
    });

    res.json({ candidateId: candidate.id, url: body.url, jobDescription });
  }),
);

app.post(
  '/api/candidates/:id/resume',
  resumeUpload.single('resume'),
  asyncRoute(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Resume file is required' });
      return;
    }

    const resumeText = await extractResumeText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );

    if (resumeText.length < 20) {
      res.status(400).json({ error: 'Could not extract enough text from the resume' });
      return;
    }

    const candidate = await prisma.candidate.update({
      where: { id: routeParam(req, 'id') },
      data: { resumeText },
    });

    await prisma.jobAnalysis.deleteMany({
      where: { candidateId: candidate.id },
    });

    res.json({
      candidateId: candidate.id,
      filename: req.file.originalname,
      resumeText,
    });
  }),
);

app.patch(
  '/api/candidates/:id',
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        experienceYears: z.number().int().min(0),
        targetRole: z.string().min(1),
        resumeText: z.string().min(20),
        jobDescription: z.string().min(20),
      })
      .parse(req.body);

    const candidate = await prisma.candidate.update({
      where: { id: routeParam(req, 'id') },
      data: body,
    });

    await prisma.jobAnalysis.deleteMany({
      where: { candidateId: candidate.id },
    });

    res.json(candidate);
  }),
);

app.post(
  '/api/candidates/:id/analyze',
  asyncRoute(async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: routeParam(req, 'id') },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const result = await jsonCompletion(
      [
        'Analyze the candidate against the target job for interview preparation.',
        'Use only evidence present in the resume when judging demonstrated skills.',
        'Treat the job description as target requirements, not as evidence that the candidate has the skill.',
        'Calculate fitScore from 0-100 based on demonstrated coverage of the most important requirements.',
        'Identify strengths supported by the resume and prioritized gaps that should affect interview preparation.',
        'Keep skill names normalized and practical for an experienced software engineer.',
      ].join(' '),
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
      prisma.jobAnalysis.upsert({
        where: { candidateId: candidate.id },
        update: {
          fitScore: result.fitScore,
          summary: result.summary,
          strengths: result.strengths,
          gaps: result.gaps,
        },
        create: {
          candidateId: candidate.id,
          fitScore: result.fitScore,
          summary: result.summary,
          strengths: result.strengths,
          gaps: result.gaps,
        },
      }),
    ]);

    res.json({ ...result, candidateId: candidate.id });
  }),
);

app.get(
  '/api/candidates/:id/job-analysis',
  asyncRoute(async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: routeParam(req, 'id') },
      include: { jobAnalysis: true },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    res.json(candidate.jobAnalysis);
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

    if (body.candidateId !== authCandidateId(req)) {
      res.status(403).json({ error: 'You can only start interviews for your own profile' });
      return;
    }

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
      routeParam(req, 'id'),
      body.sequence,
      body.answer,
    );

    res.json(result);
  }),
);

app.get(
  '/api/interviews/:id/report',
  asyncRoute(async (req, res) => {
    const report = await getInterviewReport(routeParam(req, 'id'));
    res.json(report);
  }),
);

app.get(
  '/api/candidates/:id/readiness',
  asyncRoute(async (req, res) => {
    const readiness = await getCandidateReadiness(routeParam(req, 'id'));
    res.json(readiness);
  }),
);

app.post(
  '/api/candidates/:id/learning-plan',
  asyncRoute(async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: routeParam(req, 'id') },
      include: {
        skills: true,
        jobAnalysis: true,
        readiness: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const plan = await jsonCompletion(
      [
        'Create a practical 14-day software-engineering interview preparation plan.',
        'Prioritize gaps that are important for the target job and repeatedly observed in interview performance.',
        'Use candidate skill scores, job-analysis gaps, and readiness history as evidence.',
        'Do not treat a single weak answer as proof of a persistent weakness.',
        'Progress from concept review to applied practice and interview simulation.',
      ].join(' '),
      [
        `Role: ${candidate.targetRole || 'Software Engineer'}`,
        `Skill scores: ${candidate.skills.map((skill) => `${skill.name}:${skill.score}`).join(', ') || 'Not assessed'}`,
        `Job fit: ${candidate.jobAnalysis?.fitScore ?? 'Not analyzed'}`,
        `Job gaps: ${Array.isArray(candidate.jobAnalysis?.gaps) ? JSON.stringify(candidate.jobAnalysis.gaps) : 'None identified'}`,
        `Readiness history: ${candidate.readiness.map((item) => JSON.stringify({
          readinessScore: item.readinessScore,
          technicalScore: item.technicalScore,
          depthScore: item.depthScore,
          communicationScore: item.communicationScore,
          missingConcepts: item.missingConcepts,
        })).join('\n') || 'No completed interviews'}`,
      ].join('\n'),
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
