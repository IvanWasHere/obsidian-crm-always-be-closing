#!/usr/bin/env bash
# Rebuilds assets/fonts/*.ttf: Noto Sans (SIL OFL 1.1) cut down to the Latin
# alphabets (incl. č ć đ š ž ő ł…), punctuation and currency symbols, so PDFs
# can show names that PDF's built-in fonts can't. Needs fonttools:
#   uv pip install --target /tmp/pylib fonttools   (or: pip install fonttools)
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
base=https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/unhinted/ttf
for weight in Regular Bold; do
	curl -sL -o "$tmp/NotoSans-$weight.ttf" "$base/NotoSans-$weight.ttf"
	python3 -m fontTools.subset "$tmp/NotoSans-$weight.ttf" \
		--unicodes="U+0020-007E,U+00A0-024F,U+02C6-02DD,U+1E00-1EFF,U+2010-2027,U+2030-203A,U+2044,U+20A0-20C0,U+2116,U+2122,U+2212" \
		--layout-features='kern' --no-hinting \
		--output-file="assets/fonts/NotoSans-$weight.ttf"
done
curl -sL -o assets/fonts/OFL.txt https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt
rm -rf "$tmp"
