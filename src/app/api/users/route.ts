import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = (session.user as Record<string, unknown>)?.clubId as string;
  const role = req.nextUrl.searchParams.get("role");

  const users = await prisma.user.findMany({
    where: {
      clubId,
      ...(role ? { role: role as "ADMIN" | "FAMILY" } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
