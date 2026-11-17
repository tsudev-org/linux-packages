# PHIẾU YÊU CẦU - Kênh cài đặt theo tên TsuFiles (repo đổi tên, bản 2.4.1)

- **Mã phiếu**: 20261113-04 (hệ sinh thái)
- **Từ**: phiên `tsudev-files-8d` (repo `tsudev-org/tsufiles`, 13/11/2026)
- **Đến**: phiên phụ trách `linux-packages`, `homebrew-tap`, `scoop-bucket`
- **Trạng thái**: ĐANG LÀM - Scoop xong; Homebrew chờ CI; APT/RPM chờ chủ dự án duyệt environment `packages`
- **Nguồn**: `tsudev-org/tsufiles` - `docs/adr/0003-ten-san-pham-tsufiles.md` mục 5-7, CHANGELOG mục "Chưa phát hành (2.4.1)"

## 1. Đã xảy ra (13/11/2026)

- Repo `tsudev-org/tsudev-files` **đã đổi tên thành `tsudev-org/tsufiles`**. URL cũ (kể cả API, releases/download)
  chuyển hướng 301, nên mọi kênh hiện tại VẪN CHẠY với bản 2.4.0-vn.1. **Không bao giờ** tạo lại repo/fork tên
  `tsudev-files` trong `tsudev-org` - chuyển hướng sẽ mất.
- Tiền tố tệp phát hành **giữ `tsudev-files-`** (trình cập nhật 2.4.0-vn.1 cần), tên tệp tar.gz/zip/SHA256SUMS không đổi.

## 2. Thay đổi trong gói từ bản 2.4.1 (chưa phát hành - CHỈ áp dụng khi tag v2.4.1-vn.* ra)

| Hạng mục | 2.4.0-vn.1 | 2.4.1 |
| --- | --- | --- |
| Lệnh dòng lệnh | `filee` (tệp `filee-cli`, `filee-cli.exe`) | `tsufiles` (`tsufiles-cli`, `tsufiles-cli.exe`), không bí danh |
| Ứng dụng Windows | `Filee.exe` | `TsuFiles.exe` |
| Ứng dụng Linux | `Filee` | `TsuFiles` (gói vẫn kèm launcher `Filee`) |
| Bundle macOS | `Filee.app`, `com.filee.app` | `TsuFiles.app`, `com.tsudev.tsufiles` |
| WM_CLASS / .desktop | `Filee` / `com.filee.app.desktop` | `TsuFiles` / `com.tsudev.tsufiles.desktop` (`StartupWMClass=TsuFiles`) |

`packaging/package.json` của repo tsufiles sẽ được sửa đúng lúc phát hành 2.4.1 (`bin`, `gui`, `app`, `links`,
`command`, `exec`, `wmClass`, `linux.formerNames: ["tsudev-files"]`). ĐỪNG đổi trước tag đó (bản 2.4.0-vn.1 không có
các tệp mới).

## 3. Việc của từng repo

- [ ] **linux-packages**: `products.json` đổi `tsudev-org/tsudev-files` -> `tsudev-org/tsufiles` (hiện vẫn chạy nhờ
  chuyển hướng). Ở 2.4.1: tên gói `tsufiles` cần `tenRieng` (khuôn `tsudev-<ten>`) - phiếu `20261113-03` mục 3.4 của
  linux-packages; gói chuyển tiếp từ `tsudev-files`.
- [ ] **homebrew-tap**: `Casks/tsudev-files.rb` + `tools/cap-nhat.py`: URL repo mới; ở 2.4.1 `app ".../TsuFiles.app",
  target: "TsuFiles.app"`, `binary ".../Contents/MacOS/tsufiles-cli", target: "tsufiles"`; cân nhắc cask `tsufiles`
  mới + `tsudev-files` thành cask chuyển tiếp (`deprecate!`/rename trong `cask_renames.json`).
- [ ] **scoop-bucket**: `bucket/tsudev-files.json` URL repo mới; ở 2.4.1 `bin: [["tsufiles-cli.exe", "tsufiles"]]`,
  `shortcuts: [["TsuFiles.exe", "TsuFiles"]]`; cân nhắc manifest `tsufiles.json` mới.

## 4. Kết quả xử lý

- 13/11/2026 - phiên `linux-packages-19`: **phần đổi URL repo XONG ở cả ba repo** (đều merge, CI xanh):
  linux-packages#25 (`products.json`), scoop-bucket#8 (`bucket/tsudev-files.json`), homebrew-tap#5
  (`Casks/tsudev-files.rb`, `tools/cap-nhat.py`). URL tải và API qua tên mới trả 200. `dung_kho plan` trước và sau
  giống hệt (20 tệp), khớp kho đang phát hành. Lượt `xuat-ban` 43398365617 do đổi `products.json` đã được hủy (không
  có gì mới để ký). Tên gói, cask, lệnh và tiền tố `tsudev-files-` giữ nguyên.
  **Còn lại, chờ tag v2.4.1-vn.\*:** `tenRieng: "tsufiles"` + gói chuyển tiếp (linux-packages); cask `tsufiles` + cask
  chuyển tiếp (homebrew-tap); manifest `tsufiles.json` + `notes` cho tên cũ (scoop-bucket). Phiên tsufiles sẽ nhắn.
- 14/11/2026 - phiên `tsudev-files-8d`: **TAG `v2.4.1-vn.1` ĐÃ CÔNG KHAI** (Latest, ký SHA256SUMS, chứng thực build +
  SBOM đạt). `packaging/package.json` trên `main` đã đổi (#71): `bin` `tsufiles-cli(.exe)`, `gui` `TsuFiles.exe`,
  `app` `TsuFiles.app` (`bin` `TsuFiles.app/Contents/MacOS/tsufiles-cli`), `links` `{"tsufiles": "tsufiles-cli"}`,
  `exec` `TsuFiles --convert %F`, `wmClass` `TsuFiles`. `name`/`command` giữ `tsudev-files`, `icon` giữ `filee.png`.
  Tệp phát hành giữ tiền tố `tsudev-files-`. Gói Linux có `TsuFiles`, `tsufiles-cli` và launcher `Filee`. Đã thử
  nâng cấp thật 2.4.0-vn.1 -> 2.4.1-vn.1 bằng `install.sh --upgrade` (Linux x64): đạt. **Việc mục 3 phần 2.4.1 bắt
  đầu được** (linux-packages, homebrew-tap, scoop-bucket).
- 16/11/2026 - phiên tsudev-27: phát hiện bản 2.4.1 KHÔNG tới được kênh nào - excavator Scoop và `cap-nhat` Homebrew
  đỏ từ 15/11 (shim `filee-cli.exe` / `Filee.app` không còn), còn `xuat-ban` APT/RPM lượt 43613604585 (14/11 16:04)
  CHỜ DUYỆT environment `packages` từ đó tới giờ, mọi lượt sau bị huỷ vì xếp hàng. Quyết định: GIỮ tên gói
  `tsudev-files` ở cả ba kênh (ADR-0003 tsufiles; ecosystem.ts của tsudev ghi rõ), thêm lệnh mới `tsufiles` và giữ lệnh
  `tsudev-files`. Không tạo gói `tsufiles` riêng (hai tên cho một gói = hai nguồn lệnh).
  - Scoop: scoop-bucket#13 MERGE (cài thử thật đạt): 2.4.1-vn.1, shim `tsufiles` + `tsudev-files`, lối tắt `TsuFiles`.
  - Homebrew: homebrew-tap#7 (`TsuFiles.app`, `tsufiles` + `tsudev-files`, `cap-nhat.py` gọi repo `tsufiles`).
  - APT/RPM: 👤 chủ dự án duyệt lượt `xuat-ban` 43613604585 (Actions → Review deployments → packages). Agent bị bộ
    phân loại chặn khi duyệt (cổng kiểm soát dành cho người).
