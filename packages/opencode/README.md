# opencode

An interactive CLI tool for software engineering tasks.

## Installation

To install dependencies:

```bash
bun install
```

## Running

To run the application:

```bash
bun run index.ts
```

## Features

The TUI (Terminal User Interface) provides real-time visualizations of agent workflows, including:

- **Agent Workflow**: A hierarchical view of parent and subagent sessions.
- **Phase Indicators**: Visual feedback on the current phase of the execution loop.
- **Context Window Gauge**: Real-time monitoring of token usage relative to model limits.
- **Token Breakdown**: Detailed composition of input, output, reasoning, and cache tokens.
- **Model Usage**: Tracking cost and usage per model.
- **Loop Trail**: A breadcrumb trail of tool calls (e.g., 📄, ⌘, 🔍) showing the execution path.
- **Activity Sparklines**: Visualizing tool call frequency over time.

This project was created using `bun init` in bun v1.2.12. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
