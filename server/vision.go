package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

/**
 * 对话的「看图」步骤。
 *
 * 背景：agent SDK（norma 的 llm/agentcore）的消息模型只有 text / thinking / tool_use /
 * tool_result 四种块，没有 image 块（v0.3.8 与 v0.4.4 都没有），所以图片**没法**塞进
 * agent 的工具循环。但端点本身支持多模态（实测 deepseek-flash：image_url + data URL，
 * 64×64 纯红图问颜色 → 回答「红色」）。
 *
 * 做法：一轮对话开始前，如果用户消息带了图片附件，就用**同一份服务商配置**
 * （同样的 base_url / key / model / proxy）由服务端直接发一次 OpenAI 兼容的多模态请求，
 * 把图片转写成文本（可见文字原样抄录 + 视觉描述），再把这段文本附在用户消息后面交给
 * agent。像素是真的进过模型，agent 拿到的是模型的读图结果 —— 不是 OCR、也不是猜测。
 *
 * 边界（诚实标注）：
 *   · 只走 OpenAI 兼容的 /chat/completions；anthropic 协议暂不支持（返回明确原因）。
 *   · 每次最多 4 张、单张 ≤ 8 MiB（避免把一次对话变成巨型请求）。
 *   · 读图失败不阻断对话：原因会写进给 agent 的备注里，用户仍能看到自己的消息被处理。
 */

const (
	maxVisionImages     = 4
	maxVisionImageBytes = 8 << 20
)

type visionImage struct {
	Name string
	Path string // 绝对路径
	Size int64
}

// imageAttachments picks the image files out of a chat turn's attachments, resolving
// each to an absolute path **inside the chat working dir** (chatUpload sets Abs; older
// clients only send Path relative to it).
//
// Security: the message body is client-controlled, so both Abs and Path must be treated
// as untrusted. Only files under baseDir are accepted — otherwise a crafted
// `attachments:[{abs:"C:\\secret.png"}]` would make the server read arbitrary local
// images and ship them to the model provider.
func imageAttachments(atts []chatAttachment, baseDir string) []visionImage {
	root, err := filepath.Abs(baseDir)
	if err != nil {
		return nil
	}
	out := make([]visionImage, 0, len(atts))
	for _, a := range atts {
		candidate := strings.TrimSpace(a.Abs)
		if candidate == "" {
			candidate = filepath.Join(root, a.Path)
		}
		abs, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(root, abs)
		if err != nil || rel == "." || rel == ".." ||
			strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
			continue
		}
		if _, ok := imageMime(abs); !ok {
			continue
		}
		out = append(out, visionImage{Name: a.Name, Path: abs, Size: a.Size})
	}
	return out
}

func imageMime(path string) (string, bool) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		return "image/png", true
	case ".jpg", ".jpeg":
		return "image/jpeg", true
	case ".webp":
		return "image/webp", true
	case ".gif":
		return "image/gif", true
	default:
		return "", false
	}
}

// configForConversation resolves the provider config a conversation actually runs on:
// agent binding → conversation pin → global active. Mirrors resolveChatAgent.
func (s *Server) configForConversation(c *db.Conversation) (agent.Config, bool) {
	if eff := s.effectiveProfileForAgent(c.AgentKey, c.LLMProfileID); eff != nil {
		if cfg, ok := s.loadProfileConfig(*eff); ok {
			return cfg, true
		}
	}
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	if !s.llmOn || s.llmCfg.APIKey == "" {
		return agent.Config{}, false
	}
	return s.llmCfg, true
}

type visionContentPart struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	ImageURL *visionImageURL `json:"image_url,omitempty"`
}

type visionImageURL struct {
	URL string `json:"url"`
}

type visionMessage struct {
	Role    string             `json:"role"`
	Content []visionContentPart `json:"content"`
}

type visionRequest struct {
	Model       string          `json:"model"`
	Messages    []visionMessage `json:"messages"`
	MaxTokens   int             `json:"max_tokens"`
	Temperature float64         `json:"temperature"`
	Stream      bool            `json:"stream"`
}

type visionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func visionPrompt(question string) string {
	var b strings.Builder
	b.WriteString("你是视觉读取器。下面是用户这一轮的文字消息，以及他附带的图片。\n\n")
	b.WriteString("用户消息：\n")
	if strings.TrimSpace(question) == "" {
		b.WriteString("（本轮没有文字，只有图片）")
	} else {
		b.WriteString(question)
	}
	b.WriteString("\n\n请把图片中与这条消息相关的信息**客观、完整**地转写成文本：\n")
	b.WriteString("1) 原样抄录所有可见文字（界面、报错、代码、终端输出），保留换行与缩进；\n")
	b.WriteString("2) 描述关键视觉信息（颜色、图标、布局、图表数值）；\n")
	b.WriteString("3) 只写图片里真实存在的内容，不要编造，不要替用户作答。\n")
	return b.String()
}

// visionReadImages sends the images + question to an OpenAI-compatible endpoint and
// returns the model's textual reading. Empty when there is nothing to read.
func (s *Server) visionReadImages(ctx context.Context, cfg agent.Config, question string, images []visionImage) (string, error) {
	if len(images) == 0 {
		return "", nil
	}
	if cfg.Format != "openai" && cfg.Format != "openai-responses" {
		return "", fmt.Errorf("当前协议（%s）暂不支持直连读图，请改用 OpenAI 兼容协议的服务商", cfg.Format)
	}
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("该服务商没有填写 API 地址，无法直连读图")
	}
	endpoint := strings.TrimSuffix(baseURL, "/chat/completions")
	if !strings.HasSuffix(endpoint, "/v1") && !strings.Contains(endpoint, "/v1/") {
		// 兼容只填了根地址的网关：与 llm 适配器一致，补 /v1。
		endpoint += "/v1"
	}
	endpoint += "/chat/completions"

	parts := []visionContentPart{{Type: "text", Text: visionPrompt(question)}}
	names := make([]string, 0, len(images))
	for i, img := range images {
		if i >= maxVisionImages {
			break
		}
		mime, ok := imageMime(img.Path)
		if !ok {
			continue
		}
		// 客户端上报的 Size 不可信：先按上限流式读取，再按实际字节数判定。
		file, err := os.Open(img.Path)
		if err != nil {
			return "", fmt.Errorf("读取图片 %s 失败: %w", img.Name, err)
		}
		raw, readErr := io.ReadAll(io.LimitReader(file, maxVisionImageBytes+1))
		_ = file.Close()
		if readErr != nil {
			return "", fmt.Errorf("读取图片 %s 失败: %w", img.Name, readErr)
		}
		if len(raw) > maxVisionImageBytes {
			return "", fmt.Errorf("图片 %s 超过 %d MiB 上限", img.Name, maxVisionImageBytes>>20)
		}
		parts = append(parts, visionContentPart{
			Type:     "image_url",
			ImageURL: &visionImageURL{URL: "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)},
		})
		names = append(names, img.Name)
	}
	if len(names) == 0 {
		return "", fmt.Errorf("没有可读取的图片（支持 png / jpeg / webp / gif）")
	}

	// 推理模型（如 deepseek-flash）会先输出 reasoning 再输出正文，预算太小会把正文挤成空串。
	// 沿用档案的输出上限，但**给读图单独设下限**：档案里填 256/1024 这类小值同样会把正文挤没
	// （实测 1500 上限下复杂截图直接返回空 content）。
	const minVisionMaxTokens = 4096
	maxTokens := cfg.MaxTokens
	if maxTokens < minVisionMaxTokens {
		maxTokens = minVisionMaxTokens
	}
	body := visionRequest{
		Model:       cfg.Model,
		Messages:    []visionMessage{{Role: "user", Content: parts}},
		MaxTokens:   maxTokens,
		Temperature: 0,
		Stream:      false,
	}
	blob, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	transport := &http.Transport{}
	if p := strings.TrimSpace(cfg.Proxy); p != "" {
		if pu, err := url.Parse(p); err == nil {
			transport.Proxy = http.ProxyURL(pu)
		}
	}
	client := &http.Client{Transport: transport, Timeout: 120 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(blob))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	var parsed visionResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("读图响应不是 JSON（HTTP %d）: %s", resp.StatusCode, truncateForLog(string(raw), 300))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if parsed.Error != nil && parsed.Error.Message != "" {
			return "", fmt.Errorf("读图失败（HTTP %d）: %s", resp.StatusCode, parsed.Error.Message)
		}
		return "", fmt.Errorf("读图失败（HTTP %d）: %s", resp.StatusCode, truncateForLog(string(raw), 300))
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("读图没有返回内容")
	}

	var out strings.Builder
	out.WriteString("【用户附带的图片：由模型直接读图得到的内容】")
	for i, name := range names {
		fmt.Fprintf(&out, "\n\n<img %d · %s>\n", i+1, name)
	}
	out.WriteString("\n\n")
	out.WriteString(strings.TrimSpace(parsed.Choices[0].Message.Content))
	return out.String(), nil
}

// withVisionReading appends the model's image reading to the turn text the agent sees.
// A failed read never blocks the turn — the reason is carried along instead.
func (s *Server) withVisionReading(ctx context.Context, c *db.Conversation, msg string, images []visionImage) string {
	if len(images) == 0 {
		return msg
	}
	cfg, ok := s.configForConversation(c)
	if !ok {
		return msg + "\n\n【图片附件】当前没有可用的服务商配置，无法读图。"
	}
	reading, err := s.visionReadImages(ctx, cfg, msg, images)
	if err != nil {
		return msg + "\n\n【图片附件】读图失败：" + err.Error()
	}
	if strings.TrimSpace(reading) == "" {
		return msg
	}
	return msg + "\n\n" + reading
}

func truncateForLog(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
