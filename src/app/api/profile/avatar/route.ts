import { limited, fail, ok, requireUser, signedOut } from "@/lib/api/handler";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

// The browser tells us the file type, but anyone can lie. Check the first bytes of the file itself.
async function looksLikeImage(file: File): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const is = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  return is(0xff, 0xd8, 0xff) || is(0x89, 0x50, 0x4e, 0x47) || (is(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50);
}

export async function POST(request: Request) {
  const blocked = await limited(request, { name: "avatar", limit: 20, windowSec: 3600 });
  if (blocked) return blocked;

  const { supabase, user } = await requireUser();
  if (!user) return signedOut();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Choose an image to upload.", 422);
  if (!ALLOWED.has(file.type)) return fail("Use a JPG, PNG or WebP image.", 422);
  if (file.size > MAX_BYTES) return fail("The image must be 2 MB or smaller.", 422);
  if (!(await looksLikeImage(file))) return fail("That file is not a valid image.", 422);

  const path = `${user.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (uploadError) return fail("The upload failed. Try again.", 500);

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (error) return fail("We could not save your photo. Try again.", 500);

  return ok({ avatarUrl });
}
