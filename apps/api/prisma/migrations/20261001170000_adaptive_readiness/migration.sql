ALTER TABLE "InterviewQuestion"
ADD COLUMN "topic" TEXT,
ADD COLUMN "difficulty" "Difficulty";

CREATE TABLE "ReadinessSnapshot" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "readinessScore" INTEGER NOT NULL,
  "technicalScore" INTEGER NOT NULL,
  "depthScore" INTEGER NOT NULL,
  "communicationScore" INTEGER NOT NULL,
  "strengths" JSONB NOT NULL,
  "missingConcepts" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReadinessSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadinessSnapshot_interviewId_key" ON "ReadinessSnapshot"("interviewId");
CREATE INDEX "ReadinessSnapshot_candidateId_createdAt_idx" ON "ReadinessSnapshot"("candidateId", "createdAt");

ALTER TABLE "ReadinessSnapshot"
ADD CONSTRAINT "ReadinessSnapshot_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReadinessSnapshot"
ADD CONSTRAINT "ReadinessSnapshot_interviewId_fkey"
FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;