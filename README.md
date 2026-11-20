# SMEE agency CRM — VPS độc lập

CRM tiếng Việt với nhận diện đỏ/trắng, quản lý khách hàng, telesales, bán hàng và vận hành. Bản này chạy **Next.js/Node.js + PostgreSQL**, đăng nhập email/mật khẩu riêng và lưu tệp trên volume riêng của máy chủ.

## Đọc trước khi cài

[Bản bàn giao cho chủ doanh nghiệp](BAN-GIAO-CRM.md) ghi các thiếu sót đã sửa, cách kiểm tra doanh thu hợp đồng và tiền thực thu, cùng phạm vi đã thử trước khi đưa lên tên miền.

- **[README-VPS.md](README-VPS.md):** cài Docker, cấu hình VPS, trỏ domain, HTTPS, tạo chủ sở hữu, sao lưu và khôi phục.
- **[SECURITY-VALIDATION.md](SECURITY-VALIDATION.md):** kết quả kiểm thử và giới hạn của bản bàn giao.
- **[README-SMEE.md](README-SMEE.md):** hướng dẫn dùng CRM và phạm vi phân quyền.
- **[KE-HOACH-VAN-HANH.md](KE-HOACH-VAN-HANH.md):** thứ tự cải thiện dữ liệu, phân quyền, nghiệp vụ và hạ tầng trước khi vận hành thật.
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

Khi cài mới, ứng dụng khởi tạo database PostgreSQL độc lập. Khi nâng cấp từ bản VPS trước, migration 006 chuyển nghiệp vụ của database hiện hữu sang các bảng riêng và giữ snapshot cũ làm bản đối chiếu. Tài khoản và volume tệp tiếp tục được sử dụng. Xem [quy trình nâng cấp](README-VPS.md#nâng-cấp-từ-snapshot-sang-các-bảng-nghiệp-vụ).

Sao lưu đầy đủ bằng `deploy/backup.sh`; hướng dẫn khôi phục có bước xác nhận rõ ràng trong README-VPS. File `.env`, mật khẩu, database và tệp thực tế không nằm trong source ZIP.

Kết quả kiểm thử cụ thể và những kiểm tra chưa thực hiện được ghi trong báo cáo bàn giao. Build/test thành công không thay thế việc xác minh Docker, HTTPS, scanner và khôi phục backup trên VPS trước khi dùng dữ liệu thật.
