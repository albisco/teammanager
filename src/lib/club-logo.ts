import { put, del } from "@vercel/blob";

export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function uploadClubLogo(
  clubId: string,
  file: File
): Promise<{ url: string }> {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new Error(
      `Invalid mime type "${file.type}". Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${file.size} bytes). Maximum is 2MB.`);
  }

  const ext = file.name.split(".").pop() || "bin";
  const pathname = `clubs/${clubId}/logo.${ext}`;
  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return { url: blob.url };
}

export async function deleteClubLogo(url: string): Promise<void> {
  await del(url);
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";

  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (trimmed.length >= 2) {
    return trimmed.slice(0, 2).toUpperCase();
  }
  return trimmed[0].toUpperCase();
}

export function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  const saturation = 55 + (Math.abs(hash >> 8) % 20);
  const lightness = 35 + (Math.abs(hash >> 16) % 15);

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
