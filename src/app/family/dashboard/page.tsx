"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FamilyDashboard() {
  const { data: session } = useSession();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Family Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Welcome, {session?.user?.name ?? "Family"}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Your Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Next Duty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Upcoming Rounds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
