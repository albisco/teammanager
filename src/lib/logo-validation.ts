import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./club-logo";

export function validateLogoFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return "Unsupported format. Use PNG, JPEG, WebP, or SVG.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "File too large. Maximum size is 2MB.";
  }
  return null;
}
