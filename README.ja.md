# open source AI IDE - opensource-ikebana

このリポジトリは OpenCode の独立フォークで、OpenCode のチームとは関係なく、The University of Osaka の Software Engineering Research Team がリサーチ目的で構築したバージョンです。

私たちのアイデアは、研究者がコードを作成する際にエージェント活動を再現し、記録して追跡できるハーネスを作ることです。

### インストール (BETA)

#### インストールディレクトリ

インストールスクリプトの優先順位は次の通りです：

1. `$OPENCODE_INSTALL_DIR` - カスタムインストールディレクトリ
2. `$XDG_BIN_DIR` - XDG Base Directory Specification に準拠
3. `$HOME/bin` - 標準ユーザーバイナリディレクトリ (ある場合または作成可能)
4. `$HOME/.opencode/bin` - デフォルトのフォールバック

```bash
# 例
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### ローカル Git クローンからインストール

#### 前提条件

- [Bun](https://bun.sh/) バージョン 1.3 以降

```bash
git clone https://github.com/raux/opencode-ikebana.git
cd opencode-ikebana
bun install
bun dev
```

`bun dev` は `packages/opencode` ディレクトリ内で TUI を開始します。

### 単一実行バイナリのコンパイル

```bash
./packages/opencode/script/build.ts --single
```

バイナリは `./packages/opencode/dist/opencode-<platform>/bin/opencode` に出力されます。`<platform>` はプラットフォーム（例: `darwin-arm64`, `linux-x64`）に置き換えてください。

```bash
# 直接実行
./packages/opencode/dist/opencode-<platform>/bin/opencode
```

### エージェント

OpenCode には2つの組み込みエージェントがあり、`Tab` キーで切り替えられます。

- **build** - デフォルト、フルアクセスのエージェント（開発作業用）
- **plan** - 読み取り専用エージェント（分析やコード探索に適す）。デフォルトでファイル編集を禁止し、bash コマンド実行前に許可を求めます。未知のコードベースを探索したり、変更計画を立てるのに理想的です。

さらに複雑な検索やマルチステップタスク用の **general** サブエージェントもあり、内部で使用されます。`@general` で呼び出すことができます。

Learn more about [agents](https://opencode.ai/docs/agents)

### OpenCode の上に構築するプロジェクト

もしプロジェクトが「opencode-」から始まる名前で、例えば「opencode-dashboard」や「opencode-mobile」など、OpenCode を使用している場合は、README に「OpenCode のチームによって作成されていません、関係ありません」という注釈を追加してください。

### FAQ

#### OpenCode と Claude Code の違いは？

- 100% オープンソース
- どのプロバイダーにも縛られない
- すぐに使える LSP サポート
- クライアント/サーバー構成。OpenCode はコンピュータ上で実行し、モバイルアプリからリモートで制御できるため、TUI フロントエンドは可能な多くのクライアントの 1 つに過ぎません。

---
