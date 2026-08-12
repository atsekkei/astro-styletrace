# spec — astro-caliper

Astro + Vanilla TS 開発サーバー向けの、hover でスタイルの出自と要素間距離を表示するインスペクタ。
Astro Integration がクライアントスクリプトを注入し、ショートカットで起動する。DevTools を開かずに使う。

- パッケージ名: `astro-caliper`
- 形態: Astro Integration（`injectScript` + Vite middleware）
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
- **値の途中経過の説明**。`var()` の実体、`clamp()` の式、px → rem / vw の逆算はいずれも出さない。知りたいのは「CSS にどう書いてあるか」と「実地はいくらか」の 2 点であって、その間の導出過程ではない（§F2）
- **マッチしたルールの全件表示**。適用されている宣言だけを出す。詳細度・`@layer`・`!important` を UI に出さない（内部では候補の選定に使う。§6.4）
- **パネル内容のテキスト書き出し**。出自はファイルパスとセレクタの 2 つで足り、読んで打てる長さしかない

---

## 3. 前提環境

- Astro 4 以降（`injectScript` / `astro:server:setup` が安定している版）
- Vite dev server（Astro に内蔵）
- Astro Dev Toolbar は**無効化されていてよい**（`devToolbar: { enabled: false }`）。このツールは toolbar に依存しない
- 素の CSS / ネイティブ CSS ネスト / `.astro` の `<style>`
- Chromium 系を第一ターゲット。Safari / Firefox は best-effort

Tailwind やその他の CSS-in-JS は**初版では考慮しない**。ユーティリティクラスは「出自が 1 ファイルに集中する」ため、そもそもこのツールの課題設定に合わない。

### Astro 専用にする判断

出自解決の心臓部（`data-vite-dev-id`）は Vite の機能であり、Astro とは無関係に動く。したがって将来的に Vite 全般へ広げることは技術的に可能だが、**初版では意図的に Astro に絞る**。

理由:

1. Astro 環境でのみ `data-astro-cid-*` という**第 2 の解決経路**が使える（§6.2）。単一フレームワークに絞るほど堅くなる
2. `injectScript('page', ...)` で dev のみに注入する経路が用意されている。本番混入を防ぐ仕組みを自前で持たなくていい
3. 使うのは自分だけ。抽象化の受益者が存在しない

### Dev Toolbar App を使わない判断

初版は Astro Dev Toolbar App として実装していた（ShadowRoot・トグル UI・レイアウト非干渉が無料で手に入るため）。これをやめる。

理由: **Dev Toolbar 自体を常時 OFF にして開発したい。** 画面下部の常駐バーが邪魔で、実際ほとんど使わない。しかし toolbar を無効化すると Dev Toolbar App も動かないため、両立しない。ツールの起動をショートカットに寄せるなら、toolbar から降りるしかない。

降りることで自前で持つものが 3 つ増える。いずれも小さいが、忘れると壊れる（§6.1 / §6.6 / §F4）。

1. ShadowRoot の器
2. ヒットテストの自己除外の経路
3. ON / OFF の可視化

**ただし、後から切り出せる形は保っておく。** これは実質ゼロコストで効く保険。

- `src/core/` 配下は **DOM と CSSOM 以外に依存しない**。Astro の型も Dev Toolbar の API も import しない
- ソース解決は `resolveSource(sheet: CSSStyleSheet) => string` の 1 関数に閉じ込める。ここだけ差し替えれば別環境に移せる
- Astro 依存は `src/index.ts`（Integration）と `src/app.ts`（Toolbar App の器）の 2 ファイルにのみ存在してよい

この境界を守っていれば、Vite 版が必要になった時の作業は「器を作り直す」だけで済む。**守っていないと全面書き直しになる。** 差は数行の規律でしかないので、最初から守ること。

---

## 4. 機能仕様

### F1 — 距離計測モード

Figma の Alt+カーソルに相当。

- **基準要素の固定**: 要素を `Alt + Click` で選択する。選択中はハイライト表示が残る（選択はパネルの対象も兼ねる。§F4）
- **計測**: 選択後、別の要素に hover すると、2 要素間の距離を矢印と数値で表示する。選択要素そのものを hover しているときは測る相手がいないので出さない
- **位置関係の 3 パターンを出し分ける**:
  - **分離**: 水平・垂直それぞれの gap を表示（重なっていない軸のみ）
  - **内包**（一方が他方を含む）: 上下左右 4 方向の inset 距離を表示
  - **交差**: 重なり幅を負値または明示ラベルで表示
- **単独 hover**（選択なし）: hover 要素自身の `width × height` と、margin / padding のボックスを表示
- **Esc** で選択解除

### F2 — スタイル出自パネル

hover 要素に**適用されている宣言**を、プロパティごとに 1 ブロックとして表示する。ブロックは常に同じ形をしている。

```
margin-top                        .row[data-astro-cid-j7pv25f6]  +2
  declared   var(--space-l)
  computed   64px
  measured   64px
src/pages/index.astro ↗
```

| 行 | 取得元 | 例 |
| --- | --- | --- |
| declared | `rule.style.getPropertyValue(prop)` | `var(--space-l)` |
| computed | `getComputedStyle(el)[prop]` | `64px` |
| measured | `getBoundingClientRect()` 差分 | `64px` |
| セレクタ（右上） | `rule.selectorText` | `.row[data-astro-cid-j7pv25f6]` |
| 出自（下） | `styleSheet.ownerNode.dataset.viteDevId` | `src/pages/index.astro` |

**3 行並べることが仕様の核心**。declared と computed の乖離が P2 を解決し、computed と measured の乖離（margin 相殺、flex の分配、`gap` と `justify-content` の競合）がバグの発見点になる。

**一致していても畳まない。** 常に 3 行出す。畳むと「今どの列を見ているのか」が行ごとに変わり、目が毎回位置を探し直すことになる。ブロックの形が固定であることのほうが、数行ぶんの高さより価値がある。

`measured` が算出できないプロパティ（要素が 1 つしかない `row-gap` など）ではその行を落とす。**その場合も declared / computed の位置は動かさない。**

#### 表示するプロパティ

**宣言があるものだけを出す。** 「レイアウト関連を既定表示、残りは折り畳み」という切り分けはやめる。宣言されていないプロパティの行は、そもそも直しに行く先がない。

対象となる longhand:

```
margin-top / margin-right / margin-bottom / margin-left
padding-top / padding-right / padding-bottom / padding-left
row-gap / column-gap
font-size / line-height
width / height
```

- ショートハンド（`margin-block`、`gap`、`inset` など）で書かれていた宣言は longhand に割り当てて出す。declared 行には**書かれていたプロパティ名を添える**（`var(--space-l) via margin-block`）
- `width` / `height` は**明示的な宣言があるときだけ**行を立てる。実寸はパネル右上に常時出ているので、宣言が無ければ重複でしかない
- 並び順は `margin` → `padding` → `gap` → `font-size` / `line-height` → `width` / `height`

#### 継承で決まっているとき

`font-size` / `line-height` に限り、**その要素に宣言が無ければ継承元を辿って出す**。「なぜこの文字が 16px なのか」は継承元を知りたい質問であり、宣言が無いときこそ答えが要る。

- 親方向へ遡って最初に宣言を持つ要素を探し、その要素・セレクタ・出自を表示する
- 継承であることが分かる形にする（`16px ← body`）
- 他のプロパティには適用しない。継承しないプロパティで遡っても意味がない

#### 同一プロパティが複数箇所で宣言されているとき

declared に出すのは詳細度で選んだ**最有力候補**であって、勝ったルールではない（§6.4）。したがって候補が外れている可能性が常にある。外れていることは declared / computed の並びでは検出できない（`var(--space-l)` と `64px` は正しく解決されていても文字列としては一致しないため、乖離が常態）。

**対処**: 同じ longhand を担う宣言が他にもある場合、ブロック右上に件数を出す（`+2`）。クリックで残りの宣言をその場に展開し、それぞれのセレクタと出自を出す。既定は畳んだまま。

これは一覧機能ではなく、**「表示している 1 件が外れているかもしれない」という信号**である。件数が付いていない行は候補が 1 つしかないので、そのまま信じてよい。

### F3 — エディタジャンプ

各ブロックの出自ファイル名をクリックするとエディタで開く。§6.9 参照。

- 行番号マップが引けるなら `file:line` へ、引けなければファイル先頭へ
- ブロックごとに出自が違いうる（リセット CSS + グローバル + scoped style が混ざる）ため、**リンクはブロック単位で持つ**。パネル単位でまとめない
- `open` / `copy` のようなボタンは置かない。ファイル名自体がリンクであれば足りる

### F4 — 起動と終了

- **ショートカットで ON / OFF**（既定 `Ctrl + Shift + C`。統合オプションで差し替え可能）。Astro Dev Toolbar には依存しない
- ON の間は `Alt` 押下中のみ計測オーバーレイが出る（Alt を離すと消える）。常時表示だと通常の操作ができない
- **ON であることが分かる常駐表示を持つ**。ショートカットで入るモードは状態が見えないと迷う。画面隅に小さいインジケータを出す（Alt を押していない間も表示）

#### 探すことと読むことを分ける

オーバーレイとパネルを同じ状態に載せない。ホバーに追従するパネルは、探索中は視界を横切る邪魔者であり、読もうとすると手を止めた瞬間に対象が変わる。

- **パネルの既定は非表示。** `Alt` 押下中（＝探索中）も出さない。オーバーレイだけで寸法と距離は読める
- **`Alt + Click` は「選択」。** 距離計測の基準点であると同時に、パネルが映す対象でもある。この 2 つを別々に持たない。パネルの内容はホバーでは書き換わらない
- **選択があること = パネルが開いていること。** 状態を 1 つにする。選択解除の経路（`Esc` / 同じ要素の再クリック / パネル外クリック）は全て「解除して閉じる」で揃える
- 表示中に `Alt` を押し直したらパネルは**消さずに `opacity: .2` へ落とす**。消すと押すたびに現れ直して落ち着かず、位置も見失う。落ちている間は `pointer-events: none` にして下の要素を測れるようにする
- パネル外クリックは**閉じるだけでページに伝播させる**。caliper はモーダルではなく観察器なので、ページ操作を 1 回飲み込むほうが害が大きい
- 透明なまま板を残さない。非表示のパネルは `pointer-events: none`（不可視の板がページのクリックを奪う）

---

## 5. UI 仕様

### レイアウト非干渉

Dev Toolbar App をやめたため、**器は自前で持つ**（§3）。

- host 要素を 1 つ作り、`attachShadow({ mode: 'open' })` した中に全てを描く。ページの CSS は入ってこないし、こちらの CSS も漏れない
- host は `document.documentElement` 直下に置く。`body` 直下に足すと `body > *:last-child` / `:nth-child()` を使っているページに影響が出る
- host は `position: fixed`。ドキュメントフローに参加させない
- オーバーレイの全要素に `pointer-events: none`。イベントを奪ってはならない
- パネル本体（クリック可能）のみ `pointer-events: auto`
- オーバーレイのテキストに `user-select: none`

### キーバインド

| キー | 動作 |
| --- | --- |
| `Ctrl + Shift + C`（既定） | astro-caliper の ON / OFF |
| `Alt`（押下中） | 計測オーバーレイ表示（パネルは出さない） |
| `Alt + Click` | 要素を選択（＝距離計測の基準 + パネルの対象）。同じ要素で解除 |
| `Esc` / パネル外クリック | 選択解除 + パネルを閉じる |
| `Alt + ↑ / ↓` | hover 要素を親 / 子へ移動（細かい要素を掴むため） |

起動ショートカットは統合オプションで差し替えられること。ページ側のハンドラと衝突したときに逃げ道が無いと詰む。

### デザイントークン

```
font-family    Inter, system-ui, sans-serif
font-size      14px（値・プロパティ名） / 12px（ラベル・出自・セレクタ）
line-height    1.2
space unit     4px（余白は全てこの倍数）
radius         16px（パネル） / 4px（インジケータなどの小片）
```

| 役割 | 値 |
| --- | --- |
| パネル背景 | `#F2F2F2` 90% + `backdrop-filter: blur()` |
| 主テキスト（値・プロパティ名） | `#000000` |
| 副テキスト（`declared` / `computed` / `measured` のラベル） | `#4D4D4D` |
| 三次テキスト（セレクタ、件数バッジ） | `#808080` |
| 罫・区切り・ブロックの縦罫 | `#B3B3B3` |
| リンク（出自ファイル名） | `#0000FF` |

- パネルの内側の余白は 16px、ブロック間は 16px、ブロック内の行間は 4px の倍数で刻む
- **明色のパネルが明色のページの上に出る**ので、背景 90% と blur だけでは輪郭が消える。`#B3B3B3` の 1px ボーダーか影で境界を必ず作る
- 区切り線は破線で軽く。実線の罫を増やすと表が固くなる

### 数値表示

- **`font-variant-numeric: tabular-nums` 必須**。等幅フォントをやめた以上、これが無いと hover 移動中に桁が踊る。Inter は tabular figures を持っているので指定すれば効く
- 小数は 1 桁まで（`28.8px`）。それ以上は視覚ノイズ

### パネルの構造

```
┌─────────────────────────────────┐
│ section.row          1088 × 144 │  ← 見出し。要素の記述 + 実寸
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│ margin-top      .row[data-…] +2 │  ← プロパティ名 / セレクタ / 候補件数
│ │ declared  var(--space-l)      │
│ │ computed  64px                │
│ │ measured  64px                │
│ src/pages/index.astro ↗         │  ← 出自リンク
│                                 │
│ …（ブロックが続く）             │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│ Alt measure · Alt+Click pin · … │  ← キーバインドのヒント
└─────────────────────────────────┘
```

- 見出しは sticky。スクロールしても「今どの要素を見ているか」を失わない
- ブロックの左には `#B3B3B3` の縦罫を 1 本引き、declared / computed / measured がひとまとまりであることを示す
- ラベル列（`declared` など）は 12px・`#4D4D4D`、値は 14px・`#000000`。**強さの差はサイズと濃度でつける。ラベルを右揃えにしない**（値の左端が揃っていることのほうが重要）
- 状態バッジは `transformed` のみ。見出し行に置く
- **要素によらず同じ内容が出続けるものはバッジにしない。** `cid …`（Astro のスコープ属性）と `unreadable: …`（読めなかったシート）はどちらも文書単位の事実なので、要素ごとのパネルに出すと常時点いている飾りにしかならない。前者はセレクタに既に現れており、後者を出すならインジケータ側（§F4）が居場所。`pinned` も同様で、パネルは選択要素しか映さない以上（§F4）常時点く
- 出自リンクは既定のブラウザリンク装飾を使わない。下線は hover 時のみ、`↗` は小さく。**値より目立たせない**

### パネルの位置

hover 要素の近傍にフローティング。ビューポート端で反転させる。ただし**追従アニメーションは付けない**（毎フレーム動く対象に慣性を付けると読めなくなる）。

### オーバーレイの配色

パネルが無彩色 + 青になったため、ページ上に描く SVG も**同じ体系に寄せる**。パネルとオーバーレイが別のツールに見えてはいけない。

| 役割 | 値 |
| --- | --- |
| hover 要素の枠 | `#0000FF` |
| 選択要素の枠 | `#000000` |
| 計測の矢印・ガイド線・ラベル | `#0000FF` |
| margin ボックスの塗り | `#0000FF` 10% |
| padding ボックスの塗り | `#0000FF` 20% |

選択と hover の区別は**色ではなく線種**でつける（選択は実線、hover は破線）。彩度を 1 色に絞ったぶん、区別は形に持たせる。

---

## 6. 技術仕様

### 6.1 アーキテクチャ

```
astro.config.mjs
  └─ integrations: [caliper({ shortcut: 'Ctrl+Shift+C' })]
       │
       ├─ astro:config:setup
       │    └─ if (command === 'dev') injectScript('page', boot)   ← クライアント側
       │
       └─ astro:server:setup
            └─ server.middlewares.use('/__caliper/open-in-editor', launchEditor)
            └─ server.middlewares.use('/__caliper/css-map', ...)   ← M6
```

`injectScript('page', ...)` は **`command === 'dev'` のときだけ呼ぶ**。これが本番混入を防ぐ唯一の関門なので、条件を外さないこと。

クライアント側 `app.ts` の責務:

```
boot()                             ← ここだけが Astro を知っている
  ├─ host = <div> + attachShadow() … 器を自前で作る（§5）
  ├─ ショートカットの待ち受け      … ON / OFF
  ├─ インジケータ                  … ON であることの可視化
  └─ createInspector(shadowRoot)
       ├─ StyleSheetIndex   … document.styleSheets を走査してルールを索引化
       ├─ RuleMatcher       … el → マッチしたルール[] を解決
       ├─ Measurer          … 2 要素間の距離を算出
       ├─ Overlay           … ShadowRoot に描画
       └─ Panel             … ShadowRoot に描画
            ↑ 以上は core / ui。DOM + CSSOM のみに依存する（§3 参照）
```

`boot` が ShadowRoot を作り、それを `createInspector` に渡すだけ。core / ui 側は「描画先の ShadowRoot をもらう」としか知らない。この一点を守れば §3 の境界が成立する。

**Dev Toolbar App 時代との差分は `boot` の中身だけ**であること。器の作り方が変わっても core が変わらないなら、§3 の境界は正しく引けている。

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

**補助経路**: Astro の scoped style は要素に `data-astro-cid-XXXXXXXX` 属性を付ける。ルール解決が失敗したときのフォールバックとして逆引きに使える。

ただし**単独では表示しない**。scoped style がマッチしていればセレクタに `[data-astro-cid-…]` として既に現れているため、それとは別に cid を出しても同じ文字列が 2 度出るだけになる。

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

1. **cross-origin stylesheet**: `sheet.cssRules` は cross-origin だと `SecurityError` を投げる。Google Fonts などが該当。走査全体を `try/catch` で囲み、読めないシートはスキップする。索引は「読めなかったシート」を保持し続ける（黙って捨てない）が、**パネルには出さない**（§5）。実態としてほぼ常に Web フォントであり、要素ごとに出しても情報量がゼロだったため
2. **ネスト時の `&`**: ネストされたルールの `selectorText` は `& .title` のように相対セレクタで返る。そのまま `el.matches()` に渡すと例外になる。親セレクタに置換してから照合する
3. **`:has()` / `:is()` / `:where()`**: `el.matches()` は正しく評価するが、詳細度計算は別途対応が必要（`:where()` は 0、`:is()` は引数中の最大値）
4. **ネストした at-rule 直下の宣言**: `.card { gap: 1rem; @media (…) { gap: 2rem } }` の内側の宣言は、`selectorText` を持たない `CSSNestedDeclarations` として現れる。`selectorText` の有無でルールを判定していると丸ごと落ちる。セレクタは親（解決済み）をそのまま使うこと——ここで `resolveNesting` に通すと `.card .card` になって二度と一致しない

### 6.4 詳細度とカスケード — 断定しない

詳細度計算は自前で実装する必要がある（ブラウザは API を公開していない）。ただし**「勝者を断定する」ことを仕様上の目標にしない**。

理由: `@layer` の順序、`!important`、`revert-layer`、Shadow DOM 境界、`@scope` の近接性まで正確に再現するのは、このツールの価値に対して割に合わない。

**代わりの設計**: 計算値（`getComputedStyle`）が唯一の真実であり、これは常に正しい。ツールは「最有力候補の宣言値 + 計算値」を並べ、候補が複数あるときは件数だけを添える（§F2）。詳細度はソート順のヒントとしてのみ使う。

これなら間違った断定をせずに P1 が解決する。

**詳細度計算は UI から消えても残る。** `+2` の件数表示に詳細度の数値は出さないが、「どれを最有力候補として declared に出すか」の選定に使っているため、[`specificity.ts`](src/core/specificity.ts) は必要。表示を消すこととロジックを消すことを混同しないこと。

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
    if (el.hasAttribute('data-caliper')) continue;   // 自前の host / パネル / オーバーレイ
    if (el.closest('astro-dev-toolbar')) continue;   // toolbar が有効なままの環境向け
    return el;
  }
  return null;
}
```

- オーバーレイに `pointer-events: none` を付けていれば `elementsFromPoint` の結果にはそもそも入らないが、**保険として除外する**。ここが漏れると自分自身を計測して無限に混乱する
- **Dev Toolbar App をやめたことで、除外の主経路が `astro-dev-toolbar` から自前 host の `data-caliper` に移る**（§3）。host 要素に必ず `data-caliper` を付けること。Shadow DOM の中身は `elementsFromPoint` では host として 1 つ返るので、host に付いていれば内部は全て弾ける
- toolbar が有効なままの環境もありうるので、`astro-dev-toolbar` の除外は残す
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
- 選択要素への `ResizeObserver`

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

**行番号について**:

CSSOM は**ルールの行番号を持たない**。`file:line` でジャンプするには追加の仕組みが要る。

Vite plugin の `transform` フックで CSS を PostCSS でパースし、`selectorText → 行番号` のマップを作って `/__caliper/css-map` で配る（M6・実装済み）。マップが引ければ `file:line`、引けなければファイル先頭へ落とす。

**セレクタのコピーボタンは置かない。** 行が引けるならジャンプで足り、引けない場合もセレクタはブロック右上に表示されているので読んで打てる。ボタンを置く価値がない（§2）。

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
- **明色パネルのコントラスト**: `#808080` on `#F2F2F2` は 3.5:1 程度しかない。12px の文字に使う以上、セレクタ・件数バッジのような**補助情報にのみ**使い、値やラベルには使わない
- **`#0000FF` のリンクは色だけで示さない**。hover / focus で下線を出し、キーボードフォーカスの輪郭を必ず持つ

---

## 9. 実装フェーズ

| Phase | 内容 | 目安 | 完了条件 | 状態 |
| --- | --- | --- | --- | --- |
| **M1** | Integration + 器。SVG オーバーレイ + ヒットテスト + hover ハイライト | 半日 | ページに影響を与えずオーバーレイが出る | 済 |
| **M2** | 距離計測（ピン留め、分離 / 内包 / 交差、ガイド線、ラベル配置） | 半日 | **P2 の半分が解決し、日常的に使える状態になる** | 済 |
| **M3** | `data-vite-dev-id` からのルール解決。出自ファイル名の表示 | 半日 | **P1 が解決する。ここが本命** | 済 |
| **M4** | 宣言値 / 計算値 / 実測値の 3 列表示 | 半日 | P2 が完全に解決する | 済 |
| **M5** | エディタジャンプ | 2 時間 | 出自から直接コードへ飛べる | 済 |
| **M6** | PostCSS による行番号マップ | 1 日 | `file:line` でジャンプできる | 済 |
| **M7** | **パネル再設計 + Dev Toolbar App からの離脱** | 1 日 | 下記 3 条件 | — |

**M2 を先に置いた理由**は 2 つ。まず、距離計測は自己完結していて外部依存がなく、`elementsFromPoint` → rAF → SVG 更新という**この後の全機能が乗る土台**を先に検証できる。次に、M2 だけで毎日使えるツールになるため、M3 以降の設計を「実際に使いながら」決められる。

### M7 の完了条件

実際に使った結果、パネルが「読む対象」ではなく「確かめる対象」であることが分かったので、それに合わせて削る。

1. **Dev Toolbar を無効化した状態で起動できる**（ショートカット + 自前 ShadowRoot + ON インジケータ。§3 / §6.1）
2. **パネルが §F2 の形になっている**（ブロック単位・常時 3 行・宣言があるものだけ・`+2` バッジ・継承の遡り）
3. **削除が完了している**: `var()` 展開 / rem・vw 逆算 / マッチルール一覧 / 詳細度と `@layer` の表示 / `open`・`copy`・`copy all` ボタン / レイアウト系トグル
4. **パネルの出方が §F4 の「探すことと読むことを分ける」になっている**（既定非表示・選択で開く・減光・パネル外クリックで閉じる）

M7 は**足す作業ではなく削る作業**である。3 番目が終わっていないなら完了していない。

### 参考実装

SpacingJS（MIT, 約 300 行）は距離計測部分の**依存としてではなく読み物として**有用。特にラベルの衝突回避と、要素が入れ子になっている場合の扱いは実装済みの解が読める。ただしオーバーレイを div で構築しているため、§6.7 の SVG 単一レイヤー方針とは異なる。

---

## 10. リスクと既知の制約

| リスク | 影響 | 対処 |
| --- | --- | --- |
| オーバーレイ自身を計測してしまう | 数値が意味不明になる | §6.6 の除外を二重にかける（`pointer-events: none` + 属性チェック） |
| cross-origin stylesheet を読めない | 外部 CSS の出自が出ない | 索引側では捨てずに保持する。ただしパネルには出さない（§6.3）。出すならインジケータ側 |
| ネスト時の `&` 解決漏れ | ルールを取りこぼす | ネスト CSS を含むテストページを用意して回帰確認 |
| 詳細度計算の不正確さ | 誤った候補を declared に出し、**編集しても変わらないファイルへ誘導する** | §6.4 の通り断定しない。加えて候補が複数あるときは `+2` で件数を出し、信じてよい行かどうかを示す（§F2） |
| HMR 後に索引が古くなる | 編集後に古い出自が出る | `import.meta.hot` で索引を無効化 |
| 自前 host がページの CSS に拾われる | `body > *:last-child` などが誤爆する | host を `documentElement` 直下に置く（§5）。それでも `html > *` を使うページには影響しうるので playground で確認 |
| 起動ショートカットがページ側と衝突 | 起動できない / ページの機能が壊れる | 統合オプションで差し替え可能にする（§5） |
| ON なのに気づかず操作する | `Alt + Click` がページのリンクを踏まなくなる | 常駐インジケータで ON を可視化（§F4） |
| Astro の `injectScript` API の変更 | 動かなくなる | Astro のメジャー版を pin。API 面積を薄く保つ |
| CSSOM が行番号を持たない | 正確なジャンプ不可 | M6 の行番号マップで解決。引けなければファイル先頭 |

---

## 11. ファイル構成

```
astro-caliper/
├─ package.json            … peerDependencies: astro ^5, vite ^6（§10 参照）
├─ src/
│  ├─ index.ts              … Astro Integration（config:setup / server:setup）  ★Astro依存
│  ├─ app.ts                … boot。host + ShadowRoot を作り、ショートカットを待ち受ける  ★Astro依存
│  ├─ core/                 … ここから下は DOM + CSSOM のみ。astro を import しない
│  │  ├─ stylesheet-index.ts  … styleSheets 走査・索引・HMR 無効化
│  │  ├─ resolve-source.ts    … sheet → ファイルパス。差し替え点（§3）
│  │  ├─ rule-matcher.ts      … el → Matched[]
│  │  ├─ specificity.ts       … 詳細度計算（候補の選定用。UI には出さない。§6.4）
│  │  ├─ hit-test.ts          … elementsFromPoint + 除外
│  │  ├─ measure.ts           … 距離算出
│  │  ├─ metrics.ts           … declared / computed / measured の組み立て
│  │  ├─ inherit.ts           … font-size / line-height の継承元探索（§F2）
│  │  └─ units.ts             … 数値の整形のみ。rem / vw 逆算は持たない（§2）
│  ├─ ui/                   … 描画先の ShadowRoot を引数で受け取る。自分で探さない
│  │  ├─ overlay.ts           … ハイライト・矢印・ガイド線・ラベル（単一 SVG）
│  │  ├─ panel.ts             … 出自パネル
│  │  ├─ indicator.ts         … ON であることの常駐表示（§F4）
│  │  └─ styles.ts            … トークンと CSS。文字列で持つ（Vite に拾わせないため）
│  └─ server/
│     └─ open-in-editor.ts    … launch-editor middleware
└─ playground/               … ネスト CSS・scoped style・clamp を含む検証ページ
```

**★印の 2 ファイル以外に `astro` を import しないこと。** これが §3 で述べた境界の実体で、守れているかは `grep -r "from 'astro" src/core src/ui` が空になるかで機械的に検証できる。CI に入れてもいい。

`playground/` を最初に作ること。「壊れやすい CSS の見本市」がないと、ルール解決の取りこぼしに気づけない。

---

## 12. 未決事項 — 判断が必要

### 決着した項目（M7 で確定）

| 項目 | 決定 |
| --- | --- |
| パネルのフォントとサイズ | Inter / 14px・12px / line-height 1.2（§5） |
| パネルの配色 | 明色。`#F2F2F2` 90% + blur、テキストは `#000000` / `#4D4D4D` / `#808080`、罫 `#B3B3B3`、リンク `#0000FF`（§5） |
| オーバーレイの配色 | `#0000FF` 主体、選択は `#000000`（§5） |
| 選択と hover の区別 | 色ではなく線種（選択は実線 / hover 破線）（§5） |
| 表示するプロパティのセット | 宣言があるものだけ。ショートハンドは longhand へ割り当て（§F2） |
| 器 | Dev Toolbar App をやめて自前 ShadowRoot + ショートカット（§3） |

### 残っている未決

- **パネルの出現アニメーションの有無と duration / easing**。`transform` / `opacity` のみという制約（§8）の中で決める
- **矢印・ガイド線の太さ**。1px だと Retina 以外で消え、2px だと計測対象を隠す
- **起動ショートカットの既定値**。`Ctrl + Shift + C` は DevTools の要素選択と衝突する環境がある。実際に踏んでから決めてよい（差し替え可能にしてあるため詰まない）
- **インジケータの置き場所**。画面隅は 4 つあるが、パネルが hover 要素を追って動く以上、どこに置いてもいつかは重なる
