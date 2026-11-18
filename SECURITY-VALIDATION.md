# SMEE CRM VPS — báo cáo bàn giao và kiểm thử

Ngày bàn giao: **18/11/2026**. Phiên bản mã nguồn: **1.0.0**.

## Kết quả bàn giao

Đã chuyển mã nguồn sang ứng dụng độc lập Next.js/Node.js + PostgreSQL, với đăng nhập email/mật khẩu riêng, tệp riêng trên VPS, cấu hình Docker Compose, Caddy HTTPS và ClamAV. Bản Sites đang chạy không bị thay đổi. Đây là gói source để cài đặt; chưa triển khai lên VPS hay domain của công ty.

Giữ các chức năng CRM hiện có: hồ sơ khách hàng, lịch sử chăm sóc, telesales, nhập Excel/kiểm tra trùng điện thoại/phân chia hàng loạt, tài khoản và phân quyền, bán hàng và vận hành, nhận diện SMEE đỏ/trắng.

## Các thay đổi bảo mật đã thực hiện

- Bỏ xác thực dựa vào header danh tính từ nền tảng cũ. Người gửi tự thêm header không thể đăng nhập.
- Mật khẩu băm bằng scrypt với salt riêng; session ngẫu nhiên chỉ lưu hash ở database. Cookie HttpOnly/SameSite, thêm Secure và tiền tố `__Host-` khi cấu hình HTTPS; thời hạn phiên 8 giờ.
- Không có mật khẩu mặc định hoặc đăng ký công khai. Chủ sở hữu được tạo bằng CLI; nhân viên nhận link đặt mật khẩu dùng một lần, hiệu lực một giờ. Không tự gửi email.
- Khóa tài khoản, thay quyền hoặc đổi mật khẩu thu hồi session; các đường API kiểm tra quyền ở máy chủ. Telesales chỉ được truy cập khách được giao và trường dữ liệu được phép.
- Kiểm tra Origin theo URL cấu hình, giới hạn số lần đăng nhập/thao tác, giới hạn byte và thời gian đọc request, nonce CSP, chống nhúng iframe và MIME sniffing.
- PostgreSQL dùng truy vấn có tham số, transaction, kiểm tra revision và khóa nhất quán cho các thay đổi dữ liệu/quyền. Nhập trùng hoặc phân chia không hợp lệ không ghi dở dang một phần.
- Tệp lưu ngoài `public`, kiểm tra chữ ký định dạng/MIME/kích thước, yêu cầu scanner xác nhận sạch, kiểm tra checksum và quyền khi tải. Scanner lỗi sẽ từ chối upload.
- Docker app chạy bằng user không phải root. Chỉ Caddy công bố cổng 80/443; database, scanner và app ở mạng riêng. Kiểm tra cấu hình production trước migration, từ chối placeholder và cấu hình thiếu HTTPS/scanner.
- Có script sao lưu database cùng tệp, kiểm tra checksum khi phục hồi và thu hồi session/link đặt mật khẩu sau phục hồi.

## Kiểm thử đã chạy

Môi trường: macOS ARM64, Node.js **22.22.1**, npm **10.9.4**, Next.js **16.4.6**. Kiểm thử SQL và HTTP dùng **PostgreSQL 17.11 native** cục bộ, database riêng với dữ liệu giả; không chỉ dựa vào mô phỏng PostgreSQL.

| Hạng mục | Kết quả |
|---|---|
| Cài source sạch bằng `npm ci`, build production standalone | Thành công; bản build có public assets và static chunks |
| Kiểm tra TypeScript | Thành công |
| Nghiệp vụ CRM và phân quyền | 50/50 test passed |
| Đọc/ghi Excel, chống trùng, giới hạn và mẫu nhập | 8/8 test passed |
| Crypto, Origin/body/IP, tệp/scanner và cấu hình production | 15/15 test passed |
| PostgreSQL persistence/transaction/revision/thu hồi quyền | 10/10 theo báo cáo Node test runner |
| PostgreSQL auth/session/token và các tình huống đồng thời | 10/10 theo báo cáo Node test runner |
| HTTP trên server standalone production + PostgreSQL native | 17/17 tình huống passed |
| Trang đăng nhập trên trình duyệt | Hiển thị đúng logo/font/đỏ–trắng; không có console error/warn trong lần kiểm tra |
| Shell script và Compose | Kiểm tra cú pháp shell; parse YAML và xác nhận chỉ Caddy khai báo published ports |
| `npm audit` toàn bộ lockfile, gồm dev dependencies | 0 cảnh báo tại thời điểm quét; bản JSON ở `verification/npm-audit.json` |

17 tình huống HTTP bao gồm: từ chối người chưa đăng nhập/header giả, cookie, CSP/Origin, kích hoạt một lần, dữ liệu riêng từng telesales và ID đoán, nhập trùng nguyên tử, phân chia lại, khóa tài khoản, xuất dữ liệu chỉ owner, quyền tải tệp, chữ ký/MIME, phản hồi scanner lỗi/mã độc, body quá lớn không có Content-Length, đổi mật khẩu, logout và rate limit. Cờ Secure/`__Host-` được kiểm tra khi đặt APP_ORIGIN HTTPS; đây không phải kiểm thử chứng chỉ TLS công khai.

## Những việc cần xác minh tại môi trường triển khai

- Chưa chạy Docker daemon/Linux VPS trong môi trường bàn giao này: Docker image/startup, volume permissions và healthcheck toàn bộ Compose cần được xác minh khi cài.
- Chưa chạy engine ClamAV thật. Test scanner dùng socket mô phỏng giao thức clamd để xác minh truyền dữ liệu và từ chối khi có phản hồi mã độc/lỗi; không chứng minh khả năng phát hiện mã độc của engine hoặc độ mới của signature.
- Chưa trỏ DNS/cấp chứng chỉ TLS công khai, đo tải thực tế hay chạy diễn tập backup/restore đầy đủ trên VPS. Làm các bước trong README-VPS trước khi đưa dữ liệu thật vào.
- Đây là rà soát và kiểm thử ứng dụng trong phạm vi bàn giao, không phải chứng nhận an toàn tuyệt đối hoặc pentest độc lập. Kết quả audit phản ánh cơ sở advisory tại thời điểm quét; cần chạy lại `npm run security:audit` khi cập nhật/triển khai. Một số dependency gián tiếp của bộ Excel còn có cảnh báo deprecated khi cài, dù audit hiện không ghi nhận vulnerability.

## Giới hạn và dữ liệu

- Gói ZIP chứa source/schema/asset thương hiệu/test/tài liệu, **không chứa `.env` thật, mật khẩu, database hay tệp khách hàng production**. Database VPS khởi tạo độc lập; chưa tự chuyển dữ liệu từ Sites.
- Dữ liệu nghiệp vụ vẫn dùng snapshot JSON trong PostgreSQL, tối đa **1.800.000 byte mỗi không gian**, gồm lịch sử. Tệp riêng không tính vào giới hạn này. Bản này chưa chuyển từng khách/hoạt động sang bảng riêng cho dữ liệu lớn; không tăng hạn mức tùy tiện.
- Chưa có MFA hoặc gửi email tự động. Link đặt mật khẩu phải được chủ sở hữu chuyển riêng cho đúng người. Bảo vệ quyền SSH/Docker và sao lưu ngoài VPS vẫn là trách nhiệm vận hành.

## Chạy lại kiểm thử

```bash
npm ci
npm test
npm run test:security
npm run typecheck
npm run build
npm run security:audit
```

Các integration test **xóa dữ liệu database được chỉ định**. Chỉ tạo database cục bộ dùng riêng cho test; không dùng DATABASE_URL production. Đặt URL qua biến môi trường riêng, không ghi mật khẩu thật vào source hoặc log:

```bash
# Tạo riêng smee_store_test, smee_auth_test và smee_api_test trên PostgreSQL test.
# Điền TEST_DATABASE_URL / TEST_AUTH_DATABASE_URL / TEST_API_DATABASE_URL
# bằng thông tin môi trường test. API suite bắt buộc loopback và hậu tố _api_test.
TEST_DATABASE_RESET=1 npm run test:database
TEST_AUTH_DATABASE_RESET=1 npm run test:auth
TEST_API_DATABASE_RESET=1 npm run test:api
```

API suite tự tạo tài khoản/mật khẩu ngẫu nhiên, server loopback và thư mục tệp tạm, rồi dừng/xóa các tài nguyên tạm của nó. Test database vẫn là database dùng riêng cho test sau khi chạy.
