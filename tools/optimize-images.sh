#!/bin/bash
# Kahani Korner — generate optimized, content-hashed image variants.
#
#   tools/optimize-images.sh               # generate everything in tools/images.conf
#   tools/optimize-images.sh --dry-run     # show what would be written, write nothing
#   tools/optimize-images.sh --only NAME   # just one entry (e.g. --only fam)
#   tools/optimize-images.sh --list-unused # list opt/ files no HTML references
#   tools/optimize-images.sh --config FILE # use another config file
#
# Safeguards:
#   - Original images are only read, never modified, moved or deleted.
#   - Output goes only to assets/images/opt/. Filenames contain a hash of the
#     file's content, so an existing file is never overwritten: identical
#     output is skipped, and changed output always gets a new name. That is
#     what makes the 7-day cache on /assets/images/opt/** (firebase.json) safe.
#   - Nothing is ever deleted. --list-unused only reports orphans.
#   - Refuses to upscale, and stops on any missing source or encoder error.
#   - HTML is never edited automatically; update srcset/href by hand.
#
# Requires: cwebp (brew install webp) and sips (built into macOS).
# This tools/ folder is excluded from hosting deploys in firebase.json.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMG="$ROOT/assets/images"
OUT="$IMG/opt"
CONFIG="$ROOT/tools/images.conf"
DRY_RUN=0
ONLY=""
LIST_UNUSED=0

die() { echo "error: $*" >&2; exit 1; }
trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; echo "${s%"${s##*[![:space:]]}"}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --only) ONLY="${2:-}"; [ -n "$ONLY" ] || die "--only needs a name"; shift ;;
    --list-unused) LIST_UNUSED=1 ;;
    --config) CONFIG="${2:-}"; [ -n "$CONFIG" ] || die "--config needs a file"; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

[ -f "$ROOT/firebase.json" ] || die "can't find the site root (no firebase.json in $ROOT)"

if [ "$LIST_UNUSED" = 1 ]; then
  [ -d "$OUT" ] || exit 0
  found=0
  for f in "$OUT"/*; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    if ! grep -rqF --include='*.html' --include='*.css' --include='*.js' \
        --exclude-dir=node_modules --exclude-dir=functions "opt/$base" "$ROOT"; then
      echo "unused: assets/images/opt/$base"
      found=1
    fi
  done
  [ "$found" = 1 ] || echo "no unused files in assets/images/opt/"
  exit 0
fi

command -v sips >/dev/null || die "sips not found (this script needs macOS)"
[ -f "$CONFIG" ] || die "config not found: $CONFIG"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
[ "$DRY_RUN" = 1 ] || mkdir -p "$OUT"

written=0; skipped=0; matched=0
while IFS='|' read -r name src widths args || [ -n "$name" ]; do
  name="$(trim "$name")"
  case "$name" in ''|'#'*) continue ;; esac
  [ -z "$ONLY" ] || [ "$name" = "$ONLY" ] || continue
  matched=1
  src="$(trim "$src")"; widths="$(trim "$widths")"; args="$(trim "$args")"
  [ -n "$src" ] && [ -n "$widths" ] && [ -n "$args" ] || die "$name: malformed line in $CONFIG"
  [[ "$name" =~ ^[a-z0-9-]+$ ]] || die "$name: names may only use a-z, 0-9 and -"
  [ -f "$IMG/$src" ] || die "$name: source not found: assets/images/$src"
  if [ "$args" = png ]; then ext=png; else ext=webp; command -v cwebp >/dev/null || die "cwebp not found (brew install webp)"; fi

  srcw="$(sips -g pixelWidth "$IMG/$src" | awk '/pixelWidth/{print $2}')"
  [ -n "$srcw" ] || die "$name: couldn't read the width of $src"

  for w in $widths; do
    [ "$w" = full ] && w="$srcw"
    [[ "$w" =~ ^[0-9]+$ ]] || die "$name: bad width '$w'"
    [ "$w" -le "$srcw" ] || die "$name: ${w}px is wider than the ${srcw}px source (no upscaling)"

    tmp="$TMP/$name-$w.$ext"
    if [ "$ext" = png ]; then
      sips -Z "$w" "$IMG/$src" --out "$tmp" >/dev/null
    elif [ "$w" = "$srcw" ]; then
      # shellcheck disable=SC2086  # args is a deliberate list of options
      cwebp -quiet $args "$IMG/$src" -o "$tmp"
    else
      # shellcheck disable=SC2086
      cwebp -quiet $args -resize "$w" 0 "$IMG/$src" -o "$tmp"
    fi
    [ -s "$tmp" ] || die "$name: encoder produced no output for ${w}px"

    hash="$(shasum -a 256 "$tmp" | cut -c1-8)"
    file="$name-$w.$hash.$ext"
    size="$(stat -f%z "$tmp")"
    if [ -e "$OUT/$file" ]; then
      cmp -s "$tmp" "$OUT/$file" || die "$file exists with different content (hash collision?) — not overwriting"
      printf "unchanged  %-38s %8d B\n" "$file" "$size"
      skipped=$((skipped + 1))
    elif [ "$DRY_RUN" = 1 ]; then
      printf "would add  %-38s %8d B\n" "$file" "$size"
    else
      cp -n "$tmp" "$OUT/$file"
      printf "added      %-38s %8d B\n" "$file" "$size"
      written=$((written + 1))
    fi
  done
done < "$CONFIG"

[ -z "$ONLY" ] || [ "$matched" = 1 ] || die "no entry named '$ONLY' in $CONFIG"
echo "done: $written added, $skipped unchanged$([ "$DRY_RUN" = 1 ] && echo ' (dry run, nothing written)')"
[ "$written" = 0 ] || echo "Update the srcset/href in the HTML to the new filenames above, then run --list-unused."
