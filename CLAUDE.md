# CLAUDE.md

## Project Overview

`storyboards-cli` is a Node.js/TypeScript CLI tool that generates HTML presentations from Markdown files. It supports theme importing from SVG/PDF, AI-powered diagram generation via Claude Code, and a watch mode with live reload.

## Development Workflow

```bash
npm run build   # tsc + chmod +x dist/index.js
npm link        # register `storyboards` command globally
storyboards build slides.md --theme my-theme --out dist --open
storyboards build slides.md --theme my-theme --out dist --open --watch
```

## Repository Conventions

- Branch naming: `feature/xxx` for features, `fix/xxx` for bug fixes
- Always create a PR — do not push directly to `main`
- Commit messages in English
- `inputs/`, `plan.md`, `DESIGN_PROCESS.md` are not tracked by git (local work files)

## Architecture

```
src/
  index.ts              # CLI entry point
  commands/
    build.ts            # build / watch command
    theme.ts            # theme import/list/use/validate
    config.ts           # config show/set
  core/
    types.ts            # all shared interfaces
    markdown.ts         # Markdown parser → Slide[]
    build.ts            # build orchestrator
    renderer.ts         # HTML/CSS/JS generation (includes inline JS for runtime layout)
    theme.ts            # theme loading and SVG/PDF import
    visual.ts           # AI visual generation via claude CLI subprocess
    config.ts           # config file management
  utils/
    log.ts fs.ts hash.ts path.ts
  builtin-themes/simple/theme.json
```

### Key Data Flow

```
Markdown file
  → parseMarkdown()       # gray-matter frontmatter + slide blocks
  → runBuild()            # theme resolution, visual generation, asset copy
  → renderPresentation()  # HTML + CSS + inline JS (app.js)
  → dist/index.html
```

### Slide Types

| Markdown | Type | Notes |
|---|---|---|
| First `# ` | `title` | title + subtitle |
| Subsequent `# ` | `section` | section break |
| `## ` | `content` | eyebrow + title + body + visual |

### Markdown Extensions

```markdown
---
title: My Presentation
theme: my-theme
fontSize: large          # global font scale (small/large/xlarge/numeric)
---

## Slide Title {center fill size=large}   # per-slide attributes

> Eyebrow label

Body text, bullet lists, tables supported.

!visual: one-line diagram prompt
:::visual type=diagram
multi-line prompt
:::
```

### Theme System

Themes live in `~/.config/storyboards-cli/themes/<name>/`:
- `theme.json` — layout slots, tokens, fixedElements, visualRegion
- `assets/` — background PNGs, logo PNG

Slot coordinates are expressed as percentages of the 16:9 slide area.

### Runtime Layout (renderer.ts inline JS)

`app.js` is generated inline in `renderer.ts → buildJS()`. It handles:
- Slide navigation (keyboard + touch)
- `fitBodyText()` — applies font scale, shrinks on overflow
- `fitTable()` — fills slot height; uses `getBoundingClientRect` for margin-aware measurement; shrinks font before setting row heights (because `<table>/<tr> height` acts as `min-height` in browsers)
- Live reload polling (`reload.json`) when `--watch` is active

### AI Visual Generation

`visual.ts` spawns `claude --print --output-format text` with the prompt via stdin. Results are cached in `~/.cache/storyboards-cli/visuals/` keyed by SHA-256 of (title + type + prompt + theme tokens). Timeout is 300 seconds. Watch mode skips AI generation and uses cached results only.

## Important Constraints

- `dist/` is not committed — always run `npm run build` before testing
- `inputs/` is not committed — contains local SVG templates and sample Markdown
- The `inputs/slides.md` file is used for manual testing; it may reference a `my-theme` that only exists locally
- Do not commit `plan.md` or `DESIGN_PROCESS.md`
