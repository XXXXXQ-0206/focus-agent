import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import "@/styles/index.css";
import { ThemeProvider } from "@/app/theme-provider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  Kbd,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui";

import { SettingsNav } from "./SettingsNav";
import { SettingsPage } from "./SettingsPage";
import "./dev-preview.css";

/**
 * 设置页自测台（开发用，不进发行路由）。
 *
 * 为什么需要它：设置页的真实宿主是外壳主内容区，而外壳（cx-shell）与本模块并行开发。
 * 这里用 SPEC §3 的实测几何搭一个最小外壳：
 *   导轨 52 / 面板 288（[52,44] 起，圆角 12px 0 0 12px）/ 面板头 90 / 面板滚动区顶 y=134
 *   主内容面 [340,44 936×768] bg rgb(24,24,24) radius 0 12px 4px 0 / 视口顶 y=96
 * 于是「内容列 728 居中」应当落在 x=439（右侧 10px 被滚动条占掉，与参考端一致）。
 *
 * 左下角的「弹层自测台」不属于页面：只给测量脚本按 id 点开 dialog / menu / tooltip / popover /
 * alert-dialog，量它们的尺寸、圆角、阴影、模糊与键盘行为（SPEC §9）。
 */
document.documentElement.setAttribute("data-codex-window-type", "electron");
document.documentElement.setAttribute("data-codex-os", "win32");
document.documentElement.lang = "zh-CN";

const params = new URLSearchParams(window.location.search);
const section = params.get("section") ?? "general";

/** 弹层自测台：每个触发器都有稳定 id，供 CDP 脚本点击与量测 */
function OverlayLab() {
  return (
    <div className="lab" id="overlay-lab">
      <Dialog>
        <DialogTrigger asChild>
          <Button id="lab-dialog-trigger" size="sm" variant="outline">
            对话框
          </Button>
        </DialogTrigger>
        <DialogContent
          description="对话框几何自测：圆角 15px / 内边距 20px / 250–450px / 遮罩 #00000080"
          footer={
            <>
              <Button size="sm" variant="ghost">
                取消
              </Button>
              <Button size="sm" variant="solid">
                确定
              </Button>
            </>
          }
          title="确认操作"
        >
          <Input aria-label="名称" placeholder="名称" />
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id="lab-menu-trigger" size="sm" variant="outline">
            菜单
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem shortcut={<Kbd>Ctrl+N</Kbd>}>新聊天</DropdownMenuItem>
          <DropdownMenuItem shortcut={<Kbd>Ctrl+Shift+N</Kbd>}>新建临时聊天</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem shortcut={<Kbd>Ctrl+,</Kbd>}>设置</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button id="lab-tooltip-trigger" size="sm" variant="outline">
            提示
          </Button>
        </TooltipTrigger>
        <TooltipContent>这是一个 tooltip</TooltipContent>
      </Tooltip>

      <Popover>
        <PopoverTrigger asChild>
          <Button id="lab-popover-trigger" size="sm" variant="outline">
            浮层
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <div style={{ padding: 12 }}>Popover 内容</div>
        </PopoverContent>
      </Popover>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button id="lab-alert-trigger" size="sm" variant="outline">
            确认框
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent
          description="AlertDialog 与 Dialog 共用几何"
          footer={
            <Button size="sm" variant="solid">
              知道了
            </Button>
          }
          title="删除这条会话？"
        />
      </AlertDialog>

      <HoverCard>
        <HoverCardTrigger asChild>
          <Button id="lab-hover-trigger" size="sm" variant="outline">
            悬停卡
          </Button>
        </HoverCardTrigger>
        <HoverCardContent>
          <div style={{ padding: 12 }}>HoverCard 内容</div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

/** 控件自测台：给基础件量尺寸（不参与设置页几何） */
function ControlLab() {
  return (
    <div className="lab lab--controls" id="control-lab">
      <Switch aria-label="开关" defaultChecked id="lab-switch" />
      <Checkbox aria-label="勾选" defaultChecked id="lab-checkbox" />
      <RadioGroup defaultValue="a" style={{ flexDirection: "row" }}>
        <RadioItem label="甲" value="a" />
        <RadioItem label="乙" value="b" />
      </RadioGroup>
      <Select defaultValue="a">
        <SelectTrigger aria-label="选择" id="lab-select" style={{ minWidth: 120 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">甲</SelectItem>
          <SelectItem value="b">乙</SelectItem>
        </SelectContent>
      </Select>
      <Slider aria-label="滑杆" defaultValue={[40]} id="lab-slider" style={{ width: 120 }} />
      <Textarea aria-label="多行" id="lab-textarea" rows={2} style={{ width: 160 }} />
      <Spinner />
      <Skeleton style={{ width: 60, height: 12 }} />
      <Separator orientation="vertical" style={{ height: 20 }} />
      <Kbd id="lab-kbd">Ctrl+C</Kbd>
    </div>
  );
}

function Harness() {
  return (
    <div className="harness">
      <div className="harness__rail" />
      <aside className="harness__panel">
        <div className="harness__panel-head" />
        <div className="harness__panel-scroll">
          <div className="harness__panel-section">
            <SettingsNav />
          </div>
        </div>
      </aside>
      <main className="harness__surface">
        <div className="harness__surface-header" />
        <div className="harness__surface-viewport" data-scroll-root>
          <SettingsPage />
        </div>
      </main>
      <OverlayLab />
      <ControlLab />
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("dev-preview.html 缺少 #root");

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[`/settings/${section}`]}>
          <Routes>
            <Route element={<Harness />} path="/settings/:section" />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
