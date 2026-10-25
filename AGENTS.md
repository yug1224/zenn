# AGENTS.md

Zenn の記事を GitHub 連携で管理するリポジトリ。記事の Markdown と画像を置く。

## コマンド

```bash
mise install       # node / pnpm / lefthook（バージョンは mise.toml）
pnpm install       # 初回は pre-commit フックも入る。入らなければ lefthook install
pnpm preview       # http://localhost:8000 でプレビュー
pnpm new:article   # articles/<slug>.md を作る
pnpm fmt           # oxfmt で整形
pnpm fmt:check     # 整形差分の確認
```

## 構成

- `articles/<slug>.md`: 記事本体。slug は `pnpm new:article` が生成した値を使う
- `images/<slug>/`: 記事の画像。本文からは `/images/<slug>/<file>` で参照する
- `books/`: 未使用

## 記事の front matter

```yaml
---
title: '記事タイトル'
emoji: '🦀'
type: 'tech' # tech: 技術記事 / idea: アイデア
topics: ['oxc', 'typescript'] # 5 個まで
published: false
published_at: 2026-01-01 12:00 # 公開日時を指定するときだけ書く。未来の日時なら予約公開
publication_name: 'dress_code'
---
```

- `published: true` にして main に push すると公開される。公開の判断は人間がする
- 公開済み記事の slug（ファイル名）は変えない。URL が変わる

## 整形

- 設定は `oxfmt.config.ts`。front matter とコードブロックも整形する
- コミット時に lefthook がステージ済みファイルを整形する。CI は `pnpm fmt:check` で確認する
