import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from './lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';

export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export function signToken(candidateId: string) { return jwt.sign({ candidateId }, JWT_SECRET, { expiresIn: '7d' }); }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || typeof payload === 'string' || typeof payload.candidateId !== 'string') {
      res.status(401).json({ error: 'Invalid authentication token' }); return;
    }
    res.locals.candidateId = payload.candidateId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export function authCandidateId(req: Request) {
  const candidateId = req.res?.locals.candidateId;
  if (typeof candidateId !== 'string') throw new Error('Authentication required');
  return candidateId;
}
