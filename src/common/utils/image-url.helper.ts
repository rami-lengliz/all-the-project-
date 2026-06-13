/**
 * Converts a listing/avatar image URL to an absolute URL.
 *
 * Cloudinary URLs are already absolute (https://res.cloudinary.com/...) and
 * pass through unchanged. Local dev uploads are relative paths like
 * /uploads/listings/{id}/{file} — these get prefixed with the backend's public
 * base URL so mobile clients (which are not on localhost:3001) can load them.
 *
 * The `backendUrl` should come from the BACKEND_PUBLIC_URL env var.
 * Falls back to http://localhost:3001 when that var is absent (dev only).
 */
export function toAbsoluteImageUrl(
  url: string,
  backendUrl: string,
): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = backendUrl.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function toAbsoluteImageUrls(
  urls: string[],
  backendUrl: string,
): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => toAbsoluteImageUrl(u, backendUrl));
}
