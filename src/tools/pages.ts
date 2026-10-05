/** Which Pages are connected, and what they look like. */

import { z } from "@thenavidm/slipway";
import type { ToolRegistrar } from "./kit.js";
import { pickPage, type Config } from "../config.js";
import type { Graph } from "../api/client.js";

export const PAGE_ARG = z
  .string()
  .optional()
  .describe("Which Page to act as, by name or id. Omit to use the default.");

export const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerPageTools(
  server: ToolRegistrar,
  cfg: Config,
  graph: Graph,
) {
  server.registerTool(
    "list_pages",
    {
      title: "List connected Pages",
      description:
        "List every Facebook Page this server can act as, with its id and name. Call this first when you have more than one, so you can name the right Page on later calls.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      json({
        pages: cfg.pages.map((p) => ({ id: p.id, name: p.name })),
        default: pickPage(cfg).name || pickPage(cfg).id,
        read_only: cfg.readOnly,
      }),
  );

  server.registerTool(
    "get_page",
    {
      title: "Get Page details",
      description:
        "Profile details for a Page: name, category, follower count, about text, website and whether it is published.",
      inputSchema: { page: PAGE_ARG },
      annotations: { readOnlyHint: true },
    },
    async ({ page }) => {
      const p = pickPage(cfg, page);
      return json(
        await graph.get(p, p.id, {
          fields:
            "id,name,username,category,about,description,website,fan_count,followers_count,link,is_published,verification_status",
        }),
      );
    },
  );
}
