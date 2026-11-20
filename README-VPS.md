# SMEE CRM — cài đặt độc lập trên VPS

Bản này chạy bằng **Next.js/Node.js + PostgreSQL**, lưu tệp riêng trên volume của VPS và có tài khoản/mật khẩu độc lập. Không cần tài khoản ChatGPT, Cloudflare D1, R2 hoặc Sites. Mã nguồn và bộ nhận diện đỏ/trắng, hồ sơ khách hàng, telesales, Excel, bán hàng và dự án nằm trong cùng gói.

Source không chứa dữ liệu khách hàng hay tài khoản production cũ. Website Sites cũ không bị thay đổi khi bạn cài bản này. Việc chuyển dữ liệu thật từ Sites là một công việc riêng; xem phần cuối trước khi nhập dữ liệu đang hoạt động.

VPS mặc định chạy **Dữ liệu công ty**. Chỉ đặt `SMEE_ENABLE_DEMO=true` trên bản cài thử có database và volume riêng. Tắt demo làm ẩn nút chuyển và chặn truy cập trong API. Snapshot mẫu có sẵn được giữ lại trong database.

## 1. Chuẩn bị

- VPS Linux 64-bit; các bước dưới đây dùng Ubuntu 24.04 LTS hoặc 26.04 LTS và quyền `sudo`.
- Docker Engine và Docker Compose plugin từ nhà cung cấp chính thức.
- Domain/subdomain do bạn quản lý, ví dụ `crm.congty.vn`, và địa chỉ IPv4 công khai của VPS.
- Dung lượng đĩa đủ cho database, tài liệu, image Docker và bản sao lưu. Giữ bản sao ở nơi khác VPS.
- ClamAV đi kèm để quét tệp trước khi lưu. Tài liệu chính thức nêu scanner cần tối thiểu 3 GiB RAM, ưu tiên 4 GiB; cho cả app + PostgreSQL + scanner nên dự trù ít nhất 6 GB, 8 GB dễ vận hành hơn. Đây là dự trù, chưa phải kết quả đo tải của SMEE. [Yêu cầu ClamAV](https://docs.clamav.net/manual/Installing/Docker.html)

Hướng dẫn dùng VPS mới hoặc môi trường đã được quản trị viên kiểm tra. Nếu VPS đang chạy website khác trên cổng 80/443, cần tích hợp với reverse proxy đang có, không khởi động thêm Caddy chiếm cùng cổng.

## 1a. VPS đã có Nginx và các website khác

Với trường hợp này, chọn `compose.nginx.yaml`. File dùng lại cấu hình app,
PostgreSQL và ClamAV từ `compose.yaml`, công bố app tại `127.0.0.1:3180`,
để Nginx trên máy chủ tiếp nhận domain và HTTPS. PostgreSQL/scanner vẫn ở
mạng Docker riêng; Caddy không được khởi động trong cấu hình này.

Trước khi build, kiểm tra RAM khả dụng, dung lượng đĩa và cổng dự định dùng:

```bash
free -h
df -h /
sudo ss -ltnp '( sport = :3180 )'
```

Cổng 3180 cần trống. Nếu chọn cổng khác, cập nhật cả `SMEE_HTTP_PORT` và
`proxy_pass` trong cấu hình Nginx. Build Next.js và ClamAV cần thêm RAM;
trên VPS chạy nhiều ứng dụng, chuẩn bị đủ tài nguyên hoặc build image ở máy
riêng trước khi triển khai. Swap có thể giảm rủi ro khi thiếu RAM tạm thời,
nhưng không thay thế RAM cần thiết cho scanner.

Tạo `.env` nếu chưa có (giữ file đã cấu hình ở các lần cập nhật), điền domain,
email owner và mật khẩu database như mục 3. Bỏ dấu `#` ở hai dòng cuối:

```dotenv
COMPOSE_FILE=compose.nginx.yaml
SMEE_HTTP_PORT=3180
```

Compose đọc `COMPOSE_FILE` từ `.env`, nên các lệnh `docker compose` và script
backup/restore trong repo cùng sử dụng cấu hình Nginx này. Chạy từ thư mục
repo và giữ lựa chọn đó trong `.env`; không ghép thêm file cấu hình Caddy.
Các lệnh dưới đây dùng `sudo` vì tài khoản SSH có thể chưa thuộc nhóm Docker.

Với tài khoản chưa có quyền Docker, chạy sao lưu bằng `sudo bash deploy/backup.sh`.
Khi phục hồi, dùng `sudo env SMEE_RESTORE_CONFIRM=ERASE_CURRENT_DATA bash deploy/restore.sh /duong/dan/backup`;
chỉ thực hiện sau khi đã đọc mục 8 và chuẩn bị bản sao dự phòng. Kiểm tra cấu hình:

```bash
sudo docker compose config --quiet
sudo docker compose config --services
```

Danh sách phải có đúng `postgres`, `clamav`, `app`. Build và khởi tạo theo
mục 5, thêm `sudo` trước các lệnh Docker nếu cần. Kiểm tra app bằng:

```bash
curl --fail --silent --show-error http://127.0.0.1:3180/api/health
```

Khi app đã chạy, kiểm tra Nginx có virtual host cho domain CRM chưa. Nếu đã
có, cập nhật đúng cấu hình của domain đó; tránh tạo hai `server_name` trùng
nhau. Nếu chưa có, sao chép `deploy/nginx.conf.example` vào một file mới
trong `/etc/nginx/sites-available/`, đổi `crm.example.com` thành domain CRM,
rồi tạo symlink tương ứng trong `/etc/nginx/sites-enabled/`.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Mẫu này là virtual host HTTP để khởi tạo. Dùng Certbot với Nginx để bổ sung
chứng chỉ cho đúng domain; cài Certbot/plugin Nginx theo môi trường nếu chưa
có. Ví dụ sau dùng domain minh họa, phải thay bằng domain của bạn:

```bash
sudo certbot --nginx -d crm.example.com --redirect
```

`APP_ORIGIN` vẫn phải là URL HTTPS chính xác. Nếu dùng Cloudflare, để riêng
record CRM ở DNS only trong lần thiết lập chứng chỉ đầu. Sau khi HTTPS tại
VPS hoạt động, có thể bật proxy với SSL/TLS Full (strict). Khi bật proxy,
Nginx cần cấu hình real IP từ đúng dải IP Cloudflare tin cậy để rate limit
phân biệt từng khách; không tin trực tiếp header IP do mọi người tự gửi.
Hướng dẫn này chỉ thêm/cập nhật virtual host CRM, giữ cấu hình các website
khác trên VPS. Xem [Compose extends](https://docs.docker.com/compose/how-tos/multiple-compose-files/extends/),
[COMPOSE_FILE](https://docs.docker.com/compose/how-tos/environment-variables/envvars/)
và [Nginx proxy headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header).

## 2. Cài Docker

Làm theo [hướng dẫn Docker cho Ubuntu](https://docs.docker.com/engine/install/ubuntu/) để cài Docker Engine và Compose plugin từ apt repository chính thức. Không cần cài Node.js trực tiếp trên VPS nếu dùng Docker.

Kiểm tra:

```bash
sudo docker version
sudo docker compose version
sudo apt-get update
sudo apt-get install -y unzip python3 openssl util-linux
```

Các lệnh `docker` bên dưới giả định tài khoản SSH đã được cấp quyền chạy Docker. Nếu chưa, thêm `sudo` trước lệnh. Quyền Docker tương đương quyền quản trị máy; chỉ cấp cho người vận hành tin cậy.

## 3. Đưa source lên VPS

Tải ZIP lên VPS bằng SFTP/SCP. Giải nén vào thư mục riêng, ví dụ `/opt/smee-crm`, rồi đứng trong thư mục chứa `compose.yaml`:

Gói ZIP bàn giao có thư mục gốc `smee-crm/`. Ví dụ bên dưới dùng tên `crm-source.zip`. Đổi tên gói vừa tải thành tên này, rồi thay tên tài khoản SSH và IP bằng thông tin của bạn.

```bash
scp crm-source.zip tai_khoan_ssh@IP_VPS:~/
ssh tai_khoan_ssh@IP_VPS
sudo unzip "$HOME/crm-source.zip" -d /opt
sudo chown -R "$(id -un):$(id -gn)" /opt/smee-crm
```

Các lệnh trên dành cho lần cài mới; không giải nén đè lên ứng dụng đang có dữ liệu trước khi sao lưu. Nếu đã dùng SFTP, chỉ cần thực hiện bước giải nén trong SSH.

```bash
cd /opt/smee-crm
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

Điền bốn thông tin:

```dotenv
APP_DOMAIN=crm.congty.vn
APP_ORIGIN=https://crm.congty.vn
SMEE_OWNER_EMAIL=ban@congty.vn
POSTGRES_PASSWORD=CHUOI_64_KY_TU_HEX_VUA_TAO
```

- `APP_DOMAIN`: chỉ tên miền, không có `https://`, đường dẫn hay dấu `/` cuối.
- `APP_ORIGIN` phải bằng `https://` ghép với `APP_DOMAIN`. App kiểm tra hai biến trước khi chạy migration để các liên kết đặt mật khẩu và yêu cầu lưu dữ liệu dùng đúng tên miền Caddy đang phục vụ.
- `SMEE_OWNER_EMAIL`: email đăng nhập của người quản lý toàn bộ công ty. Không phải tài khoản ChatGPT.
- `POSTGRES_PASSWORD`: dùng chuỗi hex ngẫu nhiên vừa tạo. Chuỗi hex tránh lỗi ký tự đặc biệt trong URL database/biến Docker. Không dùng giá trị minh họa.
- Mật khẩu đăng nhập chủ sở hữu được nhập riêng ở bước 5, không đặt trong `.env`.

Không gửi `.env`, mật khẩu hoặc backup vào cuộc trò chuyện, Git hoặc thư mục website công khai. Với database đã khởi tạo, chỉ đổi `POSTGRES_PASSWORD` trong `.env` không tự đổi mật khẩu bên trong PostgreSQL; quản trị viên phải đổi cả hai theo một đợt bảo trì. PostgreSQL chỉ nằm trong mạng Docker; không thêm `ports: 5432` vào Compose.

## 4. Trỏ domain và HTTPS

Trong DNS của domain, tạo:

| Loại | Tên | Giá trị |
|---|---|---|
| A | `crm` | IPv4 công khai của VPS |

Nếu dùng domain gốc, tên bản ghi thường là `@`. Chỉ tạo `AAAA` khi IPv6 của VPS và firewall IPv6 đã hoạt động đúng. Xóa/sửa bản ghi trỏ sai hoặc bản ghi trùng cho cùng hostname.

Cho phép inbound **TCP 80 và TCP 443** tới VPS. Giữ SSH theo chính sách của bạn, ưu tiên SSH key và giới hạn IP quản trị. Không mở 3000 (app), 5432 (database), 3310 (scanner). Compose chỉ công bố 80/443.

Nếu dùng DNS Cloudflare, nên để **DNS only** trong lần cài đầu để xác minh trực tiếp VPS và chứng chỉ. Khi bật CDN/proxy về sau, cần rà soát IP tin cậy và giới hạn truy cập để không gom tất cả khách dưới một IP proxy.

Caddy trong Compose dùng `APP_DOMAIN`, tự cấp/gia hạn HTTPS và chuyển HTTP sang HTTPS khi DNS đã đúng và 80/443 tới được máy chủ. [Điều kiện HTTPS của Caddy](https://caddyserver.com/docs/automatic-https)

Lưu ý Docker có thể bỏ qua một số quy tắc UFW khi công bố cổng; dùng thêm firewall của nhà cung cấp VPS và chỉ công bố các cổng đã định trong Compose. [Giới hạn firewall Docker](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)

## 5. Build và khởi tạo chủ sở hữu

```bash
docker compose config --quiet
docker compose build --pull
docker compose run --rm --no-deps --entrypoint node app scripts/check-config.mjs
docker compose up -d --wait postgres clamav
docker compose run --rm app npm run owner:create
```

Lệnh preflight ở trên kiểm tra cấu hình trước lần khởi tạo PostgreSQL đầu tiên. Docker entrypoint cũng kiểm tra lại trước migration: domain HTTPS thật, email chủ sở hữu, đường dẫn lưu riêng, mật khẩu PostgreSQL đủ mạnh và scanner bắt buộc. Giá trị mẫu `REPLACE_WITH_64_HEX_CHARACTERS`, `crm.example.com` hoặc `owner@example.com` sẽ bị từ chối với thông báo chỉ rõ biến cần sửa; thông báo không in mật khẩu. Cập nhật `.env` rồi chạy lại.

Lệnh cuối chạy migration và CLI tạo chủ sở hữu. Nhập thông tin theo nhắc trên terminal; mật khẩu được nhập ẩn, không truyền qua tham số lệnh. Dùng mật khẩu mạnh, tối thiểu 12 ký tự. Không có tài khoản/mật khẩu mặc định và không có đăng ký công khai.

CLI hỏi lần lượt email, tên hiển thị, mật khẩu và xác nhận mật khẩu. Ở dòng
email, nhấn Enter để dùng địa chỉ `SMEE_OWNER_EMAIL` hiển thị trong ngoặc
vuông. Hai trường đầu hiển thị khi nhập; hai trường mật khẩu không hiện ký
tự. Trong container, biến cấu hình đã được Compose truyền vào. Thông báo
`.env not found. Continuing without it.` từ Node không có nghĩa là thiếu cấu
hình; có thể chạy CLI trực tiếp để bỏ thông báo này:

```bash
docker compose run --rm app node --import tsx scripts/create-owner.ts
```

Scanner có thể cần vài phút để nạp/cập nhật mẫu nhận diện ở lần chạy đầu. Nếu `--wait` hết thời gian, kiểm tra `docker compose logs --tail=100 clamav` và tài nguyên máy rồi chạy lại; không tắt scanner để vượt qua lỗi.

Sau khi tạo owner:

```bash
docker compose up -d --wait
docker compose ps
curl --fail --silent --show-error https://crm.congty.vn/api/health
```

Mở `https://crm.congty.vn/admin` trên tên miền đã cấu hình, đăng nhập bằng tài khoản chủ sở hữu vừa tạo để quản lý nhân viên. Trang chính `/` mở không gian CRM. Chuyển sang **Dữ liệu công ty** để làm việc thật. **Dữ liệu mẫu** dành cho chủ sở hữu dùng thử.

`/api/health` chỉ phục vụ kiểm tra sức khỏe tối thiểu, không trả dữ liệu khách hàng hoặc bí mật. Nếu không lên HTTPS, xem log Caddy và kiểm tra DNS/cổng trước khi sửa ứng dụng:

```bash
docker compose logs --tail=100 caddy
docker compose logs --tail=100 app
docker compose logs --tail=100 postgres
```

Không dùng `npm run dev` hoặc `wrangler dev` để chạy production.

## 6. Quản trị tài khoản

1. Vào **Quản trị → Tài khoản → Thêm người dùng** (`/admin`). Chọn nhân sự có sẵn hoặc tạo ngay trong biểu mẫu.
2. Điền email đăng nhập và chọn vai trò theo công việc của nhân viên.
3. Bấm **Đặt mật khẩu** cho tài khoản đó để tạo link hiệu lực 1 giờ. Chủ sở hữu chuyển link qua kênh riêng đã xác minh với nhân viên. App chưa tự gửi email.
4. Nhân viên mở link, đặt mật khẩu và đăng nhập cùng domain. Link dùng một lần và có hạn; tạo link mới nếu hết hạn.
5. Chủ sở hữu giao khách trong CRM. Account và Telesales đều có thể bấm **Thêm khách tự khai thác** hoặc **Nhập Excel** từ trang của mình. Khách vừa tạo được giao cho chính nhân viên đang đăng nhập. Nhân viên theo dõi kết quả và lịch liên hệ trong phạm vi hồ sơ được phân công.

Khi khóa tài khoản hoặc chuyển khách sang người khác, quyền được kiểm tra lại ở máy chủ. Link đặt lại mật khẩu mới sẽ thay thế link cũ và hoàn tất đặt lại sẽ thu hồi các phiên đăng nhập cũ. Đăng xuất dùng thao tác POST có kiểm tra nguồn yêu cầu.

Nếu chủ sở hữu quên mật khẩu, người quản trị có quyền SSH chạy `docker compose run --rm app npm run owner:reset` và nhập mật khẩu ẩn. Lệnh thu hồi các phiên cũ. Phiên đăng nhập thông thường có thời hạn 8 giờ.

### Bật xác thực hai lớp trước khi vận hành

1. Sao lưu database và tệp rồi triển khai phiên bản có migration `010-account-mfa.sql`. Trên VPS, tạo khóa riêng bằng `openssl rand -hex 32` và điền kết quả vào `SMEE_MFA_KEY` trong `.env`. Lưu một bản khóa bảo mật cùng quy trình khôi phục. Khóa phải giữ nguyên qua các lần cập nhật vì dùng để giải mã thiết bị MFA đã đăng ký.
2. Đặt `SMEE_REQUIRE_MFA=true` trong `.env` và tạo lại container app. Với cấu hình Nginx hiện có, giữ hai tệp `-f` khi chạy `docker compose -f compose.yaml -f compose.nginx.yaml up -d --build --wait app`. Với cấu hình Compose mặc định dùng `docker compose up -d --build --wait app`.
3. Đăng nhập lại. Chủ sở hữu và Tài chính chưa có MFA sẽ được đưa đến trang thiết lập và chỉ vào được CRM sau khi xác nhận mã. Dùng ứng dụng xác thực có mã theo thời gian. Lưu 8 mã khôi phục ở nơi an toàn. Mỗi mã dùng một lần. Nhân viên các vai trò khác có thể tự bật trong **Đổi mật khẩu → Quản lý xác thực hai lớp**.
4. Khi mất thiết bị, dùng một mã khôi phục để vào rồi đăng ký thiết bị mới. Nếu mất cả mã, Chủ sở hữu có thể cấp lại thiết bị cho nhân viên tại **Quản trị → Tài khoản → Cấp lại MFA**. Nếu mất toàn bộ mã của Chủ sở hữu, người có quyền SSH chạy `docker compose run --rm app npm run owner:mfa-reset -- --confirm-reset-mfa`, sau đó Chủ sở hữu đăng nhập bằng mật khẩu hiện tại để đăng ký lại. Cả hai đường cấp lại đều thu hồi phiên và mã cũ.

Sau khi phục hồi backup, các mã khôi phục trong bản sao bị thu hồi. Chờ tối đa 60 giây sau khi app khởi động rồi xác thực bằng ứng dụng. Đăng ký lại thiết bị để nhận bộ mã khôi phục mới. Lưu giữ khóa `SMEE_MFA_KEY` tương ứng với bản sao được phục hồi.

### Khóa và bàn giao khi nhân viên nghỉ việc

1. Tại **Quản trị → Tài khoản**, bấm **Khóa** để xem khách, cơ hội, lịch chăm sóc, hàng chờ Telesales, dự án và đầu việc còn mở.
2. Chọn người nhận đủ quyền theo từng nhóm, nhập lý do và xác nhận bằng mật khẩu hiện tại. Đề nghị chuyển khách còn chờ có liên quan sẽ được hủy và giữ lý do để gửi lại khi cần. Hồ sơ hoàn tất giữ người phụ trách cũ.
3. Nếu cần cắt quyền ngay, chọn **Chỉ khóa ngay**. Hệ thống thu hồi phiên và liên kết đặt mật khẩu. Chủ sở hữu có thể quay lại **Bàn giao việc** sau khi đã có người nhận. Nhật ký quản trị lưu người thao tác, tài khoản liên quan và lý do.

## 7. Excel và tệp đính kèm

File mẫu kèm source nằm ở `examples/imports/SMEE-mau-nhap-khach-hang.xlsx`; xóa các dòng ví dụ trước khi điền dữ liệu thật.

**Khách hàng → Nhập Excel** hỗ trợ `.xlsx`, tối đa 5 MB và 500 dòng dữ liệu mỗi sheet. Chọn sheet, kiểm tra ghép cột, xem số trùng/dòng lỗi rồi xác nhận. Sau nhập có thể chia đều hoặc đặt số lượng khách cho từng nhân viên. Bản ghi trùng không ghi đè dữ liệu cũ.

Tệp đính kèm tối đa 10 MB. Máy chủ kiểm tra chữ ký định dạng, đối chiếu loại MIME và yêu cầu ClamAV xác nhận trước khi lưu. Nếu scanner lỗi hoặc chưa sẵn sàng, upload bị từ chối. Trong production, đặt `CLAMAV_REQUIRED=false` cũng không bỏ qua quét.

Tệp nằm trong `uploads_data`, không trong `public/`. Mọi download đi qua API có xác thực và phân quyền; tài liệu trả về dạng tải xuống, ảnh hồ sơ vẫn kiểm tra phạm vi khách hàng. Tệp có checksum SHA-256 để phát hiện hỏng/thay đổi khi đọc. Quét mã độc làm giảm rủi ro, không đảm bảo nhận diện mọi mối nguy mới.

## 8. Sao lưu đầy đủ và khôi phục

Nút xuất JSON trong app là bản sao dữ liệu nghiệp vụ của một không gian. Sao lưu vận hành đầy đủ cần PostgreSQL (gồm tài khoản/quyền/metadata tệp) **và** volume tệp.

Gói này có script sao lưu:

```bash
bash deploy/backup.sh
```

Script dừng app trong lúc chụp database và tệp. Nếu app đang chạy trước đó, script khởi động lại và đợi app báo khỏe. Sau đó script kiểm tra đủ ba checksum, đọc toàn bộ archive tệp và yêu cầu PostgreSQL giải mã toàn bộ dump trước khi chuyển bản sao từ thư mục tạm `.partial-*` sang `backups/smee-*`. Chỉ đưa thư mục đã hoàn thành sang kho dự phòng. Đặt `SMEE_BACKUP_DIR=/duong/dan/rieng` để chọn nơi lưu khác. Các lệnh sao lưu và khôi phục dùng cùng một khóa trong thư mục cài đặt, kể cả khi chạy từ cron. Luôn vận hành từ một bản cài cho mỗi bộ volume.

Kiểm tra bản sao sau khi tải về máy khác, bằng Python 3.9 trở lên. Lệnh này đọc các tệp tại chỗ và kiểm tra tính toàn vẹn của bản sao. Thử phục hồi trên một bộ volume riêng để kiểm chứng khả năng phục hồi nghiệp vụ.

```bash
python3 deploy/verify-backup.py /duong/dan/thu-muc-backup
```

Các backup chứa dữ liệu riêng tư và hash mật khẩu. Giới hạn quyền thư mục, mã hóa bản sao trước khi đưa tới kho ngoài VPS, đặt chính sách giữ nhiều phiên bản, và lưu `.env`/thông tin phục hồi ở kho bí mật riêng. Không chỉ giữ bản sao trên cùng VPS. Script chưa tự gửi backup ra ngoài hoặc đặt lịch; quản trị viên có thể cấu hình cron/systemd theo lịch phù hợp sau khi thử thành công.

**Khôi phục thay thế dữ liệu hiện tại.** Trước hết sao lưu trạng thái đang có và dùng đúng source tương thích với backup. Chạy thử trên máy phục hồi riêng trước khi thao tác production:

```bash
SMEE_RESTORE_CONFIRM=ERASE_CURRENT_DATA bash deploy/restore.sh /duong/dan/tuyet/doi/thu-muc-backup
```

Script kiểm tra checksum, archive tệp và khả năng đọc dump trước khi dừng app. Sau đó script phục hồi PostgreSQL bằng transaction, thay tệp và đối chiếu kích thước cùng SHA-256 của từng tài liệu với bản ghi PostgreSQL. Khi kiểm tra đạt, script thu hồi toàn bộ session/link đặt mật khẩu và chờ app báo khỏe. Nếu lỗi trong lúc thay dữ liệu, kiểm tra tài liệu hoặc thu hồi phiên, app giữ trạng thái dừng để người vận hành kiểm tra. Sau phục hồi, đăng nhập lại và kiểm tra khách hàng, phân quyền, tệp đính kèm.

Backup cũ thiếu các bảng đã triển khai, ví dụ bảng nghiệp vụ từ migration 006, nhóm dự án từ migration 008 hoặc MFA từ migration 010, phải phục hồi vào database trống dành cho khôi phục. Sau khi đã nhận dữ liệu trên phiên bản mới, đối chiếu cả các giao dịch phát sinh sau thời điểm backup trước khi chuyển dịch vụ sang bản phục hồi.

**Không chạy `docker compose down -v`** trên môi trường có dữ liệu cần giữ; `-v` xóa volume. Cập nhật image hoặc `docker compose up` thông thường không xóa volume.

## 9. Cập nhật phiên bản

1. Sao lưu bằng script ở trên và kiểm tra backup.
2. Đưa source mới vào thư mục triển khai, giữ `.env`, Compose project name `smee-crm` và các volume hiện hữu.
3. Chạy `docker compose build --pull` rồi `docker compose up -d --wait`.
4. App chạy migration có khóa/đánh dấu phiên bản trước khi khởi động. Không sửa nội dung migration đã áp dụng; thêm migration mới.
5. Kiểm tra health/login/quyền/upload sau cập nhật. Khôi phục cần cả source lẫn schema tương thích; không giả định chỉ đổi image là đảo ngược mọi migration.

### Nâng cấp từ snapshot sang các bảng nghiệp vụ

Migration 006 tách dữ liệu thành các bảng trong cùng database, giữ ID, phiên bản, tài khoản và tệp. Cột `crm_workspaces.data` giữ snapshot cũ để đối chiếu. Phiên bản mới ghi vào các bảng nghiệp vụ, trong khi PostgreSQL chặn cập nhật lên cột lưu trữ cũ.

1. Sao lưu PostgreSQL và tệp. Phục hồi sang môi trường thử riêng. Kiểm tra bản sao đang có schema trước 006 rồi chạy thử bằng image mới, bỏ qua entrypoint tự migrate. Ví dụ trên môi trường thử:

   ```bash
   docker compose run --rm --no-deps --entrypoint node app --import tsx scripts/check-workspace-tables.ts --dry-run
   ```

2. Chạy cửa sổ bảo trì. Dừng app/tiến trình ghi dùng database này. Giữ backup ngay trước lúc chuyển. Áp dụng migration bằng image mới rồi chạy công cụ đối chiếu trước khi mở ghi:

   ```bash
   docker compose run --rm --no-deps --entrypoint node app scripts/migrate.mjs
   docker compose run --rm --no-deps --entrypoint node app --import tsx scripts/check-workspace-tables.ts
   ```

3. Chỉ mở app khi lệnh đối chiếu thành công. Với không gian đã tồn tại trước migration, kiểm tra đầu ra `archiveCompared: true` trước lần ghi đầu tiên. Kiểm tra login, quyền đọc khách, dự án và phiếu thu sau khi app lên. Quy trình thực hiện trên bản sao giúp biết trước lỗi liên kết và thời gian bảo trì.

Quay lui trước khi có lần ghi mới bằng cách phục hồi backup trước chuyển vào database riêng và chạy image cũ tương thích. Sau khi đã ghi, giữ bản sao trạng thái mới để đối chiếu giao dịch trước khi thực hiện phục hồi. Việc chạy lại image cũ trên database đã chuyển sẽ đọc snapshot đã lưu trữ và không ghi được lên nó.

Image Node/PostgreSQL/Caddy/ClamAV trong Compose dùng nhánh phiên bản cập nhật. Với quy trình vận hành nghiêm ngặt, kiểm thử và khóa digest của từng image trong bản phát hành của công ty; xem lại cảnh báo bảo mật trước mỗi đợt nâng cấp.

## 10. Chạy phát triển ngoài Docker

Cần Node.js theo `package.json`, PostgreSQL có database riêng và file `.env`. CLI đọc `.env` nhờ `--env-file-if-exists`; Next.js cũng nạp cấu hình này. Thêm `DATABASE_URL=postgresql://user:password@127.0.0.1:5432/smee_dev` theo database phát triển của bạn. `UPLOAD_DIR` là đường dẫn tuyệt đối. Đặt `APP_ORIGIN=http://127.0.0.1:3000` và `TRUST_PROXY=false` khi không có proxy tin cậy. Không dùng database production cho kiểm thử.

```bash
npm ci
npm run db:migrate
npm run owner:create
npm run dev
```

CLI đọc biến từ `.env`; giữ file này ở quyền 600, không đưa mật khẩu vào dòng lệnh. Trong development/test có thể dùng `CLAMAV_REQUIRED=false` để thử tệp không qua scanner; production luôn yêu cầu scanner.

Kiểm thử và build:

```bash
npm test
npm run test:security
python3 tests/test_backup_verification.py
npm run typecheck
npm run build
```

`npm run build` tạo `.next/standalone/server.js` và tự sao chép `public/` cùng `.next/static/` vào thư mục standalone bằng `scripts/prepare-standalone.mjs`. Sau khi cấu hình `.env` và chạy migration, `npm start` chạy đúng bản production này. Nếu chạy ngoài Docker trên máy chủ, dùng process manager, đặt app ở loopback/mạng riêng và đưa Caddy phía trước; không công bố trực tiếp cổng app.

Các script `test:database`, `test:auth` và `test:api` dành cho integration trên database/ứng dụng thử riêng; đọc điều kiện trong script trước khi chạy và không trỏ vào production. Xem `package.json` và báo cáo bàn giao để biết kết quả cụ thể. `scripts/test-postgres.mjs` dùng database PGlite tạm trong bộ nhớ cho kiểm thử, không thay thế PostgreSQL production. Mã nguồn có kiểm thử; không xem số bài test là chứng nhận không còn lỗ hổng.

## 11. Chuyển dữ liệu từ bản Sites cũ

- Tệp ZIP source không có dữ liệu production cũ, tài khoản cũ hoặc byte tệp R2.
- JSON export cũ không gồm toàn bộ bảng quyền/tài khoản và không chứa byte tệp đính kèm.
- Bản VPS dùng định danh đăng nhập riêng. Cần đối chiếu owner/nhân viên, chuyển dữ liệu và tệp có kiểm tra, tạo lại tài khoản rồi kiểm tra phân quyền trước khi chuyển người dùng.
- Không nhập thẳng các header danh tính ChatGPT, session hoặc danh tính thử vào bản VPS.
- Trong lần bàn giao này chưa tự kết nối D1/R2 của Site để sao chép dữ liệu thật. Khởi tạo VPS sẽ tạo không gian mới.

Dữ liệu nghiệp vụ hiện lưu theo bản ghi riêng ở PostgreSQL. Giới hạn 1.800.000 byte chỉ còn trên cột snapshot lưu trữ. Màn hình quản lý **Khách hàng** dùng `/api/crm/customers` để đọc theo trang và mở riêng từng hồ sơ. Có thể mở trực tiếp bằng `/?section=customers`. Màn hình Triển khai và Tài chính dùng API đọc riêng. Các màn hình còn đọc workspace tổng hợp cần đo tải đại diện trước khi mở rộng. Migration 007 thêm chỉ mục lịch sử hồ sơ.

Migration 009 thêm quyền **Tài chính** vào danh mục vai trò và giữ các bản ghi tài khoản hiện có. Sau khi cập nhật trên môi trường nghiệm thu, thử đăng nhập Tài chính, xem hợp đồng đã xác nhận, ghi thử một phiếu và xử lý đề nghị từ tài khoản Chủ sở hữu. Dự án cũ có thể mở từ bộ lọc **Chưa xác nhận hợp đồng** để đối chiếu theo chứng từ.

## 12. Phạm vi xác minh

Mã nghiệp vụ, quyền truy cập, Excel, mật khẩu/session, giới hạn HTTP và lưu trữ đã được chạy kiểm thử tự động. Bản production đã build; trang đăng nhập, logo, font và giao diện đỏ/trắng đã được xem trong trình duyệt. Xem báo cáo bàn giao để biết kết quả và số bài kiểm thử cuối cùng.

Môi trường xây dựng hiện chưa có Docker daemon/VPS thật để xác minh Docker image/container, cấp chứng chỉ cho domain công khai, quét bằng engine ClamAV thật hoặc chu trình backup/restore production. Giao thức scanner có bài test với socket giả lập; không thay thế thử engine thật. Cần chạy quy trình ở mục 5 và một lần phục hồi thử trên VPS trước khi tiếp nhận dữ liệu thật.
