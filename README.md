# Veneer

Veneer is a Claude Code mod that enhances the overall look and feel for the terminal. It uses the built-in Claude Code
themeing system for nearly everything. It adds customizable syntax highlighting for over 100 languages through any theme
on [Open VSX](https://www.open-vsx.org/search?q=themes&category=Themes&sortBy=downloadCount) or using VSCode themeing
format.

## Installing

Mods require Claude Code 2.1.287+. Use the following slash commands inside Claude Code:

```
/plugin marketplace add mitchmedeiros/veneer
```

```
/plugin install veneer@veneer
```

For image versions of components like graphs and tables you will need:

- kitty, Ghostty, or a [libghostty-based terminal](https://github.com/Uzaaft/awesome-libghostty#terminal-apps--clients)
- [resvg](https://github.com/linebender/resvg)

Other terminals that can display images (including those with only partial kitty support like Wezterm) will not work
currently due to Claude Code not supporting them. If this changes in the future, I will update the defaults or you can
overwrite them with the setting: `/veneer text-based graphics off` and set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` when
launching Claude Code.

#### Install resvg

MacOS: `brew install resvg`

Windows:

Arch:

Debian:

## Customization

It ships with the 50 most popular themes for you to pick from straight-away.

### Icons

Terminals that ship with Nerdfonts built-in have it enabled for Veneer by default (see the list below). If you have
[NerdFonts installed](https://github.com/ryanoasis/nerd-fonts#font-installation) or built-in to your terminal and it's
not detected you can enable it with the following command inside Claude Code: `/veneer icons nerd`. Otherwise Veneer
uses similar Unicode icons.

### tmux

Veneer turns pictures off inside tmux, because tmux does not pass the kitty graphics protocol through by default. Icons
are not affected. tmux replaces `TERM_PROGRAM` and `TERM`, so Veneer recognizes Ghostty, kitty and WezTerm by the
variables they set that tmux keeps (`GHOSTTY_RESOURCES_DIR`, `KITTY_WINDOW_ID` and `WEZTERM_EXECUTABLE`) and still draws
Nerd Font icons there. Other terminals get Unicode symbols.

To try pictures in tmux, run `tmux set -g allow-passthrough on` (tmux 3.3a or later) and start Claude Code with
`CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`. This only works in a terminal that supports the protocol, and it is untested.

### Fonts

- **Icons:** Ghostty, kitty, WezTerm and Rio carry their own symbol font, so Nerd Font icons draw with nothing
  installed. Warp, Konsole and other terminals use the fonts installed on your machine, so `auto` draws plain Unicode
  symbols instead. If you have a Nerd Font installed and set as the terminal font, set `icons` to `nerd` to use the Nerd
  Font icons there. Set it to `plain` to use Unicode symbols everywhere.
- **Pictures:** tables and headings are drawn in `fontFamily`. If it is blank or not installed on the machine running
  Claude Code, the first installed font from Arial, Helvetica Neue, Helvetica, Segoe UI, Liberation Sans, DejaVu Sans,
  Noto Sans and Roboto is used.
- **Links:** file paths on tool rows are links that open the file, usually with Cmd+click (Shift+click in WezTerm). In a
  terminal Claude Code does not know to open links, it prints the address beside the name. Rio and Terminal.app show the
  full path as plain text instead. Rio finds the path and opens it with Cmd+click. Terminal.app opens neither. Set
  `links` to `link` or `text` to override this for your terminal.

## Configure

Colors for everything aside from code come directly from your Claude Code theme. Edit a theme normally in
`~/.claude/themes/`.

Run `/veneer` to change every option below in one pane. Enter flips a switch, moves a choice to its next option, or
opens a field for a typed value. Changes apply at once. The pane has a General tab and a Syntax tab. `/veneer` and
`/veneer-settings` open it on General, and `/syntax` opens it on Syntax.

| Option                 | Default | Use                                                                        |
| ---------------------- | ------- | -------------------------------------------------------------------------- |
| `messageAlign`         | `left`  | `left` or `right`                                                          |
| `styleUserMessage`     | `true`  | Draw your messages as a bubble. Turn off to leave them to another mod.     |
| `icons`                | `auto`  | `auto`, `nerd` or `plain`. Nerd Font icons or Unicode symbols.             |
| `links`                | `auto`  | `auto`, `link` or `text`. How a file path on a tool row is drawn.          |
| `nativeTables`         | `false` | Draw tables as a text card, not a picture.                                 |
| `nativeHeadings`       | `false` | Draw headings as styled text, not a picture.                               |
| `nativeVisualizations` | `false` | Draw Mermaid diagrams and charts in characters, not a picture.             |
| `diagramHint`          | `true`  | Tell the model Mermaid is drawn here. Costs about 120 tokens.              |
| `styleSpinner`         | `true`  | Indent the spinner line. Turn off to leave it to another mod.              |
| `fontFamily`           | blank   | Font for tables and headings. Blank or missing fonts fall back to a list.  |
| `cellRatio`            | `2.9`   | Height of a terminal cell over its width. Change it if pictures letterbox. |
| `fenceBackground`      | `true`  | Fill code blocks with the syntax theme's background, when it sets one.     |
| `readBackground`       | `true`  | The same for the card of a file read.                                      |
| `outputBackground`     | `true`  | The same for highlighted Bash and Grep output.                             |
| `diffBackground`       | `true`  | The same for diff cards. Added and removed lines keep their own fill.      |

Set options through `/config` or under `pluginConfigs` in `settings.json`.

### Mermaid diagrams and charts

A `mermaid` fence is drawn as a picture where pictures work, and in characters everywhere else and with
`nativeVisualizations` on. A diagram that Veneer cannot read stays a code block.

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

Each of the kinds from Pie down is laid out once in terminal cells and drawn twice, as a picture and as text. Both read
the same Mermaid source and take their colors from your Claude Code theme. The text drawing fills shapes in eighths of a
cell, joins lines into box characters and draws slanting lines as braille dots. Frontmatter titles name a diagram that
has none of its own. A chart wider than the terminal or too long to read is left as a code block.

The first five kinds are laid out by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT) as text,
bundled into `hooks/vendor/mermaid-ascii.js`. Rebuild it with `npm run build:mermaid`. Their pictures are drawn by
Veneer, and a diagram the picture drawing does not read (subgraphs, composite states and the like) falls back to the
text.

### Syntax highlighting

Code in fences, edits and file reads is highlighted. A language is picked by the fence name, an alias, or the file
extension or name. Any other language draws plain. Veneer highlights these 106 languages and file types:

- Web: TypeScript, TSX, JavaScript, JSX, JSON, JSONC, JSON5, JSON Lines, HTML, CSS, SCSS, Sass, Less, Stylus, Vue, Pug,
  Handlebars, Jinja, Twig, Razor, GraphQL
- Scripting and shells: Python, Shell, Shell Session, Fish, PowerShell, Batch, AWK, Ruby, PHP, Perl, Lua, R, Julia,
  MATLAB, Tcl, Vim script
- Systems and general purpose: C, C++, Objective-C, Objective-C++, C#, F#, Visual Basic, Java, Kotlin, Scala, Groovy,
  Swift, Dart, Go, Rust, Zig, D, Nim, Crystal, Pascal, Fortran, COBOL, Solidity, GDScript
- Functional and Lisp: Haskell, OCaml, Elm, PureScript, Elixir, Erlang, Clojure, Racket, Scheme, Common Lisp, Emacs Lisp
- Data and config: YAML, TOML, INI, dotenv, XML, Protocol Buffers, Prisma, Terraform, HCL, Nix, Bicep, Dockerfile,
  Makefile, CMake, Nginx, Apache, systemd, SSH config, HTTP, Git commit messages
- Documents: Markdown, MDX, LaTeX, BibTeX, reStructuredText, AsciiDoc, diff
- Shaders and hardware: GLSL, HLSL, WGSL, Verilog, SystemVerilog, VHDL
- SQL

### Syntax themes

Run `/syntax` to pick the colors for code. The list holds `Default` and every VS Code color theme file in
`veneer/themes/` inside your Claude folder (`~/.claude`, or `CLAUDE_CONFIG_DIR` when set). Choose `New custom theme...`
to add one: give the path of a theme file and a name, and Veneer copies it into that folder and selects it. A name that
is taken gets a number added. Moving through the list previews each theme on the code in the chat. Enter chooses one and
closes the list; Escape closes it and keeps the theme you had. The choice is kept between sessions.

`New custom theme...` also takes a VS Code extension on [Open VSX](https://open-vsx.org), as `publisher.name` or the
address of its page, and fetches its theme without installing it. An extension with several themes asks which one.
`Browse popular themes...` lists 50 popular theme extensions, ten to a page, most downloaded first as of October 2026.
Fetching a theme is the only time Veneer uses the network.

## Develop

Needs Node 24 or later (`nvm use` reads `.nvmrc`) and the Claude Code CLI. Install the tooling once with `npm install`,
which also sets up the pre-commit hook.

| Command                  | Does                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm run format`         | Format every file with Prettier                                                         |
| `npm run format:check`   | Check formatting without changing files                                                 |
| `npm run lint`           | Lint with ESLint (`npm run lint:fix` fixes what it can)                                 |
| `npm run typecheck`      | Type-check with `tsc`                                                                   |
| `npm run validate`       | Run `claude plugin validate` on the repo                                                |
| `npm test`               | Run `claude plugin test` on the repo                                                    |
| `npm run build:grammars` | Rebuild `grammars/` from `tools/languages.json`                                         |
| `npm run conformance`    | Compare the tokenizer with Shiki on `tools/samples/`                                    |
| `npm run check:themes`   | Fetch the popular themes from Open VSX (network, not in CI; `-- --all` for every theme) |
| `npm run benchmark`      | Time the tokenizer per language in Node (not in CI)                                     |
| `npm run benchmark:host` | Time the highlighter in the plugin test host (not in CI)                                |
| `npm run check`          | Run the checks above, as CI does                                                        |

`validate` and `test` run from outside the repo, because Claude Code needs that. The pre-commit hook formats and lints
the staged files and type-checks the project. CI runs `npm run check` on every push to `main` and every pull request.
