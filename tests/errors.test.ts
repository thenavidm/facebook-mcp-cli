import { describe, it, expect } from "vitest";
import { explain, isRetryable, GraphError } from "../src/api/errors.js";

describe("explain", () => {
  it("turns an expired token into the command that fixes it", () => {
    const e = explain(400, { message: "Error validating access token", code: 190 }, "");
    expect(e.message).toMatch(/facebook-mcp login/);
  });

  it("says which permission is missing rather than repeating Meta's wording", () => {
    const e = explain(403, { message: "(#200) Permissions error", code: 200 }, "");
    expect(e.message).toMatch(/pages_manage_posts/);
  });

  it("prefers the user-facing message when Meta supplies one", () => {
    const e = explain(400, { message: "internal", error_user_msg: "Your photo could not be posted." }, "");
    expect(e.message).toContain("Your photo could not be posted.");
  });

  it("says which Reel rule a rejected video broke, as code or subcode", () => {
    expect(explain(400, { message: "bad duration", code: 100, error_subcode: 1363128 }, "").message).toMatch(/3 to 90 seconds/);
    expect(explain(400, { message: "bad ratio", code: 1363040 }, "").message).toMatch(/9x16/);
    expect(explain(400, { message: "too small", code: 100, error_subcode: 1363127 }, "").message).toMatch(/540x960/);
  });

  it("falls back to the raw body when there is no structured error", () => {
    const e = explain(500, undefined, "upstream exploded");
    expect(e.message).toContain("upstream exploded");
  });
});

describe("isRetryable", () => {
  it("retries rate limits", () => {
    for (const code of [4, 17, 32, 613, 368]) {
      expect(isRetryable(new GraphError("x", 400, code))).toBe(true);
    }
  });

  it("retries server faults", () => {
    expect(isRetryable(new GraphError("x", 503))).toBe(true);
  });

  it("does not retry a rejected request", () => {
    // Retrying a bad request just repeats the failure, and on a write it would
    // risk posting twice.
    expect(isRetryable(new GraphError("x", 400, 100))).toBe(false);
  });

  it("does not retry things that are not Graph errors", () => {
    expect(isRetryable(new Error("boom"))).toBe(false);
  });
});
