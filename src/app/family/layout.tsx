"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/family/dashboard", label: "Dashboard" },
  { href: "/family/availability", label: "Availability" },
  { href: "/family/roster", label: "Duties" },
];

export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-blue-900 text-white flex flex-col">
        <div className="p-4 border-b border-blue-700">
          <h1 className="text-lg font-bold">Team Manager</h1>
          <p className="text-sm text-blue-300">Family Portal</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-blue-700 text-white"
                  : "text-blue-200 hover:bg-blue-800 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-blue-700">
          <p className="text-sm text-blue-300 mb-2">{session?.user?.name}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-blue-200 hover:text-white"
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
