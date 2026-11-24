import { CopyButton } from "./CopyButton";
import { ActivityDisclosure } from "./Disclosure";
import type { SearchNode } from "./types";

/**
 * 搜索块（grep / 文件搜索）（SPEC §10，**推断**：文案确证，UI 未实测）
 * ============================================================================
 * SPEC §10 的关键结论：**搜索不是独立块类型** —— 它是 `exec` 项
 * （`parsedCmd.type ∈ {read, search, list_files, …}`）落在 **§4 命令块外壳**里，
 * 并在"探索"分组里被聚合成一个 `exploration` 单元。
 *   → 所以本组件**复用 §4 的卡片外壳**（卡片/类型行/正文/状态行的类名与尺寸都是实测值），
 *      只把"命令行 + 输出"换成"查询 + 命中列表"。
 *
 * 文案（SPEC §10，**确证**）：`Searching files in {folder} folder` / `Searching for {query}` /
 * `Listing files` / `Reading {target}` …（`active-tool-activity-label-*.js`）
 *
 * ⚠️ **推断实现**（SPEC §13.5）：官方用自命名图标（`code-searching` / `list-files` / `run-command`），
 *    **未映射**到 1031 目录资产名 → 本实现**不渲染图标**，不用近似图标顶替。
 * ⚠️ 命中列表的行样式未实测 → 按 §6.1 的"文件名按钮 + 正文"排版落地，标为推断。
 */

const ACTION_LABEL: Record<SearchNode["action"], string> = {
  listing: "正在列出",
  reading: "正在读取",
  searching: "正在搜索",
};

function summaryText(block: SearchNode) {
  if (block.action === "searching") {
    if (block.query) return `for ${block.query}`;
    return block.folder ? `files in ${block.folder} folder` : "files";
  }
  if (block.action === "listing") return block.folder ? `files in ${block.folder} folder` : "files";
  return block.query ?? block.folder ?? "内容";
}

export function SearchBlock({ block }: { block: SearchNode }) {
  const { action, results, status } = block;
  const running = status === "running";
  const detail = summaryText(block);

  return (
    <ActivityDisclosure
      active={running}
      bodyVariant="default"
      hasBody
      indent={false}
      itemId={block.id}
      status={status}
      summary={
        <>
          <span className="cx-summary__action">{ACTION_LABEL[action]}</span>{" "}
          <span className="cx-summary__detail">{detail}</span>
        </>
      }
      defaultExpanded={block.defaultExpanded}
    >
      <div className="cx-exec" data-testid="exec-shell-body">
        <div className="cx-exec__card">
          <div className="cx-exec__clip">
            <div className="cx-exec__type">
              <span>{action === "searching" ? "Search" : action === "listing" ? "List" : "Read"}</span>
            </div>
            <div className="cx-exec__body-clip">
              <div className="cx-exec__body">
                <div className="cx-exec__command-wrap">
                  <div className="cx-exec__command">
                    <button className="cx-exec__command-text" type="button">
                      <span className="cx-exec__prompt">/</span>
                      <code className="cx-exec__command-code">
                        <span>{detail}</span>
                      </code>
                    </button>
                    <span className="cx-exec__copy-host">
                      <CopyButton className="cx-copybtn cx-exec__copy cx-exec__copy--command" text={detail} />
                    </span>
                  </div>
                </div>
                {results?.length ? (
                  <div className="cx-search__results">
                    {results.map((row, index) => (
                      <div className="cx-search__row" key={`${index}-${row.path}`}>
                        <span className="cx-search__path">{row.path}</span>
                        {row.lineNumber != null ? (
                          <span className="cx-search__line-number">{row.lineNumber}</span>
                        ) : null}
                        {row.line ? <span className="cx-search__line">{row.line}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="cx-exec__status">
            <span className="cx-exec__status-group">
              <span className="cx-exec__status-text">
                {running ? "正在运行" : `${results?.length ?? 0} 处命中`}
              </span>
            </span>
          </div>
        </div>
      </div>
    </ActivityDisclosure>
  );
}
