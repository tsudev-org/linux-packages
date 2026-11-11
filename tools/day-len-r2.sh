#!/usr/bin/env bash
# Day thu muc kho len R2 (bucket gan ten mien pkg.tsudev.com) theo thu tu an toan:
#   1. goi .deb/.rpm (ten moi, bat bien)  2. sieu du lieu phu  3. tep chi muc da ky (Release/InRelease/repomd)
#   4. manifest.json  5. xoa tep khong con dung (goi ngoai 3 ban gan nhat).
# Tep trung SHA-256 voi manifest dang phat hanh thi bo qua.
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID bat buoc. BUCKET mac dinh pkg-tsudev.
set -euo pipefail
site=${1:?thu muc kho}
BUCKET=${BUCKET:-pkg-tsudev}
BASE=${BASE:-https://pkg.tsudev.com}
WRANGLER=(npx --yes wrangler@4.154.0)
cd "$site"

curl -fsSL "$BASE/manifest.json" -o /tmp/manifest-cu.json 2>/dev/null || echo '{"all":[],"sha256":{}}' > /tmp/manifest-cu.json

loai() {
  case "$1" in
    *.deb) echo "application/vnd.debian.binary-package" ;;
    *.rpm) echo "application/x-rpm" ;;
    *.gpg) echo "application/pgp-keys" ;;
    *keyring.asc) echo "application/pgp-keys" ;;
    *.asc|*/Release.gpg) echo "application/pgp-signature" ;;
    *.gz) echo "application/gzip" ;;
    *.xml) echo "application/xml" ;;
    *.json) echo "application/json" ;;
    *.html) echo "text/html; charset=utf-8" ;;
    *) echo "text/plain; charset=utf-8" ;;
  esac
}

put() {
  local f=$1 cc
  case "$f" in *.deb|*.rpm) cc="public, max-age=31536000, immutable" ;; *) cc="no-cache" ;; esac
  "${WRANGLER[@]}" r2 object put "$BUCKET/$f" --file "$f" --content-type "$(loai "$f")" --cache-control "$cc" --remote >/dev/null
  echo "  len $f"
}

can_day() {  # tep khac voi ban dang phat hanh?
  python3 - "$1" <<'PY'
import hashlib, json, sys
f = sys.argv[1]
old = json.load(open("/tmp/manifest-cu.json")).get("sha256", {})
h = hashlib.sha256(open(f, "rb").read()).hexdigest()
sys.exit(0 if old.get(f) != h else 1)
PY
}

mapfile -t all < <(find . -type f ! -name manifest.json | sed 's#^\./##' | sort)
cuoi='^(apt/dists/stable/(Release|Release\.gpg|InRelease)|rpm/repodata/repomd\.xml(\.asc)?)$'
echo "1. goi"
for f in "${all[@]}"; do [[ $f =~ \.(deb|rpm)$ ]] && { can_day "$f" && put "$f" || true; }; done
echo "2. sieu du lieu phu"
for f in "${all[@]}"; do [[ $f =~ \.(deb|rpm)$ || $f =~ $cuoi ]] || { can_day "$f" && put "$f" || true; }; done
echo "3. chi muc da ky"
for f in rpm/repodata/repomd.xml rpm/repodata/repomd.xml.asc apt/dists/stable/Release apt/dists/stable/Release.gpg apt/dists/stable/InRelease; do put "$f"; done
echo "4. manifest"
put manifest.json
echo "5. don tep cu"
python3 - <<'PY' > /tmp/xoa.txt
import json
old = set(json.load(open("/tmp/manifest-cu.json")).get("all", []))
new = set(json.load(open("manifest.json"))["all"])
print("\n".join(sorted(old - new - {"manifest.json"})))
PY
while read -r f; do
  [ -n "$f" ] || continue
  "${WRANGLER[@]}" r2 object delete "$BUCKET/$f" --remote >/dev/null && echo "  xoa $f"
done < /tmp/xoa.txt
echo "XONG"
