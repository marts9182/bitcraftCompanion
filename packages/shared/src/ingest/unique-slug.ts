import { slugify } from "./decode";

/** Produce a unique slug for a name, recording it in `used`. Falls back to id. */
export function makeUniqueSlug(name: string, id: number, used: Set<string>): string {
  const base = slugify(name) || String(id);
  const slug = used.has(base) ? `${base}-${id}` : base;
  used.add(slug);
  return slug;
}
