import type { Workspace, Customer, Service, Deal, Project, Task, Content } from './crm-types';

/** Fictional demo records only. Production and demo are stored separately. */
export function createWorkspace(mode: 'demo' | 'live'): Workspace {
  const localDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const base = new Date(`${localDay}T00:00:00+07:00`);
  const date = (offset = 0) => {
    const day = new Date(base.getTime() + offset * 86_400_000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(day);
  };
  const seedNow = Date.now();
  const time = (hoursAgo = 0) => new Date(seedNow - hoursAgo * 3_600_000).toISOString();
  const services: Service[] = [
    { id: 'service-social', name: 'Social Growth', category: 'Social media', price: 12_000_000, unit: 'tháng', duration: 30, deliverables: '12 bài viết và 12 thiết kế mỗi tháng; kế hoạch nội dung; báo cáo cuối kỳ.', exclusions: 'Ngân sách quảng cáo, quay chụp và trả lời inbox.', revisions: 2, active: true },
    { id: 'service-brand', name: 'Brand Identity', category: 'Thương hiệu', price: 18_000_000, unit: 'dự án', duration: 21, deliverables: 'Logo; bảng màu; hệ chữ; bộ nhận diện cơ bản; hướng dẫn sử dụng thương hiệu.', exclusions: 'In ấn, đăng ký nhãn hiệu và bao bì ngoài danh sách đã chốt.', revisions: 2, active: true },
    { id: 'service-web', name: 'Website Experience', category: 'Website', price: 45_000_000, unit: 'dự án', duration: 45, deliverables: 'Website giới thiệu tối đa 8 trang; thiết kế responsive; biểu mẫu liên hệ; bàn giao và hướng dẫn.', exclusions: 'Tên miền, hosting, nội dung ngoài phạm vi và tích hợp phần mềm bên thứ ba.', revisions: 2, active: true },
    { id: 'service-content', name: 'Content Studio', category: 'Sản xuất nội dung', price: 24_000_000, unit: 'đợt sản xuất', duration: 10, deliverables: '01 kế hoạch sản xuất; 24 nội dung; 06 kịch bản video ngắn; bàn giao theo đợt.', exclusions: 'Diễn viên, studio, thiết bị thuê ngoài và đăng bài tự động.', revisions: 2, active: true },
    { id: 'service-ads', name: 'Performance Care', category: 'Quảng cáo', price: 8_000_000, unit: 'tháng', duration: 30, deliverables: 'Thiết lập và tối ưu chiến dịch; theo dõi kết quả; báo cáo hằng tháng.', exclusions: 'Ngân sách quảng cáo trả cho nền tảng và sản xuất hình ảnh/video.', revisions: 1, active: true },
  ];
  const settings = { companyName: 'SMEE agency', slogan: 'Kết nối khách hàng. Vận hành tinh gọn.', escalationHours: 24, currency: 'VND' };
  if (mode === 'live') return {
    customers: [], services: services.slice(0, 4), deals: [], projects: [], tasks: [], contents: [], changes: [], issues: [], assets: [], activities: [],
    team: [{ id: 'member-admin', name: 'Quản trị SMEE', role: 'Quản trị', email: '', color: '#f0642b' }], settings,
  };
  const team = [
    { id: 'member-linh', name: 'Linh Nguyễn', role: 'Account Lead', email: 'linh@example.com', color: '#f0642b' },
    { id: 'member-minh', name: 'Minh Trần', role: 'Creative Lead', email: 'minh@example.com', color: '#6577b6' },
    { id: 'member-an', name: 'An Lê', role: 'Content', email: 'an@example.com', color: '#568a78' },
    { id: 'member-vy', name: 'Vy Phạm', role: 'Designer', email: 'vy@example.com', color: '#b67c9e' },
    { id: 'member-tele', name: 'Hà Đỗ', role: 'Telesales', email: 'ha-tele@example.com', color: '#c88238' },
  ];
  const customers: Customer[] = [
    { id: 'customer-lua', name: 'Lụa Home', industry: 'Nội thất', contact: 'Thuỳ Dương', email: 'lua-home@example.com', phone: '', telegram: '', owner: 'member-linh', status: 'Đang hợp tác', source: 'Giới thiệu', priority: 'Cao', nextFollowUp: date(), nextAction: 'Trao đổi kế hoạch tháng tới và nhu cầu gia hạn gói Social Growth.', createdAt: time(24 * 32), updatedAt: time(2), lastContactAt: time(2), color: '#ab8067', notes: 'Khách hàng giả lập. Ưu tiên hình ảnh tối giản, chất liệu tự nhiên và nội dung hướng dẫn.', interactions: [
      { id: 'interaction-lua-3', at: time(2), channel: 'Điện thoại', outcome: 'Hẹn trao đổi kế hoạch tiếp theo', note: 'Mẫu: đầu mối muốn trao đổi lịch nội dung và gói duy trì; cần gửi khung kế hoạch trước buổi gặp.', actor: 'Linh Nguyễn', nextFollowUp: date(), nextAction: 'Gửi khung kế hoạch tháng tới và xác nhận giờ trao đổi.' },
      { id: 'interaction-lua-2', at: time(28), channel: 'Email', outcome: 'Đã gửi thông tin', note: 'Mẫu: gửi tổng hợp các đầu việc đang thực hiện và danh sách nội dung sắp đăng.', actor: 'An Lê' },
      { id: 'interaction-lua-1', at: time(24 * 12), channel: 'Gặp mặt', outcome: 'Đã thống nhất phạm vi dịch vụ', note: 'Mẫu: trao đổi mục tiêu ba tháng và chọn ba nhóm chủ đề nội dung chính.', actor: 'Linh Nguyễn' },
    ] },
    { id: 'customer-hat', name: 'Hạt Nắng Coffee', industry: 'F&B', contact: 'Hoàng Nam', email: 'hat-nang@example.com', phone: '', telegram: '', owner: 'member-linh', status: 'Đang hợp tác', source: 'Website', priority: 'Trung bình', nextFollowUp: date(1), nextAction: 'Gửi danh sách tệp nhận diện và hẹn buổi bàn giao.', createdAt: time(24 * 24), updatedAt: time(18), lastContactAt: time(18), color: '#c89b55', notes: 'Khách hàng giả lập. Kế hoạch mở điểm bán mới; bộ nhận diện cần dùng nhất quán trên bao bì.', interactions: [
      { id: 'interaction-hat-2', at: time(18), channel: 'Email', outcome: 'Đã gửi bản tổng hợp', note: 'Mẫu: gửi hình tổng hợp bộ ứng dụng nhận diện; khách sẽ phản hồi trước buổi bàn giao.', actor: 'Linh Nguyễn', nextFollowUp: date(1), nextAction: 'Nhắc phản hồi và chuẩn bị danh sách tệp bàn giao.' },
      { id: 'interaction-hat-1', at: time(24 * 8), channel: 'Điện thoại', outcome: 'Đã trao đổi', note: 'Mẫu: khách xác nhận cửa hàng mới sẽ sử dụng bộ nhận diện đồng nhất trên các kênh.', actor: 'Minh Trần' },
    ] },
    { id: 'customer-may', name: 'Mây Wellness', industry: 'Sức khoẻ & làm đẹp', contact: 'Ngọc Mai', email: 'may-wellness@example.com', phone: '', telegram: '', owner: 'member-minh', status: 'Đang hợp tác', source: 'Facebook', priority: 'Trung bình', nextFollowUp: date(3), nextAction: 'Xác nhận nội dung trang dịch vụ và ảnh đội ngũ.', createdAt: time(24 * 28), updatedAt: time(26), lastContactAt: time(26), color: '#829e8f', notes: 'Khách hàng giả lập. Một đầu mối tổng hợp nội dung và hình ảnh cho website.', interactions: [
      { id: 'interaction-may-2', at: time(26), channel: 'Email', outcome: 'Đang chờ thông tin', note: 'Mẫu: đã gửi danh sách nội dung cần cung cấp cho trang dịch vụ và trang giới thiệu đội ngũ.', actor: 'Minh Trần', nextFollowUp: date(3), nextAction: 'Kiểm tra bộ ảnh và nội dung mô tả dịch vụ khách gửi.' },
      { id: 'interaction-may-1', at: time(24 * 4), channel: 'Gặp mặt', outcome: 'Đã chốt đầu mối trao đổi', note: 'Mẫu: khách chỉ định một người tổng hợp phản hồi website để tránh trùng lặp.', actor: 'Linh Nguyễn' },
    ] },
    { id: 'customer-nep', name: 'Nếp Atelier', industry: 'Thời trang', contact: 'Hà Anh', email: 'nep-atelier@example.com', phone: '', telegram: '', owner: 'member-linh', status: 'Đang hợp tác', source: 'Giới thiệu', priority: 'Cao', nextFollowUp: date(-1), nextAction: 'Liên hệ đầu mối để nhận ảnh chính thức; báo quản lý nếu tiếp tục thiếu ảnh.', createdAt: time(24 * 35), updatedAt: time(30), lastContactAt: time(30), color: '#a8a0bb', notes: 'Khách hàng giả lập. Đang chờ hình ảnh bộ sưu tập và phản hồi kế hoạch nội dung.', interactions: [
      { id: 'interaction-nep-3', at: time(30), channel: 'Điện thoại', outcome: 'Không nghe máy', note: 'Mẫu: gọi nhắc lịch cung cấp hình ảnh; chưa kết nối được với đầu mối.', actor: 'Linh Nguyễn', nextFollowUp: date(-1), nextAction: 'Liên hệ lại và xác nhận mốc nhận ảnh.' },
      { id: 'interaction-nep-2', at: time(55), channel: 'Email', outcome: 'Đã nhắc việc', note: 'Mẫu: gửi lại danh sách ảnh còn thiếu và chỉ rõ các hạng mục nội dung bị ảnh hưởng.', actor: 'Linh Nguyễn' },
      { id: 'interaction-nep-1', at: time(24 * 5), channel: 'Điện thoại', outcome: 'Hẹn liên hệ lại', note: 'Mẫu: khách hẹn cung cấp ảnh sau khi kết thúc buổi chụp bộ sưu tập.', actor: 'An Lê' },
    ] },
    { id: 'customer-nova', name: 'Nova Learning', industry: 'Giáo dục', contact: 'Đức Huy', email: 'nova-learning@example.com', phone: '', telegram: '', owner: 'member-minh', status: 'Đang tư vấn', source: 'Sự kiện', priority: 'Cao', nextFollowUp: date(), nextAction: 'Gọi trao đổi phạm vi website tuyển sinh và thời điểm ra mắt.', createdAt: time(24 * 14), updatedAt: time(5), lastContactAt: time(5), color: '#738eaf', notes: 'Khách hàng giả lập. Đang tư vấn thêm gói website và theo dõi chiến dịch tuyển sinh.', interactions: [
      { id: 'interaction-nova-2', at: time(5), channel: 'Email', outcome: 'Đã gửi báo giá', note: 'Mẫu: gửi giá trị đề xuất cho website và danh sách các trang cần thống nhất.', actor: 'Minh Trần', nextFollowUp: date(), nextAction: 'Gọi giải đáp báo giá và xác nhận các trang ưu tiên.' },
      { id: 'interaction-nova-1', at: time(24 * 6), channel: 'Gặp mặt', outcome: 'Có nhu cầu', note: 'Mẫu: khách muốn website có biểu mẫu đăng ký tư vấn theo từng chương trình học.', actor: 'Linh Nguyễn' },
    ] },
    { id: 'customer-bep', name: 'Bếp Tháng Tư', industry: 'F&B', contact: 'Minh Thư', email: 'bep-thang-tu@example.com', phone: '', telegram: '', owner: 'member-linh', status: 'Tạm ngừng', source: 'Khách hàng cũ', priority: 'Thấp', nextFollowUp: date(14), nextAction: 'Hỏi thăm kế hoạch mùa lễ hội và nhu cầu nội dung mới.', createdAt: time(24 * 40), updatedAt: time(48), lastContactAt: time(48), color: '#b77f6c', notes: 'Khách hàng giả lập. Đã hoàn tất đợt nội dung khai trương; hẹn trao đổi gói duy trì vào kỳ sau.', interactions: [
      { id: 'interaction-bep-1', at: time(48), channel: 'Email', outcome: 'Đã bàn giao', note: 'Mẫu: gửi đầy đủ nội dung và tệp nguồn; khách hẹn trao đổi kế hoạch mùa lễ hội sau hai tuần.', actor: 'An Lê', nextFollowUp: date(14), nextAction: 'Hỏi thăm kế hoạch mùa lễ hội.' },
    ] },
  ];
  // Reserved fictional NANP numbers illustrate the call queue; never real customer contacts.
  customers.forEach((customer, index) => {
    customer.phone = `+1202555010${index + 1}`;
    customer.notes += ' Số +1 202-555-010x là số điện thoại ví dụ, không dùng liên hệ thực tế.';
    customer.telesalesStatus = 'Chưa chuyển';
    customer.telesalesAttempts = 0;
  });
  const hat = customers.find(customer => customer.id === 'customer-hat')!;
  Object.assign(hat, {
    telesalesOwner: 'member-tele', telesalesStatus: 'Chờ gọi', telesalesAttempts: 0,
    telesalesQueuedAt: time(1), telesalesHandoffNote: 'Mẫu: liên hệ hỏi thăm tiến độ cửa hàng mới và giới thiệu gói chăm sóc kênh social. Linh vẫn là account phụ trách.',
    nextFollowUp: date(), nextAction: 'TELE gọi giới thiệu gói Social Growth và ghi nhận nhu cầu.', updatedAt: time(1),
  });
  const nep = customers.find(customer => customer.id === 'customer-nep')!;
  for (const interaction of nep.interactions || []) {
    if (interaction.channel === 'Điện thoại') interaction.actor = 'Hà Đỗ';
    if (interaction.id === 'interaction-nep-1') interaction.outcome = 'Hẹn gọi lại';
    if (interaction.id === 'interaction-nep-3') {
      interaction.outcome = 'Hẹn gọi lại';
      interaction.note = 'Mẫu: khách đang bận, hẹn gọi lại để xác nhận mốc cung cấp ảnh bộ sưu tập.';
    }
  }
  Object.assign(nep, {
    telesalesOwner: 'member-tele', telesalesStatus: 'Hẹn gọi lại', telesalesAttempts: 2,
    telesalesQueuedAt: time(24 * 6), telesalesHandoffNote: 'Mẫu: cần gọi xác nhận ngày khách cung cấp ảnh và hỏi kế hoạch quảng cáo cho bộ sưu tập.',
    telesalesLastCallAt: time(30), telesalesLastOutcome: 'Hẹn gọi lại',
    nextFollowUp: date(-1), nextAction: 'TELE gọi lại đầu mối; ghi kết quả và lịch tiếp theo.',
  });
  const nova = customers.find(customer => customer.id === 'customer-nova')!;
  nova.interactions!.unshift({
    id: 'interaction-nova-tele', at: time(2), channel: 'Điện thoại', outcome: 'Quan tâm',
    note: 'Mẫu: đã kết nối; khách có nhu cầu website tuyển sinh, có đầu mối trao đổi và muốn nhận đề xuất. Đã chuyển thông tin cho account để tiếp tục tư vấn.',
    actor: 'Hà Đỗ', nextFollowUp: date(), nextAction: 'Account tiếp tục trao đổi báo giá website với khách.',
  });
  Object.assign(nova, {
    telesalesOwner: 'member-tele', telesalesStatus: 'Đủ điều kiện', telesalesAttempts: 1,
    telesalesQueuedAt: time(72), telesalesHandoffNote: 'Mẫu: xác định nhu cầu website, thời điểm ra mắt và đầu mối quyết định trước khi chuyển account.',
    telesalesLastCallAt: time(2), telesalesLastOutcome: 'Quan tâm', lastContactAt: time(2), updatedAt: time(2),
  });
  const bep = customers.find(customer => customer.id === 'customer-bep')!;
  bep.interactions!.unshift({
    id: 'interaction-bep-tele', at: time(24), channel: 'Điện thoại', outcome: 'Máy bận',
    note: 'Mẫu: gọi hỏi thăm kế hoạch mùa lễ hội nhưng máy bận; ghi lịch gọi lại sau hai ngày.',
    actor: 'Hà Đỗ', nextFollowUp: date(2), nextAction: 'TELE gọi lại hỏi thăm kế hoạch mùa lễ hội.',
  });
  Object.assign(bep, {
    telesalesOwner: 'member-tele', telesalesStatus: 'Đang chăm sóc', telesalesAttempts: 1,
    telesalesQueuedAt: time(72), telesalesHandoffNote: 'Mẫu: khách cũ đã hoàn tất dự án; hỏi thăm khả năng sử dụng gói nội dung mới.',
    telesalesLastCallAt: time(24), telesalesLastOutcome: 'Máy bận', lastContactAt: time(24), updatedAt: time(24),
    nextFollowUp: date(2), nextAction: 'TELE gọi lại hỏi thăm kế hoạch mùa lễ hội.',
  });
  const profiles: Record<string, Partial<Customer>> = {
    'customer-lua': { jobTitle: 'Quản lý thương hiệu', address: 'Văn phòng mẫu · TP. Hồ Chí Minh', website: 'https://example.com/?company=lua-home', background: 'Mẫu: thương hiệu nội thất tập trung vào chất liệu tự nhiên và không gian sống tối giản. Nhu cầu hiện tại là duy trì hình ảnh nhất quán và xây dựng nội dung hướng dẫn trong ba tháng.', favorite: true, tags: ['Khách hàng thân thiết', 'Nội thất', 'Social Q4'], additionalPhones: [{ label: 'Văn phòng mẫu', value: '+12025550111' }], additionalEmails: [{ label: 'Marketing mẫu', value: 'marketing.lua@example.com' }], socialLinks: [], relationships: [{ customerId: 'customer-hat', label: 'Đối tác giới thiệu' }] },
    'customer-hat': { jobTitle: 'Đồng sáng lập', address: 'Cửa hàng mẫu · TP. Hồ Chí Minh', website: 'https://example.com/?company=hat-nang', background: 'Mẫu: chuỗi cà phê nhỏ chuẩn bị mở thêm điểm bán. Khách ưu tiên bộ nhận diện rõ ràng, dễ áp dụng trên bao bì và nội dung giới thiệu cửa hàng.', favorite: false, tags: ['F&B', 'Nhận diện', 'Có thể bán thêm'], additionalPhones: [{ label: 'Cửa hàng mẫu', value: '+12025550112' }], additionalEmails: [{ label: 'Vận hành mẫu', value: 'operations.hat@example.com' }], socialLinks: [], relationships: [{ customerId: 'customer-lua', label: 'Được giới thiệu bởi' }] },
    'customer-may': { jobTitle: 'Quản lý vận hành', address: 'Không gian dịch vụ mẫu · TP. Hồ Chí Minh', website: 'https://example.com/?company=may-wellness', background: 'Mẫu: đơn vị dịch vụ chăm sóc cần website giới thiệu đội ngũ, dịch vụ và biểu mẫu đặt lịch. Một đầu mối tổng hợp phản hồi giúp rút ngắn thời gian triển khai.', favorite: false, tags: ['Website', 'Dịch vụ', 'Đầu mối rõ ràng'], additionalPhones: [{ label: 'Lễ tân mẫu', value: '+12025550113' }], additionalEmails: [{ label: 'Nội dung mẫu', value: 'content.may@example.com' }], socialLinks: [], relationships: [] },
    'customer-nep': { jobTitle: 'Quản lý thương hiệu', address: 'Studio mẫu · Hà Nội', website: 'https://example.com/?company=nep-atelier', background: 'Mẫu: thương hiệu thời trang chuẩn bị truyền thông bộ sưu tập mới. Tiến độ nội dung đang phụ thuộc vào lịch cung cấp ảnh chính thức từ khách.', favorite: false, tags: ['Thời trang', 'Cần theo sát', 'Chờ thông tin'], additionalPhones: [{ label: 'Studio mẫu', value: '+12025550114' }], additionalEmails: [{ label: 'Sản xuất mẫu', value: 'production.nep@example.com' }], socialLinks: [], relationships: [] },
    'customer-nova': { jobTitle: 'Trưởng phòng tuyển sinh', address: 'Trung tâm đào tạo mẫu · Đà Nẵng', website: 'https://example.com/?company=nova-learning', background: 'Mẫu: đơn vị giáo dục đang lên kế hoạch website tuyển sinh và luồng đăng ký tư vấn. Khách muốn làm rõ trang ưu tiên, lịch ra mắt và thông tin cần bàn giao.', favorite: true, tags: ['Giáo dục', 'Ưu tiên cao', 'Có nhu cầu'], additionalPhones: [{ label: 'Tuyển sinh mẫu', value: '+12025550115' }], additionalEmails: [{ label: 'Tuyển sinh mẫu', value: 'admissions.nova@example.com' }], socialLinks: [], relationships: [] },
    'customer-bep': { jobTitle: 'Chủ doanh nghiệp', address: 'Nhà hàng mẫu · TP. Hồ Chí Minh', website: 'https://example.com/?company=bep-thang-tu', background: 'Mẫu: khách cũ đã hoàn tất bộ nội dung khai trương. Có thể tiếp tục chăm sóc khi khách xác định được chương trình và thực đơn mùa lễ hội.', favorite: false, tags: ['Khách hàng cũ', 'F&B', 'Gia hạn'], additionalPhones: [{ label: 'Nhà hàng mẫu', value: '+12025550116' }], additionalEmails: [{ label: 'Quản lý mẫu', value: 'manager.bep@example.com' }], socialLinks: [], relationships: [] },
  };
  type CustomerActionItem = NonNullable<Customer['actions']>[number];
  const customerAction = (values: Partial<CustomerActionItem> & Pick<CustomerActionItem, 'id' | 'title' | 'type' | 'dueDate' | 'owner'>): CustomerActionItem => ({
    status: 'Cần làm', notes: '', createdAt: time(24), updatedAt: time(24), ...values,
  });
  const profileActions: Record<string, CustomerActionItem[]> = {
    'customer-lua': [
      customerAction({ id: 'action-lua-proposal', title: 'Gửi đề xuất gia hạn Social Growth', type: 'Công việc', dueDate: date(), time: '15:00', owner: 'member-linh', notes: 'Mẫu: chuẩn bị phạm vi ba tháng tiếp theo và hai phương án nội dung.' }),
      customerAction({ id: 'action-lua-meeting', title: 'Trao đổi kế hoạch nội dung tháng tới', type: 'Cuộc hẹn', dueDate: date(2), time: '10:00', owner: 'member-linh', notes: 'Mẫu: lịch hẹn nội bộ trong CRM, chưa gửi lời mời qua email hoặc lịch ngoài.' }),
      customerAction({ id: 'action-lua-done', title: 'Tổng hợp mục tiêu truyền thông quý tới', type: 'Cuộc gọi', dueDate: date(-2), time: '09:30', owner: 'member-linh', status: 'Hoàn tất', notes: 'Mẫu: xác định mục tiêu trước khi soạn đề xuất.', createdAt: time(72), updatedAt: time(48), completedAt: time(48), result: 'Mẫu: khách muốn giữ hình ảnh tối giản và thêm nội dung hướng dẫn sử dụng sản phẩm.' }),
    ],
    'customer-hat': [
      customerAction({ id: 'action-hat-call', title: 'TELE hỏi nhu cầu kênh social cửa hàng mới', type: 'Cuộc gọi', dueDate: date(), time: '14:00', owner: 'member-tele', notes: 'Mẫu: đọc ghi chú bàn giao của Linh trước khi liên hệ.' }),
      customerAction({ id: 'action-hat-task', title: 'Chuẩn bị danh sách tệp nhận diện bàn giao', type: 'Công việc', dueDate: date(1), owner: 'member-minh', notes: 'Mẫu: liệt kê logo, bảng màu, hệ chữ và bộ ứng dụng.' }),
    ],
    'customer-may': [
      customerAction({ id: 'action-may-meeting', title: 'Trao đổi nội dung trang dịch vụ', type: 'Cuộc hẹn', dueDate: date(3), time: '09:00', owner: 'member-minh', notes: 'Mẫu: lịch trong CRM; kiểm tra ảnh và phần giới thiệu đội ngũ trước buổi trao đổi.' }),
      customerAction({ id: 'action-may-done', title: 'Gửi danh sách nội dung còn thiếu', type: 'Công việc', dueDate: date(-1), owner: 'member-minh', status: 'Hoàn tất', notes: 'Mẫu: tổng hợp các nội dung cần khách cung cấp.', createdAt: time(48), updatedAt: time(26), completedAt: time(26), result: 'Mẫu: danh sách đã được cập nhật vào ghi chú khách hàng.' }),
    ],
    'customer-nep': [
      customerAction({ id: 'action-nep-overdue', title: 'TELE gọi lại xác nhận mốc nhận ảnh', type: 'Cuộc gọi', dueDate: date(-1), time: '16:00', owner: 'member-tele', notes: 'Mẫu: việc đã quá hạn; ghi lại kết quả mới và lịch tiếp theo.', createdAt: time(72), updatedAt: time(48) }),
      customerAction({ id: 'action-nep-task', title: 'Cập nhật tiến độ cho account', type: 'Công việc', dueDate: date(), owner: 'member-linh', notes: 'Mẫu: nêu rõ nội dung đang chờ ảnh và ảnh hưởng đến lịch đăng.' }),
    ],
    'customer-nova': [
      customerAction({ id: 'action-nova-call', title: 'Tư vấn phạm vi website tuyển sinh', type: 'Cuộc gọi', dueDate: date(), time: '11:00', owner: 'member-minh', notes: 'Mẫu: giải đáp báo giá và xác định trang cần ưu tiên.' }),
      customerAction({ id: 'action-nova-meeting', title: 'Giới thiệu phương án website', type: 'Cuộc hẹn', dueDate: date(4), time: '14:30', owner: 'member-linh', notes: 'Mẫu: trình bày sơ đồ trang, biểu mẫu đăng ký và tiến độ dự kiến.' }),
    ],
    'customer-bep': [
      customerAction({ id: 'action-bep-call', title: 'TELE hỏi thăm kế hoạch mùa lễ hội', type: 'Cuộc gọi', dueDate: date(2), time: '10:30', owner: 'member-tele', notes: 'Mẫu: chưa gọi được trong lần trước; kiểm tra lại lịch trước khi liên hệ.' }),
    ],
  };
  customers.forEach(customer => {
    Object.assign(customer, profiles[customer.id]);
    customer.notesLog = [{ id: `note-${customer.id}-context`, body: `Mẫu: ${customer.nextAction || 'Tiếp tục cập nhật nhu cầu và kế hoạch chăm sóc.'}`, createdAt: time(20), updatedAt: time(18), actor: 'Linh Nguyễn' }];
    customer.actions = profileActions[customer.id] || [];
  });
  const project = (values: Partial<Project> & Pick<Project, 'id' | 'name' | 'customerId' | 'serviceId'>): Project => ({
    owner: 'member-linh', status: 'Đang triển khai', startDate: date(-14), dueDate: date(7), originalDueDate: date(7),
    budget: 24_000_000, cost: 2_500_000, scope: '', exclusions: 'Các đầu việc ngoài danh mục đã xác nhận.', revisions: 2,
    acceptance: 'Bàn giao đủ đầu ra trong phạm vi và có xác nhận của đầu mối khách hàng.', ...values,
  });
  const projects: Project[] = [
    project({ id: 'project-lua', name: 'Lụa Home · Social Q4', customerId: 'customer-lua', serviceId: 'service-social', budget: 36_000_000, cost: 4_200_000, dueDate: date(8), originalDueDate: date(8), scope: 'Kế hoạch nội dung 3 tháng; 36 bài viết; 36 thiết kế; báo cáo theo tháng.', handoffNote: 'Mẫu: Linh phụ trách trao đổi; An phụ trách nội dung; Vy phụ trách thiết kế.' }),
    project({ id: 'project-hat', name: 'Hạt Nắng · Nhận diện mới', customerId: 'customer-hat', serviceId: 'service-brand', owner: 'member-minh', budget: 18_000_000, cost: 2_100_000, dueDate: date(3), originalDueDate: date(3), scope: 'Logo, bảng màu, hệ chữ và bộ ứng dụng nhận diện gồm túi giấy.', handoffNote: 'Mẫu: Minh phụ trách hướng thiết kế; Vy thực hiện bộ ứng dụng nhận diện.' }),
    project({ id: 'project-may', name: 'Mây Wellness · Website', customerId: 'customer-may', serviceId: 'service-web', owner: 'member-minh', budget: 45_000_000, cost: 5_600_000, startDate: date(-20), dueDate: date(20), originalDueDate: date(20), scope: 'Website giới thiệu 8 trang, biểu mẫu đặt lịch và hướng dẫn quản trị.' }),
    project({ id: 'project-nep', name: 'Nếp Atelier · Bộ sưu tập mới', customerId: 'customer-nep', serviceId: 'service-content', status: 'Chờ khách hàng', budget: 24_000_000, cost: 4_800_000, startDate: date(-25), dueDate: date(-4), originalDueDate: date(-4), scope: '24 bài viết và 6 kịch bản video ngắn; sản xuất tập trung trong một đợt.' }),
    project({ id: 'project-nova', name: 'Nova Learning · Tuyển sinh', customerId: 'customer-nova', serviceId: 'service-ads', status: 'Tạm dừng', owner: 'member-minh', budget: 16_000_000, cost: 1_200_000, dueDate: date(10), originalDueDate: date(10), scope: 'Thiết lập, tối ưu và báo cáo chiến dịch tuyển sinh trong 2 tháng; ngân sách quảng cáo riêng.' }),
    project({ id: 'project-bep', name: 'Bếp Tháng Tư · Khai trương', customerId: 'customer-bep', serviceId: 'service-content', status: 'Hoàn tất', budget: 24_000_000, cost: 3_700_000, startDate: date(-30), dueDate: date(-2), originalDueDate: date(-2), scope: '24 nội dung truyền thông khai trương; hoàn tất bàn giao theo danh sách đầu ra.', acceptance: 'Mẫu: khách hàng xác nhận đã nhận đủ bộ nội dung và tệp nguồn qua biên bản bàn giao.' }),
  ];
  const deals: Deal[] = [
    { id: 'deal-lua', name: 'Gói Social Q4', customerId: 'customer-lua', serviceId: 'service-social', value: 36_000_000, stage: 'Đã chốt', owner: 'member-linh', closeDate: date(-15), nextAction: 'Theo dõi kế hoạch sản xuất và đề xuất gia hạn.', scope: '3 tháng, 12 bài viết và thiết kế mỗi tháng.', projectId: 'project-lua' },
    { id: 'deal-hat', name: 'Làm mới nhận diện Hạt Nắng', customerId: 'customer-hat', serviceId: 'service-brand', value: 18_000_000, stage: 'Đã chốt', owner: 'member-minh', closeDate: date(-14), nextAction: 'Hoàn tất bàn giao bộ nhận diện.', scope: 'Logo và bộ nhận diện cơ bản.', projectId: 'project-hat' },
    { id: 'deal-nova-web', name: 'Website tuyển sinh', customerId: 'customer-nova', serviceId: 'service-web', value: 45_000_000, stage: 'Đang thương lượng', owner: 'member-linh', closeDate: date(5), nextAction: 'Chốt danh sách trang và tiến độ với đầu mối khách hàng.', scope: 'Website giới thiệu chương trình học và biểu mẫu đăng ký.' },
    { id: 'deal-may-social', name: 'Chăm sóc kênh Mây Wellness', customerId: 'customer-may', serviceId: 'service-social', value: 36_000_000, stage: 'Đã gửi báo giá', owner: 'member-linh', closeDate: date(8), nextAction: 'Nhắc phản hồi báo giá và lịch họp chốt kế hoạch.', scope: 'Gói Social Growth trong 3 tháng.' },
    { id: 'deal-bep', name: 'Nội dung mùa lễ hội', customerId: 'customer-bep', serviceId: 'service-content', value: 24_000_000, stage: 'Đang tư vấn', owner: 'member-an', closeDate: date(12), nextAction: 'Thu thập menu, ưu đãi và danh sách món chủ lực.', scope: 'Một đợt sản xuất nội dung mùa lễ hội.' },
    { id: 'deal-nep', name: 'Tối ưu quảng cáo bộ sưu tập', customerId: 'customer-nep', serviceId: 'service-ads', value: 16_000_000, stage: 'Mới tiếp nhận', owner: 'member-linh', closeDate: date(18), nextAction: 'Đặt lịch tư vấn mục tiêu và ngân sách quảng cáo.', scope: 'Chưa chốt phạm vi; cần xác định kênh và thời gian chạy.' },
    { id: 'deal-hat-social', name: 'Kênh social cửa hàng mới', customerId: 'customer-hat', serviceId: 'service-social', value: 36_000_000, stage: 'Đã gửi báo giá', owner: 'member-linh', closeDate: date(6), nextAction: 'Gửi mẫu kế hoạch 3 tháng và hẹn phản hồi.', scope: '12 nội dung/tháng trong 3 tháng.' },
    { id: 'deal-lua-ads', name: 'Thử nghiệm quảng cáo tháng trước', customerId: 'customer-lua', serviceId: 'service-ads', value: 8_000_000, stage: 'Không thành công', owner: 'member-minh', closeDate: date(-10), nextAction: 'Mẫu: khách hàng tạm hoãn ngân sách; theo dõi lại vào kỳ sau.', scope: 'Một tháng tối ưu quảng cáo; chưa phát sinh dự án.' },
  ];
  const stageProbability: Record<string, number> = { 'Mới tiếp nhận': 10, 'Đang tư vấn': 30, 'Đã gửi báo giá': 60, 'Đang thương lượng': 80, 'Đã chốt': 100, 'Không thành công': 0 };
  const dealAge: Record<string, number> = { 'deal-lua': 18, 'deal-hat': 17, 'deal-nova-web': 9, 'deal-may-social': 7, 'deal-bep': 4, 'deal-nep': 2, 'deal-hat-social': 5, 'deal-lua-ads': 16 };
  const stagePath = ['Mới tiếp nhận', 'Đang tư vấn', 'Đã gửi báo giá', 'Đang thương lượng', 'Đã chốt'];
  deals.forEach(deal => {
    const age = dealAge[deal.id] || 7;
    const createdAt = time(age * 24);
    const terminal = ['Đã chốt', 'Không thành công'].includes(deal.stage);
    const stageChangedAt = terminal ? `${deal.closeDate}T09:00:00+07:00` : time(24);
    const path = deal.stage === 'Không thành công' ? ['Mới tiếp nhận', 'Đang tư vấn', 'Đã gửi báo giá', 'Không thành công'] : stagePath.slice(0, stagePath.indexOf(deal.stage) + 1);
    const first = new Date(createdAt).getTime();
    const last = new Date(stageChangedAt).getTime();
    deal.probability = stageProbability[deal.stage];
    deal.description = `Mẫu: ${deal.scope} Người phụ trách cần cập nhật phản hồi khách và việc tiếp theo sau mỗi lần trao đổi.`;
    deal.createdAt = createdAt;
    deal.createdBy = team.find(member => member.id === deal.owner)?.name || 'Linh Nguyễn';
    deal.stageHistory = path.map((stage, index) => ({ stage, at: new Date(path.length === 1 ? first : first + (last - first) * index / (path.length - 1)).toISOString(), actor: deal.createdBy! }));
    deal.stageChangedAt = deal.stageHistory[deal.stageHistory.length - 1].at;
  });
  const task = (id: string, projectId: string, name: string, owner: string, status: string, due: number, hours: number): Task => ({
    id, projectId, name, owner, status, dueDate: date(due), hours, hourlyCost: 150_000, notes: 'Công việc minh hoạ; số giờ và chi phí là dữ liệu giả lập.',
  });
  const tasks: Task[] = [
    task('task-lua-1', 'project-lua', 'Chốt kế hoạch nội dung 3 tháng', 'member-an', 'Hoàn tất', -3, 12),
    task('task-lua-2', 'project-lua', 'Sản xuất bộ thiết kế đợt 1', 'member-vy', 'Đang làm', 2, 18),
    task('task-lua-3', 'project-lua', 'Tổng hợp phản hồi và bàn giao đợt 1', 'member-linh', 'Cần làm', 6, 0),
    task('task-hat-1', 'project-hat', 'Chốt hướng thiết kế nhận diện', 'member-minh', 'Hoàn tất', -7, 10),
    task('task-hat-2', 'project-hat', 'Hoàn thiện bộ ứng dụng nhận diện', 'member-vy', 'Đang làm', 1, 16),
    task('task-hat-3', 'project-hat', 'Hoàn thiện thiết kế túi giấy', 'member-vy', 'Cần làm', 3, 0),
    task('task-may-1', 'project-may', 'Xác nhận sơ đồ trang và wireframe', 'member-minh', 'Hoàn tất', -5, 14),
    task('task-may-2', 'project-may', 'Thiết kế giao diện trang dịch vụ', 'member-vy', 'Đang làm', 5, 20),
    task('task-may-3', 'project-may', 'Kiểm tra responsive và biểu mẫu', 'member-minh', 'Cần làm', 15, 0),
    task('task-nep-1', 'project-nep', 'Nhận hình ảnh bộ sưu tập từ khách', 'member-linh', 'Đang làm', -6, 4),
    task('task-nep-2', 'project-nep', 'Hoàn thiện kịch bản video bộ sưu tập', 'member-an', 'Cần làm', -4, 6),
    task('task-nova-1', 'project-nova', 'Xác nhận quyền truy cập tài khoản', 'member-minh', 'Đang làm', -1, 3),
    task('task-nova-2', 'project-nova', 'Thiết lập nhóm quảng cáo tuyển sinh', 'member-minh', 'Cần làm', 7, 0),
    task('task-bep-1', 'project-bep', 'Bàn giao nội dung và tệp nguồn', 'member-an', 'Hoàn tất', -2, 24),
  ];
  const content = (values: Partial<Content> & Pick<Content, 'id' | 'projectId' | 'title' | 'body'>): Content => ({
    channel: 'Facebook', batch: 'Đợt 01', publishDate: date(3), status: 'Ý tưởng', owner: 'member-an', version: 1, feedback: '', url: '', ...values,
  });
  const contents: Content[] = [
    content({ id: 'content-lua-1', projectId: 'project-lua', title: 'Một góc nhà, nhiều cảm hứng', body: 'Một góc nhỏ đủ ánh sáng, một chiếc ghế thoải mái và vài chất liệu tự nhiên: bắt đầu hành trình làm mới không gian sống từ những điều vừa đủ.', status: 'Sẵn sàng đăng', publishDate: date(1) }),
    content({ id: 'content-lua-2', projectId: 'project-lua', title: '3 cách phối màu cho phòng khách', body: 'Chọn một màu nền sáng, một sắc độ từ thiên nhiên và một điểm nhấn ấm. Lưu bảng phối màu để tham khảo khi sắp xếp lại phòng khách.', status: 'Đang sản xuất', owner: 'member-vy', publishDate: date(3) }),
    content({ id: 'content-lua-3', projectId: 'project-lua', title: 'Chất liệu kể câu chuyện của ngôi nhà', body: 'Bề mặt gỗ, lớp vải thô và ánh sáng dịu tạo nên cảm giác gần gũi. Mỗi chất liệu là một lời gợi mở về cách bạn muốn sống.', status: 'Sẵn sàng đăng', publishDate: date(5) }),
    content({ id: 'content-lua-4', projectId: 'project-lua', title: 'Video: làm mới góc đọc sách', body: 'Kịch bản mẫu: toàn cảnh góc đọc sách → cận cảnh đèn và chất liệu → thay đổi bố cục → kết quả cuối cùng. Kết thúc bằng câu hỏi: bạn muốn làm mới góc nào trong nhà?', channel: 'Instagram', batch: 'Đợt 02', publishDate: date(12) }),
    content({ id: 'content-hat-1', projectId: 'project-hat', title: 'Hạt Nắng trong diện mạo mới', body: 'Vẫn là hương cà phê quen thuộc, nay được kể bằng một diện mạo mới. Cùng xem những chi tiết lấy cảm hứng từ hạt cà phê và nắng sớm.', status: 'Sẵn sàng đăng', owner: 'member-minh', publishDate: date(2) }),
    content({ id: 'content-hat-2', projectId: 'project-hat', title: 'Chuyện phía sau chiếc túi giấy', body: 'Từ màu sắc đến cách đặt biểu trưng, chiếc túi giấy nối tiếp câu chuyện nhận diện thương hiệu. Nội dung sẽ cập nhật theo thiết kế cuối cùng.', status: 'Đang sản xuất', owner: 'member-vy', publishDate: date(6) }),
    content({ id: 'content-may-1', projectId: 'project-may', title: 'Nội dung trang giới thiệu', body: 'Mây Wellness tạo một khoảng nghỉ trong nhịp sống hằng ngày. Khám phá không gian, đội ngũ và cách chúng tôi đồng hành cùng trải nghiệm chăm sóc của bạn.', channel: 'Website', status: 'Sẵn sàng đăng', publishDate: date(7) }),
    content({ id: 'content-may-2', projectId: 'project-may', title: 'Hướng dẫn đặt lịch trực tuyến', body: 'Chọn dịch vụ phù hợp, để lại thông tin liên hệ và thời gian mong muốn. Đội ngũ sẽ liên hệ xác nhận trước khi lịch hẹn được hoàn tất.', channel: 'Website', status: 'Đang sản xuất', publishDate: date(10) }),
    content({ id: 'content-nep-1', projectId: 'project-nep', title: 'Bộ sưu tập: những chuyển động nhẹ', body: 'Những đường cắt giản dị và chất liệu mềm tạo nên trang phục cho nhịp sống thường ngày. Chờ khách hàng cung cấp hình ảnh trước khi hoàn thiện chú thích.', status: 'Đang sản xuất', publishDate: date(-2), feedback: 'Mẫu: chờ ảnh chính thức của bộ sưu tập và xác nhận tên chất liệu.', version: 2 }),
    content({ id: 'content-nep-2', projectId: 'project-nep', title: 'Video: một thiết kế, ba cách phối', body: 'Kịch bản mẫu: chọn thiết kế chủ đạo → phối cùng phụ kiện tối giản → chuyển sang trang phục đi làm → kết thúc bằng diện mạo cuối tuần.', channel: 'TikTok', status: 'Ý tưởng', batch: 'Đợt 02', publishDate: date(4) }),
    content({ id: 'content-nova-1', projectId: 'project-nova', title: 'Khám phá lộ trình học phù hợp', body: 'Một lộ trình rõ ràng bắt đầu từ mục tiêu của người học. Để lại câu hỏi về chương trình, thời gian học và hình thức tư vấn bạn mong muốn.', status: 'Đang sản xuất', publishDate: date(9) }),
    content({ id: 'content-bep-1', projectId: 'project-bep', title: 'Một lời chào từ Bếp Tháng Tư', body: 'Cảm ơn bạn đã ghé Bếp trong những ngày đầu tiên. Chúng tôi mong mỗi bữa ăn là dịp để mọi người ngồi lại, trò chuyện và tìm thấy một món quen.', status: 'Đã đăng', publishDate: date(-3) }),
  ];
  return {
    customers, services, deals, projects, tasks, contents, team, settings,
    changes: [],
    issues: [
      { id: 'issue-nep', projectId: 'project-nep', title: 'Chưa nhận ảnh bộ sưu tập', description: 'Đã nhắc đầu mối khách hàng nhưng chưa có ảnh chính thức; ảnh hưởng lịch hoàn thiện nội dung. Cần quản lý hỗ trợ xác nhận thời điểm cung cấp.', owner: 'member-linh', priority: 'Khẩn cấp', status: 'Đã chuyển cấp', dueDate: date(-1), createdAt: time(60) },
      { id: 'issue-nova', projectId: 'project-nova', title: 'Thiếu quyền truy cập tài khoản quảng cáo', description: 'Khách hàng chưa cấp đủ quyền cho người phụ trách. Chiến dịch tạm dừng trước khi có quyền truy cập phù hợp.', owner: 'member-minh', priority: 'Cao', status: 'Đang xử lý', dueDate: date(1), createdAt: time(18) },
      { id: 'issue-may', projectId: 'project-may', title: 'Đã xác nhận đầu mối trao đổi website', description: 'Cần một đầu mối tổng hợp phản hồi để tránh các ý kiến khác nhau giữa các phòng ban.', owner: 'member-linh', priority: 'Bình thường', status: 'Đã giải quyết', dueDate: date(-2), createdAt: time(96), resolvedAt: time(50), resolution: 'Mẫu: khách hàng chỉ định một đầu mối tổng hợp và thống nhất lịch phản hồi.' },
    ],
    assets: [
      { id: 'asset-social', name: 'Khung case study · Social Growth', category: 'Case study', industry: 'F&B', serviceId: 'service-social', description: 'Cấu trúc tham khảo: bối cảnh → mục tiêu → công việc → kết quả có bằng chứng. Chưa đính kèm tài liệu thực tế.', url: '', shareable: false, watermark: false },
      { id: 'asset-brand', name: 'Danh sách bàn giao bộ nhận diện', category: 'Quy trình', industry: 'Đa ngành', serviceId: 'service-brand', description: 'Danh sách tham khảo: logo, bảng màu, hệ chữ, bộ ứng dụng và hướng dẫn sử dụng. Chưa đính kèm tài liệu.', url: '', shareable: false, watermark: false },
      { id: 'asset-web', name: 'Khung trình bày dự án website', category: 'Case study', industry: 'Dịch vụ', serviceId: 'service-web', description: 'Nội dung tham khảo để giới thiệu mục tiêu, luồng người dùng, thiết kế responsive và kết quả bàn giao. Chưa đính kèm tài liệu.', url: '', shareable: false, watermark: false },
      { id: 'asset-content', name: 'Mẫu kế hoạch nội dung theo đợt', category: 'Biểu mẫu', industry: 'Đa ngành', serviceId: 'service-content', description: 'Gợi ý các cột: mục tiêu, chủ đề, kênh, người phụ trách, đợt sản xuất, trạng thái và lịch đăng. Chưa đính kèm tài liệu.', url: '', shareable: false, watermark: false },
    ],
    activities: [
      { id: 'activity-1', text: 'Mẫu · Đã chuyển cấp vướng mắc ảnh bộ sưu tập của Nếp Atelier.', time: time(1), actor: 'Linh Nguyễn', kind: 'issue', entityId: 'issue-nep' },
      { id: 'activity-3', text: 'Mẫu · Chuyển Hạt Nắng Coffee cho Hà Đỗ trong đội telesales; giữ Linh làm account.', time: time(1), actor: 'Linh Nguyễn', kind: 'transfer_to_telesales', entityId: 'customer-hat' },
      { id: 'activity-2', text: 'Mẫu · Ghi nhận cuộc gọi với Lụa Home và hẹn trao đổi kế hoạch tiếp theo.', time: time(2), actor: 'Linh Nguyễn', kind: 'customer_interaction', entityId: 'customer-lua' },
      { id: 'activity-5', text: 'Mẫu · TELE xác nhận Nova Learning có nhu cầu website và chuyển tiếp cho account.', time: time(2), actor: 'Hà Đỗ', kind: 'log_telesales_call', entityId: 'customer-nova' },
      { id: 'activity-4', text: 'Mẫu · Gửi báo giá Social Growth cho Hạt Nắng Coffee.', time: time(24), actor: 'Linh Nguyễn', kind: 'deal', entityId: 'deal-hat-social' },
      { id: 'activity-6', text: 'Mẫu · Hoàn tất bàn giao đợt nội dung khai trương Bếp Tháng Tư.', time: time(48), actor: 'An Lê', kind: 'project', entityId: 'project-bep' },
    ],
  };
}
