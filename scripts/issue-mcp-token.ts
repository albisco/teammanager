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

import { randomBytes, createHash, randomUUID } from "crypto";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

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

  const sql = neon(process.env.DATABASE_URL!);

  const users = await sql`SELECT id, name, email, role FROM "User" WHERE email = ${email}`;
  const user = users[0] as { id: string; name: string; email: string; role: string } | undefined;
  if (!user) {
    // eslint-disable-next-line no-console
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (rotate) {
    const result = await sql`
      UPDATE "McpToken" SET "revokedAt" = NOW()
      WHERE "userId" = ${user.id} AND name = ${name} AND "revokedAt" IS NULL
    `;
    // eslint-disable-next-line no-console
    console.log(`Revoked ${result.length} existing token(s) for ${email} / ${name}`);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO "McpToken" (id, "userId", name, "tokenHash", "createdAt")
    VALUES (${id}, ${user.id}, ${name}, ${tokenHash}, NOW())
    RETURNING id, name, "createdAt"
  `;
  const row = rows[0] as { id: string; name: string; createdAt: string };

  // eslint-disable-next-line no-console
  console.log(`
✓ Token issued for ${user.name} (${user.email}, role: ${user.role})

  Label:    ${row.name}
  ID:       ${row.id}
  Created:  ${new Date(row.createdAt).toISOString()}

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
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
