# Kế hoạch đưa SMEE CRM vào vận hành thật

Ngày lập 20/11/2026. Nền mã đã rà soát `ef15616`. Các mục đã đánh dấu đã có triển khai và kiểm tra tại local.

Mục tiêu là một CRM nội bộ cho một công ty, dùng được với nhiều nhân viên, có phân công rõ ràng, bảo toàn dữ liệu và khôi phục được khi VPS gặp sự cố. Giữ nền Next.js, Node.js, PostgreSQL, Docker, Nginx và ClamAV; cải tiến theo từng đợt có kiểm chứng và phương án chuyển đổi dữ liệu.

## Quyết định nghiệp vụ đã chốt

- Sale/Account được tạo cơ hội và báo giá cho khách thuộc phạm vi phụ trách. Quản lý hoặc Chủ sở hữu xác nhận chốt thắng và thay đổi giá trị hợp đồng.
- Có vai trò Triển khai cho nhân sự dự án và nội dung. Họ chỉ thấy dự án, công việc và hồ sơ tối thiểu cần để thực hiện phần việc được giao.
- Môi trường vận hành dùng dữ liệu công ty. Chế độ dữ liệu mẫu bị vô hiệu hóa ở cả giao diện và API; môi trường thử có database, tệp, tài khoản và cấu hình riêng.
- Một người có định danh nhân sự ổn định. Chức danh công việc tách khỏi quyền truy cập. Quản trị tài khoản tập trung tại Admin.

## Phạm vi lần đưa vào vận hành đầu tiên

Hoàn thiện tài khoản, khách hàng, telesales, chăm sóc, cơ hội, báo giá, xác nhận hợp đồng, triển khai, thu tiền, báo cáo và vận hành máy chủ. Phần kế toán thuế, hóa đơn điện tử, tổng đài, ghi âm, đồng bộ ngân hàng, tự đăng mạng xã hội và hệ thống cho nhiều công ty nằm ngoài lần triển khai này. SMTP chưa là điều kiện bắt buộc; liên kết kích hoạt vẫn có thể được chuyển thủ công qua kênh đã xác minh.

## Những lỗi phải đóng trước khi dùng dữ liệu thật

| Mã | Vấn đề đã kiểm chứng | Kết quả cần đạt |
|---|---|---|
| F01 | Biểu mẫu cũ dùng revision mới sau tải nền, có thể ghi đè thay đổi của người khác mà vẫn báo thành công. | Giữ phiên bản lúc bắt đầu sửa; lưu trường đã thay đổi; xung đột giữ nguyên bản nháp và chỉ rõ cách giải quyết. |
| F02 | Giao lịch chăm sóc cho người không được xem khách khiến họ không thấy việc. | Chỉ giao cho người đủ quyền; giao ngoài nhóm phụ trách phải cấp quyền cộng tác giới hạn một cách rõ ràng. |
| F03 | Bàn giao khách để lại việc chờ cho người cũ đã mất quyền xem khách. | Xem trước và chuyển/hủy/phân công lại mọi việc còn mở trong cùng giao dịch bàn giao. |
| F04 | Công việc của dự án đã nghiệm thu vẫn xóa được qua API, làm thay đổi chi phí. | Khóa tạo/sửa/xóa bản ghi con sau nghiệm thu; điều chỉnh đi qua mở lại có lý do và nhật ký. |
| F05 | Account không được tạo cơ hội; nhân sự được giao công việc không thấy dự án. | Thực hiện đúng ma trận quyền và kiểm tra bằng tài khoản thật của từng vai trò. |
| F06 | Snapshot nghiệp vụ chung giới hạn 1.800.000 byte | Migration 006 đã tách dữ liệu và bỏ giới hạn khỏi đường ghi. Cần chuyển từng màn hình sang API theo nghiệp vụ để giảm lượng dữ liệu đọc. |

Bằng chứng tái hiện cục bộ nằm trong `.test-output/audit-current-20261120.mjs` và `.test-output/audit-concurrency-browser.mjs`; thư mục này bị Git bỏ qua. Khi triển khai, đưa các ca cần thiết thành kiểm thử hồi quy trong `tests/`, dùng dữ liệu giả, không phụ thuộc các tệp tạm này.

## Ma trận quyền mục tiêu

| Vai trò | Khách hàng và chăm sóc | Bán hàng | Dự án | Tài khoản và tài chính |
|---|---|---|---|---|
| Chủ sở hữu | Toàn công ty | Phê duyệt và điều chỉnh | Toàn công ty | Quản trị tài khoản, cấu hình, tài chính và phục hồi |
| Quản lý | Toàn công ty, phân công và bàn giao | Phê duyệt báo giá, chốt thắng, đề xuất/xác nhận điều chỉnh hợp đồng theo quy tắc | Phân công, nghiệm thu, mở lại có lý do | Không cấp quyền hệ thống; không tự ghi/hủy phiếu thu |
| Sale/Account | Khách phụ trách hoặc được cấp quyền cộng tác | Tạo cơ hội, lập báo giá, đề nghị phê duyệt; không tự chốt thắng hoặc sửa giá trị đã xác nhận | Xem tiến độ của dự án thuộc khách mình phụ trách, không thấy chi phí nội bộ | Không quản trị tài khoản, không ghi sổ tiền |
| Telesales | Khách tự khai thác/được giao; ghi cuộc gọi, đề nghị bàn giao | Ghi nhu cầu và gửi khách đủ điều kiện cho Sale | Không truy cập nội bộ dự án | Không quản trị hoặc xem sổ tiền |
| Triển khai | Thông tin liên hệ và yêu cầu tối thiểu của dự án được giao | Không xem pipeline và giá vốn/doanh thu toàn công ty | Thực hiện việc, nội dung, báo vướng mắc trong phạm vi được giao | Không quản trị hoặc xem sổ tiền |
| Tài chính | Thông tin cần đối chiếu hợp đồng và thanh toán | Xem hợp đồng đã xác nhận | Xem mốc thanh toán liên quan | Ghi thu; đề nghị hủy/điều chỉnh để Chủ sở hữu xác nhận; không quản trị user |

Vai trò Tài chính sử dụng màn hình thu tiền riêng cho các hợp đồng đã xác nhận. Chủ sở hữu mở sổ và xử lý đề nghị điều chỉnh phiếu. Khi chưa có nhân sự Tài chính, Chủ sở hữu có thể thực hiện toàn bộ luồng thu tiền. Mọi API đọc, tìm kiếm, xuất dữ liệu, tải tệp và ghi đều kiểm tra quyền ở máy chủ.

## Đợt 1 Sửa lỗi bảo toàn dữ liệu

- [x] Kiểm tra F01 qua hai phiên và kiểm tra hồi quy F02 đến F04. Kiểm tra trường hợp hai người ghi vào hai hồ sơ với cùng phiên bản workspace.
- [x] Giữ phiên bản khi mở biểu mẫu và giữ phần nhập nếu gặp HTTP 409. Biểu mẫu chung và cài đặt công ty cho đối chiếu rồi giữ các trường đã sửa. Biểu mẫu nghiệp vụ chuyên biệt yêu cầu xem lại bản ghi hoặc làm lại bước xem trước trước khi gửi.
- [x] Chặn gửi lặp khi đang lưu. Migration 005 lưu mã thao tác cho chốt cơ hội, ghi thu và nhập dữ liệu để nhận diện yêu cầu giống nhau gửi lại sau lỗi kết nối.
- [x] Kiểm tra trạng thái dự án cho cả tạo, sửa, xóa công việc, nội dung và vướng mắc. Mở lại ghi người thực hiện, thời điểm, lý do và kết quả nghiệm thu trước đó.
- [x] Chặn giao việc cho người không có quyền xem khách. Với snapshot, chuyển việc đang chờ của người phụ trách cũ trong cùng giao dịch. Đợt 3 mở rộng sang cộng tác và lựa chọn người xử lý cho từng việc.

**Nghiệm thu:** tái hiện cũ không còn ghi đè im lặng; xung đột không làm mất bản nháp; dự án hoàn tất không bị sửa chi phí qua xóa công việc. Kiểm tra trên cả API và trình duyệt. Sửa trên nền lưu hiện tại trước để giữ được cơ chế bảo toàn dữ liệu trong quá trình chuyển đổi.

## Đợt 2 Chuyển dữ liệu nghiệp vụ sang các bảng riêng

- [x] Tạo migration 006 và lớp truy cập bảng nghiệp vụ. Giữ nguyên các migration 001 đến 005 và giữ định dạng API đang được giao diện sử dụng.
- [x] Tách nhân sự, khách hàng, cuộc gọi, ghi chú, lịch chăm sóc, cơ hội và lịch sử giai đoạn. Tách dự án, công việc, nội dung và lịch sử chỉnh sửa, vướng mắc, sổ thu, phiếu thu và nhật ký nghiệp vụ.
- [ ] Tách đầu mối liên hệ và quyền cộng tác. Thêm phiên bản báo giá, đề nghị phê duyệt, hợp đồng, người tham gia dự án, đề nghị điều chỉnh sổ và liên kết quyền đọc tệp khi triển khai các luồng tương ứng.
- [x] Giữ ID, phiên bản workspace, thứ tự và liên kết đã có. Thêm khóa ngoại cho khách, dịch vụ, dự án và lịch sử liên quan. Phiếu thu có cột số tiền nguyên và ngày thanh toán có kiểu dữ liệu SQL.
- [ ] Chuẩn hóa số tiền, ngày và thời điểm của các trường còn nằm trong JSON từng bản ghi khi chuyển các màn hình sang API riêng. Giữ hiển thị giờ Việt Nam.
- [ ] Kiểm tra trùng liên hệ tại database theo quy tắc đã thống nhất; chuẩn hóa số điện thoại/email. Trường hợp hai công ty dùng chung tổng đài/email cần một luồng ngoại lệ có lý do, không cho phép lách kiểm tra tự do.
- [x] Đánh dấu revision thay đổi gần nhất cho từng bản ghi. Hai lần sửa các hồ sơ khác nhau lưu được dù bắt đầu từ cùng revision. Lần sửa cũ trên cùng hồ sơ trả xung đột.
- [x] Cho phép các lượt đọc thông thường dùng khóa chia sẻ. Giao dịch ghi nghiệp vụ hiện vẫn dùng khóa công ty và workspace để bảo toàn phân quyền, chống trùng và thao tác hàng loạt.
- [x] Có API `/api/crm/customers` cho danh sách khách công ty theo trang, lọc và tìm kiếm trên máy chủ. Áp dụng quyền theo khách ở truy vấn.
- [x] Màn hình quản lý Khách hàng tải từng trang 25 dòng. Mở hồ sơ, chọn toàn bộ theo bộ lọc, xuất CSV và kiểm tra Excel có yêu cầu riêng. Giữ lựa chọn khi đổi trang và chỉ tải dữ liệu tổng hợp khi chuyển sang màn hình cần dữ liệu đó.
- [ ] Chuyển các màn hình còn lại sang API theo từng nhóm nghiệp vụ. Sau khi tách quy tắc ghi, thay khóa ghi chung bằng khóa đúng đối tượng liên quan.
- [x] Có CLI chạy migration thử, hoàn tác và so sánh snapshot trong cùng giao dịch. Lỗi liên kết làm dừng migration. Sau chuyển có thể đối chiếu ID, dữ liệu, số tiền và lịch sử trước lần ghi đầu tiên.

**Nghiệm thu:** bộ dữ liệu đại diện vượt 1,8 MB hoạt động bình thường; sửa hai khách khác nhau không xung đột chỉ vì dùng chung workspace; đối chiếu dữ liệu chuyển đổi đầy đủ. Kiểm tra tích hợp bằng PostgreSQL 17 thật trong môi trường riêng; PGlite tiếp tục phục vụ các bài thử nhanh.

**Chuyển đổi:** thêm schema mới → diễn tập trên bản sao → dừng mọi tác vụ ghi → tạo backup đầy đủ → chuyển và đối chiếu → mở phiên bản mới. Giữ snapshot cũ ở trạng thái lưu trữ, chặn ứng dụng cũ ghi trở lại. Trước khi mở ghi mới có thể quay về bản cũ sau kiểm tra; sau khi đã có ghi mới phải phục hồi/sửa tiến có đối chiếu các giao dịch mới. Chỉ hạ image không đủ để quay lui dữ liệu.

## Đợt 3 Hoàn thiện Admin và phân công

- [x] Admin có nút **Thêm người dùng**. Nhập tên, email, chức danh và quyền CRM để tạo nhân sự và quyền truy cập trong một giao dịch. Có thể chọn nhân sự có sẵn.
- [ ] Hiển thị rõ Chưa gửi liên kết, Chờ kích hoạt, Đang hoạt động và Đã khóa. Có tạo lại/thu hồi liên kết, đổi vai trò, quản lý phiên và khóa tài khoản.
- [ ] Đồng bộ quy tắc tên hiển thị; đổi email đăng nhập có xác minh do Chủ sở hữu thực hiện, kiểm tra trùng và thu hồi phiên/liên kết cũ. Tên người hiển thị có thể đổi; nhật ký vẫn giữ ID và thông tin tại thời điểm thao tác.
- [x] Bổ sung vai trò Triển khai từ Admin và màn hình việc riêng. Kiểm tra quyền đọc, ghi và tải tệp ở máy chủ. Phạm vi dự án lấy từ nhóm hoặc các mục được giao. Mỗi nhân sự nhận các mục của mình và thông tin tối thiểu của dự án.
- [x] Bổ sung quyền Tài chính với màn hình riêng. Kiểm tra ghi phiếu, đề nghị sửa hoặc hủy, quyền xác nhận của Chủ sở hữu và quyền điều chỉnh hợp đồng của Quản lý.
- [ ] Giao việc cho người đang hoạt động và đủ quyền. Nếu cần người ngoài nhóm khách tham gia, phải cấp quyền cộng tác cụ thể, tối thiểu và có thể thu hồi; không tự mở toàn bộ lịch sử khách.
- [x] Bàn giao khi nghỉ việc có màn hình xem trước khách, cơ hội, lịch chờ và công việc liên quan. Chọn người nhận đủ quyền theo từng nhóm. Đề nghị chuyển khách đang chờ được ghi nhận hủy với lý do. Hồ sơ hoàn tất giữ người phụ trách cũ.
- [x] Chủ sở hữu xác nhận chuyển việc và khóa tài khoản bằng mật khẩu hiện tại. Có thể khóa trước rồi bàn giao sau. Phiên và liên kết đặt mật khẩu bị thu hồi ngay. Danh bạ và lịch sử được giữ lại.
- [x] MFA cho Chủ sở hữu và Tài chính khi bật chính sách trên VPS, có mã khôi phục và hướng dẫn mất thiết bị. Đăng ký, đổi thiết bị, cấp lại MFA và khóa hoặc bàn giao yêu cầu xác nhận mật khẩu hiện tại.

**Nghiệm thu:** tạo user mới hoàn tất từ Admin; thử kích hoạt, hết hạn, thu hồi và khóa; người bị khóa không tiếp tục đọc/ghi qua request mới. Người nhận việc nhìn thấy và xử lý được việc, người đã bàn giao không còn giữ quyền ngoài chính sách.

## Đợt 4 Khép kín luồng bán hàng

Luồng mục tiêu: Khách mới → Phân công → Telesales chăm sóc → Đề nghị bàn giao → Sale nhận → Cơ hội → Báo giá được phê duyệt → Xác nhận hợp đồng → Chốt thắng và tạo dự án.

- [x] Telesales gửi khách đủ điều kiện cho Sale/Account đã kích hoạt, kèm hạn tiếp nhận và nhu cầu. Sale nhận hoặc trả lại có lý do. Hàng chờ đánh dấu đề nghị quá hạn. Khi nhận, CRM chuyển hồ sơ, việc chờ và cơ hội đang mở thuộc phạm vi bàn giao trong cùng giao dịch, giữ lịch sử.
- [x] Sale tạo và cập nhật cơ hội do mình phụ trách trên hồ sơ khách được giao. Cơ hội có nhu cầu, giá trị, ngày dự kiến chốt, bước tiếp theo và lịch sử giai đoạn. Ghi lý do khi đánh dấu không thành công.
- [x] Báo giá có số, phiên bản, thời hạn hiệu lực, nhiều hạng mục, phạm vi, điều khoản, chiết khấu và thuế suất. Đọc và in lại nội dung đã lưu theo phiên bản.
- [x] Quản lý hoặc Chủ sở hữu duyệt hoặc trả lại báo giá. Phiên bản từng trình duyệt giữ nguyên nội dung, người soạn sửa bằng cách tạo phiên bản kế tiếp.
- [x] Sale đề nghị chốt kèm căn cứ thỏa thuận. Quản lý hoặc Chủ sở hữu xác nhận số hợp đồng hoặc mã xác nhận. Hợp đồng và dự án liên kết được tạo trong cùng lần lưu, với báo giá đã duyệt làm căn cứ.
- [x] Hợp đồng đã xác nhận có đề nghị điều chỉnh giá trị và phạm vi, lý do, người xử lý và lịch sử. Chủ sở hữu có thể tự xác nhận ngoại lệ khi ghi lý do. Hệ thống đối chiếu giá trị mới với số đã thu ngay khi xác nhận.
- [x] Có luồng để Chủ sở hữu ghi căn cứ, số hợp đồng, ngày ký hoặc xác nhận và giá trị của dự án có trước luồng duyệt. Sổ đã mở và phiếu cũ được bảo toàn. Đối chiếu chứng từ thực tế thực hiện khi nghiệm thu dữ liệu công ty.

**Nghiệm thu:** chạy trọn luồng bằng tài khoản Telesales, Sale, Quản lý; Sale không gọi API để tự chốt hay tự sửa hợp đồng đã xác nhận; báo giá đã phát hành giữ nguyên phiên bản và mọi dự án có nguồn liên kết rõ ràng.

## Đợt 5 Hoàn thiện triển khai và tài chính

- [x] Chủ sở hữu và Quản lý quản lý nhóm triển khai cùng người phụ trách theo từng mục. Nhân sự Triển khai có thể ghi tiến độ, cập nhật nội dung và xử lý vướng mắc trong phạm vi mình được giao.
- [x] Sale/Account xem tab Dự án trong hồ sơ khách mình phụ trách. Máy chủ trả trạng thái, hạn, số mục còn mở và ngày nghiệm thu.
- [x] Có tùy chọn Chủ sở hữu bật duyệt trước khi đăng. Quản lý hoặc Chủ sở hữu xem bản hiện tại, ghi căn cứ duyệt hoặc lý do trả lại. Sửa nội dung, tiêu đề, tệp hoặc kênh tạo phiên bản cần duyệt lại.
- [x] Nghiệm thu ghi bằng chứng, người xác nhận và thời điểm. Chủ sở hữu có thể ghi lý do ngoại lệ và lưu số mục còn mở. Mở lại dự án giữ bản nghiệm thu cũ trong nhật ký. Kiểm thử xác nhận nghiệm thu giữ nguyên công nợ.
- [x] Thu tiền theo hợp đồng đã xác nhận. Số đầu kỳ và phiếu cũ giữ nguyên khi xác nhận hợp đồng. Số còn nợ được tính riêng với trạng thái triển khai hoặc nghiệm thu.
- [x] Gửi lại cùng mã yêu cầu ghi một lần. Chứng từ còn hiệu lực dùng mã duy nhất trong dự án. Tài chính đề nghị hủy hoặc sửa phiếu, Chủ sở hữu xác nhận. Khi xác nhận, kiểm tra lại tổng thu với giá trị hợp đồng và giữ phiếu cũ trong lịch sử.
- [x] Báo cáo tách giá trị cơ hội, giá trị hợp đồng đã xác nhận, số thu lũy kế, phải thu và chi phí. Màn hình công nợ tách hợp đồng chưa xác nhận khỏi hợp đồng đã xác nhận còn chờ mở sổ.
- [ ] Có danh sách việc của tôi, hàng đợi phê duyệt, đến hạn/quá hạn và bàn giao chờ nhận. Thông báo trong app lưu bền vững, mở đúng đối tượng và không lộ thông tin ngoài quyền.

**Nghiệm thu:** đội triển khai hoàn thành được việc bằng tài khoản riêng; số liệu hợp đồng/phiếu thu/công nợ và báo cáo đối chiếu đúng; nghiệm thu không tự xóa nợ. Kiểm tra hai người cùng ghi thu, hủy phiếu và điều chỉnh hợp đồng.

## Đợt 6 Chuẩn bị vận hành máy chủ

- [ ] Tách local, môi trường nghiệm thu và production: database, volume tệp, cookie/domain, owner và bí mật riêng. Không chạy bài thử có reset trên database vận hành; bảo vệ môi trường nghiệm thu nếu chứa bản sao dữ liệu thật.
- [x] Production tắt demo ở cấu hình mặc định. Giao diện ẩn nút chuyển và máy chủ từ chối truy cập demo, kể cả export, báo giá và ghi dữ liệu. Dữ liệu mẫu cũ vẫn nằm trong snapshot riêng.
- [ ] Giữ app sau Nginx và cổng 3180 trên loopback; PostgreSQL/ClamAV không mở ra Internet. Xác minh HTTPS đầu cuối, gia hạn chứng chỉ, IP người dùng thật khi qua Cloudflare, cùng giới hạn request và rate limit đúng cho nhiều người dùng.
- [ ] Có tên miền, tài khoản DNS, VPS và người chịu trách nhiệm gia hạn do công ty kiểm soát hoặc được bàn giao quyền rõ ràng. Bí mật, database và tệp thật không vào Git; không thay khóa/mật khẩu trên VPS mà bỏ sót cấu hình liên quan.
- [ ] Tách kiểm tra app/database và trạng thái quét tệp; ClamAV lỗi thì chặn upload và báo đúng nguyên nhân. Theo dõi dung lượng đĩa, RAM, restart, lỗi 5xx, lỗi migration, lần backup thành công và chứng chỉ sắp hết hạn.
- [ ] Bổ sung hạn mức tệp theo công ty, liên kết tệp với đối tượng được cấp quyền; thu gom tệp tải lên bỏ dở sau thời gian chờ, chỉ xóa khi chắc chắn không còn tham chiếu. Lịch sử cần giữ vẫn phải đọc được tệp liên quan.
- [ ] Lên lịch backup đầy đủ DB và tệp, mã hóa và đưa ra ngoài VPS, có thông báo khi thất bại và khi backup quá hạn. Quản lý quyền truy cập bản sao, khóa mã hóa và chính sách giữ bản.
- [ ] Mục tiêu phục hồi đề xuất ban đầu: mất tối đa 24 giờ dữ liệu và khôi phục dịch vụ trong 4 giờ. Đây là mục tiêu phải đo qua diễn tập; nếu không chấp nhận mất một ngày thì thiết kế backup thường xuyên hơn/PITR trước khi mở thật. Đề xuất giữ 7 bản ngày và 4 bản tuần, điều chỉnh theo dung lượng và yêu cầu lưu trữ.
- [ ] Chạy phục hồi sang môi trường riêng, kiểm tra đăng nhập, quyền, số liệu và tệp. Kiểm tra thu hồi session/link sau phục hồi. Với script backup hiện tại có dừng app, bố trí cửa sổ bảo trì; nếu thêm worker phải dừng/điều phối toàn bộ đường ghi.
- [x] Diễn tập `pg_dump` và `pg_restore` trên PostgreSQL 17 với dữ liệu giả, kiểm tra số dư, tệp, tài khoản và thu hồi phiên. Thử đầy đủ qua Compose vào lúc nghiệm thu VPS.
- [ ] Chuẩn hóa release bằng commit/tag và image xác định, CI chạy kiểm thử/build/migration; môi trường nghiệm thu dùng cùng image trước khi production. Ghi phiên bản đang chạy và hướng xử lý khi migration thất bại. Không tự động triển khai mọi lần push main.

**Nghiệm thu:** phục hồi thành công từ bản sao ngoài VPS; chạy được quy trình triển khai và xử lý lỗi trên môi trường riêng; có người nhận cảnh báo, sở hữu bí mật khôi phục và chịu trách nhiệm khi hệ thống dừng.

## Kiểm thử và điều kiện mở vận hành

Các bài kiểm thử hiện có là nền tảng, cần bổ sung theo nghiệp vụ thực tế. Không dùng số lượng test hoặc health OK làm điều kiện duy nhất.

- [ ] Kiểm thử âm cho mọi vai trò: sửa ID, gọi API trực tiếp, tải tệp/xuất dữ liệu của người khác, gửi trường ngoài quyền, phiên cũ sau khóa/đổi quyền.
- [ ] Kiểm thử trạng thái và đồng thời: khách đổi chủ khi đang sửa, quyền đổi khi đang giao việc, hai lần chốt cơ hội, gửi lặp phiếu thu, cập nhật biểu mẫu trong lúc tải nền.
- [x] Diễn tập migration từ snapshot giả trên PostgreSQL 17 thật. Chạy thử hoàn tác, áp dụng một lần, đối chiếu liên kết, tài khoản và số đầu kỳ. Khi chuyển VPS cần đối chiếu lại với bản sao dữ liệu công ty.
- [x] Kiểm thử xuyên suốt trên Edge với tài khoản thử của từng vai trò, từ Telesales tiếp nhận và bàn giao đến Sale lập báo giá, Quản lý duyệt/chốt, Triển khai làm việc và gửi nội dung, nghiệm thu rồi ghi thu. Tài khoản được cấp và kích hoạt qua API trước khi chạy trình duyệt.
- [ ] Dùng dữ liệu giả có quy mô đại diện; mốc thử ban đầu đề xuất 10.000 khách, 100.000 hoạt động và 20 phiên hoạt động đồng thời. Thử trên cấu hình tương đương VPS vì còn các ứng dụng khác đang dùng tài nguyên.
- [x] Đã đo lần đầu trên PostgreSQL 17.12 local với 10.000 khách, 100.000 hoạt động, 20 phiên đọc đồng thời và ghi tuần tự. p95 tìm khách 626 ms, p95 cập nhật 841 ms sau khi gộp truy vấn đếm và lấy trang. Cần đo lại trên VPS.
- [ ] Mục tiêu tải đề xuất: p95 dưới 1 giây cho tìm kiếm/danh sách và dưới 2 giây cho cập nhật thông thường, đo tại API sau khi nóng máy; upload, xuất lớn và thao tác nền đo riêng. Điều chỉnh mục tiêu bằng số đo và nhu cầu, không hứa theo cấu hình suy đoán.
- [ ] Không còn lỗi nghiêm trọng về mất dữ liệu, quyền truy cập, ghi tiền hoặc migration; các lỗi còn lại được ghi rõ ảnh hưởng và cách xử lý.
- [ ] Kiểm tra dependency tại thời điểm release, quét tệp bằng ClamAV thật, chứng chỉ HTTPS thật, backup/restore và cảnh báo trên hạ tầng thực tế.
- [ ] Nghiệm thu với đại diện người dùng từng vai trò, có hướng dẫn thao tác và người hỗ trợ. Đủ dữ liệu chuẩn về công ty, nhân sự, danh mục dịch vụ và số dư đã đối chiếu.

## Thứ tự bàn giao và theo dõi

Mỗi đợt là một hoặc nhiều thay đổi nhỏ có kiểm thử và mô tả dữ liệu bị ảnh hưởng. Đợt sau không được phá các kiểm chứng của đợt trước. Có thể chuẩn bị backup và môi trường nghiệm thu sớm; việc chuyển chính thức chỉ diễn ra sau khi các đợt nghiệp vụ và hạ tầng đạt điều kiện.

| Thứ tự | Bàn giao | Phụ thuộc | Bằng chứng hoàn thành |
|---|---|---|---|
| 1 | Sửa F01 đến F04 và kiểm thử hồi quy | Nền mã hiện tại | Ca lỗi cũ thất bại đúng cách trên API/trình duyệt; bản nháp được giữ |
| 2 | Schema, API theo bản ghi, công cụ chuyển đổi | Quy tắc bảo toàn dữ liệu | Báo cáo đối chiếu migration, bài thử đồng thời và phân trang |
| 3 | Admin, quyền và bàn giao | Bảng nhân sự/phân công | Đăng nhập thử từng vai trò; không còn việc không có người xử lý hợp lệ |
| 4 | Bán hàng và phê duyệt hợp đồng | Quyền, cơ hội/báo giá/hợp đồng | Luồng Telesales đến dự án qua đúng người phê duyệt |
| 5 | Triển khai, tài chính, báo cáo | Hợp đồng và quyền | Đối chiếu tiến độ, số tiền, phiếu và ngoại lệ nghiệm thu |
| 6 | Hạ tầng và phục hồi | Có thể chuẩn bị sớm; cần schema/image cuối để nghiệm thu | Backup ngoài VPS, phục hồi thử, cảnh báo và quy trình release |
| 7 | Nghiệm thu và chuyển chính thức | Tất cả các điều kiện trên | Biên bản kiểm tra, backup trước chuyển, đối chiếu sau chuyển |

Trước buổi chuyển chính thức, xác nhận số người dùng và lượng dữ liệu dự kiến, người phê duyệt từng nhóm, nhu cầu duyệt nội dung, thời gian có thể bảo trì, nơi lưu backup và mức mất dữ liệu chấp nhận được. Các điểm này dùng để hoàn thiện cấu hình và nghiệm thu; không cản việc bắt đầu sửa các lỗi đã xác nhận.

Sau khi mở vận hành, theo dõi sát ít nhất một chu kỳ làm việc hoàn chỉnh; diễn tập lại phục hồi định kỳ và rà soát quyền khi có người đổi vị trí/nghỉ việc. Lưu log không chứa mật khẩu, token hoặc nội dung khách hàng không cần thiết. Nhật ký nghiệp vụ có ID người thao tác, đối tượng, thời điểm, lý do và thay đổi cần truy nguyên; tài khoản app không được tùy ý sửa/xóa nhật ký.

## Tệp liên quan

- [Hướng dẫn sử dụng hiện tại](README-SMEE.md)
- [Triển khai và phục hồi VPS](README-VPS.md)
- [Báo cáo kiểm thử hiện tại](SECURITY-VALIDATION.md)
- [Quyền hiện tại](lib/crm-access.ts)
- [Nghiệp vụ hiện tại](lib/crm-engine.ts)
- [Lưu trữ hiện tại](lib/crm-store.ts)
- [Tài khoản và phân công nhân sự](lib/access-store.ts)
