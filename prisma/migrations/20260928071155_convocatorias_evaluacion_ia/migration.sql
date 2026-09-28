-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "afterClose" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiEvaluationNotice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cycleId" TEXT,
ADD COLUMN     "questionSetVersion" TEXT NOT NULL DEFAULT 'desafio-2026-09-v1',
ADD COLUMN     "rubricVersion" TEXT,
ALTER COLUMN "helpedDecideStory" DROP NOT NULL,
ALTER COLUMN "scoreTotal" DROP NOT NULL,
ALTER COLUMN "scoreBreakdown" DROP NOT NULL,
ALTER COLUMN "scoreIndicators" DROP NOT NULL,
ALTER COLUMN "scoringVersion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "cycleId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'NEW_APPLICATION',
ADD COLUMN     "payload" JSONB,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RecruitmentCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "targetCount" INTEGER NOT NULL DEFAULT 5,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "rubricVersion" TEXT NOT NULL,
    "eligibilityVersion" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "shortlist" JSONB,
    "shortlistVersion" INTEGER NOT NULL DEFAULT 0,
    "noticeSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "questionSetVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'AI',
    "provider" TEXT,
    "model" TEXT,
    "dimensions" JSONB,
    "weights" JSONB,
    "total" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReasons" JSONB,
    "aiDimensions" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "inputDigest" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentCycle_status_createdAt_idx" ON "RecruitmentCycle"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Evaluation_status_idx" ON "Evaluation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_applicationId_rubricVersion_key" ON "Evaluation"("applicationId", "rubricVersion");

-- CreateIndex
CREATE INDEX "Application_cycleId_idx" ON "Application"("cycleId");

-- CreateIndex
CREATE INDEX "Notification_kind_cycleId_idx" ON "Notification"("kind", "cycleId");

-- AddForeignKey
ALTER TABLE "RecruitmentCycle" ADD CONSTRAINT "RecruitmentCycle_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RecruitmentCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCycle" ADD CONSTRAINT "RecruitmentCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCycle" ADD CONSTRAINT "RecruitmentCycle_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
