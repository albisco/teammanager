"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";

export default function ManagerAskPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as Record<string, unknown> | undefined;

  useEffect(() => {
    if (status === "authenticated" && user?.enableAiChat === false) {
      router.replace("/manager/dashboard");
    }
  }, [status, user, router]);

  if (status !== "authenticated" || user?.enableAiChat === false) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Ask AI</h1>
      <ChatPanel />
    </div>
  );
}
