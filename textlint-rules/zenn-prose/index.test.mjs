import assert from 'node:assert/strict';
import test from 'node:test';
import { createLinter, loadTextlintrc } from 'textlint';

const repoRoot = new URL('../../', import.meta.url).pathname;
const descriptor = await loadTextlintrc({
  configFilePath: `${repoRoot}.textlintrc.json`,
  node_modulesDir: `${repoRoot}node_modules`,
});
const linter = createLinter({ descriptor });

async function lintZennProse(markdown) {
  const result = await linter.lintText(markdown, 'test.md');
  return result.messages.filter((m) => m.ruleId === 'zenn-prose');
}

test('H5 以下の見出しを検出し H2〜H4 やコードブロック内は許可する', async () => {
  const md = [
    '## H2 見出し',
    '### H3 見出し',
    '#### H4 見出し',
    '##### H5 見出し',
    '###### H6 見出し',
    '#### H4 見出し',
    '### H3 見出し',
    '## H2 見出し',
    '',
    '```md',
    '##### コードブロック内',
    '```',
  ].join('\n');

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.line),
    [4, 5],
  );
});

test('直前の見出しより 2 段以上深い見出しを検出し、1 段深い見出しと浅く戻る見出しは許可する', async () => {
  const md = [
    '## A',
    '#### 飛び',
    '#### 飛び',
    '## B',
    '### B-1',
    '#### B-1-a',
    '#### B-1-b',
    '### B-2',
    '## C',
  ].join('\n');

  const messages = (await lintZennProse(md)).filter((m) => /段/.test(m.message));
  assert.deepEqual(
    messages.map((m) => m.line),
    [2],
  );
  assert.match(messages[0].message, /H2 の次に H4/);
});

test('記事の最初の見出しが H3 以下なら、H1 からの段の飛びとして検出する', async () => {
  const md = ['### 最初が H3', '## A', '## B'].join('\n');

  const messages = (await lintZennProse(md)).filter((m) => /段/.test(m.message));
  assert.deepEqual(
    messages.map((m) => m.line),
    [1],
  );
  assert.match(messages[0].message, /H1 の次に H3/);
});

test('同じ親の下に 1 つしかない H2〜H4 を検出し、2 つ以上並ぶ見出しとコードブロック・引用内は許可する', async () => {
  const md = [
    '## 唯一の H2',
    '### 単独の H3',
    '#### H4-a',
    '#### H4-b',
    '',
    '```md',
    '## コードブロック内',
    '```',
    '',
    '> ## 引用内',
  ].join('\n');

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.line),
    [1, 2],
  );
  assert.match(messages[0].message, /記事の H2 が 1 つだけ/);
  assert.match(messages[1].message, /H2「唯一の H2」の下の H3 が 1 つだけ/);
});

test('H4 が 1 つだけでも、別の H3 の下にあれば親ごとに数える', async () => {
  const md = ['## A', '### A-1', '#### 単独', '### A-2', '#### H4-a', '#### H4-b', '## B'].join(
    '\n',
  );

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.line),
    [3],
  );
});

test('リンクテキストの全角コロンは許可し、リンク外の全角コロンは検出する', async () => {
  const md = '[設計：方針](https://example.com) を読みました：感想です。';

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.column),
    [36],
  );
});

test('250 字超の段落を検出し 250 字以下・引用・URL 長は除外する', async () => {
  const exactly250 = 'あ'.repeat(250);
  const over250 = 'い'.repeat(251);
  const longUrl = `https://example.com/${'a'.repeat(300)}`;
  const md = [
    exactly250,
    '',
    over250,
    '',
    `> ${'う'.repeat(260)}`,
    '',
    `短いリンク [こちら](${longUrl}) を参照します。`,
    '',
    `裸 URL ${longUrl} を参照します。`,
    '',
    `@[card](${longUrl})`,
  ].join('\n');

  const messages = await lintZennProse(md);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].line, 3);
});

test('Zenn コンテナ区切り行や埋め込み行は段落文字数に含めず、ハードブレイク後の本文超過は検出する', async () => {
  const withinLimit = [':::message', 'あ'.repeat(245), ':::'].join('\n');
  assert.equal((await lintZennProse(withinLimit)).length, 0);

  const withEmbed = ['@[speakerdeck](9de83bc11e6c4f948216301186bd6e97)  ', 'あ'.repeat(245)].join(
    '\n',
  );
  assert.equal((await lintZennProse(withEmbed)).length, 0);

  const embedInContainer = [
    ':::message',
    '@[card](https://example.com/foo)',
    'あ'.repeat(246),
    ':::',
  ].join('\n');
  assert.equal((await lintZennProse(embedInContainer)).length, 0);

  const hardBreakOverLimit = [':::message  ', 'い'.repeat(251), ':::'].join('\n');
  const messages = await lintZennProse(hardBreakOverLimit);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].line, 1);

  const codeStartingWithColons = ['前置きです。', `\`:::\` で囲むと${'あ'.repeat(245)}。`].join(
    '\n',
  );
  const codeColonMessages = await lintZennProse(codeStartingWithColons);
  assert.equal(codeColonMessages.length, 1);
  assert.equal(codeColonMessages[0].line, 1);

  const escapedWithinLimit = [':::message', `a\\*b ${'あ'.repeat(247)}`, ':::'].join('\n');
  assert.equal((await lintZennProse(escapedWithinLimit)).length, 0);

  const entityDetailsOverLimit = [':::details A &amp; B', 'あ'.repeat(251), ':::'].join('\n');
  const entityMessages = await lintZennProse(entityDetailsOverLimit);
  assert.equal(entityMessages.length, 1);
  assert.equal(entityMessages[0].line, 1);
});

test('同一文末の 3 連続を検出し 2 連続・異種文末・括弧内句点・引用を除外する', async () => {
  const md = [
    '最初の文です。次の文です。三つ目の文です。',
    '',
    '最初の文です。次の文です。三つ目で変えます。',
    '',
    '実行しました。確認した。記録した。',
    '',
    '「これは引用です。」と書きました。別件を書きました。さらに書きました。',
    '',
    '設定を確認しません。変更もしません。削除もしません。',
    '',
    '> 引用内です。引用内です。引用内です。',
    '',
    'コード `Aです。Bです。Cです。` を書きます。',
    '',
    'これは大切です。これも大切です。さらに **重要です**。',
    '',
    '参考 (https://example.com) を確認します。次に実行します。最後に記録します。',
    '',
    '参考 (https://example.com): 確認します。次に確認します。最後に確認します。',
    '',
    'これは便利です。あれも便利です！？それも便利です。',
    '',
    '最初は不安でした。すぐには動きませんでした。それでも最後はうまくいく感触でした。',
    '',
    '結果は良好でした。設定も簡単でした。導入もスムーズでした。',
    '',
    '手順をまとめます。設定を有効にします（詳細は試していません）。結果を確認します。',
    '',
    '設定は有効（詳細は後述です）。手順は簡単です。導入も手軽です。',
    '',
    '「1) 最初の文です。次の文です。三つ目の文です。」と説明しました。',
  ].join('\n');

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.line),
    [1, 7, 9, 15, 17, 19, 21, 25, 27],
  );
  assert.match(messages[messages.length - 2].message, /文末「でした」/);
  assert.match(messages[messages.length - 1].message, /文末「ます」/);
});

test('Zenn コンテナの区切り行をまたぐ文末は連続として数えない', async () => {
  const md = [':::message', 'A です。', 'B です。', ':::', 'C です。'].join('\n');
  assert.equal((await lintZennProse(md)).length, 0);
});

test('details のタイトルは本文の文末連続に数えない', async () => {
  const md = [':::details 補足です。', 'A です。', 'B です。', ':::'].join('\n');
  assert.equal((await lintZennProse(md)).length, 0);
});

test('閉じの区切り行の直後に続く本文は文末連続に数える', async () => {
  const md = [':::message', 'A です。', ':::', 'B です。', 'C です。', 'D です。'].join('\n');
  const messages = await lintZennProse(md);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].line, 6);
});

test('半角 !・脚注・句点なしの最終文・文末絵文字でも文末連続を検出し、絵文字は 1 字で数える', async () => {
  const md = [
    'これは文です! これも文です! それも文です!',
    '',
    'これは文です[^1]。これも文です[^1]。それも文です[^1]。',
    '',
    'これは文です。これも文です。それも文です',
    '',
    'これは文です。これも文です😀。それも文です。',
    '',
    `${'あ'.repeat(200)}${'🎉'.repeat(26)}`,
    '',
    '[^1]: 脚注',
  ].join('\n');

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.line),
    [1, 3, 5, 7],
  );
});

test(':::details のタイトルは全角コロンと他ルールの検査対象にする', async () => {
  const md = [
    ':::details 設定：値',
    '本文です。',
    ':::',
    '',
    ':::details 私はは行く',
    '本文です。',
    ':::',
  ].join('\n');
  const result = await linter.lintText(md, 'test.md');
  assert.deepEqual(
    result.messages.map((m) => [m.line, m.ruleId]),
    [
      [1, 'zenn-prose'],
      [5, 'ja-technical-writing/ja-no-successive-word'],
    ],
  );
});

test('強調や改行を挟んだ定型クロージングを検出する', async () => {
  const md = [
    'この記事が参考になれば**幸い**です。',
    '',
    'この記事が参考になれば',
    '幸いです。',
  ].join('\n');
  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => m.line),
    [1, 3],
  );
});

test('全角コロンと定型クロージングを検出しコード・引用・disable コメントを除外する', async () => {
  const md = [
    '設定項目：値を書きます。',
    '',
    'この記事が参考になれば幸いです。',
    '',
    '少しでも参考になれば嬉しいです。',
    '',
    'インライン `設定：値` は問題ありません。',
    '',
    '> 引用：参考になれば幸いです。',
    '',
    '<!-- textlint-disable zenn-prose -->',
    '抑止済み：参考になれば幸いです。',
    '<!-- textlint-enable zenn-prose -->',
    '',
    '## 見出し：補足',
    '',
    '| 項目 | 内容 |',
    '| --- | --- |',
    '| 表セル | 値：テスト |',
    '',
    '🦀 絵文字の後：テストです。',
    '',
    '詳細は（https://example.com）を確認：参考になれば幸いです。',
    '',
    '## 別の見出し',
  ].join('\n');

  const messages = await lintZennProse(md);
  assert.deepEqual(
    messages.map((m) => [m.line, m.column]),
    [
      [1, 5],
      [3, 6],
      [5, 5],
      [15, 7],
      [19, 10],
      [21, 9],
      [23, 28],
      [23, 29],
    ],
  );
});

test('Zenn 独自記法で誤検知せず prh.yml の自動修正が機能する', async () => {
  const md = [
    '---',
    "title: 'テスト記事'",
    "emoji: '🦀'",
    "type: 'tech'",
    "topics: ['test']",
    'published: false',
    '---',
    '',
    ':::message',
    'Oxlintを3ヶ月と 3 カ月使って2箇所と 2 箇所と 2 カ所を直しました。アメリカ所在の修正が必要な箇所も確認しました...。',
    ':::',
    '',
    ':::message',
    `${'あ'.repeat(112)}。`,
    ':::',
  ].join('\n');

  const lintResult = await linter.lintText(md, 'test.md');
  const zennSyntaxErrors = lintResult.messages.filter(
    (m) => m.line === 9 || m.line === 11 || m.line === 13 || m.line === 15,
  );
  assert.equal(zennSyntaxErrors.length, 0);

  const sentenceLengthErrors = lintResult.messages.filter(
    (m) => m.ruleId === 'ja-technical-writing/sentence-length',
  );
  assert.equal(sentenceLengthErrors.length, 0);

  const fixResult = await linter.fixText(md, 'test.md');
  assert.match(
    fixResult.output,
    /oxlintを3か月と 3 か月使って2か所と 2 か所と 2 か所を直しました。アメリカ所在の修正が必要な箇所も確認しました…。/,
  );

  const longInHardBreakMessage = [':::message  ', `${'あ'.repeat(121)}。`, ':::'].join('\n');
  const longMessageResult = await linter.lintText(longInHardBreakMessage, 'test.md');
  assert.equal(
    longMessageResult.messages.filter((m) => m.ruleId === 'ja-technical-writing/sentence-length')
      .length,
    1,
  );
});

test('.textlintrc.json で並立助詞・記号連続・口語文末を許可し、それ以外の違反は検出する', async () => {
  const allowedMd = [
    'フロントエンドもバックエンドも担当します。',
    '',
    'これは A か B かを選びます。',
    '',
    'そうなんですね……。すごい！！',
    '',
    'とても助かりましたｗ',
    '',
    '使っているのですが……',
    '',
    '導入あるあるを語ります。',
  ].join('\n');

  const allowedResult = await linter.lintText(allowedMd, 'test.md');
  assert.equal(allowedResult.messages.length, 0);

  const disallowedMd = [
    '画面にデータに設定します。',
    '',
    '私はは行きます。',
    '',
    '句点が抜けている文',
  ].join('\n');

  const disallowedResult = await linter.lintText(disallowedMd, 'test.md');
  assert.deepEqual(
    disallowedResult.messages.map((m) => [m.line, m.ruleId]),
    [
      [1, 'ja-technical-writing/no-doubled-joshi'],
      [3, 'ja-technical-writing/ja-no-successive-word'],
      [5, 'ja-technical-writing/ja-no-mixed-period'],
    ],
  );
});
