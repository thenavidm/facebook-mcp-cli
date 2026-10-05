/**
 * Turning a short-lived user token into stored Page tokens.
 *
 * The token you copy out of the Graph API Explorer expires in about an hour.
 * Page tokens derived from a long-lived user token do not expire at all, which
 * is why this exchange exists and why there is no refresh logic anywhere else.
 *
 * The chain is: short user token -> long user token -> one token per Page.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AuthError, UsageError } from "@thenavidm/slipway";
import { GRAPH_BASE, type Page } from "./config.js";

async function graph(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // At login a rejected request is nearly always the token: expired, or missing a permission.
    const msg = (body as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new AuthError(`Facebook refused the token: ${msg}`, { status: res.status });
  }
  return body;
}

/** Where login writes, and what it says along the way. */
export type LoginOptions = { env?: NodeJS.ProcessEnv; say?: (line: string) => void };

export async function login(userToken?: string, options: LoginOptions = {}): Promise<Page[]> {
  const env = options.env ?? process.env;
  const say = options.say ?? ((line: string) => process.stderr.write(line + "\n"));
  if (!userToken) {
    throw new UsageError(
      "Pass a user access token: facebook-cli login <token>. " +
        "Get one at developers.facebook.com, Graph API Explorer, with pages_show_list, pages_manage_posts and pages_read_engagement.",
    );
  }

  let token = userToken;

  // Exchange for a long-lived token when an app id and secret are available.
  // Without them the short token still works, but the Page tokens it produces
  // expire with it, so say so rather than letting it fail silently in a week.
  const appId = env.FACEBOOK_APP_ID;
  const appSecret = env.FACEBOOK_APP_SECRET;

  if (appId && appSecret) {
    const long = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    });
    token = long.access_token;
    say("Exchanged for a long-lived token.");
  } else {
    say(
      "No FACEBOOK_APP_ID and FACEBOOK_APP_SECRET set, so the token was not extended.\n" +
        "The Page tokens below will expire when it does, in about an hour. Set both and run login again for permanent ones.",
    );
  }

  const me = await graph("me/accounts", {
    access_token: token,
    fields: "id,name,access_token",
    limit: "100",
  });

  const pages: Page[] = (me.data ?? []).map((p: any) => ({
    id: String(p.id),
    name: String(p.name ?? ""),
    accessToken: String(p.access_token ?? ""),
  }));

  if (!pages.length) {
    throw new AuthError(
      "That token can see no Pages. Check it has the pages_show_list permission and that you administer at least one Page.",
    );
  }

  const out = join(homedir(), ".facebook-mcp", "pages.json");
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  // 600, because these are credentials that do not expire.
  writeFileSync(out, JSON.stringify(pages, null, 2), { mode: 0o600 });

  say(`Stored ${pages.length} page(s) in ${out}`);
  for (const p of pages) say(`  ${p.name} (${p.id})`);
  return pages;
}
