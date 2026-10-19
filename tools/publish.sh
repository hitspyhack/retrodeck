#!/usr/bin/env bash
# Publish this repository to a GitHub repository you created by hand.
#
#   GH_TOKEN=github_pat_… tools/publish.sh <owner> [repo] [branch]
#   npm run github:push -- <owner>                     # same thing via npm
#
# <repo> defaults to "retrodeck", <branch> to "main".
#
# Why this exists rather than `git push`: a machine with no credential helper and
# no gh CLI (a sandbox, a CI box, a borrowed laptop) still has to be able to
# publish, and the obvious ways of doing it with a token leave the token on disk.
# So:
#   - the token comes from GH_TOKEN and nowhere else - never an argument (it would
#     land in shell history and in `ps`), never a file, never .git/config;
#   - it travels as an Authorization header, so it cannot appear in a redirect or
#     in a git error message that quotes the remote URL;
#   - the remote is configured with `git -c` for the one command, so afterwards
#     `git remote -v` still shows nothing (or only the origin you set yourself);
#   - a dirty tree stops the run: publishing something you have not committed
#     means the site and the source disagree and nobody can tell which is wrong.
#
# A fine-grained personal token needs, on that one repository: **Contents: Read
# and write**. It cannot *create* the repository - github.com/new takes ten
# seconds, do that first.
#
# After a successful push, GitHub Pages needs one decision, and both answers are
# correct:
#   Settings ▸ Pages ▸ Source ▸ "Deploy from a branch", branch main, folder /
#     → the repository root is served as it is. Nothing to build; the app uses
#     relative URLs, so a project page under /<repo>/ works. Cores run
#     single-threaded, because Pages cannot set response headers.
#   Settings ▸ Pages ▸ Source ▸ "GitHub Actions"
#     → .github/workflows/ci.yml publishes dist/ (the audited deploy folder) on
#     every merge to main, and its `pages` job says in its run summary when it
#     skipped because this setting had not been switched yet.
# Either way COOP/COEP (threads) have to come from Netlify/Cloudflare/Vercel or
# your own server - see docs/DEPLOYING.md.
set -euo pipefail

: "${GH_TOKEN:?export GH_TOKEN first (a fine-grained token with Contents: read+write on the target repo)}"
OWNER="${1:?usage: tools/publish.sh <owner> [repo] [branch]}"
REPO="${2:-retrodeck}"
BRANCH="${3:-main}"

# the repository root, whatever the caller's working directory was
SRC=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$SRC"

if [ ! -d .git ]; then
  echo "$SRC is not a git repository" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "working tree is not clean; commit or stash first" >&2
  git status --short | head -20 >&2
  exit 1
fi

SHA=$(git rev-parse --short "$BRANCH")
COUNT=$(git rev-list --count "$BRANCH")
FILES=$(git ls-files | wc -l | tr -d ' ')
echo "publishing $SRC"
echo "  branch  $BRANCH @ $SHA ($COUNT commit(s), $FILES files)"
echo "  target  https://github.com/$OWNER/$REPO"

AUTH="Authorization: Basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"

# --atomic: either every ref lands or none does, so a half-pushed repository
# cannot be the state a browser shows you. --force is here because this repo's
# history is the source of truth and the target is usually empty; if the target
# has commits of its own that are not descendants, git refuses anyway and you
# should merge on the hub instead of reaching for --force-with-lease.
git -c credential.helper= -c "http.extraHeader=$AUTH" \
  push --atomic --force "https://github.com/$OWNER/$REPO.git" "$BRANCH:$BRANCH"

echo
echo "verifying the remote really has it:"
git -c "http.extraHeader=$AUTH" ls-remote "https://github.com/$OWNER/$REPO.git" "refs/heads/$BRANCH"

echo
echo "done - https://github.com/$OWNER/$REPO"
echo "site (once Pages has built): https://$OWNER.github.io/$REPO/"
echo "if the token was typed in this shell session, revoke it now."
