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
| `tools/day-len-r2.sh` | Đẩy lên R2 theo thứ tự an toàn (gói → siêu dữ liệu → chỉ mục đã ký → `manifest.json`), xóa gói cũ ngoài 3 bản |
| `tools/kiem-cai.sh` | Cài **thật** bằng đúng lệnh trên website trong container sạch, kiểm thư viện, gỡ sạch |
| `.github/workflows/ci.yml` | Mỗi PR: dựng toàn bộ kho bằng khóa tạm, cài thử trên Ubuntu 22.04/24.04, Debian 12/13, Fedora |
| `.github/workflows/xuat-ban.yml` | Mỗi 6 giờ: có bản phát hành mới thì xin duyệt Environment `packages`, ký bằng khóa con, đẩy R2, cài thật từ `pkg.tsudev.com` (hỏng thì mở Issue) |

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

## Thêm một sản phẩm

1. Repo sản phẩm phát hành tệp `…-linux-x64.tar.gz` (và/hoặc `arm64`) kèm `SHA256SUMS`.
2. `packaging/package.json` có `assets.linux-x64` (`kind: "tar"`), khối `linux` (lệnh, `.desktop`, phụ thuộc deb/rpm)
   và `apt`, `rpm` trong `planned` - xem `tsudev-org/lotus-share`.
3. Thêm repo vào `products.json`, mở PR: CI cài thử trên 5 bản phân phối. Merge xong chuyển `apt`, `rpm` từ
   `planned` sang `channels` ở repo sản phẩm để website hiện lệnh cài.

## Giấy phép

Công cụ trong repo này: Apache-2.0. Mỗi gói giữ giấy phép của sản phẩm gốc (trường `License` / `license` trong gói).
