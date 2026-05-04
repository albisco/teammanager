"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ClubLogo } from "@/components/club-logo";
import { ROLE } from "@/lib/roles";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/clubs", label: "Clubs", superAdminOnly: true },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/season", label: "Season", clubAdminOnly: true },
  { href: "/admin/voting", label: "Voting", clubAdminOnly: true },
  { href: "/admin/availability", label: "Availability", clubAdminOnly: true, adultOnly: true },
  { href: "/admin/roster", label: "Roster", clubAdminOnly: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/playhq", label: "PlayHQ", clubAdminOnly: true, requiresPlayHq: true },
  { href: "/admin/ask", label: "Ask AI", clubAdminOnly: true, requiresAiChat: true },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (asideRef.current) {
      const isMobile = window.innerWidth < 768;
      if (!isMobile || sidebarOpen) {
        asideRef.current.removeAttribute("inert");
      } else {
        asideRef.current.setAttribute("inert", "");
      }
    }
  }, [sidebarOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const user = session?.user as Record<string, unknown> | undefined;
  const clubName = user?.clubName as string | undefined;
  const clubLogoUrl = user?.clubLogoUrl as string | undefined;

  const filteredNavItems = navItems.filter((item) => {
    const role = user?.role;
    if (item.superAdminOnly && role !== ROLE.SUPER_ADMIN) return false;
    if (item.clubAdminOnly && role === ROLE.SUPER_ADMIN) return false;
    if ((item as { adultOnly?: boolean }).adultOnly && !user?.isAdultClub) return false;
    if ((item as { requiresAiChat?: boolean }).requiresAiChat && user?.enableAiChat === false) return false;
    if ((item as { requiresPlayHq?: boolean }).requiresPlayHq && user?.enablePlayHq === false) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-gray-900 text-white flex items-center px-4 h-14">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1 mr-3"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="flex-1 text-lg font-bold">Admin Panel</h1>
        <ThemeToggle />
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={asideRef}
        aria-hidden={typeof window !== "undefined" && window.innerWidth < 768 ? !sidebarOpen : undefined}
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {clubName && (
              <ClubLogo name={clubName} logoUrl={clubLogoUrl} size="sm" />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{clubName || "Team Manager"}</h1>
              <p className="text-sm text-gray-400">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 text-gray-400 hover:text-white"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {filteredNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
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
          <p className="text-sm text-gray-400 mb-2 truncate">{session?.user?.name}</p>
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
      <main className="flex-1 min-w-0 bg-background p-4 md:p-8 pt-18 md:pt-8 overflow-x-auto">{children}</main>
    </div>
  );
}
