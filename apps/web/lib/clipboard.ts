// Browser clipboard glue shared by the map finder panel and the resource-point
// popup (the popup renders OUTSIDE React via Leaflet, so this must not depend
// on any component).

/**
 * Copy `text` to the clipboard. The Clipboard API can be unavailable or denied
 * (non-HTTPS, permissions) — fall back to window.prompt so the user can copy
 * manually. Resolves true only when the silent clipboard write succeeded
 * (callers use it to flash a "Copied!" confirmation).
 */
export async function copyText(text: string, promptLabel: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt(promptLabel, text);
    return false;
  }
}
