/**
 * Reels, end to end through the CLI against a stubbed fetch: the three phases
 * in order, the bytes on rupload.facebook.com with the headers the Reels guide
 * asks for, a broken upload resumed from where Facebook says it stopped, and
 * Facebook's own scheduler given the time. Nothing here reaches Facebook.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.HOME = mkdtempSync(join(tmpdir(), "facebook-home-"));
const { cli, connect } = await import("@thenavidm/slipway/testing");
const { app } = await import("../src/app.js");
const { planReel } = await import("../src/tools/reels.js");
const { summarizeStatus, uploadUrlFor } = await import("../src/api/rupload.js");

const dir = mkdtempSync(join(tmpdir(), "facebook-reel-"));
const video = join(dir, "clip.mp4");
const SIZE = 4096;
writeFileSync(video, Buffer.alloc(SIZE, 7));
const empty = join(dir, "empty.mp4");
writeFileSync(empty, "");

const env = { FACEBOOK_ALLOW_WRITE: "true", FACEBOOK_PAGE_ID: "111", FACEBOOK_PAGE_TOKEN: "page-token", FACEBOOK_PAGE_NAME: "Studio" };
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

type Seen = { method: string; url: URL; headers: Headers; bodySize?: number };

/** A fake Facebook: answers start, upload, finish and status, and records each request. */
function fakeFacebook(options: { breakFirstUpload?: number; status?: unknown } = {}) {
  const seen: Seen[] = [];
  let uploads = 0;
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const body = init.body as Blob | undefined;
    seen.push({ method: init.method ?? "GET", url, headers: new Headers(init.headers), bodySize: body?.size });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

    if (url.hostname === "rupload.facebook.com") {
      uploads++;
      if (uploads === 1 && options.breakFirstUpload !== undefined) throw new TypeError("fetch failed");
      return reply({ success: true });
    }
    if (url.pathname.endsWith("/111/video_reels") && url.searchParams.get("upload_phase") === "start") {
      return reply({ video_id: "v9", upload_url: "https://rupload.facebook.com/video-upload/v9" });
    }
    if (url.pathname.endsWith("/111/video_reels")) return reply({ success: true });
    if (url.pathname.endsWith("/v9")) {
      return reply({
        id: "v9",
        status: options.status ?? {
          video_status: "processing",
          uploading_phase: { status: "in_progress", bytes_transfered: options.breakFirstUpload ?? 0 },
        },
      });
    }
    return reply({ error: { message: "unexpected", code: 1 } }, 400);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { seen, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("planReel checks what it can before asking Facebook anything", () => {
  it("takes exactly one of file and url", () => {
    expect(() => planReel({})).toThrow(/Exactly one/);
    expect(() => planReel({ file: video, url: "https://example.com/a.mp4" })).toThrow(/Exactly one/);
  });

  it("refuses a missing or empty file, and names the full path", () => {
    expect(() => planReel({ file: join(dir, "nope.mp4") })).toThrow(/No file at .*nope\.mp4/);
    expect(() => planReel({ file: empty })).toThrow(/is empty/);
    expect(() => planReel({ file: dir })).toThrow(/is not a file/);
  });

  it("refuses a video on Facebook's own CDN, which the Reels guide says it rejects", () => {
    expect(() => planReel({ url: "https://scontent.xx.fbcdn.net/v/clip.mp4" })).toThrow(/fbcdn/);
    expect(() => planReel({ url: "ftp://example.com/clip.mp4" })).toThrow(/http or https/);
  });

  it("schedules within Facebook's Reel window: more than 10 minutes, at most 29 days", () => {
    expect(() => planReel({ file: video, publish_at: inMinutes(5) })).toThrow(/10 minutes/);
    expect(() => planReel({ file: video, publish_at: inMinutes(30 * 24 * 60) })).toThrow(/29 days/);
    const plan = planReel({ file: video, publish_at: inMinutes(28 * 24 * 60) });
    expect(plan.state).toBe("SCHEDULED");
    expect(plan.scheduledPublishTime).toBeGreaterThan(Date.now() / 1000);
  });

  it("publishes now unless told to schedule or keep a draft", () => {
    expect(planReel({ file: video }).state).toBe("PUBLISHED");
    expect(planReel({ file: video, draft: true }).state).toBe("DRAFT");
    expect(planReel({ url: "https://example.com/a.mp4" }).source).toEqual({ kind: "url", url: "https://example.com/a.mp4" });
  });
});

describe("create_reel", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("will not run without --confirm, says what it would do in Facebook's words, and calls nothing", async () => {
    const { fetchMock } = fakeFacebook();
    const refused = await cli(app, ["create-reel", "--file", video, "--caption", "Launch day", "--agent"], { env });
    expect(refused.code).toBe(2);
    expect(JSON.parse(refused.stderr).error).toMatch(
      /^create_reel puts a Reel on the Page, where publishing has implicit public scope and counts toward the 30 API-published posts Facebook allows within a 24-hour moving period, so it will not run without --confirm\. About to: post to the default Page a Reel from clip\.mp4: "Launch day"\./,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads a local file in three phases, the bytes to rupload with the documented headers", async () => {
    const { seen } = fakeFacebook({ status: { video_status: "processing", processing_phase: { status: "in_progress" } } });
    const run = await cli(app, ["create-reel", "--file", video, "--caption", "Launch day #ai", "--confirm", "--agent"], { env });
    expect(run.code).toBe(0);

    const [start, upload, finish] = seen;
    expect(start!.method).toBe("POST");
    expect(start!.url.hostname).toBe("graph.facebook.com");
    expect(start!.url.searchParams.get("upload_phase")).toBe("start");

    expect(upload!.url.toString()).toBe("https://rupload.facebook.com/video-upload/v9");
    expect(upload!.headers.get("authorization")).toBe("OAuth page-token");
    expect(upload!.headers.get("offset")).toBe("0");
    expect(upload!.headers.get("file_size")).toBe(String(SIZE));
    expect(upload!.bodySize).toBe(SIZE);

    expect(finish!.url.searchParams.get("upload_phase")).toBe("finish");
    expect(finish!.url.searchParams.get("video_id")).toBe("v9");
    expect(finish!.url.searchParams.get("video_state")).toBe("PUBLISHED");
    expect(finish!.url.searchParams.get("description")).toBe("Launch day #ai");
    expect(finish!.url.searchParams.has("scheduled_publish_time")).toBe(false);

    const out = JSON.parse(run.stdout);
    expect(out.done).toBe(true);
    const result = out.result;
    expect(result.video_id).toBe("v9");
    expect(result.video_state).toBe("PUBLISHED");
    expect(result.bytes_uploaded).toBe(SIZE);
    expect(result.status.state).toBe("processing");
    // The token never reaches the output.
    expect(run.stdout).not.toContain("page-token");
  });

  it("resumes a broken upload from the byte Facebook says it has", async () => {
    const { seen } = fakeFacebook({ breakFirstUpload: 1000 });
    const run = await cli(app, ["create-reel", "--file", video, "--confirm", "--agent"], { env });
    expect(run.code).toBe(0);
    const uploads = seen.filter((request) => request.url.hostname === "rupload.facebook.com");
    expect(uploads).toHaveLength(2);
    expect(uploads[1]!.headers.get("offset")).toBe("1000");
    expect(uploads[1]!.headers.get("file_size")).toBe(String(SIZE));
    expect(uploads[1]!.bodySize).toBe(SIZE - 1000);
    const out = JSON.parse(run.stdout);
    expect(out.result.resumed).toBe(1);
  });

  it("hands Facebook the time to publish, with video_state=SCHEDULED", async () => {
    const { seen } = fakeFacebook();
    const at = inMinutes(3 * 24 * 60);
    const run = await cli(app, ["create-reel", "--file", video, "--publish-at", at, "--confirm", "--agent"], { env });
    expect(run.code).toBe(0);
    const finish = seen.find((request) => request.url.searchParams.get("upload_phase") === "finish")!;
    expect(finish.url.searchParams.get("video_state")).toBe("SCHEDULED");
    expect(Number(finish.url.searchParams.get("scheduled_publish_time"))).toBe(Math.floor(Date.parse(at) / 1000));
  });

  it("sends a hosted file as a file_url header, with no body", async () => {
    const { seen } = fakeFacebook();
    const run = await cli(app, ["create-reel", "--url", "https://example.com/clip.mp4", "--draft", "--confirm", "--agent"], { env });
    expect(run.code).toBe(0);
    const upload = seen.find((request) => request.url.hostname === "rupload.facebook.com")!;
    expect(upload.headers.get("file_url")).toBe("https://example.com/clip.mp4");
    expect(upload.bodySize).toBeUndefined();
    const finish = seen.find((request) => request.url.searchParams.get("upload_phase") === "finish")!;
    expect(finish.url.searchParams.get("video_state")).toBe("DRAFT");
  });

  it("refuses a schedule past 29 days with exit 2, before opening an upload session", async () => {
    const { fetchMock } = fakeFacebook();
    const run = await cli(app, ["create-reel", "--file", video, "--publish-at", inMinutes(40 * 24 * 60), "--confirm", "--agent"], { env });
    expect(run.code).toBe(2);
    expect(JSON.parse(run.stderr).error).toMatch(/29 days/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks a person over MCP, and runs as a background job with a status tool", async () => {
    const mcp = await connect(app, { env });
    const tools = await mcp.listTools();
    const reel = tools.find((tool) => tool.name === "create_reel")!;
    expect(Object.keys((reel.inputSchema as { properties: object }).properties)).toEqual(
      expect.arrayContaining(["file", "url", "caption", "publish_at", "draft", "page", "confirm", "wait_seconds"]),
    );
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["create_reel_status", "get_reel_status"]));
    await mcp.close();
  });
});

describe("get_reel_status", () => {
  it("says in one word where a Reel is, and when a scheduled one goes out", async () => {
    fakeFacebook({ status: { video_status: "ready", publishing_phase: { status: "complete", publish_status: "scheduled", publish_time: 1793541600 } } });
    const run = await cli(app, ["get-reel-status", "--video-id", "v9", "--agent"], { env });
    expect(run.code).toBe(0);
    const out = JSON.parse(run.stdout);
    expect(out.state).toBe("scheduled");
    expect(out.publish_time).toBe(new Date(1793541600 * 1000).toISOString());
  });

  it("surfaces the processing error Facebook gives", () => {
    expect(
      summarizeStatus({ video_status: "processing", processing_phase: { status: "not_started", error: { message: "Resolution too low." } } }),
    ).toEqual({ state: "error", error: "Resolution too low." });
    expect(summarizeStatus({ video_status: "expired" }).state).toBe("expired");
    expect(summarizeStatus({ video_status: "uploading" })).toEqual({ state: "uploading" });
  });

  it("uses the upload address Facebook returns, and the documented one otherwise", () => {
    expect(uploadUrlFor("v9", "https://rupload.facebook.com/video-upload/v9")).toBe("https://rupload.facebook.com/video-upload/v9");
    expect(uploadUrlFor("v9", "https://evil.example/v9")).toMatch(/^https:\/\/rupload\.facebook\.com\/video-upload\/v\d+\.0\/v9$/);
    expect(uploadUrlFor("v9")).toMatch(/^https:\/\/rupload\.facebook\.com\/video-upload\//);
  });
});
