#!/usr/bin/env bash
# install.sh cua tsudev.com ghim SHA-256 khoa kho (PIN_GPG_SHA256, PIN_ASC_SHA256 - repo tsudev). Khoa o keys/
# khac ban ghim -> nguoi dung chay `curl ... install.sh | sh` bi tu choi. Chan som: PR doi khoa phai di SAU PR tsudev
# cap nhat ghim (README muc "Khoa va bi mat").
set -euo pipefail
cd "$(dirname "$0")/.."
URL=${INSTALL_SH_URL:-https://tsudev.com/install.sh}
script=$(curl -fsSL --retry 3 "$URL") || { echo "LOI: khong tai duoc $URL"; exit 1; }
loi=0
for kieu in gpg asc; do
  bien="PIN_$(tr a-z A-Z <<<"$kieu")_SHA256"
  ghim=$(sed -nE "s/^${bien}=\"([0-9a-f]{64})\".*/\1/p" <<<"$script" | head -1)
  that=$(sha256sum "keys/tsudev-archive-keyring.$kieu" | cut -d' ' -f1)
  if [ -z "$ghim" ]; then echo "LOI: $URL khong co $bien"; loi=1
  elif [ "$ghim" != "$that" ]; then
    echo "LOI: keys/tsudev-archive-keyring.$kieu ($that) khac $bien trong $URL ($ghim)"
    echo "     Cap nhat ghim o repo tsudev va deploy truoc, roi moi doi khoa o day."; loi=1
  else echo "ghim khop: $kieu $that"; fi
done
exit $loi
