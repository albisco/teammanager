import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const existing = await prisma.season.findUnique({ where: { id: params.id } });
  if (!existing || existing.clubId !== clubId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, year } = body;

  const season = await prisma.season.update({
    where: { id: params.id },
    data: {
      name: name || undefined,
      year: year ? parseInt(year) : undefined,
    },
  });

  return NextResponse.json(season);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const clubId = (session.user as Record<string, unknown>)?.clubId as string;

  const existing = await prisma.season.findUnique({ where: { id: params.id } });
  if (!existing || existing.clubId !== clubId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.season.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
