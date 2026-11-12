#!/usr/bin/env python3
"""Dung kho APT/RPM cua tsudev tu GitHub Releases (PACKAGING.md muc 5).

Nguon khai bao: `packaging/package.json` trong tung repo san pham (liet ke o `products.json`).
Goi .deb/.rpm dung bang nfpm tu CHINH tep phat hanh Linux (khong build lai), kiem SHA-256 voi
tep tong kiem cua Release truoc khi dong goi. Goi da phat hanh tren kho (cung ten) duoc tai lai
nguyen ven thay vi dung lai, de checksum khong doi giua cac lan chay.

  python3 tools/dung_kho.py plan  --out plan.json             # chi liet ke goi can co
  python3 tools/dung_kho.py build --out site --key <van tay>  # dung + ky toan bo kho

Chi dung thu vien chuan. Cong cu ngoai: nfpm, apt-ftparchive, createrepo_c, rpmsign, gpg.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
BASE_URL = "https://pkg.tsudev.com"
MAINTAINER = "tsudev <pkg@tsudev.com>"
# Kien truc trong package.json -> (deb, rpm)
ARCH = {"x64": ("amd64", "x86_64"), "arm64": ("arm64", "aarch64")}
UA = "tsudev-linux-packages/1"


def log(*a: object) -> None:
    print(*a, file=sys.stderr, flush=True)


def http_get(url: str, *, api: bool = False, retries: int = 4) -> bytes:
    headers = {"User-Agent": UA}
    if api:
        headers["Accept"] = "application/vnd.github+json"
        tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if tok:
            headers["Authorization"] = f"Bearer {tok}"
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or i == retries - 1:
                raise
        except urllib.error.URLError:
            if i == retries - 1:
                raise
        time.sleep(2 ** i)
    raise RuntimeError("khong toi duoc")


def http_exists(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status == 200
    except urllib.error.URLError:
        return False


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    log("$", " ".join(cmd))
    return subprocess.run(cmd, check=True, **kw)


# ---------------------------------------------------------------- khai bao san pham

def load_manifest(entry: dict, manifest_dir: Path | None) -> dict:
    repo = entry["repo"]
    name = repo.split("/")[1]
    if manifest_dir and (manifest_dir / f"{name}.json").exists():
        return json.loads((manifest_dir / f"{name}.json").read_text(encoding="utf-8"))
    ref = entry.get("ref", "main")
    url = f"https://raw.githubusercontent.com/{repo}/{ref}/packaging/package.json"
    return json.loads(http_get(url))


TEN_GOI = r"tsudev-[a-z0-9-]+"


def validate(m: dict, entry: dict) -> None:
    for k in ("schema", "name", "homepage", "license", "description", "release", "assets", "linux"):
        if k not in m:
            raise SystemExit(f"package.json cua {m.get('name')} thieu truong {k}")
    if m["schema"] != 1:
        raise SystemExit(f"{m['name']}: schema {m['schema']} chua ho tro")
    # Ten rieng (khong tien to tsudev-) chi khi products.json ghi dich danh `tenRieng` cho dung repo do:
    # thay doi phai qua PR cua repo nay (san pham co thuong hieu rieng, vd Lotus Share).
    if not re.fullmatch(TEN_GOI, m["name"]) and not (
            entry.get("tenRieng") == m["name"] and re.fullmatch(r"[a-z][a-z0-9-]+", m["name"])):
        raise SystemExit(f"ten goi sai khuon PACKAGING.md muc 2: {m['name']}")
    for cu in m["linux"].get("formerNames", []):
        # Ten cu = ma da cong bo (PACKAGING.md muc 2: MUST NOT bo) -> giu bang goi chuyen tiep.
        if not re.fullmatch(TEN_GOI, cu) or cu == m["name"]:
            raise SystemExit(f"{m['name']}: linux.formerNames khong hop le: {cu}")
    if not re.fullmatch(r"[a-z0-9-]+", m["linux"]["command"]):
        raise SystemExit(f"{m['name']}: linux.command khong hop le")


def wants_linux(m: dict) -> bool:
    ch = set(m.get("channels", [])) | set(m.get("planned", []))
    return bool(ch & {"apt", "rpm"})


def py_regex(r: str) -> re.Pattern:
    return re.compile(r.replace("(?<", "(?P<"))


def plan_product(m: dict, keep: int) -> list[dict]:
    """Toi da `keep` ban phat hanh moi nhat co tep Linux -> danh sach goi can co."""
    rel = m["release"]
    tag_re = py_regex(rel["tagRegex"])
    linux_assets = {k: v for k, v in m["assets"].items() if k.startswith("linux-") and v.get("kind") == "tar"}
    if not linux_assets:
        return []
    releases = json.loads(http_get(f"https://api.github.com/repos/{rel['repo']}/releases?per_page=30", api=True))
    releases = [r for r in releases if not r["draft"] and not r["prerelease"]]
    releases.sort(key=lambda r: r["published_at"], reverse=True)
    out: list[dict] = []
    for r in releases:
        mt = tag_re.fullmatch(r["tag_name"])
        if not mt or "version" not in mt.groupdict():
            continue
        version = mt.group("version")
        revision = (mt.groupdict().get("revision") or "1")
        names = {a["name"]: a["browser_download_url"] for a in r["assets"]}
        pkgs = []
        for key, a in linux_assets.items():
            arch = key.removeprefix("linux-")
            if arch not in ARCH:
                continue
            fname = a["file"].replace("{version}", version)
            if fname not in names:
                continue
            deb_arch, rpm_arch = ARCH[arch]
            pkgs.append({
                "name": m["name"], "version": version, "revision": revision, "arch": arch,
                "tag": r["tag_name"], "published": r["published_at"],
                "asset": fname, "asset_url": names[fname],
                "sums_url": names.get(rel.get("sums", "")),
                "deb": f"{m['name']}_{version}-{revision}_{deb_arch}.deb",
                "rpm": f"{m['name']}-{version}-{revision}.{rpm_arch}.rpm",
                "deb_arch": deb_arch, "rpm_arch": rpm_arch,
            })
        if pkgs and not out:
            # Ban moi nhat: them goi chuyen tiep cho moi ten cu (chi .deb; rpm dung Provides/Obsoletes).
            for p in list(pkgs):
                for cu in m["linux"].get("formerNames", []):
                    pkgs.append({**p, "name": cu, "transitional_for": m["name"], "formats": ["deb"],
                                 "deb": f"{cu}_{version}-{revision}_{p['deb_arch']}.deb", "rpm": None})
        if pkgs:
            out.extend(pkgs)
            if len({p["tag"] for p in out}) >= keep:
                break
    return out


def formats(p: dict) -> list[str]:
    return p.get("formats", ["deb", "rpm"])


def pkg_paths(p: dict) -> list[str]:
    return [deb_path(p) if f == "deb" else rpm_path(p) for f in formats(p)]


def deb_path(p: dict) -> str:
    return f"apt/pool/main/{p['name'][0]}/{p['name']}/{p['deb']}"


def rpm_path(p: dict) -> str:
    return f"rpm/{p['rpm_arch']}/{p['rpm']}"


# ---------------------------------------------------------------- dong goi

def desktop_entry(m: dict) -> str:
    d = m["linux"]["desktop"]
    gn = d.get("genericName", {})
    lines = [
        "[Desktop Entry]", "Type=Application", f"Name={d['name']}",
        f"GenericName={gn.get('en', '')}", f"GenericName[vi]={gn.get('vi', '')}",
        f"Comment={m['description']['en']}", f"Comment[vi]={m['description']['vi']}",
        f"Exec={m['linux']['command']} %U", f"Icon={m['name']}", "Terminal=false",
        "Categories=" + "".join(c + ";" for c in d.get("categories", [])),
        "Keywords=" + "".join(k + ";" for k in d.get("keywords", [])),
        "StartupNotify=true",
    ]
    if d.get("wmClass"):
        lines.append(f"StartupWMClass={d['wmClass']}")
    return "\n".join(lines) + "\n"


def safe_extract(tgz: Path, dest: Path) -> None:
    with tarfile.open(tgz) as t:
        t.extractall(dest, filter="data")  # chan duong dan tuyet doi, "..", lien ket ra ngoai


def sums_lookup(sums: bytes, fname: str) -> str | None:
    for line in sums.decode("utf-8", "replace").splitlines():
        parts = line.strip().split()
        if len(parts) >= 2 and parts[-1].lstrip("*").lstrip("./") == fname:
            return parts[0].lower()
    return None


def build_transitional(m: dict, p: dict, work: Path, out: Path, nfpm: str) -> None:
    """Goi .deb rong ten cu, phu thuoc goi moi: `apt upgrade` tu cai goi moi va go tep cua goi cu."""
    stage = work / f"stage-{p['name']}-{p['version']}-{p['arch']}"
    stage.mkdir(parents=True)
    new = p["transitional_for"]
    cfg = {
        "name": p["name"], "arch": p["deb_arch"], "platform": "linux",
        "version": p["version"], "release": p["revision"], "version_schema": "none",
        "maintainer": MAINTAINER, "vendor": "tsudev", "homepage": m["homepage"], "license": m["license"],
        "description": f"transitional package - renamed to {new}\n"
                       f"This package moves existing installations to {new}. It can be removed safely.",
        "mtime": datetime.fromisoformat(p["published"].replace("Z", "+00:00")).isoformat(),
        "depends": [f"{new} (>= {p['version']}-{p['revision']})"],
        "section": "oldlibs", "priority": "optional",
    }
    cfg_path = stage / "nfpm.json"
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf-8")
    dst = out / deb_path(p)
    dst.parent.mkdir(parents=True, exist_ok=True)
    run([nfpm, "package", "--config", str(cfg_path), "--packager", "deb", "--target", str(dst)])
    if not dst.exists():
        raise SystemExit(f"nfpm khong tao {dst}")
    shutil.rmtree(stage)


def build_one(m: dict, p: dict, work: Path, out: Path, nfpm: str) -> None:
    dl = work / p["asset"]
    log(f"tai {p['asset_url']}")
    dl.write_bytes(http_get(p["asset_url"]))
    if not p["sums_url"]:
        raise SystemExit(f"{p['tag']}: Release thieu tep tong kiem - khong dong goi tep chua kiem")
    want = sums_lookup(http_get(p["sums_url"]), p["asset"])
    got = sha256(dl)
    if want != got:
        raise SystemExit(f"SAI SHA-256 {p['asset']}: Release ghi {want}, tai ve {got}")
    log(f"SHA-256 khop: {p['asset']}")

    stage = work / f"stage-{p['name']}-{p['version']}-{p['arch']}"
    (stage / "root").mkdir(parents=True)
    safe_extract(dl, stage / "root")
    lx = m["linux"]
    bin_rel = m["assets"][f"linux-{p['arch']}"]["bin"]
    if not (stage / "root" / bin_rel).is_file():
        raise SystemExit(f"{p['asset']} khong co tep chay {bin_rel}")
    (stage / f"{m['name']}.desktop").write_text(desktop_entry(m), encoding="utf-8")

    opt = f"/opt/{m['name']}"
    contents = [
        {"src": str(stage / "root"), "dst": opt, "type": "tree"},
        {"src": f"{opt}/{bin_rel}", "dst": f"/usr/bin/{lx['command']}", "type": "symlink"},
        {"src": str(stage / f"{m['name']}.desktop"), "dst": f"/usr/share/applications/{m['name']}.desktop",
         "file_info": {"mode": 0o644}},
    ]
    if lx.get("icon") and (stage / "root" / lx["icon"]).is_file():
        contents.append({"src": str(stage / "root" / lx["icon"]),
                         "dst": f"/usr/share/icons/hicolor/512x512/apps/{m['name']}.png", "file_info": {"mode": 0o644}})
    mtime = datetime.fromisoformat(p["published"].replace("Z", "+00:00")).isoformat()
    cfg = {
        "name": m["name"], "arch": p["deb_arch"], "platform": "linux",
        "version": p["version"], "release": p["revision"], "version_schema": "none",
        "maintainer": MAINTAINER, "vendor": "tsudev", "homepage": m["homepage"], "license": m["license"],
        # Dong dau = tom tat ngan (Debian Policy 3.4.1), phan sau = mo ta day du.
        "description": m["linux"]["desktop"]["genericName"]["en"] + "\n" + m["description"]["en"], "mtime": mtime,
        "contents": contents,
        "deb": {"fields": {}},
        "overrides": {
            "deb": {"depends": lx["deb"]["depends"]},
            "rpm": {
                "depends": lx["rpm"]["depends"],
                # Doi ten goi (Fedora Packaging Guidelines, "Renaming/Replacing"): dnf upgrade tu thay goi cu.
                # nfpm: `replaces` cua rpm = Obsoletes.
                "provides": [f"{cu} = {p['version']}-{p['revision']}" for cu in lx.get("formerNames", [])],
                "replaces": [f"{cu} < {p['version']}-{p['revision']}" for cu in lx.get("formerNames", [])],
            },
        },
        "section": lx["deb"].get("section", "misc"), "priority": "optional",
        "rpm": {"group": lx["rpm"].get("group", "Applications/System"), "summary": m["linux"]["desktop"]["genericName"]["en"]},
    }
    cfg_path = stage / "nfpm.json"  # JSON la YAML hop le
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf-8")
    for fmt, rel in (("deb", deb_path(p)), ("rpm", rpm_path(p))):  # nfpm tu doi amd64 -> x86_64 cho rpm
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        run([nfpm, "package", "--config", str(cfg_path), "--packager", fmt, "--target", str(dst)])
        if not dst.exists():
            raise SystemExit(f"nfpm khong tao {dst}")
    shutil.rmtree(stage)
    dl.unlink()


# ---------------------------------------------------------------- ky + sieu du lieu

def gpg(key: str, *args: str) -> None:
    run(["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase", "",
         "--digest-algo", "SHA512", "--local-user", key, *args])


def apt_metadata(out: Path, key: str, archs: list[str]) -> None:
    apt = out / "apt"
    dist = apt / "dists/stable"
    for a in archs:
        d = dist / f"main/binary-{a}"
        d.mkdir(parents=True, exist_ok=True)
        pk = subprocess.run(["apt-ftparchive", "--arch", a, "packages", "pool/main"], cwd=apt,
                            check=True, capture_output=True).stdout
        (d / "Packages").write_bytes(pk)
        (d / "Packages.gz").write_bytes(gzip.compress(pk, mtime=0))
    opts = {
        "Origin": "tsudev", "Label": "tsudev", "Suite": "stable", "Codename": "stable",
        "Architectures": " ".join(archs), "Components": "main",
        "Description": "tsudev - https://tsudev.com/apps",
    }
    cmd = ["apt-ftparchive"]
    for k, v in opts.items():
        cmd += ["-o", f"APT::FTPArchive::Release::{k}={v}"]
    rel = subprocess.run(cmd + ["release", "."], cwd=dist, check=True, capture_output=True).stdout
    (dist / "Release").write_bytes(rel)
    gpg(key, "--clearsign", "-o", str(dist / "InRelease"), str(dist / "Release"))
    gpg(key, "--armor", "--detach-sign", "-o", str(dist / "Release.gpg"), str(dist / "Release"))


def rpm_sign(out: Path, key: str, rebuilt: list[Path]) -> None:
    if not rebuilt:
        return
    run(["rpmsign", "--define", f"_gpg_name {key}", "--define", "_gpg_digest_algo sha512",
         "--define", "__gpg_sign_cmd %{__gpg} gpg --batch --no-verbose --no-armor --pinentry-mode loopback "
         "--passphrase '' --digest-algo sha512 -u %{_gpg_name} -sbo %{__signature_filename} %{__plaintext_filename}",
         "--addsign", *map(str, rebuilt)])


def rpm_metadata(out: Path, key: str) -> None:
    rp = out / "rpm"
    run(["createrepo_c", "--update", "--general-compress-type=gz", "--no-database", str(rp)])
    md = rp / "repodata/repomd.xml"
    gpg(key, "--armor", "--detach-sign", "-o", str(md) + ".asc", str(md))
    (rp / "tsudev.repo").write_text(
        "[tsudev]\nname=tsudev\nbaseurl=https://pkg.tsudev.com/rpm\nenabled=1\ngpgcheck=1\nrepo_gpgcheck=1\n"
        "gpgkey=https://pkg.tsudev.com/tsudev-archive-keyring.asc\nmetadata_expire=6h\n", encoding="utf-8")


def publish_keys(out: Path, key: str) -> None:
    """Khoa cong khai: dung ban da commit o keys/ neu dung la khoa dang ky (giu nguyen tung byte),
    neu khong (CI dung khoa tam) thi xuat tu GNUPGHOME."""
    kd = GOC / "keys"
    pub = kd / "tsudev-archive-keyring.gpg"
    if pub.exists():
        shown = subprocess.run(["gpg", "--show-keys", "--with-colons", str(pub)], capture_output=True, text=True).stdout
        if f"fpr:::::::::{key.upper()}:" in shown:
            for n in ("tsudev-archive-keyring.gpg", "tsudev-archive-keyring.asc"):
                shutil.copyfile(kd / n, out / n)
            return
    run(["gpg", "--batch", "--yes", "--export", "-o", str(out / "tsudev-archive-keyring.gpg"), key])
    run(["gpg", "--batch", "--yes", "--armor", "--export", "-o", str(out / "tsudev-archive-keyring.asc"), key])


def write_index(out: Path, products: list[dict], fpr: str) -> None:
    def cu(m: dict) -> str:
        old = m["linux"].get("formerNames", [])
        return f" (tên cũ {', '.join(f'<code>{o}</code>' for o in old)} tự chuyển khi cập nhật)" if old else ""
    rows = "".join(
        f"<li><code>{m['name']}</code> - {m['description']['vi']} (<a href=\"{m['homepage']}\">{m['homepage']}</a>){cu(m)}</li>"
        for m in products)
    html = f"""<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kho goi tsudev</title><style>body{{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;background:#0b0b0f;color:#e7e7ea}}
code,pre{{font-family:ui-monospace,monospace}}pre{{background:#17171d;padding:1rem;overflow-x:auto;border-radius:8px}}a{{color:#b69cff}}</style>
<h1>Kho gói APT / RPM của tsudev</h1>
<p>Vân tay khóa ký: <code>{fpr}</code>. Hướng dẫn đầy đủ và cách kiểm chứng: <a href="https://tsudev.com/apps">tsudev.com/apps</a>.</p>
<h2>Debian, Ubuntu, Mint</h2><pre>curl -fsSL https://pkg.tsudev.com/tsudev-archive-keyring.gpg | sudo tee /usr/share/keyrings/tsudev.gpg &gt;/dev/null
echo "deb [signed-by=/usr/share/keyrings/tsudev.gpg] https://pkg.tsudev.com/apt stable main" | sudo tee /etc/apt/sources.list.d/tsudev.list
sudo apt update &amp;&amp; sudo apt install &lt;tên-gói&gt;</pre>
<h2>Fedora, RHEL</h2><pre>sudo curl -fsSLo /etc/yum.repos.d/tsudev.repo https://pkg.tsudev.com/rpm/tsudev.repo
sudo dnf install &lt;tên-gói&gt;</pre>
<h2>Gói hiện có</h2><ul>{rows}</ul>
<p>Danh mục máy đọc (website, script cài đặt): <a href="/catalog.json"><code>catalog.json</code></a> - chỉ gồm gói đang có trong kho.</p></html>
"""
    (out / "index.html").write_text(html, encoding="utf-8")


# ---------------------------------------------------------------- catalog.json (giao dien may doc)

CATALOG_SCHEMA = 1
LENH_THEM_KHO = {
    "apt": [
        f"curl -fsSL {BASE_URL}/tsudev-archive-keyring.gpg | sudo tee /usr/share/keyrings/tsudev.gpg >/dev/null",
        f'echo "deb [signed-by=/usr/share/keyrings/tsudev.gpg] {BASE_URL}/apt stable main"'
        " | sudo tee /etc/apt/sources.list.d/tsudev.list",
        "sudo apt update",
    ],
    "dnf": [f"sudo curl -fsSLo /etc/yum.repos.d/tsudev.repo {BASE_URL}/rpm/tsudev.repo"],
}


def build_catalog(products: list[dict], plan: list[dict], fpr: str) -> dict:
    """Danh muc goi DANG CO trong kho - nguon duy nhat cho website *.tsudev.com, install.sh cua tsudev.com
    (PACKAGING.md muc 6, 8): chi goi da dung + ky moi vao day, nen khong hien lenh cho goi chua co.
    Tat dinh (khong dau thoi gian chay) de day-len-r2.sh bo qua khi khong doi."""
    pkgs = []
    for m in products:
        own = [p for p in plan if p["name"] == m["name"] and not p.get("transitional_for")]
        if not own:
            continue
        newest = max(own, key=lambda p: p["published"])
        latest = [p for p in own if p["tag"] == newest["tag"]]
        versions = []
        for p in sorted(own, key=lambda p: p["published"], reverse=True):
            v = f"{p['version']}-{p['revision']}"
            if v not in versions:
                versions.append(v)
        n = m["name"]
        pkgs.append({
            "name": n,
            "version": f"{newest['version']}-{newest['revision']}",
            "versions": versions,
            "published": newest["published"],
            "tag": newest["tag"],
            "releaseRepo": m["release"]["repo"],
            "homepage": m["homepage"],
            "license": m["license"],
            "description": m["description"],
            "displayName": m["linux"].get("desktop", {}).get("name", n),
            "command": m["linux"]["command"],
            "formerNames": m["linux"].get("formerNames", []),
            "arch": sorted(p["arch"] for p in latest),
            "deb": {"arch": sorted(p["deb_arch"] for p in latest),
                    "files": [f"{BASE_URL}/{deb_path(p)}" for p in latest]},
            "rpm": {"arch": sorted(p["rpm_arch"] for p in latest),
                    "files": [f"{BASE_URL}/{rpm_path(p)}" for p in latest]},
            "install": {"apt": f"sudo apt install {n}", "dnf": f"sudo dnf install {n}"},
            "installFull": {
                "apt": " && ".join(LENH_THEM_KHO["apt"] + [f"sudo apt install {n}"]),
                "dnf": " && ".join(LENH_THEM_KHO["dnf"] + [f"sudo dnf install {n}"]),
            },
        })
    return {
        "schema": CATALOG_SCHEMA,
        "base": BASE_URL,
        "updated": max((p["published"] for p in pkgs), default=None),
        "key": {
            "fingerprint": fpr.upper(),
            "gpg": f"{BASE_URL}/tsudev-archive-keyring.gpg",
            "asc": f"{BASE_URL}/tsudev-archive-keyring.asc",
        },
        "setup": LENH_THEM_KHO,
        "packages": sorted(pkgs, key=lambda p: p["name"]),
    }


def check_catalog(site: Path) -> None:
    """Moi goi trong catalog.json phai co that: ten + phien ban trong chi muc APT tung kien truc,
    tep .rpm ton tai, va khop packages.txt (kiem-cai.sh cai dung danh sach nay)."""
    cat = json.loads((site / "catalog.json").read_text(encoding="utf-8"))
    loi = []
    if cat.get("schema") != CATALOG_SCHEMA:
        loi.append(f"schema {cat.get('schema')}")
    names = [p["name"] for p in cat["packages"]]
    txt = [x for x in (site / "packages.txt").read_text().split() if x]
    if sorted(names) != sorted(txt):
        loi.append(f"catalog {names} khac packages.txt {txt}")
    for p in cat["packages"]:
        for a in p["deb"]["arch"]:
            idx = (site / f"apt/dists/stable/main/binary-{a}/Packages").read_text(encoding="utf-8")
            if f"Package: {p['name']}\n" not in idx or not re.search(
                    rf"Package: {re.escape(p['name'])}\n(?:[^\n]+\n)*?Version: {re.escape(p['version'])}\n", idx):
                loi.append(f"{p['name']} {p['version']} thieu trong Packages ({a})")
        for u in p["deb"]["files"] + p["rpm"]["files"]:
            if not (site / u.removeprefix(BASE_URL + "/")).is_file():
                loi.append(f"thieu tep {u}")
        if p["version"] != p["versions"][0]:
            loi.append(f"{p['name']}: version khong phai ban moi nhat")
    if loi:
        raise SystemExit("catalog.json sai:\n  " + "\n  ".join(loi))
    log("catalog.json dung: " + ", ".join(p["name"] + " " + p["version"] for p in cat["packages"]))


# ---------------------------------------------------------------- lenh

def collect(args) -> tuple[list[dict], list[dict]]:
    entries = json.loads((GOC / "products.json").read_text(encoding="utf-8"))["products"]
    mdir = Path(args.manifest_dir) if args.manifest_dir else None
    products, plan = [], []
    for e in entries:
        m = load_manifest(e, mdir)
        validate(m, e)
        if not wants_linux(m):
            log(f"bo qua {m['name']}: khong khai bao kenh apt/rpm")
            continue
        products.append(m)
        plan += plan_product(m, args.keep)
    return products, plan


def cmd_plan(args) -> None:
    products, plan = collect(args)
    files = sorted(f for p in plan for f in pkg_paths(p))
    Path(args.out).write_text(json.dumps({"files": files}, indent=1) + "\n")
    log(f"{len(files)} goi")


def cmd_build(args) -> None:
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    products, plan = collect(args)
    if not plan:
        raise SystemExit("khong co goi nao de dung")
    byname = {m["name"]: m for m in products}
    rebuilt_rpm: list[Path] = []
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for p in plan:
            paths = pkg_paths(p)
            reuse = args.reuse_from and all(http_exists(f"{args.reuse_from}/{r}") for r in paths)
            if reuse:
                for r in paths:
                    (out / r).parent.mkdir(parents=True, exist_ok=True)
                    (out / r).write_bytes(http_get(f"{args.reuse_from}/{r}"))
                log(f"giu nguyen {', '.join(paths)} (da phat hanh)")
            elif p.get("transitional_for"):
                build_transitional(byname[p["transitional_for"]], p, work, out, args.nfpm)
            else:
                build_one(byname[p["name"]], p, work, out, args.nfpm)
                rebuilt_rpm.append(out / rpm_path(p))
    rpm_sign(out, args.key, rebuilt_rpm)
    apt_metadata(out, args.key, sorted({p["deb_arch"] for p in plan}))
    rpm_metadata(out, args.key)
    publish_keys(out, args.key)
    write_index(out, products, args.key)
    (out / "packages.txt").write_text("".join(f"{m['name']}\n" for m in products))
    # "<ten cu> <ten moi>" moi dong - tools/kiem-cai.sh kiem duong chuyen tu ten cu.
    (out / "chuyen-tiep.txt").write_text("".join(
        f"{cu} {m['name']}\n" for m in products for cu in m["linux"].get("formerNames", [])))
    (out / "catalog.json").write_text(
        json.dumps(build_catalog(products, plan, args.key), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    check_catalog(out)
    files =sorted(str(f.relative_to(out)) for f in out.rglob("*") if f.is_file())
    (out / "manifest.json").write_text(json.dumps({
        "files": sorted(f for p in plan for f in pkg_paths(p)),
        "all": files,
        "sha256": {f: sha256(out / f) for f in files},
    }, indent=1) + "\n")
    log(f"XONG: {len(plan)} ban dung x 2 dinh dang trong {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for n in ("plan", "build"):
        s = sub.add_parser(n)
        s.add_argument("--out", required=True)
        s.add_argument("--keep", type=int, default=3, help="so ban phat hanh giu moi goi (PACKAGING.md muc 5)")
        s.add_argument("--manifest-dir", help="thu muc chua <repo>.json thay cho packaging/package.json tren GitHub")
        if n == "build":
            s.add_argument("--key", required=True, help="van tay khoa ky (trong GNUPGHOME)")
            s.add_argument("--nfpm", default="nfpm")
            s.add_argument("--reuse-from", help=f"tai lai goi da phat hanh tu day, vd {BASE_URL}")
    s = sub.add_parser("check-catalog", help="kiem catalog.json khop chi muc kho da dung")
    s.add_argument("--site", required=True)
    args = ap.parse_args()
    if args.cmd == "check-catalog":
        return check_catalog(Path(args.site))
    {"plan": cmd_plan, "build": cmd_build}[args.cmd](args)


if __name__ == "__main__":
    main()
