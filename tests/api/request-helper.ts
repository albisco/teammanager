import { NextRequest } from "next/server";

const BASE = "http://localhost:3000";

export function createRequest(
  path: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    searchParams?: Record<string, string>;
  }
): NextRequest {
  const url = new URL(path, BASE);
  if (options?.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const init: RequestInit = {
    method: options?.method || "GET",
  };

  if (options?.body) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }

  return new NextRequest(url, init);
}
