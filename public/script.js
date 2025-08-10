let fitAddon;
if (window.FitAddon) {
  fitAddon = new window.FitAddon.FitAddon();
}

let terminal,
  termSocket,
  terminalMinimized = false,
  terminalVisible = true;
let terminalFontSize = 11;
let isResizing = false;

function openTerminal() {
  try {
    if (
      window.settingsManager &&
      window.settingsManager.settings &&
      window.settingsManager.settings.layoutMode === "explorer-only"
    ) {
      return;
    }
  } catch (_) {}
  if (!window.Terminal) {
    alert("Terminal library not loaded.");
    return;
  }

  const terminalWrapper = document.getElementById("terminal-container-wrapper");

  terminalWrapper.classList.remove("hidden");
  terminalVisible = true;

  startSystemStatsUpdates();

  if (terminalMinimized && terminal) {
    terminalMinimized = false;

    if (terminalWrapper.dataset.restoredHeight) {
      terminalWrapper.style.height = terminalWrapper.dataset.restoredHeight;
      delete terminalWrapper.dataset.restoredHeight;
    }

    if (fitAddon) {
      setTimeout(() => fitAddon.fit(), 100);
    }
    terminal.focus();
    return;
  }

  terminalMinimized = false;

  if (!terminal) {
    terminal = new window.Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      theme: {
        background: "#12141b",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#12141b",
        black: "#12141b",
        red: "#ff5370",
        green: "#4caf50",
        yellow: "#ffcb6b",
        blue: "#64a0ff",
        magenta: "#c792ea",
        cyan: "#89ddff",
        white: "#d4d4d4",
        brightBlack: "#434758",
        brightRed: "#ff5370",
        brightGreen: "#4caf50",
        brightYellow: "#ffcb6b",
        brightBlue: "#64a0ff",
        brightMagenta: "#c792ea",
        brightCyan: "#89ddff",
        brightWhite: "#ffffff",
      },
      fontFamily: "SF Pro, JetBrains Mono, Fira Code, SF Mono, monospace",
      fontSize: terminalFontSize,
      fontWeight: 400,
      letterSpacing: 0.3,
      lineHeight: 1.4,
    });

    terminal.open(document.getElementById("terminal-container"));

    if (fitAddon) {
      terminal.loadAddon(fitAddon);
      setTimeout(() => {
        fitAddon.fit();
        terminal.focus();
      }, 100);

      const terminalContainer = document.getElementById("terminal-container");
      const resizeObserver = new ResizeObserver(() => {
        if (terminal && fitAddon) {
          fitAddon.fit();
        }
      });
      resizeObserver.observe(terminalContainer);

      terminal._resizeObserver = resizeObserver;
    } else {
      terminal.focus();
    }

    if (termSocket) termSocket.close();
    termSocket = new WebSocket(`ws://${window.location.host}/terminal`);
    termSocket.onopen = () => {
      console.log("Terminal WebSocket connected");

      try {
        const settings = window.settingsManager?.settings || {};
        const { startupPath, startupCommand } = settings;
        if (startupPath) {
          window.fileExplorer?.setCurrentPath?.(startupPath);
          termSocket.send(`cd "${startupPath}"\r`);
        }
        if (startupCommand) {
          termSocket.send(`${startupCommand}\r`);
        }
      } catch (_) {}

      terminal.focus();
    };
    termSocket.onmessage = (e) => {
      terminal.write(e.data);
    };
    termSocket.onclose = () => {
      console.log("Terminal WebSocket disconnected");
      terminal.write("\r\n\x1b[31m[Disconnected]\x1b[0m\r\n");
    };
    termSocket.onerror = (error) => {
      console.error("Terminal WebSocket error:", error);
      terminal.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");
    };
    terminal.onData((data) => {
      if (termSocket && termSocket.readyState === 1) {
        console.log("Sending data to terminal:", data.length, "bytes");
        termSocket.send(data);
      }
    });
  } else {
    if (fitAddon) {
      setTimeout(() => {
        fitAddon.fit();
        terminal.focus();
      }, 100);
    } else {
      terminal.focus();
    }
  }
}

function closeTerminal() {
  console.log("Terminal close button removed");
}

function initializeTerminalResize() {
  const resizeHandle = document.getElementById("terminal-resize-handle");
  const terminalWrapper = document.getElementById("terminal-container-wrapper");
  const mainContent = document.querySelector(".main-content");
  let isResizing = false;
  let startX, startY, initialWidth, initialHeight;

  resizeHandle.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;

    const computedStyle = window.getComputedStyle(terminalWrapper);
    initialWidth = parseInt(computedStyle.width);
    initialHeight = parseInt(computedStyle.height);

    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
    e.preventDefault();

    if (resizeHandle.classList.contains("resize-left")) {
      document.body.style.cursor = "ew-resize";
    } else {
      document.body.style.cursor = "ns-resize";
    }

    terminalWrapper.style.userSelect = "none";
    document.body.style.userSelect = "none";
  });

  function handleResize(e) {
    if (!isResizing) return;

    if (resizeHandle.classList.contains("resize-left")) {
      const deltaX = startX - e.clientX;
      const newWidth = Math.max(
        200,
        Math.min(window.innerWidth * 0.8, initialWidth + deltaX),
      );
      terminalWrapper.style.flex = "none";
      terminalWrapper.style.width = `${newWidth}px`;
    } else {
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(
        150,
        Math.min(window.innerHeight * 0.7, initialHeight + deltaY),
      );
      terminalWrapper.style.height = `${newHeight}px`;
    }

    if (terminal && fitAddon) {
      clearTimeout(terminal._fitTimeout);
      terminal._fitTimeout = setTimeout(() => {
        fitAddon.fit();
      }, 16);
    }
  }

  function stopResize() {
    isResizing = false;
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);

    document.body.style.cursor = "";
    terminalWrapper.style.userSelect = "";
    document.body.style.userSelect = "";

    if (terminal && fitAddon) {
      setTimeout(() => fitAddon.fit(), 50);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeTerminalResize();

  setTimeout(() => openTerminal(), 500);
});

class FileExplorer {
  constructor() {
    this.currentPath = "/home/";
    this.selectedFiles = new Set();
    this.clipboard = { items: [], operation: null };
    this.history = ["/home/"];
    this.historyIndex = 0;
    this.cache = new Map();
    this.cacheTimeout = 10000;
    this.progressSource = null;
    this.currentSessionId = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadFiles(this.currentPath);
  }

  bindEvents() {
    document
      .getElementById("back-btn")
      .addEventListener("click", () => this.goBack());
    document
      .getElementById("forward-btn")
      .addEventListener("click", () => this.goForward());
    document
      .getElementById("up-btn")
      .addEventListener("click", () => this.goUp());
    document
      .getElementById("refresh-btn")
      .addEventListener("click", () => this.refresh());
    document.getElementById("cd-btn").addEventListener("click", () => {
      console.log("CD button clicked");
      this.cdToPath();
    });
    document.getElementById("path-input").addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.cdToPath();
    });

    document
      .getElementById("new-folder-btn")
      .addEventListener("click", () => this.createFolder());
    document
      .getElementById("upload-btn")
      .addEventListener("click", () => this.uploadFiles());
    document
      .getElementById("preview-btn")
      .addEventListener("click", () => this.previewSelected());
    document
      .getElementById("download-btn")
      .addEventListener("click", () => this.downloadSelected());
    document
      .getElementById("copy-btn")
      .addEventListener("click", () => this.copySelected());
    document
      .getElementById("cut-btn")
      .addEventListener("click", () => this.cutSelected());
    document
      .getElementById("paste-btn")
      .addEventListener("click", () => this.pasteClipboard());
    document
      .getElementById("delete-btn")
      .addEventListener("click", () => this.deleteSelected());
    document
      .getElementById("shutdown-btn")
      ?.addEventListener("click", () => this.shutdownServer());

    document
      .getElementById("file-input")
      .addEventListener("change", this.handleFileUpload.bind(this));

    this.initializeDragAndDrop();
    this.initializeContextMenu();
    this.initializeModals();

    document.addEventListener("keydown", this.handleKeyboard.bind(this));
  }

  initializeDragAndDrop() {
    const dropZone = document.getElementById("drop-zone");
    const fileList = document.getElementById("file-list");

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      fileList.addEventListener(eventName, this.preventDefaults, false);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      fileList.addEventListener(
        eventName,
        () => dropZone.classList.add("active"),
        false,
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      fileList.addEventListener(
        eventName,
        () => dropZone.classList.remove("active"),
        false,
      );
    });

    fileList.addEventListener("drop", this.handleDrop.bind(this), false);
  }

  initializeContextMenu() {
    const contextMenu = document.getElementById("context-menu");
    const fileList = document.getElementById("file-list");

    fileList.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const fileItem = e.target.closest(".file-item");
      if (fileItem && !fileItem.classList.contains("selected")) {
        this.clearSelection();
        this.selectFile(fileItem);
      }

      contextMenu.style.left = e.pageX + "px";
      contextMenu.style.top = e.pageY + "px";
      contextMenu.classList.remove("hidden");

      const menuRect = contextMenu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth) {
        contextMenu.style.left =
          Math.max(0, window.innerWidth - menuRect.width - 10) + "px";
      }
      if (menuRect.bottom > window.innerHeight) {
        contextMenu.style.top =
          Math.max(0, window.innerHeight - menuRect.height - 10) + "px";
      }
    });

    document.addEventListener("click", () =>
      contextMenu.classList.add("hidden"),
    );

    contextMenu.addEventListener("click", (e) => {
      const action = e.target.closest(".context-item")?.dataset.action;
      if (action) {
        this.handleContextAction(action);
        contextMenu.classList.add("hidden");
      }
    });
  }

  refresh() {
    this.loadFiles(this.currentPath, true);
    this.clearSelection();
    this.updateToolbar();
  }

  initializeModals() {
    document.querySelectorAll(".modal-close").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        e.target.closest(".modal").classList.add("hidden"),
      );
    });

    document
      .getElementById("save-file-btn")
      .addEventListener("click", this.saveFile.bind(this));

    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
      });
    });
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async loadFiles(path, skipCache = false) {
    if (!skipCache && this.cache.has(path)) {
      const cached = this.cache.get(path);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        this.currentPath = cached.data.currentPath;
        this.updatePathInput();
        this.renderFiles(cached.data.files);
        this.clearSelection();
        this.updateHistory(path);
        this.updateToolbar();
        return;
      } else {
        this.cache.delete(path);
      }
    }

    this.showLoading(true);

    try {
      const sessionId =
        "load_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

      const response = await fetch(
        `/api/files?path=${encodeURIComponent(path)}&sessionId=${sessionId}`,
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      this.cache.set(path, { data: data, timestamp: Date.now() });

      if (this.cache.size > 50) {
        this.cache.delete(this.cache.keys().next().value);
      }

      this.currentPath = data.currentPath;
      this.updatePathInput();

      if (window.settingsManager) {
        window.settingsManager.renderFiles(data.files);
      } else {
        this.renderFiles(data.files);
      }

      this.clearSelection();
      this.updateHistory(path);
      this.updateToolbar();
    } catch (error) {
      this.showNotification(error.message, "error");
    } finally {
      this.showLoading(false);
    }
  }

  updatePathInput() {
    document.getElementById("path-input").value = this.currentPath;
  }

  renderFiles(files) {
    const fileList = document.getElementById("file-list");
    fileList.innerHTML = "";
    files.forEach((file) => fileList.appendChild(this.createFileItem(file)));
  }

  createFileItem(file) {
    const item = document.createElement("div");
    item.className = "file-item";
    item.dataset.path = file.path;
    item.dataset.isDirectory = file.isDirectory;

    const icon = file.isDirectory
      ? '<i class="fas fa-folder folder"></i>'
      : '<i class="fas fa-file file"></i>';
    const size = file.isDirectory ? "-" : this.formatFileSize(file.size);
    const date = new Date(file.modified).toLocaleString();
    const permissions = this.formatPermissions(file.permissions);

    item.innerHTML = `
            <div class="file-name">${icon}<span>${file.name}</span></div>
            <div class="file-size">${size}</div>
            <div class="file-date">${date}</div>
            <div class="file-permissions">${permissions}</div>
        `;

    item.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) this.toggleFileSelection(item);
      else if (e.shiftKey && this.selectedFiles.size > 0)
        this.selectFileRange(item);
      else {
        this.clearSelection();
        this.selectFile(item);
      }
    });

    item.addEventListener("dblclick", () => {
      if (file.isDirectory) this.loadFiles(file.path);
      else this.openFile(file.path);
    });

    return item;
  }

  selectFile(item) {
    item.classList.add("selected");
    this.selectedFiles.add(item.dataset.path);
    this.updateToolbar();
  }

  toggleFileSelection(item) {
    if (item.classList.contains("selected")) {
      item.classList.remove("selected");
      this.selectedFiles.delete(item.dataset.path);
    } else {
      item.classList.add("selected");
      this.selectedFiles.add(item.dataset.path);
    }
    this.updateToolbar();
  }

  selectFileRange(endItem) {
    const items = Array.from(document.querySelectorAll(".file-item"));
    const selectedItems = Array.from(
      document.querySelectorAll(".file-item.selected"),
    );
    if (selectedItems.length === 0) return;

    const startIndex = items.indexOf(selectedItems[0]);
    const endIndex = items.indexOf(endItem);
    const [minIndex, maxIndex] = [
      Math.min(startIndex, endIndex),
      Math.max(startIndex, endIndex),
    ];

    this.clearSelection();
    for (let i = minIndex; i <= maxIndex; i++) this.selectFile(items[i]);
  }

  clearSelection() {
    document
      .querySelectorAll(".file-item.selected")
      .forEach((item) => item.classList.remove("selected"));
    this.selectedFiles.clear();
    this.updateToolbar();
  }

  updateToolbar() {
    const hasSelection = this.selectedFiles.size > 0;
    const hasClipboard = this.clipboard.items.length > 0;
    const hasSingleFileSelection =
      this.selectedFiles.size === 1 &&
      !document.querySelector(
        `[data-path="${Array.from(this.selectedFiles)[0]}"]`,
      )?.dataset.isDirectory;

    document.getElementById("preview-btn").disabled = !hasSingleFileSelection;
    document.getElementById("download-btn").disabled = !hasSelection;
    document.getElementById("copy-btn").disabled = !hasSelection;
    document.getElementById("cut-btn").disabled = !hasSelection;
    document.getElementById("paste-btn").disabled = !hasClipboard;
    document.getElementById("delete-btn").disabled = !hasSelection;
  }

  updateHistory(path) {
    if (this.history[this.historyIndex] !== path) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(path);
      this.historyIndex = this.history.length - 1;
    }

    document.getElementById("back-btn").disabled = this.historyIndex <= 0;
    document.getElementById("forward-btn").disabled =
      this.historyIndex >= this.history.length - 1;
  }

  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadFiles(this.history[this.historyIndex]);
    }
  }

  goForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadFiles(this.history[this.historyIndex]);
    }
  }

  goUp() {
    const parentPath =
      this.currentPath.split("/").slice(0, -1).join("/") || "/";
    this.loadFiles(parentPath);
  }

  goToPath() {
    const path = document.getElementById("path-input").value.trim();
    if (path) this.loadFiles(path);
  }

  cdToPath() {
    console.log("cdToPath called");
    const path = document.getElementById("path-input").value.trim();
    console.log("Path:", path);
    console.log("Terminal visible:", terminalVisible);
    console.log(
      "Terminal socket state:",
      termSocket ? termSocket.readyState : "null",
    );

    if (!path) {
      this.showNotification("Please enter a path", "warning");
      return;
    }

    try {
      if (
        window.settingsManager &&
        window.settingsManager.settings &&
        window.settingsManager.settings.layoutMode === "explorer-only"
      ) {
        this.loadFiles(path);
        this.showNotification(`Navigated to: ${path}`, "info");
        return;
      }
    } catch (_) {}

    if (!terminalVisible) {
      console.log("Opening terminal...");
      openTerminal();
    }

    const sendCommand = () => {
      console.log("Attempting to send command...");
      if (termSocket && termSocket.readyState === WebSocket.OPEN && terminal) {
        const cdCommand = `cd "${path}"\r`;
        console.log("Sending command:", cdCommand);
        termSocket.send(cdCommand);
        terminal.focus();
        this.showNotification(`Changing directory to: ${path}`, "info");
      } else if (termSocket && termSocket.readyState === WebSocket.CONNECTING) {
        console.log("Terminal still connecting, waiting...");
        setTimeout(sendCommand, 200);
      } else {
        console.error(
          "Terminal not ready. Socket state:",
          termSocket ? termSocket.readyState : "null",
        );
        this.showNotification(
          "Terminal connection not ready, please try again",
          "warning",
        );
      }
    };

    setTimeout(sendCommand, terminalVisible ? 100 : 800);
  }

  async createFolder() {
    const name = prompt("Enter folder name:");
    if (!name) return;

    try {
      const response = await fetch("/api/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path: this.currentPath }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.showNotification("Folder created successfully", "success");
      this.refresh();
    } catch (error) {
      this.showNotification(error.message, "error");
    }
  }

  uploadFiles() {
    document.getElementById("file-input").click();
  }

  async handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    await this.uploadFilesToServer(files);
    e.target.value = "";
  }

  async handleDrop(e) {
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await this.uploadFilesToServer(files);
  }

  async uploadFilesToServer(files) {
    this.currentUploads = new Map();
    this.uploadCancelled = false;
    this.showUploadProgress(true, files);

    try {
      await Promise.all(
        Array.from(files).map((file, index) =>
          this.uploadSingleFile(file, index),
        ),
      );
      if (!this.uploadCancelled) {
        this.showNotification(
          `Successfully uploaded ${files.length} file(s)`,
          "success",
        );
        this.refresh();
      }
    } catch (error) {
      if (!this.uploadCancelled)
        this.showNotification(`Upload failed: ${error.message}`, "error");
    } finally {
      this.showUploadProgress(false);
      this.currentUploads.clear();
    }
  }

  async uploadSingleFile(file, index) {
    if (this.uploadCancelled) throw new Error("Upload cancelled");

    const formData = new FormData();
    formData.append("files", file);
    formData.append("path", this.currentPath);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.currentUploads.set(index, xhr);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && !this.uploadCancelled) {
          this.updateFileProgress(
            index,
            Math.round((e.loaded / e.total) * 100),
          );
          this.updateOverallProgress();
        }
      });

      xhr.addEventListener("load", () => {
        if (this.uploadCancelled) return reject(new Error("Upload cancelled"));
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            this.updateFileProgress(index, 100, "completed");
            this.updateOverallProgress();
            resolve(response);
          } else {
            this.updateFileProgress(index, 0, "error");
            reject(new Error(response.error || "Upload failed"));
          }
        } catch (error) {
          this.updateFileProgress(index, 0, "error");
          reject(new Error("Invalid response format"));
        }
      });

      xhr.addEventListener(
        "error",
        () =>
          !this.uploadCancelled &&
          (this.updateFileProgress(index, 0, "error"),
          reject(new Error("Network error occurred"))),
      );
      xhr.addEventListener("abort", () =>
        reject(new Error("Upload cancelled")),
      );
      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    });
  }

  cancelUpload() {
    this.uploadCancelled = true;
    this.currentUploads.forEach((xhr) => {
      try {
        xhr.abort();
      } catch (e) {}
    });
    this.showUploadProgress(false);
    this.showNotification("Upload cancelled", "warning");
  }

  async downloadSelected() {
    if (this.selectedFiles.size === 0) return;

    if (this.selectedFiles.size === 1) {
      const filePath = Array.from(this.selectedFiles)[0];
      const fileItem = document.querySelector(`[data-path="${filePath}"]`);
      const isDirectory = fileItem?.dataset.isDirectory === "true";

      if (isDirectory) {
        if (
          !confirm(
            "You are downloading a directory. It will be compressed as a ZIP file. This may take a while for large directories. Continue?",
          )
        )
          return;

        this.showNotification(
          "Preparing directory for download...",
          "info",
          10000,
        );
        this.showLoading(true);

        try {
          const checkResponse = await fetch(
            `/api/download?path=${encodeURIComponent(filePath)}`,
            { method: "HEAD" },
          );
          if (!checkResponse.ok) {
            const errorData = await checkResponse.json();
            throw new Error(errorData.error || "Error preparing download");
          }
          window.location.href = `/api/download?path=${encodeURIComponent(filePath)}`;
        } catch (error) {
          this.showNotification(`Download error: ${error.message}`, "error");
        } finally {
          setTimeout(() => this.showLoading(false), 3000);
        }
      } else {
        window.location.href = `/api/download?path=${encodeURIComponent(filePath)}`;
      }
    } else {
      this.showNotification(
        "Multiple file download is not supported. Please select one file at a time.",
        "warning",
      );
    }
  }

  previewSelected() {
    if (this.selectedFiles.size !== 1) {
      this.showNotification(
        "Please select exactly one file to preview",
        "warning",
      );
      return;
    }

    const filePath = Array.from(this.selectedFiles)[0];
    const fileItem = document.querySelector(`[data-path="${filePath}"]`);

    if (fileItem?.dataset.isDirectory === "true") {
      this.showNotification("Cannot preview directories", "warning");
      return;
    }

    this.previewFile(filePath);
  }

  copySelected() {
    this.clipboard.items = Array.from(this.selectedFiles);
    this.clipboard.operation = "copy";
    this.updateToolbar();
    this.showNotification(
      `Copied ${this.clipboard.items.length} item(s)`,
      "success",
    );
  }

  cutSelected() {
    this.clipboard.items = Array.from(this.selectedFiles);
    this.clipboard.operation = "cut";
    this.updateToolbar();
    this.showNotification(
      `Cut ${this.clipboard.items.length} item(s)`,
      "success",
    );
  }

  async pasteClipboard() {
    if (this.clipboard.items.length === 0) return;
    this.showLoading(true);
    try {
      for (const sourcePath of this.clipboard.items) {
        const destinationPath = `${this.currentPath}/${sourcePath.split("/").pop()}`;
        if (this.clipboard.operation === "copy")
          await this.copyFile(sourcePath, destinationPath);
        else if (this.clipboard.operation === "cut")
          await this.moveFile(sourcePath, destinationPath);
      }
      if (this.clipboard.operation === "cut")
        this.clipboard = { items: [], operation: null };
      this.showNotification("Paste operation completed", "success");
      this.refresh();
    } catch (error) {
      this.showNotification(error.message, "error");
    } finally {
      this.showLoading(false);
      this.updateToolbar();
    }
  }

  async copyFile(source, destination) {
    const response = await fetch("/api/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, destination }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
  }

  async moveFile(source, destination) {
    const response = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, destination }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
  }

  async deleteSelected() {
    if (
      this.selectedFiles.size === 0 ||
      !confirm(`Delete ${this.selectedFiles.size} item(s)?`)
    )
      return;
    this.showLoading(true);
    try {
      const response = await fetch("/api/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: Array.from(this.selectedFiles) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.showNotification(data.message, "success");
      this.refresh();
    } catch (error) {
      this.showNotification(error.message, "error");
    } finally {
      this.showLoading(false);
    }
  }

  async shutdownServer() {
    if (
      !confirm(
        "Are you sure you want to turn off the server? This will shut down the application and close all connections.",
      )
    ) {
      return;
    }

    this.showLoading(true);
    this.showNotification("Shutting down server...", "warning");

    try {
      const response = await fetch("/api/shutdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to shutdown server");
      }

      this.showNotification(
        "Server shutdown initiated. The application will close shortly.",
        "success",
      );

      setTimeout(() => {
        this.showLoading(false);
        this.showNotification(
          "Server has been shut down. Please restart manually to reconnect.",
          "info",
          0,
        );

        document.querySelectorAll("button").forEach((btn) => {
          if (btn.id !== "shutdown-btn") {
            btn.disabled = true;
          }
        });

        const shutdownBtn = document.getElementById("shutdown-btn");
        if (shutdownBtn) {
          shutdownBtn.innerHTML = '<i class="fas fa-power-off"></i>';
          shutdownBtn.title = "Server is Off";
          shutdownBtn.disabled = true;
        }
      }, 3000);
    } catch (error) {
      this.showLoading(false);
      this.showNotification(`Shutdown failed: ${error.message}`, "error");
    }
  }

  handleContextAction(action) {
    const selectedPath = Array.from(this.selectedFiles)[0];
    switch (action) {
      case "preview":
        this.previewFile(selectedPath);
        break;
      case "copy":
        this.copySelected();
        break;
      case "cut":
        this.cutSelected();
        break;
      case "paste":
        this.pasteClipboard();
        break;
      case "rename":
        this.renameFile(selectedPath);
        break;
      case "delete":
        this.deleteSelected();
        break;
      case "properties":
        this.showProperties(selectedPath);
        break;
    }
  }

  openFile(filePath) {
    if (
      document.querySelector(`[data-path="${filePath}"]`)?.dataset
        .isDirectory === "true"
    ) {
      this.loadFiles(filePath);
    } else {
      this.previewFile(filePath);
    }
  }

  async saveFile() {
    const editor = document.getElementById("file-editor");
    this.showLoading(true);
    try {
      const response = await fetch("/api/save-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: editor.dataset.filePath,
          content: editor.value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.showNotification("File saved successfully", "success");
      document.getElementById("editor-modal").classList.add("hidden");
    } catch (error) {
      this.showNotification(error.message, "error");
    } finally {
      this.showLoading(false);
    }
  }

  async renameFile(filePath) {
    const currentName = filePath.split("/").pop();
    const newName = prompt("Enter new name:", currentName);
    if (!newName || newName === currentName) return;
    try {
      await this.moveFile(filePath, filePath.replace(currentName, newName));
      this.showNotification("File renamed successfully", "success");
      this.refresh();
    } catch (error) {
      this.showNotification(error.message, "error");
    }
  }

  showProperties(filePath) {
    const fileItem = document.querySelector(`[data-path="${filePath}"]`);
    const modal = document.getElementById("properties-modal");
    document.getElementById("properties-content").innerHTML = `
            <div><strong>Name:</strong> ${filePath.split("/").pop()}</div>
            <div><strong>Path:</strong> ${filePath}</div>
            <div><strong>Type:</strong> ${fileItem.dataset.isDirectory === "true" ? "Directory" : "File"}</div>
        `;
    modal.classList.remove("hidden");
  }

  async previewFile(filePath) {
    const fileItem = document.querySelector(`[data-path="${filePath}"]`);
    if (fileItem?.dataset.isDirectory === "true") {
      this.showNotification("Cannot preview directories", "warning");
      return;
    }

    const modal = document.getElementById("preview-modal");
    const title = document.getElementById("preview-title");
    const content = document.getElementById("preview-content");

    const fileName = filePath.split("/").pop();
    const fileExt = fileName.split(".").pop()?.toLowerCase();

    const textExtensions = [
      "txt",
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "php",
      "rb",
      "go",
      "rs",
      "swift",
      "kt",
      "scala",
      "sh",
      "bat",
      "ps1",
      "sql",
      "html",
      "css",
      "scss",
      "less",
      "json",
      "xml",
      "yaml",
      "yml",
      "toml",
      "md",
      "gitignore",
    ];
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
    const videoExtensions = [
      "mp4",
      "webm",
      "ogg",
      "avi",
      "mov",
      "wmv",
      "flv",
      "mkv",
    ];
    const audioExtensions = ["mp3", "wav", "ogg", "aac", "m4a", "flac", "wma"];

    const isText = textExtensions.includes(fileExt) || !fileExt;
    const isImage = imageExtensions.includes(fileExt);
    const isVideo = videoExtensions.includes(fileExt);
    const isAudio = audioExtensions.includes(fileExt);

    if (!isText && !isImage && !isVideo && !isAudio) {
      this.showNotification(
        "Preview only supports text, image, video, and audio files",
        "warning",
      );
      return;
    }

    title.textContent = `Preview: ${fileName}`;
    content.innerHTML = "";
    modal.classList.remove("hidden");

    try {
      if (isImage) {
        const img = document.createElement("img");
        img.className = "preview-image";
        img.src = `/api/download?path=${encodeURIComponent(filePath)}`;
        img.alt = fileName;
        img.onerror = () =>
          this.showNotification("Failed to load image", "error");
        content.appendChild(img);
      } else if (isVideo) {
        const video = document.createElement("video");
        video.className = "preview-video";
        video.controls = true;
        video.src = `/api/download?path=${encodeURIComponent(filePath)}`;
        video.onerror = () =>
          this.showNotification("Failed to load video", "error");
        content.appendChild(video);
      } else if (isAudio) {
        const audio = document.createElement("audio");
        audio.className = "preview-audio";
        audio.controls = true;
        audio.src = `/api/download?path=${encodeURIComponent(filePath)}`;
        audio.onerror = () =>
          this.showNotification("Failed to load audio", "error");
        content.appendChild(audio);
      } else {
        const response = await fetch(
          `/api/file-content?path=${encodeURIComponent(filePath)}`,
        );
        const data = await response.json();

        if (!response.ok || data.error) {
          this.showNotification(data.error || "Failed to load file", "error");
          modal.classList.add("hidden");
          return;
        }

        this.renderTextPreview(data.content, fileName, filePath);
      }
    } catch (err) {
      this.showNotification("Network error occurred", "error");
      modal.classList.add("hidden");
    }
  }

  renderTextPreview(content, fileName, filePath) {
    const container = document.getElementById("preview-content");

    const fileInfo = document.createElement("div");
    fileInfo.className = "preview-file-info";
    fileInfo.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4>${fileName}</h4>
                <div style="display: flex; gap: 8px;">
                    <button id="preview-download-btn" class="btn btn-sm btn-secondary" title="Download File">
                        <i class="fas fa-download"></i>
                    </button>
                    <button id="preview-edit-btn" class="btn btn-sm btn-secondary" title="Edit File">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `;
    container.appendChild(fileInfo);

    const previewDiv = document.createElement("div");
    const fileExt = fileName.split(".").pop()?.toLowerCase();
    const isCode = [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "php",
      "rb",
      "go",
      "rs",
      "swift",
      "kt",
      "scala",
      "sh",
      "bat",
      "ps1",
      "sql",
      "html",
      "css",
      "scss",
      "less",
      "json",
      "xml",
      "yaml",
      "yml",
      "toml",
    ].includes(fileExt);

    previewDiv.className = isCode ? "preview-code" : "preview-text";
    previewDiv.dataset.filePath = filePath;
    previewDiv.dataset.originalContent = content;

    const textElement = document.createElement("textarea");
    textElement.className = "preview-text-content";
    textElement.value = content;
    textElement.readOnly = true;
    textElement.style.resize = "none";
    textElement.style.border = "none";
    textElement.style.outline = "none";
    textElement.style.background = "transparent";
    textElement.style.color = "inherit";
    textElement.style.fontFamily = "inherit";
    textElement.style.fontSize = "inherit";
    textElement.style.lineHeight = "inherit";
    textElement.style.padding = "10px";
    textElement.style.overflow = "auto";
    textElement.style.width = "100%";
    textElement.style.height = "100%";

    previewDiv.appendChild(textElement);
    container.appendChild(previewDiv);

    const downloadBtn = document.getElementById("preview-download-btn");
    const editBtn = document.getElementById("preview-edit-btn");
    downloadBtn.onclick = () =>
      window.open(`/api/download?path=${encodeURIComponent(filePath)}`);
    editBtn.onclick = () => this.togglePreviewEdit(filePath);
  }

  togglePreviewEdit(filePath) {
    const previewDiv = document.querySelector(".preview-text, .preview-code");
    const textElement = previewDiv?.querySelector(".preview-text-content");
    const editBtn = document.getElementById("preview-edit-btn");

    if (!textElement) return;

    if (textElement.readOnly) {
      textElement.readOnly = false;
      textElement.style.border = "1px solid var(--accent-primary)";
      textElement.style.background = "var(--bg-secondary)";
      textElement.focus();

      editBtn.innerHTML = '<i class="fas fa-save"></i>';
      editBtn.title = "Save Changes";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-sm btn-secondary";
      cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
      cancelBtn.title = "Cancel Edit";
      cancelBtn.onclick = () => this.cancelPreviewEdit();

      editBtn.parentNode.insertBefore(cancelBtn, editBtn);
      cancelBtn.id = "preview-cancel-btn";
    } else {
      this.savePreviewChanges(filePath, textElement.value);
    }
  }

  cancelPreviewEdit() {
    const previewDiv = document.querySelector(".preview-text, .preview-code");
    const textElement = previewDiv?.querySelector(".preview-text-content");
    const editBtn = document.getElementById("preview-edit-btn");
    const cancelBtn = document.getElementById("preview-cancel-btn");

    if (!textElement) return;

    textElement.value = previewDiv.dataset.originalContent;
    textElement.readOnly = true;
    textElement.style.border = "none";
    textElement.style.background = "transparent";

    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    editBtn.title = "Edit File";

    if (cancelBtn) {
      cancelBtn.remove();
    }
  }

  async savePreviewChanges(filePath, content) {
    const editBtn = document.getElementById("preview-edit-btn");
    const cancelBtn = document.getElementById("preview-cancel-btn");

    editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    editBtn.disabled = true;

    try {
      const response = await fetch("/api/save-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const previewDiv = document.querySelector(".preview-text, .preview-code");
      const textElement = previewDiv?.querySelector(".preview-text-content");

      if (previewDiv && textElement) {
        previewDiv.dataset.originalContent = content;
        textElement.readOnly = true;
        textElement.style.border = "none";
        textElement.style.background = "transparent";
      }

      this.showNotification("File saved successfully", "success");
    } catch (error) {
      this.showNotification(`Save failed: ${error.message}`, "error");
    } finally {
      editBtn.innerHTML = '<i class="fas fa-edit"></i>';
      editBtn.title = "Edit File";
      editBtn.disabled = false;

      if (cancelBtn) {
        cancelBtn.remove();
      }
    }
  }

  handleKeyboard(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    switch (e.key) {
      case "Delete":
        if (this.selectedFiles.size > 0) this.deleteSelected();
        break;
      case "F5":
        e.preventDefault();
        this.refresh();
        break;
      case "Escape":
        this.clearSelection();
        break;
      case " ":
        if (this.selectedFiles.size === 1) {
          e.preventDefault();
          this.previewSelected();
        }
        break;
    }
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "a":
          e.preventDefault();
          this.selectAll();
          break;
        case "c":
          if (this.selectedFiles.size > 0) {
            e.preventDefault();
            this.copySelected();
          }
          break;
        case "x":
          if (this.selectedFiles.size > 0) {
            e.preventDefault();
            this.cutSelected();
          }
          break;
        case "v":
          if (this.clipboard.items.length > 0) {
            e.preventDefault();
            this.pasteClipboard();
          }
          break;
      }
    }
  }

  selectAll() {
    document
      .querySelectorAll(".file-item")
      .forEach((item) => this.selectFile(item));
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${["B", "KB", "MB", "GB"][i]}`;
  }

  formatPermissions(mode) {
    const octal = (mode & parseInt("777", 8)).toString(8).padStart(3, "0");
    const chars = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
    return `${chars[parseInt(octal[0])]}${chars[parseInt(octal[1])]}${chars[parseInt(octal[2])]}`;
  }

  showLoading(show) {
    console.log(show ? "Loading..." : "Loading complete");
  }

  showNotification(message, type = "info", duration = 5000) {
    const notifications = document.getElementById("notifications");
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.innerHTML = `${message}<button class="notification-close">&times;</button>`;
    notifications.appendChild(notification);
    const timeoutId = setTimeout(() => notification.remove(), duration);
    notification
      .querySelector(".notification-close")
      .addEventListener("click", () => {
        clearTimeout(timeoutId);
        notification.remove();
      });
  }

  showUploadProgress(show, files = []) {
    const progressContainer = document.getElementById("upload-progress");
    const filesList = document.getElementById("upload-files-list");
    const overallFill = document.getElementById("upload-overall-fill");
    const overallText = document.getElementById("upload-overall-text");

    if (show) {
      progressContainer.classList.remove("hidden");
      filesList.innerHTML = "";
      files.forEach((file, index) => {
        const fileItem = document.createElement("div");
        fileItem.className = "upload-file-item";
        fileItem.dataset.index = index;
        fileItem.innerHTML = `
                    <div class="upload-file-name" title="${file.name}">${file.name}</div>
                    <div class="upload-file-progress">
                        <div class="upload-progress-bar"><div class="upload-progress-fill" id="file-progress-${index}"></div></div>
                        <div class="upload-progress-percentage" id="file-percentage-${index}">0%</div>
                    </div>`;
        filesList.appendChild(fileItem);
      });

      if (overallFill) overallFill.remove();
      if (overallText) overallText.remove();
      document.getElementById("upload-cancel-btn").onclick = () =>
        this.cancelUpload();
    } else {
      progressContainer.classList.add("hidden");
    }
  }

  updateFileProgress(fileIndex, percentage, status = "uploading") {
    const progressFill = document.getElementById(`file-progress-${fileIndex}`);
    const progressPercentage = document.getElementById(
      `file-percentage-${fileIndex}`,
    );
    const fileItem = document.querySelector(`[data-index="${fileIndex}"]`);

    if (progressFill && progressPercentage && fileItem) {
      progressFill.style.width = `${percentage}%`;
      if (status === "error") {
        progressPercentage.textContent = "Error";
        progressFill.classList.add("error");
        fileItem.classList.add("error");
      } else if (status === "completed") {
        progressPercentage.textContent = "Done";
      } else {
        progressPercentage.textContent = `${percentage}%`;
      }
    }
  }

  updateOverallProgress() {
    return;
  }

  startProgressListener(sessionId) {
    this.currentSessionId = sessionId;
    const loadingDiv = document.getElementById("loading-progress");
    const loadingText = document.getElementById("loading-text");
    if (loadingDiv) loadingDiv.classList.remove("hidden");
    if (loadingText)
      loadingText.textContent = `Loading directory: ${this.currentPath}`;

    this.progressSource = new EventSource(`/api/files/progress/${sessionId}`);
    this.progressSource.onmessage = (event) => {
      try {
        this.updateProgress(JSON.parse(event.data));
      } catch (e) {}
    };
    this.progressSource.onerror = () => this.stopProgressListener();
  }

  updateProgress(data) {
    const loadingText = document.getElementById("loading-text");
    if (data.type === "progress") {
      if (data.message && loadingText) loadingText.textContent = data.message;
    } else if (data.type === "complete") {
      if (loadingText) loadingText.textContent = "Loading complete";
      setTimeout(() => this.stopProgressListener(), 500);
    } else if (data.type === "error") {
      if (loadingText)
        loadingText.textContent = `Error: ${data.message || "Loading failed"}`;
      setTimeout(() => this.stopProgressListener(), 3000);
    }
  }

  stopProgressListener() {
    if (this.progressSource) {
      this.progressSource.close();
      this.progressSource = null;
    }
    const loadingDiv = document.getElementById("loading-progress");
    if (loadingDiv) loadingDiv.classList.add("hidden");
    this.currentSessionId = null;
  }

  clearCache(path = null) {
    if (path) this.cache.delete(path);
    else this.cache.clear();
  }
}

let systemStatsInterval;

async function fetchSystemStats() {
  try {
    const response = await fetch("/api/system-stats");
    const data = await response.json();

    if (response.ok && data) {
      updateSystemStatsDisplay(data);
    } else {
      console.warn("Invalid system stats response:", data);

      updateSystemStatsDisplay({
        cpu: { load: 0, cores: 0 },
        memory: { percentage: 0, used: 0, total: 0 },
        gpu: null,
      });
    }
  } catch (error) {
    console.warn("Failed to fetch system stats:", error);

    const cpuLoad = document.getElementById("cpu-load");
    const memoryUsage = document.getElementById("memory-usage");
    const gpuStat = document.getElementById("gpu-stat");

    if (cpuLoad) cpuLoad.textContent = "--";
    if (memoryUsage) memoryUsage.textContent = "--";
    if (gpuStat) gpuStat.style.display = "none";
  }
}

function updateSystemStatsDisplay(stats) {
  const cpuLoad = document.getElementById("cpu-load");
  if (cpuLoad && stats.cpu && typeof stats.cpu.load === "number") {
    const load = Math.max(0, Math.min(100, Math.round(stats.cpu.load)));
    cpuLoad.textContent = load;
  }

  const memoryUsage = document.getElementById("memory-usage");
  if (
    memoryUsage &&
    stats.memory &&
    typeof stats.memory.percentage === "number"
  ) {
    const percentage = Math.max(
      0,
      Math.min(100, Math.round(stats.memory.percentage)),
    );
    memoryUsage.textContent = percentage;

    const memoryStat = document.getElementById("memory-stat");
    if (memoryStat && stats.memory.used && stats.memory.total) {
      let tooltip = `Memory: ${stats.memory.used}GB / ${stats.memory.total}GB`;
      if (stats.memory.free) {
        tooltip += `\nFree: ${stats.memory.free}GB`;
      }
      if (stats.memory.cached && stats.memory.cached > 0) {
        tooltip += `\nCached: ${stats.memory.cached}GB`;
      }
      if (stats.memory.buffers && stats.memory.buffers > 0) {
        tooltip += `\nBuffers: ${stats.memory.buffers}GB`;
      }
      memoryStat.title = tooltip;
    }
  }

  const gpuStat = document.getElementById("gpu-stat");
  const gpuUsage = document.getElementById("gpu-usage");
  if (
    stats.gpu &&
    stats.gpu.utilization !== null &&
    typeof stats.gpu.utilization === "number"
  ) {
    if (gpuStat) {
      gpuStat.style.display = "flex";
      if (stats.gpu.name) {
        gpuStat.title = `GPU: ${stats.gpu.name}${stats.gpu.memory ? ` (${stats.gpu.memory}GB)` : ""}`;
      }
    }
    if (gpuUsage) {
      const utilization = Math.max(
        0,
        Math.min(100, Math.round(stats.gpu.utilization)),
      );
      gpuUsage.textContent = utilization;
    }
  } else {
    if (gpuStat) gpuStat.style.display = "none";
  }

  const cpuStat = document.getElementById("cpu-stat");
  if (cpuStat && stats.cpu) {
    let title = `CPU: ${stats.cpu.cores} cores`;
    if (stats.cpu.speed) {
      title += ` @ ${stats.cpu.speed}GHz`;
    }
    cpuStat.title = title;
  }
}

function startSystemStatsUpdates() {
  fetchSystemStats();

  systemStatsInterval = setInterval(fetchSystemStats, 3000);
}

function stopSystemStatsUpdates() {
  if (systemStatsInterval) {
    clearInterval(systemStatsInterval);
    systemStatsInterval = null;
  }
}

class SettingsManager {
  constructor() {
    this.settings = {
      layoutMode: "integrated",
      terminalFontSize: 11,
      sortBy: "name",
      sortOrder: "asc",
      startupPath: "/home/",
      startupCommand: "",
    };

    this.currentFiles = [];

    this.loadSettings();
    this.initializeUI();
  }

  loadSettings() {
    const saved = localStorage.getItem("fileExplorerSettings");
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch (e) {
        console.warn("Failed to load settings:", e);
      }
    }
    this.applySettings();
  }

  saveSettings() {
    localStorage.setItem("fileExplorerSettings", JSON.stringify(this.settings));
    this.applySettings();
  }

  applySettings() {
    this.applyAccentColor();

    this.applyLayout();

    this.applyTerminalSettings();

    this.applyExplorerSettings();
  }

  applyAccentColor() {
    const { accentColor } = this.settings;
    document.documentElement.style.setProperty("--accent-primary", accentColor);
    document.documentElement.style.setProperty("--text-accent", accentColor);

    const rgb = this.hexToRgb(accentColor);
    if (rgb) {
      const darkerColor = `rgb(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)})`;
      document.documentElement.style.setProperty(
        "--accent-secondary",
        darkerColor,
      );

      const selectionColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
      const selectionHoverColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
      document.documentElement.style.setProperty(
        "--bg-selected",
        selectionColor,
      );
      document.documentElement.style.setProperty(
        "--bg-selected-hover",
        selectionHoverColor,
      );
    }
  }

  applyLayout() {
    const { layoutMode } = this.settings;

    document.body.setAttribute("data-layout", layoutMode);

    const resizeHandle = document.getElementById("terminal-resize-handle");
    const terminalWrapper = document.getElementById(
      "terminal-container-wrapper",
    );
    const mainContent = document.querySelector(".main-content");
    const app = document.getElementById("app");
    const fileExplorer = document.querySelector(".file-explorer");

    if (resizeHandle && terminalWrapper) {
      resizeHandle.classList.remove(
        "resize-top",
        "resize-bottom",
        "resize-left",
        "resize-right",
      );

      terminalWrapper.style.position = "";
      terminalWrapper.style.width = "";
      terminalWrapper.style.height = "";
      terminalWrapper.style.top = "";
      terminalWrapper.style.left = "";
      terminalWrapper.style.right = "";
      terminalWrapper.style.bottom = "";
      terminalWrapper.style.transform = "";

      switch (layoutMode) {
        case "integrated":
          if (mainContent && mainContent.contains(terminalWrapper)) {
            app.appendChild(terminalWrapper);
          }
          resizeHandle.classList.add("resize-top");
          if (fileExplorer) fileExplorer.classList.remove("hidden");
          terminalWrapper.classList.remove("hidden");
          terminalVisible = true;
          break;
        case "split":
          if (mainContent && !mainContent.contains(terminalWrapper)) {
            mainContent.appendChild(terminalWrapper);
          }
          resizeHandle.classList.add("resize-left");
          if (fileExplorer) fileExplorer.classList.remove("hidden");
          terminalWrapper.classList.remove("hidden");
          terminalVisible = true;
          break;
        case "floating":
          if (mainContent && mainContent.contains(terminalWrapper)) {
            app.appendChild(terminalWrapper);
          }
          if (fileExplorer) fileExplorer.classList.remove("hidden");
          terminalWrapper.classList.remove("hidden");
          terminalVisible = true;
          break;
        case "explorer-only":
          if (fileExplorer) fileExplorer.classList.remove("hidden");
          terminalWrapper.classList.add("hidden");
          terminalVisible = false;
          stopSystemStatsUpdates();
          break;
        case "terminal-only":
          if (fileExplorer) fileExplorer.classList.add("hidden");

          if (mainContent && !mainContent.contains(terminalWrapper)) {
            mainContent.appendChild(terminalWrapper);
          }
          terminalWrapper.classList.remove("hidden");
          terminalVisible = true;

          terminalWrapper.style.flex = "1";
          terminalWrapper.style.height = "";
          terminalWrapper.style.width = "";
          terminalWrapper.style.maxHeight = "none";
          terminalWrapper.style.minHeight = "0";

          const fitAfterTransition = () => {
            try {
              if (fitAddon && terminalVisible) fitAddon.fit();
              if (terminal) terminal.focus();
            } finally {
              terminalWrapper.removeEventListener(
                "transitionend",
                fitAfterTransition,
              );
            }
          };
          terminalWrapper.addEventListener(
            "transitionend",
            fitAfterTransition,
            { once: true },
          );

          requestAnimationFrame(() => {
            if (!terminal) {
              openTerminal();
            }
            if (fitAddon) {
              setTimeout(() => fitAddon.fit(), 50);
              setTimeout(() => fitAddon.fit(), 250);
            }
          });
          break;
      }

      if (layoutMode !== "explorer-only") {
        terminalWrapper.classList.remove("hidden");
      }
    }

    setTimeout(() => {
      if (layoutMode !== "explorer-only" && terminal && fitAddon) {
        fitAddon.fit();
      }
    }, 100);
  }

  applyTerminalSettings() {
    const fontSizeDisplay = document.getElementById("font-size-display");
    let fontSize = this.settings.terminalFontSize;

    if (fontSizeDisplay) {
      const displayText =
        fontSizeDisplay.textContent || fontSizeDisplay.innerText;
      const parsedSize = parseInt(displayText.replace("px", ""));
      if (!isNaN(parsedSize) && parsedSize > 0) {
        fontSize = parsedSize;
      }
    }

    terminalFontSize = fontSize;

    if (terminal) {
      terminal.options.fontSize = fontSize;

      terminal.refresh(0, terminal.rows - 1);
      if (fitAddon) {
        setTimeout(() => fitAddon.fit(), 50);
      }
    }
  }

  applyExplorerSettings() {
    const { fileListStyle, showHiddenFiles, sortBy, sortOrder } = this.settings;

    document.body.setAttribute("data-file-style", fileListStyle);
    document.body.setAttribute("data-show-hidden", showHiddenFiles);
    document.body.setAttribute("data-sort-by", sortBy);
    document.body.setAttribute("data-sort-order", sortOrder);

    this.refreshFileList();
  }

  refreshFileList() {
    if (this.currentFiles.length > 0) {
      this.renderFiles(this.currentFiles);
    }
  }

  renderFiles(files) {
    this.currentFiles = files;

    let filteredFiles = [...files];

    if (!this.settings.showHiddenFiles) {
      filteredFiles = filteredFiles.filter(
        (file) => !file.name.startsWith("."),
      );
    }

    filteredFiles.sort((a, b) => {
      let comparison = 0;

      switch (this.settings.sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case "date":
          comparison = new Date(a.modified || 0) - new Date(b.modified || 0);
          break;
        case "type":
          if (a.isDirectory !== b.isDirectory) {
            comparison = a.isDirectory ? -1 : 1;
          } else {
            const extA = a.name.split(".").pop().toLowerCase();
            const extB = b.name.split(".").pop().toLowerCase();
            comparison = extA.localeCompare(extB);
          }
          break;
      }

      return this.settings.sortOrder === "desc" ? -comparison : comparison;
    });

    const fileList = document.getElementById("file-list");
    if (fileList) {
      fileList.innerHTML = "";

      filteredFiles.forEach((file) => {
        const fileElement = this.createFileItemWithSettings(file);
        fileList.appendChild(fileElement);
      });
    }
  }

  createFileItemWithSettings(file) {
    const item = document.createElement("div");
    item.className = "file-item";
    item.dataset.path = file.path;
    item.dataset.isDirectory = file.isDirectory;

    let icon;
    if (file.isDirectory) {
      icon = '<i class="fas fa-folder folder"></i>';
    } else {
      const iconClass = this.getFileIcon({
        name: file.name,
        type: file.isDirectory ? "directory" : "file",
      });
      icon = `<i class="fas ${iconClass} file"></i>`;
    }

    const size = file.isDirectory
      ? "-"
      : window.fileExplorer.formatFileSize(file.size);
    const date = new Date(file.modified).toLocaleString();
    const permissions = window.fileExplorer.formatPermissions(file.permissions);

    item.innerHTML = `
            <div class="file-name">${icon}<span>${file.name}</span></div>
            <div class="file-size">${size}</div>
            <div class="file-date">${date}</div>
            <div class="file-permissions">${permissions}</div>
        `;

    item.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) window.fileExplorer.toggleFileSelection(item);
      else if (e.shiftKey && window.fileExplorer.selectedFiles.size > 0)
        window.fileExplorer.selectFileRange(item);
      else {
        window.fileExplorer.clearSelection();
        window.fileExplorer.selectFile(item);
      }
    });

    item.addEventListener("dblclick", () => {
      if (file.isDirectory) window.fileExplorer.loadFiles(file.path);
      else window.fileExplorer.openFile(file.path);
    });

    return item;
  }

  getFileIcon(file) {
    if (file.type === "directory") return "fa-folder";

    const ext = file.name.split(".").pop().toLowerCase();
    const iconMap = {
      js: "fa-file-code",
      jsx: "fa-file-code",
      ts: "fa-file-code",
      tsx: "fa-file-code",
      html: "fa-file-code",
      htm: "fa-file-code",
      css: "fa-file-code",
      scss: "fa-file-code",
      json: "fa-file-code",
      xml: "fa-file-code",
      yaml: "fa-file-code",
      yml: "fa-file-code",
      php: "fa-file-code",
      py: "fa-file-code",
      rb: "fa-file-code",
      java: "fa-file-code",
      cpp: "fa-file-code",
      c: "fa-file-code",
      h: "fa-file-code",
      cs: "fa-file-code",

      jpg: "fa-file-image",
      jpeg: "fa-file-image",
      png: "fa-file-image",
      gif: "fa-file-image",
      bmp: "fa-file-image",
      svg: "fa-file-image",
      webp: "fa-file-image",
      ico: "fa-file-image",

      pdf: "fa-file-pdf",
      doc: "fa-file-word",
      docx: "fa-file-word",
      xls: "fa-file-excel",
      xlsx: "fa-file-excel",
      ppt: "fa-file-powerpoint",
      pptx: "fa-file-powerpoint",
      txt: "fa-file-alt",
      md: "fa-file-alt",
      readme: "fa-file-alt",

      zip: "fa-file-archive",
      rar: "fa-file-archive",
      "7z": "fa-file-archive",
      tar: "fa-file-archive",
      gz: "fa-file-archive",
      bz2: "fa-file-archive",

      mp4: "fa-file-video",
      avi: "fa-file-video",
      mov: "fa-file-video",
      wmv: "fa-file-video",
      mp3: "fa-file-audio",
      wav: "fa-file-audio",
      flac: "fa-file-audio",
      aac: "fa-file-audio",
    };

    return iconMap[ext] || "fa-file";
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  initializeUI() {
    this.initializeLayoutButton();
    this.initializeSortControls();
    this.initializeTerminalSettings();
    this.initializeSettingsDropdown();
  }

  initializeLayoutButton() {
    const layoutBtn = document.getElementById("layout-btn");
    if (layoutBtn) {
      layoutBtn.addEventListener("click", () => {
        this.cycleLayout();
      });
      this.updateLayoutButton();
    }
  }

  cycleLayout() {
    const layouts = [
      "integrated",
      "split",
      "floating",
      "explorer-only",
      "terminal-only",
    ];
    const currentIndex = layouts.indexOf(this.settings.layoutMode);
    const nextIndex = (currentIndex + 1) % layouts.length;
    this.settings.layoutMode = layouts[nextIndex];
    this.saveSettings();
    this.updateLayoutButton();
    this.applyLayout();
  }

  updateLayoutButton() {
    const layoutBtn = document.getElementById("layout-btn");
    if (!layoutBtn) return;

    const icons = {
      integrated: "fas fa-window-restore",
      split: "fas fa-columns",
      floating: "fas fa-external-link-alt",
      "explorer-only": "fas fa-folder",
      "terminal-only": "fas fa-terminal",
    };

    const titles = {
      integrated: "Layout: Integrated Terminal",
      split: "Layout: Split View",
      floating: "Layout: Floating Terminal",
      "explorer-only": "Layout: Explorer Only",
      "terminal-only": "Layout: Terminal Only",
    };

    const icon = layoutBtn.querySelector("i");
    if (icon) {
      icon.className = icons[this.settings.layoutMode];
    }
    layoutBtn.title = titles[this.settings.layoutMode];
  }

  initializeSortControls() {
    const sortDropdown = document.getElementById("custom-sort-dropdown");
    const sortButton = document.getElementById("custom-sort-button");
    const sortMenu = document.getElementById("custom-sort-menu");
    const sortOrderBtn = document.getElementById("sort-order-btn");

    if (sortDropdown && sortButton && sortMenu) {
      this.updateSortButton();

      sortButton.addEventListener("click", (e) => {
        e.stopPropagation();
        sortDropdown.classList.toggle("open");
      });

      const sortItems = sortMenu.querySelectorAll(".custom-sort-item");
      sortItems.forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();

          sortItems.forEach((i) => i.classList.remove("selected"));

          item.classList.add("selected");

          this.settings.sortBy = item.dataset.value;
          this.saveSettings();
          this.updateSortButton();
          this.applySorting();

          sortDropdown.classList.remove("open");
        });
      });

      document.addEventListener("click", () => {
        sortDropdown.classList.remove("open");
      });
    }

    if (sortOrderBtn) {
      sortOrderBtn.addEventListener("click", () => {
        this.settings.sortOrder =
          this.settings.sortOrder === "asc" ? "desc" : "asc";
        this.saveSettings();
        this.updateSortOrderButton();
        this.applySorting();
      });
      this.updateSortOrderButton();
    }
  }

  updateSortOrderButton() {
    const sortOrderBtn = document.getElementById("sort-order-btn");
    if (!sortOrderBtn) return;

    const icon = sortOrderBtn.querySelector("i");
    if (icon) {
      icon.className =
        this.settings.sortOrder === "asc"
          ? "fas fa-sort-alpha-down"
          : "fas fa-sort-alpha-up";
    }
    sortOrderBtn.title = `Sort ${this.settings.sortOrder === "asc" ? "Ascending" : "Descending"}`;
  }

  updateSortButton() {
    const sortButtonText = document.getElementById("sort-button-text");
    if (!sortButtonText) return;

    const sortLabels = {
      name: "Name",
      date: "Date Modified",
      size: "Size",
      type: "File Type",
    };

    sortButtonText.textContent = sortLabels[this.settings.sortBy] || "Name";

    const sortItems = document.querySelectorAll(".custom-sort-item");
    sortItems.forEach((item) => {
      if (item.dataset.value === this.settings.sortBy) {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });
  }

  initializeTerminalSettings() {
    const terminalSettingsBtn = document.getElementById(
      "terminal-settings-btn",
    );
    if (terminalSettingsBtn) {
      terminalSettingsBtn.addEventListener("click", () => {
        this.openTerminalSettingsModal();
      });
    }

    const fontIncreaseBtn = document.getElementById("font-increase");
    const fontDecreaseBtn = document.getElementById("font-decrease");
    const fontSizeDisplay = document.getElementById("font-size-display");

    if (fontIncreaseBtn && fontSizeDisplay) {
      fontIncreaseBtn.addEventListener("click", () => {
        const currentSize = parseInt(
          fontSizeDisplay.textContent.replace("px", ""),
        );
        const newSize = Math.min(currentSize + 1, 24);
        fontSizeDisplay.textContent = `${newSize}px`;
        this.settings.terminalFontSize = newSize;
        this.saveSettings();
        this.applyTerminalSettings();
      });
    }

    if (fontDecreaseBtn && fontSizeDisplay) {
      fontDecreaseBtn.addEventListener("click", () => {
        const currentSize = parseInt(
          fontSizeDisplay.textContent.replace("px", ""),
        );
        const newSize = Math.max(currentSize - 1, 8);
        fontSizeDisplay.textContent = `${newSize}px`;
        this.settings.terminalFontSize = newSize;
        this.saveSettings();
        this.applyTerminalSettings();
      });
    }

    const terminalFontSizeSlider = document.getElementById(
      "terminal-font-size-slider",
    );
    const terminalFontSizeValue = document.getElementById(
      "terminal-font-size-value",
    );

    if (terminalFontSizeSlider && terminalFontSizeValue) {
      terminalFontSizeSlider.value = this.settings.terminalFontSize;
      terminalFontSizeValue.textContent = `${this.settings.terminalFontSize}px`;

      terminalFontSizeSlider.addEventListener("input", () => {
        this.settings.terminalFontSize = parseInt(terminalFontSizeSlider.value);
        terminalFontSizeValue.textContent = `${terminalFontSizeSlider.value}px`;

        if (fontSizeDisplay) {
          fontSizeDisplay.textContent = `${terminalFontSizeSlider.value}px`;
        }
        this.saveSettings();
        this.applyTerminalSettings();
      });
    }
  }

  openTerminalSettingsModal() {
    const modal = document.getElementById("terminal-settings-modal");
    if (modal) {
      modal.classList.remove("hidden");

      const slider = document.getElementById("terminal-font-size-slider");
      const value = document.getElementById("terminal-font-size-value");
      const fontSizeDisplay = document.getElementById("font-size-display");

      let currentSize = this.settings.terminalFontSize;
      if (fontSizeDisplay) {
        const displayText =
          fontSizeDisplay.textContent || fontSizeDisplay.innerText;
        const parsedSize = parseInt(displayText.replace("px", ""));
        if (!isNaN(parsedSize) && parsedSize > 0) {
          currentSize = parsedSize;
        }
      }

      if (slider && value) {
        slider.value = currentSize;
        value.textContent = `${currentSize}px`;
      }
    }
  }

  initializeSettingsDropdown() {
    const dropdown = document.getElementById("settings-dropdown");
    const button = document.getElementById("settings-btn");
    const menu = document.getElementById("settings-menu");
    const startupPathInput = document.getElementById("startup-path-input");
    const startupCommandInput = document.getElementById(
      "startup-command-input",
    );

    if (!dropdown || !button || !menu) return;

    if (startupPathInput)
      startupPathInput.value = this.settings.startupPath || "";
    if (startupCommandInput)
      startupCommandInput.value = this.settings.startupCommand || "";

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });

    menu.addEventListener("click", (e) => e.stopPropagation());
    menu.addEventListener("mousedown", (e) => e.stopPropagation());
    menu.addEventListener("keydown", (e) => e.stopPropagation());

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
      }
    });

    const commit = () => {
      this.settings.startupPath = (startupPathInput?.value || "").trim();
      this.settings.startupCommand = (startupCommandInput?.value || "").trim();
      this.saveSettings();
    };

    startupPathInput?.addEventListener("change", commit);
    startupPathInput?.addEventListener("blur", commit);
    startupCommandInput?.addEventListener("change", commit);
    startupCommandInput?.addEventListener("blur", commit);
  }
}

let settingsManager;

document.addEventListener("DOMContentLoaded", () => {
  window.fileExplorer = new FileExplorer();
  window.settingsManager = new SettingsManager();
  settingsManager = window.settingsManager;

  try {
    const { startupPath } = settingsManager.settings || {};
    if (startupPath) {
      window.fileExplorer.loadFiles(startupPath);
      const pathInput = document.getElementById("path-input");
      if (pathInput) pathInput.value = startupPath;

      setTimeout(() => {
        openTerminal();
      }, 600);
    }
  } catch (_) {}
});
