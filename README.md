# Solaria

Solaria is an opinionated, keyboard-centric command center designed for the "Power Communicator." It rejects the modern chat client paradigm of endless mouse-clicking and notification fatigue. Instead, it treats chat streams as data to be navigated, filtered, and acted upon with the precision of a text editor.

Inspired by Vim and the Unix philosophy, Solaria separates navigation (Normal Mode) from composition (Insert Mode). It aggregates multiple fragmented services (Slack, Mattermost, Rocket.Chat) into a single, unified timeline, allowing you to manage attention on your own terms rather than reacting to every red dot that appears on your screen.

Solaria can run as a **browser application** (for development or lightweight use) or as a **native desktop application** using Tauri.

## 1. Prerequisites

### Required (All Modes)

| Tool | Version | Purpose |
|------|---------|---------|
| [Git](https://git-scm.com/) | Any | Clone the repository |
| [Node.js](https://nodejs.org/) + npm | 18+ | Frontend build tooling |
| [uv](https://github.com/astral-sh/uv) | Latest | Python environment management |
| Python | 3.12+ | Backend runtime |

### Additional for Tauri (Desktop App)

| Tool | Version | Purpose |
|------|---------|---------|
| [Rust](https://rustup.rs/) | 1.77+ | Tauri compilation |
| System libraries | See below | WebView rendering |

**Linux (Tauri system dependencies):**

```bash
# Debian/Ubuntu
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev

# Fedora 38+
sudo dnf install gtk3-devel webkit2gtk4.1-devel libappindicator-gtk3-devel

# RHEL 10+ / CentOS Stream 10+
sudo dnf install gtk3-devel webkit2gtk4.1-devel libappindicator-gtk3-devel

# Arch Linux
sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3
```

> **Note:** RHEL 9 and earlier do not have WebKitGTK 4.1 available. Use browser mode or upgrade to RHEL 10.

## 2. Installation

Solaria is a "fat" repository containing the backend engine as a submodule.

```bash
# 1. Clone recursively (pulls in the backend engine)
git clone --recursive https://github.com/your-username/kb-solaria.git
cd kb-solaria

# 2. Sync Python environment (installs backend, aiohttp, dev tools)
uv sync

# 3. Install Frontend dependencies
npm install
```

## 3. Configuration (`config.toml`)

Solaria uses a straightforward TOML file to define your chat universe. Create a file named `config.toml`.

**The Philosophy:**

  * **Section Name:** The internal ID for the service (e.g., `[work_slack]`).
  * **`backend`:** The driver to use (`slack`, `rocket.chat`, `mattermost`, `dummy`).
  * **`name`:** The short label displayed in the status bar.
  * **Credentials:** Solaria attempts to auto-extract session cookies/tokens from your local Firefox profile for seamless login.

**Example Configuration:**

```toml
# 1. Rocket.Chat
[rocket_chat]
backend = "rocket.chat"
name = "EWC"
domain = "chat.ewc.com"
user = "goodold.me"

# 2. Slack
[pytroll_slack]
backend = "slack"
name = "Pytroll"

# 3. Mattermost
[smhi_mattermost]
backend = "mattermost"
name = "Work"
domain = "mattermost.work.com"
```

## 4. Running Solaria

> **Important:** Log in to your chat services (Slack, Mattermost, Rocket.Chat) in Firefox before starting Solaria. The backend extracts session cookies from your browser for authentication.

### Browser Mode (Development)

Runs the Frontend (Vite) and Backend (Python) as separate processes with Hot Module Replacement. Opens in your default browser.

```bash
uv run poe dev config.toml
```

| Component | URL |
|-----------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4722 |

### Tauri Mode (Desktop App - Development)

Runs Solaria as a native desktop application with hot-reload for both frontend and backend.

```bash
uv run poe tauri-dev config.toml
```

This spawns three processes:
1. Vite dev server (frontend hot-reload)
2. Python backend with watchfiles (auto-restart on code changes)
3. Tauri window (native desktop shell)

### Tauri Mode (Production Build)

Build a distributable desktop application:

```bash
npm run tauri:build
```

Output artifacts (Linux):
```
src-tauri/target/release/
├── solaria                              # Standalone binary
└── bundle/
    ├── deb/solaria_0.1.0_amd64.deb     # Debian package
    └── appimage/solaria_0.1.0.AppImage # AppImage
```

**Running the production build:**

The production build expects the Python backend to be available. You can either:

1. **Run backend separately:**
   ```bash
   uv run python run.py ~/.config/solaria/config.toml &
   ./src-tauri/target/release/solaria
   ```

2. **Install the .deb package** (includes desktop integration):
   ```bash
   sudo dpkg -i src-tauri/target/release/bundle/deb/solaria_*.deb
   ```
   Then start the backend before launching Solaria from your application menu.

### Configuration File Locations

The Tauri app searches for `config.toml` in this order:
1. `$SOLARIA_CONFIG` environment variable
2. `~/.config/solaria/config.toml`
3. `./config.toml` (current directory, for development)

## 5. Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run a specific test file
npm test -- --run src/lib/platform.test.ts
```

## 6. Suggested Workflow

### The Two-Tier Filter

Triage & Inbox Solaria splits your incoming stream into two distinct buffers based on urgency, allowing you to prioritize "people talking to me" over "people talking near me."

**#triage** (High Urgency, default view): This is your immediate action list. It collects Direct Mentions and Direct Messages (DMs) from all services. If someone specifically needs you, it appears here. Your goal is to keep this empty.

**#inbox** (Ambient Signal): This buffer collects messages from your Starred Channels and threads you participated in. It represents the "must-read" conversations you follow. It is less urgent than Triage but more important than general noise.

### The Loop

Check #triage: Deal with mentions and DMs first. Press Enter to jump to context, reply, and the message automatically clears from Triage once you interact with it.

Press <space><space> to switch to #inbox view: Review the ongoing discussions in your key channels.

Explore: When your buffers are empty, use <space><space> (Quick Switch) to jump to specific channels or browse low-priority noise at your leisure. The channel switcher prioritises (ie moves up) channels with recent activity

### The HUD (Heads Up Display)

At the top left of the screen, the HUD provides a minimalist status report:

Red dot, EGO: Indicates messages in #triage. Pulses if there are messages.

Orange dot, SIGNAL: Indicates messages in #inbox. Pulses if there are messages.

NOISE: All other unread traffic. Channels you follow but haven't starred will never trigger a notification or appear in your buffers. Never active for now.

-----

## 7. Default Keybindings

Solaria is modal, heavily inspired by Vim.

**Global / Normal Mode**

| Key | Action |
| :--- | :--- |
| `Down` / `Up` | Move cursor Down / Up |
| `j` / `k` | Move cursor Down / Up |
| `Enter` | Jump to channel / Open thread |
| `Backspace` | Jump to back in history |
| `i` | **Insert Mode:** Start typing a message |
| `Space` | **Leader Key** (Triggers command menu, see below) |
| `G` | Jump to bottom of history, and mark the channel as read |
| `z z` | Center view on cursor |
| `Ctrl + d` | Page Down |
| `Ctrl + u` | Page Up |

**Message Actions** (Cursor must be on a message)

| Key | Action |
| :--- | :--- |
| `r` | **React** (Opens emoji picker) |
| `c c` | **Edit** message |
| `d d` | **Delete** message |
| `y y` | **Yank** (Copy) message text |
| `g f` | **Go File:** Open attachment(s) locally |
| `g d` | **Get Download:** Save attachment(s) to Downloads |
| `g x` | **Go Link:** Open URL(s) in browser |

**Insert Mode**

| Key | Action |
| :--- | :--- |
| `Esc` | Exit to Normal Mode |
| `Tab` | Autocomplete (User/Channel) |
| `Ctrl + j` / `k` | Select Next/Prev item in Autocomplete list |
| `Up` / `Down` | Select Next/Prev item in Autocomplete list |
| `Enter` | Send Message |

**Leader Commands** (Press `Space` then...)

| Key | Action |
| :--- | :--- |
| `Space` | **Quick Switch:** Toggle between last two channels |
| `e` | Toggle **Inspector** (Metadata view) |
| `r` | Toggle **Reactions** view (if applicable) |

## 8. Troubleshooting

### "Failed to start the backend server" (Tauri)

The Tauri app couldn't spawn the Python backend. Check:
1. Is `uv` installed and in your `PATH`?
2. Is the Python environment set up? Run `uv sync` in the project directory.
3. Does `config.toml` exist in one of the expected locations?

### "glib-2.0 not found" or similar (Building Tauri)

Missing GTK development libraries. Install them:
```bash
# Debian/Ubuntu
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev

# Fedora
sudo dnf install gtk3-devel webkit2gtk4.1-devel
```

### "WebKitGTK 4.1 not available" (RHEL 9 / older distros)

Tauri v2 requires WebKitGTK 4.1, which is not available on RHEL 9 or older distributions. Options:
- Use browser mode (`uv run poe dev config.toml`)
- Upgrade to RHEL 10 or Fedora 38+
- Use a Fedora toolbox container

### Backend not connecting

1. Check if the backend is running: `curl http://localhost:4722/ws`
2. Check backend logs in the terminal
3. Ensure Firefox has active sessions for your chat services

### "Connection refused" in browser mode

The backend isn't running. Start it with:
```bash
uv run python run.py config.toml
```

## 9. Project Structure

```
kb-solaria/
├── src/                    # Svelte frontend
│   ├── lib/
│   │   ├── components/     # UI components
│   │   ├── stores/         # Svelte stores (state management)
│   │   ├── logic/          # Domain logic (pure TypeScript)
│   │   └── platform.ts     # Tauri/browser abstraction
│   └── App.svelte          # Root component
├── src-tauri/              # Tauri (Rust) shell
│   ├── src/lib.rs          # Backend lifecycle, config
│   └── tauri.conf.json     # Tauri configuration
├── kbunified/              # Python backend (submodule)
├── config.toml             # Your chat service configuration
├── run.py                  # Backend entry point
├── tasks.py                # Poe task definitions
└── pyproject.toml          # Python project config
```
