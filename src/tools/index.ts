/** Every tool, registered the way each module did on the MCP SDK, and handed to Slipway. */

import type { Graph } from "../api/client.js";
import type { Config } from "../config.js";
import { registerCommentTools } from "./comments.js";
import { registerInsightTools } from "./insights.js";
import { slipwayTools, type ToolRegistrar } from "./kit.js";
import { registerPageTools } from "./pages.js";
import { registerPostTools } from "./posts.js";

export function registerAll(server: ToolRegistrar, cfg: Config, graph: Graph) {
  registerPageTools(server, cfg, graph);
  registerPostTools(server, cfg, graph);
  registerCommentTools(server, cfg, graph);
  registerInsightTools(server, cfg, graph);
}

export const TOOLS = slipwayTools(registerAll);
