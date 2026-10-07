#!/bin/sh
# Renders the link preview cards: site/og-*.html -> site/og-*.png (1200x630), with headless Chrome.
#   ./scripts/render-og.sh [google-chrome]
set -e
CHROME="${1:-google-chrome}"
cd "$(dirname "$0")/../site"
PROFILE="$(mktemp -d)"
for card in og-*.html; do
    "$CHROME" --headless=new --hide-scrollbars --user-data-dir="$PROFILE" --window-size=1200,630 \
        --screenshot="$PWD/${card%.html}.png" "file://$PWD/$card" 2>/dev/null
    echo "site/${card%.html}.png"
done
rm -rf "$PROFILE"
