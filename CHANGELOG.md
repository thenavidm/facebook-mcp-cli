# Facebook MCP Server & CLI changelog

| Component | Version | Last Updated |
|-----------|---------|--------------|
| facebook-mcp-cli | 0.3.0 | 2026-10-05 |
| `@thenavidm/slipway` | 0.1.24 | 2026-10-05 |
| Graph API | v21.0 | 2026-10-05 |
| Node | >= 22 | 2026-10-05 |

Published as [`@thenavidm/facebook-mcp-cli`](https://www.npmjs.com/package/@thenavidm/facebook-mcp-cli). Version 0.1.0 was published as `@thenavidm/facebook-mcp`.

---


## 0.3.0, 2026-10-05

Built on [Slipway](https://github.com/thenavidm/slipway) 0.1.24. The 15 tools keep their names and arguments, and every difference below was measured against 0.2.0, built from its own commit because it never reached npm. Every measurement ran with an empty home folder and no Page connected, so none of them reached Facebook.

- **The first release on npm under this name.** 0.2.0 was prepared as `@thenavidm/facebook-mcp-cli` but never published, so the install line this README has given since then failed. `npx -y @thenavidm/facebook-mcp-cli` now starts the server, through a third binary named after the package, and the repository moves to `facebook-mcp-cli`, where the package and the README already point.
- **Writes stay off the tool list until they are allowed.** Nothing writes until `FACEBOOK_ALLOW_WRITE=true` and nothing deletes until `FACEBOOK_ALLOW_DELETE=true` as well, as in 0.2.0, but 0.2.0 listed all 15 tools and refused a write when it was called. Now a default install lists its seven reads, so the tool list is 992 o200k tokens instead of 2,447, and Claude Code 2.1.286 spends 1,176 tokens a message on it with every tool loaded instead of 3,120. With writes and deletes on, the same 15 tools cost 2,679 instead of 3,108. `FACEBOOK_READ_ONLY` and `FACEBOOK_ALLOW_DESTRUCTIVE` decide when they are set.
- **A person approves each delete.** `delete_post` and `delete_comment` now ask first: Claude Code (2.1.246 and later) shows its own prompt, and a client that can show forms asks with an approval form whose one box starts unticked. Where a client can do neither, the model's `confirm: true` counts, and `FACEBOOK_CONFIRM=model` makes it enough everywhere; in a terminal it is `--confirm`. Posting, editing, replying and hiding stay writes behind `FACEBOOK_ALLOW_WRITE`, with no prompt, as in 0.2.0.
- **`which <words>` finds a command**, and `agent-context` describes every command, flag and setting as JSON. In Codex 0.159.3, finding the command that reports how one post performed, and its flags, took a median of 71,276 input tokens over the CLI instead of 90,223 (five runs each): 0.2.0 runs read the general help, `help` and the command list before the command's help, four to six commands, and 0.3.0 runs asked `which` and then read the help, three or fewer.
- **Meta's code picks the exit code.** A rate limit or a temporary block exits 7, an expired token or a missing permission 4, a rejected parameter 2, a removed post 3, no Page connected 10, and anything else from Meta 5. 0.2.0 read these from the words of each message.
- **Smaller answers over MCP.** A result is compact JSON, where 0.2.0 indented it, and a failure is JSON with Slipway's `code` and Meta's `status` and error code, where 0.2.0 sent the message alone.
- **Less to install and start.** npx installs four packages instead of 94: Slipway brings the MCP SDK's 2.x server package, which carries no web framework. The server spends 140 ms of CPU before its first answer where 0.2.0 spent 150, and answers in 100 ms of wall time instead of 102 (median of 21 runs, taking turns on one Mac).
- **`--http` serves MCP over HTTP**, which 0.2.0 could not, on 127.0.0.1; anywhere else it needs `FACEBOOK_HTTP_TOKEN`, and it refuses a page from another site unless `FACEBOOK_HTTP_ALLOWED_ORIGINS` lists it.
- **`login`, `doctor` and `install`.** `login <user token>` stores Page tokens as before, from either binary. `doctor` names each connected Page with its followers, or says how to connect one, and `install <client>` adds the server to Claude Code, Codex, Claude Desktop, Cursor, VS Code or Gemini CLI in each one's own format.
- **Docs.** The README's costs are measured against 0.2.0, section 8 says how writes, deletes and approvals work now and lists every setting, a dependencies table credits what the server is built on, the contents link to section 10 works on GitHub, and `SKILL.md` lists `which` and exit code 1 at no more cost than before. `AGENTS.md` and `SECURITY.md` described writes as on by default and posting as confirmed, which 0.2.0 never did; both now say what the server does.

### Upgrading

Node 22 or later is required; 0.2.0 ran on 20. Over MCP, expect an approval prompt or form before a delete; a headless agent that should delete with `confirm: true` alone needs `FACEBOOK_CONFIRM=model`. With writes off, the write tools are missing from the list rather than refusing, and a client that calls one anyway gets "tool not found"; the CLI still names the setting that turns them on. The audit log is JSON lines with a summary of each call, its outcome and who approved it, where 0.2.0 wrote tab-separated lines. An error in the terminal is one JSON object with `error`, Slipway's `code` and often a `hint`. A missing argument's error is 15 tokens longer, for its code and a hint.

## 0.2.0

**A CLI.** `facebook-cli` runs every tool as a shell command. It builds the same server the MCP binary runs and calls it through the SDK's in-memory transport, so the two surfaces cannot drift. Exit codes follow the house contract: 2 usage or a refused write, 3 not found, 4 a token Meta refuses, 5 API, 7 rate limited, 10 no Page connected.

**Renamed to facebook-mcp-cli**, the name every server with a CLI carries. The old package is deprecated with a pointer here, and GitHub redirects the old repo address.

**A Claude Desktop extension**, attached to each release.

## 0.1.0

First release. 15 tools over Meta's official Graph API.

**Pages**

`list_pages` and `get_page`. Multi-Page from the start, with a preference order
so an unnamed action lands somewhere predictable rather than on whichever Page
happened to be stored first. Exact name matches beat prefix matches, or a Page
called "Navid Media" would swallow a request meant for "Navid".

**Posting**

`create_post`, `create_photo_post`, `publish_draft`, `update_post`,
`delete_post`, `list_posts` and `list_scheduled_posts`.

Scheduling and drafting are native: Facebook holds the post and publishes it
itself, so nothing has to be running at the time. Scheduled times are checked
against Facebook's 10 minute to 6 month window before sending, because its own
error for breaking that says nothing useful.

**Comments**

`list_comments`, `reply_to_comment`, `hide_comment` and `delete_comment`.
Hiding is reversible and is the tool to reach for; deleting sits behind a
separate switch.

**Insights**

`get_page_insights` and `get_post_insights`. Separate tools because Meta uses
different metric names for each, and pretending otherwise would produce empty
results.

**Safety**

Read-only by default. Writing needs `FACEBOOK_ALLOW_WRITE`, deleting needs
`FACEBOOK_ALLOW_DELETE` on top, and every write can be appended to an audit log
no tool can read or edit.

**Errors**

Meta's messages are written for whoever built the SDK. The common ones are
translated into the action that fixes them, and `doctor` checks each link in
the token chain and reports the first that is broken.

Reads retry once on rate limits and server faults. Writes never retry, because
retrying a post risks publishing twice.

**Tests**

26, covering config resolution, the Page picker, the three permission levels
and error translation.
