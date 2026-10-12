package agent

// 批 6 L1(设计文档 HONEYPOT-DETECTION-DESIGN.md 二·L1 + 「处置策略」表):
// 蜜罐静态签名识别层在 agent 侧的挂点与 planner 处置纪律。
// - evaluateHoneypot:service 资产落库后跑 honeydetect 签名评估,score>0 时
//   回写资产 honeypot_score/evidence(db.SetHoneypotScore,取更高分+证据去重),
//   并写一条 fact 进探索图锚定该资产(planner 每轮态势可见)。全部 best-effort,
//   失败不影响资产登记主流程。
// - plannerHoneypotRules:处置纪律,与批 5 红线同风格的代码固定尾(不可被 DB
//   正文覆盖),plannerSystem 统一追加。

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/honeydetect"
)

// plannerHoneypotRules 是 planner 的蜜罐处置纪律(设计文档「处置策略」表):
// 双信号才封锁,单信号只降级,疑似蜜罐上不投递/不爆破/不利用。
const plannerHoneypotRules = `

**蜜罐处置纪律(不可编辑)**:
1. 态势里的 honeypot_assets 是静态签名命中的疑似蜜罐资产,属【单信号】:对它们**降级交互**——只用被动/只读手段继续观察,**不投递工具/载荷、不爆破、不利用**;仅凭单信号不得封锁方向。
2. 只有【双信号命中】(静态签名 + 行为/登录后特征,如 /proc/meminfo 连读不变、ps 时间戳固定、egress 回连声称成功却无流量到达)才判定确认蜜罐,**停止在该方向派意图**;涉及反制型(MySQL 读客户端文件、客户端诱导)时,连客户端连接都不发起。
3. 疑似蜜罐资产上已有意图在跑的,让它以最低交互收尾,不追加高价值动作;侦察与利用资源优先投向无蜜罐信号的方向。
4. 全阴性【不等于】非蜜罐(高交互/加固蜜罐对自动化识别免疫):对无信号目标同样不投放高价值 exploit、控制噪声。`

// honeypotConfidence 把评分映射到处置档:≥0.9 high、≥0.6 medium(其余不记录)。
func honeypotConfidence(score float64) string {
	if score >= 0.9 {
		return "high"
	}
	return "medium"
}

// evaluateHoneypot 是 service 资产落库后的 L1 签名评分挂点(insert_assets 与
// httpx 回写同路径)。best-effort:任何失败都只影响蜜罐标记,不影响资产登记。
func (t *ToolSet) evaluateHoneypot(assetID int64, v honeydetect.ServiceView) {
	if assetID <= 0 {
		return
	}
	score, evidence := honeydetect.Evaluate(v)
	if score <= 0 {
		return
	}
	if t.as != nil {
		_ = t.as.SetHoneypotScore(assetID, score, evidence)
	}
	if t.ts == nil || t.taskID <= 0 {
		return
	}
	conf := honeypotConfidence(score)
	payload := map[string]any{
		"summary": fmt.Sprintf("疑似蜜罐资产 #%d:静态签名命中(score=%.2f, %s)", assetID, score, conf),
		"detail":  "命中签名: " + strings.Join(evidence, "; ") + "。处置:单信号只降级交互(被动/只读),不投递/不爆破/不利用;双信号命中才封锁方向。",
		// 签名匹配是对 banner/title/证书的直接观察 → observed;
		// honeypot_confidence 另记处置档(high/medium,评分映射)。
		"confidence":          FactConfidenceObserved,
		"honeypot_score":      score,
		"honeypot_confidence": conf,
		"honeypot_signatures": evidence,
	}
	_, _ = t.ts.AddNode(db.KindFact, payload, 5, "confirmed", t.worker, []int64{assetID})
}

// urlPort 从 URL 取端口(缺省按 scheme),取不到返回 0。
func urlPort(raw string) int {
	u, err := url.Parse(raw)
	if err != nil {
		return 0
	}
	if p := u.Port(); p != "" {
		var n int
		if _, err := fmt.Sscanf(p, "%d", &n); err == nil {
			return n
		}
		return 0
	}
	switch strings.ToLower(u.Scheme) {
	case "http":
		return 80
	case "https":
		return 443
	}
	return 0
}
