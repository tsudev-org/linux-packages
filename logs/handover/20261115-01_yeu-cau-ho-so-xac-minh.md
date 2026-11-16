# PHIẾU YÊU CẦU - Hồ sơ trên các nền tảng xác minh (Best Practices, Scorecard, phát hành, kênh gói) cho `linux-packages`

- **Mã phiếu**: 20261115-01 (phiếu con)
- **Từ**: phiên agent-files (repo `tsufiles`), chủ dự án yêu cầu 15/11/2026 - **Đến**: phiên kế tiếp của repo `linux-packages`
- **Trạng thái**: MỞ
- **Phiếu mẹ (ĐỌC TRƯỚC, mục 0 nguyên tắc + mục 3 quy trình)**: `~/projects/logs/handover/20261115-01_yeu-cau-ho-so-xac-minh-toan-he.md`
- **Công cụ + mẫu đã đạt passing 100%**: `~/projects/logs/tools/bestpractices/` (`README.md`, `bp.cjs`, `mau-tsufiles.json`);
  mẫu hồ sơ dạng đọc: `~/projects/tsufiles/docs/best-practices.md`.

## 1. Hiện trạng đo 15/11/2026

Kho APT/RPM `pkg.tsudev.com` (Apache-2.0, không Release) + quản lý `scoop-bucket`, `homebrew-tap` (Apache-2.0).

## 2. Việc của repo này (theo thứ tự)

- [ ] 2.1. `scorecard.yml` cho cả 3 repo (linux-packages, scoop-bucket, homebrew-tap); Best Practices không bắt buộc.
- [ ] 2.2. Kiểm khớp số liệu: với MỖI gói trong `catalog.json`, phiên bản + SHA-256 + URL trong manifest Scoop/cask Homebrew/gói deb-rpm phải bằng đúng tệp Release của repo app (script so sánh tự động, chạy trong CI hằng ngày; lệch -> CI đỏ). Báo kết quả cho từng repo app.
- [ ] 2.3. Thêm trường `homepage` cho mọi gói (kế hoạch tổng 20261114-01).
- [ ] 2.4. Hồ sơ Best Practices (nếu áp dụng): soạn `docs/best-practices.json` + `.md` (mỗi `Met` có URL bằng chứng trên
  `main`), gộp PR, rồi `bp.cjs new` -> `fill` chạy thử -> xem ảnh -> `fill --submit` -> `inspect` ra passing 100% -> huy hiệu README.
- [ ] 2.5. Ghi kết quả có số đo dưới đây + đánh dấu dòng `linux-packages` ở mục 4 phiếu mẹ + một dòng mục 7 kế hoạch `20261113-02`.

**Nhắc lại**: không ghi `Met` cho điều repo chưa làm. Chưa đạt thì sửa repo trước, hoặc ghi `Unmet`/`N/A` trung thực.
Tự chứng nhận sai bị phát hiện sẽ làm hỏng hồ sơ SignPath của cả hệ.

## Kết quả xử lý (phiên nhận điền)

-

- 16/11/2026 - phiên tsudev-27: 2.1 ⛔ PR `scorecard.yml` linux-packages#27, scoop-bucket#12, homebrew-tap#6 (chờ chủ sở
  hữu duyệt). 2.2 `tools/doi-chieu-kenh.mjs` (Scoop + cask: url/sha256 = digest Release + là bản mới nhất; APT/RPM: tag =
  Release mới nhất + tệp 200) - đo 16/11: 14 gói khớp, LỆCH duy nhất là `tsudev-files` chậm 2.4.0 → 2.4.1 ở cả ba kênh
  (phiếu 20261113-04). Workflow chạy hằng ngày: PR riêng (⛔). 2.3 ĐẠT sẵn: mọi gói ở ba kho có `homepage`.
  2.4 chưa làm (Best Practices không bắt buộc với repo này).
