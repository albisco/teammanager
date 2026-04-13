/**
 * Shared types for the MCP server tools.
 *
 * The MCP server is mounted at /api/mcp and serves natural-language queries
 * about rostering. Every tool call resolves an `Authorization: Bearer <token>`
 * header to a User row, builds a Scope object based on that user's role, and
 * passes the scope into the tool handler. Tools MUST consult the scope before
 * touching the database.
 */

import type { Role } from "@prisma/client";

export type Scope = {
  userId: string;
  role: Role;
  /** null only for SUPER_ADMIN */
  clubId: string | null;
  /** "all" means no team filter (SUPER_ADMIN, ADMIN within club). Otherwise an explicit allowlist. */
  allowedTeamIds: "all" | string[];
  /** "all" means no player filter (SUPER_ADMIN, ADMIN, TEAM_MANAGER). Explicit list for FAMILY. */
  allowedPlayerIds: "all" | string[];
  /** Family identifiers (synthetic surname-based ids) the user can act on. "all" for non-FAMILY roles. */
  allowedFamilyIds: "all" | string[];
};

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  clubId: string | null;
  managedTeamIds: string[];
  playerIds: string[];
};

export type ToolContext = {
  user: AuthedUser;
  scope: Scope;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool's input parameters. */
  inputSchema: {
    type: "object";
    properties: Record<string, JsonValue>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /**
   * Handler returns a value that will be JSON.stringified before being sent
   * back to the MCP client. Return type is `unknown` because handler outputs
   * frequently include union types that JsonValue can't model precisely
   * (JSON.stringify drops undefined at runtime).
   */
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export class McpError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = "McpError";
  }
}

/** JSON-RPC 2.0 / MCP error codes we use. */
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Application-specific (above -32000):
  Unauthorized: -32001,
  Forbidden: -32003,
  NotFound: -32004,
  RateLimited: -32005,
} as const;
