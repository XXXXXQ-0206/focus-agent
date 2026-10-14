/**
 * Build a URL for a route or public asset owned by the native ARTEX app.
 *
 * Next's `Link` applies `basePath` automatically, but browser APIs such as
 * `window.location.replace` and raw `<img src>` do not. This helper keeps
 * those paths correct in the static `/artex` deployment while preserving the
 * root path used by `next dev`.
 *
 * API endpoints intentionally do not use this helper: the Go API remains at
 * the host root (`/api/...`) for both frontends.
 */
export function appPath(path: string): string {
  if (!path.startsWith("/")) return path;
  const base = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";
  if (!base || path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
}
