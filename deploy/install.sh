#!/usr/bin/env bash
# Install facebook-mcp from source and register it with Claude Code.
#
# For the npm route, or any other client, see the README. This exists for the
# case the README cannot cover in one paste: a clone, a build, and a client
# pointed at an absolute path.
set -euo pipefail

REPO="${FACEBOOK_MCP_REPO:-https://github.com/thenavidm/facebook-mcp-cli.git}"
DIR="${FACEBOOK_MCP_DIR:-$HOME/.local/share/facebook-mcp}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }
}

need git
need node
need npm

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  echo "Node 20 or newer is required. Found $(node -v)." >&2
  exit 1
fi

if [ -d "$DIR/.git" ]; then
  echo "==> updating $DIR"
  git -C "$DIR" pull --ff-only
else
  echo "==> cloning into $DIR"
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 "$REPO" "$DIR"
fi

echo "==> building"
cd "$DIR"
npm ci
npm run build

echo
echo "Installed at $DIR"
echo
echo "Register it with Claude Code:"
echo "  claude mcp add --transport stdio facebook -- node $DIR/dist/index.js"
echo
echo "Then connect a Page:"
echo "  node $DIR/dist/index.js login <user access token>"
echo
echo "Writing is off by default. To allow posting, add:"
echo "  --env FACEBOOK_ALLOW_WRITE=true"
