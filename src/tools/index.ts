/**
 * Every tool, in the order the command list shows them. The modules ported
 * from 0.2 register the way they did on the MCP SDK and are handed to Slipway
 * through kit.ts; the Reel tools are defined on Slipway directly.
 */

import { registerCommentTools } from "./comments.js";
import { registerInsightTools } from "./insights.js";
import { slipwayTools } from "./kit.js";
import { registerPageTools } from "./pages.js";
import { registerPostTools } from "./posts.js";
import { REEL_TOOLS } from "./reels.js";

const posting = slipwayTools((server, cfg, graph) => {
  registerPageTools(server, cfg, graph);
  registerPostTools(server, cfg, graph);
});
const engagement = slipwayTools((server, cfg, graph) => {
  registerCommentTools(server, cfg, graph);
  registerInsightTools(server, cfg, graph);
});

export const TOOLS = [...posting, ...REEL_TOOLS, ...engagement];
