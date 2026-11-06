# Vendored SEO and GEO skills

Two third-party Claude Code skill packs live here so that every Claude session on this repo
(on a laptop or in the cloud) has `/seo` and `/geo` without installing anything.

| Pack | Version | Skills | Licence |
|---|---|---|---|
| [claude-seo](https://github.com/AgriciDaniel/claude-seo) | v2.5.0 (`219ff48`) | `seo`, `seo-*` | MIT, `seo/LICENSE` |
| [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) | main at `989cae0` (2026-10-31) | `geo`, `geo-*` | MIT, `geo/LICENSE` |

Their subagents are in `.claude/agents/` (`seo-*.md`, `geo-*.md`).

## Setup, once per machine

```bash
bash scripts/seo-skills-setup.sh
```

This creates one Python venv inside each pack (`.claude/skills/seo/.venv`,
`.claude/skills/geo/.venv`), both gitignored.

## How this copy differs from upstream

Only the paths. The upstream installers copy into `~/.claude` and rewrite paths to it. Here,
every path in the Markdown is relative to the repository root (`.claude/skills/...`), so run
the commands from the root. geo's inline Python goes through its own venv
(`.claude/skills/geo/.venv/bin/python3`). The claude-seo runtime note in `seo/SKILL.md` was
reworded to match. Nothing else was changed.

## Which advice to trust when the packs disagree

They were tested against each other on 2026-10-31. Where one contradicts Google's published
guidance, Google wins:

- **No FAQPage schema.** Google retired FAQ rich results on 2026-05-07.
- **No HowTo and no `speakable`.**
- **No word-count targets for passages.**
- **`llms.txt` is optional.** Google Search ignores it.
- **No Wikipedia article** until independent coverage exists.

The full verdict, and what was built from it, is in the TeacherAid brain at
`Areas/website/seo-geo-plan.md`.

## Updating

Re-run `scripts/vendor-seo-skills.sh` against fresh clones of both repos, at the tag you want.
Then review the diff.
