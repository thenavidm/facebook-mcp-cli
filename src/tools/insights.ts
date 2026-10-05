/**
 * Numbers.
 *
 * Meta splits these across two endpoints with different metric names and
 * different periods, so the tools mirror that split rather than pretending it
 * is one thing.
 */

import { z } from "@thenavidm/slipway";
import type { ToolRegistrar } from "./kit.js";
import { pickPage, type Config } from "../config.js";
import type { Graph } from "../api/client.js";
import { PAGE_ARG, json } from "./pages.js";

export function registerInsightTools(server: ToolRegistrar, cfg: Config, graph: Graph) {
  server.registerTool(
    "get_page_insights",
    {
      title: "Page performance",
      description:
        "How the Page itself is doing over a date range: impressions, reach, engaged users and follower change.",
      inputSchema: {
        since: z.string().optional().describe("ISO date, defaults to 28 days ago"),
        until: z.string().optional().describe("ISO date, defaults to today"),
        page: PAGE_ARG,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ since, until, page }) => {
      const p = pickPage(cfg, page);
      const res = await graph.get(p, `${p.id}/insights`, {
        metric:
          "page_impressions,page_impressions_unique,page_post_engagements,page_fans,page_fan_adds,page_fan_removes,page_views_total",
        period: "day",
        since: since ?? new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10),
        until: until ?? new Date().toISOString().slice(0, 10),
      });
      return json(res);
    },
  );

  server.registerTool(
    "get_post_insights",
    {
      title: "Post performance",
      description:
        "How one post did: impressions, reach, clicks and reactions. Post metrics are named differently from Page metrics, which is why this is a separate tool.",
      inputSchema: { post_id: z.string(), page: PAGE_ARG },
      annotations: { readOnlyHint: true },
    },
    async ({ post_id, page }) => {
      const p = pickPage(cfg, page);
      const res = await graph.get(p, `${post_id}/insights`, {
        metric:
          "post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total,post_engaged_users",
      });
      return json(res);
    },
  );
}
