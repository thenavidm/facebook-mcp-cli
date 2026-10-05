/**
 * The server and the CLI, now built by Slipway from the same tools.
 *
 * Parsing, help and output shapes are Slipway's and tested there. These cover
 * what this repo promises: every tool is a command, nothing writes until
 * FACEBOOK_ALLOW_WRITE=true and nothing deletes until FACEBOOK_ALLOW_DELETE=true
 * as well, Meta's failures keep exit codes a script can act on, and the docs
 * stay in step with the code. HOME is an empty folder and no Page is set, so
 * nothing here can reach Facebook.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.HOME = mkdtempSync(join(tmpdir(), "facebook-home-"));
const { checkApp, cli, connect } = await import("@thenavidm/slipway/testing");
const { app } = await import("../src/app.js");
const { TOOLS } = await import("../src/tools/index.js");
const { toSlipway } = await import("../src/tools/kit.js");
const { GraphError } = await import("../src/api/errors.js");

const writes = { FACEBOOK_ALLOW_WRITE: "true" };
const deletes = { FACEBOOK_ALLOW_WRITE: "true", FACEBOOK_ALLOW_DELETE: "true" };

describe("Facebook on Slipway", () => {
  it("makes all 15 tools commands, the two deletes needing confirmation", async () => {
    const context = JSON.parse((await cli(app, ["agent-context", "--brief"], { env: deletes })).stdout);
    const commands = context.commands as Array<{ command: string; requires_confirm?: boolean }>;
    expect(commands.map((c) => c.command).sort()).toEqual(TOOLS.map((tool) => tool.name.replace(/_/g, "-")).sort());
    expect(commands).toHaveLength(15);
    expect(commands.filter((c) => c.requires_confirm).map((c) => c.command).sort()).toEqual(["delete-comment", "delete-post"]);
  });

  it("lists only the reads until FACEBOOK_ALLOW_WRITE=true, as 0.2 refused everything else", async () => {
    const listed = async (env: NodeJS.ProcessEnv) => {
      const mcp = await connect(app, { env });
      const names = (await mcp.listTools()).map((tool) => tool.name);
      await mcp.close();
      return names;
    };
    expect(await listed({})).toEqual(
      expect.arrayContaining(["list_pages", "get_page", "list_posts", "list_scheduled_posts", "list_comments", "get_page_insights", "get_post_insights"]),
    );
    expect(await listed({})).toHaveLength(7);
    expect(await listed(writes)).toHaveLength(15);
    // Slipway's own switch says the same thing.
    expect(await listed({ FACEBOOK_READ_ONLY: "0" })).toHaveLength(15);
    const refused = await cli(app, ["create-post", "--message", "hi", "--agent"], { env: {} });
    expect(refused.code).toBe(2);
    expect(JSON.parse(refused.stderr).hint).toBe("Set FACEBOOK_READ_ONLY=0 to allow writes.");
  });

  it("keeps deleting off until FACEBOOK_ALLOW_DELETE=true as well, and then asks first", async () => {
    const off = await cli(app, ["delete-post", "--post-id", "1", "--confirm", "--agent"], { env: writes });
    expect(off.code).toBe(2);
    expect(JSON.parse(off.stderr).error).toBe("delete_post is unavailable: irreversible writes are off until FACEBOOK_ALLOW_DESTRUCTIVE=1 is set.");
    const unconfirmed = await cli(app, ["delete-post", "--post-id", "1", "--agent"], { env: deletes });
    expect(unconfirmed.code).toBe(2);
    expect(JSON.parse(unconfirmed.stderr).error).toMatch(/^delete_post deletes the post for good, and Facebook offers no undo, so it will not run without --confirm\. About to: delete post 1 from the default Page\./);
    // Confirmed, it gets as far as asking for a Page, and none is connected here.
    expect((await cli(app, ["delete-post", "--post-id", "1", "--confirm", "--agent"], { env: deletes })).code).toBe(10);
  });

  it("gives Meta's failures exit codes a script can act on", () => {
    const code = (error: unknown) => (toSlipway(error) as { exitCode: number }).exitCode;
    expect(code(new GraphError("rate limited", 400, 4))).toBe(7);
    expect(code(new GraphError("blocked for now", 400, 368))).toBe(7);
    expect(code(new GraphError("expired token", 400, 190))).toBe(4);
    expect(code(new GraphError("missing permission", 403, 200))).toBe(4);
    expect(code(new GraphError("bad parameter", 400, 100))).toBe(2);
    expect(code(new GraphError("gone", 404))).toBe(3);
    expect(code(new GraphError("upstream", 500))).toBe(5);
    expect(code(new Error("No Facebook Page connected. Run `facebook-mcp login`."))).toBe(10);
    expect(code(new Error("Scheduled posts must be at least 10 minutes in the future."))).toBe(2);
  });

  it("says nothing is connected with exit 10, and doctor says how to connect", async () => {
    expect((await cli(app, ["list-pages", "--agent"], { env: {} })).code).toBe(10);
    expect((await cli(app, ["get-page", "--agent"], { env: {} })).code).toBe(10);
    const doctor = await cli(app, ["doctor"], { env: {} });
    expect(doctor.stdout).toMatch(/facebook-cli login <user access token>/);
  });

  it("finds the command for a task described in words", async () => {
    const first = async (...words: string[]) => (await cli(app, ["which", ...words], { env: deletes })).stdout.split("\n")[0];
    expect(await first("post", "a", "photo")).toContain("create-photo-post");
    expect(await first("hide", "a", "comment")).toContain("hide-comment");
  });

  it("passes slipway check", async () => {
    const report = await checkApp(app, { env: deletes });
    expect(report.findings.filter((finding: { level: string }) => finding.level === "error")).toEqual([]);
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  const names = (text: string): Set<string> => new Set((text.match(/\bFACEBOOK_[A-Z_]+/g) ?? []).filter((name) => !name.endsWith("_")));
  const source = (dir: string): string =>
    readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? source(`${dir}${entry.name}/`) : entry.name.endsWith(".ts") ? read(`${dir}${entry.name}`) : ""))
      .join("\n");

  it("documents every environment variable the code reads", async () => {
    const context = JSON.parse((await cli(app, ["agent-context"], { env: {} })).stdout);
    const read_ = [...source("../src/").matchAll(/env\.(FACEBOOK_[A-Z0-9_]+)/g)].map((m) => m[1] as string);
    const used = new Set([...read_, ...context.settings.map((setting: { env: string }) => setting.env)]);
    const documented = names(read("../README.md"));
    expect([...used].filter((v) => !documented.has(v))).toEqual([]);
  });

  it.each(["../README.md"])("has no dead in-page anchors in %s", (file) => {
    if (!existsSync(new URL(file, import.meta.url))) return;
    const md = read(file).replace(/```[\s\S]*?```/g, "");
    // GitHub's slug keeps letters, marks, numbers and connector punctuation, so an
    // emoji's variation selector (U+FE0F) stays in the anchor and a link has to carry it.
    const slugs = new Set(
      [...md.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
        (heading as string).trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "").replace(/ /g, "-"),
      ),
    );
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)].map((m) => decodeURIComponent(m[1] as string)).filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});
