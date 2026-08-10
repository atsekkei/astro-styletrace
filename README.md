# astro-caliper

hover でスタイルの出自と要素間距離を表示する Astro Dev Toolbar App。DevTools を開かずに使う。

仕様は [spec.md](./spec.md)。現在の実装は **M1 〜 M3**（オーバーレイ / 距離計測 / 出自解決）。

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

未実装（spec の M4 以降）:

- 宣言値 / 計算値 / 実測値の 3 列表示、rem・vw 逆算（M4）
- エディタジャンプ、パネル内容のコピー（M5）
- PostCSS による行番号マップ（M6）

## 設計上の境界

`src/index.ts`（Integration）と `src/app.ts`（Toolbar App の器）以外は astro に依存しない。機械的に検証できる:

```bash
pnpm check
```

## spec からの逸脱

- `src/ui/styles.css` ではなく `src/ui/styles.ts`（CSS 文字列）。`.css` にすると Vite が dev server 経由でページ全体に注入してしまい、ShadowRoot に閉じ込められないため
- `src/core/inspector.ts` を追加。イベント受け口と rAF コミットの置き場所。DOM のみに依存するので §3 の境界は保たれている

## 未決事項（spec §12）

見た目は「半透明ガラス + 発光する細いエッジ」で暫定実装した。色は `src/ui/styles.ts` の `TOKENS` と `:host` のカスタムプロパティに集約してある。

既定表示するプロパティ（`src/core/rule-matcher.ts` の `DEFAULT_PROPERTIES`）は spec の暫定値のまま。実際に 1 週間使ってから確定させること。
