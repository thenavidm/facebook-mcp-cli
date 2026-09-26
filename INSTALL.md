# Install

Facebook has no app passwords and no personal access tokens. Every credential
is issued through a Meta app you create yourself, and Page tokens are derived
from a user token you generate inside it. That is a real setup step, and it is
the part worth writing down properly.

About ten minutes, once.

## Prerequisites

Node 20 or newer, and at least one Facebook Page you administer.

You do **not** need App Review, and you do **not** need Business Verification.
Those are only required to manage Pages belonging to other people. Meta calls
that Advanced Access. For your own Pages, Standard Access is enough, and it is
granted the moment you create the app.

## 1. Create the Meta app

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
   and click **Create app**.
2. Enter a name and contact email, then **Next**.
3. On the **Use cases** screen, tick **Manage everything on your Page**.

   That single use case covers publishing, reading posts and insights, and
   moderating comments. There is no separate "Pages API" option.

   Older guides say to pick "Other" and then an app type of "Business". Those
   options no longer exist. Meta reorganized app creation around use cases, and
   most tutorials online still describe the old screen.

## 2. Add the permissions

Open **App Review**, then **Permissions and Features**, and request Standard
Access for each of these. Standard Access is granted immediately, with no
review.

| Permission | What it is for |
|---|---|
| `pages_show_list` | Seeing which Pages you administer. Without it, login finds nothing |
| `pages_read_engagement` | Reading posts, comments, followers and Page metadata |
| `pages_manage_posts` | Creating, editing and deleting posts |
| `pages_manage_engagement` | Replying to, hiding and deleting comments |
| `read_insights` | Impressions, reach and engagement numbers |

The one people miss is `pages_read_engagement`. It sounds like a write
permission and is not: leave it out and reading breaks while posting still
works, which is a confusing way to fail.

## 3. Generate a user token

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Pick your app in the top right.
3. Under **Permissions**, add the five above.
4. Click **Generate Access Token** and approve the dialog.
5. Copy the token.

That token expires in about an hour. It does not matter: it is only used once,
to derive Page tokens.

## 4. Exchange it for Page tokens

```bash
npx @thenavidm/facebook-mcp-cli login <that token>
```

This writes `~/.facebook-mcp/pages.json`, mode 600, with one token per Page you
administer.

## 5. Make the Page tokens permanent

By default the Page tokens inherit the hour-long life of the user token they
came from, which is the single most common reason this stops working a day
later.

To get tokens that never expire, give login your app credentials so it can
extend the user token first:

```bash
export FACEBOOK_APP_ID=...
export FACEBOOK_APP_SECRET=...
npx @thenavidm/facebook-mcp-cli login <that token>
```

Both are on your app's **Settings**, then **Basic**.

With those set, the chain is: short user token, long-lived user token, Page
tokens that do not expire. Meta documents this as the standard way to obtain
permanent Page access.

## 6. Check it

```bash
npx @thenavidm/facebook-mcp-cli doctor
```

It names every Page it can reach. If something is wrong, it says which link in
the chain broke rather than repeating Meta's error, which rarely says.

## Allowing writes

Reading works as soon as a Page is connected. Posting does not:

```bash
FACEBOOK_ALLOW_WRITE=true
```

Deleting needs a second switch, because it cannot be undone:

```bash
FACEBOOK_ALLOW_DELETE=true
```

## Troubleshooting

**"That token can see no Pages."** `pages_show_list` is missing, or you are not
an admin of any Page.

**"The token is missing a permission."** Regenerate with all five. Missing
`pages_read_engagement` is the usual culprit.

**It worked yesterday and does not today.** The tokens were short-lived. Set
`FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` and run login again.

**Posting refuses.** That is the default. Set `FACEBOOK_ALLOW_WRITE=true`.
