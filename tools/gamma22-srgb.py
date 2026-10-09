#!/usr/bin/env python3
"""Colour-profile helper for PNGs tagged gAMA 0.45455 + cHRM (sRGB primaries, D65).

Some PNGs carry those chunks instead of an ICC profile. Browsers honour them (a
pure 2.2 gamma rather than the sRGB curve), but WebP has no gAMA/cHRM, so a plain
WebP of such a PNG renders very slightly differently. tools/optimize-images.sh
calls --tag to give the encoder a copy of the PNG with an equivalent ICC profile,
which cwebp -metadata icc then embeds, so the WebP displays exactly like the PNG.

The profile is macOS's own "sRGB Profile.icc" (same primaries, white point and
adaptation) with its three tone curves replaced by a gamma-2.2 curve.

Usage:
  python3 tools/gamma22-srgb.py <output.icc>          write the profile
  python3 tools/gamma22-srgb.py --tag in.png out.png  write a tagged copy of in.png;
        exit 0 = tagged, exit 3 = not needed (in.png has an ICC/sRGB tag or no
        gAMA/cHRM), anything else = error. Pixel data is never changed.
  python3 tools/gamma22-srgb.py --has-icc in.png      exit 0 if in.png embeds an ICC
        profile (iCCP), so its WebP must carry one too; exit 3 if not.
Standard library only.
"""
import struct
import sys
import zlib

SRC = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"
SRGB_CHRM = (31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000)


def profile():
    data = open(SRC, "rb").read()
    count = struct.unpack(">I", data[128:132])[0]
    tags = []
    for i in range(count):
        sig, off, size = struct.unpack(">4sII", data[132 + 12 * i: 144 + 12 * i])
        tags.append((sig, data[off: off + size]))
    # 'curv' with one entry: gamma as u8Fixed8 (2.2 -> 563/256 = 2.1992).
    gamma = struct.pack(">4sIIH", b"curv", 0, 1, round(2.2 * 256)) + b"\0\0"
    desc_text = b"sRGB primaries, gamma 2.2 (PNG gAMA/cHRM)\0"
    desc = struct.pack(">4sII", b"desc", 0, len(desc_text)) + desc_text + b"\0" * 79
    kept = []
    for sig, body in tags:
        if sig in (b"rTRC", b"gTRC", b"bTRC"):
            body = gamma
        elif sig == b"desc":
            body = desc
        elif sig in (b"dscm", b"mluc"):
            continue  # localized descriptions of the original name
        kept.append((sig, body))
    offset = 128 + 4 + 12 * len(kept)
    offset += (-offset) % 4
    blobs, entries, seen = b"", [], {}
    for sig, body in kept:
        if body not in seen:  # shared tone curve, like the original
            blobs += b"\0" * ((-len(blobs)) % 4)
            seen[body] = offset + len(blobs)
            blobs += body
        entries.append((sig, seen[body], len(body)))
    table = struct.pack(">I", len(entries)) + b"".join(struct.pack(">4sII", *e) for e in entries)
    out = bytearray(data[:128] + table + b"\0" * (offset - 128 - len(table)) + blobs)
    out += b"\0" * ((-len(out)) % 4)
    struct.pack_into(">I", out, 0, len(out))
    out[84:100] = b"\0" * 16  # profile ID (MD5) no longer valid; zero = not computed
    return bytes(out)


def chunks(png):
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos = 8
    while pos < len(png):
        n, t = struct.unpack(">I4s", png[pos: pos + 8])
        yield t, png[pos: pos + 12 + n], png[pos + 8: pos + 8 + n]
        pos += 12 + n


def tag(src, dst):
    png = open(src, "rb").read()
    found = {t: d for t, _, d in chunks(png)}
    if b"iCCP" in found or b"sRGB" in found or b"gAMA" not in found or b"cHRM" not in found:
        return 3
    if struct.unpack(">I", found[b"gAMA"])[0] != 45455 or struct.unpack(">8I", found[b"cHRM"]) != SRGB_CHRM:
        return 3  # a different colour space: leave it alone rather than guess
    body = b"gamma22\0\0" + zlib.compress(profile())
    iccp = struct.pack(">I", len(body)) + b"iCCP" + body + struct.pack(">I", zlib.crc32(b"iCCP" + body))
    out = [png[:8]]
    for t, raw, _ in chunks(png):
        if t in (b"gAMA", b"cHRM"):
            continue  # superseded by the profile
        out.append(raw)
        if t == b"IHDR":
            out.append(iccp)
    open(dst, "wb").write(b"".join(out))
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--tag":
        sys.exit(tag(sys.argv[2], sys.argv[3]))
    if len(sys.argv) == 3 and sys.argv[1] == "--has-icc":
        sys.exit(0 if any(t == b"iCCP" for t, _, _ in chunks(open(sys.argv[2], "rb").read())) else 3)
    if len(sys.argv) == 2 and not sys.argv[1].startswith("-"):
        open(sys.argv[1], "wb").write(profile())
        sys.exit(0)
    sys.exit(__doc__)
