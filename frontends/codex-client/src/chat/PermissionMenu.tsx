import { CodexPermissions } from "@/icons";
import { cn } from "@/lib/utils";

/**
 * Focus 的审批由服务端拦截策略控制，不支持按消息切换。
 * 保留原生芯片形态，但不伪装成可切换的本地开关。
 */
export function PermissionMenuChip({ className }: { className?: string }) {
  return (
    <span
      className={cn("cx-chip cx-chip--static", className)}
      data-composer-navigation-target="permissions"
      title="审批与拦截由 Focus 服务端策略控制"
    >
      <CodexPermissions size={16} />
      <span className="cx-chip__value">服务端策略</span>
    </span>
  );
}
