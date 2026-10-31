import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;

test.before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
});

test.after(async () => {
  await server.close();
});

async function loadMarkdown() {
  return (await server.ssrLoadModule("/src/chat/Markdown.tsx")) as {
    Markdown: (props: { content: string }) => ReactNode;
  };
}

test("renders complex GFM tables without leaking markdown source", async () => {
  const { Markdown } = await loadMarkdown();
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      content: [
        "| **级别** | 示例 | 说明 | 数量 |",
        "| :--- | :---: | --- | ---: |",
        "| 高危 | `a\\|b` | 管道写作 \\| | 1 |",
        "| 低危 | [链接](https://example.com) | 缺列 |",
      ].join("\n"),
    }),
  );

  assert.match(html, /<div class="cx-markdown__table-wrap"><table/);
  assert.match(html, /<th[^>]*data-align="left"/);
  assert.match(html, /<th[^>]*data-align="center"/);
  assert.match(html, /<th[^>]*data-align="right"/);
  assert.match(html, /<strong>级别<\/strong>/);
  assert.match(html, /<code class="cx-markdown__code">a\|b<\/code>/);
  assert.match(html, /管道写作 \|/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(html, /\|\s*:?-{3,}/);
});

test("keeps adjacent tables separate and preserves fenced code blocks", async () => {
  const { Markdown } = await loadMarkdown();
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      content: [
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "```ts",
        "const value = 'a|b';",
        "```",
        "",
        "| C | D |",
        "| --- | --- |",
        "| 3 | 4 |",
      ].join("\n"),
    }),
  );

  assert.equal((html.match(/class="cx-markdown__table-wrap"/g) ?? []).length, 2);
  assert.match(html, /class="cx-codeblock"/);
  assert.match(html, /const/);
});
