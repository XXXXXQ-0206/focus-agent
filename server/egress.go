package server

// 批 5 B2(设计文档 HONEYPOT-DETECTION-DESIGN.md 二-B「自身防护」第 3 条):出口审查的
// 指纹装配。EgressGuard 是进程级单例(Manager.egress),每个任务的 Guard 在
// taskFromPG / agentGuard 里通过 SetEgress 引用同一份——所以这里只需在「启动」
// 与「LLM profile 变更」(applyLLM 是唯一漏斗)时向这一份注册/替换指纹,所有
// 任务(含已存在的)即时生效,无需逐任务注入。注册只存哈希(见 guard/egress.go),
// 本文件是原文唯一出现的地方,不日志、不落盘。

import (
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"regexp"
	"strings"

	"github.com/Autumn-27/artex/config"
)

// registerEgressFingerprints 把当前平台敏感信息注册进共享 EgressGuard:
// 激活 LLM profile 的 API key(变更时整体替换)、jwt.key 文件内容(原文/hex/base64
// 三种文本形态)、gate 入口路径、PG DSN 中的密码、config.json 的 callback_addr。
// 幂等:重复调用不产生重复指纹(guard.AddFingerprint 内部去重)。
func (s *Server) registerEgressFingerprints() {
	if s.m == nil || s.m.egress == nil {
		return
	}
	eg := s.m.egress
	// 激活 LLM profile 的 API key:profile 可能换了 key,先整类摘掉再注册当前值。
	eg.RemoveKind("llm_api_key")
	if s.m.pg != nil {
		if p, err := s.m.pg.ActiveProfile(); err == nil && p != nil {
			eg.AddFingerprint("llm_api_key", p.APIKey)
		}
	}
	// jwt.key:32 字节签名密钥,出现在命令文本里通常是原文/hex/base64 之一。
	if len(s.jwtKey) > 0 {
		eg.AddFingerprint("jwt_key", string(s.jwtKey))
		eg.AddFingerprint("jwt_key", hex.EncodeToString(s.jwtKey))
		eg.AddFingerprint("jwt_key", base64.StdEncoding.EncodeToString(s.jwtKey))
	}
	// gate 入口路径(反测绘门控的隐匿入口,泄漏即失效)。
	if s.gate != nil {
		eg.AddFingerprint("gate_path", s.gate.path)
	}
	// PG DSN 中的密码(env ARTEX_PG_DSN 或 config.json,与启动解析同一来源)。
	if dsn, _, err := config.PostgresDSN(); err == nil {
		eg.AddFingerprint("pg_password", dsnPassword(dsn))
	}
	// config.json 的 callback_addr(反弹 shell/隧道回连地址)。
	eg.AddFingerprint("callback_addr", config.CallbackAddr())
}

// dsnPassword 从 DSN 里取密码:兼容 URL 形态(postgres://user:pass@host/db)
// 与 keyword 形态(host=... password=...)。取不到返回空串(注册方会跳过)。
func dsnPassword(dsn string) string {
	if u, err := url.Parse(dsn); err == nil && u.User != nil {
		if pw, ok := u.User.Password(); ok {
			return pw
		}
	}
	if m := reKeywordPassword.FindStringSubmatch(dsn); m != nil {
		return strings.Trim(m[1], "'")
	}
	return ""
}

// reKeywordPassword 匹配 keyword 形态 DSN 的 password 段(值可单引号包裹)。
var reKeywordPassword = regexp.MustCompile(`(?:^|\s)password=('[^']*'|[^\s]+)`)
