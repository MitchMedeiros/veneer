# Veneer

The Claude desktop look in the Claude Code terminal. Veneer is a thin layer: wherever it cannot draw, Claude Code draws
its own rows.

## Install

Needs Claude Code 2.1.287 or later. Pictures need a terminal that draws them (Ghostty or kitty) and
[resvg](https://github.com/linebender/resvg) on the path (`brew install resvg` on macOS).

```
/plugin marketplace add mitchmedeiros/veneer
```

```
/plugin install veneer@veneer
```

## Configure

Colors come from your Claude Code theme. Edit a theme in `~/.claude/themes/`.

| Option             | Default          | Use                                                                        |
| ------------------ | ---------------- | -------------------------------------------------------------------------- |
| `messageAlign`     | `left`           | `left` or `right`                                                          |
| `fontFamily`       | `Helvetica Neue` | Font for tables and headings. It must be installed on this machine.        |
| `cellRatio`        | `2.9`            | Height of a terminal cell over its width. Change it if pictures letterbox. |
| `fenceBackground`  | `true`           | Fill code blocks with the syntax theme's background, when it sets one.     |
| `readBackground`   | `true`           | The same for the card of a file read.                                      |
| `outputBackground` | `true`           | The same for highlighted Bash and Grep output.                             |
| `diffBackground`   | `true`           | The same for diff cards. Added and removed lines keep their own fill.      |

Set options through `/config` or under `pluginConfigs` in `settings.json`.

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
