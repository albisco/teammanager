"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/clubs", label: "Clubs", superAdminOnly: true },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/season", label: "Season", clubAdminOnly: true },
  { href: "/admin/voting", label: "Voting", clubAdminOnly: true },
  { href: "/admin/roster", label: "Roster", clubAdminOnly: true },
  { href: "/admin/playhq", label: "PlayHQ", clubAdminOnly: true },
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
          {navItems
            .filter((item) => {
              const role = (session?.user as Record<string, unknown>)?.role;
              if (item.superAdminOnly && role !== "SUPER_ADMIN") return false;
              if (item.clubAdminOnly && role === "SUPER_ADMIN") return false;
              return true;
            })
            .map((item) => (
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
