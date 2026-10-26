import { env } from '$env/dynamic/private';

export function isSecureCookieEnvironment(): boolean {
  return process.env.NODE_ENV !== 'development';
}

export function getCookieDomainOptions(): { domain?: string } {
  const domain = env.AUTH_COOKIE_DOMAIN || process.env.AUTH_COOKIE_DOMAIN;
  return domain ? { domain } : {};
}
