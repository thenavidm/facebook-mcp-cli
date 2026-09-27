/**
 * The CLI surface, over the server's own tools.
 *
 * Copied from the house bridge (dev:mcp-cli, assets/cli-bridge.ts). Only the
 * block marked "This repo" is specific to Facebook.
 *
 * This repo registers its tools straight on the SDK's McpServer, so there is
 * no array for the house template to read. Rather than rewrite every tool, this
 * builds the real server in-process and talks to it through the SDK's in-memory
 * transport, exactly as an MCP app does: tools/list gives the names, the JSON
 * Schema and the annotations; tools/call runs the same handler with the same
 * validation and the same write guard. The two surfaces cannot drift, because
 * there is only one of them.
 *
 * Flags, --help and `schema <command>` come from the JSON Schema an MCP app
 * receives. Everything else is the house contract: --json, --compact, --agent,
 * --select, and exit codes 0 ok, 2 usage or a refused write, 3 not found,
 * 4 auth, 5 API, 7 rate limited, 10 nothing configured.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/* ---------------------------------------------------------------- This repo */

import { buildServer, VERSION } from "./server.js";

/** The binary names, as package.json declares them. */
const CLI_BIN = "facebook-cli";
const MCP_BIN = "facebook-mcp";

/** The server exactly as the MCP binary builds it, and how to shut it. */
async function openServer(): Promise<{ server: { connect: (t: never) => Promise<void> }; close: () => Promise<void> }> {
  // Configuration is the environment and the stored Page token, read by buildServer.
  const { server } = buildServer();
  return { server: server as never, close: async () => undefined };
}

/** This server's own error words, checked before the generic ones. */
const EXIT_WORDS: [RegExp, number][] = [
  // A token Meta refuses, checked first: its message also says to log in again.
  [/invalid oauth access token|invalid or expired|error validating access token|session has expired|oauthexception|\(#200\)|\(#10\)/, 4],
  // No Page connected yet.
  [/no facebook page connected|no page connected|no page token/, 10],
];

/* ------------------------------------------------ The same in every repo */

export const EXIT = {
  ok: 0, usage: 2, notFound: 3, auth: 4, api: 5, rateLimited: 7, config: 10,
} as const;

/** Map an error message onto the contract. The server's own words go first. */
export function exitCodeFor(message: string): number {
  const text = message.toLowerCase();
  for (const [pattern, code] of EXIT_WORDS) if (pattern.test(text)) return code;
  if (/input validation|invalid arguments|invalid params|-32602/.test(text)) return EXIT.usage;
  if (/will not run without|without confirm|confirm: true|--confirm|read[-_ ]only|is unavailable|is disabled/.test(text)) return EXIT.usage;
  if (/rate ?limit|too many requests|\b429\b|quota/.test(text)) return EXIT.rateLimited;
  // Config before auth: "no token configured" mentions a token, and matching
  // auth first sends someone who configured nothing looking for a bad one.
  if (/not configured|nothing is configured|not signed in|no [a-z ]*(account|credential|token|key)s? (is |are )?(set|configured)|missing .*env|run `?[a-z-]+ login/.test(text))
    return EXIT.config;
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid[_ ]grant|token (has )?expired|expired token|authenticat|credential|permission denied|insufficient permission/.test(text))
    return EXIT.auth;
  if (/\b404\b|not found|no such|does not exist/.test(text)) return EXIT.notFound;
  return EXIT.api;
}

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

export type Tool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
};

type FlagKind = "string" | "number" | "integer" | "boolean" | "enum" | "json";

export type Flag = {
  key: string;
  flag: string;
  kind: FlagKind;
  required: boolean;
  repeatable: boolean;
  choices?: string[];
  help: string;
};

class UsageError extends Error {}

/** The first concrete type in a schema, looking through nullable unions. */
function concrete(schema: JsonSchema): JsonSchema {
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return concrete(union.find((s) => s.type !== "null") ?? union[0] ?? {});
  if (Array.isArray(schema.type)) return { ...schema, type: schema.type.find((t) => t !== "null") ?? "string" };
  return schema;
}

function kindOf(schema: JsonSchema): { kind: FlagKind; repeatable: boolean; choices?: string[] } {
  const s = concrete(schema);
  if (s.enum) return { kind: "enum", repeatable: false, choices: s.enum.map(String) };
  if (s.type === "array") {
    const item = concrete(s.items ?? {});
    if (item.enum) return { kind: "enum", repeatable: true, choices: item.enum.map(String) };
    if (item.type === "object" || item.type === "array") return { kind: "json", repeatable: true };
    return { kind: (item.type as FlagKind) ?? "string", repeatable: true };
  }
  if (s.type === "object") return { kind: "json", repeatable: false };
  if (s.type === "number" || s.type === "integer" || s.type === "boolean") return { kind: s.type, repeatable: false };
  return { kind: "string", repeatable: false };
}

/** One flag per property of the JSON Schema an MCP app receives. */
export function flagsFor(schema: JsonSchema): Flag[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([key, prop]) => ({
    key,
    flag: `--${key.replace(/_/g, "-")}`,
    ...kindOf(prop),
    required: required.has(key),
    help: (prop.description ?? concrete(prop).description ?? "").trim(),
  }));
}

function coerce(flag: Flag, raw: string): unknown {
  switch (flag.kind) {
    case "number":
    case "integer": {
      const value = Number(raw);
      if (!Number.isFinite(value) || (flag.kind === "integer" && !Number.isInteger(value)))
        throw new UsageError(`${flag.flag} expects ${flag.kind === "integer" ? "a whole number" : "a number"}, got '${raw}'.`);
      return value;
    }
    case "boolean":
      if (/^(true|1|yes)$/i.test(raw)) return true;
      if (/^(false|0|no)$/i.test(raw)) return false;
      throw new UsageError(`${flag.flag} expects true or false, got '${raw}'.`);
    case "enum":
      if (flag.choices && !flag.choices.includes(raw))
        throw new UsageError(`${flag.flag} expects one of: ${flag.choices.join(", ")}. Got '${raw}'.`);
      return raw;
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        throw new UsageError(`${flag.flag} expects JSON, got '${raw}'.`);
      }
    default:
      return raw;
  }
}

/**
 * Turn argv into the arguments object. `--flag value`, `--flag=value`, the
 * underscore spelling, a bare switch for booleans, a repeatable flag collected
 * into an array, and one bare argument filling the first required flag.
 */
export function parseArgs(argv: string[], flags: Flag[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const positional: string[] = [];
  const byFlag = new Map<string, Flag>();
  for (const f of flags) {
    byFlag.set(f.flag, f);
    byFlag.set(`--${f.key}`, f);
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    const name = eq === -1 ? token : token.slice(0, eq);
    const flag = byFlag.get(name);
    if (!flag) throw new UsageError(`Unknown option ${name}.`);
    let raw: string | undefined = eq === -1 ? undefined : token.slice(eq + 1);
    if (raw === undefined) {
      if (flag.kind === "boolean" && (argv[i + 1] === undefined || (argv[i + 1] as string).startsWith("--"))) {
        out[flag.key] = true;
        continue;
      }
      raw = argv[++i];
    }
    if (raw === undefined) throw new UsageError(`${flag.flag} expects a value.`);
    const value = coerce(flag, raw);
    if (flag.repeatable) out[flag.key] = [...((out[flag.key] as unknown[]) ?? []), value];
    else out[flag.key] = value;
  }

  if (positional.length > 0) {
    const target = flags.find((f) => f.required && out[f.key] === undefined);
    if (!target) throw new UsageError(`Unexpected argument '${positional[0]}'.`);
    if (positional.length > 1) throw new UsageError(`Unexpected argument '${positional[1]}'.`);
    const value = coerce(target, positional[0] as string);
    out[target.key] = target.repeatable ? [value] : value;
  }

  const missing = flags.filter((f) => f.required && out[f.key] === undefined);
  if (missing.length) throw new UsageError(`Missing ${missing.map((f) => f.flag).join(", ")}.`);
  return out;
}

/** `--select a,b.c` keeps only those fields. Dotted paths descend, arrays element-wise. */
export function selectFields(data: unknown, paths: string[]): unknown {
  if (Array.isArray(data)) return data.map((d) => selectFields(d, paths));
  if (data === null || typeof data !== "object") return data;
  const byHead = new Map<string, string[]>();
  for (const path of paths) {
    const [head, ...rest] = path.split(".");
    if (head === undefined) continue;
    const group = byHead.get(head) ?? [];
    if (rest.length) group.push(rest.join("."));
    byHead.set(head, group);
  }
  const out: Record<string, unknown> = {};
  for (const [head, rest] of byHead) {
    const value = (data as Record<string, unknown>)[head];
    if (value === undefined) continue;
    out[head] = rest.length ? selectFields(value, rest) : value;
  }
  return out;
}

type Format = "text" | "json" | "compact";

type ContentPart = { type: string; text?: string; mimeType?: string; data?: string };
type CallResult = { content?: ContentPart[]; structuredContent?: unknown; isError?: boolean };

function textOf(result: CallResult): string {
  return (result.content ?? [])
    .map((part) =>
      part.type === "text"
        ? (part.text ?? "")
        : `[${part.type}${part.mimeType ? ` ${part.mimeType}` : ""}${part.data ? `, ${Math.round((part.data.length * 3) / 4 / 1024)} KB` : ""}, not shown in a terminal]`,
    )
    .join("\n");
}

/** The result as data: structured when the tool declares it, else its text parsed when it is JSON. */
function dataOf(result: CallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = textOf(result);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function emit(data: unknown, format: Format): void {
  if (format === "text" && typeof data === "string") {
    process.stdout.write(data.endsWith("\n") ? data : `${data}\n`);
    return;
  }
  process.stdout.write(`${format === "compact" ? JSON.stringify(data) : JSON.stringify(data, null, 2)}\n`);
}

function emitError(message: string): void {
  process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
}

export function commandName(tool: string): string {
  return tool.replace(/_/g, "-");
}

function normalize(name: string): string {
  return name.replace(/-/g, "_");
}

function binName(): string {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith(CLI_BIN) ? CLI_BIN : MCP_BIN;
}

function risk(tool: Tool): "read" | "write" | "destructive" {
  if (tool.annotations?.readOnlyHint) return "read";
  return tool.annotations?.destructiveHint ? "destructive" : "write";
}

const COLUMN = 34;

function renderToolHelp(tool: Tool): string {
  const flags = flagsFor(tool.inputSchema);
  const required = flags.filter((f) => f.required);
  const optional = flags.filter((f) => !f.required);
  const usage = [`${binName()} ${commandName(tool.name)}`, ...required.map((f) => `${f.flag} <${f.kind}>`), optional.length ? "[options]" : ""]
    .filter(Boolean)
    .join(" ");
  const lines = [``, (tool.description ?? "").trim(), ``, `Usage:`, `  ${usage}`, ``];
  const describe = (list: Flag[], heading: string): void => {
    if (!list.length) return;
    lines.push(`${heading}:`);
    for (const f of list) {
      const placeholder = f.kind === "boolean" ? "" : ` <${f.choices ? f.choices.join("|") : f.kind}>`;
      const left = `  ${f.flag}${placeholder}`;
      const help = f.repeatable ? `${f.help} Repeatable.`.trim() : f.help;
      if (!help) lines.push(left);
      else if (left.length < COLUMN) lines.push(`${left.padEnd(COLUMN)}${help}`);
      else lines.push(left, `${" ".repeat(COLUMN)}${help}`);
    }
    lines.push(``);
  };
  describe(required, "Required");
  describe(optional, "Options");
  lines.push(`Output:`);
  lines.push(`  --json                          force JSON`);
  lines.push(`  --compact                       force single-line JSON`);
  lines.push(`  --agent                         machine mode: JSON, compact, no prompts, no colour`);
  lines.push(`  --select <a,b.c>                keep only these fields, dotted paths descend`);
  lines.push(``);
  lines.push(`Risk: ${risk(tool)}`);
  lines.push(``);
  return lines.join("\n");
}

/** A tool's one line: its title, or the first sentence of its description. */
function summary(tool: Tool): string {
  const title = tool.title ?? tool.annotations?.title;
  if (title && title !== tool.name) return title;
  const first = (tool.description ?? "").trim().split(/(?<=\.)\s/)[0] ?? "";
  return first.length > 72 ? `${first.slice(0, 71).trimEnd()}…` : first;
}

function renderToolList(tools: Tool[]): string {
  const width = Math.max(...tools.map((t) => commandName(t.name).length)) + 2;
  const bin = binName();
  const lines = [``, `${bin} commands (${tools.length})`, ``];
  for (const tool of tools) {
    const mark = risk(tool) === "read" ? " " : risk(tool) === "destructive" ? "!" : "*";
    lines.push(`  ${mark} ${commandName(tool.name).padEnd(width)}${summary(tool)}`);
  }
  const gated = tools.some((t) => risk(t) === "destructive" && "confirm" in (t.inputSchema.properties ?? {}));
  lines.push(``, `  * writes    ! irreversible${gated ? ", and asks for --confirm where the tool takes it" : ""}`, ``);
  lines.push(`  ${bin} <command> --help    what it takes`);
  lines.push(`  ${bin} schema <command>    the JSON schema an MCP client sees`, ``);
  return lines.join("\n");
}

/** Connect an in-memory client to the real server. */
async function connect(): Promise<{ client: Client; tools: Tool[]; close: () => Promise<void> }> {
  const { server, close } = await openServer();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide as never);
  const client = new Client({ name: CLI_BIN, version: VERSION });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  return {
    client,
    tools: tools as Tool[],
    close: async () => {
      await client.close().catch(() => undefined);
      await close().catch(() => undefined);
    },
  };
}

/** A first argument that is a command rather than a server flag. */
export function isCliCommand(argv: string[], toolNames: string[]): boolean {
  const first = argv[0];
  if (!first || first.startsWith("-")) return false;
  if (first === "tools" || first === "schema") return true;
  return toolNames.includes(normalize(first));
}

export async function runCli(argv: string[]): Promise<number> {
  const { client, tools, close } = await connect();
  try {
    const command = argv[0] ?? "tools";
    const rest = argv.slice(1);

    if (command === "tools") {
      process.stdout.write(renderToolList(tools));
      return EXIT.ok;
    }

    if (command === "schema") {
      const tool = tools.find((t) => t.name === normalize(rest[0] ?? ""));
      if (!tool) {
        emitError(`Unknown command '${rest[0] ?? ""}'. Run \`${binName()}\` to list them.`);
        return EXIT.usage;
      }
      emit(tool.inputSchema, "json");
      return EXIT.ok;
    }

    const tool = tools.find((t) => t.name === normalize(command));
    if (!tool) {
      emitError(`Unknown command '${command}'. Run \`${binName()}\` to list them. A write tool is missing from the list when the server runs read only.`);
      return EXIT.usage;
    }

    if (rest.includes("--help") || rest.includes("-h")) {
      process.stdout.write(renderToolHelp(tool));
      return EXIT.ok;
    }

    const agent = rest.includes("--agent");
    const format: Format = rest.includes("--compact") || agent ? "compact" : rest.includes("--json") ? "json" : "text";
    const selectAt = rest.findIndex((t) => t === "--select" || t.startsWith("--select="));
    const selectRaw =
      selectAt === -1 ? undefined : (rest[selectAt] as string).includes("=") ? (rest[selectAt] as string).split("=").slice(1).join("=") : rest[selectAt + 1];
    const select = selectRaw?.split(",").map((f) => f.trim()).filter(Boolean);
    const consumed = new Set(["--json", "--compact", "--agent", "--no-color", "--no-input", "--yes"]);
    const toolArgv = rest.filter((token, i) => {
      if (consumed.has(token)) return false;
      if (token === "--select" || token.startsWith("--select=")) return false;
      if (selectAt !== -1 && i === selectAt + 1 && !(rest[selectAt] as string).includes("=")) return false;
      return true;
    });

    let args: Record<string, unknown>;
    try {
      args = parseArgs(toolArgv, flagsFor(tool.inputSchema));
    } catch (error) {
      emitError((error as Error).message);
      if (!agent) process.stderr.write(renderToolHelp(tool));
      return EXIT.usage;
    }

    let result: CallResult;
    try {
      // Long enough for an export or a slow upstream; the protocol default is 60s.
      result = (await client.callTool({ name: tool.name, arguments: args }, undefined, { timeout: 10 * 60_000 })) as CallResult;
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      emitError(message);
      return exitCodeFor(message);
    }

    if (result.isError) {
      const message = textOf(result);
      // The server words a refusal for an AI. In a terminal the switch is --confirm.
      emitError(message.replace(/\bconfirm: true\b/g, "--confirm"));
      return exitCodeFor(message);
    }

    // Text a person reads as it is. JSON, or a --select, gets the data.
    const data = format === "text" && !select?.length && result.structuredContent === undefined ? textOf(result) : dataOf(result);
    emit(select?.length && typeof data === "object" ? selectFields(data, select) : data, format);
    return EXIT.ok;
  } finally {
    await close();
  }
}

/** Every tool, as tools/list returns it to an MCP app. */
export async function listTools(): Promise<Tool[]> {
  const { tools, close } = await connect();
  await close();
  return tools;
}

/** The tool names, for the entry point to route on. */
export async function toolNames(): Promise<string[]> {
  return (await listTools()).map((t) => t.name);
}
