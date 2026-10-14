export function nativeFallbackUrl(location: Pick<Location, "pathname" | "search" | "hash">): string {
  const pathname = location.pathname.startsWith("/") ? location.pathname : `/${location.pathname}`;
  return `/artex${pathname}${location.search}${location.hash}`;
}
