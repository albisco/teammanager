import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    const isTeamManager = token?.role === "TEAM_MANAGER";
    const isAdminOrSuper = token?.role === "ADMIN" || token?.role === "SUPER_ADMIN";

    if (path.startsWith("/admin/players") && !isAdminOrSuper && !isTeamManager) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (path.startsWith("/admin") && !path.startsWith("/admin/players") && !isAdminOrSuper) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (path.startsWith("/manager") && token?.role !== "TEAM_MANAGER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/family/:path*", "/manager/:path*"],
};
