package db

import "database/sql"

// Settings is a tiny key-value store for global app config the UI toggles at
// runtime (e.g. traffic_capture). Missing keys fall back to caller defaults.

// GetSetting returns the stored value and ok=false when the key is unset.
func (d *DB) GetSetting(key string) (value string, ok bool, err error) {
	err = d.QueryRow(`SELECT value FROM settings WHERE key=$1`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

// SetSetting upserts a setting value.
func (d *DB) SetSetting(key, value string) error {
	_, err := d.Exec(`
INSERT INTO settings(key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, key, value)
	return err
}

// CompareAndSwapSetting updates one setting only when its current value equals
// expected. The comparison and write are one SQL statement, so concurrent
// refresh-token rotations cannot both consume the same record.
func (d *DB) CompareAndSwapSetting(key, expected, replacement string) (bool, error) {
	res, err := d.Exec(`
UPDATE settings SET value=$3, updated_at=now()
WHERE key=$1 AND value=$2`, key, expected, replacement)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

// ChangePassword atomically replaces the password hash and increments the
// credential version. The expected hash is compared while the password row is
// locked; a concurrent password change therefore fails instead of overwriting
// the newer hash or losing a version increment.
func (d *DB) ChangePassword(expectedHash, newHash string) (int64, bool, error) {
	tx, err := d.Begin()
	if err != nil {
		return 0, false, err
	}
	rollback := func(err error) (int64, bool, error) {
		_ = tx.Rollback()
		return 0, false, err
	}
	var current string
	err = tx.QueryRow(`SELECT value FROM settings WHERE key=$1 FOR UPDATE`, "auth.password_hash").Scan(&current)
	if err == sql.ErrNoRows || current != expectedHash {
		return rollback(nil)
	}
	if err != nil {
		return rollback(err)
	}
	var version int64
	err = tx.QueryRow(`
INSERT INTO settings(key, value) VALUES ('auth.key_version', '1')
ON CONFLICT (key) DO UPDATE SET value = (settings.value::bigint + 1), updated_at = now()
RETURNING value`).Scan(&version)
	if err != nil {
		return rollback(err)
	}
	if _, err := tx.Exec(`UPDATE settings SET value=$1, updated_at=now() WHERE key=$2`, newHash, "auth.password_hash"); err != nil {
		return rollback(err)
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return version, true, nil
}

// ClaimSetting writes value only while the key is absent or empty. PostgreSQL
// serializes the conflict check, so concurrent first-run initialization requests
// cannot overwrite each other's value.
func (d *DB) ClaimSetting(key, value string) (bool, error) {
	res, err := d.Exec(`
INSERT INTO settings(key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
WHERE settings.value = ''`, key, value)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// DeleteSetting removes a setting row; a missing key is not an error.
// (F6: refresh token 旋转/登出时删除哈希记录。)
func (d *DB) DeleteSetting(key string) error {
	_, err := d.Exec(`DELETE FROM settings WHERE key=$1`, key)
	return err
}

// GetBool returns the boolean setting, or def when unset/unparseable.
func (d *DB) GetBool(key string, def bool) bool {
	v, ok, err := d.GetSetting(key)
	if err != nil || !ok {
		return def
	}
	return v == "true" || v == "1"
}

// SetBool stores a boolean setting as "true"/"false".
func (d *DB) SetBool(key string, val bool) error {
	if val {
		return d.SetSetting(key, "true")
	}
	return d.SetSetting(key, "false")
}
