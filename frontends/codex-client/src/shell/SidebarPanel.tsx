import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { artexApi } from "@/artex";
import type { ArtexConversation } from "@/artex/types";
import {
  CodexBell,
  CodexChevronDown,
  CodexNewChat,
  CodexPlusMd,
  CodexSearch,
  CodexWordmark,
  CodexX,
} from "@/icons";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEFAULT_SETTINGS_SECTION, filterSettingsNav, VISIBLE_SETTINGS_NAV_GROUPS } from "@/settings";
import { Input } from "@/ui";
import { pageLayoutFor } from "./page-layouts";
import { PanelSlotHost } from "./panel-slot";
import { openSearchDialog } from "./use-search-dialog";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useSidebar } from "./use-sidebar";
import "./sidebar-panel.css";

/**
 * 288px 对话面板。
 *
 * 实测几何（captures/blocks-sidebar.json，@1280×816）：
 *   面板本体      [52,44 **288**×768] bg `color-mix(in oklab, rgb(24,24,24) 65%, transparent)`
 *                 → 运行时序列化成 `oklab(0.209035 0 0 / 0.65)`；角 **12px 0 0 12px**
 *                 ⚠️ SPEC §3 把它换算成「rgb(45,45,45)@65%」是**错的**：
 *                    oklab L=0.209035 → sRGB **rgb(24,24,24)**（同一份 capture 里用户气泡
 *                    oklab(0.903646…) → rgb(223,223,223) 可互证换算方向）。
 *                    截图取色 ref-01-chat-home.png(200,400) = rgb(30,30,30)
 *                    = 0.65×#181818 + 0.35×#282828（外壳底色），也印证是 #181818。
 *   面板头        [52,44 288×**90**]   padding `0 8px`
 *     导航头      [68,44 264×52]       margin-left 8px  padding-right 4px
 *       应用名钮  [62,54 84.2×**32**] padding `0 6px`  margin-left -6px  gap 6px
 *                 r **12.5px** cs SE1.5；内容是 **Focus 字标 SVG 53.22×18**（不是文字）
 *       动作组    [268,56 60×28]       ms-auto  gap **4px** 两个 **28×28**（铃铛 / 放大镜）
 *                 色 rgba(255,255,255,.498)  r **9.375px** cs SE1.5
 *     新聊天钮    [60,96 **272×30**]   bg rgba(255,255,255,.08)  r 12.5px cs SE1.5
 *                 padding `5px 8px` gap 8px 字体 **13px/18.57/430**
 *   滚动区        [52,134 288×678]     padding `4px 0 8px`  gap **16px**
 *   分组          宽 288 padding `0 8px`
 *     标题行      [60,138 272×30]     padding `0 6px 0 8px`  gap 8px  justify-between
 *       标题钮    [64,140.5 254×25]   padding `2px 4px` margin-left -4px r 10px gap 4px
 *                 字体 **14px/21px/500** 色 rgba(255,255,255,.498)
 *       动作组    gap 4px 两个 **24×24** r 9.375px（hover/focus 才显形）
 *     会话行      [60,259 **272×30**] padding `5px 5px 5px 8px`  r 12.5px cs SE1.5
 *                 字体 13px/18.57/430；行内文字 **14px/20px/430** 色 #dfdfdf@85%
 *       行内动作  绝对定位 end-0 top-0 h-full padding-right 6px margin-right 2px
 *                 gap 8px 两个 **20×20** r 9999px（置顶 / 归档），默认 opacity 0
 *   resizer      [332,44 **16**×768] 内含 1px 手柄线
 */
/** 「设置里的一个窗口」型落地页：左栏保持设置导航，且不参与分区高亮。
 *  目前只有「控件库」（/controls，附加项，见 settings/nav-model.ts 的 ADDITIONAL_ITEMS）。 */
const SETTINGS_LANDING_PATHS = ["/controls"];
const ARTEX_TASK_LIST_PATHS = ["/function/tasks"];

export function SidebarPanel() {
  const { collapsed, effective, setState, setWidth, resetWidth, setResizing, width } = useSidebar();
  /**
   * 「最近」= **对话历史**（2026-10-20 用户：正在进行的会话在历史里找不到）。
   * 之前这里列的是 Focus **任务**（`/task/<id>`），所以 `/c/<id>` 起的对话永远不出现。
   * 任务有自己的左侧栏页（任务列表），不放这里。
   */
  const [conversations, setConversations] = useState<ArtexConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState("");
  const loadConversations = useCallback(async () => {
    try {
      setConversations(await artexApi.conversations());
      setConvError("");
    } catch (caught) {
      setConvError(caught instanceof Error ? caught.message : "对话列表加载失败");
    } finally {
      setConvLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadConversations();
    const onChanged = () => void loadConversations();
    window.addEventListener("artex:conversations-changed", onChanged);
    window.addEventListener("focus", onChanged);
    return () => {
      window.removeEventListener("artex:conversations-changed", onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, [loadConversations]);
  const conversationGroups = useMemo(() => {
    const time = (conversation: ArtexConversation) => {
      const ms = new Date(conversation.updated_at || conversation.created_at).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };
    const sorted = [...conversations].sort((left, right) => time(right) - time(left));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return {
      today: sorted.filter((conversation) => time(conversation) >= cutoff),
      earlier: sorted.filter((conversation) => time(conversation) < cutoff),
    };
  }, [conversations]);
  const navigate = useNavigate();
  const location = useLocation();
  // 路由一变就刷新一次：新建对话后跳 /c/<id>、或从别处回到列表，都不会停在旧快照。
  useEffect(() => {
    void location.pathname;
    void loadConversations();
  }, [location.pathname, loadConversations]);
  /**
   * /settings 下把「项目 / 最近」会话列表**换成设置分区导航**（官方设置页的左栏就是分区导航）。
   * 判据用 pathname 前缀而不是路由 hook：面板在 AppShell 里、不属于任何 Route 元素。
   */
  const isSettings =
    location.pathname === "/settings" ||
    location.pathname.startsWith("/settings/") ||
    location.pathname === "/system/settings" ||
    location.pathname.startsWith("/system/settings/") ||
    // 附加落地页（如「控件库」/controls）：它是**设置里的一个窗口**，左栏继续显示设置导航，
    // 不回落成会话列表（用户 2026-10-13 明确要求）。
    SETTINGS_LANDING_PATHS.includes(location.pathname);
  // task-28：`page` 档（官方 /scheduled）面板放页面自己的列表，不放会话列表
  const panelMode = pageLayoutFor(location.pathname).panel;
  const isArtexTaskList = ARTEX_TASK_LIST_PATHS.includes(location.pathname);
  const [settingsQuery, setSettingsQuery] = useState("");
  /* [task-58] 面板页头那个放大镜的展开态（官方 task-57：内联搜索胶囊，不是浮层）。 */
  const [pageSearchOpen, setPageSearchOpen] = useState(false);
  /* [task-61] 搜索胶囊里的词。官方 task-59 ② 实测「输入即过滤」：tas → 面板只剩 1 行、
     zzz / q → 0 行、无结果文案「没有匹配的任务」、清除按钮 aria-label「清空搜索」、
     Esc **一步折叠**（不先清空输入）且列表立即恢复完整。
     面板与页面（ScheduledPage）是**兄弟**、没有共同祖先可传 props（见 panel-slot.tsx 头注释）
     ⇒ 沿用本工程既有做法：走 DOM 事件桥把词送过去，由页面做可见行过滤。 */
  const [pageQuery, setPageQuery] = useState("");
  const pushPageQuery = (query: string) => {
    setPageQuery(query);
    window.dispatchEvent(
      new CustomEvent(isArtexTaskList ? "artex:tasks-search" : "codex:scheduled-search", {
        detail: { query },
      }),
    );
  };
  const collapsePageSearch = () => {
    setPageSearchOpen(false);
    /* 官方只实测了「Esc 一步折叠 + 列表恢复」；再点触发器收起时做同样处理（**未实测**）。 */
    pushPageQuery("");
  };
  const settingsGroups = useMemo(
    () => (isSettings ? filterSettingsNav(settingsQuery) : VISIBLE_SETTINGS_NAV_GROUPS),
    [isSettings, settingsQuery],
  );
  /**
   * 选中态。裸 `/settings`（没有 :section）时按**默认分区**高亮 ——
   * SettingsPage 自己也是回落到默认分区渲染的，导航不跟着高亮就会出现
   * 「页面显示常规、导航一条都不亮」。
   */
  const activeSettingsSlug =
    !isSettings || SETTINGS_LANDING_PATHS.includes(location.pathname)
      ? // 非分区落地页：不该有任何分区项高亮（「控件库」自己由 item.to 判高亮）
        ""
      : location.pathname.split("/")[2] || DEFAULT_SETTINGS_SECTION;

  const [openSections, setOpenSections] = useState({ recent: true });
  const dragRef = useRef<{ startX: number; startWidth: number; raw: number } | null>(null);

  /** 拖过头即收起：向左越过最小宽度 40px 就认定用户想收起 */
  const COLLAPSE_OVERSHOOT = 40;

  const onMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const raw = drag.startWidth + (event.clientX - drag.startX);
      drag.raw = raw;
      // 视觉上夹在区间内；真正的「越界」留给 pointerup 判定
      setWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, raw)));
    },
    [setWidth],
  );

  const onUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const shouldCollapse = drag.raw < SIDEBAR_MIN_WIDTH - COLLAPSE_OVERSHOOT;
    dragRef.current = null;
    setResizing(false);
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
    if (shouldCollapse) {
      resetWidth();
      setState("collapsed");
    }
  }, [onMove, resetWidth, setResizing, setState]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width, raw: width };
      setResizing(true);
      // 捕获阶段挂 window：宿主元素吞事件也能拿到
      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("pointercancel", onUp, true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* 捕获失败不影响：window 监听已经挂上 */
      }
    },
    [onMove, onUp, setResizing, width],
  );

  const onResizerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 32 : 8;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidth(width - step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidth(width + step);
      } else if (event.key === "Home") {
        event.preventDefault();
        resetWidth();
      }
    },
    [resetWidth, setWidth, width],
  );

  /** 一行对话：标题 + 更新时间提示；正在跑的对话右侧带一枚小圆点（与原来任务行同款） */
  const renderConversation = (conversation: ArtexConversation) => {
    const label = conversation.title?.trim() || "新对话";
    return (
      <NavLink
        className={({ isActive }) => cn("codex-panel__row", isActive && "is-active")}
        key={conversation.id}
        title={`${label} · ${formatRelativeTime(conversation.updated_at || conversation.created_at)}`}
        to={`/c/${conversation.id}`}
      >
        <span className="codex-panel__row-label">{label}</span>
        {conversation.running ? <span aria-hidden className="codex-panel__row-dot" /> : null}
      </NavLink>
    );
  };

  return (
    <aside
      aria-hidden={collapsed}
      className="codex-panel"
      data-panel-mode={panelMode}
      data-sidebar-panel=""
      data-state={effective}
      // [task-33] 收起 = 宽度压窄（对齐官方曲线）：内联宽度给 0，过渡在 sidebar-panel.css
      style={{ width: collapsed ? 0 : width }}
    >
      {isSettings ? (
        /* 设置态面板头（官方 `._header_cpwja_2` [52,44 288×96] padding 0 8px）：
             标题「设置」[68,58 260×24] 18px/600
             搜索框     [60,96 272×36] r 9999px bg rgba(255,255,255,.08) padding 0 12px 14px/430
           出处 docs/SPEC-SETTINGS.md §2（实测·DOM）。**没有** Focus 字标、铃铛、放大镜，也**没有**「新聊天」钮。 */
        <div className="codex-panel__settings-header">
          <h1 className="codex-panel__settings-title">设置</h1>
          <Input
            aria-label="搜索设置"
            className="codex-panel__settings-search"
            leading={<CodexSearch aria-hidden size={16} />}
            onChange={(event) => setSettingsQuery(event.target.value)}
            pill
            placeholder="搜索"
            size="lg"
            type="search"
            value={settingsQuery}
          />
        </div>
      ) : panelMode === "page" ? (
        /* 页面态面板头（官方 /scheduled 实测，**不是**会话态的 Focus 字标 + 新聊天）。
           ============================================================================
           出处：C:\artex-ymh\evidence\codex-desktop\captures\recon-official\official-scheduled-aside-geom.json
                （ctx.buildIdentity.asarSha256=11CEC09E…9F9C1）+ docs/RECON-OFFICIAL-PANELS.md §目标1
           祖先链（capture 的 chain，逐跳原文）：
             h1        [68,58  232×24]  min-w-0 flex-1 truncate font-openai-sans text-heading-sm leading-6 font-semibold text-default
             ↑ div     [68,44  264×52]  @container/navigation-header ms-2 flex h-[var(--sidebar-navigation-header-height…]
             ↑ div     [52,44  288×90]  _header_cpwja_2 …（padding 0 8px）⇒ 面板内边距 8px、整块 90px
             button    [60,96  272×30]  padding 5px 8px（占满内容宽，不是贴右小按钮）
             ↑ span    [92,100.5 232×21] text-fade-truncate  14px/430/21px
             ↑ div     [68,100.5 256×21] flex min-w-0 items-center gap-nav-row-content text-base
           ⇒ 文字 span 起点 92 = 按钮内容左缘 68 + **24px**（一个 16px 图标 + 8px 间距）；span 宽 232
             = 272 − 8×2(padding) − 16(图标) − 8(间距)（与实测自洽）。
             ⚠️ 该图标**本身未实测**（capture 的 needles 只按文案命中 4 条，没采到图标节点），
                只能确定它占 24px；这里用 CodexPlusMd(16) + gap 8，标注为未实测。
           ⇒ 标题行 y=58 = 44 + (52−24)/2（52px 行内垂直居中）。
           ★ [task-51] 上一轮那个「没采到的 28px 兄弟节点」= 行右端的**放大镜按钮**（task-48 实测 28×28 @300,56）：
             行内容宽 260 − h1 232 = 28 ✓ ⇒ h1 的 232 是 flex 分配出来的，不再钉死（见 CSS）。 */
        <div
          className="codex-panel__page-head"
          data-panel-page-head=""
          data-search-open={pageSearchOpen ? "" : undefined}
        >
          <div className="codex-panel__page-head-row">
            <h1 className="codex-panel__page-title">{isArtexTaskList ? "任务" : "定时任务"}</h1>
            {/* 放大镜（task-51）。官方 task-48 实测：
                  button[aria-label="搜索已安排的任务"] [300,56 **28×28**]，cls _Button_eg66f_2，
                  r 9.375px / cs SE1.5 / 色 rgba(255,255,255,.498) / 透明底 / tabIndex 0；
                  内部 svg._Icon_uttcz_1 **16×16 @[306,62]**（居中）；
                  外层还有一层 28×28 的 tooltip 宿主 div（flex gap-1 [--side-tooltip:bottom]）——
                  本工程没有对应 tooltip 机制 ⇒ **不造空 wrapper**（尺寸相同，不影响几何）。
                ⚠️ **图标形状未实测**：capture 只记了 aria-label 与几何，没取 svg 的 path。
                   这里用工程内既有的 CodexSearch（搬运自官方 magnifying-glass-lg-light-16）
                   **承接**，不声称与官方一致。
                ★ [task-58] 官方 task-57 采到了它的行为：**不是浮层**，而是在面板标题区**内联展开一个
                   搜索胶囊**（272×36 @60,96 / padding 0 12px / r 9999 / gap 8 / bg rgba(255,255,255,.08)），
                   输入框 224×18 @96,105（14px、placeholder「搜索已安排的任务」），
                   并把下方内容**整体下推 44px**（新建任务 96→140、分组标题 138.5→182.5、任务标题 173.67→217.67、
                   计划行 195→239、行内按钮 178→222）；触发器 aria-expanded false→true、图标变**蓝 rgb(102,181,255)**；
                   **Esc 与再点触发器**都能退出、位置精确复原。
                ★ [task-61] 官方 task-59 ② 采到了输入之后的行为 ⇒ 本实现已接上：即时过滤
                   （tas → 1 行 / zzz → 0 行）、无结果文案、清除按钮、Esc 一步折叠。
                   **仍未实测而刻意不做**：无结果时的上下键与回车键盘导航、贴底翻转、防抖量级。 */}
            <button
              aria-expanded={pageSearchOpen}
              aria-label={isArtexTaskList ? "搜索任务" : "搜索已安排的任务"}
              className="codex-panel__icon-button codex-panel__page-search-trigger"
              onClick={() => (pageSearchOpen ? collapsePageSearch() : setPageSearchOpen(true))}
              type="button"
            >
              <CodexSearch size={16} />
            </button>
          </div>
          {pageSearchOpen ? (
            <div className="codex-panel__page-search">
              <CodexSearch size={16} />
              {/* [task-61] 受控输入，每次输入**即时**上抛（官方防抖未分辨 ⇒ 不引入防抖）。
                  Esc = **一步折叠**：官方实测不先清空输入、直接折叠且列表立即恢复完整，
                  所以这里折叠的同时把过滤词复位，一次按键完成（不是「先清空、再折叠」两步）。 */}
              <input
                aria-label={isArtexTaskList ? "搜索任务" : "搜索已安排的任务"}
                className="codex-panel__page-search-input"
                onChange={(event) => pushPageQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") collapsePageSearch();
                }}
                placeholder={isArtexTaskList ? "搜索任务" : "搜索已安排的任务"}
                type="text"
                value={pageQuery}
              />
              {/* 清除按钮：官方实测 button[aria-label="清空搜索"] 存在（点它清空输入、列表恢复）。
                  ⚠️ 它的几何与图标形状官方**未采集**（capture 只给了 aria-label）⇒ 用工程内既有
                     CodexX 承接，尺寸按胶囊内小图标处理；出现时机取「输入框非空时」——
                     官方采到该按钮时输入框里是有词的。 */}
              {pageQuery ? (
                <button
                  aria-label="清空搜索"
                  className="codex-panel__page-search-clear"
                  onClick={() => pushPageQuery("")}
                  type="button"
                >
                  <CodexX size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="codex-panel__nav-list">
            {/* 点击行为复用**既有的新建任务入口**（同 ScheduledPage 主面空态里那个「新建任务」按钮：
                setDraftName("") → 打开右侧草稿详情），走 DOM 事件桥 —— 面板与页面是兄弟，读不到对方的 state
                （与 panel-slot.tsx 头注释里说明的同一限制）。 */}
            <button
              className="codex-panel__page-new"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(isArtexTaskList ? "artex:new-task" : "codex:new-scheduled-task"),
                )
              }
              type="button"
            >
              <CodexPlusMd size={16} />
              <span>{isArtexTaskList ? "创建 Focus 任务" : "新建任务"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="codex-panel__header">
          <div className="codex-panel__nav-header">
            {/* DOM 链照官方（FIDELITY-AUDIT #17 / [C08]）：
                  button.min-w-max > span._ButtonInner_（flex / center / gap 6）
                                     > span.truncate（font-openai-sans 18px/600/lh24）
                                       > span.flex.h-lh.w-max > svg 字标 53.22×18
                                     > svg chevron 16
               参考实现的字标资产包含旧品牌轮廓，产品化后改为用同一套界面字体渲染
               “Focus”。外层三个 span 保留原有布局深度和点击区域。 */}
            <button
              aria-label="切换模式，当前模式：Focus"
              className="codex-panel__mode"
              onClick={() => navigate("/new")}
              type="button"
            >
              <span className="codex-panel__mode-inner">
                <span className="codex-panel__mode-label">
                  <span className="codex-panel__mode-wordmark">
                    <CodexWordmark size={18} />
                  </span>
                </span>
                <CodexChevronDown size={16} />
              </span>
            </button>
            <div className="codex-panel__nav-actions">
              <button
                aria-label="查看活动"
                className="codex-panel__icon-button"
                onClick={() => window.dispatchEvent(new CustomEvent("codex:notifications"))}
                type="button"
              >
                <CodexBell size={16} />
              </button>
              <button
                aria-label="搜索"
                className="codex-panel__icon-button"
                onClick={openSearchDialog}
                type="button"
              >
                <CodexSearch size={16} />
              </button>
            </div>
          </div>

          <div className="codex-panel__nav-list">
            <NavLink className="codex-panel__new-chat" to="/new">
              <CodexNewChat size={20} />
              <span>新聊天</span>
            </NavLink>
          </div>
        </div>
      )}

      <div className={cn("codex-panel__scroll", isSettings && "codex-panel__scroll--settings")}>
        {!isSettings && panelMode === "page" ? <PanelSlotHost /> : null}
        {isSettings ? (
          /* 设置分区导航正文。几何一律以 docs/SPEC-SETTINGS.md §2/§3（实测·DOM）为准：
               滚动区 [52,140 288×672] padding `4px 8px 8px`，组间 gap 16px
               分组      [60,144 262×30]（标题）→ 标题下 gap 4 → 条目列表 gap 1px
               条目      [60,178 262×30] r 12.5 padding `5px 8px` 14px/400/21
               图标 x=68（= 条目 x 60 + padding 8）；文字 x=92（= 图标 16 + gap 8）
             ⚠️ 这里**没有复用 cx-settings 的 <SettingsNav />**：那个组件的形态是
             「自带搜索框 + 首组不渲染分组标题 + 上下 8px 内距」，与 §2 冲突
             （官方搜索框在**面板头**里、首组「个人」**有**标题），改它属于 cx-settings 的范围。
             数据仍走它们的 SETTINGS_NAV_GROUPS / filterSettingsNav，等它们出了带
             `showSearch`/`showFirstGroupTitle` 的变体再切回去。 */
          <>
            {settingsGroups.map((group) => (
              <div
                className="codex-panel__settings-group"
                data-additional={group.additional ? "" : undefined}
                key={group.id}
              >
                <h2 className="codex-panel__settings-group-title">{group.label}</h2>
                <nav aria-label={group.label} className="codex-panel__settings-list">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.to ? location.pathname === item.to : item.slug === activeSettingsSlug;
                    return (
                      <NavLink
                        aria-current={active ? "page" : undefined}
                        className={cn("codex-panel__settings-item", active && "is-active")}
                        key={item.slug}
                        title={item.description}
                        to={item.to ?? `/settings/${item.slug}`}
                      >
                        <span className="codex-panel__settings-item-icon">
                          <Icon aria-hidden size={16} />
                        </span>
                        <span className="codex-panel__settings-item-label">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              </div>
            ))}
            {settingsGroups.length === 0 ? <p className="codex-panel__empty">没有匹配的设置项</p> : null}
          </>
        ) : (
          <section className="codex-panel__section codex-panel__section--recent">
            <div className="codex-panel__section-head">
              <button
                aria-expanded={openSections.recent}
                className="codex-panel__section-toggle"
                onClick={() => setOpenSections((s) => ({ ...s, recent: !s.recent }))}
                type="button"
              >
                <span className="codex-panel__section-title">最近</span>
                {/* 「最近」标题右侧的折叠箭头。**证据：Lead 实机比对 ref-08-conversation.png**
                  （SPEC 未记录该元素）；「项目」分组没有，故只加在这一处。
                  展开/收起用 transform 旋转，做成「收起时朝右、展开时朝下」。 */}
                <CodexChevronDown
                  aria-hidden
                  className="codex-panel__section-chevron"
                  data-open={openSections.recent}
                  size={16}
                />
              </button>
            </div>
            {openSections.recent ? (
              <div className="codex-panel__nav-list codex-panel__nav-list--body">
                {convLoading && conversations.length === 0 ? (
                  <div className="codex-panel__empty">正在加载对话</div>
                ) : convError ? (
                  <div className="codex-panel__empty">{convError}</div>
                ) : conversationGroups.today.length + conversationGroups.earlier.length === 0 ? (
                  <div className="codex-panel__empty">还没有对话</div>
                ) : (
                  <>
                    {conversationGroups.today.map(renderConversation)}
                    {conversationGroups.earlier.map(renderConversation)}
                  </>
                )}
              </div>
            ) : null}
          </section>
        )}
      </div>

      {/* 分隔条：可拖拽改宽 + 双击复位 + ←→ 微调，即 WAI-ARIA 的 window splitter 模式。
          DOM 结构照官方参考端（captures/views-home.json，选择器 [class*=panel-resizer]）：
            div.group/panel-resizer（16 宽、pointer-events-none）
              └ div[role=separator].absolute.inset-0.cursor-col-resize
                  └ div.sidebar-resize-handle-line（1×768，bg `bg-border-strong`，默认 opacity-0）
          ⚠️ 我们这一层只做到「语义等价、非逐节点相同」：手柄是 <hr role=separator> 隐式语义、
            线是它的**兄弟**而不是子节点（官方是子节点）。两者的 flex + margin:auto 居中
            结果逐值相同（线都在 [339.5,44 1×768]，官方原始 rect 见 captures/tree-aside.json:134）。
          ★ 命中区（2026-10-11 修）：官方的手柄**元素自身** pointer-events 也是 none
            （captures/views-home.json:6643），真正可命中的是它 ::after 的**右半 8px**
            —— 我们此前漏抄这一半，导致真实鼠标 0 命中、拖不动。
            实现与出处全部写在 src/shell/sidebar-panel.css 的
            `.codex-panel__resizer-handle::after` 注释里（不改视觉，只加命中区）。
          ★ FIDELITY-AUDIT #24 / [C12]：手柄线 bg 必须是 --color-border-strong
            （= rgba(255,255,255,.156)），且**默认 opacity 0**；此前我们用 ::after + transparent，
            量到的是「无背景」，与参考端的 .157 差一半。 */}
      <div className="codex-panel__resizer" data-panel-resizer="">
        <hr
          aria-label="调整面板宽度"
          aria-orientation="vertical"
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuenow={width}
          className="codex-panel__resizer-handle"
          onDoubleClick={resetWidth}
          onKeyDown={onResizerKeyDown}
          onPointerDown={onPointerDown}
          tabIndex={0}
        />
        <span aria-hidden="true" className="sidebar-resize-handle-line" />
      </div>
    </aside>
  );
}
