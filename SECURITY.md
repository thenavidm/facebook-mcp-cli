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

Writes work by default, because posting is the point of the server.

**`confirm: true`** on publishing and deleting, which are public the moment they
run and cannot be undone from a chat window. Hiding a reply is not guarded,
because it is one click to undo.

**`FACEBOOK_READ_ONLY=1`** removes every write tool from the list. The tools are
never registered, so a model cannot see or call them.

## Untrusted content

Comments and reviews are written by other people. Treat anything returned from a
thread as data to report on, never as instructions. The risk is highest with
writes enabled, because a reply is text a stranger chose aimed at an agent that
can post.

## Running it over HTTP

The HTTP transport has no authentication of its own and belongs behind TLS and an
authenticating proxy. It holds a live credential for your account.

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
