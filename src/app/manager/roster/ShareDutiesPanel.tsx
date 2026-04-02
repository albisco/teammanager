"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Duty {
  roleName: string;
  names: string[];
}

interface Round {
  id: string;
  roundNumber: number;
  date: string | null;
  opponent: string | null;
  venue: string | null;
  isBye?: boolean;
}

interface ShareDutiesPanelProps {
  round: Round;
  duties: Duty[];
  teamName: string;
  // Optional: if provided, shows a round selector
  rounds?: Round[];
  onRoundChange?: (roundId: string) => void;
}

function formatMessage(round: Round, duties: Duty[], teamName: string): string {
  const dateStr = round.date
    ? new Date(round.date).toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  const header = [
    `Round ${round.roundNumber} \u2013 ${teamName}`,
    [dateStr, round.opponent ? `vs ${round.opponent}` : null, round.venue]
      .filter(Boolean)
      .join(" | "),
  ]
    .filter(Boolean)
    .join("\n");

  const body = duties.map((d) => `${d.roleName}: ${d.names.join(", ")}`).join("\n");

  return duties.length > 0 ? `${header}\n\n${body}` : header;
}

export default function ShareDutiesPanel({
  round,
  duties,
  teamName,
  rounds,
  onRoundChange,
}: ShareDutiesPanelProps) {
  const [copying, setCopying] = useState(false);

  const message = formatMessage(round, duties, teamName);

  async function handleCopy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed — try selecting the text manually");
    }
    setCopying(false);
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div className="border rounded-lg p-4 bg-white mb-6">
      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <h2 className="text-base font-semibold">Share Round Duties</h2>
        {rounds && onRoundChange && (
          <select
            className="text-sm border rounded px-2 py-1"
            value={round.id}
            onChange={(e) => onRoundChange(e.target.value)}
          >
            {rounds
              .filter((r) => !r.isBye)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  Round {r.roundNumber}
                  {r.date
                    ? ` — ${new Date(r.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
                    : ""}
                </option>
              ))}
          </select>
        )}
      </div>

      {duties.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">No duties assigned for Round {round.roundNumber} yet.</p>
      ) : (
        <pre className="text-sm bg-gray-50 border rounded p-3 mb-3 whitespace-pre-wrap font-sans">
          {message}
        </pre>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          disabled={copying || duties.length === 0}
        >
          {copying ? "Copying..." : "Copy"}
        </Button>
        <Button
          size="sm"
          onClick={handleWhatsApp}
          disabled={duties.length === 0}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          WhatsApp
        </Button>
      </div>
    </div>
  );
}
