<p align="center">The open source AI IDE - opensource-ikebana.</p>

This is a independent fork of OpenCode. 

This is NOT built by the OpenCode team and is not affiliated with us in any way.

This version is built by the Software Engineering Research Team at The University of Osaka and is intended for Research Purposes.

Our idea is to build a harness that will be used by researchers for replications and indepth tracking of Agentic activities when building code. 

### Installation (BETA)


#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$OPENCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.opencode/bin` - Default fallback

```bash
# Examples
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### Install from a Local Git Clone

#### Prerequisites

- [Bun](https://bun.sh/) 1.3+

#### Clone, Install, and Run

```bash
git clone https://github.com/raux/opencode-ikebana.git
cd opencode-ikebana
bun install
bun dev
```

`bun dev` starts the TUI in the `packages/opencode` directory. To run against a different directory:

```bash
bun dev <directory>
```

#### Compile a Standalone Executable

```bash
./packages/opencode/script/build.ts --single
```

The binary is output to `./packages/opencode/dist/opencode-<platform>/bin/opencode`.
Replace `<platform>` with your platform (e.g. `darwin-arm64`, `linux-x64`).

Run the compiled binary directly:

```bash
./packages/opencode/dist/opencode-<platform>/bin/opencode
```

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).


### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

### FAQ

#### How is this different from Claude Code?

It's very similar to Claude Code in terms of capability. Here are the key differences:

- 100% open source
- Not coupled to any provider. 
- Out-of-the-box LSP support
- A client/server architecture. This, for example, can allow OpenCode to run on your computer while you drive it remotely from a mobile app, meaning that the TUI frontend is just one of the possible clients.

---

## Japanese translation
[README.ja.md](README.ja.md)
