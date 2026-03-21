import { vi } from "vitest";

// Mock getServerSession — each test sets the session via setTestSession()
let mockSession: Record<string, unknown> | null = null;

vi.mock("next-auth", async () => {
  const actual = await vi.importActual("next-auth");
  return {
    ...actual,
    getServerSession: vi.fn(() => Promise.resolve(mockSession)),
  };
});

// Mock prisma — we're testing auth gates, not DB logic.
// Return empty arrays / null for all queries so routes don't crash after passing auth.
const handler = {
  get(_target: unknown, prop: string) {
    // Model-level methods
    if (["findMany", "findFirst", "findUnique", "create", "update", "delete", "deleteMany", "createMany", "upsert", "count"].includes(prop)) {
      return vi.fn().mockResolvedValue(prop === "findMany" ? [] : null);
    }
    // $transaction
    if (prop === "$transaction") {
      return vi.fn(async (fn: unknown) => {
        if (typeof fn === "function") return fn(new Proxy({}, modelProxy));
        return [];
      });
    }
    // Model proxy (e.g. prisma.user → proxy with findMany, etc.)
    return new Proxy({}, { get: handler.get.bind(handler) });
  },
};

const modelProxy = { get: handler.get.bind(handler) };

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, handler),
}));

export function setTestSession(session: Record<string, unknown> | null) {
  mockSession = session;
}

// Pre-built sessions for each role
export const sessions = {
  superAdmin: {
    user: {
      id: "qa-superadmin-id",
      email: "qa_superadmin@teammanager.com",
      name: "QA Super Admin",
      role: "SUPER_ADMIN",
      clubId: null,
      teamId: null,
    },
  },
  admin: {
    user: {
      id: "qa-admin-id",
      email: "qa_admin@teammanager.com",
      name: "QA Admin",
      role: "ADMIN",
      clubId: "qa-club-id",
      teamId: null,
    },
  },
  teamManager: {
    user: {
      id: "qa-tm-id",
      email: "qa_tm@teammanager.com",
      name: "QA Team Manager",
      role: "TEAM_MANAGER",
      clubId: "qa-club-id",
      teamId: "qa-test-team-id",
    },
  },
  family: {
    user: {
      id: "qa-family-id",
      email: "qa_family@teammanager.com",
      name: "QA Family",
      role: "FAMILY",
      clubId: "qa-club-id",
      teamId: null,
    },
  },
  none: null,
};
