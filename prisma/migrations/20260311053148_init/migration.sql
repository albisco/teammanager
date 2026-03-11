-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FAMILY');

-- CreateEnum
CREATE TYPE "VotingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "VoterType" AS ENUM ('PARENT', 'COACH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FAMILY',
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "jumperNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT,
    "contactEmail" TEXT,
    "parent1" TEXT,
    "parent2" TEXT,
    "spare1" TEXT,
    "spare2" TEXT,
    "familyId" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "votingScheme" JSONB NOT NULL DEFAULT '[5,4,3,2,1]',
    "parentVoterCount" INTEGER NOT NULL DEFAULT 3,
    "coachVoterCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "opponent" TEXT,
    "venue" TEXT,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingSession" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "status" "VotingStatus" NOT NULL DEFAULT 'OPEN',
    "qrToken" TEXT NOT NULL,

    CONSTRAINT "VotingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "votingSessionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "voterType" "VoterType" NOT NULL,
    "rankings" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyRoleFixed" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,

    CONSTRAINT "DutyRoleFixed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyRoleParent" (
    "id" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,

    CONSTRAINT "DutyRoleParent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterAssignment" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "dutyRoleParentId" TEXT NOT NULL,
    "assignedFamilyId" TEXT NOT NULL,

    CONSTRAINT "RosterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyExclusion" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "dutyRoleParentId" TEXT NOT NULL,

    CONSTRAINT "FamilyExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyUnavailability" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,

    CONSTRAINT "FamilyUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerUnavailability" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,

    CONSTRAINT "PlayerUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Round_seasonId_roundNumber_key" ON "Round"("seasonId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VotingSession_roundId_key" ON "VotingSession"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "VotingSession_qrToken_key" ON "VotingSession"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_votingSessionId_voterId_key" ON "Vote"("votingSessionId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterAssignment_roundId_dutyRoleParentId_key" ON "RosterAssignment"("roundId", "dutyRoleParentId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyExclusion_familyId_dutyRoleParentId_key" ON "FamilyExclusion"("familyId", "dutyRoleParentId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyUnavailability_familyId_roundId_key" ON "FamilyUnavailability"("familyId", "roundId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerUnavailability_playerId_roundId_key" ON "PlayerUnavailability"("playerId", "roundId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingSession" ADD CONSTRAINT "VotingSession_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_votingSessionId_fkey" FOREIGN KEY ("votingSessionId") REFERENCES "VotingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyRoleFixed" ADD CONSTRAINT "DutyRoleFixed_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyRoleFixed" ADD CONSTRAINT "DutyRoleFixed_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyRoleParent" ADD CONSTRAINT "DutyRoleParent_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignment" ADD CONSTRAINT "RosterAssignment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignment" ADD CONSTRAINT "RosterAssignment_dutyRoleParentId_fkey" FOREIGN KEY ("dutyRoleParentId") REFERENCES "DutyRoleParent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignment" ADD CONSTRAINT "RosterAssignment_assignedFamilyId_fkey" FOREIGN KEY ("assignedFamilyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyExclusion" ADD CONSTRAINT "FamilyExclusion_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyExclusion" ADD CONSTRAINT "FamilyExclusion_dutyRoleParentId_fkey" FOREIGN KEY ("dutyRoleParentId") REFERENCES "DutyRoleParent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyUnavailability" ADD CONSTRAINT "FamilyUnavailability_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyUnavailability" ADD CONSTRAINT "FamilyUnavailability_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerUnavailability" ADD CONSTRAINT "PlayerUnavailability_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerUnavailability" ADD CONSTRAINT "PlayerUnavailability_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
