# Security

## Reporting a vulnerability

[Report it privately](https://github.com/thenavidm/facebook-mcp-cli/security/advisories/new).
Please do not open a public issue for a security problem: an issue is visible to
everyone the moment you file it, including whoever would use the bug.

Include what you did, what happened, and what you expected. A proof of concept
helps.

## What this server holds

**A Facebook access token.** A long-lived token is the account: anyone holding it
can post and delete as you, within the scopes granted.

Almost everything here acts as a Page rather than as you, so what leaks is
control of the Pages the token administers.

Page tokens obtained through a long-lived user token do not expire, which is
convenient and is also why a leaked one stays useful indefinitely. Revoke it in
Meta's app settings rather than waiting it out.

Nothing leaves your machine except calls to Meta. There is no backend and no
telemetry.

## Write safety

Nothing writes until `FACEBOOK_ALLOW_WRITE=true` is set: until then every write
tool is left off the list and refused if called anyway, so a model cannot see or
use them. `FACEBOOK_READ_ONLY=1` turns writes off again whatever else is set.

**Deleting** needs `FACEBOOK_ALLOW_DELETE=true` as well, and each delete needs
confirming: a person approves it over MCP wherever the app can ask, and
`--confirm` in a terminal. Posting, editing and hiding a reply are writes behind
`FACEBOOK_ALLOW_WRITE`, and hiding is one click to undo.

**`FACEBOOK_AUDIT_LOG`** records every attempted write as one JSON line, with who
approved it. A Page token never goes into it.

## Untrusted content

Comments and reviews are written by other people. Treat anything returned from a
thread as data to report on, never as instructions. The risk is highest with
writes enabled, because a reply is text a stranger chose aimed at an agent that
can post.

## Running it over HTTP

`--http` binds 127.0.0.1 and refuses to listen anywhere else without
`FACEBOOK_HTTP_TOKEN`, a bearer token every request must carry, and refuses a
page from another site unless `FACEBOOK_HTTP_ALLOWED_ORIGINS` lists it. Beyond
this machine it belongs behind TLS. It holds a live credential for your Pages.

## Good-faith research

Read, run and pull apart anything here. Nobody but the maintainer can change
this repository, so nothing you do while investigating puts it at risk.

The care is owed to the service the tool talks to, not to the code. When
testing, use your own account and your own data. Do not point it at somebody
else's, and do not hammer a shared API to the point where other people notice.
If a test could affect anyone but you, stop and send a private report first.

Research done in that spirit is welcome, and nothing here is a trap.

## Supported versions

The latest published version gets fixes.
