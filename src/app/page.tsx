"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
      router.push("/admin/dashboard");
    } else if (session?.user?.role === "TEAM_MANAGER") {
      router.push("/manager/dashboard");
    } else if (session?.user) {
      router.push("/family/dashboard");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold mb-2">Team Manager</h1>
      <p className="text-gray-600 mb-8">Sport team management for clubs and families</p>
      <Link href="/login">
        <Button size="lg">Sign In</Button>
      </Link>
    </div>
  );
}
