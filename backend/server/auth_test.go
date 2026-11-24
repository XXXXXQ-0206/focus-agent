package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// memKV 是 authKV 的内存实现,F6 的 auth 测试不依赖 PostgreSQL。
type memKV struct {
	mu  sync.Mutex
	m   map[string]string
	err error // 注入存储错误,验证 fail-closed
}

type blockingRefreshKV struct {
	*memKV
	target  string
	ready   chan struct{}
	release chan struct{}
	mu      sync.Mutex
	seen    int
}

func (k *blockingRefreshKV) GetSetting(key string) (string, bool, error) {
	if key == k.target {
		k.mu.Lock()
		k.seen++
		if k.seen == 2 {
			close(k.ready)
		}
		k.mu.Unlock()
		<-k.release
	}
	return k.memKV.GetSetting(key)
}

func newMemKV() *memKV { return &memKV{m: map[string]string{}} }

func (k *memKV) GetSetting(key string) (string, bool, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.err != nil {
		return "", false, k.err
	}
	v, ok := k.m[key]
	return v, ok, nil
}

func (k *memKV) SetSetting(key, value string) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.err != nil {
		return k.err
	}
	k.m[key] = value
	return nil
}

func (k *memKV) ClaimSetting(key, value string) (bool, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.err != nil {
		return false, k.err
	}
	if current := k.m[key]; current != "" {
		return false, nil
	}
	k.m[key] = value
	return true, nil
}

func (k *memKV) CompareAndSwapSetting(key, expected, replacement string) (bool, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.err != nil {
		return false, k.err
	}
	if current, ok := k.m[key]; !ok || current != expected {
		return false, nil
	}
	k.m[key] = replacement
	return true, nil
}

func (k *memKV) ChangePassword(expectedHash, newHash string) (int64, bool, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.err != nil {
		return 0, false, k.err
	}
	if k.m[authPassKey] != expectedHash {
		return 0, false, nil
	}
	version := int64(0)
	if raw := k.m[authKeyVersionKey]; raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return 0, false, err
		}
		version = parsed
	}
	version++
	k.m[authPassKey] = newHash
	k.m[authKeyVersionKey] = strconv.FormatInt(version, 10)
	return version, true, nil
}

func (k *memKV) DeleteSetting(key string) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.err != nil {
		return k.err
	}
	delete(k.m, key)
	return nil
}

var testJWTKey = []byte("0123456789abcdef0123456789abcdef")

func TestAccessTokenVersionRevocation(t *testing.T) {
	kv := newMemKV()
	s := &Server{jwtKey: testJWTKey, authkv: kv}

	tok, err := signJWT(testJWTKey, 0)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if !s.validAccessToken(tok) {
		t.Fatal("fresh token (ver 0, unset setting) should validate")
	}

	// 改密 → 版本 +1 → 旧 token 立即失效
	if err := kv.SetSetting(authKeyVersionKey, "1"); err != nil {
		t.Fatalf("set version: %v", err)
	}
	if s.validAccessToken(tok) {
		t.Fatal("token signed under old version must be rejected after bump")
	}

	// 新版本签发的 token 通过
	tok2, err := signJWT(testJWTKey, 1)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if !s.validAccessToken(tok2) {
		t.Fatal("token signed under current version should validate")
	}

	// 错 key / 篡改直接拒
	if s.validAccessToken(tok2 + "x") {
		t.Fatal("tampered token must be rejected")
	}
	other, err := signJWT([]byte("fedcba9876543210fedcba9876543210"), 1)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if s.validAccessToken(other) {
		t.Fatal("token signed with a different key must be rejected")
	}

	// 存储错误 fail-closed
	kv.err = errTest
	if s.validAccessToken(tok2) {
		t.Fatal("version read failure must fail closed")
	}
	kv.err = nil

	// 无持久层时只做签名+过期校验(降级路径)
	s2 := &Server{jwtKey: testJWTKey}
	if !s2.validAccessToken(tok2) {
		t.Fatal("nil store should fall back to signature/expiry validation")
	}
}

var errTest = &testError{"injected store error"}

type testError struct{ s string }

func (e *testError) Error() string { return e.s }

func TestRefreshTokenLifecycle(t *testing.T) {
	kv := newMemKV()

	rt, err := issueRefreshToken(kv, 0)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if len(rt) < 40 {
		t.Fatalf("refresh token too short: %d chars", len(rt))
	}
	// 落库的是哈希,不是原文
	if _, ok, _ := kv.GetSetting(refreshSettingKey(rt)); ok {
		t.Fatal("refresh token must be stored hashed, not in clear")
	}
	if _, ok := validateRefreshToken(kv, rt, 0); !ok {
		t.Fatal("fresh refresh token should validate")
	}
	// 未知 token / 版本不符 一律拒
	if _, ok := validateRefreshToken(kv, rt+"x", 0); ok {
		t.Fatal("unknown refresh token must be rejected")
	}
	if _, ok := validateRefreshToken(kv, rt, 1); ok {
		t.Fatal("refresh token from old version must be rejected after bump")
	}

	// 旋转(滑动续期):旧票作废,新票有效且过期时间重置
	before := time.Now().Add(refreshTTL).Unix()
	if err := kv.DeleteSetting(refreshSettingKey(hashRefreshToken(rt))); err != nil {
		t.Fatalf("rotate delete: %v", err)
	}
	if _, ok := validateRefreshToken(kv, rt, 0); ok {
		t.Fatal("rotated-out refresh token must be rejected (replay protection)")
	}
	rt2, err := issueRefreshToken(kv, 0)
	if err != nil {
		t.Fatalf("reissue: %v", err)
	}
	rec, ok := validateRefreshToken(kv, rt2, 0)
	if !ok {
		t.Fatal("rotated refresh token should validate")
	}
	if rec.Exp < before {
		t.Fatalf("sliding renewal should reset expiry: got %d, want >= %d", rec.Exp, before)
	}
}

func TestRefreshTokenExpiry(t *testing.T) {
	kv := newMemKV()
	rt, err := issueRefreshToken(kv, 0)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	// 手动把记录改成已过期
	expired, _ := json.Marshal(refreshRecord{Exp: time.Now().Add(-time.Hour).Unix(), Ver: 0})
	if err := kv.SetSetting(refreshSettingKey(hashRefreshToken(rt)), string(expired)); err != nil {
		t.Fatalf("set: %v", err)
	}
	if _, ok := validateRefreshToken(kv, rt, 0); ok {
		t.Fatal("expired refresh token must be rejected")
	}
}

func TestSSETicketSingleUseAndExpiry(t *testing.T) {
	store := &sseTicketStore{}
	tok, err := store.issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if !store.consume(tok) {
		t.Fatal("first consume should succeed")
	}
	if store.consume(tok) {
		t.Fatal("second consume must fail (one-time use)")
	}
	if store.consume("nonexistent") {
		t.Fatal("unknown ticket must fail")
	}

	// 过期票据:直接往 map 里塞一个已过期的
	tok2, err := store.issue()
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	store.mu.Lock()
	store.m[tok2] = time.Now().Add(-time.Second)
	store.mu.Unlock()
	if store.consume(tok2) {
		t.Fatal("expired ticket must fail")
	}
}

func TestRequireAuthTicketPath(t *testing.T) {
	kv := newMemKV()
	s := &Server{jwtKey: testJWTKey, authkv: kv}
	ok := false
	h := s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		ok = true
		w.WriteHeader(200)
	}))

	// 无凭证 → 401
	r := httptest.NewRequest("GET", "/api/anything", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 401 {
		t.Fatalf("no credentials: want 401, got %d", rec.Code)
	}

	// ?token= 已移除 → 401
	tokJWT, _ := signJWT(testJWTKey, 0)
	r = httptest.NewRequest("GET", "/api/anything?token="+tokJWT, nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 401 {
		t.Fatalf("?token= must no longer authenticate: got %d", rec.Code)
	}

	// Bearer → 200
	r = httptest.NewRequest("GET", "/api/anything", nil)
	r.Header.Set("Authorization", "Bearer "+tokJWT)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 200 || !ok {
		t.Fatalf("bearer: want 200, got %d (ok=%v)", rec.Code, ok)
	}

	// 一次性 ticket 只用于已知 SSE GET；不能访问普通 API 或 mutation。
	ticket, err := s.tickets.issue()
	if err != nil {
		t.Fatalf("issue ticket: %v", err)
	}
	r = httptest.NewRequest("GET", "/api/tasks?ticket="+ticket, nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("ticket on ordinary API: want 401, got %d", rec.Code)
	}
	r = httptest.NewRequest("POST", "/api/logs/stream?ticket="+ticket, nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("ticket on mutation: want 401, got %d", rec.Code)
	}
	r = httptest.NewRequest("GET", "/api/logs/stream?ticket="+ticket, nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("ticket on stream: want 200, got %d", rec.Code)
	}
	r = httptest.NewRequest("GET", "/api/logs/stream?ticket="+ticket, nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("ticket replay: want 401, got %d", rec.Code)
	}

	// /api/auth/* 豁免
	r = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader("{}"))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != 200 {
		t.Fatalf("/api/auth/* must be exempt: got %d", rec.Code)
	}
}

func TestAuthInitClaimIsAtomicAndFailClosed(t *testing.T) {
	kv := newMemKV()
	s := &Server{jwtKey: testJWTKey, authkv: kv}

	const attempts = 4
	start := make(chan struct{})
	codes := make(chan int, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			body := fmt.Sprintf(`{"password":"password-%d"}`, i)
			rec := httptest.NewRecorder()
			s.authInit(rec, httptest.NewRequest(http.MethodPost, "/api/auth/init", strings.NewReader(body)))
			codes <- rec.Code
		}(i)
	}
	close(start)
	wg.Wait()
	close(codes)

	successes := 0
	for code := range codes {
		if code == http.StatusOK {
			successes++
		} else if code != http.StatusForbidden {
			t.Fatalf("concurrent init: unexpected status %d", code)
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent init: got %d successes, want exactly 1", successes)
	}

	failing := newMemKV()
	failing.err = errTest
	rec := httptest.NewRecorder()
	(&Server{jwtKey: testJWTKey, authkv: failing}).authInit(
		rec,
		httptest.NewRequest(http.MethodPost, "/api/auth/init", strings.NewReader(`{"password":"secret"}`)),
	)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("init storage failure: want 500, got %d", rec.Code)
	}
	if _, ok := failing.m[authPassKey]; ok {
		t.Fatal("failed claim must not persist a password")
	}
}

func TestAuthLoginIsRateLimited(t *testing.T) {
	kv := newMemKV()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := kv.SetSetting(authPassKey, string(hash)); err != nil {
		t.Fatal(err)
	}
	s := &Server{jwtKey: testJWTKey, authkv: kv}
	for i := 0; i < authAttemptLimit; i++ {
		rec := httptest.NewRecorder()
		s.authLogin(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"Focus","password":"wrong"}`)))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: want 401, got %d", i+1, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	s.authLogin(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"Focus","password":"correct-password"}`)))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("over-limit login: want 429, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("429 response must include Retry-After")
	}
}

func cookieFor(tok string) *http.Cookie {
	return &http.Cookie{Name: refreshCookieName, Value: tok}
}

func TestAuthRefreshEndpoint(t *testing.T) {
	kv := newMemKV()
	s := &Server{jwtKey: testJWTKey, authkv: kv}

	rt, err := issueRefreshToken(kv, 0)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	r := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	r.AddCookie(cookieFor(rt))
	rec := httptest.NewRecorder()
	s.authRefresh(rec, r)
	if rec.Code != 200 {
		t.Fatalf("refresh: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || out["token"] == nil {
		t.Fatalf("refresh response should carry a new access token: %v %v", err, out)
	}
	// 响应同时下发旋转后的 refresh cookie
	found := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == refreshCookieName && c.Value != "" {
			found = true
			if !c.HttpOnly || c.Path != refreshCookiePath {
				t.Fatalf("refresh cookie attrs: HttpOnly=%v Path=%q", c.HttpOnly, c.Path)
			}
		}
	}
	if !found {
		t.Fatal("refresh must rotate the cookie")
	}
	// 旧票已作废
	if _, ok := validateRefreshToken(kv, rt, 0); ok {
		t.Fatal("old refresh token must be invalidated after rotation")
	}

	// 无 cookie → 401
	rec = httptest.NewRecorder()
	s.authRefresh(rec, httptest.NewRequest("POST", "/api/auth/refresh", nil))
	if rec.Code != 401 {
		t.Fatalf("no cookie: want 401, got %d", rec.Code)
	}
}

func TestAuthRefreshRotationIsSingleUse(t *testing.T) {
	base := newMemKV()
	rt, err := issueRefreshToken(base, 0)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	kv := &blockingRefreshKV{
		memKV:   base,
		target:  refreshSettingKey(hashRefreshToken(rt)),
		ready:   make(chan struct{}),
		release: make(chan struct{}),
	}
	s := &Server{jwtKey: testJWTKey, authkv: kv}

	results := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
			r.AddCookie(cookieFor(rt))
			rec := httptest.NewRecorder()
			s.authRefresh(rec, r)
			results <- rec.Code
		}()
	}
	select {
	case <-kv.ready:
	case <-time.After(time.Second):
		t.Fatal("refresh requests did not reach the shared validation point")
	}
	close(kv.release)
	wg.Wait()
	close(results)

	successes := 0
	for code := range results {
		if code == http.StatusOK {
			successes++
		} else if code != http.StatusUnauthorized {
			t.Fatalf("concurrent refresh: unexpected status %d", code)
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent refresh successes=%d, want exactly 1", successes)
	}
}

func TestPasswordChangeCASIsSingleUse(t *testing.T) {
	kv := newMemKV()
	if err := kv.SetSetting(authPassKey, "old-hash"); err != nil {
		t.Fatal(err)
	}
	const attempts = 2
	results := make(chan struct {
		version int64
		changed bool
		err     error
	}, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			version, changed, err := kv.ChangePassword("old-hash", fmt.Sprintf("new-hash-%d", i))
			results <- struct {
				version int64
				changed bool
				err     error
			}{version, changed, err}
		}(i)
	}
	wg.Wait()
	close(results)
	successes := 0
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		if result.changed {
			successes++
			if result.version != 1 {
				t.Fatalf("successful change version=%d, want 1", result.version)
			}
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent password changes=%d, want exactly 1", successes)
	}
	if got, ok, err := kv.GetSetting(authKeyVersionKey); err != nil || !ok || got != "1" {
		t.Fatalf("credential version=%q present=%v err=%v, want 1", got, ok, err)
	}
}

func TestAuthLogoutRevokes(t *testing.T) {
	kv := newMemKV()
	s := &Server{jwtKey: testJWTKey, authkv: kv}
	rt, err := issueRefreshToken(kv, 0)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	r := httptest.NewRequest("POST", "/api/auth/logout", nil)
	r.AddCookie(cookieFor(rt))
	rec := httptest.NewRecorder()
	s.authLogout(rec, r)
	if rec.Code != 200 {
		t.Fatalf("logout: want 200, got %d", rec.Code)
	}
	if _, ok := validateRefreshToken(kv, rt, 0); ok {
		t.Fatal("logout must revoke the refresh token")
	}
	// cookie 被清
	cleared := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == refreshCookieName && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Fatal("logout must clear the refresh cookie")
	}
}
