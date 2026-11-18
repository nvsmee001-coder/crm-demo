// Compatibility exports for existing CRM pages. Identity is verified from the
// local password/session database; incoming identity headers are never trusted.
export { getCurrentUser, requireCurrentUser, getCurrentUser as getChatGPTUser, requireCurrentUser as requireChatGPTUser } from '../lib/auth/session';
export type { CurrentUser as ChatGPTUser } from '../lib/auth/session';
import { safeReturnTo } from '../lib/auth/crypto';
export function chatGPTSignInPath(returnTo = '/') { return '/login?returnTo=' + encodeURIComponent(safeReturnTo(returnTo)); }
export function chatGPTSignOutPath() { return '/logout'; }
