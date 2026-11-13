# BÀN GIAO PHIÊN - `linux-packages-1e` → phiên kế tiếp của repo `linux-packages`

- **Mã phiếu**: 20261113-02
- **Từ**: phiên `linux-packages-1e` (12-13/11/2026) - **Đến**: phiên kế tiếp của repo `tsudev-org/linux-packages`
- **Thời điểm**: 13/11/2026
- **Trạng thái**: MỞ - việc số 1 ở mục 3 làm NGAY khi vào phiên

## 0. Quy tắc bắt buộc (đọc trước)

- Dùng **tiếng Việt** cho mọi trả lời, phiếu, PR và tin nhắn giữa phiên. Commit message trong repo này viết không dấu,
  theo lịch sử git.
- Trước khi dùng `gh` hoặc push: chạy `gh api user -q .login` (phải ra `tsudev-tsudev`). Không push thẳng `main`:
  làm trên nhánh, mở PR, chờ CI xanh rồi mới merge (squash).
- **Không sửa repo của phiên khác.** Ghi phiếu vào `logs/handover/` của repo đó và nhắn qua `ListAgents` → `SendMessage`.
  Nếu phiên đó đã đóng thì chỉ ghi phiếu. Riêng `scoop-bucket` và `homebrew-tap` không có phiên riêng: phiên này đã
  làm PR trực tiếp ở hai repo đó.
- Không tạo hay đổi tên repo dưới tài khoản `tsudev-tsudev` (`~/.claude/CLAUDE.md`).
- **Duyệt Environment `packages`**: ngày 13/11/2026 chủ dự án ủy quyền phiên 1e tự duyệt qua API. Ủy quyền này
  **không tự chuyển sang phiên mới**: hỏi lại chủ dự án một câu trước khi tự duyệt. Lệnh duyệt (id Environment
  `packages` = `26928270657`):
  `gh api -X POST repos/tsudev-org/linux-packages/actions/runs/<run>/pending_deployments -F 'environment_ids[]=26928270657' -f state=approved -f comment="..."`
- Lượt `xuat-ban` cũ đang chờ duyệt chặn lượt mới (concurrency): dùng `gh run cancel`, KHÔNG `state=rejected`, vì
  từ chối bị tính là failure và sẽ mở Issue giả.
- Phiên 1e không chạy được `wrangler` cần đăng nhập ngoài sandbox (bị chặn). Mọi thao tác Cloudflare đi qua workflow CI.

## 1. Đã xong trong phiên 1e (đều đã merge, CI xanh)

| PR | Nội dung |
| --- | --- |
| linux-packages #8, #9 | Gói `tsudev-luyen-go-phim` (TsuGameLabs, phương án A) + ghi phiếu 20261112-01 |
| linux-packages #10 | `catalog.json` (schema 1). Cài thật sau xuất bản trên 5 bản phân phối + ARM64. Kiểm bản mới mỗi giờ |
| linux-packages #11 | `dung_kho.py` hỗ trợ `{tagVersion}`, `assets.<k>.root`, `assets.<k>.sums`, `linux.links`, `linux.desktop.exec`; `kiem-cai.sh` in đủ thư viện thiếu, bỏ qua `libcoreclrtraceptprovider.so` |
| linux-packages #12 | `tools/kiem-ghim-khoa.sh`: chặn đổi khóa khi `PIN_GPG_SHA256` / `PIN_ASC_SHA256` trong `https://tsudev.com/install.sh` chưa cập nhật |
| linux-packages #13 | Gói `tsudev-files` 2.4.0-vn.1 (x64 + arm64), lệnh `tsudev-files` + `filee` |
| linux-packages #14 | **Worker `pkg-tsudev`** (`worker/`) sửa 404 ở `/`, `/apt/`, `/rpm/`. `worker.yml` triển khai, `tools/kiem-ten-mien.sh` kiểm tên miền thật |
| scoop-bucket #3, #4 | `catalog.json` cho Scoop; thêm gói `tsudev-contact` |
| homebrew-tap #2 | `catalog.json` cho Homebrew; bỏ `.pyc` lọt commit |

Kho đang có: `lotus-share` 2.0.0-7, `tsudev-files` 2.4.0-vn.1, `tsudev-luyen-go-phim` 26.11.1201-1. Lượt xuất bản gần
nhất 43346053468 xanh 8 môi trường. tsudev.com/apps và `install.sh` / `install.ps1` (repo tsudev, phiên `tsudev-06`)
đọc ba catalog.

## 2. Trạng thái lúc bàn giao

- Lỗi chủ dự án báo (ảnh chụp): `https://pkg.tsudev.com/` trả *Error 404 Object not found* của R2. **Vẫn còn**, vì
  Worker đã merge nhưng CHƯA triển khai: lượt `worker.yml` 43346053563 bỏ qua do lúc đó chưa có token.
- **Chủ dự án đã đặt secret `CLOUDFLARE_API_TOKEN`** trong Environment `packages` (13/11/2026, đã kiểm bằng
  `gh secret list --env packages`). Token gồm hai quyền: Account · Workers Scripts · Edit, và Zone · Workers Routes · Edit
  (zone `tsudev.com`). Phiên 1e chưa thấy token chạy thật lần nào.
- Không có monitor hay tiến trình nền nào còn chạy; repo không dùng tệp khóa. Bộ theo dõi cwico (đợi `SHA256SUMS`) đã tắt.

## 3. Việc tiếp theo (theo thứ tự)

### 3.1 Triển khai Worker - LÀM NGAY

1. `gh workflow run worker.yml -R tsudev-org/linux-packages`, rồi lấy id lượt chạy và chờ job xin duyệt Environment
   `packages` (hỏi chủ dự án trước khi tự duyệt - mục 0).
2. Job `Trien khai` chạy `npx wrangler@4.158.0 deploy` (`worker/wrangler.toml`: route `pkg.tsudev.com/*`, zone
   `tsudev.com`, binding R2 `BUCKET` → `pkg-tsudev`). Job `Kiem https://pkg.tsudev.com` chạy
   `tools/kiem-ten-mien.sh`: phải đạt 10/10 (trước khi có Worker, script báo 9 lỗi).
3. Nếu lỗi:
   - Authentication error / 10000: token thiếu quyền. Báo chủ dự án, đúng hai quyền ở mục 2.
   - Zone không thấy: tài khoản giữ zone `tsudev.com` khác `CLOUDFLARE_ACCOUNT_ID` (`9541f44e…`). Phiếu
     tsudev-nuicam3d 20261112-02 có nhắc chuyển hạ tầng sang tài khoản Cloudflare khác: kiểm lại tài khoản.
   - Route chạy nhưng `/` vẫn ra 404 của R2: route Worker không đè được tên miền tùy chỉnh của R2. Phương án: gỡ tên
     miền tùy chỉnh ở R2 và dùng `custom_domain = true` cho Worker. Việc này đổi DNS, nên hỏi chủ dự án trước.
4. Đạt rồi thì:
   - `gh variable set PKG_WORKER --body on -R tsudev-org/linux-packages` để bật kiểm hằng ngày (03:23 UTC);
   - kiểm tay `curl -sI https://pkg.tsudev.com/` có HSTS/CSP;
   - `curl -s https://pkg.tsudev.com/apt/` ra danh sách;
   - cài thật vẫn xanh: chạy `gh workflow run xuat-ban.yml` hoặc chờ lượt theo lịch.
5. Báo phiên `tsudev-06` (repo tsudev): `catalog.json` nay có CORS `*`, website đọc được từ trình duyệt nếu cần.

Lưu ý kỹ thuật Worker: KHÔNG đưa header `Range` thẳng cho `env.BUCKET.get`. Trong workerd thật, `obj.range` có khóa
`suffix: undefined`, nên `Content-Range` ra `NaN-NaN` và apt/dnf tải tiếp sẽ hỏng. Worker tự phân tích Range bằng
`phanTichRange`. Kiểm cục bộ:
- `cd worker && npm test` (11 test);
- `npx wrangler@4.158.0 dev --local --persist-to <thư mục tạm>` sau khi nạp tệp bằng
  `wrangler r2 object put pkg-tsudev/<khóa> --file … --local --persist-to …`;
- rồi `tools/kiem-ten-mien.sh http://127.0.0.1:8787`.

### 3.2 Scoop `tsudev-cwico` - chờ repo cwico

Release `tsudev-cwico-v26.11.10.2` chưa có `SHA256SUMS.txt`, mà bucket chỉ nhận mã băm từ tổng kiểm của Release. Phiếu
`~/projects/tsudev-cwico/logs/handover/20261113-02_yeu-cau-sha256sums-cho-scoop.md` (MỞ). Kiểm định kỳ:
`gh api repos/tsudev-org/tsudev-cwico/releases/latest -q '.assets[].name'`. Khi có tệp đó:
- Thêm `bucket/tsudev-cwico.json` (bản CLI `tsudev-cwico_<semver>_x64-cli.exe`, `bin` đổi tên thành `tsudev-cwico`).
- Nhãn `26.11.10.2` khác semver `26.11.1002`, nên `checkver` đọc `browser_download_url` của API `releases/latest` với
  regex `/download/tsudev-cwico-v(?<tag>[\d.]+)/tsudev-cwico_(?<version>[\d.]+)_x64-cli\.exe`. `autoupdate.url` dùng
  `$matchTag` và `$version`; hash lấy từ `$baseurl/SHA256SUMS.txt`.
- `python3 tools/catalog.py`, mở PR. CI Windows cài thật xanh thì merge, rồi báo `tsudev-06` chạy `npm run pkg:catalog`.

### 3.3 Theo dõi các phiếu đã gửi

| Phiếu | Repo | Trạng thái 13/11 |
| --- | --- | --- |
| `20261113-01_yeu-cau-chuyen-apt-rpm-sang-channels-luyen-go-phim.md` | tsugamelabs/tsudev-game-kit | MỞ - `tsudev-luyen-go-phim-releases` vẫn để `apt`, `rpm` trong `planned`. Kho vẫn đóng gói (đọc cả `planned`) |
| `20261113-01_yeu-cau-cap-nhat-packaging-catalog-json.md` | tsudev-standards | MỞ - chưa phiên nào nhận. PACKAGING.md §5/§7/§8 còn lệch thực tế |
| `20261113-02_yeu-cau-sha256sums-cho-scoop.md` | tsudev-cwico | MỞ (mục 3.2) |
| `20261113-02_yeu-cau-them-scoop-vao-channels.md` | tsudev-contact | Mục 1 XONG (`channels` = `["scoop"]`). Mục 2 (đổi tên tệp bỏ `setup`) để bản sau: khi đổi phải sửa `autoupdate` của `bucket/tsudev-contact.json` cùng lúc |
| Phiếu toàn hệ `~/projects/logs/handover/20261113-01_yeu-cau-phu-kenh-cai-dat-va-ky-ma-windows.md` | nhiều repo | Phần của phiên này đã ghi ở mục 4. Còn: Scoop cwico (3.2); winget các repo; ký Authenticode (chủ dự án phải đăng ký SignPath) |

### 3.4 Sắp tới: đổi tên `tsudev-files` → `tsufiles` (bản 2.4.1)

Phiên `tsudev-files` sẽ nhắn TRƯỚC. Nếu tên gói mới là `tsufiles` (không theo khuôn `tsudev-<ten>`):
- thêm `"tenRieng": "tsufiles"` cho dòng `tsudev-org/tsudev-files` trong `products.json`, giống lotus-share;
- repo sản phẩm khai `linux.formerNames: ["tsudev-files"]`.

Kho tự sinh gói chuyển tiếp `.deb` và Provides/Obsoletes cho `.rpm`. CI kiểm đường nâng cấp `NANG_CAP_TU`. Cập nhật
`homebrew-tap` (cask mới + `deprecate!`) và `scoop-bucket` (manifest mới + `notes` cho tên cũ) theo mẫu lotus-share.

## 4. Kết quả xử lý (phiên nhận điền)

-
