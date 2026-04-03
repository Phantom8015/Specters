const bcrypt = require("bcrypt");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const { v4: uuidv4 } = require("uuid");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, ".secret");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const SALT_ROUNDS = 14;

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SESSIONS_DIR);

function getOrCreateSecret() {
  try {
    const existing = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (existing.length >= 64) return existing;
  } catch {}
  const secret = crypto.randomBytes(64).toString("hex");
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

const SESSION_SECRET = process.env.SESSION_SECRET || getOrCreateSecret();

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const data = fs.readJsonSync(USERS_FILE);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveUsers(users) {
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(USERS_FILE, users, { spaces: 2 });
}

const sessionMiddleware = session({
  store: new FileStore({
    path: SESSIONS_DIR,
    ttl: 86400,
    retries: 0,
    logFn: () => {},
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "specters.sid",
  cookie: {
    httpOnly: true,
    secure: process.env.HTTPS === "true",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

/**
 * Returns true when the user may access the given filesystem path.
 *
 * pathMode:
 *   "all"       — full access (admin default, or explicitly set)
 *   "allowlist" — only paths listed in allowedPaths
 *   "denylist"  — all paths EXCEPT those listed in deniedPaths
 */
function checkPathAccess(user, targetPath) {
  if (!targetPath) return false;
  if (user.role === "admin") return true;

  const pathMode =
    user.pathMode ||
    ((user.allowedPaths || []).includes("*") ? "all" : "allowlist");

  if (pathMode === "all") return true;

  const resolved = path.resolve(targetPath);

  if (pathMode === "denylist") {
    return !(user.deniedPaths || []).some((denied) => {
      const r = path.resolve(denied);
      return resolved === r || resolved.startsWith(r + path.sep);
    });
  }

  return (user.allowedPaths || []).some((allowed) => {
    const r = path.resolve(allowed);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
}

/**
 * Derive the effective permission set from role + terminalAccess flag.
 * Permissions are no longer stored as a free-form array — role is the
 * source of truth for file permissions; terminal is a separate toggle.
 */
function derivePermissions(role, terminalAccess) {
  if (role === "admin") return ["read", "write", "delete", "execute", "admin"];
  const perms = ["read"];
  if (role === "readwrite") perms.push("write", "delete");
  if (terminalAccess) perms.push("execute");
  return perms;
}

function hasPermission(user, perm) {
  if (user.role === "admin") return true;
  return (user.permissions || derivePermissions(user.role, false)).includes(
    perm,
  );
}

/**
 * Core auth guard.  Redirects unauthenticated browser requests to /login (or
 * /setup when no users exist yet).  Returns 401 JSON for API calls.
 */
function requireAuth(req, res, next) {
  const users = loadUsers();

  if (users.length === 0) {
    if (req.path.startsWith("/api/")) {
      return res
        .status(503)
        .json({ error: "Setup required", setupRequired: true });
    }
    return res.redirect("/setup");
  }

  if (!req.session || !req.session.userId) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/login");
  }

  const user = users.find((u) => u.id === req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Session invalid" });
    }
    return res.redirect("/login");
  }

  req.user = user;
  next();
}

/** Must be used after requireAuth. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required" });
  }
  next();
}

function requireWrite(req, res, next) {
  if (!hasPermission(req.user, "write")) {
    return res.status(403).json({ error: "Write permission required" });
  }
  next();
}

function requireDelete(req, res, next) {
  if (!hasPermission(req.user, "delete")) {
    return res.status(403).json({ error: "Delete permission required" });
  }
  next();
}

function requireExecute(req, res, next) {
  if (!hasPermission(req.user, "execute")) {
    return res.status(403).json({ error: "Terminal access denied" });
  }
  next();
}

/**
 * Factory: verifies the path extracted by `getPath(req)` is within the
 * authenticated user's allowed paths.
 */
function requirePathAccess(getPath) {
  return (req, res, next) => {
    const targetPath = getPath(req);
    if (!targetPath) return next();
    if (!checkPathAccess(req.user, targetPath)) {
      return res
        .status(403)
        .json({
          error: "Access denied: path outside your allowed directories",
        });
    }
    next();
  };
}

/**
 * Validates ALL paths in an array extracted by `getPaths(req)`.
 */
function requirePathsAccess(getPaths) {
  return (req, res, next) => {
    const paths = getPaths(req);
    if (!Array.isArray(paths) || paths.length === 0) return next();
    const denied = paths.find((p) => !checkPathAccess(req.user, p));
    if (denied) {
      return res
        .status(403)
        .json({
          error: "Access denied: path outside your allowed directories",
        });
    }
    next();
  };
}

function setupAuthRoutes(app) {
  app.post("/api/auth/setup", async (req, res) => {
    const users = loadUsers();
    if (users.length > 0) {
      return res.status(403).json({ error: "Setup already completed" });
    }

    const { username, password } = req.body;

    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length < 2 ||
      username.trim().length > 32
    ) {
      return res
        .status(400)
        .json({ error: "Username must be 2–32 characters" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      return res.status(400).json({
        error:
          "Username may only contain letters, numbers, underscores, and hyphens",
      });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = {
      id: uuidv4(),
      username: username.trim(),
      passwordHash,
      role: "admin",
      allowedPaths: ["*"],
      permissions: ["read", "write", "delete", "execute", "admin"],
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };

    await saveUsers([user]);

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      req.session.userId = user.id;
      res.json({ success: true });
    });
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const users = loadUsers();
    const user = users.find((u) => u.username === username);

    const hashToCompare =
      user?.passwordHash ||
      "$2b$14$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuuvwxyz012345";
    const passwordMatch = await bcrypt.compare(password, hashToCompare);
    const isValid = !!user && passwordMatch;

    if (!isValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      req.session.userId = user.id;

      user.lastLogin = new Date().toISOString();
      saveUsers(users).catch(console.error);

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions,
        },
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("specters.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      permissions: req.user.permissions,
      allowedPaths: req.user.allowedPaths,
    });
  });

  app.put("/api/auth/me/password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both passwords are required" });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
    }

    const users = loadUsers();
    const user = users.find((u) => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "Current password is incorrect" });

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await saveUsers(users);

    res.json({ success: true });
  });

  app.get("/api/auth/users", requireAuth, requireAdmin, (req, res) => {
    const users = loadUsers().map(({ passwordHash, ...u }) => u);
    res.json(users);
  });

  app.post("/api/auth/users", requireAuth, requireAdmin, async (req, res) => {
    const {
      username,
      password,
      role,
      terminalAccess,
      pathMode,
      allowedPaths,
      deniedPaths,
    } = req.body;

    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length < 2 ||
      username.trim().length > 32
    ) {
      return res
        .status(400)
        .json({ error: "Username must be 2–32 characters" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      return res.status(400).json({ error: "Invalid username format" });
    }
    if (!password || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }
    if (!["admin", "readwrite", "readonly"].includes(role)) {
      return res
        .status(400)
        .json({ error: "Role must be admin, readwrite, or readonly" });
    }
    const validPathModes = ["all", "allowlist", "denylist"];
    const resolvedPathMode = validPathModes.includes(pathMode)
      ? pathMode
      : "all";

    const users = loadUsers();
    if (users.find((u) => u.username === username.trim())) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const cleanPaths = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = {
      id: uuidv4(),
      username: username.trim(),
      passwordHash,
      role,
      permissions: derivePermissions(role, !!terminalAccess),
      pathMode: role === "admin" ? "all" : resolvedPathMode,
      allowedPaths:
        resolvedPathMode === "allowlist" ? cleanPaths(allowedPaths) : [],
      deniedPaths:
        resolvedPathMode === "denylist" ? cleanPaths(deniedPaths) : [],
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };

    users.push(newUser);
    await saveUsers(users);

    const { passwordHash: _, ...userResponse } = newUser;
    res.json({ success: true, user: userResponse });
  });

  app.put(
    "/api/auth/users/:id",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const {
        role,
        terminalAccess,
        pathMode,
        allowedPaths,
        deniedPaths,
        password,
      } = req.body;
      const users = loadUsers();
      const userIdx = users.findIndex((u) => u.id === req.params.id);

      if (userIdx === -1)
        return res.status(404).json({ error: "User not found" });

      const user = users[userIdx];

      if (role && role !== "admin" && user.role === "admin") {
        const adminCount = users.filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          return res
            .status(400)
            .json({ error: "Cannot demote the last administrator" });
        }
      }

      if (role && ["admin", "readwrite", "readonly"].includes(role)) {
        user.role = role;
      }

      if (role !== undefined || terminalAccess !== undefined) {
        const effectiveTerminal =
          terminalAccess !== undefined
            ? !!terminalAccess
            : (user.permissions || []).includes("execute");
        user.permissions = derivePermissions(user.role, effectiveTerminal);
      }

      const validPathModes = ["all", "allowlist", "denylist"];
      if (pathMode && validPathModes.includes(pathMode)) {
        const cleanPaths = (arr) =>
          (Array.isArray(arr) ? arr : [])
            .map((p) => (typeof p === "string" ? p.trim() : ""))
            .filter(Boolean);

        user.pathMode = user.role === "admin" ? "all" : pathMode;
        user.allowedPaths =
          pathMode === "allowlist" ? cleanPaths(allowedPaths) : [];
        user.deniedPaths =
          pathMode === "denylist" ? cleanPaths(deniedPaths) : [];
      }

      if (password) {
        if (password.length < 8)
          return res
            .status(400)
            .json({ error: "Password must be at least 8 characters" });
        user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      }

      await saveUsers(users);

      const { passwordHash, ...userResponse } = user;
      res.json({ success: true, user: userResponse });
    },
  );

  app.delete(
    "/api/auth/users/:id",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const users = loadUsers();
      const userIdx = users.findIndex((u) => u.id === req.params.id);

      if (userIdx === -1)
        return res.status(404).json({ error: "User not found" });

      if (users[userIdx].id === req.user.id) {
        return res
          .status(400)
          .json({ error: "You cannot delete your own account" });
      }

      if (users[userIdx].role === "admin") {
        const adminCount = users.filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          return res
            .status(400)
            .json({ error: "Cannot delete the last administrator" });
        }
      }

      users.splice(userIdx, 1);
      await saveUsers(users);
      res.json({ success: true });
    },
  );
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  requireAdmin,
  requireWrite,
  requireDelete,
  requireExecute,
  requirePathAccess,
  requirePathsAccess,
  checkPathAccess,
  setupAuthRoutes,
  loadUsers,
  SESSION_SECRET,
};
