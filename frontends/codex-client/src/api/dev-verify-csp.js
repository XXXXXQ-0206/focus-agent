(async () => {
  // 在**真实应用页面**（app:// 或 dist 页面）里探测：CSP 允不允许连用户自己的端点？
  // 结论对「自定义 API」这个功能是生死性的：connect-src 'self' 会直接掐掉跨域请求。
  const out = { href: location.href, origin: location.origin, violations: [], results: [] };

  document.addEventListener("securitypolicyviolation", (event) => {
    out.violations.push({
      directive: event.violatedDirective,
      blockedURI: event.blockedURI,
      sourceFile: event.sourceFile,
    });
  });

  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  out.cspMeta = meta ? meta.getAttribute("content") : null;
  out.connectSrc = out.cspMeta ? (out.cspMeta.match(/connect-src[^;]*/) || [null])[0] : null;

  // 1) 跨域探针：不同端口 = 不同 origin
  for (const url of ["http://127.0.0.1:9999/v1/models", "https://api.deepseek.com/v1/models"]) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1500);
      await fetch(url, { signal: controller.signal });
      out.results.push({ url, outcome: "完成（未被 CSP 拦）", ms: Date.now() - started });
    } catch (error) {
      out.results.push({
        url,
        outcome: `${String(error?.name)}: ${String(error?.message)}`,
        ms: Date.now() - started,
      });
    }
  }

  // 2) 同源探针做对照（应该能到网络层）
  try {
    const response = await fetch(`${location.origin}/vite.svg`, { cache: "no-store" });
    out.results.push({ url: "same-origin /vite.svg", outcome: `HTTP ${response.status}（同源可达）` });
  } catch (error) {
    out.results.push({ url: "same-origin /vite.svg", outcome: `失败：${String(error?.message)}` });
  }

  out.blockedByCsp = out.violations.length > 0;
  return out;
})();
