import { useMemo, useState } from "react";

import {
  CodexAlertTriangle,
  CodexBranch,
  CodexCheck,
  CodexPullRequestClosed,
  CodexPullRequestMerged,
  CodexPullRequestOpen,
  CodexRefresh,
  CodexTerminal,
  CodexX,
} from "@/icons";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui";

import {
  PR_REVIEW_LABEL,
  PR_STATE_LABEL,
  PULL_REQUESTS,
  type PullRequestRow,
  REVIEW_REPOSITORIES,
} from "./mock";
import { Badge, EmptyState, RowSkeleton, SearchField, Segmented } from "./parts";

/**
 * 代码审查页（rail 分隔线之后的第 5 项，路由 /review ↔ 官方 /pull-requests）。
 *
 * ── 真值来源 ────────────────────────────────────────────────────────────────
 * 路由：官方 rail 路由表 `app-initial-25361a10f2bf.js:43532`
 *   `"code-review": { path: wmn(), sidebar: \`code-review\`, destinationId: \`builtin:pull-requests\`, rail: \`pinned\` }`
 *   其中 `wmn()` 返回 `Emn = il(\`code-review\`, \`pull_requests.open\`)`（app-initial 偏移约 2794608）。
 *   路由表 `app-initial:164633`：
 *   `<Route path="/pull-requests" element={<Suspense fallback={<LLa detailSelected={false}/>}><_Or/></Suspense>}/>`
 *   另一条同组件路由用 `fallback={<LLa detailSelected={true}/>}`（选中态骨架）。
 *   设置里还有 `code-review/repositories/:repositoryId`（slug `code-review`）。
 * 业务体 chunk：`pull-request-route-1150fdad8cb9.js`（44KB 主路由）、
 *   `pull-request-detail-actions-b2348de51ae3.js`、`pull-request-status-label-9be639b53063.js`、
 *   `pull-request-checks-summary-1263255bdb7b.js`、`pull-request-code-review-34f99ced34eb.js`。
 *
 * 结构与几何（官方 className 实测，见 pages.css 头部 [B] 段）：
 *   根            `flex h-full min-h-0 w-full flex-col bg-surface`
 *   仓库名列      `max-w-[35%] shrink-0 truncate`（在行内先占位、再截断）
 *   标题列        `min-w-0 flex-1 truncate`
 *   作者头像      `size-4 shrink-0 rounded-full bg-white`（16px 圆头像）
 *   选项行        `flex cursor-interaction items-center gap-1 rounded-sm text-start`
 *   小节标题      `px-3 pb-1 text-xs font-medium text-codex-description`
 *   空态列        `flex w-full max-w-80 flex-col items-center gap-3`（320 宽 / gap 12）
 *
 * 文案（官方 defaultMessage / zh-CN 译文）：
 *   codex.pullRequests.inbox.title                Pull requests → Pull Request
 *   codex.pullRequests.inbox.subtitle.setup       在 GitHub 中审查并跟踪工作。
 *   codex.pullRequests.inbox.subtitle             Review and track work across GitHub as {login}.
 *   codex.pullRequests.inbox.search               搜索 Pull Request
 *   codex.pullRequests.inbox.viewFilter           Pull request view → PR 视图
 *   codex.pullRequests.inbox.view.all/reviewing/authored   全部 / 正在审查 / 我创建的
 *   codex.pullRequests.inbox.statusFilter         Status → 状态
 *   codex.pullRequests.inbox.lifecycle.all/open/merged/closed  全部状态 / 打开 / 已合并 / 已关闭
 *   codex.pullRequests.inbox.repositoryFilter     Repository → 仓库
 *   codex.pullRequests.inbox.repository.all       所有仓库
 *   codex.pullRequests.inbox.section.userReviewRequested   需要我审查
 *   codex.pullRequests.inbox.section.teamReviewRequested   需要我团队审查
 *   codex.pullRequests.inbox.section.reviewed     Previously reviewed → 我审查过的
 *   codex.pullRequests.inbox.section.authored     Authored → 我创建的
 *   codex.pullRequests.inbox.section.results      Results → 结果
 *   codex.pullRequests.inbox.empty                未找到 Pull Request
 *   codex.pullRequests.inbox.emptySearch          没有符合此搜索的 Pull Request
 *   codex.pullRequests.inbox.emptyReviewing       你已全部处理完毕
 *   codex.pullRequests.inbox.loading              正在加载 Pull Request
 *   codex.pullRequests.inbox.refreshing           Refreshing pull requests → 正在刷新
 *   codex.pullRequests.inbox.error                Unable to load pull requests
 *   codex.pullRequests.inbox.partial              Some pull requests couldn't be loaded
 *   codex.pullRequests.inbox.loadMore             Load more → 加载更多
 *   codex.pullRequests.inbox.setup                GitHub CLI setup required → 需要安装 GitHub CLI
 *   codex.pullRequests.inbox.installTitle         安装 GitHub CLI
 *   codex.pullRequests.inbox.installDescription   Install GitHub CLI to view and manage your pull requests
 *   codex.pullRequests.inbox.setupDescription     Install and sign in with GitHub CLI on {executionHost}, then check again.
 *   codex.pullRequests.inbox.copyInstallCommand   Copy install command → 复制安装命令
 *   codex.pullRequests.inbox.askCodex             Ask Focus → 问 Focus
 *   codex.pullRequests.inbox.checkAgain           Check again → 再检查一次
 *   codex.pullRequests.inbox.credentialLoading    Checking GitHub access → 正在检查 GitHub 访问权限
 *   codex.pullRequests.inbox.retrySetup           Retry → 重试
 *   codex.pullRequests.inbox.retry                再试一次
 *   codeReview.sidebar.title                      代码审查
 *   codeReview.sidebar.rowLastUpdated             Updated {date} → 更新于 {date}
 *   codeReview.sidebar.approvedBadge              已批准 / changesRequestedBadge 请求修改
 *   codeReview.sidebar.waitingBadge               等待审查 / draftBadge 草稿
 *   codeReview.sidebar.mergedBadge                已合并 / closedBadge 已关闭
 *   codeReview.menu.*                             关闭 PR / 复制链接 / 转为草稿 / 在 GitHub 中打开 /
 *                                                 固定 PR / 标记为可审查 / 重新打开 / 用 Focus 审查 / 取消固定
 *   pullRequestDetail.selectPullRequest           选择要查看的 Pull Request
 *   pullRequestDetail.loading                     正在加载 Pull Request 详情
 *   pullRequestDetail.merge.title                 Merge pull request → 合并 Pull Request
 *   pullRequestDetail.merge.squash/commit         Squash / Merge commit → 压缩合并 / 合并提交
 *   pullRequestDetail.merge.confirmSquash         Squash and merge → 压缩并合并
 *   pullRequestDetail.actions.merge.disabled.*    各种合并禁用原因（草稿 / 冲突 / checks 未过 …）
 *   pullRequestDetail.code.empty                  No changed files → 没有改动的文件
 *   pullRequestDetail.code.branchRange            {headBranch} → {baseBranch}
 *   pullRequestsPage.detail.actions.merge.success 已合并 Pull Request
 *   codex.review.*                                变更面板（跳转文件 / 词级差异 / 隐藏空白 …）
 */
export function ReviewRoute() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "reviewing" | "authored">("all");
  const [repository, setRepository] = useState("all");
  const [lifecycle, setLifecycle] = useState<"all" | "open" | "merged" | "closed">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"ready" | "loading" | "error" | "partial" | "setup">("ready");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PULL_REQUESTS.filter((pr) => {
      if (
        view === "reviewing" &&
        pr.section !== "userReviewRequested" &&
        pr.section !== "teamReviewRequested"
      )
        return false;
      if (view === "authored" && pr.section !== "authored") return false;
      if (repository !== "all") {
        const repo = REVIEW_REPOSITORIES.find((item) => item.id === repository);
        if (repo && pr.repository !== repo.name) return false;
      }
      if (lifecycle === "open" && pr.state !== "open" && pr.state !== "draft") return false;
      if (lifecycle === "merged" && pr.state !== "merged") return false;
      if (lifecycle === "closed" && pr.state !== "closed") return false;
      if (!needle) return true;
      return [pr.title, pr.repository, `#${pr.number}`, pr.author, pr.headBranch].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [query, view, repository, lifecycle]);

  const groups = useMemo(() => {
    const order: PullRequestRow["section"][] = [
      "userReviewRequested",
      "teamReviewRequested",
      "reviewed",
      "authored",
    ];
    const labels: Record<PullRequestRow["section"], string> = {
      userReviewRequested: query ? "结果" : "需要我审查",
      teamReviewRequested: "需要我团队审查",
      reviewed: "我审查过的",
      authored: "我创建的",
    };
    return order
      .map((section) => ({
        section,
        label: labels[section],
        rows: filtered.filter((pr) => pr.section === section),
      }))
      .filter((group) => group.rows.length > 0);
  }, [filtered, query]);

  const repositoryName = REVIEW_REPOSITORIES.find((item) => item.id === repository)?.name ?? "所有仓库";
  const selected = PULL_REQUESTS.find((pr) => pr.id === selectedId) ?? null;

  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 700);
  };

  const stateIcon = (pr: PullRequestRow) => {
    if (pr.state === "merged") return CodexPullRequestMerged;
    if (pr.state === "closed") return CodexPullRequestClosed;
    return CodexPullRequestOpen;
  };

  const stateTone = (pr: PullRequestRow) =>
    pr.state === "merged"
      ? "merged"
      : pr.state === "closed"
        ? "closed"
        : pr.state === "draft"
          ? "warning"
          : "open";

  return (
    <div className="cx-page" data-page="review">
      <div className="cx-page__toolbar">
        <SearchField onChange={setQuery} placeholder="搜索 Pull Request" value={query} />
        <Segmented
          ariaLabel="PR 视图"
          onChange={setView}
          options={[
            { id: "all", label: "全部" },
            { id: "reviewing", label: "正在审查" },
            { id: "authored", label: "我创建的" },
          ]}
          value={view}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              状态：
              {lifecycle === "all"
                ? "全部状态"
                : lifecycle === "open"
                  ? "打开"
                  : lifecycle === "merged"
                    ? "已合并"
                    : "已关闭"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>状态</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setLifecycle("all")}>全部状态</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLifecycle("open")}>打开</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLifecycle("merged")}>已合并</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLifecycle("closed")}>已关闭</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              {repositoryName}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>仓库</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {REVIEW_REPOSITORIES.map((repo) => (
              <DropdownMenuItem key={repo.id} onSelect={() => setRepository(repo.id)}>
                {repo.name}
                <span className="cx-page__section-count" style={{ marginInlineStart: 12 }}>
                  {repo.openCount}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="cx-page__toolbar-trailing">
          <Button aria-label="刷新 Pull Request" onClick={refresh} size="sm" uniform variant="ghost">
            <CodexRefresh size={14} />
          </Button>
          <Button
            onClick={() => setPhase(phase === "ready" ? "setup" : "ready")}
            size="sm"
            variant="ghost"
            title="切换 GitHub CLI 未就绪的演示状态"
          >
            {phase === "setup" ? "已完成设置" : "模拟未设置"}
          </Button>
        </div>
      </div>

      <div className="cx-split">
        <div className="cx-split__main">
          {refreshing ? (
            <div className="cx-page__toolbar">
              <span className="cx-muted">正在刷新…</span>
            </div>
          ) : null}

          <div className="cx-page__body">
            {phase === "loading" ? (
              <>
                <span className="cx-muted">正在加载 Pull Request</span>
                <RowSkeleton rows={5} />
              </>
            ) : null}

            {phase === "setup" ? (
              <EmptyState
                description="在这台设备上安装并登录 GitHub CLI，然后点「再检查一次」。"
                icon={CodexTerminal}
                title="需要安装 GitHub CLI"
                actions={
                  <>
                    <Button color="primary" size="sm" variant="solid">
                      复制安装命令
                    </Button>
                    <Button onClick={() => setPhase("ready")} size="sm" variant="surface">
                      再检查一次
                    </Button>
                    <Button size="sm" variant="ghost">
                      问 Focus
                    </Button>
                  </>
                }
              />
            ) : null}

            {phase === "error" ? (
              <EmptyState
                // [task-24] 官方 /review **实测就是这一态**（captures/recon-official/official-rail-review.json，
                //   bodyTextHead =「应用不可用 重试以加载应用 重试」；dom.nodes 1083-1085 给出几何）：
                //   标题「应用不可用」｜说明「重试以加载应用」｜动作「重试」；几何 max-w-xl + gap-3（layout="center"）
                description="重试以加载应用"
                icon={CodexAlertTriangle}
                layout="center"
                title="应用不可用"
                actions={
                  <Button onClick={() => setPhase("ready")} size="sm" variant="surface">
                    重试
                  </Button>
                }
              />
            ) : null}

            {phase === "partial" ? <p className="cx-danger-text">部分 Pull Request 没能加载。</p> : null}

            {phase === "ready" && filtered.length === 0 ? (
              <EmptyState
                description={
                  query
                    ? `没有符合「${query}」的 Pull Request。`
                    : view === "reviewing"
                      ? "需要你审查的 PR 都处理完了。"
                      : "这个仓库和状态下暂时没有 PR。"
                }
                icon={CodexPullRequestOpen}
                title={
                  query
                    ? "没有符合此搜索的 Pull Request"
                    : view === "reviewing"
                      ? "你已全部处理完毕"
                      : "未找到 Pull Request"
                }
                actions={
                  <Button
                    onClick={() => {
                      setQuery("");
                      setView("all");
                      setRepository("all");
                      setLifecycle("all");
                    }}
                    size="sm"
                    variant="surface"
                  >
                    清空筛选
                  </Button>
                }
              />
            ) : null}

            {phase === "ready" && filtered.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {groups.map((group) => (
                  <section className="cx-page__section" key={group.section}>
                    <h2 className="cx-page__section-title">
                      {group.label}
                      <span className="cx-page__section-count">{group.rows.length}</span>
                    </h2>
                    <ul className="cx-page__list">
                      {group.rows.map((pr) => {
                        const StateIcon = stateIcon(pr);
                        return (
                          <li className="cx-row-wrap" key={pr.id}>
                            <button
                              aria-pressed={pr.id === selectedId}
                              className="cx-row"
                              data-selected={pr.id === selectedId ? "true" : undefined}
                              onClick={() => setSelectedId(pr.id)}
                              type="button"
                            >
                              <span aria-hidden className="cx-row__icon">
                                <StateIcon size={20} />
                              </span>
                              <span className="cx-row__main">
                                <span className="cx-row__title">{pr.title}</span>
                                <span className="cx-row__subtitle">
                                  {pr.repository} · #{pr.number} · {pr.author}
                                </span>
                              </span>
                              {pr.review ? (
                                <Badge
                                  tone={
                                    pr.review === "approved"
                                      ? "open"
                                      : pr.review === "changes_requested"
                                        ? "danger"
                                        : undefined
                                  }
                                >
                                  {PR_REVIEW_LABEL[pr.review]}
                                </Badge>
                              ) : null}
                              {pr.checks.failing > 0 ? (
                                <Badge tone="danger">{pr.checks.failing} 项检查失败</Badge>
                              ) : null}
                              <span className="cx-row__meta">更新于 {pr.updatedLabel}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Button size="sm" variant="ghost">
                    加载更多
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="cx-split__detail">
          {selected ? (
            <>
              <header className="cx-detail__header">
                <span className="cx-detail__title">
                  {selected.repository} · #{selected.number}
                </span>
                <Button
                  aria-label="关闭 Pull Request 详情"
                  onClick={() => setSelectedId(null)}
                  size="2xs"
                  uniform
                  variant="ghost"
                >
                  <CodexX size={14} />
                </Button>
              </header>
              <div className="cx-detail__scroll">
                <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 500 }}>{selected.title}</h3>
                <div className="cx-detail__field">
                  <span className="cx-detail__label">状态</span>
                  <span>
                    <Badge tone={stateTone(selected)}>{PR_STATE_LABEL[selected.state]}</Badge>
                  </span>
                </div>
                <div className="cx-detail__field">
                  <span className="cx-detail__label">分支</span>
                  <span className="cx-detail__value">
                    <CodexBranch size={12} /> {selected.headBranch} → {selected.baseBranch}
                  </span>
                </div>
                <div className="cx-detail__field">
                  <span className="cx-detail__label">改动</span>
                  <span className="cx-detail__value">
                    {selected.changedFiles} 个文件 · +{selected.additions} / −{selected.deletions}
                  </span>
                </div>
                <div className="cx-detail__field">
                  <span className="cx-detail__label">检查</span>
                  <span className="cx-detail__value">
                    {selected.checks.failing > 0
                      ? `${selected.checks.failing} 项失败 · ${selected.checks.passing} 项通过`
                      : `${selected.checks.passing} 项通过${selected.checks.pending ? ` · ${selected.checks.pending} 项进行中` : ""}`}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button size="sm" variant="surface">
                    在 GitHub 中打开
                  </Button>
                  <Button size="sm" variant="ghost">
                    用 Focus 审查
                  </Button>
                  <Button size="sm" variant="ghost">
                    压缩并合并
                  </Button>
                </div>
                <section className="cx-detail__field">
                  <span className="cx-detail__label">变更</span>
                  <span className="cx-detail__value">
                    {selected.changedFiles > 0 ? `${selected.changedFiles} 个文件有改动` : "没有改动的文件"}
                  </span>
                </section>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <CodexCheck size={14} />
                  <span className="cx-muted">已同步 GitHub 上的最新提交</span>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              description="从左侧选一个 PR，就能看到分支、改动量与检查状态。"
              icon={CodexPullRequestOpen}
              title="选择要查看的 Pull Request"
            />
          )}
        </aside>
      </div>
    </div>
  );
}
