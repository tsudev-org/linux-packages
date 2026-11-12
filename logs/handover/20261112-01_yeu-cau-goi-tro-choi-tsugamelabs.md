# PHIẾU YÊU CẦU - Gói APT/RPM cho trò chơi TsuGameLabs (thí điểm `tsudev-luyen-go-phim`)

- **Mã phiếu**: 20261112-01
- **Từ**: phiên tsudev-d5 (repo `tsudev`, phiên 48), chuyển tiếp phiếu `tsudev/logs/handover/20261112-03_yeu-cau-kenh-phan-phoi-ban-cai-tro-choi.md`
  của phiên `tsudev-game-kit-b0` - **Đến**: phiên sau của repo `linux-packages`
- **Thời điểm**: 12/11/2026
- **Trạng thái**: ĐÓNG phía kho (13/11/2026) - gói `tsudev-luyen-go-phim` đã có trên `pkg.tsudev.com`; còn việc của repo `tsudev` (phiếu `tsudev/logs/handover/20261113-01`) và phiên game (chuyển `apt`/`rpm` sang `channels`)

## 1. Vì sao phiếu nằm ở đây

Phiếu gốc gửi repo `tsudev`, nhưng kho `pkg.tsudev.com` (bucket `pkg-tsudev`, khoá con ký trong Environment
`packages`, `products.json`) thuộc repo NÀY. Repo `tsudev` chỉ hiển thị lệnh cài ở `tsudev.com/apps` khi gói đã có thật.

Vướng mắc: kho dựng gói từ **tệp đã phát hành trên GitHub Releases** (kiểm SHA-256 với tổng kiểm của Release), còn repo
game ở org `TsuGameLabs` là **private** - Release không tải công khai được, winget/Scoop/Homebrew cũng cần URL công khai.

## 2. Phương án (chủ dự án chọn)

| | A - repo phát hành CÔNG KHAI riêng (đề xuất) | B - đẩy tệp thẳng lên R2 `pkg.tsudev.com/files/...` |
| --- | --- | --- |
| Cách làm | Một repo public chỉ chứa Releases (vd `TsuGameLabs/tsudev-games-releases`, mã nguồn vẫn private). CI repo game tạo Release + `SHA256SUMS` ở đó | Phiên game giao tệp, ai đó có token R2 ghi tiền tố `files/` |
| Đổi pipeline `linux-packages` | Không - thêm một dòng `products.json` | Có - nguồn tải mới, kiểm SHA-256 theo cách mới |
| winget / Scoop / Homebrew | Dùng được URL Release như mọi app khác | Dùng URL R2 |
| Mô hình tin cậy | Như hiện tại (Release + tổng kiểm) | Thêm một người/token ghi được vào bucket kho |

Đề xuất A: không thêm token ghi R2, không đổi pipeline đã có CI cài thật. Tên repo mới: tạo trong org (KHÔNG dưới
tài khoản `tsudev-tsudev`, không trùng tên repo cũ - xem `~/.claude/CLAUDE.md`).

## 3. Việc khi đã chốt

1. `products.json` thêm game (tên gói `tsudev-luyen-go-phim`, theo PACKAGING.md mục 2 - chưa công bố nên còn đổi được).
2. CI cài thật trên Ubuntu/Debian/Fedora như các gói khác.
3. Báo repo `tsudev` (phiếu mới ở `tsudev/logs/handover/`): `tsudev` thêm trường `pkg` cho game trong
   `packages/ui/src/lib/ecosystem.ts` (`ECO_GAMES`) để thẻ ở `/apps#tro-choi` hiện khối "Cài bằng lệnh".
4. Ghi kết quả vào mục 7 phiếu gốc ở repo `tsudev` và báo phiên `tsudev-game-kit`.

## 4. Kết quả xử lý

-
- 12/11/2026 - phiên tsudev-d5 (chủ dự án ủy quyền chọn): **CHỐT PHƯƠNG ÁN A.** Lý do: pipeline kho giữ nguyên
  (đã có CI cài thật 5 bản phân phối), không thêm token ghi R2, winget/Scoop/Homebrew/Tauri updater dùng URL Release
  như mọi app khác, mô hình tin cậy không đổi. Phương án B bị loại vì thêm một bên ghi được vào bucket kho.
  - Mỗi game MỘT repo công khai `TsuGameLabs/tsudev-<id>-releases` (chỉ README, LICENSE, `packaging/package.json`
    + Releases). Bắt buộc một repo/game vì `dung_kho.py` đọc `packaging/package.json` qua raw.githubusercontent
    của chính repo trong `products.json` - repo private đọc ẩn danh không được.
  - Phiên game đã dựng sẵn phía mình: `tsudev-luyen-go-phim` commit 087fbb7 (`packaging/tools/phat-hanh.sh`,
    `release.repo` = `TsuGameLabs/tsudev-luyen-go-phim-releases`). Repo công khai CHƯA tạo (404 lúc ghi).
  - Việc còn lại của repo NÀY, làm SAU khi Release đầu tiên có `…-linux-x86-64.tar.gz` + `SHA256SUMS.txt`:
    thêm `{ "repo": "TsuGameLabs/tsudev-luyen-go-phim-releases", "ref": "main" }` vào `products.json`, mở PR,
    CI cài thử xanh mới merge; rồi báo repo `tsudev` (mục 3.3) và phiên game chuyển `apt`/`rpm` sang `channels`.
- 13/11/2026 - phiên `tsudev-game-kit-b0`: **Release đầu tiên ĐÃ CÓ.**
  https://github.com/TsuGameLabs/tsudev-luyen-go-phim-releases/releases/tag/v26.11.1201 (build từ commit `e944576`
  của repo private, lượt chạy CI 43260576774). Tệp: `…-linux-x86-64.tar.gz` (gốc tar: `tsudev-luyen-go-phim` + `icon.png`,
  build ubuntu-22.04, glibc tối đa 2.34), `…-linux-x86-64.AppImage`, `…-windows-x86-64-setup.exe`, `…-windows-x86-64.zip`,
  `SHA256SUMS.txt`. Đã kiểm ẩn danh: tải + `sha256sum -c` khớp, raw `main/packaging/package.json` đọc được. Chạy thử
  `dung_kho.load_manifest` + `validate` + `plan_product` (chỉ đọc) ra `tsudev-luyen-go-phim_26.11.1201-1_amd64.deb` /
  `…-1.x86_64.rpm`, `sums=True`. Repo đã bật secret scanning + push protection. Phía kho làm tiếp mục 3.1-3.2.
- 13/11/2026 - phiên `linux-packages-1e`: **MỤC 3.1-3.2 XONG, gói đã lên kho thật.**
  - PR tsudev-org/linux-packages#8 (commit `38c8922`): thêm `{ "repo": "TsuGameLabs/tsudev-luyen-go-phim-releases", "ref": "main" }`
    vào `products.json` (không `tenRieng` - tên theo khuôn `tsudev-<ten>`). CI lượt 43267001109 xanh toàn bộ: dựng kho khóa tạm,
    cài thật `tsudev-luyen-go-phim 26.11.1201-1` trên Ubuntu 22.04/24.04, Debian 12/13, Fedora (log có `Setting up
    tsudev-luyen-go-phim` / `DAT: lotus-share tsudev-luyen-go-phim`), arm64 xanh (game chưa có tệp arm64 - chỉ lotus-share). Merge squash.
  - `xuat-ban.yml` lượt 43267940831 (workflow_dispatch; Environment `packages` do phiên này duyệt qua API theo ủy quyền
    của chủ dự án 13/11/2026): ký + đẩy R2 thành công; job "Cai that" cài từ `https://pkg.tsudev.com` xanh trên
    Ubuntu 24.04, Debian 12, Fedora (`Get: https://pkg.tsudev.com/apt stable/main amd64 tsudev-luyen-go-phim 26.11.1201-1`).
    Kiểm thêm: `Packages` của `dists/stable/main/binary-amd64` và `manifest.json` có `.deb` + `.rpm` 26.11.1201-1.
  - Lệnh người dùng: `sudo apt install tsudev-luyen-go-phim` / `sudo dnf install tsudev-luyen-go-phim` (sau bước thêm kho trong README).
  - Mục 3.3: phiếu `~/projects/tsudev/logs/handover/20261113-01_yeu-cau-truong-pkg-the-tro-choi.md`.
  - Mục 3.4: phiên `tsudev-game-kit-b0` đã đóng (SendMessage không tới) - ghi phiếu
    `~/projects/tsugamelabs/tsudev-game-kit/logs/handover/20261113-01_yeu-cau-chuyen-apt-rpm-sang-channels-luyen-go-phim.md`:
    chuyển `apt`, `rpm` từ `planned` sang `channels` ở `TsuGameLabs/tsudev-luyen-go-phim-releases` (và repo private).
    Đã nhắn phiên `tsudev-06` về phiếu 20261113-01.
    Ghi chú: mục 7 phiếu gốc ở repo `tsudev` để phiên `tsudev` ghi khi xử lý phiếu 20261113-01 (không sửa hộ repo khác).
