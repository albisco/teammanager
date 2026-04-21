import "next-auth";
import type { TeamStaffRole } from "@prisma/client";

type ManagerTeam = { teamId: string; role: TeamStaffRole };

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "SUPER_ADMIN" | "ADMIN" | "TEAM_MANAGER" | "FAMILY";
      clubId: string | null;
      teamId: string | null;
      teams: ManagerTeam[];
      isAdultClub: boolean;
      allowTeamDutyRoles: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    id: string;
    clubId: string | null;
    teamId: string | null;
    teams: ManagerTeam[];
    isAdultClub: boolean;
    allowTeamDutyRoles: boolean;
  }
}
