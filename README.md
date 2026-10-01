# AI Interview Coach MVP

A local MVP for adaptive software-engineering interview preparation.

## Current flow

1. Create a demo candidate.
2. Run AI skill analysis against a target role and job description.
3. Start an interview for Node.js, AWS, PostgreSQL, React, or System Design.
4. Answer up to 10 questions.
5. The AI evaluates technical accuracy, depth, communication, strengths and missing concepts.
6. The next question adapts to the previous answer and evaluation.
7. On completion, the app generates an interview readiness report.
8. Generate a personalized 14-day learning plan.

## Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- OpenAI Responses API + Structured Outputs
- Docker Compose

## Setup

Create `apps/api/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/interview_coach"
OPENAI_API_KEY="your-key"
OPENAI_MODEL="gpt-5.6-luna"
PORT=4000
```

Then:

```bash
npm install
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run dev
```

Open `http://localhost:5173`.
