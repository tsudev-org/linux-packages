#!/usr/bin/env bash
# Day thu muc kho len R2 (bucket gan ten mien pkg.tsudev.com) qua API S3 cua R2, theo thu tu an toan:
#   1. goi .deb/.rpm (ten moi, bat bien)  2. sieu du lieu phu  3. tep chi muc da ky (Release/InRelease/repomd)
#   4. manifest.json  5. xoa object khong con trong kho (goi ngoai 3 ban gan nhat, repodata cu).
# Tep trung SHA-256 voi manifest dang phat hanh thi bo qua. Loi bat ky -> dung ngay (khong day chi muc tro toi tep thieu).
#   Bat buoc: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (token R2 "Object Read & Write" cho bucket).
set -euo pipefail
site=${1:?thu muc kho}
BUCKET=${BUCKET:-pkg-tsudev}
BASE=${BASE:-https://pkg.tsudev.com}
: "${CLOUDFLARE_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?thieu secret R2_ACCESS_KEY_ID}" "${R2_SECRET_ACCESS_KEY:?thieu secret R2_SECRET_ACCESS_KEY}"
export AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
S3=(aws s3api --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" --no-cli-pager)
cd "$site"

# Kiem quyen truoc khi day bat cu thu gi.
"${S3[@]}" list-objects-v2 --bucket "$BUCKET" --max-items 1 >/dev/null || { echo "LOI: khong doc duoc bucket $BUCKET - kiem secret R2_*"; exit 1; }

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
  local f=$1 cc i
  case "$f" in *.deb|*.rpm) cc="public, max-age=31536000, immutable" ;; *) cc="no-cache" ;; esac
  for i in 1 2 3 4; do
    if "${S3[@]}" put-object --bucket "$BUCKET" --key "$f" --body "$f" \
         --content-type "$(loai "$f")" --cache-control "$cc" >/dev/null; then
      echo "  len $f"; return 0
    fi
    echo "  thu lai $f ($i)"; sleep $((i * 5))
  done
  echo "LOI: khong day duoc $f"; exit 1
}

can_day() {  # 0 = tep khac voi ban dang phat hanh
  python3 - "$1" <<'PY'
import hashlib, json, sys
f = sys.argv[1]
old = json.load(open("/tmp/manifest-cu.json")).get("sha256", {})
sys.exit(0 if old.get(f) != hashlib.sha256(open(f, "rb").read()).hexdigest() else 1)
PY
}

mapfile -t all < <(find . -type f ! -name manifest.json | sed 's#^\./##' | sort)
cuoi='^(apt/dists/stable/(Release|Release\.gpg|InRelease)|rpm/repodata/repomd\.xml(\.asc)?)$'
echo "1. goi"
for f in "${all[@]}"; do
  if [[ $f =~ \.(deb|rpm)$ ]] && can_day "$f"; then put "$f"; fi
done
echo "2. sieu du lieu phu"
for f in "${all[@]}"; do
  if ! [[ $f =~ \.(deb|rpm)$ || $f =~ $cuoi ]] && can_day "$f"; then put "$f"; fi
done
echo "3. chi muc da ky"
for f in rpm/repodata/repomd.xml rpm/repodata/repomd.xml.asc apt/dists/stable/Release apt/dists/stable/Release.gpg apt/dists/stable/InRelease; do put "$f"; done
echo "4. manifest"
put manifest.json
echo "5. don object cu"
"${S3[@]}" list-objects-v2 --bucket "$BUCKET" --query 'Contents[].Key' --output text | tr '\t' '\n' | grep -v '^None$' | sort > /tmp/tren-r2.txt || true
printf '%s\n' "${all[@]}" manifest.json | sort > /tmp/moi.txt
comm -23 /tmp/tren-r2.txt /tmp/moi.txt | while read -r k; do
  [ -n "$k" ] || continue
  "${S3[@]}" delete-object --bucket "$BUCKET" --key "$k" >/dev/null
  echo "  xoa $k"
done
echo "XONG"
