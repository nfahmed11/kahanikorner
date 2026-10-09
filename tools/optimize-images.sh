#!/bin/bash
# Kahani Korner — generate optimized, content-hashed image variants.
#
#   tools/optimize-images.sh               # generate everything in tools/images.conf
#   tools/optimize-images.sh --dry-run     # show what would be written, write nothing
#   tools/optimize-images.sh --only NAME   # just one entry (e.g. --only fam)
#   tools/optimize-images.sh --list-unused # list opt/ files no HTML references
#   tools/optimize-images.sh --config FILE # use another config file
#
# A config line whose name ends in "*" covers a whole folder, e.g.
#   v-* | ../../qr/assets/images/*.png | 256 512 | -q 85 ...
# Each matching file becomes its own entry named <prefix><slug>-<id>, where
# slug is the lowercased filename and id the first 6 hex digits of the SHA-1
# of the original filename (so "le jaana.png" and "le_jaana.png" never clash;
# tools/vocab-image-map.mjs uses the same rule). Widths at or above a file's
# own width become its full size. --only accepts the "v-*" name too.
#
# Safeguards:
#   - Original images are only read, never modified, moved or deleted.
#   - Output goes only to assets/images/opt/. Filenames contain a hash of the
#     file's content, so an existing file is never overwritten: identical
#     output is skipped, and changed output always gets a new name. That is
#     what makes the 7-day cache on /assets/images/opt/** (firebase.json) safe.
#   - Nothing is ever deleted. --list-unused only reports orphans.
#   - Refuses to upscale, and stops on any missing source or encoder error.
#   - Keeps colours exact: ICC profiles are embedded (-metadata icc in the
#     config) and PNGs tagged gAMA/cHRM get an equivalent profile first
#     (tools/gamma22-srgb.py).
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

# Expand folder entries ("name*" | "path/*.png") into one line per file.
EXPANDED="$TMP/expanded.conf"
: > "$EXPANDED"
while IFS='|' read -r name src widths args || [ -n "$name" ]; do
  name="$(trim "$name")"
  case "$name" in ''|'#'*) continue ;; esac
  src="$(trim "$src")"; widths="$(trim "$widths")"; args="$(trim "$args")"
  if [[ "$name" != *'*' ]]; then
    printf '%s|%s|%s|%s|%s\n' "$name" "$src" "$widths" "$args" "$name" >> "$EXPANDED"
    continue
  fi
  prefix="${name%\*}"
  [[ "$prefix" =~ ^[a-z0-9-]*$ ]] || die "$name: folder entry prefix may only use a-z, 0-9 and -"
  dir="$(dirname "$src")"; pattern="$(basename "$src")"
  [ -d "$IMG/$dir" ] || die "$name: folder not found: assets/images/$dir"
  count=0
  while IFS= read -r file; do
    base="$(basename "$file")"
    # A damaged file in a folder (e.g. a PNG whose header lost its CR byte to a
    # line-ending conversion) is reported and skipped, not allowed to stop the run.
    if [ "$(xxd -p -l 8 "$IMG/$dir/$base")" != "89504e470d0a1a0a" ]; then
      echo "warning: $name: skipping $dir/$base — not a valid PNG (damaged file)" >&2
      continue
    fi
    slug="$(printf '%s' "${base%.*}" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
    id="$(printf '%s' "$base" | shasum | cut -c1-6)"
    fw="$(sips -g pixelWidth "$IMG/$dir/$base" | awk '/pixelWidth/{print $2}')"
    [ -n "$fw" ] || die "$name: couldn't read the width of $dir/$base"
    ws=""
    for w in $widths; do
      if [ "$w" = full ] || [ "$w" -ge "$fw" ]; then w=full; fi
      case " $ws " in *" $w "*) ;; *) ws="$ws $w" ;; esac
    done
    printf '%s|%s|%s|%s|%s\n' "$prefix$slug-$id" "$dir/$base" "$(trim "$ws")" "$args" "$name" >> "$EXPANDED"
    count=$((count + 1))
  done < <(cd "$IMG/$dir" && find . -maxdepth 1 -type f -name "$pattern" | sed 's#^\./##' | LC_ALL=C sort)
  [ "$count" -gt 0 ] || die "$name: no files match $src"
done < "$CONFIG"

written=0; skipped=0; matched=0
while IFS='|' read -r name src widths args group || [ -n "$name" ]; do
  [ -z "$ONLY" ] || [ "$name" = "$ONLY" ] || [ "$group" = "$ONLY" ] || continue
  matched=1
  src="$(trim "$src")"; widths="$(trim "$widths")"; args="$(trim "$args")"
  [ -n "$src" ] && [ -n "$widths" ] && [ -n "$args" ] || die "$name: malformed line in $CONFIG"
  [[ "$name" =~ ^[a-z0-9-]+$ ]] || die "$name: names may only use a-z, 0-9 and -"
  [ -f "$IMG/$src" ] || die "$name: source not found: assets/images/$src"
  if [ "$args" = png ]; then ext=png; else ext=webp; command -v cwebp >/dev/null || die "cwebp not found (brew install webp)"; fi

  srcw="$(sips -g pixelWidth "$IMG/$src" | awk '/pixelWidth/{print $2}')"
  [ -n "$srcw" ] || die "$name: couldn't read the width of $src"

  # PNGs tagged gAMA/cHRM instead of an ICC profile: encode from a copy carrying
  # an equivalent profile (pixels unchanged) so the WebP displays the same colours.
  input="$IMG/$src"
  if [ "$ext" = webp ]; then
    set +e; python3 "$ROOT/tools/gamma22-srgb.py" --tag "$IMG/$src" "$TMP/$name-tagged.png"; rc=$?; set -e
    case $rc in 0) input="$TMP/$name-tagged.png" ;; 3) ;; *) die "$name: colour-profile check failed" ;; esac
    # Does the encoder input carry an ICC profile the WebP must keep?
    set +e; python3 "$ROOT/tools/gamma22-srgb.py" --has-icc "$input"; rc=$?; set -e
    case $rc in 0) needs_icc=1 ;; 3) needs_icc=0 ;; *) die "$name: colour-profile check failed" ;; esac
  fi

  for w in $widths; do
    [ "$w" = full ] && w="$srcw"
    [[ "$w" =~ ^[0-9]+$ ]] || die "$name: bad width '$w'"
    [ "$w" -le "$srcw" ] || die "$name: ${w}px is wider than the ${srcw}px source (no upscaling)"

    tmp="$TMP/$name-$w.$ext"
    if [ "$ext" = png ]; then
      sips -Z "$w" "$IMG/$src" --out "$tmp" >/dev/null
    elif [ "$w" = "$srcw" ]; then
      # shellcheck disable=SC2086  # args is a deliberate list of options
      cwebp -quiet $args "$input" -o "$tmp"
    else
      # shellcheck disable=SC2086
      cwebp -quiet $args -resize "$w" 0 "$input" -o "$tmp"
    fi
    [ -s "$tmp" ] || die "$name: encoder produced no output for ${w}px"
    # Colour safeguard: a WebP made from a colour-profiled PNG must embed the
    # profile (WebP "ICCP" chunk), or browsers show it with shifted colours.
    if [ "$ext" = webp ] && [ "$needs_icc" = 1 ] && ! LC_ALL=C grep -q 'ICCP' "$tmp"; then
      die "$name: WebP lost the source's colour profile — add -metadata icc to its encoder args"
    fi

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
done < "$EXPANDED"

[ -z "$ONLY" ] || [ "$matched" = 1 ] || die "no entry named '$ONLY' in $CONFIG"
echo "done: $written added, $skipped unchanged$([ "$DRY_RUN" = 1 ] && echo ' (dry run, nothing written)')"
[ "$written" = 0 ] || echo "Update the srcset/href in the HTML to the new filenames above, then run --list-unused."
