# SMEE agency CRM — VPS độc lập

CRM tiếng Việt với nhận diện đỏ/trắng, quản lý khách hàng, telesales, bán hàng và vận hành. Bản này chạy **Next.js/Node.js + PostgreSQL**, đăng nhập email/mật khẩu riêng và lưu tệp trên volume riêng của máy chủ.

## Đọc trước khi cài

- **[README-VPS.md](README-VPS.md):** cài Docker, cấu hình VPS, trỏ domain, HTTPS, tạo chủ sở hữu, sao lưu và khôi phục.
- **[SECURITY-VALIDATION.md](SECURITY-VALIDATION.md):** kết quả kiểm thử và giới hạn của bản bàn giao.
- **[README-SMEE.md](README-SMEE.md):** hướng dẫn dùng CRM và phạm vi phân quyền.
- **[.env.example](.env.example):** biến cấu hình cần điền; sao chép thành `.env` riêng, quyền `600`.
- **[compose.yaml](compose.yaml):** PostgreSQL, app, ClamAV và Caddy; chỉ Caddy mở cổng 80/443.

Sau khi hoàn tất cấu hình `.env`, DNS và Docker theo README-VPS:

```bash
docker compose config --quiet
docker compose build --pull
docker compose run --rm --no-deps --entrypoint node app scripts/check-config.mjs
docker compose up -d --wait postgres clamav
docker compose run --rm app npm run owner:create
docker compose up -d --wait
```

Mở domain đã cấu hình tại `/login`. Không có mật khẩu mặc định. Nhân viên do chủ sở hữu cấp quyền và nhận link đặt mật khẩu dùng một lần; app chưa gửi email tự động.

## Phát triển và kiểm tra

Cần Node.js theo `package.json`, PostgreSQL riêng và biến môi trường hợp lệ. Hướng dẫn chi tiết nằm trong README-VPS.

```bash
npm ci
npm run db:migrate
npm run owner:create
npm run dev
```

```bash
npm test
npm run test:security
npm run typecheck
npm run build
```

`npm run build` tạo server standalone và sao chép `public` cùng `.next/static` vào bản build. `npm start` chạy server production đó; cần chạy migration trước khi sử dụng. Docker entrypoint tự áp dụng các migration có phiên bản trước khi khởi động.

## Dữ liệu và phạm vi bàn giao

Gói source khởi tạo **database độc lập mới**, không tự mang dữ liệu, tài khoản hoặc tệp của hệ thống cũ sang. Mọi chuyển dữ liệu thật cần đối chiếu danh tính/phân quyền và kiểm tra riêng. Mỗi không gian nghiệp vụ hiện giới hạn **1.800.000 byte** cho snapshot JSON, gồm lịch sử; tệp đính kèm lưu riêng. Đây chưa phải mô hình bảng khách hàng/hoạt động riêng cho dữ liệu quy mô lớn.

Sao lưu đầy đủ bằng `deploy/backup.sh`; hướng dẫn khôi phục có bước xác nhận rõ ràng trong README-VPS. File `.env`, mật khẩu, database và tệp thực tế không nằm trong source ZIP.

Kết quả kiểm thử cụ thể và những kiểm tra chưa thực hiện được ghi trong báo cáo bàn giao. Build/test thành công không thay thế việc xác minh Docker, HTTPS, scanner và khôi phục backup trên VPS trước khi dùng dữ liệu thật.
