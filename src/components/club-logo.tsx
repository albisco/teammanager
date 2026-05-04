"use client";

import { getInitials, getColorFromName } from "@/lib/club-logo";

type ClubLogoSize = "sm" | "md" | "hero";

const sizeMap: Record<ClubLogoSize, number> = {
  sm: 32,
  md: 40,
  hero: 80,
};

const textSizeMap: Record<ClubLogoSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  hero: "text-2xl",
};

interface ClubLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: ClubLogoSize;
}

export function ClubLogo({ name, logoUrl, size = "md" }: ClubLogoProps) {
  const px = sizeMap[size];

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        width={px}
        height={px}
        className="rounded object-contain"
        style={{ width: px, height: px }}
      />
    );
  }

  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded font-semibold text-white ${textSizeMap[size]}`}
      style={{ width: px, height: px, backgroundColor: bgColor }}
    >
      {initials}
    </span>
  );
}
