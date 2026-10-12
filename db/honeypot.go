package db

// 批 6 L1 蜜罐静态签名识别(HONEYPOT-DETECTION-DESIGN.md 二·L1):db 层只做
// 存取,签名匹配逻辑全部在 honeydetect 包。评分与证据由 server/agent 挂点在
// service 资产落库后写入;planner 注入与 UI 经这里读出。

import (
	"encoding/json"
	"fmt"
)

// SetHoneypotScore 写入资产的蜜罐评分与证据。重复评估取更高分,证据(JSON 数组
// 文本)合并去重;评分不升且证据无新增时不动行(幂等)。
func (s *AssetStore) SetHoneypotScore(assetID int64, score float64, evidence []string) error {
	if assetID <= 0 || score <= 0 {
		return nil
	}
	var curScore float64
	var curEvidence string
	if err := s.db.QueryRow(
		`SELECT honeypot_score, COALESCE(honeypot_evidence,'') FROM assets WHERE id = $1`,
		assetID).Scan(&curScore, &curEvidence); err != nil {
		return err
	}
	merged := MergeHoneypotEvidence(curEvidence, evidence)
	if score < curScore {
		score = curScore // 取更高分
	}
	if score == curScore && merged == curEvidence {
		return nil
	}
	_, err := s.db.Exec(
		`UPDATE assets SET honeypot_score = $2, honeypot_evidence = $3 WHERE id = $1`,
		assetID, score, merged)
	return err
}

// MergeHoneypotEvidence 把新命中证据合并进已有证据(JSON 数组文本),去重;
// 旧值不是合法 JSON 数组时按无旧值处理(不丢新证据)。
func MergeHoneypotEvidence(existing string, add []string) string {
	var items []string
	if existing != "" {
		_ = json.Unmarshal([]byte(existing), &items)
	}
	seen := map[string]bool{}
	for _, it := range items {
		seen[it] = true
	}
	for _, it := range add {
		if it == "" || seen[it] {
			continue
		}
		seen[it] = true
		items = append(items, it)
	}
	if len(items) == 0 {
		return ""
	}
	b, err := json.Marshal(items)
	if err != nil {
		return existing
	}
	return string(b)
}

// HoneypotAsset 是 planner 注入用的一行疑似蜜罐资产。
type HoneypotAsset struct {
	ID       int64
	Label    string // url,否则 host:port
	Score    float64
	Evidence string // JSON 数组文本
}

// HoneypotAssetsByTask 列出本任务 score>0 的资产,按评分降序,limit<=0 默认 20。
func (s *AssetStore) HoneypotAssetsByTask(taskID int64, limit int) ([]HoneypotAsset, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.Query(`
SELECT id, COALESCE(url,''), COALESCE(domain,''), COALESCE(ip,''), port,
       honeypot_score, COALESCE(honeypot_evidence,'')
FROM assets
WHERE $1 = ANY(task_ids) AND honeypot_score > 0
ORDER BY honeypot_score DESC, id DESC
LIMIT $2`, taskID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []HoneypotAsset
	for rows.Next() {
		var h HoneypotAsset
		var urlv, domain, ip string
		var port *int
		if err := rows.Scan(&h.ID, &urlv, &domain, &ip, &port, &h.Score, &h.Evidence); err != nil {
			return nil, err
		}
		switch {
		case urlv != "":
			h.Label = urlv
		case port != nil:
			host := domain
			if host == "" {
				host = ip
			}
			h.Label = fmt.Sprintf("%s:%d", host, *port)
		default:
			h.Label = domain
			if h.Label == "" {
				h.Label = ip
			}
		}
		out = append(out, h)
	}
	return out, rows.Err()
}
