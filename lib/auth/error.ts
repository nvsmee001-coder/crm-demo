export class AuthError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export class MfaCodeError extends AuthError {
  constructor() { super('Nhập mã xác thực hợp lệ hoặc mã khôi phục chưa dùng.',401); }
}

export class MfaRequiredError extends AuthError {
  constructor() { super('Nhập mã từ ứng dụng xác thực hoặc mã khôi phục.',409); }
}
