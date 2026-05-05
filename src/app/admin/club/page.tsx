"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoDropzone } from "@/components/logo-dropzone";
import { toast } from "sonner";
import { parseVotingScheme } from "@/lib/voting-scheme";

interface Club {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  enableRoster: boolean;
  enableAwards: boolean;
  votingScheme: number[];
  parentVoterCount: number;
  coachVoterCount: number;
  maxVotesPerRound: number;
  enforceFamilyVoteExclusion: boolean;
  isAdultClub: boolean;
  allowTeamDutyRoles: boolean;
  enableAiChat: boolean;
  enablePlayHq: boolean;
}

function LockBadge() {
  return (
    <span
      title="Contact support to change"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500 border border-gray-200 cursor-default"
    >
      🔒 Set by support
    </span>
  );
}

export default function ClubSettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const sessionUser = session?.user as (Record<string, unknown> | undefined);
  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Section 1 — Identity
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Section 2 — Features
  const [enableRoster, setEnableRoster] = useState(true);
  const [enableAwards, setEnableAwards] = useState(true);

  // Section 3 — Voting
  const [schemeInput, setSchemeInput] = useState("5,4,3,2,1");
  const [parentVoterCount, setParentVoterCount] = useState(3);
  const [coachVoterCount, setCoachVoterCount] = useState(1);
  const [maxVotesPerRound, setMaxVotesPerRound] = useState(4);
  const [enforceFamilyVoteExclusion, setEnforceFamilyVoteExclusion] = useState(false);

  // Section 4 — Plan & compliance (SUPER_ADMIN editable only)
  const [isAdultClub, setIsAdultClub] = useState(false);
  const [allowTeamDutyRoles, setAllowTeamDutyRoles] = useState(false);
  const [enableAiChat, setEnableAiChat] = useState(true);
  const [enablePlayHq, setEnablePlayHq] = useState(true);

  useEffect(() => {
    async function fetchClub() {
      try {
        const res = await fetch("/api/clubs");
        if (!res.ok) return;
        const clubs = await res.json();
        const c: Club = clubs[0];
        if (c) {
          setClub(c);
          setName(c.name);
          setLogoUrl(c.logoUrl);
          setEnableRoster(c.enableRoster);
          setEnableAwards(c.enableAwards);
          setSchemeInput((c.votingScheme ?? [5, 4, 3, 2, 1]).join(", "));
          setParentVoterCount(c.parentVoterCount ?? 3);
          setCoachVoterCount(c.coachVoterCount ?? 1);
          setMaxVotesPerRound(c.maxVotesPerRound ?? 4);
          setEnforceFamilyVoteExclusion(c.enforceFamilyVoteExclusion ?? false);
          setIsAdultClub(c.isAdultClub ?? false);
          setAllowTeamDutyRoles(c.allowTeamDutyRoles ?? false);
          setEnableAiChat(c.enableAiChat ?? true);
          setEnablePlayHq(c.enablePlayHq ?? true);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchClub();
  }, []);

  const schemeResult = parseVotingScheme(schemeInput, maxVotesPerRound);

  const isDirty =
    club !== null &&
    (name.trim() !== club.name ||
      enableRoster !== club.enableRoster ||
      enableAwards !== club.enableAwards ||
      (schemeResult.ok && JSON.stringify(schemeResult.value) !== JSON.stringify(club.votingScheme ?? [5, 4, 3, 2, 1])) ||
      parentVoterCount !== (club.parentVoterCount ?? 3) ||
      coachVoterCount !== (club.coachVoterCount ?? 1) ||
      maxVotesPerRound !== (club.maxVotesPerRound ?? 4) ||
      enforceFamilyVoteExclusion !== (club.enforceFamilyVoteExclusion ?? false) ||
      (isSuperAdmin && (
        isAdultClub !== (club.isAdultClub ?? false) ||
        allowTeamDutyRoles !== (club.allowTeamDutyRoles ?? false) ||
        enableAiChat !== (club.enableAiChat ?? true) ||
        enablePlayHq !== (club.enablePlayHq ?? true)
      )));

  const canSave = isDirty && schemeResult.ok;

  const handleSave = async () => {
    if (!club || !canSave || !schemeResult.ok) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Club name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (trimmedName !== club.name) body.name = trimmedName;
      if (enableRoster !== club.enableRoster) body.enableRoster = enableRoster;
      if (enableAwards !== club.enableAwards) body.enableAwards = enableAwards;
      if (JSON.stringify(schemeResult.value) !== JSON.stringify(club.votingScheme ?? [5, 4, 3, 2, 1])) {
        body.votingScheme = schemeInput;
      }
      if (parentVoterCount !== (club.parentVoterCount ?? 3)) body.parentVoterCount = parentVoterCount;
      if (coachVoterCount !== (club.coachVoterCount ?? 1)) body.coachVoterCount = coachVoterCount;
      if (maxVotesPerRound !== (club.maxVotesPerRound ?? 4)) body.maxVotesPerRound = maxVotesPerRound;
      if (enforceFamilyVoteExclusion !== (club.enforceFamilyVoteExclusion ?? false)) {
        body.enforceFamilyVoteExclusion = enforceFamilyVoteExclusion;
      }
      if (isSuperAdmin) {
        if (isAdultClub !== (club.isAdultClub ?? false)) body.isAdultClub = isAdultClub;
        if (allowTeamDutyRoles !== (club.allowTeamDutyRoles ?? false)) body.allowTeamDutyRoles = allowTeamDutyRoles;
        if (enableAiChat !== (club.enableAiChat ?? true)) body.enableAiChat = enableAiChat;
        if (enablePlayHq !== (club.enablePlayHq ?? true)) body.enablePlayHq = enablePlayHq;
      }

      if (Object.keys(body).length === 0) return;

      const res = await fetch(`/api/clubs/${club.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        return;
      }
      const updated: Club = await res.json();
      setClub(updated);
      setName(updated.name);
      setEnableRoster(updated.enableRoster);
      setEnableAwards(updated.enableAwards);
      setSchemeInput((updated.votingScheme ?? [5, 4, 3, 2, 1]).join(", "));
      setParentVoterCount(updated.parentVoterCount ?? 3);
      setCoachVoterCount(updated.coachVoterCount ?? 1);
      setMaxVotesPerRound(updated.maxVotesPerRound ?? 4);
      setEnforceFamilyVoteExclusion(updated.enforceFamilyVoteExclusion ?? false);
      setIsAdultClub(updated.isAdultClub ?? false);
      setAllowTeamDutyRoles(updated.allowTeamDutyRoles ?? false);
      setEnableAiChat(updated.enableAiChat ?? true);
      setEnablePlayHq(updated.enablePlayHq ?? true);
      await updateSession();
      toast.success("Club settings saved");
    } catch {
      toast.error("Failed to save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Club Settings</h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Club Settings</h1>
        <p className="text-muted-foreground">Club not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Club Settings</h1>

      <div className="space-y-8">
        {/* Section 1 — Identity */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Identity</h2>

          <div className="space-y-2">
            <Label htmlFor="club-name">Club Name</Label>
            <Input
              id="club-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter club name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="club-slug">Slug</Label>
            <Input
              id="club-slug"
              value={club.slug}
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              Slug can only be changed by a super admin.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Club Logo</Label>
            <LogoDropzone
              clubId={club.id}
              clubName={name || club.name}
              logoUrl={logoUrl}
              onLogoChange={setLogoUrl}
            />
            <p className="text-xs text-muted-foreground">
              Logo changes save automatically when you upload or remove.
            </p>
          </div>
        </section>

        {/* Section 2 — Features */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Features</h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableRoster}
              onChange={(e) => setEnableRoster(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div>
              <span className="font-medium text-sm">Enable duty roster</span>
              <p className="text-xs text-muted-foreground">
                Shows the Roster nav link and allows duty assignment.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableAwards}
              onChange={(e) => setEnableAwards(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div>
              <span className="font-medium text-sm">Enable B&amp;F awards</span>
              <p className="text-xs text-muted-foreground">
                Shows the Voting and Awards nav links.
              </p>
            </div>
          </label>
        </section>

        {/* Section 3 — Voting */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Voting</h2>

          <div className="space-y-2">
            <Label htmlFor="voting-scheme">Voting Scheme</Label>
            <Input
              id="voting-scheme"
              value={schemeInput}
              onChange={(e) => setSchemeInput(e.target.value)}
              placeholder="e.g. 5, 4, 3, 2, 1"
              title="Comma-separated, strictly descending positive integers (1–10 entries)"
            />
            {!schemeResult.ok && (
              <p className="text-xs text-red-600">{schemeResult.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="parent-voter-count">Parent voter cap</Label>
              <Input
                id="parent-voter-count"
                type="number"
                min={0}
                value={parentVoterCount}
                onChange={(e) => setParentVoterCount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-voter-count">Coach voter cap</Label>
              <Input
                id="coach-voter-count"
                type="number"
                min={0}
                value={coachVoterCount}
                onChange={(e) => setCoachVoterCount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-votes">Max votes per round</Label>
            <Input
              id="max-votes"
              type="number"
              min={1}
              value={maxVotesPerRound}
              onChange={(e) => setMaxVotesPerRound(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <p className="text-xs text-muted-foreground">
              When a round reaches this many votes, voting auto-closes.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enforceFamilyVoteExclusion}
              onChange={(e) => setEnforceFamilyVoteExclusion(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div>
              <span className="font-medium text-sm">Enforce family vote exclusion</span>
              <p className="text-xs text-muted-foreground">
                Only families rostered on a voting duty role can cast parent votes.
              </p>
            </div>
          </label>
        </section>

        {/* Section 4 — Plan & compliance */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Plan &amp; compliance</h2>
            {!isSuperAdmin && <LockBadge />}
          </div>

          <PlanField
            checked={isAdultClub}
            onChange={setIsAdultClub}
            locked={!isSuperAdmin}
            label="Adult / self-managed club"
            description="Players vote each other; enables the PLAYER voter type on the vote page. Team managers are optional."
          />

          <PlanField
            checked={allowTeamDutyRoles}
            onChange={setAllowTeamDutyRoles}
            locked={!isSuperAdmin}
            label="Allow team-level duty role overrides"
            description="Teams can customise their duty role set rather than inheriting club defaults."
          />

          <PlanField
            checked={enableAiChat}
            onChange={setEnableAiChat}
            locked={!isSuperAdmin}
            label="Enable AI chat (/ask)"
            description="Shows the Ask AI nav link and activates the AI chat endpoint."
          />

          <PlanField
            checked={enablePlayHq}
            onChange={setEnablePlayHq}
            locked={!isSuperAdmin}
            label="Enable PlayHQ integration"
            description="Shows the PlayHQ nav link for fixture sync."
          />
        </section>

        {/* Save */}
        <Button onClick={handleSave} disabled={saving || !canSave}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function PlanField({
  checked,
  onChange,
  locked,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  locked: boolean;
  label: string;
  description: string;
}) {
  return (
    <label className={`flex items-center gap-3 ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !locked && onChange(e.target.checked)}
        disabled={locked}
        className="h-4 w-4 rounded border-gray-300"
        title={locked ? "Contact support to change" : undefined}
      />
      <div>
        <span className="font-medium text-sm">{label}</span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}
