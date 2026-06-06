import { describe, it, expect, vi } from "vitest";
import { triggerRevalidate } from "./revalidate";

function okResponse(): Response {
  return { ok: true, status: 200, json: async () => ({ revalidated: "all" }) } as unknown as Response;
}

describe("triggerRevalidate", () => {
  it("POSTs {all:true} with the secret header when configured", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return okResponse();
    });
    await triggerRevalidate(
      { url: "https://x.com/api/revalidate", secret: "s3cr3t" },
      fetchFn as unknown as typeof fetch,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://x.com/api/revalidate");
    expect(calls[0]!.init.method).toBe("POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-revalidate-secret"]).toBe("s3cr3t");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ all: true });
  });

  it("does nothing when url is missing", async () => {
    const fetchFn = vi.fn();
    await triggerRevalidate({ secret: "s" }, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when secret is missing", async () => {
    const fetchFn = vi.fn();
    await triggerRevalidate({ url: "https://x.com/api/revalidate" }, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("never throws when fetch rejects", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      triggerRevalidate({ url: "https://x.com/api/revalidate", secret: "s" }, fetchFn as unknown as typeof fetch),
    ).resolves.toBeUndefined();
  });
});
