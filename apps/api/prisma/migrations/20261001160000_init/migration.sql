-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateTable
CREATE TABLE "Candidate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "experienceYears" INTEGER NOT NULL DEFAULT 0,
  "targetRole" TEXT,
  "resumeText" TEXT,
  "jobDescription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "evidence" TEXT,

  CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "status" "InterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "topic" TEXT NOT NULL,
  "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "technicalScore" INTEGER,
  "depthScore" INTEGER,
  "communicationScore" INTEGER,
  "overallScore" INTEGER,
  "feedback" TEXT,
  "missingConcepts" JSONB,

  CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPlan" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LearningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningTask" (
  "id" TEXT NOT NULL,
  "learningPlanId" TEXT NOT NULL,
  "day" INTEGER NOT NULL,
  "topic" TEXT NOT NULL,
  "activity" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 20,
  "completed" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "LearningTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");
CREATE UNIQUE INDEX "CandidateSkill_candidateId_name_key" ON "CandidateSkill"("candidateId", "name");
CREATE UNIQUE INDEX "InterviewQuestion_interviewId_sequence_key" ON "InterviewQuestion"("interviewId", "sequence");

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningTask" ADD CONSTRAINT "LearningTask_learningPlanId_fkey"
  FOREIGN KEY ("learningPlanId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;