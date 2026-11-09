// Shared with services/auth through @innova/auth-kit. Guards keep authorizing
// from the current DB record on every request.
export {
  AUTH_COOKIE_NAME,
  JWT_EXPIRES_IN,
  authCookieOptions,
  clearAuthCookieOptions,
  createAuthGuard,
  createApprovedAuthGuard,
  createAdminAuthGuard,
  type AuthUserLookup,
} from "@innova/auth-kit";
