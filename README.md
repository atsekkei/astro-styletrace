# astro-caliper

hover でスタイルの出自と要素間距離を表示する Astro Dev Toolbar App。DevTools を開かずに使う。

仕様は [spec.md](./spec.md)。現在の実装は **M1 〜 M6**（オーバーレイ / 距離計測 / 出自解決 / 3 列表示 / エディタジャンプ / 行番号マップ）。

## 使う

```bash
pnpm install
pnpm build
pnpm --filter playground dev
```

`astro.config.mjs`:

```js
import caliper from 'astro-caliper';

export default defineConfig({
  integrations: [caliper()],
});
```

dev server でツールバーの Caliper アイコンを ON にしてから:

| キー | 動作 |
| --- | --- |
| `Alt`（押下中） | 計測オーバーレイ + 出自パネルを表示 |
| `Alt + Click` | 基準要素をピン留め（同じ要素をもう一度で解除） |
| `Esc` | ピン留め解除 |
| `Alt + ↑ / ↓` | hover 要素を親 / 子へ移動 |

Alt を離すとオーバーレイは消えるが、パネルは最後の内容を保持する。

## 実装済み / 未実装

実装済み:

- ヒットテスト、hover ハイライト、margin / padding ボックス
- 距離計測の 3 パターン（分離 / 内包 / 交差）とガイド線・ラベル退避
- `data-vite-dev-id` からの出自解決、ネスト CSS の `&` 解決、`@layer` / `@media` / `@supports` の条件付きグループ
- 詳細度計算（`:is()` / `:where()` / `:has()` 対応）と、計算値と一致する宣言のハイライト
- cross-origin シートを「解析不能」として明示
- 宣言値 / 計算値 / 実測値の 3 列表示。3 つが一致する行は 1 列に畳む
- 計算値の px を rem / vw に逆算して併記。宣言値が `var()` なら変数の中身も引く
- 計算値と実測値が食い違う行をハイライト（margin 相殺、gap との競合の発見点）
- 出自ファイル名をクリックしてエディタで開く（`/__caliper/open-in-editor`）
- セレクタのコピー（`copy`）と、パネル内容まるごとのテキストコピー（`copy all`）
- PostCSS による `セレクタ → 行番号` マップ。`file:line` で直接その行へ飛ぶ（`open`）

## エディタジャンプ

| 押す場所 | 飛び先 |
| --- | --- |
| 出自ファイル名 | そのファイルの先頭 |
| セレクタ横の `open` | そのルールの**行** |
| セレクタ横の `copy` | 飛べないときの逃げ道（エディタ側で検索する） |

dev server 経由で `launch-editor` が起動する。エディタの選択は `LAUNCH_EDITOR` /
`EDITOR` 環境変数、または起動中のエディタからの推測に任せている。

行番号は Vite plugin の `transform` フックで PostCSS が集めて
`/__caliper/css-map` から配る（spec §6.9 M6）。ツールバー ON のときに 1 度だけ取得し、
以後は同期的に引く（hover ごとに fetch すると 60fps が出ない）。

- `.astro` の `<style>` は、コンパイル後の code ではなく**元ファイルを読み直して**パースしている。
  コンパイル後は改行が落ちて全ルールが同じ行になるため
- セレクタの突き合わせは正規化キーで行う（`[data-astro-cid-*]` を落とす、`'` を `"` に、`*::before` → `::before`）。
  正規化関数は `src/core/css-map.ts` に 1 つだけ置き、dev server 側もそれを import している
- 行が引けないルール（cross-origin、インライン、キーが一致しないもの）には `open` が出ない。M5 の挙動に落ちる

## 設計上の境界

`src/index.ts`（Integration）と `src/app.ts`（Toolbar App の器）以外は astro に依存しない。機械的に検証できる:

```bash
pnpm check
```

## spec からの逸脱

- `src/ui/styles.css` ではなく `src/ui/styles.ts`（CSS 文字列）。`.css` にすると Vite が dev server 経由でページ全体に注入してしまい、ShadowRoot に閉じ込められないため
- `src/core/inspector.ts` を追加。イベント受け口と rAF コミットの置き場所。DOM のみに依存するので §3 の境界は保たれている
- 3 列表示の行は longhand 単位（`margin-top` など）に展開している。`margin: 0 0 var(--space-s)` のようなショートハンドで書かれていても、実測値は辺ごとにしか出せないため

### 実測値の定義

- `width` / `height`: `getBoundingClientRect()` そのもの
- `margin-*`: 隣接する兄弟、または親のコンテンツボックスとの**実際の隙間**。margin 相殺や gap との競合はここに現れる（例: `margin-block: 1rem` の段落が flex + `gap: 12px` の中にいると、計算値 16px に対して実測 44px になる）
- `row-gap` / `column-gap`: 子要素どうしの実測ギャップの最小値
- `padding-*` / `font-size` / `line-height`: 実測値なし（計算値のみ）

## 未決事項（spec §12）

見た目は「半透明ガラス + 発光する細いエッジ」で暫定実装した。色は `src/ui/styles.ts` の `TOKENS` と `:host` のカスタムプロパティに集約してある。

既定表示するプロパティ（`src/core/rule-matcher.ts` の `DEFAULT_PROPERTIES`）は spec の暫定値のまま。実際に 1 週間使ってから確定させること。
