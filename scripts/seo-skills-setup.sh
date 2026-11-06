#!/usr/bin/env bash
# Creates the Python runtimes for the vendored SEO/GEO skill packs in .claude/skills.
# Run once per machine (or per cloud session) from anywhere in the repo:
#   bash scripts/seo-skills-setup.sh
# Each pack gets its own venv inside its folder; nothing touches system Python. Both are
# gitignored. Needs Python 3.11+.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"

echo "claude-seo: creating its managed runtime (this also fetches Chromium for screenshots)"
status=0
.claude/skills/seo/scripts/claude-seo setup || status=$?
# 10 means the core runtime is ready and only the Chromium download failed.
if [ "$status" -ne 0 ] && [ "$status" -ne 10 ]; then
  echo "claude-seo setup failed (exit $status)" >&2
  exit "$status"
fi

echo "geo-seo-claude: creating .claude/skills/geo/.venv"
python3 -m venv .claude/skills/geo/.venv
.claude/skills/geo/.venv/bin/python3 -m pip install --quiet --disable-pip-version-check -r .claude/skills/geo/requirements.txt

echo "Done. In Claude Code: /seo audit https://teacheraid.education or /geo audit https://teacheraid.education"
