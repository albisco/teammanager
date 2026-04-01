import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/admin") && token?.role !== "ADMIN" && token?.role !== "SUPER_ADMIN") {
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
  matcher: ["/admin/:path*", "/family/dashboard/:path*", "/manager/:path*"],
};
