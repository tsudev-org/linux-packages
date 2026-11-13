#!/usr/bin/env bash
# Kiem trang kho qua ten mien that (sau khi trien khai Worker, va moi ngay):
#   kiem-ten-mien.sh https://pkg.tsudev.com
# `/` va thu muc phai la trang cua kho (khong phai 404 cua R2), header bao mat co mat, Range dung, 404 tieng Viet.
set -euo pipefail
B=${1:?goc kho}
loi=0
ok() { echo "dat: $*"; }
hong() { echo "LOI: $*"; loi=1; }
ma() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

for p in / /apt/ /rpm/; do
  body=$(curl -s "$B$p"); c=$(ma "$B$p")
  if [ "$c" = 200 ] && grep -q 'pkg.tsudev.com\|Kho gói' <<<"$body" && ! grep -q 'Object not found' <<<"$body"; then ok "$p 200"; else hong "$p tra $c"; fi
done
[ "$(ma "$B/apt")" = 301 ] && ok "/apt -> 301" || hong "/apt khong chuyen huong"
c=$(ma "$B/khong-co-tep-nay"); body=$(curl -s "$B/khong-co-tep-nay")
[ "$c" = 404 ] && grep -q 'Không tìm thấy' <<<"$body" && ok "404 tieng Viet" || hong "404 sai ($c)"

h=$(curl -sI "$B/")
for x in Strict-Transport-Security X-Content-Type-Options Content-Security-Policy; do
  grep -qi "^$x:" <<<"$h" && ok "header $x" || hong "thieu header $x tren /"
done
grep -qi '^access-control-allow-origin: \*' < <(curl -sI "$B/catalog.json") && ok "CORS catalog.json" || hong "catalog.json thieu CORS"

cr=$(curl -s -D - -o /dev/null -H 'Range: bytes=0-9' "$B/apt/dists/stable/InRelease" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-range"{print $2}')
[[ $cr =~ ^bytes\ 0-9/[0-9]+$ ]] && ok "Range: $cr" || hong "Range sai: '$cr'"
exit $loi
