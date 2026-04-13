import type { ToolDefinition } from "../types";
import { readTools } from "./read";
import { writeTools } from "./write";

export const allTools: ToolDefinition[] = [...readTools, ...writeTools];

export const toolsByName: Map<string, ToolDefinition> = new Map(
  allTools.map((t) => [t.name, t])
);
