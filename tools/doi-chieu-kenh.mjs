#!/usr/bin/env node
// Đối chiếu ba kênh gói với tệp Release THẬT của repo app (phiếu 20261115-01 mục 2.2).
//
//   node tools/doi-chieu-kenh.mjs            # in bảng, thoát 1 nếu có lệch
//   GITHUB_TOKEN=... node tools/doi-chieu-kenh.mjs   # tránh giới hạn 60 lượt/giờ của API ẩn danh
//
// Kiểm:
//   - Scoop (tsudev-org/scoop-bucket): mỗi manifest có `url` + `hash` - url trỏ đúng một tệp của một Release có thật,
//     hash bằng digest SHA-256 GitHub ghi cho tệp đó, và Release đó là bản MỚI NHẤT của repo app.
//   - Homebrew (tsudev-org/homebrew-tap): như trên cho từng cặp url/sha256 của cask (nội suy #{version}).
//   - APT/RPM (pkg.tsudev.com/catalog.json): `tag` của gói là Release mới nhất của `releaseRepo`, mọi tệp .deb/.rpm
//     trong `files` trả 200. (Gói deb/rpm được DỰNG LẠI bằng nfpm từ tệp Release đã kiểm sha256 lúc dựng - xem
//     tools/dung_kho.py build_one - nên sha256 của .deb không so được với tệp Release; ở đây chỉ canh độ trễ.)
//   - Khuôn thẻ (VERSIONING.md v3 mục 2.2, phiếu 20261117-V1 bước 9) - chỉ LƯU Ý, không làm đỏ:
//     (a) thẻ Release mới nhất của mỗi repo app có khớp `vYY.M.DDNN[-beta.N|-rc.N]` không (thẻ cũ bất biến, khuôn mới
//         áp cho bản KẾ TIẾP); (b) `checkver` Scoop / `livecheck` Homebrew có nhận một thẻ khuôn mới không - không nhận
//         thì ngày app đổi khuôn kênh đó đứng ở bản cũ IM LẶNG, phải sửa cùng PR đổi khuôn của app.
//     (APT/RPM đọc `release.tagRegex` trong `packaging/package.json` của từng app - kiểm ở repo app, không ở đây.)
//
// Không phụ thuộc gói npm nào (fetch của Node 20+).

const API = 'https://api.github.com';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'tsudev-doi-chieu-kenh',
  ...(token && { authorization: `Bearer ${token}` }),
};

async function get(url, { json = true, ok404 = false } = {}) {
  for (let i = 0; i < 4; i++) {
    let r;
    try {
      r = await fetch(url, { headers: url.startsWith(API) ? headers : { 'user-agent': headers['user-agent'] } });
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
      continue;
    }
    if (r.status === 404 && ok404) return null;
    if (r.ok) return json ? r.json() : r.text();
    if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${url}`);
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  throw new Error(`hết lượt thử: ${url}`);
}

async function head(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': headers['user-agent'] } });
      if (r.status < 500 || i === 3) return r.status;
    } catch (e) {
      if (i === 3) return `lỗi mạng (${e.cause?.code || e.message})`;
    }
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
}

const cache = new Map();
const once = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));
const daXemRepo = new Set();
const latest = (repo) => (daXemRepo.add(repo), once(`latest:${repo}`, () => get(`${API}/repos/${repo}/releases/latest`)));

// Khuôn thẻ VERSIONING.md v3 mục 2.2 + một thẻ mẫu theo khuôn đó để thử regex của kênh.
const KHUON_THE = /^v\d{2}\.\d{1,2}\.\d{4}(-(beta|rc)\.\d+)?$/;
const THE_MAU = 'v26.11.1801';
const luuY = [];
/** Regex của kênh (cú pháp .NET/Ruby: `(?<ten>` dùng được nguyên trong JS) có bắt được thẻ mẫu khuôn mới không. */
function nhanKhuonMoi(nguon, mau = THE_MAU) {
  try {
    return new RegExp(nguon, 'i').test(mau);
  } catch {
    return null;
  }
}
const byTag = (repo, tag) =>
  once(`tag:${repo}:${tag}`, () => get(`${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { ok404: true }));

// GitHub chuyển hướng tên repo cũ; đưa về tên hiện tại để so "mới nhất" cho đúng repo.
const canon = (repo) => once(`repo:${repo}`, async () => (await get(`${API}/repos/${repo}`)).full_name);

const loi = [];
const dong = [];
function ghi(kenh, goi, ketQua, chiTiet = '') {
  dong.push([kenh, goi, ketQua, chiTiet]);
  if (ketQua !== 'OK') loi.push(`${kenh} ${goi}: ${chiTiet}`);
}

/** Kiểm một cặp (url tệp Release, sha256 khai báo). Trả chuỗi lỗi hoặc null. */
async function kiemTep(url, sha) {
  const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^#?]+)/);
  if (!m) return `url không phải tệp Release GitHub: ${url}`;
  const [, repoKhai, tag, ten] = m;
  const repo = await canon(repoKhai);
  const rel = await byTag(repo, decodeURIComponent(tag));
  if (!rel) return `không có Release ${tag} ở ${repo}`;
  const asset = rel.assets.find((a) => a.name === decodeURIComponent(ten));
  if (!asset) return `Release ${tag} không có tệp ${ten}`;
  const that = (asset.digest || '').replace(/^sha256:/, '').toLowerCase();
  if (!that) return `GitHub không ghi digest cho ${ten}`;
  if (that !== sha.toLowerCase()) return `sha256 lệch: khai ${sha.slice(0, 12)}…, Release ${that.slice(0, 12)}…`;
  const moi = await latest(repo);
  if (moi.tag_name !== rel.tag_name) return `chậm: đang ${rel.tag_name}, Release mới nhất ${moi.tag_name}`;
  return null;
}

async function scoop() {
  const ds = await get(`${API}/repos/tsudev-org/scoop-bucket/contents/bucket`);
  for (const f of ds.filter((x) => x.name.endsWith('.json'))) {
    const goi = f.name.replace(/\.json$/, '');
    const m = await get(f.download_url);
    const cap = [];
    const them = (u, h) => {
      const us = [].concat(u ?? []);
      const hs = [].concat(h ?? []);
      us.forEach((x, i) => cap.push([x.split('#')[0], hs[i]]));
    };
    const cv = m.checkver;
    if (cv && typeof cv === 'object' && cv.regex) {
      // checkver đọc thẳng JSON (không jsonpath) thì thử trên đoạn JSON chứa thẻ mẫu.
      const mau = cv.jsonpath ? THE_MAU : `"tag_name": "${THE_MAU}"`;
      if (nhanKhuonMoi(cv.regex, mau) === false)
        luuY.push(`scoop ${goi}: checkver.regex chưa nhận thẻ khuôn mới (${THE_MAU}) - sửa checkver + autoupdate cùng PR đổi khuôn của app`);
    }
    them(m.url, m.hash);
    for (const a of Object.values(m.architecture ?? {})) them(a.url, a.hash);
    if (cap.length === 0) {
      ghi('scoop', goi, 'OK', 'không có url (gói chuyển tiếp/phụ thuộc)');
      continue;
    }
    const sai = [];
    for (const [u, h] of cap) {
      if (!h) sai.push(`thiếu hash cho ${u}`);
      else {
        const e = await kiemTep(u, h);
        if (e) sai.push(e);
      }
    }
    ghi('scoop', goi, sai.length ? 'LỆCH' : 'OK', sai.join('; ') || m.version);
  }
}

async function homebrew() {
  const ds = await get(`${API}/repos/tsudev-org/homebrew-tap/contents/Casks`);
  for (const f of ds.filter((x) => x.name.endsWith('.rb'))) {
    const goi = f.name.replace(/\.rb$/, '');
    const rb = await get(f.download_url, { json: false });
    const version = (rb.match(/^\s*version\s+"([^"]+)"/m) || [])[1];
    // `url "...#{version.split("-").first}..."` có nháy kép LỒNG trong nội suy: lấy tới nháy cuối dòng.
    const urls = [...rb.matchAll(/^\s*url\s+"(.*)"\s*$/gm)].map((x) => x[1]).filter((u) => u.startsWith('https://'));
    // Hai dạng: `sha256 "x"` hoặc `arch arm: "arm64", intel: "x64"` + `sha256 arm: "a", intel: "b"`.
    const archM = rb.match(/^\s*arch\s+arm:\s*"([^"]+)",\s*intel:\s*"([^"]+)"/m);
    const shaArch = rb.match(/sha256\s+arm:\s*"([0-9a-f]{64})",\s*intel:\s*"([0-9a-f]{64})"/);
    let cap = [];
    if (archM && shaArch && urls.length === 1) {
      cap = [
        [urls[0].replaceAll('#{arch}', archM[1]), shaArch[1]],
        [urls[0].replaceAll('#{arch}', archM[2]), shaArch[2]],
      ];
    } else {
      const shas = [...rb.matchAll(/^\s*sha256\s+"([0-9a-f]{64})"/gm)].map((x) => x[1]);
      if (shas.length === urls.length) cap = urls.map((u, i) => [u, shas[i]]);
    }
    const lc = rb.match(/livecheck do[\s\S]*?regex\(\/(.*)\/[a-z]*\)/);
    if (lc && nhanKhuonMoi(lc[1]) === false)
      luuY.push(`brew ${goi}: livecheck regex chưa nhận thẻ khuôn mới (${THE_MAU}) - sửa livecheck + url cùng PR đổi khuôn của app`);
    if (!version || cap.length === 0) {
      ghi('brew', goi, 'LỆCH', `không đọc được cask (version=${version}, url=${urls.length})`);
      continue;
    }
    const noi = (u) =>
      u
        .replaceAll('#{version.split("-").first}', version.split('-')[0])
        .replaceAll('#{version.csv.first}', version.split(',')[0])
        .replaceAll('#{version}', version);
    const sai = [];
    for (const [tpl, sha] of cap) {
      const u = noi(tpl);
      if (u.includes('#{')) sai.push(`không nội suy được ${tpl}`);
      else {
        const e = await kiemTep(u, sha);
        if (e) sai.push(e);
      }
    }
    ghi('brew', goi, sai.length ? 'LỆCH' : 'OK', sai.join('; ') || version);
  }
}

async function aptRpm() {
  const cat = await get('https://pkg.tsudev.com/catalog.json');
  for (const p of cat.packages) {
    const sai = [];
    const repo = await canon(p.releaseRepo);
    const moi = await latest(repo);
    if (moi.tag_name !== p.tag) sai.push(`chậm: kho ${p.tag}, Release mới nhất ${moi.tag_name}`);
    for (const u of [...(p.deb?.files ?? []), ...(p.rpm?.files ?? [])]) {
      const s = await head(u);
      if (s !== 200) sai.push(`${s} ${u}`);
    }
    ghi('apt/rpm', p.name, sai.length ? 'LỆCH' : 'OK', sai.join('; ') || p.version);
  }
}

for (const [ten, f] of [
  ['scoop', scoop],
  ['brew', homebrew],
  ['apt/rpm', aptRpm],
]) {
  try {
    await f();
  } catch (e) {
    ghi(ten, '*', 'LỖI', String(e.message || e));
  }
}

for (const repo of [...daXemRepo].sort()) {
  try {
    const t = (await latest(repo)).tag_name;
    if (!KHUON_THE.test(t)) luuY.push(`${repo}: thẻ mới nhất ${t} lệch khuôn vYY.M.DDNN - bản KẾ TIẾP theo VERSIONING.md mục 2.2`);
  } catch {
    /* lỗi tải đã ghi ở bước kênh */
  }
}

const w = [0, 1, 2].map((i) => Math.max(...dong.map((d) => d[i].length)));
for (const d of dong) console.log(d.slice(0, 3).map((c, i) => c.padEnd(w[i])).join('  '), ' ', d[3]);
if (luuY.length) {
  console.log(`\n${luuY.length} lưu ý khuôn thẻ (không làm đỏ):`);
  for (const l of [...new Set(luuY)].sort()) console.log(` - ${l}`);
}
if (loi.length) {
  console.error(`\n${loi.length} lệch:`);
  for (const l of loi) console.error(` - ${l}`);
  process.exit(1);
}
console.log(`\nKhớp: ${dong.length} gói.`);
