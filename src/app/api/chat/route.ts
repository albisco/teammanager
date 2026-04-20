import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildScope } from "@/lib/mcp/scope";
import { allTools, toolsByName } from "@/lib/mcp/tools";
import type { AuthedUser, ToolContext } from "@/lib/mcp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.CHAT_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 10;

const SYSTEM_PROMPT = `You are a helpful assistant for Team Manager, a sports team management app. You help administrators and team managers answer questions about their teams, rosters, duty assignments, player availability, and more.

Use the tools available to look up real data before answering. Be concise and direct. Format duty lists, player names, and round details clearly. If asked about data you cannot access due to role restrictions, explain what the user can see based on their permissions.

When showing roster or duty information, prefer tables or bullet-point lists for readability. Dates should be formatted in Australian format (DD/MM/YYYY).`;

/**
 * Build an AuthedUser from the NextAuth session by loading the
 * same relations the MCP token auth path uses.
 */
async function sessionToAuthedUser(
  session: { user: Record<string, unknown> }
): Promise<AuthedUser> {
  const u = session.user;
  const userId = u.id as string;

  // Load managedTeams + players relations (same as mcp/auth.ts)
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      managedTeams: { select: { id: true } },
      players: { select: { id: true } },
    },
  });

  if (!dbUser) {
    throw new Error("User not found");
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    clubId: dbUser.clubId,
    managedTeamIds: dbUser.managedTeams.map((t) => t.id),
    playerIds: dbUser.players.map((p) => p.id),
  };
}

/**
 * Convert our MCP tool definitions to the Anthropic API tool format.
 */
function mcpToolsToAnthropicTools(): Anthropic.Tool[] {
  return allTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: NextRequest) {
  // Auth: require a logged-in session with ADMIN or TEAM_MANAGER role
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  const role = user.role as string;
  if (!([Role.SUPER_ADMIN, Role.ADMIN, Role.TEAM_MANAGER] as string[]).includes(role)) {
    return NextResponse.json(
      { error: "Chat is only available to administrators and team managers" },
      { status: 403 }
    );
  }

  if (user.enableAiChat === false) {
    return NextResponse.json(
      { error: "AI chat is disabled for this club" },
      { status: 403 }
    );
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Chat is not configured (missing API key)" },
      { status: 503 }
    );
  }

  // Parse request body
  let body: { messages: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  try {
    // Build scope from session user
    const authedUser = await sessionToAuthedUser(session as { user: Record<string, unknown> });
    const scope = await buildScope(authedUser);
    const ctx: ToolContext = { user: authedUser, scope };

    const client = new Anthropic();
    const tools = mcpToolsToAnthropicTools();

    // Convert chat messages to Anthropic format
    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Tool-use loop: Claude may call tools multiple times before giving a final answer
    let rounds = 0;
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      // If no tool use, extract text and return
      if (response.stop_reason === "end_turn" || !response.content.some((b) => b.type === "tool_use")) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        return NextResponse.json({ reply: text });
      }

      // Process tool calls
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of assistantContent) {
        if (block.type !== "tool_use") continue;

        const tool = toolsByName.get(block.name);
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: Unknown tool "${block.name}"`,
            is_error: true,
          });
          continue;
        }

        try {
          const output = await tool.handler(
            block.input as Record<string, unknown>,
            ctx
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(output, null, 2),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${message}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    // If we hit the max rounds, return whatever we have
    return NextResponse.json({
      reply: "I wasn't able to fully answer your question within the allowed number of steps. Please try rephrasing or asking a simpler question.",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Chat API error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
