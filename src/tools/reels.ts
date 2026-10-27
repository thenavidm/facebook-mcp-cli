/**
 * Reels on a Page: from a video file on this machine or a hosted URL, now, at
 * a time Facebook keeps, or as a draft.
 *
 * Unlike the other tools these are defined on Slipway directly rather than
 * through the recorded `registerTool` calls in kit.ts, because they use what
 * that bridge does not carry: a person approves each one, and the upload runs
 * as a background job, since a 100 MB file takes longer than a client waits
 * for one call.
 *
 * Facebook's rules, from https://developers.facebook.com/docs/video-api/guides/reels-publishing:
 * 9:16, 1080x1920 recommended and 540x960 minimum, 3 to 90 seconds, Pages
 * only, 30 API-published Reels per Page in a 24-hour moving period, and a
 * scheduled time more than 10 minutes and within 29 days from now.
 */

import { statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { toolkit, z } from "@thenavidm/slipway";
import { pickPage } from "../config.js";
import { finishReel, reelStatus, startReel, summarizeStatus, uploadFile, uploadHosted } from "../api/rupload.js";
import { GraphError } from "../api/errors.js";
import { toSlipway, type AppContext } from "./kit.js";
import { PAGE_ARG } from "./pages.js";
import { toUnix } from "./posts.js";

const kit = toolkit<AppContext>();

/** Facebook schedules a Reel within 29 days, where a Page post may go 6 months out. */
const REEL_WINDOW = { maxSeconds: 29 * 24 * 60 * 60, tooFar: "Facebook schedules a Reel at most 29 days ahead." };

type ReelArgs = { file?: string; url?: string; caption?: string; publish_at?: string; draft?: boolean; page?: string };

export type ReelPlan = {
  source: { kind: "file"; path: string; size: number } | { kind: "url"; url: string };
  state: "PUBLISHED" | "SCHEDULED" | "DRAFT";
  scheduledPublishTime?: number;
};

const expand = (path: string): string => (path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);

/**
 * Everything that can be checked here, checked before Facebook is asked
 * anything, so a typo in a path or a date costs no upload session and none of
 * the Page's 30 Reels a day.
 */
export function planReel(args: ReelArgs): ReelPlan {
  if (Boolean(args.file) === Boolean(args.url)) {
    throw new Error("Pass file, a video on this machine, or url, a public video URL. Exactly one.");
  }

  let source: ReelPlan["source"];
  if (args.file) {
    const path = resolve(expand(args.file));
    let stat;
    try {
      stat = statSync(path);
    } catch {
      throw new Error(`No file at ${path}. Pass an absolute path to the video.`);
    }
    if (!stat.isFile()) throw new Error(`${path} is not a file.`);
    if (stat.size === 0) throw new Error(`${path} is empty.`);
    source = { kind: "file", path, size: stat.size };
  } else {
    let url: URL;
    try {
      url = new URL(String(args.url));
    } catch {
      throw new Error(`"${args.url}" is not a URL. For a file on this machine, pass file instead.`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Facebook fetches a hosted video over http or https only.");
    // Facebook rejects its own CDN's files and says to crosspost instead.
    if (/(^|\.)fbcdn\.net$/i.test(url.hostname)) {
      throw new Error("Facebook rejects videos hosted on its own CDN (fbcdn). Download it and pass file, or crosspost it in Meta Business Suite.");
    }
    source = { kind: "url", url: url.toString() };
  }

  if (args.publish_at) return { source, state: "SCHEDULED", scheduledPublishTime: toUnix(args.publish_at, REEL_WINDOW) };
  return { source, state: args.draft ? "DRAFT" : "PUBLISHED" };
}

const on = (page: unknown): string => (page ? `Page ${String(page)}` : "the default Page");
const when = (a: ReelArgs): string => (a.publish_at ? `schedule for ${a.publish_at} on` : a.draft ? "save as a draft on" : "post to");
const clip = (text: unknown): string => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
};
const from = (a: ReelArgs): string => (a.file ? basename(a.file) : a.url ? String(a.url) : "nothing");
const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;

export const createReel = kit.defineTool({
  name: "create_reel",
  title: "Post a Reel",
  description:
    "Post a Reel to a Page from a video file on this machine (file) or a public video URL (url), now, at a set time, or as a draft. " +
    "Facebook takes 9:16 video, 3 to 90 seconds, 1080x1920 recommended and 540x960 minimum, and allows 30 API-published Reels per Page in 24 hours. " +
    "publish_at schedules it with Facebook's own scheduler, more than 10 minutes and at most 29 days ahead, so nothing here has to stay running. " +
    "A large file keeps uploading after the call returns; check it with get_reel_status.",
  input: z.object({
    file: z.string().optional().describe("Path to a video on this machine, .mp4 recommended. Uploaded with Facebook's resumable upload"),
    url: z.string().optional().describe("A public video URL Facebook fetches itself, instead of file"),
    caption: z.string().optional().describe("The Reel's description. Hashtags work"),
    publish_at: z.string().optional().describe("ISO timestamp to schedule for. More than 10 minutes out, at most 29 days"),
    draft: z.boolean().optional().describe("Upload it but keep it unpublished"),
    page: PAGE_ARG,
  }),
  risk: "write",
  requireConfirm: true,
  consequence:
    "puts a Reel on the Page, where publishing has implicit public scope and counts toward the 30 API-published posts Facebook allows within a 24-hour moving period",
  summary: (a) => `${when(a)} ${on(a.page)} a Reel from ${from(a)}${a.caption ? `: "${clip(a.caption)}"` : ""}`,
  examples: [
    { description: "Post a Reel from a file now", args: { file: "/Users/me/Movies/launch.mp4", caption: "It's live. #launch" } },
    { description: "Schedule a Reel from a hosted file", args: { url: "https://example.com/launch.mp4", caption: "Tomorrow.", publish_at: "2026-11-02T15:00:00Z" } },
  ],
  job: { background: true },
  handler: async (args, ctx) => {
    let videoId: string | undefined;
    try {
      const page = pickPage(ctx.cfg, args.page);
      const plan = planReel(args);
      const session = await startReel(ctx.graph, page);
      videoId = session.videoId;

      let bytes: number | undefined;
      let resumed = 0;
      if (plan.source.kind === "file") {
        const sent = await uploadFile(ctx.cfg, ctx.graph, page, session, plan.source.path, plan.source.size, {
          signal: ctx.signal,
          progress: (done, total) => void ctx.progress(done, total, `uploaded ${megabytes(done)} of ${megabytes(total)}`),
        });
        bytes = sent.bytes;
        resumed = sent.resumed;
      } else {
        await uploadHosted(ctx.cfg, page, session, plan.source.url, ctx.signal);
      }

      await finishReel(ctx.graph, page, session.videoId, {
        state: plan.state,
        description: args.caption,
        scheduledPublishTime: plan.scheduledPublishTime,
      });

      // Processing runs on after finish, so this is a first look, not the verdict.
      let status: ReturnType<typeof summarizeStatus> | undefined;
      try {
        status = summarizeStatus(await reelStatus(ctx.graph, page, session.videoId));
      } catch {
        status = undefined;
      }

      return {
        video_id: session.videoId,
        page: page.name || page.id,
        video_state: plan.state,
        ...(plan.scheduledPublishTime ? { scheduled_for: new Date(plan.scheduledPublishTime * 1000).toISOString() } : {}),
        source: plan.source.kind === "file" ? plan.source.path : plan.source.url,
        ...(bytes === undefined ? {} : { bytes_uploaded: bytes }),
        ...(resumed ? { resumed } : {}),
        ...(status ? { status } : {}),
        next: `Facebook processes the video after upload. Call get_reel_status with video_id ${session.videoId} to see it published, scheduled or what went wrong.`,
      };
    } catch (error) {
      // Once the session is open, the id is what anyone debugging this needs.
      if (videoId && error instanceof GraphError) {
        throw toSlipway(new GraphError(`${error.message} (video ${videoId})`, error.status, error.code, error.subcode));
      }
      throw toSlipway(error);
    }
  },
});

export const getReelStatus = kit.defineTool({
  name: "get_reel_status",
  title: "Check a Reel",
  description:
    "Facebook's own status for a Reel: uploading, processing, published, scheduled with its time, a draft, or the error that stopped it. " +
    "Use the video_id create_reel returned.",
  input: z.object({
    video_id: z.string().describe("From create_reel"),
    page: PAGE_ARG,
  }),
  risk: "read",
  handler: async ({ video_id, page }, ctx) => {
    try {
      const p = pickPage(ctx.cfg, page);
      const body = (await ctx.graph.get(p, video_id, { fields: "id,description,created_time,updated_time,status" })) as {
        id?: string;
        description?: string;
        created_time?: string;
        updated_time?: string;
        status?: Parameters<typeof summarizeStatus>[0];
      };
      return {
        video_id: body.id ?? video_id,
        ...summarizeStatus(body.status ?? {}),
        ...(body.description ? { description: body.description } : {}),
        ...(body.created_time ? { created_time: body.created_time } : {}),
        ...(body.updated_time ? { updated_time: body.updated_time } : {}),
        status: body.status ?? {},
      };
    } catch (error) {
      throw toSlipway(error);
    }
  },
});

export const REEL_TOOLS = [createReel, getReelStatus];
