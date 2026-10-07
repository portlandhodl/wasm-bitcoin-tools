#!/bin/sh
# Stages the guest both tools boot: the Alpine Linux virt ISO (downloaded and sha256-checked,
# or copied from a path you give) and the kernel and initramfs the pages boot directly,
# extracted from it to images/<iso name>/boot/. Needs curl and bsdtar (libarchive-tools).
#
#   ./scripts/stage-alpine.sh [path/to/alpine-virt-3.19.9-x86_64.iso]

set -e

NAME=alpine-virt-3.19.9-x86_64
URL=https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/$NAME.iso
SHA256=5389ca9c2ed206d9c1f7a92d213668de9c1c76493faf8cb1d7680a03cf9a0513

IMAGES="$(cd "$(dirname "$0")/.." && pwd)/images"
ISO="$IMAGES/$NAME.iso"
mkdir -p "$IMAGES"

if [ -n "$1" ]; then
    cp "$1" "$ISO.part"
elif [ ! -f "$ISO" ]; then
    echo "downloading $URL"
    curl -fL --progress-bar -o "$ISO.part" "$URL"
fi
if [ -f "$ISO.part" ]; then
    if ! echo "$SHA256  $ISO.part" | sha256sum -c --quiet; then
        rm -f "$ISO.part"
        echo "$NAME.iso: sha256 mismatch (expected $SHA256)" >&2
        exit 1
    fi
    mv "$ISO.part" "$ISO"
fi
echo "$SHA256  $ISO" | sha256sum -c --quiet

mkdir -p "$IMAGES/$NAME/boot"
for f in vmlinuz-virt initramfs-virt; do
    bsdtar -xOf "$ISO" "boot/$f" > "$IMAGES/$NAME/boot/$f"
    echo "  $NAME/boot/$f ($(du -h "$IMAGES/$NAME/boot/$f" | cut -f1))"
done
