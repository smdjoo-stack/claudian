**English** | [한국어](README.ko.md)

# Jclaudian

An Obsidian plugin that embeds AI coding agents (Claude Code, Codex, Grok, OpenCode, Pi) in your vault — with a **chat mode switch** that decides how much of the vault the agent may touch, and a **command picker** so you can run your vault's commands without remembering their names.

Jclaudian is a fork of [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu. See [Provenance](#provenance) for exactly what it is based on and what was changed.

## Why this fork exists

In Claudian, your vault is the agent's working directory, so every message can read and write vault files. That is the point of the plugin — but it means there is no way to just *talk* to the model, or to ask a question about your notes without also handing over write access.

Jclaudian adds a three-way mode selector to the composer toolbar:

| Mode | Tools available to the agent | Use it for |
|---|---|---|
| **General** | none | Plain conversation. No vault access at all. |
| **Vault** | `Read` `Grep` `Glob` `LS` `WebSearch` `WebFetch` | Asking questions about your notes. Reads and cites; cannot modify. |
| **Agent** | everything | The original Claudian behavior: read, write, edit, bash. |

The mode is per-tab, so one tab can hold a plain conversation while another investigates your vault. A new tab starts in whichever mode you used last, or in a mode you pin in settings.

Switching mode mid-conversation is allowed and keeps the conversation context. The message flow marks the switch point.

### How the modes are enforced

Modes are not a prompt trick. The plugin projects the mode onto the provider-neutral tool policy that Claudian already had, so the enforcement happens where tools are granted:

- **General** → `passive` policy
- **Vault** → `read-only` policy, plus a `PreToolUse` hook that denies anything outside the read-only list
- **Agent** → `provider-default` policy (unchanged from upstream)

**Enforcement strength differs by provider, and you should know this before relying on General mode:**

| Provider | General mode is enforced by |
|---|---|
| Claude Code | Tool removal — the SDK receives `tools: []`. Hard. |
| Pi | Tool removal — `noTools: true`. Hard. |
| OpenCode | Passive agent profile, and the filesystem delegate is withheld. Structural. |
| Codex | A prompt instruction not to invoke tools, plus a read-only sandbox. Tools stay registered, so a model that ignores the instruction can still read files; writes fail at the sandbox. |
| Grok | A prompt instruction not to invoke tools. Writes hit a permission gate that is cancelled; reads the CLI auto-approves are not intercepted. |

So on Claude, Pi and OpenCode, General mode is a real denial. On Codex and Grok it is a strong request plus a sandbox. This is a property of those CLIs, not of this plugin — the plugin does not modify provider code.

One thing General mode deliberately does **not** block: context you attach yourself. Files added with `@`, the current editor selection, and images still reach the model, and the General-mode system prompt says so. "No tools" means the agent cannot go looking through your vault on its own — not that it is blind to what you handed it.

## The command picker

Vault commands live in `.claude/commands/` and you run them by typing `/`. That works if you remember the names. If you have a dozen of them and use each one every few days, you don't.

Clicking the **Agent** segment opens a picker of your vault's own commands, grouped the way you group them. Clicking one writes it into the composer and stops there — it does not send. You read what you are about to run, add arguments, and press Enter yourself. Commands that rewrite your vault should not fire on a stray click.

The picker reads the same catalog as the `/` dropdown, so a command can never appear in one and not the other.

### Opting a command in

A command joins the picker by declaring a `category` in its frontmatter:

```yaml
---
category: 1. Capture
summary: Inbox → wiki
description: Preserve the whole inbox as source material, build wiki notes, link the MOC.
---
```

| Field | Effect |
|---|---|
| `category` | The group heading. **Required to appear in the picker** — a command without one stays available by typing `/`. |
| `summary` | The short label shown beside the command name. Optional; falls back to the first sentence of `description`. |

`description` is left alone. It is written for the agent, and it keeps doing that job.

A leading `1. ` on a category sets the group's position and is stripped from the heading. Categories usually describe a workflow — capture, then draft, then review — and alphabetical order would scramble that. Categories without a number sort alphabetically after the numbered ones.

Both fields survive command discovery. The Claude Code SDK reports only name, description, and argument hint, so Jclaudian re-reads the command files to restore them.

## Requirements

Same as upstream:

- At least one of the following harnesses:
  - [Claude Code CLI](https://code.claude.com/docs/en/overview)
  - [Codex CLI](https://github.com/openai/codex)
  - [Grok Build](https://github.com/xai-org/grok-build)
  - [OpenCode](https://github.com/anomalyco/opencode)
  - [Pi](https://github.com/earendil-works/pi)
- A compatible subscription or API provider for whichever CLI you use
- Obsidian v1.13.0+
- Desktop only (macOS, Linux, Windows)
- Collab Mode requires [Git](https://git-scm.com/install/)

## Install

There is no community-plugin listing for this fork; build it from source.

```bash
git clone https://github.com/smdjoo-stack/claudian.git jclaudian
cd jclaudian
npm install
npm run build
```

Then copy the three build outputs into your vault:

```bash
VAULT=/path/to/your/vault
mkdir -p "$VAULT/.obsidian/plugins/jclaudian"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/jclaudian/"
```

The folder name must be `jclaudian` — Obsidian matches it against the `id` in `manifest.json`. Enable the plugin in Settings → Community plugins.

For development, put your vault path in `.env.local` and the watch build will copy on every change:

```
OBSIDIAN_VAULT=/path/to/your/vault
```

```bash
npm run dev
```

### If the CLI is not detected

Obsidian launched from the GUI does not inherit your shell's `PATH`, so a CLI installed under `~/.local/bin` or a version manager may not be found. Set the path explicitly in Settings → Jclaudian → Claude CLI path. On macOS and Linux, paste the output of `which claude`.

## Settings this fork adds

- **Default chat mode** (Settings → General): which mode a newly opened tab starts in — the last one you used, or a mode you pin.

Upgrade behavior: a settings file written before chat modes existed is migrated to start in **Agent** mode, so an existing install does not silently lose vault access. A fresh install starts in **General**. A corrupted stored value falls back to General rather than to Agent — absence means "upgraded", corruption means untrusted input.

## Everything else

Every other feature is upstream Claudian's: inline edit, slash commands and skills, `@mention` of vault files and folders, instruction mode, MCP servers, and tabs and session management.

**Collab Mode** (experimental) lets you collaborate on shared projects with other users over your local network. [Learn more](https://claudian.md/docs/collab-mode/).

Visit [claudian.md](https://claudian.md/) for the full upstream documentation, or the [upstream README](https://github.com/YishenTu/claudian#readme).

Known limitation of this fork: the mode-switch divider in the message flow is live-session only. Claudian does not store message bodies — it rebuilds them from the provider's own transcript — so reopening an old conversation shows no dividers. The modes themselves work normally.

## Privacy & Data Use

Unchanged from upstream, and restated here because it is the kind of thing a fork must not quietly drop:

- **Sent to API**: Your input, attached files, images, and tool call outputs. Depending on the selected provider, data is sent to Anthropic (Claude), OpenAI (Codex), xAI (Grok), or the providers configured in OpenCode or Pi. The destination can be configured through provider settings and environment variables.
- **Collab LAN traffic**: When you explicitly Host or synchronize a Collab Project, Project Git data and authenticated coordination metadata travel directly between invited teammates' devices on the local network. Collab Mode itself does not send Project data to a Claudian cloud service or any third party.
- **No telemetry or unsolicited background activity**: Claudian does not run telemetry beacons. UI polling timers read local Obsidian/editor selection state only. Network activity is limited to explicit provider runtime work, configured MCP endpoints, provider SDK/CLI calls needed to answer your requests, and explicitly started Collab LAN work.

Chat modes do not change any of the above. General mode grants no tools, so a General-mode turn sends your message and attached context but produces no file reads.

## Provenance

| | |
|---|---|
| Upstream project | [YishenTu/claudian](https://github.com/YishenTu/claudian) |
| Upstream author | Yishen Tu |
| Forked at | commit `6148cb2` — *"perf: defer collapsed stored tool output until expansion (#1304)"*, 2026-09-10 |
| Upstream version at fork | 2.2.6 |
| License | MIT (unchanged; see [LICENSE](LICENSE)) |

### What this fork changed

Added, mostly inside `src/features/chat/**`, `src/core/types/`, `src/core/prompt/` and `src/i18n/`:

**Chat modes**

- `ChatMode` type with three modes, plus normalization that degrades to General on a corrupted value
- `ChatModeProjection` — the single place that translates a mode into a tool policy and system-prompt shape
- A General-mode system prompt that omits the vault sections of the standard prompt while reusing its shared sections
- A Vault-mode prompt section instructing the agent to search with `Grep`/`Glob` and cite the notes it used
- Per-tab mode state, seeded from a global "last used" setting
- A segmented mode selector in the composer toolbar (native buttons, `aria-pressed`, keyboard and screen-reader accessible)
- A divider in the message flow where the mode changed
- The "Default chat mode" setting

**Command picker**

- `ChatModeCommandPanel` — the picker the Agent segment opens, with search, grouping, keyboard navigation, and the loading, empty, and failed states of command discovery
- `category` and `summary` frontmatter fields, parsed, serialized, and carried through the provider command catalog
- Restoration of both fields after the Claude Code SDK reports a command without them
- Insertion into the composer at the caret, sharing the trailing-space handling the `/` dropdown already used

**Both**

- Strings for all ten locales the plugin supports

Deliberately **not** changed:

- Command execution. The picker only writes text into the composer; what happens after Enter is untouched.
- Nothing under `src/core/execution/**`, and inside `src/providers/**` only Claude's command catalog, which restores the two frontmatter fields its SDK does not report. The tool policies the chat modes rely on (`passive`, `read-only`, `provider-default`) already existed and every provider backend already implemented them. Agent mode therefore produces byte-for-byte the same request Claudian always did.
- Internal identifiers: CSS classes, view types and the `.claudian` storage folder keep their original names. Only the plugin's public identity (`id`, `name`) was renamed, so your existing session data is still found.
- The npm package name in `package.json` also stays `claudian`. It is a private field that is never published, and both `bun.lock` and `package-lock.json` record it — CI validates them with `--frozen-lockfile`, so renaming it would break the build for no user-visible gain.

### Design documents

The design spec and implementation plan for the chat-mode feature are in `docs/superpowers/`. They are written in Korean and describe this fork's development process, not the plugin's behavior — read the sections above instead if you just want to use it.

## License

MIT, inherited from upstream. The original copyright notice is retained in [LICENSE](LICENSE). If you redistribute this fork, keep it.
