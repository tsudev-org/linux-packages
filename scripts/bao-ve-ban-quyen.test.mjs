// Kiểm phần quyết định của cổng Bảo vệ bản quyền (không cần mạng): node --test scripts/bao-ve-ban-quyen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIssues } from './bao-ve-ban-quyen.mjs';

test('sửa tệp được bảo vệ ⇒ cần phê duyệt', () => {
  assert.equal(findIssues([{ filename: 'LICENSE', status: 'modified', patch: '+x' }]).length, 1);
  assert.equal(
    findIssues([{ filename: 'keys/tsudev-archive-keyring.gpg', status: 'modified' }]).length,
    1
  );
  assert.equal(
    findIssues([
      { filename: '.github/workflows/bao-ve-ban-quyen-tu-kiem.yml', status: 'modified', patch: '' },
    ]).length,
    1
  );
});

test('đổi tên tệp được bảo vệ (previous_filename) vẫn bị bắt', () => {
  assert.equal(
    findIssues([{ filename: 'LICENSE.old', previous_filename: 'LICENSE', status: 'renamed' }])
      .length,
    1
  );
});

test('XOÁ dòng bản quyền ở tệp bất kỳ ⇒ cần phê duyệt; THÊM thì không', () => {
  const removed = findIssues([
    {
      filename: 'src/a.ts',
      status: 'modified',
      patch: '@@ -1 +1 @@\n-// Copyright 2026 tsudev\n+// hi',
    },
  ]);
  assert.equal(removed.length, 1);
  assert.match(removed[0], /xoá dòng bản quyền/);
  assert.equal(
    findIssues([{ filename: 'src/a.ts', status: 'modified', patch: '+// Copyright 2026 tsudev' }])
      .length,
    0
  );
  assert.equal(
    findIssues([{ filename: 'x.tsx', status: 'modified', patch: '-<span>© tsudev</span>' }]).length,
    1
  );
});

test('dòng tiêu đề diff "---" không bị coi là xoá', () => {
  assert.equal(
    findIssues([{ filename: 'a.md', status: 'modified', patch: '--- a/Copyright.md' }]).length,
    0
  );
});

test('thay đổi thường không chạm gì ⇒ không cần phê duyệt', () => {
  assert.deepEqual(
    findIssues([
      { filename: 'README.md', status: 'modified', patch: '-a\n+b' },
    ]),
    []
  );
});

test('xoá tệp NOTICE ở thư mục con cũng bị bắt', () => {
  assert.equal(findIssues([{ filename: 'packages/x/NOTICE', status: 'removed' }]).length, 1);
});
