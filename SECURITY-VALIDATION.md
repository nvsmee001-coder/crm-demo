# SMEE CRM VPS — báo cáo bàn giao và kiểm thử

## Quản trị tài khoản

- Build production đạt. PostgreSQL 17.12 chạy cục bộ đạt 32 kịch bản HTTP, 19 kiểm thử lưu nghiệp vụ và 12 kiểm thử xác thực. Bộ kiểm thử bảo mật đạt 18 ca. Migration 010 áp dụng được trên dữ liệu thử nâng cấp và chạy lại không thay đổi schema.
- Edge chạy từ đăng nhập đến thiết lập bắt buộc, lưu mã khôi phục, mở bản xem trước bàn giao, chuyển khách, khóa tài khoản và kiểm tra nhật ký. Sau khi đăng xuất, đăng nhập lại bằng mã khôi phục. Bộ HTTP kiểm tra thêm tài khoản Tài chính, từ chối dùng lại mã, thu hồi phiên sau cấp lại thiết bị, bàn giao nhóm dự án và giữ lịch sử đã hoàn tất.
- Diễn tập `pg_dump` và `pg_restore` giữ thiết bị MFA đã đăng ký. Quy trình khôi phục thu hồi phiên, liên kết đặt mật khẩu, thiết lập MFA dở dang và mã khôi phục đã lưu trong bản sao.

## Kiểm thử luồng vận hành và khôi phục trên máy thử

- Build production đạt. 30 kịch bản HTTP, 19 kiểm thử lưu nghiệp vụ và 12 kiểm thử xác thực đạt trên PostgreSQL 17.12 chạy cục bộ. 64 kiểm thử CRM, 9 kiểm thử Excel, 15 kiểm thử bảo mật và 3 kiểm thử migration bổ sung cũng đạt.
- Edge chạy cùng một hồ sơ qua Telesales tiếp nhận và bàn giao, Sale lập báo giá, Quản lý duyệt/chốt, Triển khai hoàn thành việc và gửi nội dung, Quản lý duyệt rồi nghiệm thu, Tài chính ghi thu. Sale xem tiến độ và ngày nghiệm thu qua tab Dự án. Kịch bản HTTP kiểm tra quyền theo hồ sơ, khóa nội dung chưa duyệt, duyệt lại sau khi đổi phiên bản và lưu ngoại lệ nghiệm thu cùng công nợ.
- Trên PostgreSQL 17.12, chạy thử migration hoàn tác, áp dụng migration 006–009 rồi chạy lại để xác nhận tính lặp an toàn. Công cụ đối chiếu khớp hai snapshot giả, tài khoản và phiếu thu cũ.
- Dùng `pg_dump` và `pg_restore` trên bản sao giả vào một database riêng. Đối chiếu snapshot, số đầu kỳ, tài khoản và checksum tệp phục hồi. CLI thu hồi phiên đăng nhập và liên kết kích hoạt đã lưu trong bản sao.
- Đo API với 10.000 khách và 100.000 hoạt động giả. Gộp truy vấn đếm kết quả và lấy trang giúp p95 tìm khách giảm từ 1.186 ms xuống 626 ms trong lượt đo 60 lần đọc từ 20 phiên. p95 của 10 lần cập nhật tuần tự trên các hồ sơ khác nhau là 841 ms. Các số này đo trên máy thử, cần đo lại trên VPS và tải sử dụng thực tế.
- Edge với PostgreSQL 17.12 đã chạy lại phân trang khách, chọn qua nhiều trang, xuất CSV, tìm tiếng Việt, mở hồ sơ, nhập Excel và lưu quan hệ. Màn hình Khách hàng dùng API theo phạm vi danh sách cho đến khi chuyển sang màn hình tạo cơ hội.
- `npm audit` trả về 0 cảnh báo tại lần kiểm tra này. Cấu hình Compose cho Caddy và Nginx hợp lệ. Phương án Nginx chỉ xuất cổng app trên loopback. Các script backup, restore và entrypoint qua kiểm tra cú pháp. Máy thử dùng PostgreSQL độc lập. Nghiệm thu Docker, mạng/TLS, ClamAV thật và sao lưu định kỳ ngoài VPS vẫn cần chạy trên môi trường triển khai.

## Đối chiếu hợp đồng và quyền Tài chính

- Build production, 64 kiểm thử CRM, 9 kiểm thử Excel, 19 kiểm thử lưu dữ liệu, 3 kiểm thử migration và 29 kịch bản HTTP đạt trên máy thử. Migration 009 giữ quyền hiện có và cho phép cấp vai trò Tài chính.
- Kiểm thử mở lại dự án có sổ từ phiên bản cũ trước khi xác nhận hợp đồng. Sau xác nhận, số đầu kỳ, hạn và cả phiếu đã hủy được giữ nguyên. Vai trò Tài chính chỉ nhận mã hợp đồng, tên khách và dữ liệu sổ cần cho ghi thu.
- Kiểm thử hai lượt ghi cạnh tranh cùng revision, gửi lại cùng mã yêu cầu, trùng mã chứng từ và số thu thay đổi khi đề nghị đang chờ. Chủ sở hữu xác nhận sửa phiếu trong một giao dịch, giữ bản cũ và cập nhật số dư.
- Edge đã kiểm tra Chủ sở hữu xác nhận hợp đồng cũ và mở sổ, Tài chính ghi thu và đề nghị sửa ở màn hình rộng 390 px, Chủ sở hữu xác nhận và xuất CSV. Dòng hợp đồng đã đối chiếu khớp số thu và nợ, dòng chưa xác nhận để trống các cột tiền tương ứng.

## Bàn giao từ Telesales sang Sale

- Build production, 64 kiểm thử CRM, 9 kiểm thử Excel và 28 kịch bản HTTP đạt. Bộ HTTP kiểm tra tài khoản nhận đã kích hoạt, thời hạn, quyền hủy hoặc trả lại, hồ sơ cùng tệp riêng trước và sau khi chuyển, và hai lượt xác nhận cùng mã yêu cầu.
- Khi Sale nhận khách, cơ sở dữ liệu lưu đồng thời người phụ trách mới, việc đang chờ, cơ hội đang mở và kết quả bàn giao. Kiểm thử đối chiếu lịch hẹn, nội dung cuộc gọi, người xử lý việc đã hoàn thành và nhật ký của các đề nghị trước.
- Edge đã chạy từ lúc Telesales ghi kết quả **Đặt lịch tư vấn** đến lúc Sale trả lại, Telesales gửi lại và Sale tiếp nhận. Quản lý mở đề nghị từ hồ sơ khách. Sau khi nhận, Sale mở hồ sơ, xem lịch sử và mở biểu mẫu tạo cơ hội trên màn hình rộng 390 px.

## Báo giá, chốt thắng và điều chỉnh hợp đồng

- Build production đạt. Trên Edge, Sale dùng màn hình rộng 390 px để tạo cơ hội, lập và trình báo giá, mở bản in đã duyệt, đề nghị chốt và đề nghị điều chỉnh. Quản lý mở hàng chờ, xử lý từng bước, mở dự án và tra cứu hợp đồng liên kết.
- 27 kịch bản HTTP đạt trên cơ sở dữ liệu thử nghiệm. Kịch bản bán hàng kiểm tra phạm vi khách của Sale, quyền duyệt, khóa bản in trước khi duyệt, lịch sử ba phiên bản, tổng tiền và bản in sau khi danh mục dịch vụ thay đổi. Hai yêu cầu xác nhận cùng mã chỉ tạo một hợp đồng và một dự án.
- Kiểm tra sửa trực tiếp ngân sách hợp đồng, xác nhận đề nghị của chính mình và điều chỉnh giá trị xuống dưới số đã thu. Chủ sở hữu có thể xác nhận đề nghị của Quản lý và hệ thống giữ nguyên phiếu thu cùng giá trị lúc ký.
- Các trường bổ sung lưu cùng bản ghi cơ hội và dự án trong PostgreSQL. Dữ liệu cũ đọc được theo cấu trúc hiện tại. Luồng điều chỉnh gắn với hợp đồng được xác nhận bằng quy trình mới.

## Quyền Triển khai và phân công dự án

- Build production đạt. Trên Edge, Chủ sở hữu tạo và kích hoạt tài khoản từ Admin, thêm người vào nhóm dự án rồi giao công việc. Nhân sự xem dự án, cập nhật giờ thực tế và kết quả, rồi báo vướng mắc ở màn hình rộng 390 px.
- 26 kịch bản HTTP đạt trên cơ sở dữ liệu thử nghiệm. Hai tài khoản Triển khai trong cùng dự án chỉ nhận thông tin chung và các mục của mình. API kiểm tra phạm vi khi sửa và khi mở tệp riêng. Dữ liệu phản hồi cho vai trò này chỉ có trường phục vụ triển khai. Kiểm thử cũng xác nhận danh sách giao việc làm mới sau khi tài khoản kích hoạt và quyền truy cập được thu hồi khi mất mọi phân công.
- 19 kiểm thử lưu dữ liệu, 12 kiểm thử xác thực, 15 kiểm thử bảo mật và 3 kiểm thử migration đạt. Migration 008 giữ nguyên tài khoản cũ và thêm vai trò Triển khai. Kiểm thử sử dụng PGlite cục bộ, với trình quét tệp mô phỏng trong bộ HTTP.

## Phân trang màn hình Khách hàng

- Build production, TypeScript, 64 kiểm thử CRM và 9 kiểm thử Excel đạt.
- 25 kịch bản HTTP đạt trên database tạm. Kiểm tra quyền của API quản lý, danh sách 25 dòng, hồ sơ, chọn theo bộ lọc, xuất theo ID và đối chiếu Excel ở máy chủ.
- Edge với 32 khách giả đã đi qua hai trang, chọn và sửa khách qua nhiều trang, xuất đúng dòng CSV, tìm tiếng Việt không dấu, lọc theo nguồn, tải lịch sử theo hồ sơ, chọn khách liên quan và nhập Excel có dòng trùng ngoài trang đang xem. Mở trực tiếp `/?section=customers` thực hiện các thao tác này mà không gọi API workspace đầy đủ. Biểu mẫu cơ hội vẫn mở với đúng khách đã chọn.

## Chuyển dữ liệu sang bảng nghiệp vụ

| Hạng mục | Kết quả tại local |
|---|---|
| Migration 006 | So sánh đầy đủ snapshot trước và sau trên hai workspace giả, gồm ID, liên kết, lịch sử, số tiền và phiên bản. Dữ liệu có liên kết lỗi làm transaction hoàn tác. Bản cũ bị chặn ghi lên snapshot lưu trữ |
| Công cụ đối chiếu | Chạy thử có hoàn tác. Áp dụng chính thức một lần. Đối chiếu trước lần ghi đầu và giữ tài khoản |
| Lưu đồng thời | Hai lần sửa khách khác nhau lưu được với cùng revision ban đầu. Lần sửa cũ trên cùng khách trả HTTP 409 |
| Lưu trữ | 19 kiểm thử lưu dữ liệu, 12 kiểm thử xác thực, 2 kiểm thử migration đạt trên PGlite trong RAM |
| HTTP và trình duyệt | 23 kịch bản HTTP đạt. Kiểm tra phân trang và phạm vi khách của từng tài khoản. Luồng thêm user, kích hoạt, giữ bản nháp và tắt demo vẫn đạt trên Edge |
| Bản dựng | Build và TypeScript đạt. `bash -n` kiểm tra cú pháp script khôi phục |

Một lượt thử cục bộ với 10.000 khách và 100.000 hoạt động tạo dữ liệu API tổng hợp khoảng 16,8 MB. Truy vấn 25 khách khoảng 56 ms, đọc toàn bộ khoảng 745 ms và sửa một khách khoảng 998 ms. Đây là số đo từng thao tác trên PGlite, dùng để nhận diện phần còn đọc toàn bộ, chưa đo tải đồng thời trên PostgreSQL thật. Hướng dẫn chạy thử trên bản sao và mở lại VPS nằm trong [README-VPS.md](README-VPS.md#nâng-cấp-từ-snapshot-sang-các-bảng-nghiệp-vụ).

## Đợt bảo toàn dữ liệu, thêm người dùng và tắt demo

| Hạng mục | Kết quả tại local |
|---|---|
| Nghiệp vụ, Excel và bảo mật | 64, 9 và 15 kiểm thử đạt |
| Lưu dữ liệu và tài khoản | 17 và 12 kiểm thử đạt với PGlite trong RAM |
| HTTP production | 22 tình huống đạt. Demo bị chặn trong CRM, xuất dữ liệu và báo giá |
| Edge | Hai phiên sửa cùng hồ sơ. Người đang sửa nhận xung đột, giữ bản nháp và lưu lại mà giữ email mới của phiên kia. Tạo user từ Admin, kích hoạt, đăng nhập và xác nhận bỏ qua lựa chọn demo cũ |
| Migration | Áp dụng 005 từ bộ schema 001 đến 004 có dữ liệu mẫu tạm. Đối chiếu cả hai workspace và tài khoản. Chạy lần thứ hai không áp dụng lại |
| Bản dựng và cấu hình | TypeScript, build standalone và kiểm tra Compose Nginx đạt |

Các kiểm tra HTTP dùng giao thức scanner mô phỏng và database tạm. Xem [kế hoạch đưa vào vận hành](KE-HOACH-VAN-HANH.md) để theo dõi phần tách bảng, các vai trò mới và nghiệm thu trên VPS.

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
- MFA có thể bắt buộc với Chủ sở hữu và Tài chính bằng `SMEE_REQUIRE_MFA=true` và khóa riêng `SMEE_MFA_KEY`. Link đặt mật khẩu vẫn được chủ sở hữu chuyển riêng cho đúng người. Bảo vệ quyền SSH/Docker và sao lưu ngoài VPS vẫn là trách nhiệm vận hành.

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
