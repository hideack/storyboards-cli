# storyboards-cli

A CLI tool that generates HTML presentations from Markdown files.

---

## Features

- Write Markdown files to generate slides automatically
- Switch appearances with themes
- Import custom themes from SVG files (recommended)
- Import themes from PDF files (experimental)
- Use `visual` syntax to specify diagram insertion points
- Auto-generate diagrams via Claude Code with the `--ai visual` option
- Generated HTML has no external dependencies — open directly in a browser
- Watch mode (`--watch`) for live reloading during editing

---

## Installation

### Install from repository

```bash
git clone https://github.com/hideack/storyboards-cli.git
cd storyboards-cli
npm install
npm run build
npm link
```

After installation, the `storyboards` command becomes available.

### Requirements

- Node.js 18 or later

---

## Initial Setup

When you run the `storyboards` command for the first time, the following setup is performed automatically:

1. Create config file: `~/.config/storyboards-cli/config.json`
2. Create theme directory: `~/.config/storyboards-cli/themes/`
3. Install the built-in theme `simple`

No manual setup is required. Just run any command to trigger initialization.

```bash
storyboards --help
```

---

## build command

Generates an HTML presentation from a Markdown file.

### Basic usage

```bash
storyboards build slides.md
```

By default, the following files are generated in the `storyboards-dist/` directory:

```
storyboards-dist/
  index.html
  styles.css
  app.js
  assets/
```

Open `index.html` in a browser to view the presentation.

### Options

| Option | Description | Default |
|---|---|---|
| `--theme <name>` | Theme name to use | `defaultTheme` in config |
| `--out <dir>` | Output directory | `storyboards-dist` |
| `--open` | Open in browser after build | false |
| `--strict` | Treat warnings as errors and exit non-zero | false |
| `--ai visual` | Auto-generate visual diagrams via Claude Code | disabled |
| `--watch` | Watch for file changes and rebuild automatically | false |

### Examples

```bash
# Build with a specific theme
storyboards build slides.md --theme my-corp

# Specify output directory
storyboards build slides.md --out ./output

# Build and open in browser immediately
storyboards build slides.md --open

# Generate AI visual diagrams
storyboards build slides.md --ai visual

# Watch mode with live reload
storyboards build slides.md --open --watch

# Strict build for CI
storyboards build slides.md --strict
```

### Theme resolution order

1. `--theme` option
2. `theme` key in Markdown frontmatter
3. `defaultTheme` in config

---

## Writing Markdown

### Frontmatter

You can write YAML frontmatter at the top of the file.

```markdown
---
title: My Presentation
theme: my-corp
---
```

### Slide splitting rules

| Markdown syntax | Slide type |
|---|---|
| First `# ` | title slide |
| Second and later `# ` | section slide |
| `## ` | content slide |

### Example

```markdown
---
title: Q4 2024 Strategy
theme: simple
---

# Q4 2024 Strategy

Example Corp.

# Introduction

## Background

> Category: Market Analysis

The market environment has changed significantly this quarter.

- New competitors entering the market
- Diversifying user needs
- Accelerating technology trends

## Challenges and Responses

We will implement the following measures:

1. Review product lineup
2. Refresh marketing strategy
3. Improve development process
```

### Eyebrow label

Writing `> text` at the beginning of a content slide displays a small label at the top of the slide.

```markdown
## Slide Title

> Category Name
```

### Text alignment and font size

You can add `{...}` attributes to the heading line to control per-slide text behavior.

```markdown
## Centered Slide {center}
This text will be center-aligned.

## Fill Slide {fill}
Short text is displayed as large as possible.

## Both {center fill}
Center-aligned and maximized font size.
```

| Attribute | Description |
|---|---|
| `center` | Center-align body text |
| `fill` | Expand font size to fill available space |

---

## visual syntax

You can specify diagram placement and instructions within a slide.

### Inline form

```markdown
## Three Loop Structure

The business model consists of three loops.

!visual: Show the three loop structure as a relationship diagram
```

### Block form

Use block form for more detailed instructions.

```markdown
## Growth Strategy

:::visual type=diagram
Three loops — sales, operations, and cash —
connected through a central sales/payment hub.
Place "Sales/Payment" at the center.
:::
```

### Supported visual types

| type | Use case |
|---|---|
| `auto` | Auto-detect (default) |
| `diagram` | Relationship / concept diagrams |
| `flow` | Flow / step diagrams |
| `compare` | Comparison / contrast |
| `chart` | Graphs / proportions / trends |

### Without `--ai visual`

If `--ai visual` is not specified, a fallback placeholder is inserted at the visual position.

### Using `--ai visual`

Requires Claude Code to be installed and the `claude` command to be available.

```bash
storyboards build slides.md --ai visual
```

Generated visuals are saved as `assets/slide-XX-visual.svg` and embedded in the HTML. Results are cached at `~/.cache/storyboards-cli/visuals/`.

---

## theme command

### List themes

```bash
storyboards theme list
```

The default theme is marked with `*`.

### Set default theme

```bash
storyboards theme use my-corp
```

### Show theme details

```bash
storyboards theme show simple
```

### Validate a theme

```bash
storyboards theme validate my-corp
```

### theme import (SVG)

Import a custom theme from SVG files. **SVG import is the recommended method.**

```bash
storyboards theme import \
  --name my-corp \
  --title title.svg \
  --section section.svg \
  --content content.svg
```

The following are automatically generated from the SVG:

- `theme.json` (layout information is auto-detected)
- Background images under `assets/`

After importing, activate with:

```bash
storyboards theme use my-corp
```

#### Recommended SVG specification

Specify text placement areas using `<path>` elements with `fill-opacity="0"`. storyboards-cli uses the coordinates of these transparent paths to estimate text slot layouts.

| Order (top to bottom) | Slot |
|---|---|
| title slide: 1st transparent path | title |
| title slide: 2nd transparent path | subtitle |
| content slide: 1st | eyebrow |
| content slide: 2nd | title |
| content slide: 3rd | body |
| content slide: 4th | visual region |

### theme import (PDF) [experimental]

You can import a theme from a PDF template. Note that **PDF import is an experimental feature**.

```bash
storyboards theme import \
  --name my-corp-pdf \
  --pdf template.pdf
```

- Layout information cannot be accurately extracted from PDF; default layout is applied
- Complex designs are not supported
- Manually adjust `theme.json` as needed
- The `kind` field in `theme.json` will be `"imported-pdf-theme"`

---

## config command

### Show config

```bash
storyboards config show
```

### Set config values

```bash
# Change theme directory
storyboards config set themeDirectory /path/to/my-themes

# Change default theme
storyboards config set defaultTheme my-corp
```

Configurable keys:

| Key | Description |
|---|---|
| `themeDirectory` | Path to the directory containing themes |
| `defaultTheme` | Default theme name |

---

## Slide navigation

Open the generated `index.html` in a browser and use the following controls:

| Input | Action |
|---|---|
| `→` / `↓` / Space | Next slide |
| `←` / `↑` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| Swipe (touch) | Navigate slides |

---

## Directory structure (for developers)

```
storyboards-cli/
├── src/
│   ├── commands/        # CLI command definitions
│   │   ├── build.ts
│   │   ├── theme.ts
│   │   └── config.ts
│   ├── core/            # Core logic
│   │   ├── config.ts    # Config management
│   │   ├── theme.ts     # Theme management & import
│   │   ├── build.ts     # Build orchestrator
│   │   ├── markdown.ts  # Markdown parser
│   │   ├── visual.ts    # AI visual generation
│   │   ├── renderer.ts  # HTML/CSS/JS generation
│   │   └── types.ts     # Type definitions
│   ├── utils/           # Utilities
│   │   ├── fs.ts
│   │   ├── log.ts
│   │   ├── hash.ts
│   │   └── path.ts
│   ├── builtin-themes/
│   │   └── simple/
│   │       └── theme.json
│   └── index.ts         # CLI entry point
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

MIT
