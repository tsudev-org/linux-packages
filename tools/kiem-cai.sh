#!/usr/bin/env bash
# Cai THAT moi goi trong kho bang dung lenh in tren website, kiem roi go sach (PACKAGING.md muc 7, 9).
#   kiem-cai.sh apt|rpm <goc-kho> [goi...]      vd: kiem-cai.sh apt https://pkg.tsudev.com tsudev-lotus
#   Khong ghi goi -> cai moi goi liet ke o <goc-kho>/packages.txt.
#   Sau do kiem duong chuyen ten (<goc-kho>/chuyen-tiep.txt, dong "<ten cu> <ten moi>"): cai ten cu -> ra goi moi.
#   NANG_CAP_TU=<kho khac> (vd https://pkg.tsudev.com): cai ten cu TU KHO DO truoc, roi `apt upgrade` / `dnf upgrade`
#   tu <goc-kho> phai tu chuyen sang goi moi va go sach /opt/<ten cu>.
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

kiem_chuyen() {  # <ten cu> <ten moi>: goi moi da cai + chay duoc, tep cua goi cu da go
  kiem_goi "$2"
  [ ! -e "/opt/$1" ] || { echo "LOI: con /opt/$1 sau khi chuyen sang $2"; exit 1; }
  [ ! -e "/usr/bin/$1" ] || { echo "LOI: con /usr/bin/$1 sau khi chuyen sang $2"; exit 1; }
}

if [ "$kind" = apt ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null
  them_kho() {
    # --- lenh tren website (chi doi goc kho khi chay thu cuc bo) ---
    curl -fsSL "$1/tsudev-archive-keyring.gpg" | tee /usr/share/keyrings/tsudev.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/tsudev.gpg] $1/apt stable main" | tee /etc/apt/sources.list.d/tsudev.list
    apt-get update 2>&1 | tee /tmp/apt-update.log
    if grep -E '^(W|E):' /tmp/apt-update.log; then echo "LOI: apt update canh bao/loi (chu ky?)"; exit 1; fi
  }
  [ ${#pkgs[@]} -gt 0 ] || mapfile -t pkgs < <(curl -fsSL "$base/packages.txt")
  mapfile -t chuyen < <(curl -fsSL "$base/chuyen-tiep.txt" 2>/dev/null || true)
  if [ -n "${NANG_CAP_TU:-}" ] && [ ${#chuyen[@]} -gt 0 ]; then
    them_kho "$NANG_CAP_TU"
    for d in "${chuyen[@]}"; do read -r cu moi <<<"$d"; apt-get install -y "$cu"; done
  fi
  them_kho "$base"
  for p in "${pkgs[@]}"; do
    if [ -n "${NANG_CAP_TU:-}" ] && dpkg -s "$p" >/dev/null 2>&1; then continue; fi
    apt-get install -y "$p"
    kiem_goi "$p"
    apt-get remove -y --purge "$p"
    [ ! -e "/opt/$p" ] || { echo "LOI: go khong sach /opt/$p"; exit 1; }
  done
  if [ ${#chuyen[@]} -gt 0 ]; then
    if [ -n "${NANG_CAP_TU:-}" ]; then
      apt -y upgrade  # dung lenh nguoi dung go; `apt upgrade` duoc cai goi moi (goi chuyen tiep phu thuoc)
    else
      for d in "${chuyen[@]}"; do read -r cu moi <<<"$d"; apt-get install -y "$cu"; done
    fi
    for d in "${chuyen[@]}"; do
      read -r cu moi <<<"$d"
      kiem_chuyen "$cu" "$moi"
      apt-get remove -y --purge "$cu" "$moi"
      [ ! -e "/opt/$moi" ] || { echo "LOI: go khong sach /opt/$moi"; exit 1; }
    done
  fi
else
  dnf install -y -q curl findutils >/dev/null
  them_kho() {
    # --- lenh tren website (gpgcheck=1 + repo_gpgcheck=1: dnf tu choi goi/sieu du lieu khong ky dung khoa) ---
    curl -fsSLo /etc/yum.repos.d/tsudev.repo "$1/rpm/tsudev.repo"
    sed -i "s#https://pkg.tsudev.com#$1#g" /etc/yum.repos.d/tsudev.repo
    dnf clean all -q
  }
  [ ${#pkgs[@]} -gt 0 ] || mapfile -t pkgs < <(curl -fsSL "$base/packages.txt")
  mapfile -t chuyen < <(curl -fsSL "$base/chuyen-tiep.txt" 2>/dev/null || true)
  if [ -n "${NANG_CAP_TU:-}" ] && [ ${#chuyen[@]} -gt 0 ]; then
    them_kho "$NANG_CAP_TU"
    for d in "${chuyen[@]}"; do read -r cu moi <<<"$d"; dnf install -y "$cu"; done
  fi
  them_kho "$base"
  for p in "${pkgs[@]}"; do
    if [ -n "${NANG_CAP_TU:-}" ] && rpm -q "$p" >/dev/null 2>&1; then continue; fi
    dnf install -y "$p"
    kiem_goi "$p"
    dnf remove -y "$p"
    [ ! -e "/opt/$p" ] || { echo "LOI: go khong sach /opt/$p"; exit 1; }
  done
  if [ ${#chuyen[@]} -gt 0 ]; then
    if [ -n "${NANG_CAP_TU:-}" ]; then
      dnf upgrade -y  # Obsoletes trong goi moi -> dnf tu thay goi cu
    else
      for d in "${chuyen[@]}"; do read -r cu moi <<<"$d"; dnf install -y "$cu"; done  # Provides ten cu
    fi
    for d in "${chuyen[@]}"; do
      read -r cu moi <<<"$d"
      kiem_chuyen "$cu" "$moi"
      dnf remove -y "$moi"
      [ ! -e "/opt/$moi" ] || { echo "LOI: go khong sach /opt/$moi"; exit 1; }
    done
  fi
fi
[ ${#pkgs[@]} -gt 0 ] || { echo "LOI: khong co goi nao de kiem"; exit 1; }
echo "DAT: ${pkgs[*]} ($kind, $base)"
