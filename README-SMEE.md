# SMEE agency · Hướng dẫn sử dụng CRM

Ứng dụng web tiếng Việt, nhận diện **đỏ – trắng**, tập trung quản lý khách hàng, bàn giao cho đội telesales, lịch chăm sóc, bán hàng và triển khai dịch vụ. Dữ liệu lưu ở PostgreSQL; tệp riêng được lưu trong volume của VPS và chỉ được tải qua API có phân quyền.

Hướng dẫn cài máy chủ, tạo tài khoản chủ sở hữu và trỏ domain nằm trong **[README-VPS.md](README-VPS.md)**.

## Bắt đầu làm việc

1. Mở domain CRM tại `/login` và đăng nhập bằng email/mật khẩu riêng của CRM. Không có tài khoản mặc định hoặc đăng ký công khai.
2. Chủ sở hữu có quyền toàn hệ thống. Nhân viên chỉ đăng nhập sau khi được cấp quyền, liên kết với nhân sự và đặt mật khẩu bằng link do chủ sở hữu tạo.
3. **Dữ liệu mẫu** dành cho chủ sở hữu thử quy trình. Công ty, người liên hệ, email và số tiền ở đây đều giả lập. Số `+1 202-555-01xx` và email/website `example.com` là dữ liệu minh họa, không dùng để liên hệ thật.
4. Trình duyệt mới mở **Dữ liệu công ty**. CRM ghi nhớ lựa chọn của chủ sở hữu nếu đã chuyển sang **Dữ liệu mẫu**. Kiểm tra nhãn không gian trước khi nhập khách. Nhân viên làm việc trong dữ liệu công ty.
5. Kiểm tra thông tin công ty, danh bạ, dịch vụ, giá và phạm vi bàn giao trong Cài đặt trước khi vận hành.

## Tài khoản và phân quyền

Danh bạ nhân sự dùng để phân công. Tài khoản đăng nhập là đối tượng riêng, liên kết với một nhân sự và vai trò rõ ràng.

| Vai trò | Dữ liệu và thao tác |
|---|---|
| Chủ sở hữu | Toàn bộ công ty, tài khoản, khóa/mở khóa quyền, tạo link mật khẩu, dữ liệu mẫu và xuất bản sao nghiệp vụ. |
| Quản lý | Quản lý khách, cơ hội, dự án, phân công và tệp. Được xem sổ thu tiền. Quyền ghi phiếu, sửa trị giá hợp đồng đã mở sổ, quản trị tài khoản và xuất bản sao JSON đầy đủ thuộc chủ sở hữu. |
| Sale / Account | Thêm khách tự khai thác, cập nhật hồ sơ khách mình phụ trách và theo dõi lịch chăm sóc, công việc, cơ hội liên quan. |
| Telesales | Thêm khách tự khai thác vào danh sách gọi của mình, cập nhật hồ sơ thuộc danh sách này và ghi kết quả chăm sóc. |

Quyền được kiểm tra ở máy chủ cho từng yêu cầu. Nhân viên chỉ nhập Excel cho khách tự khai thác của chính mình; không tự đổi người phụ trách, tự chuyển khách hoặc cấp quyền hệ thống. Dữ liệu dự án, nội dung và kho tài liệu toàn công ty không được gửi xuống tài khoản account/telesales.

Để cấp tài khoản:

1. Trong **Dữ liệu công ty → Cài đặt**, tạo nhân sự trong danh bạ.
2. Mở **Quản trị** ở thanh bên hoặc truy cập `/admin` bằng tài khoản chủ sở hữu. Trong mục **Tài khoản**, chọn **Cấp quyền tài khoản**, điền email, chọn nhân sự liên kết và vai trò. Trang quản trị luôn thao tác trên dữ liệu công ty, kể cả khi vừa xem không gian mẫu.
3. Sau khi lưu, bấm **Đặt mật khẩu** để tạo link dùng một lần, hiệu lực **1 giờ**.
4. Chuyển link qua kênh riêng đã xác minh với đúng nhân viên. App **không gửi email/SMTP tự động**.
5. Nhân viên đặt mật khẩu, sau đó đăng nhập tại `/login`.

Trên trang quản trị, chủ sở hữu có thể tìm theo tên, email hoặc vai trò, lọc theo trạng thái và xem lịch sử thay đổi quyền truy cập.

Tạo link mới sẽ thay thế link chưa dùng trước đó. Hoàn tất đặt lại mật khẩu sẽ thu hồi các phiên đăng nhập cũ. Khóa tài khoản có hiệu lực ở các yêu cầu tiếp theo; chuyển khách sang người khác cập nhật ngay phạm vi được phép. Phiên đăng nhập có thời hạn 8 giờ.

Nếu chủ sở hữu quên mật khẩu, quản trị viên có quyền SSH dùng `docker compose run --rm app npm run owner:reset` và nhập mật khẩu ẩn trên terminal. Không gửi mật khẩu trong tham số lệnh hoặc cuộc trò chuyện.

## Lịch chăm sóc và dự báo bán hàng

- **Lịch chăm sóc** tập hợp ngày liên hệ tiếp theo và các công việc đang chờ trong hồ sơ khách hàng. Mở một dòng để xem hồ sơ. Biểu tượng chuông trên màn hình quản lý mở ngay danh sách đến hạn. Có thể xuất các mục đang lọc thành tệp lịch `.ics`.
- Trong **Báo cáo → Dự báo bán hàng**, chọn tháng này, quý này hoặc tất cả thời gian. Hệ thống cộng giá trị của từng cơ hội đang mở sau khi nhân với xác suất chốt. Cơ hội thắng hoặc thua được loại khỏi phép tính. Nhấn vào tên cơ hội để kiểm tra hoặc chỉnh sửa xác suất và ngày dự kiến chốt.

## Danh sách và hồ sơ khách hàng

Trên màn hình nhân viên có quyền **Sale / Account** hoặc **Telesales**, bấm **Thêm khách tự khai thác** để nhập thông tin liên hệ, nguồn khách và nhu cầu. Có thể ghi ngay việc tiếp theo và ngày chăm sóc để theo dõi trong lịch cá nhân. Khi lưu, CRM tự gán khách cho người vừa thêm và mở hồ sơ mới. Với Telesales, nhập thêm số điện thoại để khách vào danh sách gọi của bạn với trạng thái **Chờ gọi**.

Chọn bộ lọc **Tự khai thác** để xem các khách bạn đã tìm và đang phụ trách. Với khách tự khai thác hoặc được giao, mở hồ sơ rồi chọn **Cập nhật hồ sơ** để sửa thông tin, trạng thái, mức ưu tiên hoặc lịch hẹn.

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

### Sale / Account và Telesales

1. Trong **Hồ sơ khách hàng**, bấm **Nhập Excel** rồi tải mẫu. Điền mỗi khách một dòng trong trang **Khách hàng**. Tên và số điện thoại là bắt buộc. Có thể nhập thêm nguồn, nhu cầu, trạng thái, mức ưu tiên, việc tiếp theo và ngày chăm sóc. Trang **Hướng dẫn** có ví dụ cho từng cột.
2. Chọn tệp `.xlsx` tối đa **5 MB**, với tối đa **500 khách trên một trang tính**. Kiểm tra tên cột được ghép tự động. Giữ số điện thoại ở định dạng văn bản để bảo toàn số 0 ở đầu.
3. Bấm kiểm tra để xem các dòng hợp lệ, bị trùng hoặc cần sửa. Máy chủ đối chiếu các cột đã ghép với dữ liệu công ty. Chọn các dòng hợp lệ cần nhập và xác nhận lưu.
4. Mở bộ lọc **Tự khai thác** để xem khách vừa nhập. Người nhập tự động phụ trách các hồ sơ này. Khách của Telesales cũng xuất hiện trong danh sách **Chờ gọi**.

### Chủ sở hữu và quản lý

Mở **Khách hàng → Nhập Excel**.

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

## Tổng quan dành cho chủ doanh nghiệp

Trong **Tổng quan → Hồ sơ cần rà soát**, chọn một người phụ trách hoặc một lý do để xem khách quá hẹn, khách thiếu lịch và cơ hội quá ngày dự kiến chốt hoặc thiếu bước tiếp theo. Bấm vào tên để mở hồ sơ và cập nhật. Một khách có nhiều lịch trễ xuất hiện một lần với lịch trễ nhất. Danh sách ưu tiên dùng ngày giờ Việt Nam.

Biểu đồ **Nhịp độ kinh doanh** gom dự án theo tháng bắt đầu. Tổng ở đầu biểu đồ và sáu điểm trên biểu đồ dùng cùng khoảng thời gian. Số tiền ở đây là giá trị hợp đồng. Xem tiền đã nhận trong **Thu tiền & công nợ**.

## Thu tiền và đối chiếu hợp đồng

1. Vào **Thu tiền & công nợ**, lọc **Chưa đối chiếu** và mở một hợp đồng.
2. Chọn **Mở sổ thu tiền**. Đối chiếu chứng từ, nhập số tiền thực tế đã nhận trước đó (có thể bằng 0) và hạn thanh toán phần còn lại nếu đã thỏa thuận. CRM chỉ tổng hợp các hợp đồng đã mở sổ.
3. Khi nhận thêm tiền, chọn **Ghi phiếu thu**, nhập số tiền, ngày nhận cùng mã phiếu hoặc mã giao dịch. Số còn phải thu bằng giá trị hợp đồng trừ số đầu kỳ và các phiếu còn hiệu lực.
4. Chủ sở hữu có thể hủy một phiếu hoặc điều chỉnh số đầu kỳ, kèm lý do. Mở lại lịch sử hợp đồng để xem người và thời điểm điều chỉnh. **Quá hạn thanh toán** chỉ tính phần còn nợ đã có hạn trước hôm nay. **Còn nợ chưa có hạn** giúp rà các hợp đồng còn thiếu ngày hẹn.
5. Vào **Báo cáo → Xuất báo cáo dự án** để tải CSV có giá trị hợp đồng, tiền đã thu, số còn phải thu và hạn thanh toán. Hợp đồng chưa đối chiếu có nhãn riêng và để trống các cột tiền thu/nợ.

## Tệp và dữ liệu

Chủ sở hữu/quản lý tải tệp tối đa **10 MB**. Máy chủ kiểm tra định dạng thật, quét ClamAV và lưu riêng; scanner chưa sẵn sàng thì tệp chưa được lưu. Account/telesales chỉ đọc ảnh hồ sơ đang gắn với khách thuộc phạm vi được phép, không mở kho tệp tùy ý.

CSV khách hàng chứa dữ liệu người xuất được phép xem. Endpoint JSON `/api/export?mode=live` dành cho chủ sở hữu, xuất nghiệp vụ của không gian cùng revision; **không thay thế backup đầy đủ** vì không gồm toàn bộ bảng tài khoản và byte tệp.

Mỗi không gian đang lưu theo snapshot JSON, giới hạn **1.800.000 byte (1,8 MB)** gồm bản ghi và lịch sử. Chủ sở hữu xem dung lượng tại **Cài đặt → Dữ liệu & kết nối**. Từ 80%, CRM hiển thị cảnh báo. Tệp đính kèm dùng bộ nhớ riêng. Lần ghi vượt giới hạn sẽ bị từ chối. Với khối lượng lớn, cần tách dữ liệu thành các bảng nghiệp vụ và thử tải trước khi mở rộng.

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
