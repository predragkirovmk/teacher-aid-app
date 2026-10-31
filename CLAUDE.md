@AGENTS.md

## Backend handoff

The backend developer builds the API from two documents in the TeacherAid brain:
`~/Desktop/teacher-aid-brain/Areas/product/backend-handoff/backend-spec-for-agents.md` and
`backend-guide-for-developer.md` next to it. When a change here alters what the API must provide
(a new field, screen, flow, state or rule), update both documents in the brain in the same
session, following the rule in `~/Desktop/teacher-aid-brain/CLAUDE.md`. Mock data in `/app` is
never a source for them.

## SEO and GEO skills

`/seo` (claude-seo) and `/geo` (geo-seo-claude) are vendored in `.claude/skills/`. Run their
commands from the repo root; set up their Python runtimes once with
`bash scripts/seo-skills-setup.sh`. Where the two packs disagree, follow
`.claude/skills/README.md`.
