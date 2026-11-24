import { useEffect, useState } from "react";

import { Button, Kbd } from "@/ui";
import {
  type AppCommand,
  COMMANDS,
  commandChord,
  findChordConflict,
  normalizeChord,
  resetAllCommandChords,
  setCommandCapture,
  setCommandChord,
  useCommandChords,
} from "../commands";
import type { SettingsPaneProps } from "./index";
import { PaneBanner, PaneCard, PaneEmpty, PaneRow, PaneSection, PaneShell } from "./pane-kit";

/**
 * 键盘快捷键（官方 slug keyboard-shortcuts）—— **真绑定**页。
 *
 * 只列 `../commands.ts` 里有实现的命令（每条都带 run()，由 AppShell 的 useCommandHost 分发）；
 * 之前的 34 行官方菜单复刻表已删除（那些键位没有分发器，改了不生效）。
 *
 * 交互：
 *   · 点键位胶囊 → 进入录制（全局捕获一次 keydown）→ 写入 localStorage `codex.commands`；
 *   · 与别的命令撞键位时**不写入**并给出警告（避免两个命令抢同一个键）；
 *   · 单行「恢复默认」/ 顶部「全部重置为默认值」。
 * 录制期间 `setCommandCapture(true)`，分发器让路（否则录 Ctrl+K 会当场打开搜索层）。
 */
export function ShortcutsPane({ section }: SettingsPaneProps) {
  const chords = useCommandChords();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [warning, setWarning] = useState("");

  // 录制：全局捕获一次 Esc 退出；其余键位交给下面的一次性监听
  useEffect(() => {
    if (!recordingId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingId(null);
        setCommandCapture(false);
        return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      const chord = normalizeChord(event);
      if (!chord) return;
      const conflict = findChordConflict(recordingId, chord, chords);
      if (conflict) {
        setWarning(`「${chord}」已被「${conflict.label}」占用，没有写入。先改掉那一条，或换一个组合键。`);
      } else {
        setCommandChord(recordingId, chord);
        setWarning("");
      }
      setRecordingId(null);
      setCommandCapture(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [chords, recordingId]);

  const startRecording = (command: AppCommand) => {
    setWarning("");
    setRecordingId(command.id);
    setCommandCapture(true);
  };

  const stopRecording = () => {
    setRecordingId(null);
    setCommandCapture(false);
  };

  const changedCount = Object.keys(chords).length;
  const groups: Array<AppCommand["group"]> = ["导航", "界面", "调试"];

  return (
    <PaneShell
      actions={
        <Button
          color="secondary"
          disabled={changedCount === 0}
          onClick={() => {
            stopRecording();
            resetAllCommandChords();
            setWarning("");
          }}
          size="sm"
          variant="soft"
        >
          全部重置为默认值
        </Button>
      }
      lede="这些键位真的会执行对应动作：点一下键位胶囊，然后按下新的组合键即可改绑。"
      section={section}
      title="键盘快捷键"
    >
      {warning ? <PaneBanner description={warning} title="没有写入这个键位" tone="warning" /> : null}
      {recordingId ? (
        <PaneBanner
          description="按下新的组合键完成改绑；按 Esc 取消。录制期间命令分发器让路，所以不会误触发。"
          title="正在录制…"
          tone="info"
        />
      ) : null}

      {groups.map((group) => {
        const rows = COMMANDS.filter((command) => command.group === group);
        if (rows.length === 0) return null;
        return (
          <PaneSection
            description={`${String(rows.length)} 条命令，全部有真实实现`}
            key={group}
            title={group}
          >
            <PaneCard>
              {rows.map((command) => {
                const chord = commandChord(command, chords);
                const overridden = chords[command.id] != null;
                const recording = recordingId === command.id;
                return (
                  <PaneRow
                    description={
                      <span>
                        {command.description}
                        {command.aliases?.length ? ` · 固定别名 ${command.aliases.join(" / ")}` : ""}
                        {overridden ? " · 已改绑" : ""}
                      </span>
                    }
                    key={command.id}
                    label={command.label}
                    control={
                      <div className="cx-pane__row-actions">
                        <button
                          aria-label={`${command.label}：${recording ? "请按下组合键" : chord || "未分配"}`}
                          className="cx-settings-hotkey"
                          data-recording={recording ? "" : undefined}
                          onClick={() => (recording ? stopRecording() : startRecording(command))}
                          type="button"
                        >
                          {recording ? (
                            <span className="cx-settings-hotkey__hint">按下…</span>
                          ) : chord ? (
                            <Kbd>{chord}</Kbd>
                          ) : (
                            <span className="cx-settings-hotkey__hint">未绑定</span>
                          )}
                        </button>
                        <Button
                          color="secondary"
                          disabled={!overridden}
                          onClick={() => setCommandChord(command.id, command.defaultChord)}
                          size="sm"
                          variant="ghost"
                        >
                          恢复默认
                        </Button>
                      </div>
                    }
                  />
                );
              })}
            </PaneCard>
          </PaneSection>
        );
      })}

      <PaneSection title="说明">
        <PaneCard>
          <PaneEmpty
            description="浏览器原生动作（撤销 / 复制 / 粘贴 / 全选）与窗口级动作（退出 / 关闭 / 全屏）不在表内：前者由浏览器负责，后者是 Electron 外壳的职责，绑定在这里不会生效。"
            title="没有列出的动作"
          />
        </PaneCard>
      </PaneSection>
    </PaneShell>
  );
}
