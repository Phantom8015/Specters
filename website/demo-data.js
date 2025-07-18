function initializeDemoData() {
  const mockFiles = [
    {
      name: "Desktop",
      type: "folder",
      size: "-",
      dateModified: "2025-07-18, 9:30:15 AM",
      permissions: "rwx------",
      icon: "fas fa-folder",
    },
    {
      name: "Documents",
      type: "folder",
      size: "-",
      dateModified: "2025-07-17, 2:45:30 PM",
      permissions: "rwx------",
      icon: "fas fa-folder",
    },
    {
      name: "Downloads",
      type: "folder",
      size: "-",
      dateModified: "2025-07-18, 11:20:45 AM",
      permissions: "rwx------",
      icon: "fas fa-folder",
    },
    {
      name: "Pictures",
      type: "folder",
      size: "-",
      dateModified: "2025-07-16, 6:15:20 PM",
      permissions: "rwx------",
      icon: "fas fa-folder",
    },
    {
      name: "Projects",
      type: "folder",
      size: "-",
      dateModified: "2025-07-15, 10:30:00 AM",
      permissions: "rwx------",
      icon: "fas fa-folder",
    },
    {
      name: "resume.pdf",
      type: "file",
      size: "245 KB",
      dateModified: "2025-07-10, 3:22:15 PM",
      permissions: "rw-------",
      icon: "fas fa-file",
    },
    {
      name: "todo.txt",
      type: "file",
      size: "12.3 KB",
      dateModified: "2025-07-18, 8:45:30 AM",
      permissions: "rw-------",
      icon: "fas fa-file",
    },
    {
      name: "bigro.txt",
      type: "file",
      size: "12.3 KB",
      dateModified: "2025-07-18, 8:45:30 AM",
      permissions: "rw-------",
      icon: "fas fa-file",
    },
    {
      name: ".bashrc",
      type: "file",
      size: "3.2 KB",
      dateModified: "2025-07-05, 1:15:45 PM",
      permissions: "rw-------",
      icon: "fas fa-file",
    },
  ];

  const pathInput = document.getElementById("path-input");
  if (pathInput) {
    pathInput.value = "/home/user";
  }

  const fileList = document.getElementById("file-list");
  if (fileList) {
    fileList.innerHTML = "";

    mockFiles.forEach((file) => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      fileItem.dataset.name = file.name;
      fileItem.dataset.type = file.type;

      fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">
                        <i class="${file.icon}"></i>
                    </div>
                    <div class="file-name">${file.name}</div>
                </div>
                <div class="file-size">${file.size}</div>
                <div class="file-date">${file.dateModified}</div>
                <div class="file-permissions">${file.permissions}</div>
            `;

      fileList.appendChild(fileItem);
    });
  }

  addDemoTerminalContent();

  updateDemoSystemStats();
}

function addDemoTerminalContent() {
  const terminalContainer = document.getElementById("terminal-container");
  if (terminalContainer && !terminalContainer.hasChildNodes()) {
    const demoContent = document.createElement("div");
    demoContent.className = "demo-terminal-content";
    demoContent.style.cssText = `
            color: #d4d4d4;
            font-family: 'SF Pro', 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 11px;
            padding: 10px;
            line-height: 1.4;
            background: #12141b;
            height: 100%;
            overflow-y: auto;
        `;

    terminalContainer.appendChild(demoContent);
  }
}

function updateDemoSystemStats() {
  const cpuLoad = document.getElementById("cpu-load");
  if (cpuLoad) {
    cpuLoad.textContent = "24";
  }

  const memoryUsage = document.getElementById("memory-usage");
  if (memoryUsage) {
    memoryUsage.textContent = "68";
  }

  const gpuStat = document.getElementById("gpu-stat");
  const gpuUsage = document.getElementById("gpu-usage");
  if (gpuStat && gpuUsage) {
    gpuStat.style.display = "flex";
    gpuUsage.textContent = "12";
  }
}

function initializeDemoInteractions() {
  document.addEventListener("click", (e) => {
    const fileItem = e.target.closest(".file-item");
    if (fileItem) {
      document.querySelectorAll(".file-item").forEach((item) => {
        item.classList.remove("selected");
      });

      fileItem.classList.add("selected");

      const toolbarButtons = document.querySelectorAll(".toolbar-btn");
      toolbarButtons.forEach((btn) => {
        if (
          !btn.id.includes("new-") &&
          !btn.id.includes("upload-") &&
          !btn.id.includes("restart-")
        ) {
          btn.disabled = false;
        }
      });
    }
  });

  document.addEventListener("mouseover", (e) => {
    const fileItem = e.target.closest(".file-item");
    if (fileItem) {
      fileItem.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
    }
  });

  document.addEventListener("mouseout", (e) => {
    const fileItem = e.target.closest(".file-item");
    if (fileItem && !fileItem.classList.contains("selected")) {
      fileItem.style.backgroundColor = "";
    }
  });
}

function addDemoStyles() {
  const style = document.createElement("style");
  style.textContent = `
        .file-item {
            display: grid;
            grid-template-columns: 1fr auto auto auto;
            gap: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            transition: all 0.2s ease;
            cursor: pointer;
            align-items: center;
        }
        
        .file-item:hover {
            background-color: rgba(255, 255, 255, 0.05) !important;
        }
        
        .file-item.selected {
            background-color: rgba(74, 93, 255, 0.2) !important;
            border: 1px solid rgba(74, 93, 255, 0.4);
        }
        
        .file-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        
        .file-icon {
            width: 20px;
            text-align: center;
        }
        
        .file-icon .fas.fa-folder {
            color: #ff9800;
        }
        
        .file-icon .fas.fa-file {
            color: #888888;
        }
        
        .file-name {
            font-weight: 500;
            color: #ffffff;
        }
        
        .file-size, .file-date, .file-permissions {
            color: #a0a0a0;
            font-size: 0.9rem;
        }
        
        .cursor {
            animation: blink 1s infinite;
        }
        
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
    `;
  document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", () => {
  addDemoStyles();
  setTimeout(() => {
    initializeDemoData();
    initializeDemoInteractions();
  }, 500);
});
