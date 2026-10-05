/**
 * Posting, scheduling, drafting and reading back.
 *
 * Facebook Pages support real drafts and real scheduling, which most social
 * APIs do not. `published: false` with no time is a draft; with a
 * `scheduled_publish_time` it is scheduled. Both are the same endpoint.
 */

import { z } from "@thenavidm/slipway";
import type { ToolRegistrar } from "./kit.js";
import { pickPage, type Config } from "../config.js";
import type { Graph } from "../api/client.js";
import { PAGE_ARG, json } from "./pages.js";

/** Graph wants unix seconds; people write dates. Accept both. */
function toUnix(when: string): number {
  const t = Date.parse(when);
  if (Number.isNaN(t)) {
    throw new Error(`Could not read "${when}" as a date. Use an ISO timestamp like 2026-09-01T14:30:00Z.`);
  }
  const seconds = Math.floor(t / 1000);
  const now = Math.floor(Date.now() / 1000);
  // Facebook rejects anything under 10 minutes or over 6 months out, with a
  // message that does not say so.
  if (seconds < now + 600) throw new Error("Scheduled posts must be at least 10 minutes in the future.");
  if (seconds > now + 60 * 60 * 24 * 30 * 6) throw new Error("Facebook will not schedule more than 6 months ahead.");
  return seconds;
}

export function registerPostTools(
  server: ToolRegistrar,
  cfg: Config,
  graph: Graph,
) {
  server.registerTool(
    "create_post",
    {
      title: "Post to a Page",
      description:
        "Publish a text post, optionally with a link. Leave publish_at empty and draft false to post immediately. Set draft to keep it unpublished, or publish_at to schedule it.",
      inputSchema: {
        message: z.string().describe("The post text"),
        link: z.string().optional().describe("A URL to attach, rendered as a preview card"),
        publish_at: z
          .string()
          .optional()
          .describe("ISO timestamp to schedule for. At least 10 minutes out, at most 6 months"),
        draft: z.boolean().optional().describe("Save unpublished instead of posting"),
        page: PAGE_ARG,
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ message, link, publish_at, draft, page }) => {
      const p = pickPage(cfg, page);

      const query: Record<string, string | number | boolean> = { message };
      if (link) query.link = link;
      if (publish_at) {
        query.published = false;
        query.scheduled_publish_time = toUnix(publish_at);
      } else if (draft) {
        query.published = false;
      }

      const res = await graph.post(p, `${p.id}/feed`, query);
      return json({ ...res, page: p.name || p.id, scheduled: Boolean(publish_at), draft: Boolean(draft) });
    },
  );

  server.registerTool(
    "create_photo_post",
    {
      title: "Post a photo",
      description:
        "Publish a photo from a public URL, with an optional caption. Same scheduling and draft options as a text post.",
      inputSchema: {
        url: z.string().describe("Publicly reachable image URL"),
        caption: z.string().optional(),
        publish_at: z.string().optional().describe("ISO timestamp to schedule for"),
        draft: z.boolean().optional(),
        page: PAGE_ARG,
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ url, caption, publish_at, draft, page }) => {
      const p = pickPage(cfg, page);

      const query: Record<string, string | number | boolean> = { url };
      if (caption) query.caption = caption;
      if (publish_at) {
        query.published = false;
        query.scheduled_publish_time = toUnix(publish_at);
      } else if (draft) {
        query.published = false;
      }

      const res = await graph.post(p, `${p.id}/photos`, query);
      return json({ ...res, page: p.name || p.id });
    },
  );

  server.registerTool(
    "list_posts",
    {
      title: "List posts",
      description:
        "Published posts on a Page, newest first, with their reaction, comment and share counts.",
      inputSchema: {
        limit: z.number().optional().describe("Default 25, maximum 100"),
        page: PAGE_ARG,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, page }) => {
      const p = pickPage(cfg, page);
      const data = await graph.paged(
        p,
        `${p.id}/published_posts`,
        {
          fields:
            "id,message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
        },
        Math.min(limit ?? 25, 100),
      );
      return json({ posts: data, count: data.length });
    },
  );

  server.registerTool(
    "list_scheduled_posts",
    {
      title: "List scheduled and draft posts",
      description:
        "Posts that have not gone out yet: both scheduled ones and saved drafts, with the time each is due.",
      inputSchema: { page: PAGE_ARG },
      annotations: { readOnlyHint: true },
    },
    async ({ page }) => {
      const p = pickPage(cfg, page);
      const data = await graph.paged(
        p,
        `${p.id}/scheduled_posts`,
        { fields: "id,message,created_time,scheduled_publish_time,is_published" },
        100,
      );
      return json({ posts: data, count: data.length });
    },
  );

  server.registerTool(
    "publish_draft",
    {
      title: "Publish a draft now",
      description: "Take a draft or scheduled post and publish it immediately.",
      inputSchema: {
        post_id: z.string().describe("From list_scheduled_posts"),
        page: PAGE_ARG,
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ post_id, page }) => {
      const p = pickPage(cfg, page);
      const res = await graph.post(p, post_id, { is_published: true });
      return json(res);
    },
  );

  server.registerTool(
    "update_post",
    {
      title: "Edit a post",
      description: "Change the text of a published post. Facebook shows an edit history to viewers.",
      inputSchema: {
        post_id: z.string(),
        message: z.string().describe("The replacement text"),
        page: PAGE_ARG,
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ post_id, message, page }) => {
      const p = pickPage(cfg, page);
      const res = await graph.post(p, post_id, { message });
      return json(res);
    },
  );

  server.registerTool(
    "delete_post",
    {
      title: "Delete a post",
      description:
        "Permanently delete a post. This cannot be undone, and is refused unless deletion is explicitly enabled.",
      inputSchema: { post_id: z.string(), page: PAGE_ARG },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async ({ post_id, page }) => {
      const p = pickPage(cfg, page);
      const res = await graph.delete(p, post_id);
      return json(res);
    },
  );
}
