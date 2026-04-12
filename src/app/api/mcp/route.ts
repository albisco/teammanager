import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/mcp/auth";
import { buildScope } from "@/lib/mcp/scope";
import { allTools, toolsByName } from "@/lib/mcp/tools";
import {
  ErrorCodes,
  McpError,
  type JsonValue,
  type ToolContext,
} from "@/lib/mcp/types";

/**
 * Stateless MCP server for Team Manager rostering queries.
 *
 * Mounted at POST /api/mcp. Implements the JSON-RPC 2.0 methods that the
 * Model Context Protocol uses for tools — `initialize`, `tools/list`,
 * `tools/call`, plus `ping`. No SSE / no session state — every request
 * authenticates independently via Authorization: Bearer <token>.
 *
 * MCP client config (Claude Desktop, Claude Code, etc.):
 *
 *   {
 *     "mcpServers": {
 *       "teammanager": {
 *         "url": "https://<your-vercel-app>.vercel.app/api/mcp",
 *         "headers": { "Authorization": "Bearer <issued-token>" }
 *       }
 *     }
 *   }
 *
 * Tokens are issued via `npx tsx scripts/issue-mcp-token.ts --email you@…`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "teammanager-mcp", version: "0.1.0" };

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: JsonValue;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: JsonValue };
};

function rpcSuccess(id: string | number | null, result: JsonValue): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(
  req: JsonRpcRequest,
  ctx: ToolContext | null
): Promise<JsonRpcSuccess | JsonRpcError | null> {
  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "initialize":
        return rpcSuccess(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });

      case "notifications/initialized":
      case "notifications/cancelled":
        // Notifications — no response.
        return null;

      case "ping":
        return rpcSuccess(id, {});

      case "tools/list":
        return rpcSuccess(id, {
          tools: allTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema as unknown as JsonValue,
          })),
        });

      case "tools/call": {
        if (!ctx) {
          return rpcError(id, ErrorCodes.Unauthorized, "Authentication required for tool calls");
        }
        const params = req.params ?? {};
        const name = String(params.name ?? "");
        const args = (params.arguments as Record<string, unknown> | undefined) ?? {};

        const tool = toolsByName.get(name);
        if (!tool) {
          return rpcError(id, ErrorCodes.MethodNotFound, `Unknown tool: ${name}`);
        }

        const start = Date.now();
        try {
          const output = await tool.handler(args, ctx);
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({
              type: "mcp_tool_call",
              userId: ctx.user.id,
              role: ctx.user.role,
              tool: name,
              ok: true,
              durationMs: Date.now() - start,
            })
          );
          return rpcSuccess(id, {
            content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            isError: false,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({
              type: "mcp_tool_call",
              userId: ctx.user.id,
              role: ctx.user.role,
              tool: name,
              ok: false,
              durationMs: Date.now() - start,
              error: message,
            })
          );
          // Tool errors come back as `isError: true` content per MCP spec, NOT as JSON-RPC errors.
          // This lets the LLM see the error message and adapt.
          return rpcSuccess(id, {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
          });
        }
      }

      default:
        return rpcError(id, ErrorCodes.MethodNotFound, `Unknown method: ${req.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof McpError ? err.code : ErrorCodes.InternalError;
    return rpcError(id, code, message);
  }
}

export async function POST(req: NextRequest) {
  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, ErrorCodes.ParseError, "Invalid JSON"), {
      status: 400,
    });
  }

  // Authenticate. tools/list and initialize are accessible without auth so MCP
  // clients can do their handshake before the user has wired up a token, but
  // tools/call requires a valid bearer token.
  let ctx: ToolContext | null = null;
  try {
    const user = await authenticate(req.headers.get("authorization"));
    const scope = await buildScope(user);
    ctx = { user, scope };
  } catch (err) {
    if (err instanceof McpError && err.code === ErrorCodes.Unauthorized) {
      // Allow handshake / discovery without auth, fail tool calls below.
      ctx = null;
    } else {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        rpcError(null, err instanceof McpError ? err.code : ErrorCodes.InternalError, message),
        { status: err instanceof McpError && err.code === ErrorCodes.Forbidden ? 403 : 500 }
      );
    }
  }

  // Batch support — JSON-RPC allows arrays of requests.
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((r) => handleRpc(r as JsonRpcRequest, ctx))
    );
    const filtered = responses.filter((r): r is JsonRpcSuccess | JsonRpcError => r !== null);
    if (filtered.length === 0) {
      // All notifications — 202 Accepted.
      return new NextResponse(null, { status: 202 });
    }
    return NextResponse.json(filtered);
  }

  const single = body as JsonRpcRequest;
  if (!single || typeof single !== "object" || single.jsonrpc !== "2.0") {
    return NextResponse.json(
      rpcError(null, ErrorCodes.InvalidRequest, "Not a valid JSON-RPC 2.0 request"),
      { status: 400 }
    );
  }

  const result = await handleRpc(single, ctx);
  if (result === null) {
    // Notification — no response body.
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(result);
}

/**
 * GET handler — returns server info so curl/browser pings get a friendly
 * response and Vercel's healthchecks have something to hit.
 */
export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: "mcp",
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: "http",
    auth: "Bearer token (Authorization header)",
    toolCount: allTools.length,
  });
}
