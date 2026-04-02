const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const yauzl = require("yauzl");
const mime = require("mime-types");
const os = require("os");
const si = require("systeminformation");

const {
  sessionMiddleware,
  requireAuth,
  requireAdmin,
  requireWrite,
  requireDelete,
  requireExecute,
  requirePathAccess,
  requirePathsAccess,
  setupAuthRoutes,
} = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(sessionMiddleware);

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

let terminal;
try {
  terminal = require("./terminal.js");
} catch (e) {
  console.warn("Terminal module not found, terminal features disabled");
  terminal = null;
}

const TEXT_EXTENSIONS = [
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".php", ".rb", ".go", ".rs", ".swift", ".kt", ".scala", ".sh",
  ".bat", ".ps1", ".sql", ".html", ".css", ".scss", ".less", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".conf", ".log", ".md", ".txt",
];

const isTextFile = (filePath, mimeType) => {
  const ext = path.extname(filePath).toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    ["application/json", "application/javascript", "application/xml"].includes(mimeType) ||
    TEXT_EXTENSIONS.includes(ext)
  );
};

const isMediaFile = (mimeType) =>
  mimeType.startsWith("image/") ||
  mimeType.startsWith("video/") ||
  mimeType.startsWith("audio/") ||
  mimeType === "application/pdf";

const getDirSize = async (dirPath) => {
  try {
    const files = await fs.readdir(dirPath);
    const stats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dirPath, file);
        try {
          const stat = await fs.stat(filePath);
          return stat.isDirectory() ? getDirSize(filePath) : stat.size;
        } catch {
          return 0;
        }
      }),
    );
    return stats.reduce((acc, size) => acc + size, 0);
  } catch {
    return 0;
  }
};


app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
);

app.get("/setup", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "setup.html"))
);

app.get("/auth.css", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "auth.css"))
);

setupAuthRoutes(app);

app.use(requireAuth);

app.use(express.static("public"));


/**
 * Returns the best default browse path for the current environment.
 * - Docker: /app/managed/home (the mounted host volume)
 * - Native: parent of os.homedir() — /Users on macOS, /home on Linux, etc.
 *   Works for any username automatically.
 */
function getDefaultBrowsePath() {
  if (fs.existsSync("/app/managed/home")) return "/app/managed/home";
  return os.homedir();
}

app.get("/", async (req, res) => {
  try {
    const html = await fs.readFile(
      path.join(__dirname, "public", "index.html"),
      "utf8"
    );
    const defaultPath = getDefaultBrowsePath();
    res.send(html.replace("%%DEFAULT_PATH%%", defaultPath));
  } catch (err) {
    res.status(500).send("Failed to load app");
  }
});

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get(
  "/api/files",
  requirePathAccess((req) => req.query.path),
  async (req, res) => {
    try {
      const dirPath = req.query.path || process.cwd();

      if (!(await fs.pathExists(dirPath))) {
        return res.status(404).json({ error: "Directory not found" });
      }

      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: "Path is not a directory" });
      }

      const items = await fs.readdir(dirPath);
      const fileList = await Promise.all(
        items.map(async (item) => {
          try {
            const itemPath = path.join(dirPath, item);
            const stats = await fs.stat(itemPath);
            return {
              name: item,
              path: itemPath,
              isDirectory: stats.isDirectory(),
              size: stats.size,
              modified: stats.mtime,
              permissions: stats.mode,
            };
          } catch (error) {
            return null;
          }
        }),
      );

      const validFiles = fileList.filter(Boolean).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ currentPath: dirPath, parent: path.dirname(dirPath), files: validFiles });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/upload",
  requireWrite,
  requirePathAccess((req) => req.body?.path),
  upload.array("files"),
  async (req, res) => {
    try {
      const targetPath = req.body.path || process.cwd();

      if (!req.files?.length) {
        return res.status(400).json({ error: "No files provided" });
      }
      if (!(await fs.pathExists(targetPath))) {
        return res.status(404).json({ error: "Target directory not found" });
      }

      const targetStat = await fs.stat(targetPath);
      if (!targetStat.isDirectory()) {
        return res.status(400).json({ error: "Target path is not a directory" });
      }

      const uploadedFiles = await Promise.all(
        req.files.map(async (file) => {
          const targetFilePath = path.join(targetPath, file.originalname);
          await fs.writeFile(targetFilePath, file.buffer);
          return { name: file.originalname, path: targetFilePath, size: file.size };
        }),
      );

      res.json({
        success: true,
        files: uploadedFiles,
        message: `Uploaded ${uploadedFiles.length} file(s) to ${targetPath}`,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/mkdir",
  requireWrite,
  requirePathAccess((req) => req.body?.path),
  async (req, res) => {
    try {
      const { name, path: dirPath } = req.body;
      const newDirPath = path.join(dirPath || process.cwd(), name);
      await fs.ensureDir(newDirPath);
      res.json({ success: true, path: newDirPath });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.delete(
  "/api/delete",
  requireDelete,
  requirePathsAccess((req) => req.body?.paths || []),
  async (req, res) => {
    try {
      const { paths } = req.body;
      await Promise.all(paths.map((filePath) => fs.remove(filePath)));
      res.json({ success: true, message: `Deleted ${paths.length} item(s)` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/copy",
  requireWrite,
  requirePathAccess((req) => req.body?.source),
  requirePathAccess((req) => req.body?.destination),
  async (req, res) => {
    try {
      const { source, destination } = req.body;
      await fs.copy(source, destination);
      res.json({ success: true, message: "Copied successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/move",
  requireWrite,
  requirePathAccess((req) => req.body?.source),
  requirePathAccess((req) => req.body?.destination),
  async (req, res) => {
    try {
      const { source, destination } = req.body;
      await fs.move(source, destination);
      res.json({ success: true, message: "Moved successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/save-file",
  requireWrite,
  requirePathAccess((req) => req.body?.path),
  async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      await fs.writeFile(filePath, content, "utf8");
      res.json({ success: true, message: "File saved successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/download",
  requirePathAccess((req) => req.query.path),
  async (req, res) => {
    try {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }
      if (!(await fs.pathExists(filePath))) {
        return res.status(404).json({ error: "File not found" });
      }

      const stats = await fs.stat(filePath);
      const fileName = path.basename(filePath);

      req.setTimeout(600000);
      res.setTimeout(600000);

      if (!stats.isDirectory()) {
        return res.download(filePath, fileName);
      }

      const dirSize = await getDirSize(filePath);
      const sizeInMB = dirSize / (1024 * 1024);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}.zip"`);

      const archive = archiver("zip", { zlib: { level: sizeInMB > 500 ? 3 : 6 } });
      archive.on("error", (err) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      archive.pipe(res);
      archive.directory(filePath, fileName);
      archive.finalize();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/archive",
  requireWrite,
  requirePathsAccess((req) => req.body?.paths || []),
  async (req, res) => {
    try {
      const { paths, archiveName } = req.body;
      const archivePath = path.join(process.cwd(), archiveName);

      const output = fs.createWriteStream(archivePath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        res.json({ success: true, path: archivePath, size: archive.pointer() });
      });

      archive.on("error", (err) => { throw err; });
      archive.pipe(output);

      for (const filePath of paths) {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          archive.directory(filePath, path.basename(filePath));
        } else {
          archive.file(filePath, { name: path.basename(filePath) });
        }
      }

      archive.finalize();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  "/api/extract",
  requireWrite,
  requirePathAccess((req) => req.body?.archivePath),
  requirePathAccess((req) => req.body?.extractPath),
  (req, res) => {
    try {
      const { archivePath, extractPath } = req.body;

      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) throw err;

        zipfile.readEntry();
        zipfile.on("entry", (entry) => {
          const entryPath = path.resolve(extractPath, entry.fileName);
          if (!entryPath.startsWith(path.resolve(extractPath) + path.sep) &&
              entryPath !== path.resolve(extractPath)) {
            zipfile.readEntry();
            return;
          }

          if (/\/$/.test(entry.fileName)) {
            fs.ensureDirSync(entryPath);
            zipfile.readEntry();
          } else {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err;
              fs.ensureDirSync(path.dirname(entryPath));
              readStream.pipe(fs.createWriteStream(entryPath));
              readStream.on("end", () => zipfile.readEntry());
            });
          }
        });

        zipfile.on("end", () => {
          res.json({ success: true, message: "Archive extracted successfully" });
        });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/api/file-content",
  requirePathAccess((req) => req.query.path),
  async (req, res) => {
    try {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }
      if (!(await fs.pathExists(filePath))) {
        return res.status(404).json({ error: "File not found" });
      }

      const stats = await fs.stat(filePath);
      const mimeType = mime.lookup(filePath) || "application/octet-stream";
      const fileName = path.basename(filePath);

      if (stats.size > 10 * 1024 * 1024) {
        return res.json({ error: "File too large for preview", mimeType, size: stats.size, fileName });
      }

      if (isTextFile(filePath, mimeType)) {
        try {
          const content = await fs.readFile(filePath, "utf8");
          res.json({ content, mimeType, type: "text", size: stats.size, fileName });
        } catch {
          res.json({ error: "Binary file - cannot display as text", mimeType, type: "binary", size: stats.size, fileName });
        }
      } else if (isMediaFile(mimeType)) {
        res.json({
          type: "media",
          mimeType,
          downloadUrl: `/api/download?path=${encodeURIComponent(filePath)}`,
          size: stats.size,
          fileName,
        });
      } else {
        res.json({ error: "Binary file - preview not supported", mimeType, type: "binary", size: stats.size, fileName });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get("/api/system-stats", async (req, res) => {
  try {
    const [cpu, mem, graphics, battery, diskLayout, networkStats, cpuTemp, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.graphics(),
      si.battery().catch(() => null),
      si.fsSize().catch(() => []),
      si.networkStats().catch(() => []),
      si.cpuTemperature().catch(() => ({})),
      si.time(),
    ]);

    const cpuLoad = Math.max(0, Math.min(100, Math.round(cpu.currentLoad || 0)));
    const memActualUsed = mem.total - mem.free - (mem.buffers || 0) - (mem.cached || 0);
    const memPercentage = Math.round((memActualUsed / mem.total) * 100);

    const primaryDisk = Array.isArray(diskLayout) && diskLayout.length > 0 ? diskLayout[0] : null;
    const totalDisk = Array.isArray(diskLayout) ? diskLayout.reduce((a, d) => a + (d.size || 0), 0) : 0;
    const usedDisk = Array.isArray(diskLayout) ? diskLayout.reduce((a, d) => a + (d.used || 0), 0) : 0;

    const activeNet = Array.isArray(networkStats)
      ? networkStats.find((n) => n.operstate === "up" && n.iface !== "lo") || networkStats[0]
      : null;

    res.json({
      cpu: {
        load: cpuLoad,
        cores: cpu.cpus?.length || os.cpus().length,
        speed: cpu.cpus?.[0] ? Math.round((cpu.cpus[0].speed / 1000) * 1000) / 1000 : null,
        temp: cpuTemp.main || null,
      },
      memory: {
        used: Math.round((memActualUsed / 1024 / 1024 / 1024) * 1000) / 1000,
        total: Math.round((mem.total / 1024 / 1024 / 1024) * 1000) / 1000,
        percentage: memPercentage,
        free: Math.round((mem.free / 1024 / 1024 / 1024) * 1000) / 1000,
      },
      gpu: graphics.controllers?.[0]
        ? {
            name: graphics.controllers[0].model || "Unknown GPU",
            memory: graphics.controllers[0].memoryTotal
              ? Math.round((graphics.controllers[0].memoryTotal / 1024) * 1000) / 1000
              : null,
            utilization: graphics.controllers[0].utilizationGpu !== null
              ? Math.max(0, Math.min(100, Math.round(graphics.controllers[0].utilizationGpu)))
              : null,
            temp: graphics.controllers[0].temperatureGpu || null,
          }
        : null,
      disk: primaryDisk
        ? {
            used: Math.round((usedDisk / 1024 / 1024 / 1024) * 10) / 10,
            total: Math.round((totalDisk / 1024 / 1024 / 1024) * 10) / 10,
            percentage: totalDisk > 0 ? Math.round((usedDisk / totalDisk) * 100) : 0,
          }
        : null,
      network: activeNet
        ? {
            down: Math.round(activeNet.rx_sec / 1024) || 0,
            up: Math.round(activeNet.tx_sec / 1024) || 0,
            iface: activeNet.iface,
          }
        : null,
      uptime: time.uptime || os.uptime(),
      os: { platform: os.platform(), hostname: os.hostname() },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.post("/api/shutdown", requireAdmin, (req, res) => {
  res.json({ success: true, message: "Server is shutting down..." });
  setTimeout(() => process.exit(0), 1000);
});

const server = app.listen(PORT, () => {
  console.log(`Specters running on http://localhost:${PORT}`);
});

if (terminal) {
  terminal(server);
  console.log("✓ Terminal functionality enabled");
} else {
  console.warn("⚠ Terminal functionality disabled (terminal.js not found)");
}
