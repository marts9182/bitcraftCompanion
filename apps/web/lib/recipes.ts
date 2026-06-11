/**
 * The action verb of a recipe, from its localization-template name: the text
 * before the first "{…}" placeholder (e.g. "Package {1} into {0}" → "Package",
 * "Craft {0}" → "Craft"). Falls back to the trimmed whole string when there is
 * no placeholder (or nothing precedes it). Pure, client-safe.
 */
export function recipeVerb(template: string): string {
  const i = template.indexOf("{");
  const v = (i === -1 ? template : template.slice(0, i)).trim();
  return v || template.trim();
}
