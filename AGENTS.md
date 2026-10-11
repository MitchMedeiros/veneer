# Agent notes

Veneer is a Claude Code mod. It runs inside Claude Code's plugin sandbox, not in Node.

- Only `hooks/register.tsx` receives `$`. Passing `$` to a function imported from another file fails validation, so pass
  plain values or closures that capture it.
- A hook passed to `on()` must be a function literal. Wrapping it in a helper stops the module loading.
- `$.env.get` takes a literal variable name. A name read from a variable is refused.
- Every render hook returns `next(e)` untouched unless it draws. If `next(e)` already returned a tree from another mod,
  pass it through.
- Colours come from the active Claude Code theme. Do not hard-code a theme's colours.
