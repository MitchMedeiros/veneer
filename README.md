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
/plugin install veneer@veneer-mods
```

## Configure

Colors come from your Claude Code theme. Edit a theme in `~/.claude/themes/`.

| Option         | Default          | Use                                                                        |
| -------------- | ---------------- | -------------------------------------------------------------------------- |
| `messageAlign` | `left`           | `left` or `right`                                                          |
| `fontFamily`   | `Helvetica Neue` | Font for tables and headings. It must be installed on this machine.        |
| `cellRatio`    | `2.9`            | Height of a terminal cell over its width. Change it if pictures letterbox. |

Set options through `/config` or under `pluginConfigs` in `settings.json`.

## Develop

Needs Node 24 or later (`nvm use` reads `.nvmrc`) and the Claude Code CLI. Install the tooling once with `npm install`,
which also sets up the pre-commit hook.

| Command                | Does                                                    |
| ---------------------- | ------------------------------------------------------- |
| `npm run format`       | Format every file with Prettier                         |
| `npm run format:check` | Check formatting without changing files                 |
| `npm run lint`         | Lint with ESLint (`npm run lint:fix` fixes what it can) |
| `npm run typecheck`    | Type-check with `tsc`                                   |
| `npm run validate`     | Run `claude plugin validate` on the repo                |
| `npm test`             | Run `claude plugin test` on the repo                    |
| `npm run check`        | Run all of the above, as CI does                        |

`validate` and `test` run from outside the repo, because Claude Code needs that. The pre-commit hook formats and lints
the staged files and type-checks the project. CI runs `npm run check` on every push to `main` and every pull request.
