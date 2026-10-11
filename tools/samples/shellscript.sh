#!/usr/bin/env bash
set -euo pipefail

# Comment line
NAME="world"
readonly COUNT=3
export PATH="$HOME/bin:${PATH:-}"

greet() {
  local who="${1:-$NAME}"
  echo "Hello, $who! $(date +%Y) `uname`" >&2
}

for i in $(seq 1 "$COUNT"); do
  if [[ -f "$i.txt" && ! -d /tmp ]]; then
    greet "$i" | tee out.log
  elif [ "$i" -gt 2 ]; then
    echo 'single $quoted' && continue
  else
    printf '%s\n' "$((i * 2))"
  fi
done

cat <<EOF > file.txt
heredoc $NAME
  indented ${COUNT}
EOF

cat <<'RAW'
no $expansion here
RAW

case "$1" in
  start|run) echo go ;;
  *) exit 1 ;;
esac

arr=(one two "three four")
echo "${arr[@]}" "${#arr[@]}" ${NAME//o/0}
npx lint-staged --quiet -c .config.js
