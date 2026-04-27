import { describe, test, expect, vi, beforeEach } from "vitest";

// Build our own prisma mock for this file (override the default shared one
// from tests/api/setup.ts, which returns null for every method).
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    round: { findUnique: vi.fn() },
    teamDutyRole: { findUnique: vi.fn(), create: vi.fn() },
    dutyRole: { findUnique: vi.fn() },
    rosterAssignment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { setTestSession, sessions } from "./setup";
import { createRequest } from "./request-helper";
import { PUT } from "@/app/api/teams/[id]/roster/assign/route";

const TEAM_ID = "qa-test-team-id";
const ROUND_ID = "round-1";

describe("PUT /api/teams/[id]/roster/assign — staff-role lazy create", () => {
  beforeEach(() => {
    setTestSession(sessions.admin);
    for (const model of Object.values(prismaMock)) {
      for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
    }
    prismaMock.round.findUnique.mockResolvedValue({ isRosterLocked: false });
  });

  test("DutyRole.id given → lazy-creates TeamDutyRole, stores assignment with new id", async () => {
    const DUTY_ROLE_ID = "duty-role-head-coach";
    const CREATED_TDR_ID = "newly-created-tdr";

    // Not a TeamDutyRole row
    prismaMock.teamDutyRole.findUnique
      .mockResolvedValueOnce(null) // findUnique({ where: { id } })
      .mockResolvedValueOnce(null); // findUnique({ where: { teamId_dutyRoleId } })
    prismaMock.dutyRole.findUnique.mockResolvedValue({
      id: DUTY_ROLE_ID,
      clubId: "qa-club-id",
      teamId: null,
    });
    prismaMock.teamDutyRole.create.mockResolvedValue({ id: CREATED_TDR_ID });
    prismaMock.rosterAssignment.findUnique.mockResolvedValue(null);
    prismaMock.rosterAssignment.create.mockResolvedValue({});

    const res = await PUT(
      createRequest(`/api/teams/${TEAM_ID}/roster/assign`, {
        method: "PUT",
        body: {
          roundId: ROUND_ID,
          teamDutyRoleId: DUTY_ROLE_ID,
          assignedFamilyId: "family_mcgregor",
          assignedFamilyName: "McGregor",
          slot: 0,
        },
      }),
      { params: { id: TEAM_ID } },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.teamDutyRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: TEAM_ID,
          dutyRoleId: DUTY_ROLE_ID,
          roleType: "FIXED",
        }),
      }),
    );
    expect(prismaMock.rosterAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamDutyRoleId: CREATED_TDR_ID,
          assignedFamilyId: "family_mcgregor",
          assignedFamilyName: "McGregor",
        }),
      }),
    );
  });

  test("existing TeamDutyRole.id given → uses it directly, no lazy-create", async () => {
    const TDR_ID = "existing-tdr";
    prismaMock.teamDutyRole.findUnique.mockResolvedValue({ id: TDR_ID });
    prismaMock.rosterAssignment.findUnique.mockResolvedValue(null);
    prismaMock.rosterAssignment.create.mockResolvedValue({});

    const res = await PUT(
      createRequest(`/api/teams/${TEAM_ID}/roster/assign`, {
        method: "PUT",
        body: {
          roundId: ROUND_ID,
          teamDutyRoleId: TDR_ID,
          assignedFamilyId: "family_mcgregor",
          assignedFamilyName: "McGregor",
          slot: 0,
        },
      }),
      { params: { id: TEAM_ID } },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.teamDutyRole.create).not.toHaveBeenCalled();
    expect(prismaMock.rosterAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamDutyRoleId: TDR_ID }),
      }),
    );
  });

  test("person-only override on staff role lazy-creates + stores assignedPersonName", async () => {
    const DUTY_ROLE_ID = "duty-role-head-coach";
    const CREATED_TDR_ID = "tdr-for-head-coach";
    prismaMock.teamDutyRole.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.dutyRole.findUnique.mockResolvedValue({
      id: DUTY_ROLE_ID,
      clubId: "qa-club-id",
      teamId: null,
    });
    prismaMock.teamDutyRole.create.mockResolvedValue({ id: CREATED_TDR_ID });
    prismaMock.rosterAssignment.findUnique.mockResolvedValue(null);
    prismaMock.rosterAssignment.create.mockResolvedValue({});

    const res = await PUT(
      createRequest(`/api/teams/${TEAM_ID}/roster/assign`, {
        method: "PUT",
        body: {
          roundId: ROUND_ID,
          teamDutyRoleId: DUTY_ROLE_ID,
          assignedPersonName: "Jane McGregor",
          slot: 0,
        },
      }),
      { params: { id: TEAM_ID } },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.rosterAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamDutyRoleId: CREATED_TDR_ID,
          assignedPersonName: "Jane McGregor",
        }),
      }),
    );
  });

  test("DutyRole belongs to another team → 400", async () => {
    prismaMock.teamDutyRole.findUnique.mockResolvedValue(null);
    prismaMock.dutyRole.findUnique.mockResolvedValue({
      id: "other",
      clubId: "qa-club-id",
      teamId: "some-other-team",
    });

    const res = await PUT(
      createRequest(`/api/teams/${TEAM_ID}/roster/assign`, {
        method: "PUT",
        body: {
          roundId: ROUND_ID,
          teamDutyRoleId: "other",
          assignedFamilyId: "f1",
          slot: 0,
        },
      }),
      { params: { id: TEAM_ID } },
    );

    expect(res.status).toBe(400);
    expect(prismaMock.teamDutyRole.create).not.toHaveBeenCalled();
  });
});
