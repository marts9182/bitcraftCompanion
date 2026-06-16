// Stub for "next/cache" — no-op in Vitest so pure-function tests in modules
// that import unstable_cache can still run without the Next.js runtime.
export function unstable_cache<T extends (...args: never[]) => Promise<unknown>>(fn: T): T {
  return fn;
}
export function revalidateTag(_tag: string): void {}
export function revalidatePath(_path: string): void {}
