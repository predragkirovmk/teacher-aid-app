# Vendored skills

Third-party Claude Code skills live here so that every Claude session on this repo (on a
laptop or in the cloud) has them without installing anything: the SEO and GEO packs below, and
`/lemo-opuscar` for films ([its own section](#lemo-opuscar-films-made-in-code)).

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

## Lemo-Opuscar: films made in code

| Skill | Version | Licence |
|---|---|---|
| [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | main at `bebbbe1` (2026-11-01) | MIT, `lemo-opuscar/LICENSE` |

Directs and renders a short film (voice, music, animation, mix) in one of the library's 66
styles. It is a copy of upstream `plugin/skills/lemo-opuscar/`, unchanged, plus the repo's
`LICENSE`. It is the same skill the upstream plugin installs (`lemo-opuscar@lemolab`), but
here it is called as `/lemo-opuscar`.

- **The library is not vendored.** On first use the skill clones it (about 30 MB, sparse) into
  `~/lemo-opuscar` and updates it on later runs. A cloud session downloads it again each time.
- **Packages.** `sh .claude/skills/lemo-opuscar/scripts/setup.sh deps` installs the Node
  packages, a headless Chromium and a Python venv, all inside `~/lemo-opuscar`. It takes a few
  minutes the first time.
- **System tools it needs:** Node 20+, Python 3.11+ (or uv) and **ffmpeg 7+**. The cloud
  container ships ffmpeg 6.1, which is too old. Install a static ffmpeg 7 build before the first
  render.
- **Where films go.** Each film is a `<name>/` folder in the directory the session started
  from. Don't commit film folders or renders to this repo. Move a finished film to wherever
  pitch material lives.

To update it, copy `plugin/skills/lemo-opuscar/` from a fresh clone over this folder, bump the
commit above, and review the diff.
