# astro-caliper

hover でスタイルの出自と要素間距離を表示する Astro Integration。DevTools を開かずに使う。

仕様は [spec.md](./spec.md)。現在の実装は **M1 〜 M7**（オーバーレイ / 距離計測 / 出自解決 / 3 行表示 / エディタジャンプ / 行番号マップ / パネル再設計 + Dev Toolbar App からの離脱）。

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
  // Dev Toolbar は切ってよい。caliper は依存していない
  devToolbar: { enabled: false },
});
```

| キー | 動作 |
| --- | --- |
| `Ctrl + Shift + C` | caliper の ON / OFF（既定値。下記オプションで変更可） |
| `Alt`（押下中） | 計測オーバーレイを表示（パネルは出ない） |
| `Alt + Click` | 要素を選択してパネルを開く（同じ要素をもう一度で閉じる） |
| `Esc` / パネル外クリック | 選択解除 + パネルを閉じる |
| `Alt + ↑ / ↓` | hover 要素を親 / 子へ移動 |

ON の間は画面左下にインジケータが出る。

**探すことと読むことは分かれている。** Alt を押している間はオーバーレイだけが出て、パネルは出ない。読みたい要素を `Alt + Click` で選ぶとパネルが開き、以後**ホバーしても内容は変わらない**。選択はそのまま距離計測の基準でもあるので、選んだ要素と他の要素の間隔はそのまま測れる。測っている間（Alt 押下中）はパネルが薄くなって視界を空ける。パネル外のクリックは閉じるだけで、ページ側にもそのまま届く。

```js
caliper({ shortcut: 'Alt+Shift+D' })
```

ページ側のハンドラと衝突したら差し替える。`Ctrl` / `Cmd` / `Shift` / `Alt` + 1 キー。

## パネルの読み方

プロパティ 1 件が 1 ブロック。**宣言があるものだけ**が出る。

```
margin-top                        .row[data-astro-cid-j7pv25f6]  +2
  declared   var(--space-l)  via margin-block
  computed   64px
  measured   64px
src/pages/index.astro ↗
```

- **declared** は詳細度で選んだ最有力候補であって、勝ったルールではない（spec §6.4）。同じ longhand を担う宣言が他にもあれば `+N` が付く。**`+N` が無い行は候補が 1 つなのでそのまま信じてよい**
- **computed** が唯一の真実
- **measured** は `getBoundingClientRect()` の差分。computed と食い違う行は measured が青く出る。margin 相殺 / flex の分配 / `gap` と `justify-content` の競合はここに現れる
- `font-size` / `line-height` に宣言が無ければ継承元を遡り、`← body` のように出す
- `width` / `height` は明示的な宣言があるときだけ行が立つ。実寸は右上に常時出ている

出自ファイル名をクリックするとエディタで開く。行番号が引ければその行へ。

## 実装済み

- ヒットテスト、hover ハイライト、margin / padding ボックス
- 距離計測の 3 パターン（分離 / 内包 / 交差）とガイド線・ラベル退避
- 選択で開くパネル（探索中は非表示 / 測定中は減光 / パネル外クリックで閉じる）
- `data-vite-dev-id` からの出自解決、ネスト CSS の `&` 解決、`@layer` / `@media` / `@supports` の条件付きグループ、ネストした at-rule 直下の宣言（`CSSNestedDeclarations`）
- 詳細度計算（`:is()` / `:where()` / `:has()` 対応）。候補の選定に使い、UI には出さない
- cross-origin シートは索引側で「読めなかったシート」として保持（パネルには出さない）
- declared / computed / measured の 3 行表示（一致していても畳まない）
- 候補が複数あるときの `+N` と、その場での展開
- 継承元の遡り（`font-size` / `line-height`）
- 出自ファイル名からのエディタジャンプ（`/__caliper/open-in-editor`）
- PostCSS による `セレクタ → 行番号` マップ。`file:line` で直接その行へ

## 出していないもの（spec §2）

`var()` の実体、`clamp()` の式、px → rem / vw の逆算、マッチしたルールの全件表示、詳細度と `@layer` の表示、パネル内容のテキスト書き出し。知りたいのは「CSS にどう書いてあるか」と「実地はいくらか」の 2 点であって、その間の導出過程ではない。

## エディタジャンプ

dev server 経由で `launch-editor` が起動する。エディタの選択は `LAUNCH_EDITOR` /
`EDITOR` 環境変数、または起動中のエディタからの推測に任せている。

行番号は Vite plugin の `transform` フックで PostCSS が集めて
`/__caliper/css-map` から配る（spec §6.9）。起動時に 1 度だけ取得し、
以後は同期的に引く（hover ごとに fetch すると 60fps が出ない）。

- `.astro` の `<style>` は、コンパイル後の code ではなく**元ファイルを読み直して**パースしている。
  コンパイル後は改行が落ちて全ルールが同じ行になるため
- セレクタの突き合わせは正規化キーで行う（`[data-astro-cid-*]` を落とす、`'` を `"` に、`*::before` → `::before`）。
  正規化関数は `src/core/css-map.ts` に 1 つだけ置き、dev server 側もそれを import している
- 行が引けないルール（cross-origin、インライン、キーが一致しないもの）はファイル先頭へ落ちる

## 設計上の境界

`src/index.ts`（Integration）と `src/app.ts`（クライアントの器）以外は astro に依存しない。機械的に検証できる:

```bash
pnpm check
```

`app.ts` は host + ShadowRoot を作り、ショートカットを待ち受け、`createInspector(shadowRoot)` を呼ぶだけ。
host は `document.documentElement` 直下に置く（`body` 直下だと `body > *:last-child` を使っているページに影響が出る）。

## spec からの逸脱

- `src/ui/styles.css` ではなく `src/ui/styles.ts`（CSS 文字列）。`.css` にすると Vite が dev server 経由でページ全体に注入してしまい、ShadowRoot に閉じ込められないため
- `src/core/inspector.ts` を追加。イベント受け口と rAF コミットの置き場所。DOM のみに依存するので §3 の境界は保たれている
- `src/core/units.ts` は削除せず、数値の整形（`fmt` / `parsePx`）だけを残した。rem / vw 逆算のみ削除
- 3 行表示は longhand 単位（`margin-top` など）。`margin: 0 0 var(--space-s)` のようなショートハンドで書かれていても、実測値は辺ごとにしか出せないため

### 実測値の定義

- `width` / `height`: `getBoundingClientRect()` そのもの
- `margin-*`: 隣接する兄弟、または親のコンテンツボックスとの**実際の隙間**。margin 相殺や gap との競合はここに現れる（例: `margin-block: 1rem` の段落が flex + `gap: 12px` の中にいると、計算値 16px に対して実測 44px になる）
- `row-gap` / `column-gap`: 子要素どうしの実測ギャップの最小値
- `padding-*` / `font-size` / `line-height`: 実測値なし（計算値のみ）

## 未決事項（spec §12）

- パネルの出現アニメーションの有無と duration / easing（今は 120ms のフェードのみ）
- 矢印・ガイド線の太さ
- 起動ショートカットの既定値。`Ctrl + Shift + C` は DevTools の要素選択と衝突する環境がある
- インジケータの置き場所（今は左下）

色は `src/ui/styles.ts` の `TOKENS` と `:host` のカスタムプロパティに集約してある。
