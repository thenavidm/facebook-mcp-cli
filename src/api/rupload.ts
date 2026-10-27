/**
 * Reels: Facebook's three-phase upload, start, upload, finish.
 *
 * https://developers.facebook.com/docs/video-api/guides/reels-publishing
 *
 * Start and finish are ordinary Graph calls on graph.facebook.com. The bytes
 * go to a different host, rupload.facebook.com, with the token in an
 * `Authorization: OAuth` header and the position in `offset` and `file_size`
 * headers. A hosted file goes to the same address with a `file_url` header
 * instead, and Facebook fetches it.
 *
 * The upload is resumable: when it breaks partway, Facebook reports how many
 * bytes arrived as `status.uploading_phase.bytes_transfered` (Meta's spelling),
 * and the next request starts from there instead of from zero.
 */

import { openAsBlob } from "node:fs";
import { GRAPH_VERSION, type Config, type Page } from "../config.js";
import type { Graph } from "./client.js";
import { GraphError } from "./errors.js";

export const RUPLOAD_HOST = "rupload.facebook.com";

/** How many times a broken upload is resumed before giving up. */
const RESUMES = 3;

/**
 * How long one upload request may take. The Graph timeout is for small JSON
 * calls; a 90-second Reel at 1080p is often over 100 MB, so the bytes get far
 * longer. The caller's own cancel still stops it at once.
 */
const UPLOAD_TIMEOUT_MS = 20 * 60_000;

/** What `GET /{video-id}?fields=status` returns, as the Reels guide lists it. */
export type ReelStatus = {
  video_status?: string;
  uploading_phase?: { status?: string; bytes_transfered?: number; errors?: unknown; source_file_size?: number };
  processing_phase?: { status?: string; error?: { message?: string } };
  publishing_phase?: { status?: string; publish_status?: string; publish_time?: number | string; error?: { message?: string } };
};

/** rupload answers failures as `{ debug_info: { retriable, type, message } }`, not Graph's `error` object. */
type DebugInfo = { retriable?: boolean; type?: string; message?: string };

export class UploadError extends GraphError {
  constructor(
    message: string,
    status: number,
    readonly retriable: boolean,
    readonly type?: string,
  ) {
    super(message, status);
    this.name = "UploadError";
  }
}

/** Step 1: open an upload session on the Page. Returns the video id every later step uses. */
export async function startReel(graph: Graph, page: Page): Promise<{ videoId: string; uploadUrl: string }> {
  const body = (await graph.post(page, `${page.id}/video_reels`, { upload_phase: "start" })) as { video_id?: string; upload_url?: string };
  if (!body?.video_id) throw new GraphError(`Facebook opened no upload session: ${JSON.stringify(body).slice(0, 300)}`, 502);
  return { videoId: String(body.video_id), uploadUrl: uploadUrlFor(String(body.video_id), body.upload_url) };
}

/** The address Facebook handed back, when it is on rupload; otherwise the documented one. */
export function uploadUrlFor(videoId: string, given?: string): string {
  try {
    if (given && new URL(given).hostname === RUPLOAD_HOST) return given;
  } catch {
    // Not a URL: fall through to the documented address.
  }
  return `https://${RUPLOAD_HOST}/video-upload/${GRAPH_VERSION}/${encodeURIComponent(videoId)}`;
}

async function rupload(
  cfg: Config,
  page: Page,
  url: string,
  headers: Record<string, string>,
  body: Blob | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  const deadline = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `OAuth ${page.accessToken}`, "User-Agent": cfg.userAgent, ...headers },
    body,
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  const text = await res.text();
  let parsed: { success?: boolean; debug_info?: DebugInfo; error?: { message?: string } } = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // Left empty: the status and the raw text say what happened.
  }
  if (res.ok && parsed.success !== false && !parsed.debug_info) return;
  const info = parsed.debug_info;
  const reason = info?.message || parsed.error?.message || text.slice(0, 300) || `HTTP ${res.status}`;
  throw new UploadError(
    `Facebook upload ${res.status}${info?.type ? ` ${info.type}` : ""}: ${reason}`,
    res.ok ? 400 : res.status,
    info?.retriable === true || res.status >= 500,
    info?.type,
  );
}

/** Worth resuming: the connection broke, the server faltered, or Facebook says the offset or length is off. */
function resumable(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return false;
  if (error instanceof UploadError) {
    return error.retriable || error.type === "OffsetInvalidError" || error.type === "PartialRequestError";
  }
  if (error instanceof TypeError) return true; // fetch failed: the network dropped
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/** Step 2, a file on this machine: send its bytes, resuming from what arrived when the connection breaks. */
export async function uploadFile(
  cfg: Config,
  graph: Graph,
  page: Page,
  target: { videoId: string; uploadUrl: string },
  path: string,
  size: number,
  options: { signal?: AbortSignal; progress?: (sent: number, total: number) => void } = {},
): Promise<{ bytes: number; resumed: number }> {
  // Backed by the file, not read into memory, so a large Reel costs no more RAM than a small one.
  const file = await openAsBlob(path);
  let offset = 0;
  for (let resumed = 0; ; resumed++) {
    options.progress?.(offset, size);
    try {
      await rupload(
        cfg,
        page,
        target.uploadUrl,
        { offset: String(offset), file_size: String(size) },
        offset ? file.slice(offset) : file,
        options.signal,
      );
      options.progress?.(size, size);
      return { bytes: size, resumed };
    } catch (error) {
      if (resumed >= RESUMES || !resumable(error, options.signal)) throw error;
      const arrived = Number((await reelStatus(graph, page, target.videoId)).uploading_phase?.bytes_transfered ?? 0);
      if (arrived >= size) return { bytes: size, resumed: resumed + 1 };
      offset = Number.isFinite(arrived) && arrived > 0 ? arrived : 0;
    }
  }
}

/** Step 2, a hosted file: Facebook fetches it from the URL itself. */
export async function uploadHosted(cfg: Config, page: Page, target: { uploadUrl: string }, fileUrl: string, signal?: AbortSignal): Promise<void> {
  await rupload(cfg, page, target.uploadUrl, { file_url: fileUrl }, undefined, signal);
}

/** Step 3: end the session and publish, schedule, or keep it as a draft. */
export async function finishReel(
  graph: Graph,
  page: Page,
  videoId: string,
  options: { state: "PUBLISHED" | "SCHEDULED" | "DRAFT"; description?: string; scheduledPublishTime?: number },
): Promise<unknown> {
  return graph.post(page, `${page.id}/video_reels`, {
    video_id: videoId,
    upload_phase: "finish",
    video_state: options.state,
    description: options.description,
    scheduled_publish_time: options.scheduledPublishTime,
  });
}

/** Facebook's own account of a Reel: uploading, processing, publishing, and when it goes out. */
export async function reelStatus(graph: Graph, page: Page, videoId: string): Promise<ReelStatus> {
  const body = (await graph.get(page, videoId, { fields: "status" })) as { status?: ReelStatus };
  return body?.status ?? {};
}

/**
 * The status in one word, plus what to know about it. Facebook spreads it over
 * three phases; a model or a script wants to know whether it is out, when it
 * will be, or what went wrong.
 */
export function summarizeStatus(status: ReelStatus): { state: string; publish_time?: string; error?: string } {
  const failure = status.processing_phase?.error?.message || status.publishing_phase?.error?.message;
  if (failure || status.video_status === "error" || status.video_status === "upload_failed") {
    return { state: "error", ...(failure ? { error: failure } : {}) };
  }
  if (status.video_status === "expired") return { state: "expired", error: "The upload expired. Start again with create_reel." };
  const when = Number(status.publishing_phase?.publish_time);
  const publishTime = Number.isFinite(when) && when > 0 ? new Date(when * 1000).toISOString() : undefined;
  const published = status.publishing_phase?.publish_status;
  if (published === "published" || published === "scheduled" || published === "draft") {
    return { state: published, ...(publishTime ? { publish_time: publishTime } : {}) };
  }
  return { state: status.video_status || "unknown" };
}
