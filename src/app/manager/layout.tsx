"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ClubLogo } from "@/components/club-logo";
import { TeamSwitcher } from "@/components/ui/team-switcher";
import { useActiveTeam } from "@/hooks/use-active-team";
import { TEAM_STAFF_ROLE } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  teamManagerOnly?: boolean;
  requiresAiChat?: boolean;
  requiresRoster?: boolean;
  requiresAwards?: boolean;
  requiresSelfManaged?: boolean;
};

const navItems: NavItem[] = [
  { href: "/manager/dashboard", label: "Dashboard" },
  { href: "/manager/players", label: "Players" },
  { href: "/manager/fixture", label: "Fixture" },
  { href: "/manager/availability", label: "Availability", requiresSelfManaged: true },
  { href: "/manager/voting", label: "Voting", teamManagerOnly: true },
  { href: "/manager/roster", label: "Roster", requiresRoster: true },
  { href: "/manager/awards", label: "Awards", requiresAwards: true },
  { href: "/manager/ask", label: "Ask AI", requiresAiChat: true },
];

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { activeStaffRole } = useActiveTeam();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const user = session?.user as Record<string, unknown> | undefined;
  const sessionLoaded = !!user;
  const visibleNavItems = navItems.filter((item) => {
    // While session loads, hide feature-gated items to avoid flashing links the user can't access.
    if (!sessionLoaded && (item.teamManagerOnly || item.requiresAiChat || item.requiresRoster || item.requiresAwards || item.requiresSelfManaged)) return false;
    if (item.teamManagerOnly && activeStaffRole !== TEAM_STAFF_ROLE.TEAM_MANAGER) return false;
    if (item.requiresAiChat && user?.enableAiChat === false) return false;
    if (item.requiresRoster && user?.teamEnableRoster === false) return false;
    if (item.requiresAwards && user?.teamEnableAwards === false) return false;
    if (item.requiresSelfManaged && user?.teamSelfManaged !== true) return false;
    return true;
  });

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
        <h1 className="flex-1 text-lg font-bold">Team Manager</h1>
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
            {(user?.clubName as string) && (
              <ClubLogo
                name={user?.clubName as string}
                logoUrl={user?.clubLogoUrl as string | undefined}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{(user?.clubName as string) || "Team Manager"}</h1>
              <p className="text-sm text-gray-400 truncate">{session?.user?.name}</p>
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
        <TeamSwitcher />
        <nav className="flex-1 p-4 space-y-1">
          {visibleNavItems.map((item) => (
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
