CREATE TABLE "JobAnalysis" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "fitScore" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "strengths" JSONB NOT NULL,
  "gaps" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JobAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobAnalysis_candidateId_key" ON "JobAnalysis"("candidateId");

ALTER TABLE "JobAnalysis"
ADD CONSTRAINT "JobAnalysis_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
