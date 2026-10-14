const APP_HOST = "127.0.0.1";
const APP_PORT = "8787";
const APP_PROTOCOL = "http:";
const APP_ORIGIN = `${APP_PROTOCOL}//${APP_HOST}:${APP_PORT}`;

const UI_ROUTES = Object.freeze({
  codex: Object.freeze({ path: "/", label: "Codex 风格客户端" }),
  artex: Object.freeze({ path: "/artex/", label: "原生 ARTEX Web" }),
});

function parseURL(rawURL) {
  if (typeof rawURL !== "string") return null;
  try {
    return new URL(rawURL);
  } catch {
    return null;
  }
}

function isLocalAppURL(rawURL) {
  const url = parseURL(rawURL);
  return Boolean(
    url &&
      url.protocol === APP_PROTOCOL &&
      url.hostname === APP_HOST &&
      url.port === APP_PORT &&
      !url.username &&
      !url.password,
  );
}

function isSafeExternalWebURL(rawURL) {
  const url = parseURL(rawURL);
  return Boolean(
    url &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname &&
      !url.username &&
      !url.password,
  );
}

function uiModeForURL(rawURL) {
  const url = parseURL(rawURL);
  if (!url || !isLocalAppURL(rawURL)) return null;
  return url.pathname === "/artex" || url.pathname.startsWith("/artex/") ? "artex" : "codex";
}

function hasArtexHealthIdentity(body) {
  if (typeof body !== "string" || body.length > 8192) return false;
  try {
    const health = JSON.parse(body);
    return health?.ok === true && health?.service === "artex";
  } catch {
    return false;
  }
}

module.exports = {
  APP_HOST,
  APP_ORIGIN,
  APP_PORT,
  UI_ROUTES,
  hasArtexHealthIdentity,
  isLocalAppURL,
  isSafeExternalWebURL,
  uiModeForURL,
};
