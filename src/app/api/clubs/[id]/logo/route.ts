import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadClubLogo,
  deleteClubLogo,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "@/lib/club-logo";

type RouteContext = { params: { id: string } };

async function authorizeLogoAccess(
  clubId: string
): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role === Role.SUPER_ADMIN) return null;

  if (role === Role.ADMIN) {
    const userClubId = (session.user as Record<string, unknown>)
      ?.clubId as string | undefined;
    if (userClubId === clubId) return null;
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id: clubId } = params;

  const authError = await authorizeLogoAccess(clubId);
  if (authError) return authError;

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return NextResponse.json(
      {
        error: `Invalid mime type "${file.type}". Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes). Maximum is 2MB.` },
      { status: 400 }
    );
  }

  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  const { url } = await uploadClubLogo(clubId, file);

  await prisma.club.update({
    where: { id: clubId },
    data: { logoUrl: url },
  });

  if (club.logoUrl) {
    await deleteClubLogo(club.logoUrl);
  }

  return NextResponse.json({ logoUrl: url });
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id: clubId } = params;

  const authError = await authorizeLogoAccess(clubId);
  if (authError) return authError;

  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  if (!club.logoUrl) {
    return NextResponse.json({ error: "No logo to delete" }, { status: 404 });
  }

  await prisma.club.update({
    where: { id: clubId },
    data: { logoUrl: null },
  });

  await deleteClubLogo(club.logoUrl);

  return NextResponse.json({ success: true });
}
