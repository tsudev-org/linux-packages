#!/usr/bin/env bash
# Cai cong cu dung kho tren runner Ubuntu: apt-ftparchive, createrepo_c, rpmsign, nfpm (ghim SHA-256).
set -euo pipefail
NFPM_VERSION=2.48.0
NFPM_SHA256=6d7f9a28b2f397934403950fcbba83f598b08d02edbe79a0815b3b4897341750
sudo apt-get update -qq
sudo apt-get install -y -qq --no-install-recommends apt-utils createrepo-c rpm gnupg >/dev/null
tmp=$(mktemp -d)
curl -fsSLo "$tmp/nfpm.tgz" "https://github.com/goreleaser/nfpm/releases/download/v${NFPM_VERSION}/nfpm_${NFPM_VERSION}_Linux_x86_64.tar.gz"
echo "${NFPM_SHA256}  $tmp/nfpm.tgz" | sha256sum -c -
tar -xzf "$tmp/nfpm.tgz" -C "$tmp" nfpm
sudo install -m 0755 "$tmp/nfpm" /usr/local/bin/nfpm
rm -rf "$tmp"
nfpm --version | grep -i version || true
