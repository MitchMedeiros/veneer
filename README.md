# Veneer

Veneer is a Claude Code mod that enhances the overall look and feel of the terminal. It uses the built-in Claude Code
theming system for nearly everything. It adds customizable syntax highlighting for over 100 languages, using any theme
on [Open VSX](https://www.open-vsx.org/search?q=themes&category=Themes&sortBy=downloadCount) or any theme in VS Code
theme format. Furthermore, it can display attached and read images in the chat.

## Table of Contents

- [Installing](#installing)
- [Terminal Setup](#terminal-setup)
  - [Image Support](#image-support)
  - [Nerd Font Icons](#nerd-font-icons)
  - [Rio](#rio)
  - [tmux](#tmux)
- [Syntax Highlighting](#syntax-highlighting)
- [General Settings](#general-settings)
  - [Collapsing edits](#collapsing-edits)
  - [Copying](#copying)
  - [Alerts](#alerts)
  - [Diagrams and charts](#diagrams-and-charts)
  - [Math](#math)
- [Supported Languages and File Types](#supported-languages-and-file-types)
- [Contributing](#contributing)

## Installing

Use the following slash commands inside Claude Code (requires Claude Code>=2.1.287):

```
/plugin marketplace add mitchmedeiros/veneer
```

```
/plugin install veneer@veneer
```

Or do both in one command from your shell (requires Claude Code>=2.1.292):

```
claude plugin install veneer --marketplace mitchmedeiros/veneer
```

## Terminal Setup

Veneer works in any terminal. The sections below cover optional setup for specific terminals and features.

### Image Support

To see diagrams and tables as images, and image previews in messages, you need:

- kitty, Ghostty, a [libghostty-based terminal](https://github.com/Uzaaft/awesome-libghostty#terminal-apps--clients), or
  Rio
- [resvg](https://github.com/linebender/resvg) installed

This is a limitation of how Claude Code displays images.

### Nerd Font Icons

If you want Nerd Font icons rather than Unicode, either use a terminal that ships with them built in or
[install them](https://github.com/ryanoasis/nerd-fonts#font-installation). If you still see Unicode symbols in Claude
Code, enable the icons with `/veneer icons nerd`.

### Rio

Launch Claude Code with `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` to display images in Rio. In my testing, pictures look
small with the default `cellRatio`, and a value of `1.9` fits better. Run `/veneer cell-proportion 1.9` or change it in
the settings pane.

### tmux

For images in tmux, run `tmux set -g allow-passthrough on` (tmux>=3.3a). Then start Claude Code with
`CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` and run `/veneer text-based graphics off`.

## Syntax Highlighting

Run `/syntax` to pick a theme. It lists every theme file in `~/.claude/veneer/themes/`.

To add a new theme, either choose `Browse popular themes` to download one of the 50 most popular, or choose
`New custom theme` and provide:

- the page URL or `publisher.name` for a theme on [Open VSX](https://open-vsx.org)
- a path to a local theme file

If a theme on Open VSX has multiple variants (e.g. light, dark), you will be asked to choose one.

## General Settings

Run `/veneer` to change every option below in one pane. It has a General tab and a Syntax tab.

To change a setting without opening the pane, run `/veneer <setting> <value>`, such as `/veneer icons nerd`. The setting
can be either its display name or its option name, in any case: `/veneer cell-proportion 1.9` and
`/veneer cellRatio 1.9` do the same thing. Switches take `on` or `off`, and are stored as `true` or `false` in
`settings.json`.

| Display Name            | Setting            | Default  | Use                                                           |
| ----------------------- | ------------------ | -------- | ------------------------------------------------------------- |
| Message alignment       | `messageAlign`     | `left`   | `left` or `right`                                             |
| Tool spacing            | `toolSpacing`      | `low`    | `low`, `medium` or `high`. Room around blocks and tools.      |
| Block width             | `blockWidth`       | `fitted` | `fitted` or `full`. Fitted blocks are only as wide as needed. |
| Block borders           | `blockBorders`     | `on`     | Border around blocks and cards. Alerts always keep theirs.    |
| Syntax theme background | `syntaxBackground` | `on`     | Fill code, reads, output and diffs with the theme background. |
| Edit line counts        | `changeStyle`      | `text`   | `text`, `rounded` or `square`. How `+N -M` is drawn.          |
| Table font              | `fontFamily`       | blank    | Font for tables and headings. Blank uses defaults.            |
| Cell proportion         | `cellRatio`        | `2.9`    | Terminal cell height over width. Fixes letterboxing.          |
| Icons                   | `icons`            | `auto`   | `auto`, `nerd` or `plain`. Nerd Font or Unicode icons.        |
| File links              | `links`            | `auto`   | `auto`, `link` or `text`. How file paths are drawn.           |
| Text-based graphics     | `nativeGraphics`   | `off`    | Draw tables, headings and Mermaid diagrams as text.           |
| Images                  | `images`           | `on`     | Draw images from Read, MCP tools and prompts under their row. |
| Image height            | `imageRows`        | `14`     | The most terminal rows an image takes, from 2 to 250.         |
| Diagram hint            | `diagramHint`      | `on`     | Off stops Claude from using diagrams, math and alerts.        |
| Message styling         | `styleUserMessage` | `on`     | Draw your messages as a bubble. Off leaves it to a mod.       |
| Spinner styling         | `styleSpinner`     | `on`     | Turn off to leave spinner styling to another mod.             |

Settings are stored under `pluginConfigs` in the global `~/.claude/settings.json`.

### Collapsing edits

A button above the prompt either folds every file edit into a single collapsed row or re-opens them all. Alternatively,
use the commands `/veneer edits` and `/veneer edits collapse`.

### Copying

Hover a block to show its Copy button. Code blocks, tables, diagrams, equations, command output, file reads and diffs
each have one, and so do your messages and Claude's replies. To copy without the mouse, run `/veneer copy` for the last
reply or `/veneer copy code` for its last code block.

### Diagrams and charts

Veneer instructs Claude to draw `mermaid` fences when they add value. Veneer then parses these and displays them as
images or text blocks. The supported types are:

| Kind           | Opens with                                                                |
| -------------- | ------------------------------------------------------------------------- |
| Flowchart      | `graph` or `flowchart`, without subgraphs                                 |
| State          | `stateDiagram` or `stateDiagram-v2`                                       |
| Sequence       | `sequenceDiagram`                                                         |
| Class          | `classDiagram`                                                            |
| ER             | `erDiagram`                                                               |
| Pie            | `pie`                                                                     |
| XY chart       | `xychart` or `xychart-beta`, bars and lines, vertical or `horizontal`     |
| Radar          | `radar-beta`                                                              |
| Sankey         | `sankey` or `sankey-beta`                                                 |
| Treemap        | `treemap-beta`                                                            |
| Quadrant chart | `quadrantChart`                                                           |
| Gantt          | `gantt`, with dependencies, milestones, `dateFormat` and `axisFormat`     |
| Timeline       | `timeline`                                                                |
| User journey   | `journey`                                                                 |
| Kanban         | `kanban`, with ticket, assignee and priority metadata                     |
| Mind map       | `mindmap`                                                                 |
| Git graph      | `gitGraph`, with branches, merges, tags and cherry-picks                  |
| Packet         | `packet` or `packet-beta`                                                 |
| Block          | `block-beta`, with spans, spaces, nested blocks and arrows                |
| Architecture   | `architecture-beta`, with groups, services, junctions and ports           |
| C4             | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic` and `C4Deployment` |

### Math

Display equations (`$$ ... $$`, `\[ ... \]` and `\begin{equation}`, `align`, `gather` and `multline` blocks) are typeset
with [MathJax](https://www.mathjax.org) and drawn as images in the theme's text colour. An equation MathJax cannot read,
or any equation where images are unavailable or text-based graphics is on, is drawn as Unicode text. Inline math
(`$ ... $` and `\( ... \)`) is always converted to Unicode text, such as `x² + α ≤ ∑ᵢ₌₁ⁿ i`, so it stays in the line.
Anything in a code span or fence is left alone. The equation's TeX is copied from the button above it.

## Supported Languages and File Types

Syntax highlighting is supported for 106 languages and file types:

- Web: TypeScript, TSX, JavaScript, JSX, JSON, JSONC, JSON5, JSON Lines, HTML, CSS, SCSS, Sass, Less, Stylus, Vue, Pug,
  Handlebars, Jinja, Twig, Razor, GraphQL
- Scripting and shells: Shell, Shell Session, Fish, PowerShell, Batch, AWK, Ruby, PHP, Perl, Lua, R, Julia, MATLAB, Tcl,
  Vim script
- Systems and general purpose: Python, C, C++, Objective-C, Objective-C++, C#, F#, Visual Basic, Java, Kotlin, Scala,
  Groovy, Swift, Dart, Go, Rust, Zig, D, Nim, Crystal, Pascal, Fortran, COBOL, Solidity, GDScript
- Functional and Lisp: Haskell, OCaml, Elm, PureScript, Elixir, Erlang, Clojure, Racket, Scheme, Common Lisp, Emacs Lisp
- Data and config: YAML, TOML, INI, dotenv, XML, Protocol Buffers, Prisma, Terraform, HCL, Nix, Bicep, Dockerfile,
  Makefile, CMake, Nginx, Apache, systemd, SSH config, HTTP, Git commit messages
- Documents: Markdown, MDX, LaTeX, BibTeX, reStructuredText, AsciiDoc, diff
- Shaders and hardware: GLSL, HLSL, WGSL, Verilog, SystemVerilog, VHDL
- SQL

## Contributing

Requires Node 24 or later and the Claude Code CLI. Install the tooling once with `npm install`, which also sets up the
pre-commit hook.

To test local changes, start Claude Code with `claude --plugin-dir /path/to/veneer`. For that session it loads your
checkout instead of an installed copy of Veneer.

Other useful commands:

| Command                  | Does                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm run typecheck`      | Type-check with `tsc`                                                                   |
| `npm run validate`       | Run `claude plugin validate` on the repo                                                |
| `npm test`               | Run `claude plugin test` on the repo                                                    |
| `npm run build:grammars` | Rebuild `grammars/` from `tools/languages.json`                                         |
| `npm run build:math`     | Rebuild the bundled MathJax in `hooks/vendor/` from `node_modules`                      |
| `npm run conformance`    | Compare the tokenizer with Shiki on `tools/samples/`                                    |
| `npm run check:themes`   | Fetch the popular themes from Open VSX (network, not in CI; `-- --all` for every theme) |
