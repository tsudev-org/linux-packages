#!/usr/bin/env node
/**
 * Cổng "Bảo vệ bản quyền" - mọi thay đổi chạm tới quyền sở hữu của tsudev (giấy phép, NOTICE,
 * nhãn hiệu, logo, mô tả sở hữu, kênh ủng hộ, script cài) hoặc XOÁ một dòng thông báo bản quyền
 * ở BẤT KỲ tệp nào đều phải được chủ sở hữu PHÊ DUYỆT trên GitHub, bằng tài khoản mà không
 * phiên Agent AI nào dùng (`config/ban-quyen.json` > `nguoi_duyet`).
 *
 * Vì sao là phê duyệt GitHub chứ không phải "mã bí mật": một chuỗi mã phải nằm ở đâu đó agent
 * đọc được thì agent cũng gõ lại được. Phê duyệt gắn với tài khoản có 2FA của chủ sở hữu, do máy
 * chủ GitHub xác thực, và gắn với ĐÚNG commit đầu PR - sửa thêm sau khi duyệt là mất hiệu lực.
 *
 * Chạy trong workflow `pull_request_target`: mã cổng lấy từ nhánh GỐC (main), KHÔNG checkout mã
 * của PR, chỉ ĐỌC dữ liệu PR qua API - PR không thể sửa chính cổng để tự cho qua.
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=tsudev-org/tsudev PR_NUMBER=123 node scripts/bao-ve-ban-quyen.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/ban-quyen.json'), 'utf8'));
const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER } = process.env;

async function api(p) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${p}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${p}: ${res.status}`);
  return res.json();
}

async function all(p) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await api(`${p}${p.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const isProtected = (file) =>
  CFG.duong_dan_bao_ve.some((p) =>
    p.endsWith('/') || p.endsWith('.') ? file.startsWith(p) : file === p
  );
const markerRe = new RegExp(
  CFG.dau_hieu_bao_ve.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

/** Pure - test được không cần mạng. Trả về danh sách lý do cần phê duyệt. */
export function findIssues(files) {
  const reasons = [];
  for (const f of files) {
    const names = [f.filename, f.previous_filename].filter(Boolean);
    if (names.some(isProtected)) reasons.push(`${f.filename}: tệp được bảo vệ (${f.status})`);
    if (f.status === 'removed' && !names.some(isProtected)) {
      // Xoá cả tệp: không có patch - chỉ cảnh báo nếu tệp là tài liệu/giấy phép.
      if (/(^|\/)(LICENSE|NOTICE|COPYING|TRADEMARKS)/i.test(f.filename))
        reasons.push(`${f.filename}: xoá tệp giấy phép/thông báo`);
    }
    for (const line of (f.patch || '').split('\n')) {
      if (line.startsWith('-') && !line.startsWith('---') && markerRe.test(line)) {
        reasons.push(`${f.filename}: xoá dòng bản quyền: ${line.slice(1).trim().slice(0, 120)}`);
      }
    }
  }
  return reasons;
}

async function main() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) {
    console.error('Thiếu GITHUB_TOKEN / GITHUB_REPOSITORY / PR_NUMBER');
    process.exit(2);
  }
  const pr = await api(`pulls/${PR_NUMBER}`);
  const files = await all(`pulls/${PR_NUMBER}/files`);
  const reasons = findIssues(files);
  if (reasons.length === 0) {
    console.log('Bảo vệ bản quyền: PR không chạm nội dung sở hữu của tsudev - ĐẠT.');
    return;
  }
  console.log(
    `PR #${PR_NUMBER} chạm nội dung sở hữu của tsudev:\n  - ${reasons.slice(0, 50).join('\n  - ')}`
  );

  const reviews = await all(`pulls/${PR_NUMBER}/reviews`);
  // Phê duyệt hợp lệ: của người trong danh sách, trạng thái APPROVED, trên ĐÚNG commit đầu hiện tại,
  // và là đánh giá MỚI NHẤT của người đó (duyệt rồi "Request changes" thì không tính).
  const latest = new Map();
  for (const r of reviews)
    if (r.user && CFG.nguoi_duyet.includes(r.user.login)) latest.set(r.user.login, r);
  const ok = [...latest.values()].find(
    (r) => r.state === 'APPROVED' && r.commit_id === pr.head.sha
  );
  if (ok) {
    console.log(
      `ĐẠT - chủ sở hữu ${ok.user.login} đã phê duyệt commit ${pr.head.sha.slice(0, 7)}.`
    );
    return;
  }
  if (CFG.nguoi_duyet.includes(pr.user.login))
    console.log(
      '(Tác giả PR là người duyệt - GitHub không cho tự duyệt PR của mình; cần tài khoản duyệt khác hoặc người duyệt mở PR từ tài khoản agent.)'
    );
  console.error(
    `\nKHÔNG ĐẠT: cần chủ sở hữu (${CFG.nguoi_duyet.join(', ')}) PHÊ DUYỆT PR này trên commit ${pr.head.sha.slice(0, 7)}.\n` +
      'Agent AI / lập trình viên: KHÔNG tự xoá hay đổi thông báo bản quyền, giấy phép, nhãn hiệu, mô tả sở hữu - hỏi chủ dự án.\n' +
      'Chủ sở hữu: duyệt PR (Approve) rồi gắn nhãn bất kỳ hoặc bấm "Re-run" để cổng chạy lại.'
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
