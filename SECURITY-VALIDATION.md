# SMEE CRM VPS — báo cáo bàn giao và kiểm thử

## Kiểm tra bản tích hợp ngày 20/11/2026

Đã ghép bản SMEE-CRM-Admin vào source hiện có, giữ cấu hình Nginx ở cổng
loopback 3180, `.env.example`, quy tắc Git bỏ qua dữ liệu riêng và bản sửa
CLI tạo owner. Package/lockfile và bốn migration SQL hiện hữu không thay
đổi. Việc kiểm tra dùng dữ liệu giả, không kết nối database hoặc thay đổi VPS.

| Hạng mục | Kết quả kiểm tra lại |
|---|---|
| Nghiệp vụ CRM, phân quyền, lịch và dự báo | 63/63 đạt |
| Excel | 9/9 đạt |
| Crypto, HTTP, scanner protocol và cấu hình deployment | 15/15 đạt |
| Lưu dữ liệu, tự khai thác, nhập Excel và sổ thu tiền | 15/15 đạt với PGlite trong RAM |
| Tài khoản/session và quyền Admin | 11/11 đạt với PGlite trong RAM |
| API production | 21/21 tình huống đạt; bổ sung kiểm tra riêng tư khi nhân viên nhập Excel và quyền ghi/hủy phiếu thu |
| Đối chiếu backup bằng Python | 6/6 đạt |
| CLI kiểm tra tệp sau phục hồi | Đạt cả bộ rỗng, tệp đúng, tệp bị thiếu và sai checksum |
| CLI tạo/reset owner | 6 tình huống đạt, gồm email mặc định và không lộ mật khẩu |
| TypeScript và build standalone | Đạt trên Windows, Node.js 24.20.0 |
| Edge headless | Đăng nhập, Admin, mở sổ/ghi thu/hủy phiếu và tải lại đạt ở desktop 1440 px; Admin ở 390 px không tràn trang; không có lỗi console |
| Compose 5.5.0 | Parse cả cấu hình gốc và Nginx; Nginx chỉ mở 127.0.0.1:3180; log rotation và các volume kế thừa đúng; preflight đạt |
| Dependency audit | 0 cảnh báo khi quét lại lockfile ngày 20/11/2026 |

HTTP/browser dùng server production local và PGlite, scanner trong API được
mô phỏng. Các kiểm tra này không thay thế chạy Docker daemon, ClamAV thật,
TLS công khai hoặc diễn tập backup/restore đầy đủ trên VPS. Giới hạn snapshot
1.800.000 byte vẫn giữ nguyên; dữ liệu cũ chưa có sổ thu tiền chỉ được tính
sau khi chủ sở hữu chủ động đối chiếu và mở sổ.

## Xác minh vận hành ngày 19/11/2026

| Hạng mục | Kết quả trên máy Windows |
|---|---|
| Kiểm tra cấu hình VPS | 3 bài test đạt, gồm trường hợp tên miền Caddy lệch với URL của ứng dụng |
| Bản dựng và giao diện | Build standalone và TypeScript đạt. Trên Edge ở độ rộng 1440 và 390 px, đã mở đúng hồ sơ qua bộ lọc ưu tiên, ghi thu một phần, hủy phiếu và đối chiếu số dư cùng lịch sử sau khi tải lại |
| Phân quyền và API | 19/19 kịch bản HTTP qua server production và PGlite độc lập. Đã kiểm tra phản hồi 304 rỗng khi nhân viên đọc lại, đọc khách theo danh tính, cập nhật sau chuyển giao và từ chối phiên bị thu hồi |
| Dữ liệu và xác thực | Hai bộ kiểm thử tích hợp dùng PGlite trong bộ nhớ, gồm lưu và đọc lại phiếu, xử lý xung đột phiên bản, quyền quản lý, chi phí và quyền nhân viên. Cả hai bộ đạt |
| Mã JavaScript của trang CRM | Tệp riêng của trang chính trong `.next/static/chunks/app/page-*.js` giảm từ 249.380 xuống 85.282 byte trước nén. Thư viện dùng chung và các màn hình nạp theo nhu cầu được tính riêng |
| Kiểm tra bộ sao lưu | 6 bài test đạt với dữ liệu tạm, gồm archive rỗng, archive hợp lệ, thiếu checksum, sai dump, sai tên, trùng mục và gzip bị cắt ngắn |
| Kiểm tra tệp sau khôi phục | CLI đọc đúng bộ rỗng và tệp nguyên vẹn, trả lỗi khi thiếu tệp hoặc sai SHA-256. Bốn tình huống chạy với PGlite trong bộ nhớ và thư mục riêng |
| Script triển khai | Bash đọc thành công cú pháp của entrypoint, backup và restore |

Chưa chạy Docker Compose, ClamAV thật, cấp chứng chỉ cho tên miền và diễn tập phục hồi toàn bộ trên VPS ở đợt cập nhật này. Quy trình kiểm tra máy chủ đích nằm trong [README-VPS.md](README-VPS.md).

## Báo cáo của bản nguồn ngày 18/11/2026

Các kết quả dưới đây thuộc phiên bản **1.0.0** ở lần bàn giao trước.

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
