import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "SUPER_ADMIN" | "ADMIN" | "FAMILY";
      clubId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    id: string;
    clubId: string | null;
  }
}
