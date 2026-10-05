/**
 * The Facebook tools as Slipway tools.
 *
 * Each tool module registers its tools the way it did on the MCP SDK,
 * `server.registerTool(name, { title, description, inputSchema, annotations }, handler)`,
 * closing over the config and the Graph client. Here those calls are recorded
 * and handed to Slipway, which builds the MCP server and the CLI from them and
 * runs read-only mode, the delete switch, confirmation and the audit log that
 * 0.2's Guard used to.
 */

import {
  ApiError,
  AuthError,
  NotConfiguredError,
  RateLimitError,
  SlipwayError,
  UsageError,
  httpError,
  toolkit,
  z,
  type Risk,
  type Tool,
} from "@thenavidm/slipway";
import type { Graph } from "../api/client.js";
import { GraphError } from "../api/errors.js";
import type { Config } from "../config.js";

/** What Slipway builds once per environment, and every handler receives. */
export type AppContext = { cfg: Config; graph: Graph };

type Args = Record<string, unknown>;
type JsonResult = { content: Array<{ type: "text"; text: string }> };
type Handler = (args: Args) => Promise<JsonResult>;
type ToolConfig = { title: string; description: string; inputSchema: z.ZodRawShape; annotations: Record<string, boolean> };

/** What the tool modules register with: the MCP SDK's `registerTool`, recorded. */
export type ToolRegistrar = {
  registerTool<S extends z.ZodRawShape>(
    name: string,
    config: { title: string; description: string; inputSchema: S; annotations: Record<string, boolean> },
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<JsonResult>,
  ): void;
};

export type Register = (server: ToolRegistrar, cfg: Config, graph: Graph) => void;

type Recorded = { name: string; config: ToolConfig; handler: Handler };

function record(register: Register, cfg: Config, graph: Graph): Recorded[] {
  const recorded: Recorded[] = [];
  register(
    {
      registerTool: (name, config, handler) => {
        recorded.push({ name, config: config as unknown as ToolConfig, handler: handler as unknown as Handler });
      },
    },
    cfg,
    graph,
  );
  return recorded;
}

/** Rate limits and blocks Meta reports as a code on a 400, which say to wait. */
const SLOW_DOWN = new Set([4, 17, 32, 613, 368]);

/**
 * A failure as the Slipway error that carries its exit code. Meta's own code
 * decides first, because it answers most failures with a 400: a rate limit is
 * 7, an expired token or a missing permission 4, a rejected parameter 2. No
 * Page connected is 10, and an argument this server checks itself, a date or a
 * Page name, is 2.
 */
export function toSlipway(error: unknown): unknown {
  if (error instanceof SlipwayError) return error;
  if (error instanceof GraphError) {
    const options = { status: error.status, ...(error.code === undefined ? {} : { details: { code: error.code, ...(error.subcode === undefined ? {} : { subcode: error.subcode }) } }) };
    if (SLOW_DOWN.has(error.code ?? -1)) return new RateLimitError(error.message, options);
    if (error.code === 190 || error.code === 200) return new AuthError(error.message, options);
    if (error.code === 100) return new UsageError(error.message, options);
    return httpError(error.status, error.message, options);
  }
  if (error instanceof Error && /^No Facebook Page connected/.test(error.message)) return new NotConfiguredError(error.message);
  if (error instanceof Error && error.name === "AbortError") return new ApiError("Facebook did not answer in time. FACEBOOK_TIMEOUT_MS sets how long to wait.");
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) return new ApiError(`Could not reach Facebook: ${error.message}`);
  if (error instanceof Error && error.constructor === Error) return new UsageError(error.message);
  return error;
}

function riskOf(annotations: Record<string, boolean>): Risk {
  return annotations.readOnlyHint ? "read" : annotations.destructiveHint ? "destructive" : "write";
}

/** A message as the audit log and a refusal quote it: public text, so its start is enough to recognize it. */
const clip = (text: unknown): string => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
};
const on = (page: unknown): string => (page ? `Page ${String(page)}` : "the default Page");
const when = (a: Args): string => (a.publish_at ? `schedule for ${String(a.publish_at)} on` : a.draft ? "save as a draft on" : "post to");

/** What each write is about to do, for the audit log and a refusal. */
const SUMMARIES: Partial<Record<string, (a: Args) => string>> = {
  create_post: (a) => `${when(a)} ${on(a.page)}: "${clip(a.message)}"`,
  create_photo_post: (a) => `${when(a)} ${on(a.page)} a photo${a.caption ? `: "${clip(a.caption)}"` : ""}`,
  publish_draft: (a) => `publish draft ${String(a.post_id)} now on ${on(a.page)}`,
  update_post: (a) => `edit post ${String(a.post_id)} on ${on(a.page)}`,
  reply_to_comment: (a) => `reply to comment ${String(a.comment_id)} as ${on(a.page)}: "${clip(a.message)}"`,
  hide_comment: (a) => `${a.hidden === false ? "unhide" : "hide"} comment ${String(a.comment_id)} on ${on(a.page)}`,
  delete_post: (a) => `delete post ${String(a.post_id)} from ${on(a.page)}`,
  delete_comment: (a) => `delete comment ${String(a.comment_id)} on ${on(a.page)}`,
};

/** What a delete does that cannot be taken back, as its refusal and the approval form say it. */
const CONSEQUENCES: Record<string, string> = {
  delete_post: "deletes the post for good, and Facebook offers no undo",
  delete_comment: "deletes the comment for good, where hiding it could be undone",
};

const kit = toolkit<AppContext>();

/**
 * The tools, as Slipway serves them. The names, schemas and annotations do not
 * depend on the config, so one pass with an empty one lists them; the first
 * call under a config records them again, so each handler closes over the
 * Pages and the client that call should use.
 */
export function slipwayTools(register: Register): Tool<AppContext>[] {
  const bound = new WeakMap<Config, Map<string, Handler>>();
  const handlerFor = (ctx: AppContext, name: string): Handler => {
    let handlers = bound.get(ctx.cfg);
    if (!handlers) {
      handlers = new Map(record(register, ctx.cfg, ctx.graph).map((tool) => [tool.name, tool.handler]));
      bound.set(ctx.cfg, handlers);
    }
    return handlers.get(name)!;
  };

  const empty = { pages: [], preferred: [], readOnly: true, allowDestructive: false, requestTimeoutMs: 30_000, userAgent: "" } as Config;
  return record(register, empty, undefined as unknown as Graph).map(({ name, config }) => {
    const risk = riskOf(config.annotations);
    const summary = SUMMARIES[name];
    return kit.defineTool({
      name,
      title: config.title,
      description: config.description,
      input: z.object(config.inputSchema),
      risk,
      ...(risk === "destructive" ? { consequence: CONSEQUENCES[name] ?? "cannot be undone" } : {}),
      ...(summary ? { summary } : {}),
      handler: async (args, ctx) => {
        try {
          const result = await handlerFor(ctx, name)(args as Args);
          return JSON.parse(result.content[0]?.text ?? "null") as unknown;
        } catch (error) {
          throw toSlipway(error);
        }
      },
    });
  });
}
