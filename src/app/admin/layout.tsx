"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/season", label: "Season" },
  { href: "/admin/voting", label: "Voting" },
  { href: "/admin/roster", label: "Roster" },
  { href: "/admin/playhq", label: "PlayHQ" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">Team Manager</h1>
          <p className="text-sm text-gray-400">Admin Panel</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-gray-700 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-2">{session?.user?.name}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-gray-300 hover:text-white"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 p-8">{children}</main>
    </div>
  );
}
