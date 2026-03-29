<p align="center">
<img src="https://raw.githubusercontent.com/Phantom8015/Specters/refs/heads/main/website/favicon.png" width="150" height="150"/>
</p>
<h1 align="center">Specters</h1>
<p align="center">Specters is a powerful web-based file explorer with terminal integration, system monitoring, and modern UI. Built with Node.js and designed for efficiency and ease of use.</p>

THIS REPO IS NOT RELATED TO SPECTERS.DEV (Another project Evaan Chowdhry has with the same name for the domain)

## Features

- **File Management** - Browse, upload, download, and manage files with drag-and-drop support
- **Terminal Integration** - Built-in web terminal for running commands directly from the browser
- **System Monitoring** - Real-time CPU, memory, and GPU usage monitoring
- **File Preview** - Preview text files, images, and media directly in the browser
- **Fast & Responsive** - Built with modern web technologies for optimal performance
- **Modern UI** - Clean, intuitive interface inspired by modern design principles
- **Full Authentication** - Secure login system with user management and granular permissions *(by [JadXV](https://github.com/jadxv))*
- **macOS & Linux Support** - Runs natively on both platforms with automatic OS detection *(by [JadXV](https://github.com/jadxv))*

## Installing

### Docker (Recommended)

#### Linux
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/Phantom8015/Specters/main/docker-compose.yml
curl -o start.sh https://raw.githubusercontent.com/Phantom8015/Specters/main/start.sh
chmod +x start.sh
./start.sh -d
```

#### macOS
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/Phantom8015/Specters/main/docker-compose.yml
curl -o start.sh https://raw.githubusercontent.com/Phantom8015/Specters/main/start.sh
chmod +x start.sh
./start.sh -d
```

`start.sh` automatically detects your OS and sets the correct volume paths — no configuration needed.

#### Using Docker Run

**Linux:**
```bash
docker run -d \
  --name specters \
  -p 3000:3000 \
  -v /home:/app/managed/home:rw \
  -v /var/log:/app/managed/logs:ro \
  --restart unless-stopped \
  phantom8016/specters:latest
```

**macOS:**
```bash
docker run -d \
  --name specters \
  -p 3000:3000 \
  -v /Users:/app/managed/home:rw \
  -v /var/log:/app/managed/logs:ro \
  --restart unless-stopped \
  phantom8016/specters:latest
```

### Traditional Installation

#### Quick Install Script (Linux & macOS)
```bash
curl -fsSL https://raw.githubusercontent.com/Phantom8015/Specters/main/install.sh | bash
```

The install script automatically detects your OS and:
- **Linux** — installs Node.js via NodeSource, sets up a systemd service
- **macOS** — installs Node.js via Homebrew, sets up a launchd service (auto-starts on login)

### Manual Installation

**Requirements:** Node.js 16+, Git, NPM

```bash
git clone https://github.com/Phantom8015/Specters.git
cd Specters
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

---

## First-time Setup

On first launch you'll be taken to a setup page to create your root admin account. After that, all access requires login.

## Authentication & User Management

Authentication was added by [JadXV](https://github.com/jadxv).

- **First-run setup page** — create a root admin account on first install
- **Secure login** — bcrypt-hashed passwords (14 rounds), rate-limited to 10 attempts per 15 minutes, timing-attack resistant
- **Session security** — HttpOnly + SameSite=Strict cookies, 24-hour sessions persisted to disk
- **Role-based access:**
  | Role | File Access |
  |---|---|
  | Read-only | Browse & download |
  | Read/Write | + Upload, create, edit, delete |
  | Admin | Full access + user management |
- **Terminal permission** — separate toggle per user, independent of role
- **Directory access modes** per user:
  - Allow everything
  - Only allow specific paths
  - Block specific paths (allow everything else)
- **Admin panel** at `/admin` — add, edit, delete users; change passwords
- **WebSocket terminal auth** — terminal connections are validated server-side; rejected if session is invalid or user lacks terminal permission
- **Zero bypass** — all static files, API routes, and WebSocket connections are behind the auth wall

## Security

- Passwords hashed with bcrypt (14 rounds)
- Sessions stored server-side, signed with a persisted secret key
- Rate limiting on login endpoint
- Path traversal prevention on all file operations
- Zip-slip protection on archive extraction
- Admin-only shutdown endpoint
- `data/` directory (users, sessions, secret key) is gitignored and never committed

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Issues & Support

- **Issues**: [GitHub Issues](https://github.com/Phantom8015/Specters/issues)
- **Contact**: [Phantom8015](https://github.com/Phantom8015)
