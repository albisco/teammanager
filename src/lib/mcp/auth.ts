import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ErrorCodes, McpError, type AuthedUser } from "./types";

/**
 * Hash a plaintext token with SHA-256. We store hashes in McpToken.tokenHash
 * so a DB leak doesn't expose live credentials.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Authenticate an incoming MCP request by its Authorization header.
 * Returns the User (with managed team ids and player ids) on success.
 * Throws an McpError with the right JSON-RPC code on failure.
 */
export async function authenticate(authHeader: string | null | undefined): Promise<AuthedUser> {
  if (!authHeader) {
    throw new McpError(ErrorCodes.Unauthorized, "Missing Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new McpError(ErrorCodes.Unauthorized, "Authorization header must be 'Bearer <token>'");
  }

  const tokenHash = hashToken(match[1].trim());

  const tokenRow = await prisma.mcpToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          managedTeams: { select: { id: true } },
          players: { select: { id: true } },
        },
      },
    },
  });

  if (!tokenRow || tokenRow.revokedAt) {
    throw new McpError(ErrorCodes.Unauthorized, "Invalid or revoked token");
  }

  // Update lastUsedAt fire-and-forget — we don't want to delay the request.
  prisma.mcpToken
    .update({ where: { id: tokenRow.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* swallow — telemetry only */
    });

  const u = tokenRow.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    clubId: u.clubId,
    managedTeamIds: u.managedTeams.map((t) => t.id),
    playerIds: u.players.map((p) => p.id),
  };
}
