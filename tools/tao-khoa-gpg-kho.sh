#!/usr/bin/env bash
# Tao khoa GPG cho kho APT/RPM pkg.tsudev.com (PACKAGING.md muc 4.3).
#
#   - Khoa chinh RSA-4096 chi de chung thuc (cert), KHONG het han, nam trong KEYHOME - chu project giu ngoai tuyen.
#   - Khoa con RSA-4096 chi de ky (sign), han 2 nam - dua vao secret cua GitHub Environment `packages`.
#   - Script KHONG in bi mat nao ra man hinh (ket qua lenh `!` hien vao hoi thoai voi Claude):
#       * passphrase khoa chinh  -> $KEYHOME/PASSPHRASE-KHOA-CHINH.txt (0600)
#       * khoa con (bo passphrase, chi bao ve bang Environment co buoc duyet) -> di thang vao `gh secret set`,
#         chi nam trong thu muc tam (shred ngay khi xong).
#
# Chay:  bash tao-khoa-gpg-kho.sh            (that)
#        DRY_RUN=1 bash tao-khoa-gpg-kho.sh  (thu, khong day secret len GitHub)
set -euo pipefail
umask 077

REPO="${REPO:-tsudev-org/linux-packages}"
ENV_NAME="${ENV_NAME:-packages}"
KEYHOME="${KEYHOME:-$HOME/.tsudev-pkg-gpg}"
PUBOUT="${PUBOUT:-$HOME/projects/linux-packages/keys}"
UIDSTR="tsudev Package Archive <pkg@tsudev.com>"

[ -e "$KEYHOME/pubring.kbx" ] && { echo "DUNG: $KEYHOME da co khoa. Xoa/doi ten thu muc do neu that su muon tao lai." >&2; exit 1; }
if [ -z "${DRY_RUN:-}" ]; then
  login=$(gh api user -q .login)
  echo "gh dang dung tai khoan: $login"
  gh api "repos/$REPO/environments/$ENV_NAME" -q .name >/dev/null || { echo "DUNG: chua co Environment $ENV_NAME o $REPO" >&2; exit 1; }
fi

mkdir -p "$KEYHOME" "$PUBOUT"; chmod 700 "$KEYHOME"
TMP=$(mktemp -d); trap 'gpgconf --homedir "$TMP/ci" --kill gpg-agent 2>/dev/null; find "$TMP" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$TMP"' EXIT

PP_MAIN="$KEYHOME/PASSPHRASE-KHOA-CHINH.txt"
openssl rand -base64 33 | tr -d '\n' > "$PP_MAIN"

G=(gpg --homedir "$KEYHOME" --batch --quiet --pinentry-mode loopback)
"${G[@]}" --passphrase-file "$PP_MAIN" --quick-generate-key "$UIDSTR" rsa4096 cert never
FPR=$("${G[@]}" --with-colons --list-keys "$UIDSTR" | awk -F: '/^fpr:/{print $10; exit}')
"${G[@]}" --passphrase-file "$PP_MAIN" --quick-add-key "$FPR" rsa4096 sign 2y
SUBFPR=$("${G[@]}" --with-colons --list-keys "$FPR" | awk -F: '/^fpr:/{n++; if(n==2){print $10; exit}}')

# Khoa cong khai: ban nhi phan cho apt (signed-by) va ban armor cho rpm/website.
"${G[@]}" --export "$FPR" > "$PUBOUT/tsudev-archive-keyring.gpg"
"${G[@]}" --armor --export "$FPR" > "$PUBOUT/tsudev-archive-keyring.asc"
chmod 644 "$PUBOUT"/tsudev-archive-keyring.*

# Chi khoa con ky (bo passphrase) -> thu muc tam.
"${G[@]}" --passphrase-file "$PP_MAIN" --export-secret-subkeys "${SUBFPR}!" > "$TMP/sub.gpg"
mkdir -m 700 "$TMP/ci"
GC=(gpg --homedir "$TMP/ci" --batch --quiet --pinentry-mode loopback)
"${GC[@]}" --import "$TMP/sub.gpg"
{ cat "$PP_MAIN"; printf '\n\n\n'; } | "${GC[@]}" --command-fd 0 --edit-key "$FPR" passwd save >/dev/null 2>&1 || true
gpgconf --homedir "$TMP/ci" --kill gpg-agent
"${GC[@]}" --passphrase '' --armor --export-secret-subkeys "${SUBFPR}!" > "$TMP/sub-ci.asc"

# Tu kiem: khoa CI ky duoc, khoa chinh trong ban CI chi la "stub" (sec#).
echo test > "$TMP/t"
"${GC[@]}" --passphrase '' --local-user "${SUBFPR}!" --detach-sign -o "$TMP/t.sig" "$TMP/t"
gpgconf --homedir "$TMP/ci" --kill gpg-agent
"${GC[@]}" --passphrase 'sai-co-y' --local-user "${SUBFPR}!" --detach-sign -o "$TMP/t2.sig" "$TMP/t" \
  || { echo "LOI: khoa con ban CI van con passphrase" >&2; exit 1; }
gpgv --keyring "$PUBOUT/tsudev-archive-keyring.gpg" "$TMP/t.sig" "$TMP/t" 2>/dev/null || { echo "LOI: chu ky thu khong hop le" >&2; exit 1; }
"${GC[@]}" --list-secret-keys | grep -q '^sec#' || { echo "LOI: ban CI van chua khoa chinh" >&2; exit 1; }

if [ -z "${DRY_RUN:-}" ]; then
  gh secret set PKG_GPG_SIGNING_KEY --env "$ENV_NAME" -R "$REPO" < "$TMP/sub-ci.asc"
  gh variable set PKG_GPG_FINGERPRINT -R "$REPO" --body "$FPR"
  echo "Da day secret PKG_GPG_SIGNING_KEY (Environment $ENV_NAME) va bien PKG_GPG_FINGERPRINT len $REPO."
fi

echo
echo "XONG. Van tay khoa chinh : $FPR"
echo "      Van tay khoa con ky : $SUBFPR (het han sau 2 nam)"
echo "      Khoa cong khai      : $PUBOUT/tsudev-archive-keyring.{gpg,asc}"
echo "      Khoa chinh + giay thu hoi + passphrase: $KEYHOME (KHONG gui cho ai)"
echo
echo "VIEC CUA CHU PROJECT (lam trong terminal rieng, khong qua Claude):"
echo "  1. Chep passphrase trong $PP_MAIN vao trinh quan ly mat khau, roi: shred -u $PP_MAIN"
echo "  2. Sao luu ca thu muc $KEYHOME ra USB/o ngoai tuyen (2 ban), roi xoa khoi may nay:"
echo "       tar -C \"$(dirname "$KEYHOME")\" -czf /duong/dan/usb/tsudev-pkg-gpg.tgz \"$(basename "$KEYHOME")\" && rm -rf \"$KEYHOME\""
echo "  3. Gia han khoa con truoc $(date -d '+23 months' +%m/%Y): import ban sao luu, gpg --quick-set-expire $FPR 2y $SUBFPR, chay lai buoc day secret."
