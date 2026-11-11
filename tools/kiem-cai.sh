#!/usr/bin/env bash
# Cai THAT moi goi trong kho bang dung lenh in tren website, kiem roi go sach (PACKAGING.md muc 7, 9).
#   kiem-cai.sh apt|rpm <goc-kho> [goi...]      vd: kiem-cai.sh apt https://pkg.tsudev.com tsudev-lotus
#   Khong ghi goi -> cai moi goi liet ke o <goc-kho>/packages.txt.
# Chay voi quyen root trong container sach (ubuntu/debian/fedora).
set -euo pipefail
kind=$1; base=$2; shift 2
pkgs=("$@")

kiem_goi() {
  local p=$1 exe lib
  [ -x "/usr/bin/$p" ] || { echo "LOI: thieu /usr/bin/$p"; exit 1; }
  exe=$(readlink -f "/usr/bin/$p")
  echo "== $p -> $exe"
  # Moi thu vien goi mang theo phai phan giai duoc (tru libdartjni: chi nap khi chay tren Android/JVM).
  for lib in "$exe" $(find "$(dirname "$exe")" -name '*.so' ! -name 'libdartjni.so'); do
    if LD_LIBRARY_PATH="$(dirname "$exe")/lib" ldd "$lib" | grep 'not found'; then
      echo "LOI: $lib thieu thu vien"; exit 1
    fi
  done
  [ -f "/usr/share/applications/$p.desktop" ] || { echo "LOI: thieu .desktop"; exit 1; }
}

if [ "$kind" = apt ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null
  [ ${#pkgs[@]} -gt 0 ] || mapfile -t pkgs < <(curl -fsSL "$base/packages.txt")
  # --- lenh tren website (chi doi goc kho khi chay thu cuc bo) ---
  curl -fsSL "$base/tsudev-archive-keyring.gpg" | tee /usr/share/keyrings/tsudev.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/tsudev.gpg] $base/apt stable main" | tee /etc/apt/sources.list.d/tsudev.list
  apt-get update 2>&1 | tee /tmp/apt-update.log
  if grep -E '^(W|E):' /tmp/apt-update.log; then echo "LOI: apt update canh bao/loi (chu ky?)"; exit 1; fi
  for p in "${pkgs[@]}"; do
    apt-get install -y "$p"
    kiem_goi "$p"
    apt-get remove -y --purge "$p"
    [ ! -e "/opt/$p" ] || { echo "LOI: go khong sach /opt/$p"; exit 1; }
  done
else
  dnf install -y -q curl findutils >/dev/null
  [ ${#pkgs[@]} -gt 0 ] || mapfile -t pkgs < <(curl -fsSL "$base/packages.txt")
  # --- lenh tren website (gpgcheck=1 + repo_gpgcheck=1: dnf tu choi goi/sieu du lieu khong ky dung khoa) ---
  curl -fsSLo /etc/yum.repos.d/tsudev.repo "$base/rpm/tsudev.repo"
  sed -i "s#https://pkg.tsudev.com#$base#g" /etc/yum.repos.d/tsudev.repo
  for p in "${pkgs[@]}"; do
    dnf install -y "$p"
    kiem_goi "$p"
    dnf remove -y "$p"
    [ ! -e "/opt/$p" ] || { echo "LOI: go khong sach /opt/$p"; exit 1; }
  done
fi
[ ${#pkgs[@]} -gt 0 ] || { echo "LOI: khong co goi nao de kiem"; exit 1; }
echo "DAT: ${pkgs[*]} ($kind, $base)"
