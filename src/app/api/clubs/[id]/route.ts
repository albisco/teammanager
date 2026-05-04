import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== Role.SUPER_ADMIN && role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clubId = params.id;

  if (role === Role.ADMIN) {
    const adminClubId = (session.user as Record<string, unknown>)?.clubId as string | undefined;
    if (!adminClubId || adminClubId !== clubId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { name, slug } = body;

  if (role === Role.ADMIN) {
    const superAdminOnlyFields = ["slug", "isAdultClub", "enableAiChat", "enablePlayHq", "allowTeamDutyRoles"];
    if (superAdminOnlyFields.some((f) => body[f] !== undefined)) {
      return NextResponse.json({ error: "ADMINs may only update name" }, { status: 403 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
  }

  if (role === Role.SUPER_ADMIN && !name && !slug) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const data: Record<string, string> = {};
  if (name) data.name = name.trim();
  if (slug && role === Role.SUPER_ADMIN) data.slug = slug.toLowerCase().replace(/\s+/g, "-");

  const club = await prisma.club.update({
    where: { id: clubId },
    data,
  });

  return NextResponse.json(club);
}
