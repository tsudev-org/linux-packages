// Worker phuc vu https://pkg.tsudev.com tu bucket R2 `pkg-tsudev` (binding BUCKET).
//
// Vi sao can: ten mien tuy chinh cua R2 khong co "tai lieu chi muc" - `/`, `/apt/`, `/rpm/` tra trang 404 cua R2.
// Worker nay: `/` -> index.html, thu muc -> danh sach sinh tu R2, 404 tieng Viet, header bao mat, CORS cho du lieu
// cong khai, Range + ETag/If-* chuyen thang cho R2 (apt/dnf tai tiep), goi .deb/.rpm (bat bien) dem o bien Cloudflare.
// Khong ghi gi vao bucket; chi GET/HEAD/OPTIONS.

const HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const TYPES = {
  deb: 'application/vnd.debian.binary-package',
  rpm: 'application/x-rpm',
  gpg: 'application/pgp-keys',
  asc: 'application/pgp-signature',
  gz: 'application/gzip',
  xml: 'application/xml',
  json: 'application/json',
  html: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  repo: 'text/plain; charset=utf-8',
};

// Khoa hop le: chu, so, . _ - + ~ /; khong "..", khong "//", khong bat dau bang "/".
const KHOA_HOP_LE = /^(?:[A-Za-z0-9._+~-]+\/)*[A-Za-z0-9._+~-]*$/;

function baoMat(h, html) {
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  // Moi noi dung kho deu cong khai (goi, khoa, chi muc, catalog.json): cho website *.tsudev.com doc tu trinh duyet.
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Expose-Headers', 'ETag, Content-Length, Content-Range, Last-Modified');
  if (html) h.set('Content-Security-Policy', HTML_CSP);
  return h;
}

function loaiTep(key) {
  if (key.endsWith('keyring.asc')) return 'application/pgp-keys';
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1).toLowerCase() : '';
  return TYPES[ext] || (/(^|\/)(Release|InRelease|Packages)$/.test(key) ? 'text/plain; charset=utf-8' : 'application/octet-stream');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function kichThuoc(n) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

function khungHtml(tieuDe, than) {
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(tieuDe)}</title><meta name="robots" content="noindex">
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#1b1b1f;--mut:#5b5b66;--line:#e4e4ea;--acc:#6d4aff}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0f;--fg:#e7e7ea;--mut:#9a9aa6;--line:#24242c;--acc:#b69cff}}
body{font:15px/1.6 system-ui,sans-serif;max-width:56rem;margin:2rem auto;padding:0 1rem;background:var(--bg);color:var(--fg)}
a{color:var(--acc)}code{font-family:ui-monospace,monospace}table{width:100%;border-collapse:collapse}
td,th{text-align:left;padding:.35rem .5rem;border-bottom:1px solid var(--line);white-space:nowrap}
td:first-child{white-space:normal;word-break:break-all}th{color:var(--mut);font-weight:500}.r{text-align:right}
.mut{color:var(--mut)}</style>${than}</html>
`;
}

function traHtml(status, body, extra = {}) {
  const h = baoMat(new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...extra }), true);
  return new Response(body, { status, headers: h });
}

function trang404(path) {
  return traHtml(404, khungHtml('Không tìm thấy - pkg.tsudev.com', `
<h1>404 - Không tìm thấy</h1>
<p>Không có <code>${esc(path)}</code> trong kho gói tsudev.</p>
<p><a href="/">Trang kho gói</a> · <a href="/catalog.json">catalog.json</a> (danh sách gói đang có) ·
<a href="https://tsudev.com/apps">tsudev.com/apps</a></p>`));
}

async function danhSach(bucket, prefix, path) {
  const dirs = new Set();
  const files = [];
  let cursor;
  do {
    const r = await bucket.list({ prefix, delimiter: '/', cursor, limit: 1000 });
    for (const p of r.delimitedPrefixes || []) dirs.add(p);
    for (const o of r.objects || []) if (o.key !== prefix) files.push(o);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  if (!dirs.size && !files.length) return null;
  const ten = (k) => k.slice(prefix.length);
  const dong = [
    path !== '/' ? '<tr><td><a href="../">../</a></td><td></td><td></td></tr>' : '',
    ...[...dirs].sort().map((d) => `<tr><td><a href="/${esc(d)}">${esc(ten(d))}</a></td><td></td><td></td></tr>`),
    ...files.sort((a, b) => a.key.localeCompare(b.key)).map((o) =>
      `<tr><td><a href="/${esc(o.key)}">${esc(ten(o.key))}</a></td><td class="r">${kichThuoc(o.size)}</td><td class="mut">${o.uploaded ? new Date(o.uploaded).toISOString().slice(0, 16).replace('T', ' ') : ''}</td></tr>`),
  ].join('\n');
  return traHtml(200, khungHtml(`Index of ${path} - pkg.tsudev.com`, `
<h1>Index of <code>${esc(path)}</code></h1>
<p class="mut">Kho gói APT/RPM của tsudev - hướng dẫn cài ở <a href="/">trang chính</a>.</p>
<table><tr><th>Tên</th><th class="r">Kích thước</th><th>Cập nhật (UTC)</th></tr>
${dong}</table>`));
}

export async function xuLy(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method;
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: baoMat(new Headers({ 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since', 'Access-Control-Max-Age': '86400' })),
    });
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed\n', { status: 405, headers: baoMat(new Headers({ Allow: 'GET, HEAD, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' })) });
  }

  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return trang404(url.pathname); }
  let key = path.replace(/^\/+/, '');
  if (!KHOA_HOP_LE.test(key)) return trang404(path);

  // Thu muc: `/` -> index.html; `/x/` -> x/index.html neu co, khong thi danh sach.
  if (key === '' || key.endsWith('/')) {
    const idx = await env.BUCKET.head(`${key}index.html`);
    if (idx) key = `${key}index.html`;
    else {
      const r = await danhSach(env.BUCKET, key, path);
      return r || trang404(path);
    }
  }

  const immutable = /\.(deb|rpm)$/.test(key);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const rangeHdr = request.headers.get('Range');
  if (immutable && cache && method === 'GET' && !rangeHdr) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }

  const meta = await env.BUCKET.head(key);
  if (!meta) {
    // `/apt` (thieu dau /) ma la thu muc -> chuyen huong.
    const con = await env.BUCKET.list({ prefix: `${key}/`, limit: 1 });
    if (con.objects.length || (con.delimitedPrefixes || []).length) {
      return new Response(null, { status: 301, headers: baoMat(new Headers({ Location: `${url.pathname}/` })) });
    }
    return trang404(path);
  }

  const h = new Headers();
  meta.writeHttpMetadata(h);
  if (!h.has('Content-Type')) h.set('Content-Type', loaiTep(key));
  if (!h.has('Cache-Control')) h.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  h.set('ETag', meta.httpEtag);
  h.set('Last-Modified', new Date(meta.uploaded).toUTCString());
  h.set('Accept-Ranges', 'bytes');
  baoMat(h, (h.get('Content-Type') || '').startsWith('text/html'));

  if (chuaDoi(request.headers, meta)) return new Response(null, { status: 304, headers: h });
  if (method === 'HEAD') {
    h.set('Content-Length', String(meta.size));
    return new Response(null, { status: 200, headers: h });
  }

  // Range (RFC 9110 muc 14): tu phan tich roi dua R2 offset/length ro rang.
  let range = null;
  if (rangeHdr && ifRangeKhop(request.headers.get('If-Range'), meta)) {
    range = phanTichRange(rangeHdr, meta.size);
    if (range === 'khong-dat') {
      h.set('Content-Range', `bytes */${meta.size}`);
      h.set('Content-Type', 'text/plain; charset=utf-8');
      return new Response('Range Not Satisfiable\n', { status: 416, headers: h });
    }
  }
  const obj = await env.BUCKET.get(key, range ? { range } : {});
  if (!obj) return trang404(path);
  if (range) {
    h.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
    h.set('Content-Length', String(range.length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(meta.size));
  const res = new Response(obj.body, { status: 200, headers: h });
  if (immutable && cache) ctx?.waitUntil?.(cache.put(request, res.clone()));
  return res;
}

const boYeu = (t) => t.trim().replace(/^W\//, '');

/** If-None-Match (uu tien) / If-Modified-Since -> true neu client da co ban moi nhat (304). */
export function chuaDoi(headers, meta) {
  const inm = headers.get('If-None-Match');
  if (inm) return inm.trim() === '*' || inm.split(',').some((t) => boYeu(t) === boYeu(meta.httpEtag));
  const ims = Date.parse(headers.get('If-Modified-Since') || '');
  return !Number.isNaN(ims) && Math.floor(new Date(meta.uploaded).getTime() / 1000) * 1000 <= ims;
}

/** If-Range: khong co, ETag manh khop, hoac ngay khop -> ap dung Range; khac -> tra ca tep. */
export function ifRangeKhop(ifRange, meta) {
  if (!ifRange) return true;
  if (ifRange.startsWith('"')) return ifRange === meta.httpEtag;
  return Date.parse(ifRange) === Math.floor(new Date(meta.uploaded).getTime() / 1000) * 1000;
}

/** Mot khoang byte: "bytes=a-b" | "bytes=a-" | "bytes=-n". Nhieu khoang / sai cu phap -> null (tra ca tep). */
export function phanTichRange(hdr, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(hdr.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0 || size === 0) return 'khong-dat';
    const length = Math.min(n, size);
    return { offset: size - length, length };
  }
  const offset = Number(m[1]);
  if (offset >= size) return 'khong-dat';
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < offset) return null;
  return { offset, length: end - offset + 1 };
}

export default { fetch: xuLy };
