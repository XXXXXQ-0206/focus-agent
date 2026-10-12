"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

/**
 * 根路径入口。
 *
 * 这里**不能**用服务端 `redirect("/function/tasks")`：静态导出下它会被编译成
 * Next 的 `__next_error__` 重定向外壳，布局里的 ThemeBootScript 只存在于
 * RSC payload 而不会作为真实 <script> 执行 —— 结果是首屏永远停留在服务端
 * 烤死的 light 主题，只有手动刷新（落到真实路由）才会变回用户选的主题。
 *
 * 改成客户端跳转后，`/` 会渲染在正常布局里，主题脚本在 head 里真实执行，
 * 首屏就是正确的主题，再替换到控制台首页。
 */
export default function Home() {
  const router = useRouter();

  React.useEffect(() => {
    // Codex 式外壳：进站默认落在 agent 对话界面（平台面板全部收进设置）。
    router.replace("/chat");
  }, [router]);

  return null;
}
