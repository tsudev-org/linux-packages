# PHIẾU YÊU CẦU - Rà quét sâu và chuẩn hoá giao diện website toàn hệ sinh thái tsudev

- **Mã phiếu**: 20261113-07
- **Từ**: phiên 52 của repo `tsudev` (tsudev.com), 13/11/2026, theo yêu cầu của chủ dự án
- **Gửi**: mọi repo có website / trang `*.tsudev.com` - tsudev-cwico, tsudev-swico, tsudev-contact,
  tsudev-trafficmonitor, tsufiles (`tsudev-files`), lotus-share, linux-packages (trang kho, nếu có),
  6 repo game TsuGameLabs + tsudev-game-kit
- **Trạng thái**: MỞ - mỗi repo ghi "Đã đọc" + kết quả vào cuối phiếu BẢN SAO trong repo mình

## 1. Yêu cầu của chủ dự án

Rà quét sâu toàn bộ giao diện website của repo (mọi trang con, modal, popup, menu) để tìm chỗ lỗi, xung đột bố cục,
mâu thuẫn nội dung hoặc thiếu chuyên nghiệp; sửa để giao diện **chuyên nghiệp, thống nhất, đồng bộ** với tsudev.com.

## 2. Cách quét (bắt buộc cả hai: máy đo + mắt)

1. Chạy công cụ dùng chung (cần `playwright` - chạy trong repo có nó, hoặc đặt `NODE_PATH`):

   ```bash
   node ~/projects/logs/tools/quet-giao-dien.cjs https://<site>.tsudev.com / /trang-con ... --out /tmp/<thu-muc-anh>
   ```

   Mỗi trang × khổ 390/1280 × Tối/Sáng: cuộn ngang, phần tử tràn khung, ảnh vỡ, trùng `id`, số `h1` (đúng 1),
   nút/liên kết không có tên, lỗi console, HTTP >= 400, tiêu đề lặp tên site ("X - site - site").
   Thêm trang 404 (`/khong-ton-tai`) vào danh sách - lỗi thiếu `h1` hay nằm ở đó.
2. **Mở ảnh và soi bằng mắt** (`--out`). Máy đo không bắt được: nút lệch hàng giữa các thẻ, khoảng trống lạ, chữ
   xuống dòng xấu, menu che nội dung. Lưu ý: khoảng trống lớn trong ảnh full-page có thể chỉ là khối "hiện khi cuộn"
   chưa kích hoạt (công cụ đã cuộn hết trang trước khi chụp; vẫn nghi thì kiểm chiều cao phần tử).
3. Nếu site có đăng nhập: quét CẢ trạng thái đã đăng nhập (dev local + tài khoản seed). Lỗi footer ở mục 3.2 chỉ
   thấy ở trạng thái đó.
4. Mở từng modal/popup/menu bằng tay (hoặc script bấm) ở khổ 390: không tràn khung, đóng được bằng Esc, focus quay
   về nút mở.

## 3. Mẫu chuẩn tsudev.com áp dụng từ phiên 52 (đối chiếu, áp nơi có)

1. **Header - tài khoản đã đăng nhập**: avatar tròn BÊN TRÁI tên; bấm avatar/tên mở menu gồm **"Hồ sơ tài khoản"** và
   **"Đăng xuất"** (không để nút "Đăng xuất" trần trên thanh). Mẫu disclosure: `aria-expanded`, đóng bằng Esc / bấm ra
   ngoài. Tham chiếu: `tsudev/packages/ui/src/components/SiteHeader.tsx` (`UserMenu`), PR tsudev #251.
2. **Footer - cột "Tài khoản" theo phiên**: khách thấy "Đăng nhập" (+ "Tạo tài khoản" nếu có); đã đăng nhập thấy
   **"Bảo mật tài khoản"** (trang cấu hình bảo mật) + "Hồ sơ tài khoản" - KHÔNG còn "Đăng nhập". Site dùng tài khoản
   tsudev.com mà không có trang tài khoản riêng thì liên kết sang `https://tsudev.com/settings/security`. Site không có
   đăng nhập: không có cột này. Tham chiếu: PR tsudev #252.
3. **Footer di động**: cột liên kết xếp lưới 2 cột (không một cột dài); hàng cuối "© tsudev" trái + bộ chọn Sáng/Tối/
   Hệ thống phải, MỘT hàng ở mọi khổ (phiếu 20261110-05).
4. **Mỗi trang đúng một `h1`**, kể cả 404 và trang lỗi. Tiêu đề `<title>` dạng "Trang - tên site", không lặp tên site.
5. Giao diện đen tuyền + tím, chỉ Sáng / Tối / Hệ thống (không chế độ Ấm), không dải nền khác màu giữa các khối; chữ
   trên nút tím ở chế độ Tối là mực đen; tương phản WCAG AA ở cả hai chế độ.
6. Gạch ngang chỉ dùng `-` (không em-dash). Ngày giờ `DD/MM/YYYY`.

## 4. Ràng buộc

- ⛔ KHÔNG đổi giấy phép, NOTICE, logo, dòng `©`, mô tả chuẩn hệ sinh thái, kênh ủng hộ. Repo có cổng `Bảo vệ bản
  quyền`: PR chạm đường dẫn bảo vệ (thường gồm chân trang) ⇒ mở PR, DỪNG, báo chủ dự án duyệt.
- ⛔ Không tạo/đổi tên repo thành tên cũ dưới `tsudev-tsudev` (gồm `tsudev-files`).
- Không sửa `.standards/`. Mẫu ở mục 3 cần thành quy ước chung thì mở đề xuất ở `tsudev-standards`.

## 5. Nghiệm thu

- Công cụ ở mục 2.1 in `OK` cho mọi trang × khổ × chế độ trên PRODUCTION (mã thoát 0), hoặc ghi rõ ngoại lệ có lý do.
- Ảnh 390px + 1280px trước/sau của trang chủ và một trang con, đính kèm PR.
- Ghi vào cuối bản sao phiếu này: "Đã đọc" + danh sách lỗi tìm thấy + PR + trạng thái production.
