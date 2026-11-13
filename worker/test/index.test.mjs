// Kiem Worker voi bucket R2 gia (cung giao dien head/get/list/writeHttpMetadata). Chay: node --test worker/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xuLy } from '../src/index.js';

function bucketGia(tep) {
  const obj = (key, body, meta, range) => {
    const data = new TextEncoder().encode(body);
    const o = {
      key, size: data.length, uploaded: new Date('2026-11-13T00:00:00Z'), httpEtag: `"${key.length}-${data.length}"`,
      writeHttpMetadata(h) { if (meta.ct) h.set('Content-Type', meta.ct); if (meta.cc) h.set('Cache-Control', meta.cc); },
    };
    if (range) { o.range = range; o.body = data.slice(range.offset, range.offset + range.length); }
    else if (body !== null) o.body = data;
    return o;
  };
  return {
    async head(k) { return tep[k] ? { ...obj(k, tep[k].body, tep[k]), body: undefined } : null; },
    async get(k, { range } = {}) {
      const t = tep[k]; if (!t) return null;
      if (range) {
        if (!Number.isInteger(range.offset) || !Number.isInteger(range.length)) throw new Error('range phai la offset/length');
        return obj(k, t.body, t, range);
      }
      return obj(k, t.body, t);
    },
    async list({ prefix = '', delimiter }) {
      const keys = Object.keys(tep).filter((k) => k.startsWith(prefix)).sort();
      const objects = []; const pre = new Set();
      for (const k of keys) {
        const rest = k.slice(prefix.length);
        if (delimiter && rest.includes('/')) pre.add(prefix + rest.slice(0, rest.indexOf('/') + 1));
        else objects.push({ key: k, size: tep[k].body.length, uploaded: new Date('2026-11-13T00:00:00Z') });
      }
      return { objects, delimitedPrefixes: [...pre], truncated: false };
    },
  };
}

const env = {
  BUCKET: bucketGia({
    'index.html': { body: '<h1>Kho gói</h1>', ct: 'text/html; charset=utf-8', cc: 'no-cache' },
    'catalog.json': { body: '{"schema":1}', ct: 'application/json', cc: 'no-cache' },
    'apt/dists/stable/InRelease': { body: 'signed', cc: 'no-cache' },
    'apt/pool/main/l/lotus-share/lotus-share_2.0.0-7_amd64.deb': { body: '0123456789', ct: 'application/vnd.debian.binary-package', cc: 'public, max-age=31536000, immutable' },
    'rpm/tsudev.repo': { body: '[tsudev]', ct: 'text/plain; charset=utf-8' },
  }),
};
const goi = (path, init) => xuLy(new Request(`https://pkg.tsudev.com${path}`, init), env, { waitUntil() {} });

test('/ tra index.html voi header bao mat', async () => {
  const r = await goi('/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Kho gói/);
  assert.match(r.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(r.headers.get('Strict-Transport-Security'), /max-age=31536000/);
});

test('thu muc /apt/ va /rpm/ co danh sach', async () => {
  const a = await goi('/apt/');
  assert.equal(a.status, 200);
  const t = await a.text();
  assert.match(t, /href="\/apt\/dists\/"/);
  assert.match(t, /href="\/apt\/pool\/"/);
  const r = await goi('/rpm/');
  assert.match(await r.text(), /tsudev\.repo/);
});

test('/apt khong co dau / -> 301', async () => {
  const r = await goi('/apt');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('Location'), '/apt/');
});

test('404 tieng Viet, khong lo trang R2', async () => {
  const r = await goi('/khong-co');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /Không tìm thấy/);
  assert.equal((await goi('/khong-co/')).status, 404);
});

test('duong dan xau bi chan', async () => {
  for (const p of ['/..%2Fetc', '/a//b', '/%E0%A4%A']) assert.equal((await goi(p)).status, 404, p);
});

test('tep du lieu: content-type, cache, CORS', async () => {
  const c = await goi('/catalog.json');
  assert.equal(c.headers.get('Content-Type'), 'application/json');
  assert.equal(c.headers.get('Access-Control-Allow-Origin'), '*');
  const i = await goi('/apt/dists/stable/InRelease');
  assert.equal(i.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(i.headers.get('Cache-Control'), 'no-cache');
  assert.equal(await i.text(), 'signed');
});

const DEB = '/apt/pool/main/l/lotus-share/lotus-share_2.0.0-7_amd64.deb';
const range = (r, extra = {}) => goi(DEB, { headers: { Range: r, ...extra } });

test('Range -> 206 dung Content-Range (a-b, a-, -n, vuot cuoi)', async () => {
  for (const [r, cr, body] of [
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=-50', 'bytes 0-9/10', '0123456789'],
    ['bytes=8-99', 'bytes 8-9/10', '89'],
  ]) {
    const x = await range(r);
    assert.equal(x.status, 206, r);
    assert.equal(x.headers.get('Content-Range'), cr, r);
    assert.equal(x.headers.get('Content-Length'), String(body.length), r);
    assert.equal(await x.text(), body, r);
  }
});

test('Range bat dau sau cuoi tep -> 416 bytes */size; Range la -> ca tep', async () => {
  const x = await range('bytes=99-');
  assert.equal(x.status, 416);
  assert.equal(x.headers.get('Content-Range'), 'bytes */10');
  for (const r of ['bytes=0-1,4-5', 'items=0-1', 'bytes=5-2']) assert.equal((await range(r)).status, 200, r);
  const full = await goi(DEB);
  assert.equal(full.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(full.headers.get('Content-Length'), '10');
});

test('If-Range: ETag khop -> 206, khac -> 200 ca tep', async () => {
  const et = (await goi(DEB, { method: 'HEAD' })).headers.get('ETag');
  assert.equal((await range('bytes=0-1', { 'If-Range': et })).status, 206);
  assert.equal((await range('bytes=0-1', { 'If-Range': '"khac"' })).status, 200);
});

test('If-None-Match / If-Modified-Since -> 304', async () => {
  const r1 = await goi('/catalog.json');
  const et = r1.headers.get('ETag');
  assert.equal((await goi('/catalog.json', { headers: { 'If-None-Match': et } })).status, 304);
  assert.equal((await goi('/catalog.json', { headers: { 'If-None-Match': `W/${et}, "x"` } })).status, 304);
  assert.equal((await goi('/catalog.json', { headers: { 'If-None-Match': '"x"' } })).status, 200);
  assert.equal((await goi('/catalog.json', { headers: { 'If-Modified-Since': r1.headers.get('Last-Modified') } })).status, 304);
  assert.equal((await goi('/catalog.json', { headers: { 'If-Modified-Since': 'Tue, 01 Jan 2020 00:00:00 GMT' } })).status, 200);
});

test('HEAD, OPTIONS, POST', async () => {
  const h = await goi('/catalog.json', { method: 'HEAD' });
  assert.equal(h.status, 200);
  assert.equal(h.headers.get('Content-Length'), '12');
  assert.equal((await goi('/', { method: 'OPTIONS' })).status, 204);
  const p = await goi('/catalog.json', { method: 'POST', body: 'x' });
  assert.equal(p.status, 405);
  assert.equal(p.headers.get('Allow'), 'GET, HEAD, OPTIONS');
});
