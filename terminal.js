const { Server } = require("ws");
const pty = require("node-pty");
const url = require("url");

function terminal(server) {
  const wss = new Server({ noServer: true });
  const terminalConnections = new Map();

  function getOrCreateConnection(terminalId) {
    if (terminalConnections.has(terminalId)) {
      return terminalConnections.get(terminalId);
    }

    const connectionData = {
      process: null,
      clients: new Set(),
      isReady: false,
      bufferedData: [],
      terminalId,
    };

    terminalConnections.set(terminalId, connectionData);
    setupLocalConnection(connectionData);
    return connectionData;
  }

  function setupLocalConnection(connectionData) {
    const shell =
      process.platform === "win32"
        ? "powershell.exe"
        : process.env.SHELL || "/bin/bash";

    console.log(`Starting terminal with shell: ${shell}`);

    try {
      connectionData.process = pty.spawn(shell, [], {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });

      console.log(
        `Terminal process started with PID: ${connectionData.process.pid}`,
      );
      connectionData.isReady = true;

      connectionData.process.onData((data) => {
        broadcast(connectionData, data);
      });

      connectionData.process.onExit(({ exitCode, signal }) => {
        console.log(
          `Terminal exited with code: ${exitCode}, signal: ${signal}`,
        );
        broadcast(
          connectionData,
          `\r\n\u001b[31m[Terminal exited with code ${exitCode}]\u001b[0m\r\n`,
        );
        connectionData.process = null;
        connectionData.isReady = false;
      });

      if (connectionData.bufferedData.length > 0) {
        console.log(
          `Processing ${connectionData.bufferedData.length} buffered messages`,
        );
        connectionData.bufferedData.forEach((msg) =>
          connectionData.process.write(msg),
        );
        connectionData.bufferedData = [];
      }
    } catch (err) {
      console.error("Failed to start terminal:", err);
      broadcast(
        connectionData,
        "\u001b[31mFailed to start terminal: " + err.message + "\u001b[0m\r\n",
      );
      connectionData.isReady = false;
    }
  }

  function broadcast(connectionData, data) {
    connectionData.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });
  }

  server.on("upgrade", (req, socket, head) => {
    if (req.url.startsWith("/terminal")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws, req) => {
    const urlParts = url.parse(req.url, true);
    const terminalId = urlParts.query.terminal || "default";

    console.log(
      `New terminal connection: ${terminalId} from ${req.socket.remoteAddress}`,
    );

    const connectionData = getOrCreateConnection(terminalId);
    connectionData.clients.add(ws);

    console.log(
      `Terminal ${terminalId} now has ${connectionData.clients.size} client(s)`,
    );

    ws.on("message", (msg) => {
      if (connectionData.process && connectionData.isReady) {
        connectionData.process.write(msg);
      } else {
        console.log(`Buffering message for terminal ${terminalId} (not ready)`);
        connectionData.bufferedData.push(msg);
      }
    });

    ws.on("close", () => {
      connectionData.clients.delete(ws);

      if (connectionData.clients.size === 0) {
        setTimeout(() => {
          if (connectionData.clients.size === 0) {
            if (connectionData.process) {
              connectionData.process.kill();
            }
            terminalConnections.delete(terminalId);
            console.log(`Cleaned up terminal connection: ${terminalId}`);
          }
        }, 30000);
      }
    });
  });
}

module.exports = terminal;
