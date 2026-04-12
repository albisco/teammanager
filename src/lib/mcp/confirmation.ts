import { randomUUID } from "crypto";

/**
 * Two-step confirmation for write tools.
 *
 * The first call to a write tool returns a preview AND a confirmation token.
 * The caller must repeat the same call with `confirm: true` and the token to
 * actually commit the change. This makes it impossible for an LLM to mutate
 * data on a single ambiguous instruction — the user/LLM has to explicitly
 * acknowledge the preview before anything is written.
 *
 * Tokens are stored in a process-local Map with a 5-minute TTL and are
 * single-use. They do not survive a redeploy (intentional — pending writes
 * shouldn't dangle across deploys).
 *
 * NOTE: Vercel serverless functions are stateless across cold starts and may
 * not share memory between invocations. In practice, two consecutive MCP calls
 * from the same client almost always hit the same warm instance, but if a
 * cold start happens between preview and confirm the user just asks for the
 * preview again. That's an acceptable trade-off vs the complexity of a DB
 * round-trip for every confirmation token.
 */

type Pending = {
  userId: string;
  toolName: string;
  payload: unknown;
  expiresAt: number;
};

const pending = new Map<string, Pending>();
const TTL_MS = 5 * 60 * 1000;

function gc(): void {
  const now = Date.now();
  for (const [token, p] of Array.from(pending.entries())) {
    if (p.expiresAt < now) pending.delete(token);
  }
}

export function issueConfirmationToken(
  userId: string,
  toolName: string,
  payload: unknown
): string {
  gc();
  const token = randomUUID();
  pending.set(token, {
    userId,
    toolName,
    payload,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

/**
 * Consume a confirmation token. Returns the stored payload if the token is
 * valid for this user + tool, otherwise throws. Single-use: the token is
 * deleted on consumption.
 */
export function consumeConfirmationToken(
  token: string,
  userId: string,
  toolName: string
): unknown {
  gc();
  const p = pending.get(token);
  if (!p) {
    throw new Error(
      "Confirmation token is invalid, expired, or already used. Call the tool without `confirm` to get a fresh preview."
    );
  }
  if (p.userId !== userId) {
    throw new Error("Confirmation token does not belong to the current user");
  }
  if (p.toolName !== toolName) {
    throw new Error(
      `Confirmation token was issued for ${p.toolName}, not ${toolName}`
    );
  }
  pending.delete(token);
  return p.payload;
}
