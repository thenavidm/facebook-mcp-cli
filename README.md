<img src="https://cdn.navid.media/connectors/facebook-icon.png" alt="Facebook" width="88">

# Facebook MCP

[![npm](https://img.shields.io/npm/v/@thenavidm/facebook-mcp?color=orange&label=npm)](https://www.npmjs.com/package/@thenavidm/facebook-mcp)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-thenavidm-0A66C2?logo=linkedin&logoColor=white)](https://linkedin.com/in/thenavidm)

Facebook MCP server for Claude Code and AI agents. Posting, scheduling, drafts, Page and post insights, and comment moderation.

Setup needs a Meta developer app. There is no way around that: Facebook only issues Page tokens through an app you own. You create one once, generate a user token, and `login` exchanges it for Page tokens that never expire.

Pages only. Facebook removed personal profile posting from the API in 2018 and never replaced it, so no tool can do it, including this one.

Scheduling is real. Facebook holds the post and publishes it itself, so nothing has to be running on your machine at the time.

15 tools, across as many Pages as you administer.

<img src="https://cdn.navid.media/repos/facebook-mcp.gif?v=1" alt="Claude Code using the Facebook MCP server" width="520">

## Contents

| | Section | |
|---|---|---|
| 1 | [What you can ask it](#1-what-you-can-ask-it-) | Real prompts, not features |
| 2 | [Quick install](#2-quick-install-) | One command |
| 3 | [Create your Meta app](#3-create-your-meta-app-) | The setup step there is no way around |
| 4 | [Get your token](#4-get-your-token-) | And make it permanent |
| 5 | [Connect your client](#5-connect-your-client-) | Every client, copy and paste |
| 6 | [Check it worked](#6-check-it-worked-) | One command that says what is broken |
| 7 | [Tools](#7-tools-) | All fifteen |
| 8 | [Posting safely](#8-posting-safely-) | Three levels, three switches |
| 9 | [Several Pages](#9-several-pages-) | Picking which one acts |
| 10 | [Limits worth knowing](#10-limits-worth-knowing-) | What Facebook will not let you do |
| 11 | [Troubleshooting](#11-troubleshooting-) | When something breaks |
| 12 | [FAQ](#faq-) | Common questions |

## 1. What you can ask it 💬

- Schedule this for Tuesday at 9am, and draft two alternatives I can pick from.
- Which post this month got the most reach, and what was different about it?
- Compare last week to the week before. Did the change in posting time help?
- Read the comments on the last five posts and tell me what people keep asking.
- Draft a reply to each comment that deserves one, in my voice. Do not post them.
- Hide the spam on that post, but leave the criticism.
- How many followers did I gain this month, and which day did most of it happen?

**What this adds over Meta Business Suite**, which already schedules posts:

Business Suite shows you numbers. It cannot answer a question about them. "Why
did Thursday do four times better" needs someone to look at the posts, compare
them, and form a view. That is the part a conversation does and a dashboard
does not.

The second thing is that reading and acting happen in one place. You ask what
worked, decide what to do about it, and schedule the follow-up without opening
another tab or copying anything between windows.

**What to do first**, in order:

1. Install it, one command, section 2
2. Create a Meta app and connect your Page, sections 3 and 4. This is the part
   that takes ten minutes, and only once
3. Point your client at it, section 5
4. Ask it something read-only, like "how did my last five posts do"
5. Turn on writing only once you trust what it is telling you

Reading works as soon as a Page is connected. Posting stays off until you set
one environment variable, deliberately.

## 2. Quick install ⚡

```bash
npx -y @thenavidm/facebook-mcp --version
```

Node 20 or newer. Nothing else to install.

That gets you the server. Connecting a Page is the next three sections, and it
is the part that takes real time.

## 3. Create your Meta app 🔑

Facebook has no app passwords and no personal tokens. Every credential comes
through an app you own, so you make one once.

**You do not need App Review, and you do not need Business Verification.** Those
are only for managing Pages belonging to other people, which Meta calls
Advanced Access. For your own Pages, Standard Access is enough and it is
granted the moment you ask.

> [!TIP]
> **One app covers Facebook, Instagram and Threads.**
>
> Use cases are ticked in a list, and you can tick several. If you plan to use
> more than one of these, do it now rather than making three apps and managing
> three sets of credentials.
>
> | Use case | For | Server |
> |---|---|---|
> | Manage everything on your Page | Facebook Pages | this one |
> | Manage messaging and content on Instagram | Instagram | [instagram-mcp](https://github.com/thenavidm/instagram-mcp) |
> | Access Threads API | Threads | [threads-mcp](https://github.com/thenavidm/threads-mcp) |
>
> Incompatible combinations grey out. If an option will not tick, it conflicts
> with something already selected.

### Step 1: the creation wizard

[developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation/).
Five screens, in this order.

**App details.** A name, up to 30 characters, and a contact email. The name is
only shown on your own My Apps page and can be changed later.

**Use cases.** This is where people get stuck. The screen opens on
**Featured (6)**, and the Pages use case is not one of the six. Change the
filter on the left to **All (20)** or **Content management (5)** to find it.

The featured six are Marketing API, app ads, Threads, Instant Games, Facebook
Login and WhatsApp. None of those is what you want.

**Business.** Which business portfolio the app belongs to. An unverified one is
fine, and "I don't want to connect a business portfolio yet" is a valid answer
you can revisit. Verification is only needed to reach other people's data.

**Requirements.** For a Pages app on your own Pages this reads "No requirements
identified". That is the screen confirming you do not need App Review.

**Overview.** Review and **Create app**.

### Step 2: add the permissions by hand

Creating the app does **not** give you the permissions. This is the step every
guide skips, and without it `login` will fail.

Open your app, click the use case in the left sidebar, then **Permissions and
features**. You get a table of every permission that use case can grant, and
almost all of them start unadded, showing a dash in the Status column.

Click **+ Add** on each of these:

| Permission | What it is for |
|---|---|
| `pages_show_list` | Seeing which Pages you administer. Without it, login finds nothing |
| `pages_read_engagement` | Reading posts, comments, followers and Page metadata |
| `pages_manage_posts` | Creating, editing and deleting posts |
| `pages_manage_engagement` | Replying to, hiding and deleting comments |
| `read_insights` | Impressions, reach and engagement numbers |

Added permissions move to **Ready for testing**, which is the state you want.
That is Standard Access, it is immediate, and nothing is reviewed.

Those five are what this server needs. The Pages API exposes far more, covering
messaging, leads, monetization and ads, grouped by Meta into tasks like
`CREATE_CONTENT`, `MODERATE`, `ANALYZE` and `MESSAGING`. Add more only if you
have a reason, since each one widens what an agent holding the token can do.

There is also **Add more to this use case** in the sidebar, which widens what
the use case can grant if something you need is not in the list.

> [!TIP]
> The one people miss is `pages_read_engagement`. It reads like a write
> permission and is not. Leave it out and reading breaks while posting still
> works, which is a confusing way to fail.

### Step 3: make sure you have an app role

Standard Access only works for people who hold a **role on the app**. As its
creator you are automatically an admin, so this is usually already true and
worth knowing rather than doing.

It matters when it is not you. Anyone else who wants to use your app, a
colleague or a second account of your own, has to be added under **App roles**,
then **Roles**, as an Administrator, Developer or Tester. Without a role they
cannot grant the permissions at all, and Meta's error does not say why.

**Test users** live in the same place. They are throwaway accounts Meta
generates for you, useful for trying a destructive tool without pointing it at
a real Page. They cannot administer a real Page, so they are for testing the
plumbing, not the content.

**Business Verification** is a separate thing again, and you do not need it
here. It is required for **Advanced Access**, which is what you would need to
manage Pages belonging to people who have no role on your app. For your own
Pages, Standard Access is enough.

### Step 4: check the Page is in the same portfolio

Your Page must belong to the business portfolio you attached to the app, or the
app cannot see it and `login` reports no Pages.

**Business settings**, then **Accounts**, then **Pages**. If it is not listed,
add it there first.

### Rather have an agent do it

The steps above are written to be handed over. Paste this into Claude, or any
agent with a browser:

> Walk me through creating a Meta developer app for the Facebook Pages API.
> I need the "Manage everything on your Page" use case, Standard Access for
> pages_show_list, pages_read_engagement, pages_manage_posts,
> pages_manage_engagement and read_insights, and my Page linked to the same
> business portfolio. Tell me what to click, one step at a time, and wait for
> me to confirm each one.

## 4. Get your token 🔑

### Generate one

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Pick your app, top right
3. Under **Permissions**, add the five above
4. **Generate Access Token**, and approve

That token dies in about an hour. It does not matter, it is used once.

### Exchange it for Page tokens

```bash
npx @thenavidm/facebook-mcp login <that token>
```

Writes `~/.facebook-mcp/pages.json`, mode 600, one token per Page you
administer.

### Make them permanent

Left alone, those Page tokens expire with the user token they came from. That
is the single most common reason this stops working the next day.

```bash
export FACEBOOK_APP_ID=...
export FACEBOOK_APP_SECRET=...
npx @thenavidm/facebook-mcp login <that token>
```

Both are under **Settings**, then **Basic** in your app. With them, login
extends the user token first, and the Page tokens it derives never expire.

### One app also covers Instagram and Threads

The same Meta app can carry the Instagram and Threads permissions. If you plan
to use those too, add their products now rather than making three apps.

## 5. Connect your client 🔌

### Claude Code

```bash
claude mcp add --transport stdio facebook -- npx -y @thenavidm/facebook-mcp
```

With posting allowed:

```bash
claude mcp add --transport stdio --env FACEBOOK_ALLOW_WRITE=true facebook -- npx -y @thenavidm/facebook-mcp
```

### Claude Desktop

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "facebook": {
      "command": "npx",
      "args": ["-y", "@thenavidm/facebook-mcp"],
      "env": { "FACEBOOK_ALLOW_WRITE": "true" }
    }
  }
}
```

Quit Claude Desktop completely and reopen it.

### Cursor

`~/.cursor/mcp.json` for every project, or `.cursor/mcp.json` inside one. Same
shape as Claude Desktop.

### VS Code with GitHub Copilot

`.vscode/mcp.json`. Note it uses `servers`, not `mcpServers`.

```json
{
  "servers": {
    "facebook": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thenavidm/facebook-mcp"]
    }
  }
}
```

### Windsurf, Zed, Cline, Codex CLI, Gemini CLI

All take the same stdio shape. Codex uses TOML:

```toml
[mcp_servers.facebook]
command = "npx"
args = ["-y", "@thenavidm/facebook-mcp"]
```

### Docker

```bash
docker build -t facebook-mcp .
docker run -i --rm -v facebook-mcp:/home/node/.facebook-mcp facebook-mcp
```

The volume matters. Page tokens live in the home directory, and without it
every login is written into a container that is about to disappear.

## 6. Check it worked 🩺

```bash
npx @thenavidm/facebook-mcp doctor
```

It names every Page it can reach, with follower counts. If something is wrong
it says which link in the chain broke, because Meta's own error rarely does.

## 7. Tools 🧰

Fifteen. Each declares whether it reads or writes, so your client can show you
before anything runs.

### Your Pages

| Tool | | |
|---|---|---|
| `list_pages` | read | Every Page this server can act as |
| `get_page` | read | Name, category, followers, about, website |

### Posting

| Tool | | |
|---|---|---|
| `create_post` | write | Text post, optionally with a link |
| `create_photo_post` | write | Photo from a URL, with a caption |
| `publish_draft` | write | Push a draft or scheduled post out now |
| `update_post` | write | Edit the text of a published post |
| `delete_post` | delete | Cannot be undone |
| `list_posts` | read | Published posts with reaction, comment and share counts |
| `list_scheduled_posts` | read | Scheduled and draft posts not yet out |

### Comments

| Tool | | |
|---|---|---|
| `list_comments` | read | With author and time |
| `reply_to_comment` | write | Public reply, as the Page |
| `hide_comment` | write | Hide or unhide. Reversible |
| `delete_comment` | delete | Cannot be undone |

### Numbers

| Tool | | |
|---|---|---|
| `get_page_insights` | read | Impressions, reach, engagement, follower change |
| `get_post_insights` | read | How one post did |

### Scheduling and drafts

`create_post` covers three cases with one tool:

| Intent | Arguments |
|---|---|
| Post now | `message` |
| Save a draft | `message`, `draft: true` |
| Schedule | `message`, `publish_at` as an ISO timestamp |

Facebook requires 10 minutes to 6 months ahead. Its own error for breaking that
says nothing useful, so this checks first and tells you which rule you hit.

## 8. Posting safely 🔒

A Page post is public the moment it lands. Deleting one cannot be undone. Two
different risks, so two different switches.

**Reading** needs nothing.

**Writing** needs `FACEBOOK_ALLOW_WRITE=true`. Posting, editing, replying and
hiding all refuse without it, so a default install cannot publish anything.

**Deleting** needs `FACEBOOK_ALLOW_DELETE=true` as well.

**Every write can be logged.** Set `FACEBOOK_AUDIT_LOG=/path/to/file` and every
attempt is appended, with no tool able to read or edit it.

Comment text is labelled as data rather than instructions when handed to the
model. Comments are written by strangers, and an agent that reads them and can
also post is exposed to whatever they put there.

## 9. Several Pages 📄

`list_pages` shows them, and every tool takes a `page` argument to name one.

Unnamed, it uses the first, which is rarely what you want. Set an order:

```bash
export FACEBOOK_PREFERRED_PAGES="Navid Media,Side Project"
```

Exact name matches beat prefix matches, so a Page called "Navid Media" will not
swallow a request meant for "Navid".

## 10. Limits worth knowing ⚠️

**Pages only.** Facebook removed personal profile posting from the API in 2018
and never replaced it. No tool can do it.

**Insights lag** by a few hours, so this morning's post looks quieter than it
is.

**Rate limits are per app, not per Page.** Heavy use across several Pages
shares one budget. Reads back off and retry; writes never retry, because
retrying a post risks publishing twice.

**Edits are visible.** Facebook shows viewers an edit history on any post you
change.

## 11. Troubleshooting 🔧

**"The Page token is invalid or expired."** The token was short-lived. Set
`FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` and run `login` again.

**"The token is missing a permission."** Regenerate with all five permissions.
Missing `pages_read_engagement` is the usual one, and it breaks reading rather
than writing, which makes it confusing.

**"That token can see no Pages."** Missing `pages_show_list`, or you are not an
admin of any Page.

**Posting refuses.** That is the default. Set `FACEBOOK_ALLOW_WRITE=true`.

**Anything else.** Run `doctor`. It checks each Page and reports the first
broken link.

Full setup walkthrough: [INSTALL.md](INSTALL.md).

## FAQ ❓

<details>
<summary><strong>What is an MCP server?</strong></summary>

Model Context Protocol is a standard way to give an AI assistant access to a
tool or a data source. An MCP server exposes a set of functions, and a client
like Claude Code or Claude Desktop calls them during a conversation. This one
exposes Facebook Pages.

You install it once, point your client at it, and then ask in plain language.
You never call the tools yourself.

</details>

<details>
<summary><strong>Why do I have to create a Meta app? That seems like a lot.</strong></summary>

Because Facebook has no other way to issue a token. There are no app passwords
and no personal access tokens, so every credential is minted by an app someone
owns. For a personal tool, that someone is you.

It is free, takes about ten minutes, and only happens once. Nothing is
reviewed, nothing is published, and nobody else sees the app.

</details>

<details>
<summary><strong>Will this get my Page banned?</strong></summary>

No. This is Meta's own API used the way Meta intends. The account risk that
exists on Instagram's unofficial API, or on WhatsApp's companion protocol, does
not apply here.

The real limit is rate limiting, which is per app rather than per Page. Heavy
automated use across several Pages shares one budget.

</details>

<details>
<summary><strong>What data does it store, and where?</strong></summary>

One file, `~/.facebook-mcp/pages.json`, written mode 600. It holds your Page
ids and their tokens, nothing else.

No posts, no comments and no insights are stored. Everything is fetched live
and passed straight to your client, so there is no local copy of your content.

If you set `FACEBOOK_AUDIT_LOG`, every attempted write is appended to that file
as well.

</details>

<details>
<summary><strong>Does it cost anything?</strong></summary>

No. The Graph API is free for this, the Meta app is free, and there is no
paid tier involved. You pay for whatever AI client you use, and nothing else.

</details>

<details>
<summary><strong>Why is the package name not just "facebook-mcp"?</strong></summary>

npm names are first come, first served, and unscoped ones go quickly. Scoped
packages like `@thenavidm/facebook-mcp` avoid the scramble and make it obvious
who published it, which matters for something that holds credentials.

</details>

<details>
<summary><strong>Can I use it with several Pages?</strong></summary>

Yes. `login` stores every Page you administer, and each tool takes a `page`
argument. Set `FACEBOOK_PREFERRED_PAGES` so an unnamed action lands somewhere
predictable rather than on whichever was stored first.

</details>

<details>
<summary><strong>Do I need App Review?</strong></summary>

No, not for your own Pages. App Review and Business Verification are for
managing Pages belonging to other people, which Meta calls Advanced Access. For
Pages you administer, Standard Access is enough and is granted the moment you
request it.

</details>

<details>
<summary><strong>Can it post to my personal profile?</strong></summary>

No, and neither can anything else. Facebook removed profile posting from the
API in 2018 and never brought it back. Pages are the only writable surface.

</details>

<details>
<summary><strong>Is this an unofficial API?</strong></summary>

No. It is Meta's official Graph API, the same one their own tools use. Nothing
is reverse engineered and your account is not at risk.

</details>

<details>
<summary><strong>Do the tokens expire?</strong></summary>

Page tokens derived from a long-lived user token do not expire at all. Without
your app id and secret, login can only produce short-lived ones that die in
about an hour, which is the most common reason this stops working.

</details>

<details>
<summary><strong>Can it schedule posts?</strong></summary>

Yes, natively. Facebook holds the post and publishes it itself, so nothing has
to be running on your machine at the time. Real drafts too.

</details>

<details>
<summary><strong>Will it post something without me knowing?</strong></summary>

It cannot post at all unless you set `FACEBOOK_ALLOW_WRITE=true`. With that on
it can, so set `FACEBOOK_AUDIT_LOG` and every attempt is written to a file no
tool can edit.

</details>

<details>
<summary><strong>Does one Meta app cover Instagram and Threads too?</strong></summary>

Yes. The same app can carry all three sets of permissions, so add those
products now if you plan to use them rather than creating three apps.

</details>

<details>
<summary><strong>Can it read comments and reply?</strong></summary>

Yes, both, and it can hide comments, which is reversible and the right answer
for spam. Deleting is possible but needs a separate switch.

</details>

## Questions

Run into a problem or have a question? [Open an issue](https://github.com/thenavidm/facebook-mcp/issues) and I will help.

## About the author

Navid Moazzez is a leading AI business strategist, and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. He creates useful free tools, MCP servers and CLIs that creators and founders can use in their own workflows.

**Links**

- Personal website: [navid.me](https://navid.me?utm_source=github&utm_medium=readme&utm_campaign=facebook-mcp)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

If this is useful, star the repo and come say hi on [X](https://x.com/thenavidm).

## License

[MIT](./LICENSE). Free to use, modify, and share.

Not affiliated with, endorsed by, or connected to Meta Platforms, Inc.

---

© 2026 [Navid Media](https://navid.media?utm_source=github&utm_medium=referral&utm_campaign=facebook-mcp&utm_content=readme). Made with ❤️ by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=facebook-mcp&utm_content=readme).
