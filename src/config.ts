/**
 * Credentials, and the multi-Page model.
 *
 * Every connection here is a PAGE, not a person. Facebook removed the ability
 * to post to a personal profile in 2018 and never replaced it, so Pages are
 * the only surface an API can write to.
 *
 * Each Page carries its own token, derived from a long-lived user token. Those
 * Page tokens do not expire, which is why there is no refresh loop anywhere in
 * this codebase.
 *
 * Three sources, in priority order:
 *   1. FACEBOOK_PAGES         a JSON array, for several Pages
 *   2. FACEBOOK_PAGE_ID + FACEBOOK_PAGE_TOKEN, the single-Page variables
 *   3. ~/.facebook-mcp/pages.json, whatever `facebook-mcp login` captured
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "./version.js";

export type Page = {
  id: string;
  accessToken: string;
  /** What the Page is called, used to pick between several. */
  name: string;
};

export type Config = {
  pages: Page[];
  /**
   * Which Page acts when the caller names none. Ordered deliberately rather
   * than "whichever happened to be stored first", so an unnamed post lands
   * somewhere predictable instead of somewhere surprising.
   */
  preferred: string[];
  readOnly: boolean;
  /** Deleting a post or a comment cannot be undone, so it is gated separately. */
  allowDestructive: boolean;
  requestTimeoutMs: number;
  userAgent: string;
};

export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function storePath(): string {
  return join(homedir(), ".facebook-mcp", "pages.json");
}

function loadStoredPages(): Page[] {
  try {
    const raw = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is Page => Boolean(p?.id && p?.accessToken));
  } catch {
    return [];
  }
}

function parsePagesEnv(raw: string): Page[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        id: String(p.id ?? p.page_id ?? ""),
        accessToken: String(p.accessToken ?? p.access_token ?? p.token ?? ""),
        name: String(p.name ?? ""),
      }))
      .filter((p) => p.id && p.accessToken);
  } catch {
    return [];
  }
}

const TRUE = /^(1|true|yes|on)$/i;
const FALSE = /^(0|false|no|off)$/i;

/**
 * Whether writes are off: unless FACEBOOK_ALLOW_WRITE=true, as in 0.2. Slipway's
 * own FACEBOOK_READ_ONLY decides when it is set, the way the server reads it.
 */
export function writesOff(env: NodeJS.ProcessEnv): boolean {
  const own = env.FACEBOOK_READ_ONLY?.trim() ?? "";
  if (TRUE.test(own)) return true;
  if (FALSE.test(own)) return false;
  return env.FACEBOOK_ALLOW_WRITE !== "true";
}

/** Whether deleting is on: only with FACEBOOK_ALLOW_DELETE=true, as in 0.2, or Slipway's FACEBOOK_ALLOW_DESTRUCTIVE=1. */
export function deletesOn(env: NodeJS.ProcessEnv): boolean {
  const own = env.FACEBOOK_ALLOW_DESTRUCTIVE?.trim() ?? "";
  if (TRUE.test(own)) return true;
  if (FALSE.test(own)) return false;
  return env.FACEBOOK_ALLOW_DELETE === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {

  let pages: Page[] = [];
  if (env.FACEBOOK_PAGES) pages = parsePagesEnv(env.FACEBOOK_PAGES);
  if (!pages.length && env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_TOKEN) {
    pages = [
      {
        id: env.FACEBOOK_PAGE_ID,
        accessToken: env.FACEBOOK_PAGE_TOKEN,
        name: env.FACEBOOK_PAGE_NAME ?? "",
      },
    ];
  }
  if (!pages.length) pages = loadStoredPages();

  return {
    pages,
    preferred: (env.FACEBOOK_PREFERRED_PAGES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Read-only by default. Posting to a Page is public and immediate, so it
    // should be something you switched on rather than something you inherited.
    readOnly: writesOff(env),
    allowDestructive: deletesOn(env),
    requestTimeoutMs: Number(env.FACEBOOK_TIMEOUT_MS) || 30_000,
    userAgent: `facebook-mcp/${VERSION}`,
  };
}

/**
 * Pick the Page to act as.
 *
 * Exact name match beats a prefix match. Without that rule, a Page called
 * "Navid Media" would swallow a request meant for "Navid", because one is a
 * prefix of the other.
 */
export function pickPage(cfg: Config, wanted?: string): Page {
  if (!cfg.pages.length) {
    throw new Error(
      "No Facebook Page connected. Run `facebook-mcp login`, or set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN.",
    );
  }

  const byName = (name: string) => {
    const want = name.trim().toLowerCase();
    return (
      cfg.pages.find((p) => p.id === name) ??
      cfg.pages.find((p) => p.name.toLowerCase() === want) ??
      cfg.pages.find((p) => p.name.toLowerCase().startsWith(want))
    );
  };

  if (wanted) {
    const found = byName(wanted);
    if (found) return found;
    throw new Error(
      `No connected Page matches "${wanted}". Connected: ${cfg.pages
        .map((p) => p.name || p.id)
        .join(", ")}`,
    );
  }

  for (const want of cfg.preferred) {
    const found = byName(want);
    if (found) return found;
  }
  return cfg.pages[0];
}
