import { type ReactNode, useState } from "react";

import { CodexChevronDown, CodexRefresh } from "@/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTrigger,
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Kbd,
  KbdChord,
  RadioGroup,
  RadioItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  TooltipProvider,
  WithTooltip,
} from "@/ui";

import {
  SettingsBadge,
  SettingsButton,
  SettingsHotkeyButton,
  SettingsSecretInput,
  SettingsSegmented,
  SettingsSelect,
  SettingsSwitch,
  SettingsValueText,
} from "./controls";
import { SettingsSection } from "./SettingsRow";
import "./settings.css";
import "./controls-gallery.css";

/**
 * 控件库（/controls）—— 控件标本台（task-38 用户需求）。
 *
 * 用户口径（2026-10-15 两轮）：
 *   · 第一轮：「控件库是例外，不用遵循设置页面的样式」→ 曾改成独立页面壳 + 卡片网格；
 *   · 第二轮（现行）：「还是遵循设置页面的基本布局比如标题和页边距，**但是不需要卡片**」
 *     ⇒ 回到设置页的骨架（.cx-settings 标题带 + .cx-settings__column 的内容列与页边距），
 *       但标本**不用卡片**：每个分区下面是一串「名称 + 备注在左、控件在右」的素行，
 *       行间用发丝线分隔（照设置行的节奏，但不铺卡面底色、不画卡片边框）。
 *
 * 与设置分区的关系：它不是设置分区（nav-model 的 ADDITIONAL_ITEMS 里 `to: "/controls"`），
 * 左侧仍显示设置导航且「控件库」自己高亮（见 SidebarPanel 的落地页分支）。
 */

function Specimen({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <div className="cx-specimen-line">
      <span className="cx-specimen-line__text">
        <span className="cx-specimen-line__name">{name}</span>
        {note ? <span className="cx-specimen-line__note">{note}</span> : null}
      </span>
      <span className="cx-specimen-line__control">{children}</span>
    </div>
  );
}

export function ControlsGalleryPage() {
  const [select, setSelect] = useState("b");
  const [segmented, setSegmented] = useState("left");
  const [toggle, setToggle] = useState(true);
  const [plainToggle, setPlainToggle] = useState(false);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("one");
  const [secret, setSecret] = useState("sk-demo-not-a-real-key");
  const [hotkey, setHotkey] = useState("Ctrl+K");
  const [text, setText] = useState("");
  const [multiline, setMultiline] = useState("");

  return (
    <TooltipProvider>
      <div className="cx-settings" data-settings-section="controls">
        <div aria-hidden="true" className="codex-drag-region cx-settings__dragbar" />
        <div className="cx-settings__scroll">
          <div className="cx-settings__shell">
            <div className="cx-settings__page">
              <header className="cx-settings__header">
                <h1 className="cx-settings__title">控件库</h1>
                <SettingsBadge tone="warn">附加 · 官方无此分区</SettingsBadge>
              </header>
            </div>
          </div>
          <div className="cx-settings__page">
            <div className="cx-settings__column">
              <SettingsSection title="按钮">
                <div className="cx-specimen-list">
                  <Specimen name="主按钮" note="solid · color=primary">
                    <Button color="primary" size="md" variant="solid">
                      主操作
                    </Button>
                  </Specimen>
                  <Specimen name="次要按钮" note="solid · color=secondary">
                    <Button color="secondary" size="md" variant="solid">
                      次要
                    </Button>
                  </Specimen>
                  <Specimen name="柔和" note="soft（设置页默认档）">
                    <Button size="md" variant="soft">
                      柔和
                    </Button>
                  </Specimen>
                  <Specimen name="表面" note="surface（描边 + 底影）">
                    <Button size="md" variant="surface">
                      表面
                    </Button>
                  </Specimen>
                  <Specimen name="描边" note="outline">
                    <Button size="md" variant="outline">
                      描边
                    </Button>
                  </Specimen>
                  <Specimen name="幽灵" note="ghost（只有 hover 底）">
                    <Button size="md" variant="ghost">
                      幽灵
                    </Button>
                  </Specimen>
                  <Specimen name="危险" note="danger · soft">
                    <Button color="danger" size="md" variant="soft">
                      删除
                    </Button>
                  </Specimen>
                  <Specimen name="禁用" note="disabled">
                    <Button disabled size="md" variant="soft">
                      不可用
                    </Button>
                  </Specimen>
                  <Specimen name="图标钮" note="uniform · 28×28">
                    <Button aria-label="刷新" size="md" uniform variant="ghost">
                      <CodexRefresh size={16} />
                    </Button>
                  </Specimen>
                  <Specimen name="带提示" note="WithTooltip · 悬停 200ms">
                    <WithTooltip label="这是 Tooltip">
                      <Button size="md" variant="soft">
                        悬停试试
                      </Button>
                    </WithTooltip>
                  </Specimen>
                  <Specimen name="设置次要按钮" note="43×28 · 设置页规范">
                    <SettingsButton>次要按钮</SettingsButton>
                  </Specimen>
                </div>
              </SettingsSection>

              <SettingsSection title="选择器（两套口径并排）">
                <div className="cx-specimen-list">
                  <Specimen name="芯片（药丸）" note="输入区：药丸 · 默认透明 · 悬停出底">
                    <button className="cx-chip" type="button">
                      <CodexRefresh size={14} /> 芯片
                    </button>
                  </Specimen>
                  <Specimen name="模型芯片" note="输入区：同药丸口径">
                    <button className="cx-chip cx-chip--model" type="button">
                      5.6 Sol · Ultra <CodexChevronDown size={14} />
                    </button>
                  </Specimen>
                  <Specimen name="设置下拉" note="圆角矩形 10px · 毛玻璃 · 贴边发丝边">
                    <SettingsSelect
                      label="标本下拉"
                      onChange={setSelect}
                      options={[
                        { value: "a", label: "选项 A" },
                        { value: "b", label: "选项 B" },
                        { value: "c", label: "选项 C" },
                      ]}
                      value={select}
                    />
                  </Specimen>
                  <Specimen name="原生下拉" note="Radix Select · 选中项 = 右侧勾号">
                    <Select onValueChange={setSelect} value={select}>
                      <SelectTrigger aria-label="原生下拉">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a">选项 A</SelectItem>
                        <SelectItem value="b">选项 B</SelectItem>
                        <SelectItem value="c">选项 C</SelectItem>
                      </SelectContent>
                    </Select>
                  </Specimen>
                  <Specimen name="分段控件" note="高 23 · 药丸分段">
                    <SettingsSegmented
                      label="标本分段"
                      onChange={setSegmented}
                      options={[
                        { value: "left", label: "左" },
                        { value: "right", label: "右" },
                      ]}
                      value={segmented}
                    />
                  </Specimen>
                  <Specimen name="键帽" note="Kbd / KbdChord">
                    <span className="cx-specimen-line__row">
                      <Kbd>Ctrl</Kbd>
                      <Kbd>K</Kbd>
                      <KbdChord chord="Ctrl+Shift+X" />
                    </span>
                  </Specimen>
                  <Specimen name="快捷键录制" note="28×28 · 点一下改键（真监听）">
                    <SettingsHotkeyButton label="标本快捷键" onChange={setHotkey} value={hotkey} />
                  </Specimen>
                  <Specimen name="值文本" note="192×16 · 单行省略">
                    <SettingsValueText value="C:\Users\…\python.exe" />
                  </Specimen>
                </div>
              </SettingsSection>

              <SettingsSection title="输入">
                <div className="cx-specimen-list">
                  <Specimen name="输入框" note="Input（soft）">
                    <Input
                      aria-label="标本输入"
                      onChange={(event) => setText(event.target.value)}
                      placeholder="软输入框"
                      value={text}
                    />
                  </Specimen>
                  <Specimen name="文本域" note="Textarea（soft）">
                    <Textarea
                      aria-label="标本文本域"
                      onChange={(event) => setMultiline(event.target.value)}
                      placeholder="多行文本"
                      rows={3}
                      value={multiline}
                    />
                  </Specimen>
                  <Specimen name="密钥输入" note="可切换明文看一眼">
                    <SettingsSecretInput label="密钥" onChange={setSecret} value={secret} />
                  </Specimen>
                </div>
              </SettingsSection>

              <SettingsSection title="开关与勾选">
                <div className="cx-specimen-list">
                  <Specimen name="开关" note="32×20 · 选中蓝">
                    <Switch aria-label="标本开关" checked={plainToggle} onCheckedChange={setPlainToggle} />
                  </Specimen>
                  <Specimen name="设置开关" note="设置页开关（带标签）">
                    <SettingsSwitch checked={toggle} label="标本设置开关" onChange={setToggle} />
                  </Specimen>
                  <Specimen name="复选框" note="18×18 方框 + 勾">
                    <Checkbox
                      aria-label="标本复选框"
                      checked={checked}
                      onCheckedChange={(value) => setChecked(Boolean(value))}
                    />
                  </Specimen>
                  <Specimen name="单选" note="RadioGroup + RadioItem">
                    <RadioGroup onValueChange={setRadio} value={radio}>
                      <RadioItem label="甲" value="one" />
                      <RadioItem label="乙" value="two" />
                    </RadioGroup>
                  </Specimen>
                  <Specimen name="徽标" note="未实测 / 附加两种 tone">
                    <span className="cx-specimen-line__row">
                      <SettingsBadge>未实测</SettingsBadge>
                      <SettingsBadge tone="warn">附加 · 官方无此行</SettingsBadge>
                    </span>
                  </Specimen>
                </div>
              </SettingsSection>

              <SettingsSection title="菜单与浮层">
                <div className="cx-specimen-list">
                  <Specimen name="下拉菜单" note="菜单底 rgb(45,45,45) + 发丝影">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="soft">
                          打开菜单 <CodexChevronDown size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem>普通条目</DropdownMenuItem>
                        <DropdownMenuItem shortcut="Ctrl+K">带快捷键</DropdownMenuItem>
                        <DropdownMenuItem disabled>禁用条目</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Specimen>
                  <Specimen name="右键菜单" note="在按钮上右键唤出">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <Button size="sm" variant="soft">
                          右键我
                        </Button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem>复制</ContextMenuItem>
                        <ContextMenuItem>粘贴</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </Specimen>
                  <Specimen name="对话框" note="半径 15 · 标题带 50 高">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="soft">
                          打开对话框
                        </Button>
                      </DialogTrigger>
                      <DialogContent description="Body 16px 20px；Esc / 点遮罩关闭" title="对话框标本">
                        <p className="cx-specimen-line__note">这里是对话框正文。</p>
                      </DialogContent>
                    </Dialog>
                  </Specimen>
                  <Specimen name="确认框" note="危险操作二次确认">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button color="danger" size="sm" variant="soft">
                          危险确认
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent
                        description="确认框保留取消 / 确认两颗按钮。"
                        footer={
                          <>
                            <AlertDialogCancel asChild>
                              <Button size="sm" variant="ghost">
                                取消
                              </Button>
                            </AlertDialogCancel>
                            <AlertDialogAction asChild>
                              <Button color="danger" size="sm" variant="solid">
                                确认
                              </Button>
                            </AlertDialogAction>
                          </>
                        }
                        title="要执行这个危险操作吗？"
                      />
                    </AlertDialog>
                  </Specimen>
                </div>
              </SettingsSection>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
