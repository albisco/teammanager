import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

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

        let teamId: string | null = null;
        if (user.role === "TEAM_MANAGER") {
          const team = await prisma.team.findFirst({
            where: { managerId: user.id },
            select: { id: true },
          });
          teamId = team?.id ?? null;
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
          teamId,
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
