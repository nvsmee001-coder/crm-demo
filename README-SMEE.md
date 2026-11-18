# SMEE agency · Hướng dẫn sử dụng CRM

Ứng dụng web tiếng Việt, nhận diện **đỏ – trắng**, tập trung quản lý khách hàng, bàn giao cho đội telesales, lịch chăm sóc, bán hàng và triển khai dịch vụ. Dữ liệu lưu ở PostgreSQL; tệp riêng được lưu trong volume của VPS và chỉ được tải qua API có phân quyền.

Hướng dẫn cài máy chủ, tạo tài khoản chủ sở hữu và trỏ domain nằm trong **[README-VPS.md](README-VPS.md)**.

## Bắt đầu làm việc

1. Mở domain CRM tại `/login` và đăng nhập bằng email/mật khẩu riêng của CRM. Không có tài khoản mặc định hoặc đăng ký công khai.
2. Chủ sở hữu có quyền toàn hệ thống. Nhân viên chỉ đăng nhập sau khi được cấp quyền, liên kết với nhân sự và đặt mật khẩu bằng link do chủ sở hữu tạo.
3. **Dữ liệu mẫu** dành cho chủ sở hữu thử quy trình. Công ty, người liên hệ, email và số tiền ở đây đều giả lập. Số `+1 202-555-01xx` và email/website `example.com` là dữ liệu minh họa, không dùng để liên hệ thật.
4. Chuyển sang **Dữ liệu công ty** trước khi nhập dữ liệu thật. Hai không gian lưu riêng; nhân viên chỉ được dùng dữ liệu công ty.
5. Kiểm tra thông tin công ty, danh bạ, dịch vụ, giá và phạm vi bàn giao trong Cài đặt trước khi vận hành.

## Tài khoản và phân quyền

Danh bạ nhân sự dùng để phân công. Tài khoản đăng nhập là đối tượng riêng, liên kết với một nhân sự và vai trò rõ ràng.

| Vai trò | Dữ liệu và thao tác |
|---|---|
| Chủ sở hữu | Toàn bộ công ty, tài khoản, khóa/mở khóa quyền, tạo link mật khẩu, dữ liệu mẫu và xuất bản sao nghiệp vụ. |
| Quản lý | Toàn bộ nghiệp vụ công ty: khách, cơ hội, dự án, phân công và tệp. Không quản trị tài khoản hoặc xuất snapshot đầy đủ. |
| Account | Chỉ khách có account phụ trách là mình; xem cơ hội/lịch sử liên quan, cập nhật thông tin chăm sóc và công việc được phép. |
| Telesales | Chỉ khách được giao cho mình ở trường telesales; cập nhật thông tin được phép, ghi kết quả gọi và hoạt động chăm sóc của mình. |

Quyền được kiểm tra ở máy chủ cho từng yêu cầu. Nhân viên không tự đổi người phụ trách, tự chuyển khách, nhập khách hàng hàng loạt hoặc cấp quyền hệ thống. Dữ liệu dự án, nội dung và kho tài liệu toàn công ty không được gửi xuống tài khoản account/telesales.

Để cấp tài khoản:

1. Trong **Dữ liệu công ty → Cài đặt**, tạo nhân sự trong danh bạ.
2. Tại **Tài khoản nhân viên**, chọn **Cấp quyền tài khoản**, điền email, nhân sự liên kết và role.
3. Sau khi lưu, bấm **Đặt mật khẩu** để tạo link dùng một lần, hiệu lực **1 giờ**.
4. Chuyển link qua kênh riêng đã xác minh với đúng nhân viên. App **không gửi email/SMTP tự động**.
5. Nhân viên đặt mật khẩu, sau đó đăng nhập tại `/login`.

Tạo link mới sẽ thay thế link chưa dùng trước đó. Hoàn tất đặt lại mật khẩu sẽ thu hồi các phiên đăng nhập cũ. Khóa tài khoản có hiệu lực ở các yêu cầu tiếp theo; chuyển khách sang người khác cập nhật ngay phạm vi được phép. Phiên đăng nhập có thời hạn 8 giờ.

Nếu chủ sở hữu quên mật khẩu, quản trị viên có quyền SSH dùng `docker compose run --rm app npm run owner:reset` và nhập mật khẩu ẩn trên terminal. Không gửi mật khẩu trong tham số lệnh hoặc cuộc trò chuyện.

## Danh sách và hồ sơ khách hàng

Tìm kiếm/lọc theo trạng thái, account, telesales, nguồn, mức ưu tiên, lịch chăm sóc và nhãn. Các nhóm quá hẹn/hôm nay/chưa hẹn giúp chọn khách cần xử lý trước. Có thể chọn cả danh sách theo bộ lọc để thao tác hàng loạt trong giới hạn được hiển thị.

Mỗi hồ sơ gồm:

- Công ty/tên khách, đầu mối, chức danh, ngành, địa chỉ, website, số điện thoại/email chính và bổ sung.
- Account phụ trách, người nhận telesales, nguồn khách, mức ưu tiên, nhãn và dấu yêu thích.
- Bối cảnh, nhu cầu, ghi chú riêng và liên kết các khách có quan hệ.
- Hoạt động tiếp theo: công việc, cuộc gọi hoặc cuộc hẹn; người xử lý, hạn, giờ nếu có, ghi chú, kết quả hoàn tất/hủy.
- Nhật ký trao đổi, lịch sử cập nhật, cơ hội và dự án liên quan theo quyền của người xem.

Trạng thái chính: **Mới → Đang liên hệ → Đang tư vấn → Đang hợp tác**, cùng **Tạm ngừng/Không phù hợp** khi cần. Tóm tắt hồ sơ lấy từ dữ liệu đã lưu, không tự suy diễn bằng AI.

Lịch chăm sóc chung và các công việc/cuộc hẹn có lịch riêng; khi ghi kết quả, kiểm tra việc tiếp theo và ngày gọi lại để không bỏ sót khách. Cuộc hẹn trong CRM chưa tạo sự kiện Google/Outlook hoặc gửi lời mời.

## Nhập khách hàng từ Excel

Vào **Khách hàng → Nhập Excel**:

1. Chọn/kéo thả file `.xlsx`; tối đa **5 MB**, **500 dòng dữ liệu mỗi sheet**. File `.xls` cần lưu lại thành `.xlsx` trước.
2. Chọn sheet và account phụ trách. Kiểm tra các cột nhận diện tự động; tên khách và số điện thoại là bắt buộc.
3. Xem trước các nhóm **Hợp lệ / Trùng dữ liệu / Cần sửa**, số dòng Excel và lý do. Có thể tải báo cáo kiểm tra.
4. Nếu có dòng không hợp lệ, xác nhận bỏ qua các dòng đó hoặc sửa file rồi chọn lại. Chỉ những dòng hợp lệ đã xác nhận được lưu; dòng trùng không ghi đè khách hiện có.
5. Sau nhập, trở về danh sách đã chọn khách mới hoặc mở **Phân chia telesales** ngay.

Kiểm tra trùng áp dụng cho số điện thoại/email trong file và CRM, kể cả liên hệ bổ sung. Số điện thoại được chuẩn hóa để nhận ra dạng `0…`, `84…`, `+84…`; một số ô di động kiểu số bị Excel bỏ số 0 đầu được khôi phục khi nhận diện được. Luôn xem cột kết quả chuẩn hóa trước khi nhập.

File được đọc trong trình duyệt, không thực thi công thức. Chỉ bản ghi đã xác nhận được gửi lên API, nơi máy chủ tiếp tục kiểm tra dữ liệu, quyền và revision. File mẫu được tải bằng nút **Tải mẫu Excel**; xóa các dòng ví dụ trước khi điền dữ liệu thật.

## Phân chia khách cho đội telesales

Người phụ trách telesales tách riêng với account. Giao khách cho telesales không đổi account quản lý khách.

1. Chọn các khách trong danh sách rồi bấm **Phân chia telesales**.
2. Chọn nhiều nhân viên nhận. Trong dữ liệu công ty, chỉ nhân viên có tài khoản Telesales đang hoạt động mới được chọn.
3. Chọn **Chia đều** hoặc đặt số lượng từng người. Tổng số lượng phải khớp số khách được giao.
4. Điền ghi chú/mục tiêu bàn giao và lịch chăm sóc. Xem bảng phân chia trước khi xác nhận.
5. Khách đã có người nhận mặc định được bỏ qua; cần chọn rõ nếu muốn giao lại. Khách không có số hợp lệ được báo riêng.
6. Xác nhận sẽ lưu cả đợt phân chia sau khi máy chủ kiểm tra. Khách vào trạng thái **Chờ gọi**, giữ lịch sử và account cũ.

Một đợt tối đa 500 khách. Nếu dữ liệu hoặc quyền người nhận thay đổi ở phiên khác, hệ thống yêu cầu tải lại thay vì ghi đè phân công mới hơn.

## Làm việc trong hàng chờ telesales

Mở **Đội telesales**, xem khách được giao, lịch sử, số lần gọi, nhu cầu và ghi chú bàn giao trước khi liên hệ. Nút gọi mở ứng dụng gọi của thiết bị qua `tel:`; CRM chưa có tổng đài, tự quay số hoặc ghi âm.

Sau cuộc gọi, ghi kết quả, nội dung và việc tiếp theo:

- **Không nghe máy/Máy bận:** chuyển sang đang chăm sóc và cần ngày liên hệ tiếp theo.
- **Hẹn gọi lại:** ghi lịch hẹn mới.
- **Quan tâm/Đặt lịch tư vấn:** chuyển sang đủ điều kiện để quản lý tiếp tục tạo cơ hội.
- **Không phù hợp/Sai số:** kết thúc lượt chăm sóc hiện tại và bỏ lịch gọi lại.

Mở liên kết gọi không tự tăng số lần gọi; chỉ ghi nhận khi người dùng lưu kết quả. App không tự gửi ghi chú cho khách hoặc nhân viên qua kênh ngoài.

## Bán hàng và triển khai

- **Cơ hội:** tên, dịch vụ, giá trị, xác suất, giai đoạn, người phụ trách, ngày dự kiến chốt và việc tiếp theo. Xác suất là đánh giá của người dùng. Chốt thành công tạo dự án liên kết.
- **Báo giá:** xem ở `/quotes/<deal-id>?mode=live` và in/lưu PDF. Cần rà soát giá, phạm vi, thuế và điều khoản trước khi gửi; đây chưa phải cơ chế ký hợp đồng/thanh toán.
- **Dự án:** phạm vi, ngân sách, deadline, công việc, người thực hiện, giờ công, chi phí và vướng mắc.
- **Nội dung:** Ý tưởng → Đang sản xuất → Sẵn sàng đăng → Đã đăng. Không có quy trình duyệt hoặc tạo yêu cầu phát sinh.
- **Báo cáo:** tổng hợp bản ghi trong không gian đang mở; cần nhập đúng giờ công và chi phí để đánh giá hiệu quả.

## Tệp và dữ liệu

Chủ sở hữu/quản lý tải tệp tối đa **10 MB**. Máy chủ kiểm tra định dạng thật, quét ClamAV và lưu riêng; scanner chưa sẵn sàng thì tệp chưa được lưu. Account/telesales chỉ đọc ảnh hồ sơ đang gắn với khách thuộc phạm vi được phép, không mở kho tệp tùy ý.

CSV khách hàng chứa dữ liệu người xuất được phép xem. Endpoint JSON `/api/export?mode=live` dành cho chủ sở hữu, xuất nghiệp vụ của không gian cùng revision; **không thay thế backup đầy đủ** vì không gồm toàn bộ bảng tài khoản và byte tệp.

Mỗi không gian đang lưu theo snapshot JSON, giới hạn **1.800.000 byte (khoảng 1,8 MB)** gồm bản ghi và lịch sử. Tệp upload lưu riêng và không tính vào giới hạn snapshot. Khi vượt ngưỡng, máy chủ từ chối lần ghi mới và giữ dữ liệu cũ. Muốn mở rộng quy mô cần thiết kế các bảng khách/hoạt động riêng và thử tải, không chỉ tăng giới hạn.

Dùng `deploy/backup.sh` và đọc phần khôi phục trong README-VPS để giữ đủ database và tệp. Database mới độc lập; gói source không tự nhập dữ liệu công ty đã có ở hệ thống khác.

## Phạm vi tích hợp

Chưa có SMTP/email tự động, SMS, tổng đài, đồng bộ lịch, tự đăng mạng xã hội, phần mềm kế toán, Frappe hoặc ERPNext. Thông báo trong app không phải nhắc việc gửi ra ngoài. Các link kích hoạt tài khoản do chủ sở hữu chuyển thủ công.

## Mã nguồn chính

| Nhóm | Vị trí |
|---|---|
| Giao diện CRM | `components/CRMApp.tsx`, `components/CustomersWorkspace.tsx` |
| Excel và phân chia | `components/CustomerImportDialog.tsx`, `components/CustomerDistributionDialog.tsx`, `lib/customer-excel.ts` |
| Nghiệp vụ và quyền | `lib/crm-engine.ts`, `lib/crm-access.ts`, `lib/access-store.ts` |
| PostgreSQL | `lib/database.ts`, `lib/crm-store.ts`, `migrations/` |
| Tài khoản, mật khẩu, session | `lib/auth/`, `app/api/auth/`, `scripts/create-owner.ts`, `scripts/reset-owner-password.ts` |
| Upload và quét tệp | `lib/file-store.ts`, `lib/malware-scan.ts`, `app/api/uploads/` |
| HTTP và CSP | `lib/http-security.ts`, `proxy.ts`, `next.config.ts` |
| VPS và backup | `Dockerfile`, `compose.yaml`, `deploy/`, `README-VPS.md` |
