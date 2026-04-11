#!/usr/bin/env tsx
/**
 * Issue an MCP API token for a user.
 *
 * Usage:
 *   npx tsx scripts/issue-mcp-token.ts --email you@example.com --name "claude-desktop"
 *   npx tsx scripts/issue-mcp-token.ts --email you@example.com --name "claude-desktop" --rotate
 *
 * Flags:
 *   --email   The user's email (must already exist in the User table)
 *   --name    A label for this token (e.g. "claude-desktop", "laptop", "iphone")
 *   --rotate  Revoke any existing non-revoked tokens for this user with the same name
 *             before issuing a new one. Use for token rotation.
 *
 * The plaintext token is printed ONCE. Copy it into your MCP client config:
 *
 *   {
 *     "mcpServers": {
 *       "teammanager": {
 *         "url": "https://<your-vercel-app>.vercel.app/api/mcp",
 *         "headers": { "Authorization": "Bearer <token>" }
 *       }
 *     }
 *   }
 *
 * The DB only stores a SHA-256 hash of the token, so this is the only chance
 * to see the plaintext.
 */

import { randomBytes, createHash } from "crypto";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Load .env then .env.local (so .env.local overrides)
config({ path: ".env" });
config({ path: ".env.local", override: true });

function parseArgs(): { email: string; name: string; rotate: boolean } {
  const args = process.argv.slice(2);
  let email = "";
  let name = "";
  let rotate = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--email") email = args[++i] ?? "";
    else if (a === "--name") name = args[++i] ?? "";
    else if (a === "--rotate") rotate = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  if (!email || !name) {
    printHelp();
    process.exit(1);
  }
  return { email, name, rotate };
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
Issue an MCP API token for a user.

Usage:
  npx tsx scripts/issue-mcp-token.ts --email <email> --name <label> [--rotate]

Flags:
  --email   User email (must exist in the User table)
  --name    Token label (e.g. "claude-desktop")
  --rotate  Revoke existing non-revoked tokens for this user+name first
`);
}

async function main() {
  const { email, name, rotate } = parseArgs();

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL not set. Add it to .env or .env.local.");
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // eslint-disable-next-line no-console
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    if (rotate) {
      const revoked = await prisma.mcpToken.updateMany({
        where: { userId: user.id, name, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // eslint-disable-next-line no-console
      console.log(`Revoked ${revoked.count} existing token(s) for ${email} / ${name}`);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const row = await prisma.mcpToken.create({
      data: { userId: user.id, name, tokenHash },
    });

    // eslint-disable-next-line no-console
    console.log(`
✓ Token issued for ${user.name} (${user.email}, role: ${user.role})

  Label:    ${row.name}
  ID:       ${row.id}
  Created:  ${row.createdAt.toISOString()}

Plaintext token (save it now — it won't be shown again):

  ${token}

Add to your MCP client config:

  {
    "mcpServers": {
      "teammanager": {
        "url": "https://<your-vercel-app>.vercel.app/api/mcp",
        "headers": { "Authorization": "Bearer ${token}" }
      }
    }
  }
`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
