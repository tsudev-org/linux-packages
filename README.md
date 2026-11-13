# linux-packages - kho APT/RPM `pkg.tsudev.com`

Kho gói Linux chính thức của tsudev (`tsudev-standards/docs/PACKAGING.md` mục 5). Gói `.deb` / `.rpm` dựng bằng
[nfpm](https://nfpm.goreleaser.com) từ **chính tệp Linux đã phát hành** trên GitHub Releases của từng sản phẩm
(không build lại), kiểm SHA-256 với tệp tổng kiểm của Release trước khi đóng gói, ký GPG, lưu trên Cloudflare R2.

## Cài đặt

Debian, Ubuntu, Mint:

```bash
curl -fsSL https://pkg.tsudev.com/tsudev-archive-keyring.gpg | sudo tee /usr/share/keyrings/tsudev.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/tsudev.gpg] https://pkg.tsudev.com/apt stable main" | sudo tee /etc/apt/sources.list.d/tsudev.list
sudo apt update && sudo apt install lotus-share
```

Fedora:

```bash
sudo curl -fsSLo /etc/yum.repos.d/tsudev.repo https://pkg.tsudev.com/rpm/tsudev.repo
sudo dnf install lotus-share
```

Vân tay khóa ký ghi tại [tsudev.com/apps](https://tsudev.com/apps) và trong biến `PKG_GPG_FINGERPRINT` của repo này;
khóa công khai ở [`keys/`](keys/).

## Cách hoạt động

| Tệp | Việc |
| --- | --- |
| `products.json` | Danh sách repo sản phẩm. Mỗi repo khai báo gói ở `packaging/package.json` (mục 3); repo có kênh `apt`/`rpm` trong `channels` hoặc `planned` và có tệp `linux-*` dạng `tar` thì được đóng gói |
| `tools/dung_kho.py` | `plan`: liệt kê gói cần có (3 bản phát hành mới nhất mỗi sản phẩm). `build`: tải, kiểm SHA-256, nfpm, `rpmsign`, `apt-ftparchive`, `createrepo_c`, ký `InRelease` / `Release.gpg` / `repomd.xml.asc`. Gói đã phát hành được tải lại nguyên vẹn, không dựng lại |
| `catalog.json` (sinh khi dựng) | Danh mục máy đọc tại `https://pkg.tsudev.com/catalog.json` - xem mục dưới |
| `tools/day-len-r2.sh` | Đẩy lên R2 theo thứ tự an toàn (gói → siêu dữ liệu → chỉ mục đã ký → `manifest.json`), xóa gói cũ ngoài 3 bản |
| `tools/kiem-cai.sh` | Cài **thật** bằng đúng lệnh trên website trong container sạch, kiểm thư viện, gỡ sạch |
| `.github/workflows/ci.yml` | Mỗi PR: dựng toàn bộ kho bằng khóa tạm, cài thử trên Ubuntu 22.04/24.04, Debian 12/13, Fedora |
| `worker/` + `.github/workflows/worker.yml` | Worker phục vụ `pkg.tsudev.com` từ R2 - xem mục dưới |
| `.github/workflows/xuat-ban.yml` | Mỗi giờ: có bản phát hành mới thì xin duyệt Environment `packages`, ký bằng khóa con, đẩy R2, cài thật từ `pkg.tsudev.com` trên 5 bản phân phối + ARM64 (hỏng thì mở Issue) |

## Tên miền `pkg.tsudev.com` (Worker trước R2)

Tên miền tùy chỉnh của R2 không có "tài liệu chỉ mục": `/`, `/apt/`, `/rpm/` trả trang *Error 404 Object not found*
của R2 dù `index.html` có trong bucket. Worker `pkg-tsudev` (`worker/src/index.js`, không thư viện ngoài) chạy trên
route `pkg.tsudev.com/*`, đọc bucket qua binding R2:

- `/` -> `index.html`; thư mục (`/apt/`, `/rpm/x86_64/`...) -> danh sách sinh từ R2; `/apt` -> 301 `/apt/`;
  404 tiếng Việt; chỉ `GET`/`HEAD`/`OPTIONS` (khác -> 405).
- `Range` tự phân tích theo RFC 9110 (`a-b`, `a-`, `-n`; vượt cuối -> 416 `bytes */size`; `If-Range`) - apt/dnf tải tiếp;
  `If-None-Match` / `If-Modified-Since` -> 304; giữ `Content-Type` / `Cache-Control` đã ghi khi đẩy lên R2.
- Header: HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, CSP cho HTML; CORS `*` (mọi nội dung kho công khai).
- Gói `.deb` / `.rpm` (bất biến) được đệm ở biên Cloudflare.

Kiểm: `cd worker && npm test` (bucket giả), `npx wrangler@4.158.0 dev --local` (workerd thật, R2 cục bộ), và
`tools/kiem-ten-mien.sh <gốc>` trên tên miền thật (sau mỗi lần triển khai + mỗi ngày khi biến repo `PKG_WORKER=on`).

**Triển khai** (`worker.yml`, khi `worker/` đổi trên `main`, cần duyệt Environment `packages`): cần secret
`CLOUDFLARE_API_TOKEN` trong Environment `packages` - token tạo tại *Cloudflare → My Profile → API Tokens → Create
Token → Custom*, chỉ hai quyền: **Account · Workers Scripts · Edit** (tài khoản `CLOUDFLARE_ACCOUNT_ID`) và
**Zone · Workers Routes · Edit** (zone `tsudev.com`). Chưa có token thì workflow bỏ qua kèm cảnh báo. Lần triển khai đầu
thành công: `gh variable set PKG_WORKER --body on` để bật kiểm tên miền hằng ngày.

## `catalog.json` - nguồn cho website và script cài đặt

`https://pkg.tsudev.com/catalog.json` (schema 1) liệt kê **chỉ gói đang có trong kho**: tên, phiên bản mới nhất và
các bản giữ lại, kiến trúc (`x64`/`arm64`, `deb.arch`, `rpm.arch`), mô tả vi/en, `homepage`, `formerNames`, lệnh
`install.apt` / `install.dnf`, lệnh đầy đủ kể cả thêm kho (`installFull`), lệnh thêm kho (`setup`) và vân tay khóa ký.
Dựng kho tự kiểm `catalog.json` khớp chỉ mục APT và tệp `.rpm` (`dung_kho.py check-catalog`); CI và bước cài thật
sau xuất bản đọc danh sách gói từ đây.

Website `*.tsudev.com` và `install.sh` của tsudev.com (PACKAGING.md mục 6, 8) đọc tệp này **lúc build** để hiện
khối "Cài bằng lệnh" - không gõ tay tên gói, nên không bao giờ hiện lệnh cho gói chưa có. Thêm trường thì giữ
`schema: 1`; đổi/bỏ trường thì tăng `schema`.

## Tên gói và đổi tên

- Khuôn tên `tsudev-<ten>` (PACKAGING.md mục 2). Sản phẩm có thương hiệu riêng được dùng tên khác **chỉ khi**
  `products.json` ghi đích danh `"tenRieng": "<tên>"` cho đúng repo đó (ví dụ `lotus-share` - Lotus Share).
- Tên đã công bố không bỏ: repo sản phẩm khai báo `linux.formerNames` trong `packaging/package.json`. Kho sinh
  gói `.deb` chuyển tiếp rỗng tên cũ (phụ thuộc gói mới) và thêm `Provides` + `Obsoletes` tên cũ vào `.rpm`, nên
  `sudo apt upgrade` / `sudo dnf upgrade` tự chuyển máy đã cài tên cũ sang tên mới; `apt install <tên cũ>` vẫn chạy.
- CI cài thử cả đường này: cài tên cũ từ `pkg.tsudev.com` rồi nâng cấp lên kho vừa dựng (`tools/kiem-cai.sh`,
  biến `NANG_CAP_TU`); gói mới phải chạy được và `/opt/<tên cũ>` phải bị gỡ.

## Khóa và bí mật

- Khóa chính RSA-4096 (chỉ chứng thực, không hết hạn) do chủ project giữ **ngoại tuyến**. CI chỉ có **khóa con ký**
  (hạn 2 năm) trong secret `PKG_GPG_SIGNING_KEY` của Environment `packages` (bắt buộc duyệt). Workflow từ chối
  chạy nếu secret chứa cả khóa chính. Tạo khóa: `tools/tao-khoa-gpg-kho.sh`.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (Environment `packages`): khóa API S3 của token R2 quyền
  **Object Read & Write** chỉ cho bucket `pkg-tsudev` (đẩy qua `aws s3api`, endpoint `<account>.r2.cloudflarestorage.com`).
- Biến repo: `PKG_GPG_FINGERPRINT`, `CLOUDFLARE_ACCOUNT_ID`.
- **Xoay khóa (khóa chính hoặc khóa con mới làm đổi `keys/tsudev-archive-keyring.{gpg,asc}`)**: `install.sh` của
  tsudev.com ghim SHA-256 hai tệp này (`PIN_GPG_SHA256`, `PIN_ASC_SHA256`, repo `tsudev`) và sẽ **từ chối cài** khi
  khóa đổi - đúng thiết kế. Trước khi xuất bản khóa mới: mở PR ở repo `tsudev` cập nhật hai giá trị đó (và vân tay ở
  `tsudev.com/apps`), deploy, rồi mới merge khóa mới ở đây. Mã băm: `sha256sum keys/tsudev-archive-keyring.*`.

## Thêm một sản phẩm

1. Repo sản phẩm phát hành tệp `…-linux-x64.tar.gz` (và/hoặc `arm64`) kèm `SHA256SUMS`.
2. `packaging/package.json` có `assets.linux-x64` (`kind: "tar"`), khối `linux` (lệnh, `.desktop`, phụ thuộc deb/rpm)
   và `apt`, `rpm` trong `planned` - xem `tsudev-org/lotus-share`.
3. Thêm repo vào `products.json`, mở PR: CI cài thử trên 5 bản phân phối. Merge xong chuyển `apt`, `rpm` từ
   `planned` sang `channels` ở repo sản phẩm để website hiện lệnh cài.

## Giấy phép

Công cụ trong repo này: Apache-2.0. Mỗi gói giữ giấy phép của sản phẩm gốc (trường `License` / `license` trong gói).
Bản phân phối lại phải giữ `NOTICE` (Apache-2.0 điều 4(d)). Tên và logo tsudev là nhãn hiệu, không nằm trong giấy phép:
xem [TRADEMARKS.md](https://github.com/tsudev-org/tsudev/blob/main/TRADEMARKS.md). PR chạm `LICENSE`, `NOTICE`, `keys/` hoặc
xoá dòng bản quyền cần chủ sở hữu phê duyệt (check `Bảo vệ bản quyền`, xem `AGENTS.md`).
