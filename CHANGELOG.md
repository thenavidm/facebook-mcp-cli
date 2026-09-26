# Facebook MCP Server & CLI changelog

| Component | Version | Last Updated |
|-----------|---------|--------------|
| facebook-mcp-cli | 0.2.0 | 2026-09-26 |

Published as [`@thenavidm/facebook-mcp-cli`](https://www.npmjs.com/package/@thenavidm/facebook-mcp-cli). Version 0.1.0 was published as `@thenavidm/facebook-mcp`.

---


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
