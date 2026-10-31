#!/usr/bin/env bash
# Vendors claude-seo and geo-seo-claude into .claude/, mirroring each project's own installer,
# with every path rewritten to be relative to the repo root. Usage:
#   bash scripts/vendor-seo-skills.sh <claude-seo checkout> <geo-seo-claude checkout> .claude
set -euo pipefail
SEO=$1; GEO=$2; DEST=$3
S=$DEST/skills; A=$DEST/agents
mkdir -p "$S" "$A"

# ---- claude-seo (mirrors install.sh v2.5.0) ----
mkdir -p "$S/seo"
cp -r "$SEO/skills/seo/." "$S/seo/"
for d in "$SEO"/skills/*/; do n=$(basename "$d"); [ "$n" = seo ] && continue; mkdir -p "$S/$n"; cp -r "$d." "$S/$n/"; done
for sub in schema data scripts hooks; do [ -d "$SEO/$sub" ] && { mkdir -p "$S/seo/$sub"; cp -r "$SEO/$sub/." "$S/seo/$sub/"; }; done
cp "$SEO/agents/"*.md "$A/"
for ext in "$SEO"/extensions/*/; do
  e=$(basename "$ext")
  [ -d "${ext}skills" ] && for es in "${ext}skills"/*/; do n=$(basename "$es"); mkdir -p "$S/$n"; cp -r "$es." "$S/$n/"; done
  [ -d "${ext}agents" ] && cp "${ext}agents/"*.md "$A/" 2>/dev/null || true
  for sub in references scripts; do [ -d "${ext}$sub" ] && { mkdir -p "$S/seo/extensions/$e/$sub"; cp -r "${ext}$sub/." "$S/seo/extensions/$e/$sub/"; }; done
done
cp "$SEO/requirements.txt" "$S/seo/requirements.txt"
cp "$SEO/.claude-plugin/plugin.json" "$S/seo/runtime-plugin.json"
cp "$SEO/LICENSE" "$S/seo/LICENSE"
chmod +x "$S/seo/scripts/claude-seo"

# ---- geo-seo-claude (mirrors install.sh) ----
mkdir -p "$S/geo"
cp -r "$GEO/geo/." "$S/geo/"
for d in "$GEO"/skills/*/; do n=$(basename "$d"); mkdir -p "$S/$n"; cp -r "$d." "$S/$n/"; done
cp "$GEO/agents/"*.md "$A/"
for sub in scripts schema templates; do mkdir -p "$S/geo/$sub"; cp -r "$GEO/$sub/." "$S/geo/$sub/"; done
cp "$GEO/requirements.txt" "$S/geo/requirements.txt"
cp "$GEO/LICENSE" "$S/geo/LICENSE"
find "$S/geo/scripts" -name '__pycache__' -prune -exec rm -rf {} +

# ---- path rewrites in markdown (skills + agents) ----
PY_GEO='.claude/skills/geo/.venv/bin/python3'
find "$S" "$A" -type f -name '*.md' -print0 | while IFS= read -r -d '' f; do
  sed -i \
    -e 's#\${CLAUDE_PLUGIN_ROOT}/scripts/claude-seo#.claude/skills/seo/scripts/claude-seo#g' \
    -e 's#\${CLAUDE_PLUGIN_ROOT}/skills/#.claude/skills/#g' \
    -e "s#python3 ~/\\.claude/skills/geo/scripts/#${PY_GEO} .claude/skills/geo/scripts/#g" \
    -e "s#python3 -c #${PY_GEO} -c #g" \
    -e "s#python3 -m #${PY_GEO} -m #g" \
    -e 's#~/\.claude/skills/#.claude/skills/#g' \
    -e 's#~/\.claude/agents/#.claude/agents/#g' \
    "$f"
done
