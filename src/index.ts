#!/usr/bin/env node
/**
 * Entry point.
 *
 * `facebook-mcp`          stdio, which is what MCP clients launch
 * `facebook-mcp login`    exchange a user token for long-lived Page tokens
 * `facebook-mcp doctor`   check the setup and say what is wrong
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, VERSION } from "./server.js";
import { isCliCommand, runCli, toolNames } from "./cli.js";

/** Invoked as the CLI binary rather than the server one. */
function invokedAsCli(): boolean {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith("facebook-cli");
}

/** What the entry point answers itself, whichever binary was typed. */
const ENTRY_COMMANDS = new Set(["help", "version", "login", "doctor"]);
import { loadConfig } from "./config.js";
import { login } from "./login.js";
import { doctor } from "./doctor.js";

const HELP = `facebook-mcp ${VERSION}

  facebook-mcp                  Run over stdio. This is what an MCP client launches.
  facebook-mcp login <token>    Turn a short-lived user token into stored Page tokens.
  facebook-mcp doctor           Check the setup and report what is wrong.
  facebook-mcp --version        Print the version.

Getting started:

  facebook-mcp login <user access token>

Get that token from developers.facebook.com, Graph API Explorer, with the
pages_show_list, pages_manage_posts and pages_read_engagement permissions. It
only needs to last a minute: login exchanges it for Page tokens that do not
expire, and stores those in ~/.facebook-mcp/pages.json.

Environment:

  FACEBOOK_ALLOW_WRITE=true     Permit posting, editing and moderating. Off by default.
  FACEBOOK_ALLOW_DELETE=true    Permit deleting posts and comments. Off by default.
  FACEBOOK_PREFERRED_PAGES      Comma separated names, deciding which Page acts by default.
  FACEBOOK_AUDIT_LOG=<path>     Append every write to this file.

Docs: https://github.com/thenavidm/facebook-mcp-cli
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const argv = process.argv.slice(2);

  // The CLI: every tool as a command, from the same server an MCP app talks
  // to. Checked first so `<tool> --help` reaches the tool.
  const cli =
    cmd !== undefined && !cmd.startsWith("-") && !ENTRY_COMMANDS.has(cmd)
      ? invokedAsCli() || isCliCommand(argv, await toolNames())
      : invokedAsCli() && argv.length === 0;
  if (cli) {
    process.exitCode = await runCli(argv.length ? argv : ["tools"]);
    return;
  }

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "version") {
    process.stdout.write(VERSION + "\n");
    return;
  }
  if (cmd === "login") {
    await login(rest[0]);
    return;
  }
  if (cmd === "doctor") {
    await doctor(loadConfig());
    return;
  }

  const { server, cfg } = buildServer();

  // Everything human-readable goes to stderr. stdout carries the MCP protocol,
  // and a single stray byte there corrupts it.
  if (!cfg.pages.length) {
    process.stderr.write(
      "facebook-mcp: no Page connected. Run `facebook-mcp login <token>` or set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN.\n",
    );
  } else {
    process.stderr.write(
      `facebook-mcp: ${cfg.pages.length} page(s), ${cfg.readOnly ? "read-only" : "writes enabled"}.\n`,
    );
  }

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`facebook-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
