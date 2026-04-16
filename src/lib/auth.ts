import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role, TeamStaffRole } from "@prisma/client";

export type ManagerTeam = { teamId: string; role: TeamStaffRole };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { prisma } = await import("./prisma");

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!isValid) return null;

        let teams: ManagerTeam[] = [];
        if (user.role === Role.TEAM_MANAGER) {
          // Self-heal backfill: if a legacy Team.managerId exists with no
          // matching TeamStaff row, create the TEAM_MANAGER row now. This keeps
          // existing users working until the legacy column is removed in a
          // follow-up PR.
          const [staffRows, legacyManagedTeams] = await Promise.all([
            prisma.teamStaff.findMany({
              where: { userId: user.id },
              select: { teamId: true, role: true },
            }),
            prisma.team.findMany({
              where: { managerId: user.id },
              select: { id: true },
            }),
          ]);

          const existingTeamIds = new Set(staffRows.map((r) => r.teamId));
          const missingLegacyTeams = legacyManagedTeams.filter(
            (t) => !existingTeamIds.has(t.id)
          );

          if (missingLegacyTeams.length > 0) {
            await prisma.teamStaff.createMany({
              data: missingLegacyTeams.map((t) => ({
                teamId: t.id,
                userId: user.id,
                role: TeamStaffRole.TEAM_MANAGER,
              })),
              skipDuplicates: true,
            });
            for (const t of missingLegacyTeams) {
              staffRows.push({
                teamId: t.id,
                role: TeamStaffRole.TEAM_MANAGER,
              });
            }
          }

          teams = staffRows;
        }

        let isAdultClub = false;
        if (user.clubId) {
          const club = await prisma.club.findUnique({
            where: { id: user.clubId },
            select: { isAdultClub: true },
          });
          isAdultClub = club?.isAdultClub ?? false;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clubId: user.clubId,
          teamId: teams[0]?.teamId ?? null,
          teams,
          isAdultClub,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.role = u.role as string;
        token.id = user.id;
        token.clubId = u.clubId as string;
        token.teamId = u.teamId as string | null;
        token.teams = u.teams as ManagerTeam[];
        token.isAdultClub = u.isAdultClub as boolean;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session.user as Record<string, unknown>;
        s.role = token.role;
        s.id = token.id;
        s.clubId = token.clubId;
        s.teamId = token.teamId;
        s.teams = token.teams ?? [];
        s.isAdultClub = token.isAdultClub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
