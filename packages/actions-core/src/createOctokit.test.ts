import { describe, expect, test } from "bun:test";

import { createOctokit } from "./createOctokit.ts";

/**
 * Drive the client through a stubbed `fetch` rather than an Octokit hook: the retry
 * plugin listens on the request error hook, so only a failure raised by the real
 * transport exercises the retry path we care about.
 */
function stubFetch(responses: Array<() => Response>): {
  fetch: typeof globalThis.fetch;
  calls: () => number;
} {
  let calls = 0;

  return {
    fetch: (() => {
      const next = responses[Math.min(calls, responses.length - 1)]!;
      calls += 1;

      return Promise.resolve(next());
    }) as unknown as typeof globalThis.fetch,
    calls: () => calls,
  };
}

const unicornPage = () =>
  new Response("<!DOCTYPE html>\n<html>Unicorn!</html>", {
    status: 500,
    headers: { "content-type": "text/html" },
  });

const rawFile = () =>
  new Response("# Rules\n", { status: 200, headers: { "content-type": "text/plain" } });

const contentsRoute = "GET /repos/{owner}/{repo}/contents/{path}";
const route = { owner: "awinogradov", repo: "code-assistants", path: "CLAUDE.md" };

// plugin-retry backs off for `(retryCount + 1) ** 2` seconds on a 5xx and offers no
// per-request knob to shorten it, so the 5xx cases allow a single retry (one ~1s wait)
// to stay well inside the default test timeout. The 404 case must NOT set `retries`:
// an explicit budget makes Bottleneck retry regardless of status, which would bypass
// the very `doNotRetry` default the test is pinning.
const singleRetry = { retries: 1 };

describe("createOctokit", () => {
  test("retries a transient 5xx and returns the eventual success", async () => {
    const transport = stubFetch([unicornPage, rawFile]);
    const octokit = createOctokit("token");

    const response = await octokit.request(contentsRoute, {
      ...route,
      request: { fetch: transport.fetch, ...singleRetry },
    });

    expect(transport.calls()).toBe(2);
    expect(response.status).toBe(200);
    // The contents route is typed as structured JSON; `Accept: raw` hands back a plain body.
    expect(String(response.data)).toBe("# Rules\n");
  });

  test("does not retry a 404 — a genuinely missing file fails fast", async () => {
    const transport = stubFetch([
      () =>
        new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    ]);
    const octokit = createOctokit("token");

    await expect(
      octokit.request(contentsRoute, {
        ...route,
        request: { fetch: transport.fetch },
      }),
    ).rejects.toThrow("Not Found");

    expect(transport.calls()).toBe(1);
  });

  test("gives up after the retry budget and surfaces the last failure", async () => {
    const transport = stubFetch([unicornPage]);
    const octokit = createOctokit("token");

    await expect(
      octokit.request(contentsRoute, {
        ...route,
        request: { fetch: transport.fetch, ...singleRetry },
      }),
    ).rejects.toMatchObject({ status: 500 });

    expect(transport.calls()).toBe(2);
  });
});
