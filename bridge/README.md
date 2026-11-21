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

Then run `/reload-mcp` inside Hermes Agent and connect the open project in Mind Map Studio using the same port and pairing token.

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
