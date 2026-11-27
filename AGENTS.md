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
pnpm lint:prose    # textlint で文章表現・表記揺れをチェック
pnpm lint:prose:fix # textlint --fix で表記揺れを自動修正
pnpm test:prose-rules # textlint カスタムルール・設定のテストを実行
```

## 構成

- `articles/<slug>.md`: 記事本体。slug は `pnpm new:article` が生成した値を使う
- `images/<slug>/`: 記事の画像。本文からは `/images/<slug>/<file>` で参照する
- `.textlintrc.json`: textlint の設定（`preset-ja-technical-writing` / `prh` / `zenn-prose` / フィルタ）
- `prh.yml`: `textlint-rule-prh` 用の表記統一辞書（`pnpm lint:prose:fix` で自動修正可能）
- `textlint-rules/zenn-prose/`: Zenn ブログ固有のカスタムルール（段落文字数・文末連続・H5 以下禁止・見出しの段の飛び・単独の見出し・全角コロン・定型クロージング）
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

## 文章表現・推敲

記事の執筆・推敲では、次のスキル（Claude Code / Cursor / Antigravity など利用中のエージェントで読み込める環境）を適用する。

- 基底規範: `apply-japanese-tech-writing`
- ブログ文体・構成（矛盾時は基底より優先）: `apply-blog-writing-style`
- 体験記・読み物（緩急を設計したいとき）: `apply-cognitive-rhythm-writing`
- 最終推敲: `yomiyasu`

### 表記の正本

- **ツール表記**: `oxlint` は小文字で統一する（コード・引用・他記事タイトルを除く）
- **かな・漢字**: `か月` / `か所` / `次のとおり`・`以下のとおり` / `嬉しい` にそろえる。補助動詞・形式名詞はひらがな（`してください`・`できる`・`すること`・`するため`）
- **記号**: 三点リーダーは `…`（`...` はコード・引用外で使わない）。ラベルのコロンは半角 `:` にそろえ、全角 `：` を混ぜない（リンクテキストに引用した他記事タイトルは除く）
- **和欧間スペース**: 新規記事と混在記事は和文と英数字の間に半角スペースを入れる
- **段落・見出し**: 1 段落は 3〜5 行（上限 250 字）を目安にする。見出しは H2・H3 を主軸にし、H4 は目次に載らない補足見出しとして必要なときだけ使う。H5 以下は使わない。見出しは 1 段ずつ深くし（H2 の直下に H4 を置かない）、同じ親の下に同じ段の見出しを 2 つ以上並べる（1 つだけなら見出しを外して本文に続ける）。結びの見出しは「おわりに」または「まとめ」を使う
- **定型句**: 「参考になれば幸いです / 嬉しいです」のような定型クロージングは避け、具体的な次の一歩や読者への問いかけを書く
- **太字**: Zenn（CommonMark）で日本語句読点や括弧に隣接する `**...**` が崩れる箇所の前後スペースは維持する

語彙の表記統一は `prh.yml`（`textlint-rule-prh`）で管理し、やむを得ない例外は記事内で `<!-- textlint-disable -->` を使って局所抑止する。

### 公開前チェック

1. `pnpm fmt:check` で整形差分がないことを確認する
2. `pnpm exec textlint articles/<slug>.md` で表記揺れ・日本語校正・長段落・文末連続・見出しの構成（H5 以下・段の飛び・単独の見出し）に違反がないことを確認する（表記揺れは `pnpm lint:prose:fix` で自動修正できる）
3. `yomiyasu` で推敲し、意味が変わっていないことと WARN 残件を確認する
4. `pnpm preview` でブラウザ表示（太字・Mermaid 図・表・見出しアンカー・画像）を確認する

## 整形

- 設定は `oxfmt.config.ts`。front matter とコードブロックも整形する
- コミット時に lefthook がステージ済みファイルを `oxfmt` で整形し、ステージ済みの `articles/*.md` に `textlint --fix` を実行して直せる表記揺れを直して stage し、続けて `pnpm lint:prose` で全記事を検査する（違反が残れば commit を止める）。CI は `pnpm fmt:check`・`pnpm test:prose-rules`・`pnpm lint:prose` を実行する
