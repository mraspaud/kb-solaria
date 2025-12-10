### 1\. Installation

**Prerequisites**
You need `git`, `npm` (Node.js), and [`uv`](https://www.google.com/search?q=%5Bhttps://github.com/astral-sh/uv%5D\(https://github.com/astral-sh/uv\)).

**Setup**
Solaria is a "fat" repository containing the backend engine as a submodule.

```bash
# 1. Clone recursively (Critical: pulls in the backend engine)
git clone --recursive https://github.com/your-username/kb-solaria.git
cd kb-solaria

# 2. Sync Python environment (installs backend, aiohttp, dev tools)
uv sync

# 3. Install Frontend dependencies
# (You can also let 'poe' do this automatically on first run)
npm install
```

-----

### 2\. Configuration (`config.toml`)

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
# Note: Slack relies heavily on Firefox cookie extraction.
# Ensure you are logged into this workspace in Firefox.
[pytroll_slack]
backend = "slack"
name = "Pytroll"

# 3. Mattermost
[smhi_mattermost]
backend = "mattermost"
name = "Work"
domain = "mattermost.work.com"
```

-----

### 3\. Quickstart Guide

**Make sure you log in to the different services in firefox before starting!**
Solaria uses stored cookies and local browser storage to fetch tokens and credentials to log in.


**Development Mode (Hybrid)**
This runs the Frontend (Vite) and Backend (Python) as separate processes with Hot Module Replacement (HMR). Perfect for hacking.

```bash
uv run poe dev config.toml
```

  * **Frontend:** `http://localhost:5173` (Browser opens automatically)
  * **Backend API:** `http://localhost:4722`

<!-- **Production Mode (Appliance)** -->
<!-- This builds the frontend into static assets and serves the entire application from a single Python process. This is how the "finished product" feels. -->
<!---->
<!-- ```bash -->
<!-- uv run poe build config.toml -->
<!-- ``` -->
<!---->
<!--   * **Appliance:** `http://localhost:4722` -->

-----

### 4\. Default Keybindings

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
