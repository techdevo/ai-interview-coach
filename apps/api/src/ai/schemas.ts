import { z } from 'zod';

export const nextQuestionSchema = z.object({
  question: z.string().min(10),
  topic: z.string().min(1),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  reason: z.string().min(1),
});

export const evaluationSchema = z.object({
  technicalScore: z.number().int().min(0).max(100),
  depthScore: z.number().int().min(0).max(100),
  communicationScore: z.number().int().min(0).max(100),
  overallScore: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
  strengths: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  nextAction: z.enum(['FOLLOW_UP', 'NEW_TOPIC', 'END']),
});

export const analysisSchema = z.object({
  skills: z.array(z.object({
    name: z.string(),
    score: z.number().int().min(0).max(100),
    evidence: z.string(),
  })),
  gaps: z.array(z.object({
    name: z.string(),
    priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    reason: z.string(),
  })),
  summary: z.string(),
});

export const planSchema = z.object({
  title: z.string(),
  tasks: z.array(z.object({
    day: z.number().int().min(1).max(30),
    topic: z.string(),
    activity: z.string(),
    durationMinutes: z.number().int().min(5).max(120),
  })),
});
