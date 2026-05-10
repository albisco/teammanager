import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./club-logo";

export async function uploadClubLogo(
  _clubId: string,
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

  const buf = Buffer.from(await file.arrayBuffer());
  const url = `data:${file.type};base64,${buf.toString("base64")}`;
  return { url };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteClubLogo(url: string): Promise<void> {
  // no-op: data URL stored in DB column, overwritten on next upload
}
