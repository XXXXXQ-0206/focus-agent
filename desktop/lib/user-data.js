const fs = require("node:fs");
const path = require("node:path");

/**
 * Move the pre-rename ARTEX profile to Focus. If Windows keeps a Chromium file
 * locked, keep using the legacy directory instead of silently starting fresh.
 */
function migrateLegacyUserData({ appData, current, legacy }, io = fs) {
  if (!appData || !current || !legacy || io.existsSync(current) || !io.existsSync(legacy)) {
    return { userDataPath: current, migrated: false, fallback: false };
  }
  try {
    io.renameSync(legacy, current);
    return { userDataPath: current, migrated: true, fallback: false };
  } catch (error) {
    return {
      userDataPath: legacy,
      migrated: false,
      fallback: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function legacyUserDataPath(appData) {
  return path.join(appData, "ARTEX");
}

module.exports = { legacyUserDataPath, migrateLegacyUserData };
