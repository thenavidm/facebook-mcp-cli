/**
 * Turning Graph API errors into something a person can act on.
 *
 * Meta returns a numeric code and a message written for whoever wrote the SDK,
 * not for whoever is reading it. "(#200) Requires manage_pages" tells you
 * nothing about what to do next, so the common ones are translated.
 */

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

type MetaError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  error_user_title?: string;
};

export function explain(status: number, err: MetaError | undefined, body: string): GraphError {
  const code = err?.code;
  const sub = err?.error_subcode;
  const raw = err?.error_user_msg || err?.message || body.slice(0, 300);

  // The handful worth translating, because the fix is not obvious from Meta's
  // own wording.
  const guidance: Record<number, string> = {
    190: "The Page token is invalid or expired. Run `facebook-mcp login` again.",
    200: "The token is missing a permission. It needs pages_manage_posts to write and pages_read_engagement to read.",
    100: "Facebook rejected a parameter. Check ids and dates against the tool description.",
    368: "Temporarily blocked for policy reasons. Slow down and try later.",
    4: "Application request limit reached. This is a rate limit, wait and retry.",
    17: "User request limit reached. This is a rate limit, wait and retry.",
    32: "Page request limit reached. This is a rate limit, wait and retry.",
    613: "Calls to this endpoint have exceeded the rate limit.",
  };

  // A Reel that breaks Facebook's video rules, from the Reels guide's error
  // table. Meta lists them as error codes; they may arrive as the subcode.
  const reels: Record<number, string> = {
    1363040: "A Reel's aspect ratio must be between 16x9 and 9x16; 9x16 is the Reel shape.",
    1363127: "A Reel needs at least 540x960 pixels; 1080x1920 is recommended.",
    1363128: "A Reel must be 3 to 90 seconds long.",
    1363129: "A Reel's frame rate must be 24 to 60 frames per second.",
  };

  const hint = (sub && reels[sub]) || (code && reels[code]) || (code && guidance[code]);
  const extra = hint ? ` ${hint}` : "";
  return new GraphError(`Facebook API ${status}: ${raw}${extra}`, status, code, sub);
}

/** Rate limits and transient faults are worth retrying; a bad request is not. */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof GraphError)) return false;
  if ([4, 17, 32, 613, 368].includes(e.code ?? -1)) return true;
  return e.status >= 500;
}
