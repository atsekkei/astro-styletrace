# spec — astro-caliper

Astro + Vanilla TS 開発サーバー向けの、hover でスタイルの出自と要素間距離を表示するインスペクタ。
Astro Dev Toolbar App として実装し、DevTools を開かずに使う。

- パッケージ名: `astro-caliper`
- 形態: Astro Integration + Dev Toolbar App（+ Vite middleware）
- 対象: dev のみ。production build には一切含まれない
- 名前の由来: ノギス。2 点に当てて間隔を読む道具であり、「図面の寸法」ではなく「実際の寸法」を測る道具であること（§F2 の 3 列表示）に由来する

---

## 1. 解決する課題

| # | 課題 | 現状の回避策と、その不満 |
| --- | --- | --- |
| P1 | エージェントが書いたコードで、**どの要素のスタイルがどのファイルに書かれているか**わからない | DevTools の Styles pane で追える。が、`.astro` の scoped style / グローバル CSS / ユーティリティが混ざると出自が読み取りづらい |
| P2 | `clamp()` / `rem` / `%` 指定が多く、**実際の距離が直感的にわからない** | Computed タブを都度開く。要素を切り替えるたびに往復が発生する |
| P3 | **DevTools を開くとビューポートが実機サイズでなくなる** | undock すれば回避できるが、画面が狭くなる問題は残る |

この 3 つは同じ瞬間（レイアウトを見ながら「これ何で決まってる？」と思った瞬間）に同時に発生する。
**ひとつのオーバーレイで 3 つ同時に答える**のがこのツールの存在理由。

---

## 2. 非目標（作らないもの）

明示的にスコープ外とする。ここを削ることで実装が 1/5 になる。

- **CSS のライブ編集**。読み取り専用。編集はエディタでやる（エディタジャンプで繋ぐ）
- **本番サイトでの利用**。ブラウザ拡張にはしない。dev server 前提だからこそ出自が取れる
- **カスケードの完全再現**。「勝ったルール 1 つ」を断定しない（§6.4 参照）
- DOM ツリービュー、ネットワーク、コンソール。DevTools の置き換えではない
- **アクセシビリティ監査**。Astro 標準の Audit app がある
- モバイル実機での動作。デスクトップブラウザのみ
- **Astro 以外のフレームワークへの対応**。§3 の但し書きを参照

---

## 3. 前提環境

- Astro 4 以降（Dev Toolbar App API が安定している版）
- Vite dev server（Astro に内蔵）
- 素の CSS / ネイティブ CSS ネスト / `.astro` の `<style>`
- Chromium 系を第一ターゲット。Safari / Firefox は best-effort

Tailwind やその他の CSS-in-JS は**初版では考慮しない**。ユーティリティクラスは「出自が 1 ファイルに集中する」ため、そもそもこのツールの課題設定に合わない。

### Astro 専用にする判断

出自解決の心臓部（`data-vite-dev-id`）は Vite の機能であり、Astro とは無関係に動く。したがって将来的に Vite 全般へ広げることは技術的に可能だが、**初版では意図的に Astro に絞る**。

理由:

1. Astro 環境でのみ `data-astro-cid-*` という**第 2 の解決経路**が使える（§6.2）。単一フレームワークに絞るほど堅くなる
2. Dev Toolbar App が ShadowRoot・トグル UI・レイアウト非干渉を無料で提供する。自前で器を作る工数がまるごと消える
3. 使うのは自分だけ。抽象化の受益者が存在しない

**ただし、後から切り出せる形は保っておく。** これは実質ゼロコストで効く保険。

- `src/core/` 配下は **DOM と CSSOM 以外に依存しない**。Astro の型も Dev Toolbar の API も import しない
- ソース解決は `resolveSource(sheet: CSSStyleSheet) => string` の 1 関数に閉じ込める。ここだけ差し替えれば別環境に移せる
- Astro 依存は `src/index.ts`（Integration）と `src/app.ts`（Toolbar App の器）の 2 ファイルにのみ存在してよい

この境界を守っていれば、Vite 版が必要になった時の作業は「器を作り直す」だけで済む。**守っていないと全面書き直しになる。** 差は数行の規律でしかないので、最初から守ること。

---

## 4. 機能仕様

### F1 — 距離計測モード

Figma の Alt+カーソルに相当。

- **基準要素の固定**: 要素を `Alt + Click` でピン留めする。ピン留め中はハイライト表示が残る
- **計測**: ピン留め後、別の要素に hover すると、2 要素間の距離を矢印と数値で表示する
- **位置関係の 3 パターンを出し分ける**:
  - **分離**: 水平・垂直それぞれの gap を表示（重なっていない軸のみ）
  - **内包**（一方が他方を含む）: 上下左右 4 方向の inset 距離を表示
  - **交差**: 重なり幅を負値または明示ラベルで表示
- **単独 hover**（ピン留めなし）: hover 要素自身の `width × height` と、margin / padding のボックスを表示
- **Esc** でピン留め解除

### F2 — スタイル出自パネル

hover 要素にマッチする CSS ルールを、**3 つの値を並べて**表示する。

| 列 | 取得元 | 例 |
| --- | --- | --- |
| 宣言値 | `rule.style.getPropertyValue(prop)` | `clamp(1rem, 2vw, 2rem)` |
| 計算値 | `getComputedStyle(el)[prop]` | `28.8px` |
| 実測値 | `getBoundingClientRect()` 差分 | `28.8px` |
| 出自 | `styleSheet.ownerNode.dataset.viteDevId` | `src/styles/_layout.css` |
| セレクタ | `rule.selectorText` | `.card-grid` |

**3 列並べることが仕様の核心**。宣言値と計算値の乖離が P2 を解決し、計算値と実測値の乖離（margin 相殺、flex の分配、`gap` と `justify-content` の競合）がバグの発見点になる。3 つが一致しているときは 1 列に畳んで表示してよい。

さらに補助表示として、計算値の px を **rem / vw に逆算**して併記する（`28.8px = 1.8rem = 2.0vw`）。相対単位で書かれた設計を相対単位のまま検証できる。

#### 表示するプロパティ

全プロパティを出すとノイズになるため、**レイアウト関連を既定で表示**し、残りは折り畳む。

- 既定表示: `display` `position` `width` `height` `margin` `padding` `gap` `flex` `grid-*` `inset` `font-size` `line-height`
- 折り畳み: マッチしたルールの全宣言

#### マッチしたルールの一覧

出自ファイルごとにグルーピングし、**詳細度の高い順**に並べる。同一プロパティが複数ルールで宣言されている場合、負けている側は取り消し線で表示する（判定は §6.4 の但し書き付き）。

インラインスタイル（`el.style`）は別枠で最上位に表示する。

### F3 — エディタジャンプ

出自ファイル名をクリックするとエディタで開く。§6.6 参照。

### F4 — 起動と終了

- Astro Dev Toolbar のアイコンをクリックで ON / OFF
- ON の間は `Alt` 押下中のみ計測オーバーレイが出る（Alt を離すと消える）。常時表示だと通常の操作ができない
- パネルは Alt を離しても最後の内容を保持する（読みながら操作するため）

---

## 5. UI 仕様

### レイアウト非干渉

Astro Dev Toolbar App は**専用の ShadowRoot** を受け取り、その親要素は `position: absolute` で配置されるため、ページのレイアウトに一切影響しない。これがブラウザ拡張ではなく Dev Toolbar App を選ぶ最大の理由。

加えて:

- オーバーレイの全要素に `pointer-events: none`。イベントを奪ってはならない
- パネル本体（クリック可能）のみ `pointer-events: auto`
- オーバーレイのテキストに `user-select: none`

### キーバインド

| キー | 動作 |
| --- | --- |
| `Alt`（押下中） | 計測オーバーレイ表示 |
| `Alt + Click` | 基準要素をピン留め |
| `Esc` | ピン留め解除 |
| `Alt + ↑ / ↓` | hover 要素を親 / 子へ移動（細かい要素を掴むため） |
| `Cmd/Ctrl + C` | パネルの内容をテキストでコピー（エージェントに貼る用途） |

`Cmd/Ctrl + C` は地味だが重要。「この要素のスタイル出自」をそのままエージェントへのプロンプトに貼れる。P1 の課題設定にまっすぐ効く。

### 数値表示

- **`font-variant-numeric: tabular-nums` 必須**。hover 移動中に数値が毎フレーム更新されるため、プロポーショナル数字だと桁が揺れて読めない
- 小数は 1 桁まで（`28.8px`）。それ以上は視覚ノイズ

### パネルの位置

hover 要素の近傍にフローティング。ビューポート端で反転させる。ただし**追従アニメーションは付けない**（毎フレーム動く対象に慣性を付けると読めなくなる）。

---

## 6. 技術仕様

### 6.1 アーキテクチャ

```
astro.config.mjs
  └─ integrations: [caliper()]
       │
       ├─ astro:config:setup
       │    └─ addDevToolbarApp('./app.ts')   ← クライアント側
       │
       └─ astro:server:setup
            └─ server.middlewares.use('/__caliper/open-in-editor', launchEditor)
            └─ server.middlewares.use('/__caliper/css-map', ...)   ← M6
```

クライアント側 `app.ts` の責務:

```
init(canvas, app, server)          ← ここだけが Astro を知っている
  ├─ StyleSheetIndex   … document.styleSheets を走査してルールを索引化
  ├─ RuleMatcher       … el → マッチしたルール[] を解決
  ├─ Measurer          … 2 要素間の距離を算出
  └─ Overlay           … ShadowRoot に描画
       ↑ 以上 4 つは core。DOM + CSSOM のみに依存する（§3 参照）
```

`init` は Astro から `canvas`（ShadowRoot）を受け取り、それを `Overlay` に渡すだけ。core 側は「描画先の ShadowRoot をもらう」としか知らない。この一点を守れば §3 の境界が成立する。

### 6.2 ソースファイルの解決 — このツールの心臓部

Vite dev server は**全ての `<style>` タグを `data-vite-dev-id` 属性つきで `<head>` に注入する**。この属性がソースファイルの絶対パスを持つ。

```ts
function sourceOf(sheet: CSSStyleSheet): string {
  const node = sheet.ownerNode as HTMLElement | null;
  return node?.dataset?.viteDevId    // Vite が注入した <style>
      ?? sheet.href                   // <link rel=stylesheet>
      ?? '(inline)';
}
```

`.astro` の scoped style も同じ経路を通るので、`src/components/Card.astro` まで解決できる。

**補助経路**: Astro の scoped style は要素に `data-astro-cid-XXXXXXXX` 属性を付ける。この属性値からコンポーネントを逆引きできるため、ルール解決が失敗したときのフォールバックになる。

### 6.3 ルールの走査

```ts
type Matched = {
  rule: CSSStyleRule;
  file: string;
  conditions: string[];   // 包んでいる @media / @supports / @container
  layer: string | null;   // @layer 名
  specificity: [number, number, number];
};

function walk(rules: CSSRuleList, ctx: Ctx, visit: (r: CSSStyleRule, ctx: Ctx) => void) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      visit(rule, ctx);
      // ネイティブ CSS ネスト: CSSStyleRule 自身が子ルールを持つ
      if (rule.cssRules?.length) {
        walk(rule.cssRules, { ...ctx, parentSelector: rule.selectorText }, visit);
      }
    } else if ('cssRules' in rule) {
      // CSSMediaRule / CSSSupportsRule / CSSLayerBlockRule / CSSContainerRule / CSSScopeRule
      walk(rule.cssRules, pushCondition(ctx, rule), visit);
    }
  }
}
```

#### ハマりどころ 3 点

1. **cross-origin stylesheet**: `sheet.cssRules` は cross-origin だと `SecurityError` を投げる。Google Fonts などが該当。走査全体を `try/catch` で囲み、読めないシートはスキップして UI に「解析不能」として出す（黙って落とさない）
2. **ネスト時の `&`**: ネストされたルールの `selectorText` は `& .title` のように相対セレクタで返る。そのまま `el.matches()` に渡すと例外になる。親セレクタに置換してから照合する
3. **`:has()` / `:is()` / `:where()`**: `el.matches()` は正しく評価するが、詳細度計算は別途対応が必要（`:where()` は 0、`:is()` は引数中の最大値）

### 6.4 詳細度とカスケード — 断定しない

詳細度計算は自前で実装する必要がある（ブラウザは API を公開していない）。ただし**「勝者を断定する」ことを仕様上の目標にしない**。

理由: `@layer` の順序、`!important`、`revert-layer`、Shadow DOM 境界、`@scope` の近接性まで正確に再現するのは、このツールの価値に対して割に合わない。

**代わりの設計**: 計算値（`getComputedStyle`）が唯一の真実であり、これは常に正しい。ツールは「候補ルール一覧 + 計算値」を並べ、**計算値と一致する宣言値を持つルールをハイライト**する。詳細度はソート順のヒントとしてのみ使う。

これなら間違った断定をせずに P1 が解決する。

### 6.5 距離計測アルゴリズム

```ts
function measure(a: DOMRect, b: DOMRect) {
  const horizontal =
    a.right <= b.left  ? { gap: b.left - a.right, dir: 'right' } :
    b.right <= a.left  ? { gap: a.left - b.right, dir: 'left'  } :
    null;   // 水平方向に重なっている

  const vertical =
    a.bottom <= b.top  ? { gap: b.top - a.bottom, dir: 'down' } :
    b.bottom <= a.top  ? { gap: a.top - b.bottom, dir: 'up'   } :
    null;

  if (!horizontal && !vertical) return contains(a, b) ? insets(a, b) : overlap(a, b);
  return { horizontal, vertical };
}
```

`getBoundingClientRect()` は `transform` 適用後の値を返す。これは**望ましい**（見えている距離が知りたいので）。ただし transform がかかっている要素では計算値と実測値がずれるため、パネルに `transform 適用中` のバッジを出す。

### 6.6 要素の取得（ヒットテスト）

外部ライブラリを使わないため、要素の拾い方を自前で決める必要がある。

```ts
function pick(x: number, y: number): Element | null {
  // elementFromPoint ではなく elementsFromPoint を使う。
  // オーバーレイやツールバー自身を除外するため配列で受ける必要がある。
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest('astro-dev-toolbar')) continue;  // ツールバー本体
    if (el.hasAttribute('data-caliper')) continue;
    return el;
  }
  return null;
}
```

- オーバーレイに `pointer-events: none` を付けていれば `elementsFromPoint` の結果にはそもそも入らないが、**保険として除外する**。ここが漏れると自分自身を計測して無限に混乱する
- Astro Dev Toolbar は Shadow DOM 内にあるため通常はホスト要素 `astro-dev-toolbar` として 1 つ返る。`closest()` で弾ける
- `Alt + ↑ / ↓` での親子移動は、取得した要素を起点に `parentElement` / `firstElementChild` を辿る。移動履歴を保持し、↓ で元の要素に戻れるようにする

### 6.7 オーバーレイの描画

ハイライト矩形・矢印・ガイド線を**単一の SVG レイヤー**に描く。要素ごとに div を作らない（DOM 生成コストと、レイヤー数の増加を避ける）。

```
<svg data-caliper style="position:fixed; inset:0; pointer-events:none">
  <rect  … 基準要素のハイライト />
  <rect  … hover 要素のハイライト />
  <line  … 距離の実線（端キャップ付き） />
  <line stroke-dasharray … 基準要素のエッジから伸ばすガイド線 />
  <g>    … 数値ラベル（背景矩形 + text） />
</svg>
```

**ガイド線（破線）が体験の核心**。Figma で距離が直感的に読めるのは、基準要素のエッジを対象要素まで延長した破線があるからで、実線の矢印だけだと「どこからどこまでか」が読み取れない。分離パターンでは必ず引くこと。

ラベル配置のルール:

- gap が十分広ければ矢印の中央に置く
- gap がラベル幅より狭ければ、矢印の外側（延長線上）に逃がす
- ビューポート端で反転させる

座標系は `position: fixed` + `getBoundingClientRect()` のビューポート座標で統一する。`pageX` 系と混ぜないこと（スクロール時にずれる）。

### 6.8 rect の無効化

計測中に対象がずれると数値が嘘になる。以下で再計算する。

- `scroll`（capture: true, passive: true）— 内側のスクロールコンテナも拾うため capture が必要
- `resize`
- ピン留め要素への `ResizeObserver`

ただし**再計算は rAF 内で 1 回だけ**。scroll イベントごとに `getBoundingClientRect()` を呼ぶと強制同期レイアウトが連発する。

### 6.9 エディタジャンプ

`launch-editor-middleware` を Astro integration の `astro:server:setup` フックで登録する。

```ts
// integration
'astro:server:setup': ({ server }) => {
  server.middlewares.use('/__caliper/open-in-editor', launchEditorMiddleware());
}
// client
fetch(`/__caliper/open-in-editor?file=${encodeURIComponent(file)}`);
```

**行番号について（設計上の分岐点）**:

CSSOM は**ルールの行番号を持たない**。`file:line` でジャンプするには追加の仕組みが要る。

- **M5（採用）**: ファイルを開くだけ。エディタ側でセレクタを検索してもらう。パネルにセレクタをコピーするボタンを置く
- **M6（任意）**: Vite plugin の `transform` フックで CSS を PostCSS でパースし、`selectorText → 行番号` のマップを作って `/__caliper/css-map` で配る。正確な行ジャンプが可能になるが、実装コストは M5 の数倍

M5 で不便さを実測してから M6 に進むこと。

---

## 7. パフォーマンス要件

`pointermove` 駆動なので、ここを外すとツール自体がガタつく。

- **rAF にコミットする**。`pointermove` ハンドラでは座標を ref に保持するだけにし、DOM 更新は `requestAnimationFrame` 内で 1 回だけ行う
- **オーバーレイの移動は `transform` と `opacity` のみ**。`top` / `left` / `width` / `height` をアニメーションしない（layout → paint → composite の全段が毎フレーム走る）
- **CSS 変数を親に毎フレーム設定しない**。全子要素のスタイル再計算が走る。対象要素の `transform` を直接更新する
- **ルール索引はキャッシュする**。`document.styleSheets` の全走査は hover ごとにやらない。初回に索引を構築し、HMR イベント（`import.meta.hot`）で無効化して再構築する
- `getComputedStyle()` は強制同期レイアウトを起こす。**読み取りを全部済ませてから書き込む**（read / write を混ぜない）

### 目標

hover 移動中に 60fps を維持すること。維持できないなら、それは計測ツールとして失格（測っている対象の挙動を変えてしまう）。

---

## 8. 正しさの床

`web-craft-floor` 由来。違反はバグとして扱う。

- 装飾オーバーレイに `pointer-events: none`（イベントを奪わない）
- インタラクティブ要素の内部テキストに `user-select: none`
- 更新される数値に `font-variant-numeric: tabular-nums`
- アイコンのみのボタンに `aria-label`
- `prefers-reduced-motion: reduce` でパネルの遷移をクロスフェードに置換
- hover 演出は `@media (hover: hover) and (pointer: fine)` で囲う
- `transform` / `opacity` 以外をアニメーションしない

---

## 9. 実装フェーズ

| Phase | 内容 | 目安 | 完了条件 |
| --- | --- | --- | --- |
| **M1** | Integration + Dev Toolbar App の器。SVG オーバーレイ + ヒットテスト + hover ハイライト | 半日 | ページに影響を与えずオーバーレイが出る |
| **M2** | 距離計測（ピン留め、分離 / 内包 / 交差、ガイド線、ラベル配置） | 半日 | **P2 の半分が解決し、日常的に使える状態になる** |
| **M3** | `data-vite-dev-id` からのルール解決。出自ファイル名の表示 | 半日 | **P1 が解決する。ここが本命** |
| **M4** | 宣言値 / 計算値 / 実測値の 3 列表示 + rem・vw 逆算 | 半日 | P2 が完全に解決する |
| **M5** | エディタジャンプ、パネル内容のコピー | 2 時間 | エージェントへの受け渡しが繋がる |
| **M6**（任意） | PostCSS による行番号マップ | 1 日 | `file:line` でジャンプできる |

**M2 を先に置く理由**は 2 つ。まず、距離計測は自己完結していて外部依存がなく、`elementsFromPoint` → rAF → SVG 更新という**この後の全機能が乗る土台**を先に検証できる。次に、M2 だけで毎日使えるツールになるため、M3 以降の設計を「実際に使いながら」決められる。

**M2 完成後、数日そのまま使うこと。** どのプロパティを既定表示すべきか（§F2 のリストは暫定値）は、実際の作業で何を見たくなったかでしか決まらない。ここを推測で埋めると、使わない列だらけのパネルになる。

M3 まで到達すれば、たとえ M4 以降を作らなくても元は取れている。

### 参考実装

SpacingJS（MIT, 約 300 行）は距離計測部分の**依存としてではなく読み物として**有用。特にラベルの衝突回避と、要素が入れ子になっている場合の扱いは実装済みの解が読める。ただしオーバーレイを div で構築しているため、§6.7 の SVG 単一レイヤー方針とは異なる。

---

## 10. リスクと既知の制約

| リスク | 影響 | 対処 |
| --- | --- | --- |
| オーバーレイ自身を計測してしまう | 数値が意味不明になる | §6.6 の除外を二重にかける（`pointer-events: none` + 属性チェック） |
| cross-origin stylesheet を読めない | 外部 CSS の出自が出ない | UI に「解析不能」として明示。黙って空欄にしない |
| ネスト時の `&` 解決漏れ | ルールを取りこぼす | ネスト CSS を含むテストページを用意して回帰確認 |
| 詳細度計算の不正確さ | 誤った勝者表示 | §6.4 の通り、断定せず計算値で照合する設計にして回避済み |
| HMR 後に索引が古くなる | 編集後に古い出自が出る | `import.meta.hot` で索引を無効化 |
| Astro Dev Toolbar App API の変更 | 動かなくなる | Astro のメジャー版を pin。API 面積を薄く保つ |
| CSSOM が行番号を持たない | 正確なジャンプ不可 | M5 はファイル単位。M6 で解決 |

---

## 11. ファイル構成

```
astro-caliper/
├─ package.json            … peerDependencies: astro ^5, vite ^6（§10 参照）
├─ src/
│  ├─ index.ts              … Astro Integration（config:setup / server:setup）  ★Astro依存
│  ├─ app.ts                … Dev Toolbar App エントリ。canvas を core に渡すだけ  ★Astro依存
│  ├─ core/                 … ここから下は DOM + CSSOM のみ。astro を import しない
│  │  ├─ stylesheet-index.ts  … styleSheets 走査・索引・HMR 無効化
│  │  ├─ resolve-source.ts    … sheet → ファイルパス。差し替え点（§3）
│  │  ├─ rule-matcher.ts      … el → Matched[]
│  │  ├─ specificity.ts       … 詳細度計算（ソート用）
│  │  ├─ hit-test.ts          … elementsFromPoint + 除外
│  │  ├─ measure.ts           … 距離算出
│  │  └─ units.ts             … px ⇄ rem / vw 逆算
│  ├─ ui/                   … 描画先の ShadowRoot を引数で受け取る。自分で探さない
│  │  ├─ overlay.ts           … ハイライト・矢印・ガイド線・ラベル（単一 SVG）
│  │  ├─ panel.ts             … 3 列表示パネル
│  │  └─ styles.css
│  └─ server/
│     └─ open-in-editor.ts    … launch-editor middleware
└─ playground/               … ネスト CSS・scoped style・clamp を含む検証ページ
```

**★印の 2 ファイル以外に `astro` を import しないこと。** これが §3 で述べた境界の実体で、守れているかは `grep -r "from 'astro" src/core src/ui` が空になるかで機械的に検証できる。CI に入れてもいい。

`playground/` を最初に作ること。「壊れやすい CSS の見本市」がないと、ルール解決の取りこぼしに気づけない。

---

## 12. 未決事項 — 判断が必要

以下は美的判断であり、仕様として値を決めていない。実装前に決めること。

- オーバーレイのハイライト色、矢印の色・太さ（既存の Astro Dev Toolbar のトーンに寄せるか、独自にするか）
- パネルのフォント（等幅か否か）とサイズ
- パネルの出現アニメーションの有無と duration / easing
- ピン留め要素と hover 要素の視覚的な区別のつけ方
- 既定表示するプロパティのセット（§F2 のリストは暫定値）

最後の項目だけは実測で決まる。M3 完成後、1 週間実際の作業で使ってから確定させること。
