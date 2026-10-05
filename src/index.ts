#!/usr/bin/env node
/**
 * Both binaries. `facebook-mcp` with no arguments serves MCP over stdio, which
 * is what an MCP app launches, and any command runs one tool from the shell.
 * The server stays silent on stdout, which carries the protocol.
 *
 * Node's compile cache goes on before the app loads, so every launch after the
 * first skips compiling it again. NODE_DISABLE_COMPILE_CACHE=1 turns it off.
 */

import * as nodeModule from "node:module";

nodeModule.enableCompileCache?.();
const { app } = await import("./app.js");
await app.main();
