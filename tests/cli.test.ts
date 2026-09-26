/**
 * The CLI bridge (src/cli.ts, copied from dev:mcp-cli assets/cli-bridge.ts).
 *
 * The bridge reads the real server's tools/list, so the tests that count are
 * the ones over that list: every tool routes, every schema turns into flags,
 * and every required key is a required flag. The rest cover the argv shapes a
 * person types and the exit-code contract.
 */

import { describe, expect, it } from "vitest";
import { EXIT, exitCodeFor, flagsFor, isCliCommand, listTools, parseArgs } from "../src/cli.js";

const schema = {
  type: "object",
  properties: {
    text: { type: "string", description: "The body." },
    limit: { type: "integer" },
    confirm: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
    filter: { type: "object" },
    mode: { type: "string", enum: ["fast", "slow"] },
    maybe: { anyOf: [{ type: "number" }, { type: "null" }] },
  },
  required: ["text"],
};

describe("flags from the JSON Schema an MCP app receives", () => {
  const flags = flagsFor(schema);
  const by = (key: string) => flags.find((f) => f.key === key);

  it("kebab-cases each key and carries its description", () => {
    expect(by("text")).toMatchObject({ flag: "--text", kind: "string", required: true, help: "The body." });
  });

  it("reads the kind of every property", () => {
    expect(by("limit")?.kind).toBe("integer");
    expect(by("confirm")?.kind).toBe("boolean");
    expect(by("tags")).toMatchObject({ kind: "string", repeatable: true });
    expect(by("filter")?.kind).toBe("json");
    expect(by("mode")).toMatchObject({ kind: "enum", choices: ["fast", "slow"] });
    expect(by("maybe")?.kind).toBe("number");
  });
});

describe("parseArgs", () => {
  const flags = flagsFor(schema);

  it("accepts --flag value, --flag=value and the underscore spelling", () => {
    expect(parseArgs(["--text", "hi"], flags)).toEqual({ text: "hi" });
    expect(parseArgs(["--text=hi"], flags)).toEqual({ text: "hi" });
    expect(parseArgs(["--text", "hi", "--mode", "fast"], flags)).toEqual({ text: "hi", mode: "fast" });
  });

  it("treats a boolean as a switch and collects a repeatable flag", () => {
    expect(parseArgs(["--text", "hi", "--confirm", "--tags", "a", "--tags", "b"], flags)).toEqual({ text: "hi", confirm: true, tags: ["a", "b"] });
  });

  it("fills the first required flag from a bare argument", () => {
    expect(parseArgs(["hello"], flags)).toEqual({ text: "hello" });
  });

  it("refuses what it cannot use", () => {
    expect(() => parseArgs(["--nope", "x"], flags)).toThrow(/Unknown option/);
    expect(() => parseArgs(["--text", "hi", "--limit", "1.5"], flags)).toThrow(/whole number/);
    expect(() => parseArgs(["--text", "hi", "--mode", "medium"], flags)).toThrow(/one of/);
    expect(() => parseArgs(["--text", "hi", "--filter", "{oops"], flags)).toThrow(/JSON/);
    expect(() => parseArgs([], flags)).toThrow(/Missing --text/);
  });
});

describe("exit codes follow the house contract", () => {
  it("maps the generic words", () => {
    expect(exitCodeFor("MCP error -32602: Input validation error: Invalid arguments")).toBe(EXIT.usage);
    expect(exitCodeFor("Not deleting. Call again with confirm: true once you are sure.")).toBe(EXIT.usage);
    expect(exitCodeFor("Too many requests, slow down (429)")).toBe(EXIT.rateLimited);
    expect(exitCodeFor("Nothing is configured. Run `login` first.")).toBe(EXIT.config);
    expect(exitCodeFor("Request had invalid authentication credentials (401)")).toBe(EXIT.auth);
    expect(exitCodeFor("That resource was not found (404)")).toBe(EXIT.notFound);
    expect(exitCodeFor("Upstream answered 502")).toBe(EXIT.api);
  });
});

describe("parity with the real server", () => {
  it("routes every tool in both spellings, and builds flags for every schema", async () => {
    const tools = await listTools();
    expect(tools.length).toBeGreaterThan(0);
    const names = tools.map((t) => t.name);
    for (const tool of tools) {
      expect(isCliCommand([tool.name], names)).toBe(true);
      expect(isCliCommand([tool.name.replace(/_/g, "-")], names)).toBe(true);
      const flags = flagsFor(tool.inputSchema);
      expect(flags).toHaveLength(Object.keys(tool.inputSchema.properties ?? {}).length);
      for (const key of tool.inputSchema.required ?? []) expect(flags.find((f) => f.key === key)?.required).toBe(true);
    }
  });

  it("leaves the server's own flags alone", () => {
    expect(isCliCommand(["--http"], ["x"])).toBe(false);
    expect(isCliCommand([], ["x"])).toBe(false);
  });
});
