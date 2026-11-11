# Hệ thống Tự động Phát Điều lệnh & Sinh hoạt GDQP-AN

Ứng dụng Web Client-Side (100% Static Site) hỗ trợ quản lý thời gian biểu, tự động phát âm thanh/khẩu lệnh theo giờ thực và còi báo động khẩn cấp cho Đơn vị Giáo dục Quốc phòng - An ninh.

## Tính năng chính
- **Đồng hồ thời gian thực**: Kiểm tra lịch mỗi giây và tự động phát âm thanh khi trùng khớp Giờ:Phút, ngày trong tuần và chế độ đang chọn.
- **Quản lý kịch bản linh hoạt**: Thêm, sửa, xóa, bật/tắt từng điều lệnh; hỗ trợ âm thanh mẫu (Web Audio API), link Audio URL hoặc tải tệp MP3/WAV từ máy. Tự động lưu vào `localStorage`.
- **Bộ lọc chế độ**: Chế độ Mùa Hè, Chế độ Mùa Đông, Ngày Lễ / Cuối tuần.
- **Báo động khẩn cấp**: Nút còi báo động ưu tiên cao nhất, đè lên mọi âm thanh khác.

## Hướng dẫn Deploy miễn phí trong 3 bước (Vercel / GitHub Pages)

1. **Đưa mã nguồn lên GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: GDQP-AN Schedule System"
   git branch -M main
   git remote add origin https://github.com/<ten-tai-khoan>/<ten-repo>.git
   git push -u origin main
   ```

2. **Deploy lên Vercel** (Khuyên dùng):
   - Truy cập [vercel.com](https://vercel.com), đăng nhập bằng GitHub và chọn **Add New Project**.
   - Chọn repository vừa tạo, giữ nguyên cấu hình mặc định (`npm run build`, thư mục đầu ra `dist`) và nhấn **Deploy**.

3. **Hoặc Deploy lên GitHub Pages**:
   - Chạy `npm run build` để tạo thư mục `dist/`.
   - Trong phần **Settings → Pages** của repository trên GitHub, chọn nguồn deploy từ nhánh `gh-pages` hoặc sử dụng GitHub Actions cho Vite static site.
