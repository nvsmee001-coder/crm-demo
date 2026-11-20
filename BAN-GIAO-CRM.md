# SMEE CRM · Bàn giao cho chủ doanh nghiệp

Bản ngày 19/11/2026 chuẩn bị triển khai trên VPS cho một công ty. Đăng nhập tại `/` để làm việc. Chủ sở hữu quản trị tài khoản tại `/admin`.

## Những điểm ảnh hưởng đến quyết định quản lý

| Vấn đề trong bản trước | Thay đổi | Nơi kiểm tra |
|---|---|---|
| Giá trị đã ký chưa trả lời được khách thực sự đã thanh toán bao nhiêu. | Thêm số đầu kỳ đã đối chiếu, phiếu thu có mã chứng từ, hạn thanh toán và lịch sử hủy/điều chỉnh. Số tiền tổng hợp chỉ gồm hợp đồng đã mở sổ. | **Thu tiền & công nợ**, **Báo cáo → Xuất báo cáo dự án** |
| Tất cả cơ hội mở đều bị cộng vào việc cần xử lý. Khó biết khách nào đang bị bỏ quên và ai phụ trách. | Ưu tiên khách quá hẹn hoặc thiếu lịch và cơ hội quá ngày chốt hoặc thiếu thông tin hành động. Lọc theo nhân sự, mở thẳng hồ sơ. Cảnh báo vận hành có thêm hợp đồng quá hạn thu tiền. | **Tổng quan → Hồ sơ cần rà soát** |
| Đường biểu đồ hiển thị sáu tháng nhưng con số đầu biểu đồ cộng toàn bộ lịch sử. Chuyển tháng vào ngày 29–31 có thể bỏ sót một tháng. | Tính sáu tháng lịch liên tiếp và tổng đúng các tháng hiển thị cho cả số dự án và giá trị hợp đồng. | **Tổng quan → Nhịp độ kinh doanh** |
| Chủ sở hữu lần đầu có thể nhập nhầm vào dữ liệu mẫu. Dung lượng của không gian chỉ lộ rõ khi ghi thất bại. | Trình duyệt mới mặc định vào dữ liệu công ty. Có đồng hồ dung lượng và cảnh báo từ 80%. | Nhãn không gian dưới tiêu đề và **Cài đặt → Dữ liệu & kết nối** |
| Trình duyệt tải nhiều màn hình ngay từ đầu. Các lần đồng bộ định kỳ của nhân viên tải lại cả phần dữ liệu được phép xem dù chưa có thay đổi. | Tải mã của màn hình khi mở. Mỗi lần đồng bộ vẫn kiểm tra phiên và quyền. Nếu dữ liệu và quyền còn nguyên, máy chủ trả HTTP 304 với 0 byte nội dung. | Bản dựng production và kiểm thử API |
| Tên miền của proxy có thể lệch URL ứng dụng. Các tác vụ sao lưu và phục hồi có thể chạy chồng lên nhau. | Kiểm tra khớp tên miền, giới hạn log Docker, khóa tác vụ bảo trì, kiểm tra dump và bản sao tệp. Sau phục hồi, đối chiếu nội dung tệp với PostgreSQL trước khi mở lại app. | [Quy trình VPS](README-VPS.md) |

## Khi đưa số liệu hiện có vào sổ

Chủ sở hữu đối chiếu từng hợp đồng với chứng từ thu. Điền 0 khi đã xác nhận khách chưa trả tiền. Giữ trạng thái **Chưa đối chiếu** khi chưa đủ thông tin. Mỗi hợp đồng dùng một hạn cho toàn bộ số còn lại. CRM ghi nhận theo phiếu nhập thủ công. Hóa đơn thuế, đối soát ngân hàng tự động và lịch trả góp nhiều kỳ nằm ngoài nghiệp vụ của sổ này.

Quản lý có thể theo dõi công nợ. Quyền ghi, hủy phiếu và sửa giá trị hợp đồng đã mở sổ thuộc chủ sở hữu. Account và Telesales tiếp tục dùng hồ sơ tự khai thác và nhập Excel trong phạm vi được cấp.

## Điều kiện đưa lên website

- **Dung lượng.** Một không gian có giới hạn 1.800.000 byte dữ liệu nghiệp vụ, gồm lịch sử và phiếu thu. Tệp đính kèm được lưu riêng. Có thể xem số byte đã dùng trong Cài đặt. Với dữ liệu lớn, cần thử trên bản sao có quy mô đại diện trước khi chuyển toàn bộ công ty.
- **Dữ liệu bàn giao.** ZIP chứa source, tệp cấu hình mẫu và script triển khai. Tạo mật khẩu, cấu hình tên miền và lưu bản sao dữ liệu riêng trên máy chủ đích.
- **Nghiệm thu tại VPS.** Làm theo [hướng dẫn triển khai](README-VPS.md), kiểm tra chứng chỉ HTTPS trên tên miền, đăng nhập từng vai trò, tải tệp qua ClamAV và diễn tập khôi phục sang một môi trường riêng trước khi nhập dữ liệu thật.

Chi tiết thao tác nằm trong [hướng dẫn CRM](README-SMEE.md). Kết quả kiểm tra triển khai và phạm vi thử nghiệm nằm trong [báo cáo kiểm thử](SECURITY-VALIDATION.md).
