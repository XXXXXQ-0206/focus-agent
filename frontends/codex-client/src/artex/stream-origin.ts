export function streamOriginFor(location: { origin: string }): string {
  return location.origin.replace(/\/$/, "");
}
