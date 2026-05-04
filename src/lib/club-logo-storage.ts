import { put, del } from "@vercel/blob";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./club-logo";

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
