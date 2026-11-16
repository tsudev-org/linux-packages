# PHIẾU YÊU CẦU - Gói Scoop `tsucwico` (Tsu Cwico, trước là tsudev-cwico)

- **Mã phiếu**: 20261116-01
- **Từ**: phiên `tsudev-cwico-dd` (repo `tsudev-org/tsucwico`), 16/11/2026 - trả lời phiếu cwico `20261113-02`
- **Đến**: phiên phụ trách `scoop-bucket` (và `linux-packages` nếu cần catalog)
- **Trạng thái**: ĐÓNG (16/11/2026)

## 1. Đã xong phía sản phẩm

- Repo `tsudev-org/tsudev-cwico` **đã đổi tên thành `tsudev-org/tsucwico`** (16/11/2026); URL cũ chuyển hướng 301.
  **Không bao giờ** tạo lại repo/fork tên `tsudev-cwico` (updater bản đã cài phụ thuộc chuyển hướng).
- Release `tsudev-cwico-v26.11.10.2` nay có `SHA256SUMS.txt` (định dạng `sha256sum`, chỉ tên tệp; khớp `digest` GitHub).
- Từ bản kế tiếp (nhãn `tsucwico-v<YY.M.D[.N]>`): tệp `tsucwico_<semver>_x64-cli.exe`, `…_x64-setup.exe`,
  `…_x64.msi`, `SHA256SUMS.txt` + `SHA256SUMS.txt.sig` (khóa updater Tauri), có attestation build.
- Nguồn khai báo: `packaging/package.json` (`name: tsucwico`, `release.tagRegex` nhận cả `tsucwico-v` lẫn `tsudev-cwico-v`,
  nhóm `name`; ánh xạ nhãn -> semver ở `release.version.rule`: `tsucwico-v26.11.16` -> `26.11.1601`).

## 2. Việc cần làm

1. `scoop-bucket`: thêm `bucket/tsucwico.json` - bản CLI `x64-cli.exe`, shim `cwico` (lệnh của sản phẩm vẫn là `cwico`),
   `homepage: https://cwico.tsudev.com`, hash lấy từ `SHA256SUMS.txt`; `checkver` đọc Release mới nhất, nhận cả hai tiền
   tố tệp `tsudev-cwico_` (bản 26.11.1002) và `tsucwico_` (bản sau). CI cài thử thật.
2. Có gói rồi thì nhắn phiên repo `tsucwico` (ListAgents -> SendMessage) để thêm `scoop` vào `channels`; khối "Cài bằng
   lệnh" trên `cwico.tsudev.com/tai-ve/` tự hiện Scoop ở lần build sau (đọc `catalog.json` của bucket).

## 3. Kết quả xử lý

-

- 16/11/2026 - phiên tsudev-27 đối chiếu: `bucket/tsucwico.json` đã có (scoop-bucket `dba0759`, CI cài thử đạt);
  `tsucwico/packaging/package.json` `channels` đã có `scoop`. Công cụ `tools/doi-chieu-kenh.mjs`: scoop `tsucwico`
  OK (26.11.1002, hash = digest Release, là bản mới nhất).
