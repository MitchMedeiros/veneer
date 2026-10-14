# Veneer

The Claude desktop look in the Claude Code terminal. Veneer is a thin layer: wherever it cannot draw, Claude Code draws
its own rows.

## Install

Needs Claude Code 2.1.287 or later. Table and heading pictures also need [resvg](https://github.com/linebender/resvg) on
the path (`brew install resvg` on macOS).

```
/plugin marketplace add mitchmedeiros/veneer
```

```
/plugin install veneer@veneer
```

## Terminals

Veneer works in any terminal. What differs is how tables and headings are drawn and which icons are used.

| Terminal | Table and heading pictures | Icons with `icons` on `auto`                    |
| -------- | -------------------------- | ----------------------------------------------- |
| Ghostty  | Yes                        | Nerd Font, from the terminal's built-in symbols |
| kitty    | Yes                        | Nerd Font, from the terminal's built-in symbols |
| WezTerm  | Yes                        | Nerd Font, from the terminal's built-in symbols |
| Rio      | Yes                        | Nerd Font, from the terminal's built-in symbols |
| Warp     | Yes                        | Unicode symbols                                 |
| Konsole  | Yes, untested              | Unicode symbols                                 |
| Others   | No, drawn as text          | Unicode symbols                                 |

Pictures need a terminal that supports the kitty graphics protocol and `resvg`. Inside tmux, or where `resvg` is
missing, Veneer draws tables and headings as text and shows a notice when the session starts. A terminal not listed that
supports the protocol can set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` to turn pictures on. iTerm2 speaks the protocol but
not the Unicode placeholders Claude Code draws pictures with, so it stays on text unless forced.

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
- **Pictures:** tables and headings are drawn in `fontFamily`, which defaults to `Helvetica Neue`. It must be installed
  on the machine running Claude Code, so on Linux and Windows set `fontFamily` to a font you have.
- **Links:** file paths on tool rows are links that open the file, usually with Cmd+click (Shift+click in WezTerm). In a
  terminal Claude Code does not know to open links, it prints the address beside the name. Rio and Terminal.app show the
  full path as plain text instead. Rio finds the path and opens it with Cmd+click. Terminal.app opens neither. Set
  `links` to `link` or `text` to override this for your terminal.

## Configure

Colors come from your Claude Code theme. Edit a theme in `~/.claude/themes/`.

Run `/veneer` to change every option below in one pane. Enter flips a switch, moves a choice to its next option, or
opens a field for a typed value. Changes apply at once. The pane has a General tab and a Syntax tab. `/veneer` and
`/veneer-settings` open it on General, and `/syntax` opens it on Syntax.

| Option             | Default          | Use                                                                        |
| ------------------ | ---------------- | -------------------------------------------------------------------------- |
| `messageAlign`     | `left`           | `left` or `right`                                                          |
| `styleUserMessage` | `true`           | Draw your messages as a bubble. Turn off to leave them to another mod.     |
| `icons`            | `auto`           | `auto`, `nerd` or `plain`. Nerd Font icons or Unicode symbols.             |
| `links`            | `auto`           | `auto`, `link` or `text`. How a file path on a tool row is drawn.          |
| `nativeTables`     | `false`          | Draw tables as a text card, not a picture.                                 |
| `nativeHeadings`   | `false`          | Draw headings as styled text, not a picture.                               |
| `nativeDiagrams`   | `false`          | Draw Mermaid diagrams in box characters, not a picture.                    |
| `styleSpinner`     | `true`           | Indent the spinner line. Turn off to leave it to another mod.              |
| `fontFamily`       | `Helvetica Neue` | Font for tables and headings. It must be installed on this machine.        |
| `cellRatio`        | `2.9`            | Height of a terminal cell over its width. Change it if pictures letterbox. |
| `fenceBackground`  | `true`           | Fill code blocks with the syntax theme's background, when it sets one.     |
| `readBackground`   | `true`           | The same for the card of a file read.                                      |
| `outputBackground` | `true`           | The same for highlighted Bash and Grep output.                             |
| `diffBackground`   | `true`           | The same for diff cards. Added and removed lines keep their own fill.      |

Set options through `/config` or under `pluginConfigs` in `settings.json`.

### Mermaid diagrams

A `mermaid` fence is drawn as a diagram. Flowcharts (`graph` and `flowchart` without subgraphs), state, sequence, class
and ER diagrams are drawn as a picture where pictures work. Everywhere else, with `nativeDiagrams` on, and for a diagram
the picture drawing does not read (subgraphs, composite states and the like), the diagram is drawn in box characters,
which covers flowcharts, state, sequence, class and ER diagrams. Any other diagram stays a code block. The box character
renderer is [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT), bundled into
`hooks/vendor/mermaid-ascii.js`. Rebuild it with `npm run build:mermaid`.

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
