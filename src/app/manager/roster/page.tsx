"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

interface RosterRound {
  id: string;
  roundNumber: number;
  isBye: boolean;
  opponent: string | null;
}

interface RosterRole {
  id: string;
  roleName: string;
  roleType: string;
}

interface RosterData {
  rounds: RosterRound[];
  roles: RosterRole[];
  assignments: Record<string, { familyId: string; familyName: string }>;
}

const ROLE_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  FIXED: "default",
  SPECIALIST: "secondary",
  ROTATING: "outline",
  FREQUENCY: "secondary",
};

export default function ManagerRosterPage() {
  const { data: session } = useSession();
  const teamId = (session?.user as Record<string, unknown>)?.teamId as string | null;
  const [rosterData, setRosterData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    fetch(`/api/teams/${teamId}/roster`)
      .then((r) => r.json())
      .then((data) => { setRosterData(data); setLoading(false); });
  }, [teamId]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const activeRounds = rosterData?.rounds.filter((r) => !r.isBye) || [];
  const hasAssignments = rosterData && Object.keys(rosterData.assignments).length > 0;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Roster</h1>

      {!hasAssignments ? (
        <p className="text-gray-500">No roster generated yet. Contact your club admin to generate the roster.</p>
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-x-auto mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[160px]">Role</TableHead>
                  {activeRounds.map((r) => (
                    <TableHead key={r.id} className="text-center min-w-[100px]">
                      <div>R{r.roundNumber}</div>
                      {r.opponent && (
                        <div className="text-xs font-normal text-gray-400">{r.opponent}</div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rosterData!.roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">
                      <div className="flex items-center gap-2">
                        {role.roleName}
                        <Badge variant={ROLE_TYPE_VARIANTS[role.roleType] || "outline"} className="text-xs">
                          {role.roleType}
                        </Badge>
                      </div>
                    </TableCell>
                    {activeRounds.map((round) => {
                      const assignment = rosterData!.assignments[`${round.id}:${role.id}`];
                      return (
                        <TableCell key={round.id} className="text-center text-sm">
                          {assignment ? assignment.familyName : <span className="text-gray-300">—</span>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-gray-400">Contact your club admin to regenerate or modify the roster.</p>
        </>
      )}
    </div>
  );
}
