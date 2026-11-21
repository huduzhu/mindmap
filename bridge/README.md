# Mind Map Studio Local MCP Bridge

Local loopback WebSocket relay (`127.0.0.1`) + stdio **Model Context Protocol (MCP)** server for co-editing an open Mind Map Studio tab from **Hermes Agent** (or any MCP-capable agent) with **$0 extra cost and no LLM API keys**.

## Running locally

```bash
npm run bridge -- --print-token
# or with an explicit configured token:
node bridge/index.mjs --port 4317 --token <your-pairing-token>
```

Diagnostics print to `stderr`; `stdout` carries pure newline-delimited MCP JSON-RPC 2.0 traffic. Configured pairing tokens (`--token` or `MINDMAP_BRIDGE_TOKEN`) are always redacted from startup logs; generated ephemeral tokens are only printed in interactive terminals or when `--print-token` is passed.

### CLI flags & environment variables

| Flag | Env var | Default | Purpose |
|---|---|---|---|
| `--port <n>` | `MINDMAP_BRIDGE_PORT` | `4317` | Loopback port on `127.0.0.1` |
| `--token <secret>` | `MINDMAP_BRIDGE_TOKEN` | random 24-byte base64url | Per-session pairing token (redacted from logs) |
| `--print-token` | — | `false` | Print an auto-generated ephemeral pairing token to `stderr` even when non-TTY |
| `--origin <url>` | `MINDMAP_BRIDGE_ORIGIN` | built-in allow-list | Additional allowed browser origin(s) |

## Hermes Agent configuration

Add the bridge under `mcp_servers` in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  mindmap:
    command: "node"
    args:
      - "/path/to/mindmap/bridge/index.mjs"
      - "--port"
      - "4317"
    env:
      MINDMAP_BRIDGE_TOKEN: "choose-a-local-pairing-token"
```

### Windows: generate a pairing code in PowerShell

Run this block in Windows PowerShell 5.1 or later. It does not require Node on your **PowerShell** PATH. The MCP client still needs Node 24+ to launch the bridge; if it cannot resolve `node`, use the absolute path to `node.exe` as the MCP `command`.

```powershell
$bytes = New-Object byte[] 24
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$pairingCode = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
Set-Clipboard -Value $pairingCode
```

Use that value for `MINDMAP_BRIDGE_TOKEN` in the MCP configuration and in the Mind Map Studio pairing dialog. Keep it out of chats and logs. Set the bridge entry point to an absolute path in a checkout you intend to keep.

### Verify the bridge before pairing

Load the new MCP configuration in Hermes before probing or pairing:

1. If `/reload-mcp` is available and reconnects the MCP server cleanly, run it and open a fresh session.
2. In Hermes Desktop — especially after changing `--port`, `MINDMAP_BRIDGE_TOKEN`, or when a previous listener still responds — fully quit Hermes Desktop (closing any tray or background Hermes process so the old stdio bridge exits and releases its port), relaunch Desktop, and start a fresh session. A saved configuration or a successful CLI tool-discovery test does not prove the running Desktop session is using the new connection.

Check the configured port before attempting to pair (replace `4317` below if you changed it):

```powershell
$port = 4317
Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 3
```

- `ok: True` and `connected: False` means the bridge is reachable and waiting for a tab. In the open project, choose **Project → Connect AI agent…**, enter that same port and pairing code, and start in **Read-only**.
- Connection refused means no bridge is listening on that port. Recheck the configured port, executable and entry-point path, and confirm that Hermes restarted its MCP subprocess (if an older process still owns the port, the new bridge logs `Port <n> on 127.0.0.1 is already in use` to `stderr` and exits). If the old port still responds, don't switch the browser to it just to get past the error: that listener may belong to an older MCP session with a different pairing code.
- After pairing, use `mindmap_status` in the same Hermes session to confirm the intended project and access mode. An HTTP health response alone does not establish that this is the bridge your session is using.

## Security model

- **Loopback only:** Binds exclusively to `127.0.0.1`.
- **Origin allow-list:** Only accepts requests and WebSocket upgrades from `https://huduzhu.github.io`, `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`, and explicit `--origin` overrides.
- **Constant-time token check:** Every browser WebSocket session must present the matching pairing token in its initial `hello` frame.
- **Single-session isolation:** At most one browser project tab can pair at a time (`4009` if already paired). Disconnecting clears pending requests and revokes access immediately.

## Exposed MCP tools

| Tool | Read / Write | Purpose |
|---|---|---|
| `mindmap_status` | Read | Check pairing state, bound project, mode, and current `rev` |
| `get_map` | Read | Read map outline/tree with stable node IDs and `baseRev` |
| `get_node` | Read | Read full details and notes for a single node by `id` |
| `search_nodes` | Read | Search titles, notes, and tags across the paired map |
| `propose_edits` | Write | Submit an atomic `add_node` / `rename_node` / `move_node` / `update_notes` batch against `baseRev` |
