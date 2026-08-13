# astro-styletrace — CSS inspection and review specification

Status: draft

Target release: first public beta

Last updated: 2026-08-13

## 1. Product definition

astro-styletrace は、AI coding agent が実装した Astro サイトの CSS について、人間が**どこに書かれ、ブラウザ上でどう効いているか**を理解し、自分で直すか agent へ任せるかを選べるローカル開発ツールである。

短い定義:

> AI が書いた CSS の出どころと作用を、人間が追跡して直すための道具。

英語での位置付け:

> Understand and review AI-written CSS in Astro.

astro-styletrace の中心は、agent に作業を送る機能ではない。中心にあるのは、実際のコンテンツが入ったブラウザで要素を選び、次を一度に確認できるインスペクターである。

```text
どの要素を見ているか
  → どのCSS宣言が関係しているか
  → browserの計算値はいくつか
  → 実際の寸法・距離はいくつか
  → どの.astro / CSSファイルの何行か
```

その理解を得たあと、利用者は修正の大きさに応じて二つの経路を選ぶ。

```text
小さな修正
  source file:lineを開く → 人間が編集 → HMRで確認

複雑な修正
  観測情報をagentへ渡す → agentが編集 → browserで確認
```

## 2. Problem statement

### 2.1 AI coding creates an ownership gap

AI agent へコーディングを依頼すると、コードを短時間で生成できる一方、人間が実装の過程を追わなくなる。その結果、動いている画面とソースコードの間にある実装地図を人間が持てなくなる。

特に CSS では、次の問いへすぐ答えられなくなる。

- この余白はどのファイルで指定されているか
- `.astro` の scoped style か、global CSS か、layout component か
- どの selector と shorthand が効いているか
- 表示中の宣言候補以外にも競合があるか
- 自身の margin か、親の gap か、兄弟との相殺か
- `var()` や `clamp()` が最終的に何pxになったか
- CSS上の値と目に見える距離がなぜ違うか

手書きで実装した場合、人間はファイル構成や selector を作業の記憶として持っている。agent が実装すると、その暗黙知が形成されない。コードは存在するが、人間が所有できていない状態になる。

astro-styletrace の第一の仕事は、**AIが書いたCSSの所在と作用を人間が取り戻すこと**である。

### 2.2 CSS cannot be fully constrained by documentation

ハーネス、プロンプト、`AGENTS.md`、コーディング規約、デザイントークンを整備することは重要だが、それだけで agent が期待どおりの CSS を実装できるとは限らない。

CSS の最終結果はソースコード単体で決まらない。

- 親、兄弟、包含ブロックとの関係
- cascade、継承、margin collapse
- flex / grid の分配
- `rem`、`clamp()`、`minmax()`、割合、viewport unit
- テキスト量、画像比率、CMSデータ
- viewportとbreakpoint
- browser layout algorithm

静的な規約は書き方を制約できるが、実コンテンツを入れた結果の構図、余白、読みやすさまでは保証できない。最後には人間がブラウザを見る必要がある。

### 2.3 Not every CSS fix should become an agent task

CSS修正の多くは、原因箇所さえ分かれば小さい。

- `gap`を少し変える
- marginを削る
- `max-width`を調整する
- line-heightを合わせる
- breakpointの値を直す

このような修正で、agentへ状況を説明し、応答を待ち、差分をレビューする方が時間がかかることがある。

したがって astro-styletrace は、人間を常にagentへ誘導しない。**人間が自分で直す経路を最短にし、複雑な場合だけagentへ委譲できる**ことを重要な設計原則とする。

### 2.4 Review should not change the viewport

通常のDevToolsをdockしてCSSを調べると、pageのviewportが狭くなり、調べる前と異なるbreakpointや折返しへ変わることがある。undockすれば回避できるが、pageとDevToolsの往復が増える。

astro-styletraceはpage内の小さなoverlayとして動作し、layout flowへ参加しない。人間はレビュー対象のviewportを保ったまま、sourceとgeometryを確認できる。

## 3. Why content-first websites and Astro

### 3.1 Content-first websites

アプリケーションUIでは、ボタン、フォーム、テーブル、モーダル等の反復的なコンポーネントと厳密なデザインシステムにより、agentの選択肢を狭めやすい。

一方、コンテンツ中心のWebサイトでは次の傾向がある。

- ページ固有のhero、editorial layout、記事導線が多い
- CMSやMarkdownから可変長コンテンツが入る
- 写真、図版、caption、proseがlayoutへ強く影響する
- 再利用性よりページ文脈に合わせた構成が優先される
- global style、layout、component-scoped styleが重なる
- breakpointごとの細かな視覚調整が多い
- デザインシステムで表現しきれない例外が残る

この領域では「ルールどおり書かれたか」より、「実コンテンツを入れた結果が意図どおりか」の比重が高い。

### 3.2 Why Astro

Astro はコンテンツ中心のWebサイトに適しており、astro-styletrace が対象とするCSSの複雑さが現れやすい。

- `.astro` componentとscoped style
- global stylesheetとlayout component
- Markdown / MDX / content collections / CMS data
- islandの外側を含む文書layout
- responsive typographyと画像中心の構成
- Astro 5 / 6 / 7にまたがるVite dev server

技術的にも、Astro Integrationはdev commandだけへclientとmiddlewareを注入できる。Viteの`data-vite-dev-id`と`.astro`原文の解析を組み合わせることで、実画面から元の`.astro` / CSSファイルへ辿れる。

Astro対応は最初の実装都合ではなく、**コンテンツファーストでCSSの理解と人間レビューが重要な領域へ集中する製品判断**である。

## 4. Product principles

1. **理解を最初に置く。** 修正やagent連携より前に、CSSの所在と作用を人間へ示す。
2. **人間の自己修正を第一級にする。** 小さな修正へreview formやagent handoffを要求しない。
3. **ソースへ最短で戻す。** propertyごとの`file:line`を直接開けるようにする。
4. **ブラウザが事実を測る。** computed styleとgeometryは実行中のページから取得する。
5. **断定しすぎない。** CSS宣言はwinnerではなくcandidateとして表現し、競合を示す。
6. **agent連携は追加経路である。** インスペクター単体で価値を完結させる。
7. **人間が委譲を選ぶ。** 特定agentやLLMへ自動送信しない。
8. **ブラウザ内でソース編集しない。** 永続的な変更は使い慣れたeditorで行う。
9. **小さく、Astro専用に保つ。** 汎用DevToolsやproject managementを目指さない。
10. **dev onlyを構造で保証する。** production buildへ何も含めない。

## 5. Target users and jobs

### 5.1 Primary users

- coding agentへAstroサイトの実装を依頼するWebデザイナー
- agentが生成したCSSをレビューするフロントエンドエンジニア
- 可変コンテンツと複雑なresponsive layoutを持つWebサイトの開発者

### 5.2 Primary jobs

優先順に並べる。

1. 画面上の要素から、関係するCSSの`file:line`を見つける
2. declared / computed / measuredを見て、何が起きているか理解する
3. 小さなCSS修正なら、その場でeditorへ移って自分で直す
4. HMR後の実画面で修正結果を確認する
5. 複雑な修正なら、同じ観測情報をagentへ正確に渡す
6. 将来的にはagentの修正を同じ条件で再計測する

### 5.3 Two core workflows

#### Workflow A — Understand and fix yourself

```text
違和感のある要素を選択
  → 宣言候補・computed・measured・sourceを読む
  → source file:lineをクリック
  → editorでCSSを修正
  → HMR後のpanelとoverlayで確認
```

これはbetaの主経路である。

#### Workflow B — Delegate a complex fix

```text
違和感のある要素を選択
  → 観測情報を構造化して取得
  → agentへ修正を依頼
  → agentが複数ファイルやresponsive behaviorを修正
  → 実画面で人間が確認
```

betaでは`Copy for agent`がこの経路を担う。CLI / MCPと自動再計測は後続フェーズとする。

## 6. Release scope

### 6.1 First public beta

現在の`src/`を製品の中核として公開品質へ仕上げる。

- Astro 5 / 6 / 7、Vite 6 / 7 / 8
- dev commandだけで起動するAstro Integration
- shortcutによるON / OFF
- hover hit testing
- primary elementの選択
- 選択要素とhover要素の距離計測
- separated / contained / overlappingのoverlay
- margin / padding box
- declared candidate / computed / measured
- shorthandからlonghandへの対応
- competing candidateの展開
- inherited typography source
- `.astro` scoped styleを含むsource `file:line`
- editor jump
- HMR / resize / scrollに追従
- `Copy for agent` fallback
- production buildへの非混入

### 6.2 Post-beta extensions

betaの人間向け体験を壊さない順序で追加する。

1. HMRやAstro navigation後の選択再解決
2. 構造化されたobservation JSON
3. 2要素を固定したrelation inspector
4. local CLI / MCPによるagent pull
5. 人間が指定した期待値のlive re-measure

### 6.3 Explicitly out of scope

- 汎用的なWeb annotation service
- コメントスレッド、担当者、severity、期限
- GitHub issue、commit、branch、PR同期
- screenshot中心のvisual regression
- console、network、application state収集
- agentやLLM APIの内蔵
- ブラウザ内CSS editor
- 自動的な原因診断や修正案生成
- デザインシステム生成
- DOM treeを含むDevTools全体の代替
- accessibility audit
- cloud storage、共有URL、remote MCP
- React / Vue / Svelteへの早期展開
- 本番環境や第三者サイトでの利用

## 7. Beta user experience

### 7.1 Setup

```bash
npm install -D astro-styletrace
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import styletrace from 'astro-styletrace';

export default defineConfig({
  integrations: [styletrace()],
});
```

パッケージ公開名と製品名は`astro-styletrace`とする。

### 7.2 Interaction model

| Action | Behavior |
| --- | --- |
| `Ctrl + Shift + C` | styletraceのON / OFF。設定可能 |
| `Alt`を押してhover | box modelと計測overlayを表示 |
| `Alt + Click` | 要素を選択しpanelを開く。同じ要素で解除 |
| 選択後に別要素をhover | 選択要素との距離を表示 |
| `Alt + ↑ / ↓` | hover targetを親 / 子へ移動 |
| `Esc` / panel外click | 選択解除してpanelを閉じる |

探索と読解を分ける。

- hover中はoverlayだけを更新する
- panelは選択要素へ固定し、hoverで内容を変えない
- `Alt`を押している間はpanelを減光する
- panel外clickは閉じるが、page側へのclickは妨げない
- ON状態は画面隅のindicatorで常に示す

### 7.3 Inspector panel

```text
┌──────────────────────────────────────┐
│ section.hero             1088 × 312 │
├──────────────────────────────────────┤
│ margin-top         .hero[data-…] +2 │
│ │ declared candidate  var(--space-l) │
│ │ computed            64px           │
│ │ measured            112px          │
│ src/pages/about.astro:84 ↗           │
│                                      │
│ row-gap             .content         │
│ │ declared candidate  2rem via gap   │
│ │ computed            32px           │
│ │ measured            48px           │
│ src/components/Hero.astro:42 ↗       │
├──────────────────────────────────────┤
│ Copy for agent                       │
│ Alt measure · Alt+Click select · …   │
└──────────────────────────────────────┘
```

UIの優先順位:

1. propertyと値
2. source `file:line`
3. competing candidates
4. `Copy for agent`

`Copy for agent`は残すが、source linkや値より強いCTAにしない。

### 7.4 Human self-fix flow

source link自体をclick targetとし、別の`Open` buttonは置かない。

```text
src/pages/about.astro:84 ↗
```

clickすると、`launch-editor-middleware`を経由して設定済みeditorの該当行を開く。

- propertyごとにsource linkを持つ
- lineを解決できなければfile先頭を開く
- competing candidateを展開した場合、各候補もsource linkを持つ
- open後もbrowserの選択とpanelを維持する
- HMR後に同じDOM nodeが残っていれば値を再計算する
- nodeが置換された場合は安全に選択を解除する。自動再解決はpost-beta

### 7.5 Why no browser CSS editor

人間の自己修正を支援するが、panel内でCSSを書き換える機能は作らない。

- 一時的なCSSOM変更とsource変更が混同される
- HMRで消える変更が生まれる
- format、lint、type checking、Git diffをeditorから切り離す
- 複数候補やshorthandのどこへ保存するか断定が必要になる

astro-styletraceは「直す場所と理由」を明らかにし、永続編集はeditorへ任せる。

### 7.6 Agent handoff in beta

`Copy for agent`は、選択要素について収集済みの事実をplain textでコピーする。

含める情報:

- element labelとborder box
- viewport
- property
- declared candidateとshorthand元
- computed
- measured
- selector
- source `file:line`
- competing candidate count

含めない情報:

- 原因の自然言語推測
- 自動生成した修正案
- DOM subtree全体
- input value等のページデータ
- API tokenやhome directory

これはコピー後の会話を完全自動化する機能ではなく、対象とCSS根拠の転記ミスを防ぐfallbackである。

## 8. Inspection semantics

### 8.1 Declared candidate

`declared candidate`は、対象propertyへ寄与する宣言をcascade weightで並べた最上位候補である。

- cascade winnerと断定しない
- shorthandは対象longhandへ割り当てる
- 元のpropertyを`via margin-block`等で示す
- 候補が複数なら`+N`を表示
- 展開時にselector、value、sourceを表示

candidateが1件でも、UIとコピーでは`declared candidate`という名称を維持する。

### 8.2 Computed

`getComputedStyle()`が返す解決済みvalueを表示する。

- pxへ解決できる値は小数1桁まで
- それ以外はbrowserの文字列を保持
- computedを唯一のCSS上のground truthとして扱う
- `var()`の内部展開過程やpxからremへの逆算は行わない

### 8.3 Measured

`getBoundingClientRect()`と周辺geometryから、目に見える寸法・距離を算出する。

- width / height: content boxまたは仕様上明示したbox
- margin: siblingまたはparent content boxとの実距離
- row-gap / column-gap: children間の実gap
- padding / typography: 無理にgeometryへ変換せずcomputedだけ

測れないpropertyにはもっともらしい値を出さない。

### 8.4 Divergence

computedとmeasuredの差が`0.5px`を超えた場合、rowを視覚的に強調する。ただしエラーとは断定しない。

差の原因例:

- margin collapse
- sibling margin
- flex / grid distribution
- `gap`と`justify-content`
- box sizing
- transform
- subpixel layout

### 8.5 Inheritance

`font-size`と`line-height`は、対象要素に宣言がなければancestorを遡って最初の宣言元を表示する。

```text
computed  16px ← body
```

継承しないpropertyではancestor探索を行わない。

### 8.6 Properties

宣言があるものだけを表示する。

```text
margin-top / margin-right / margin-bottom / margin-left
padding-top / padding-right / padding-bottom / padding-left
row-gap / column-gap
font-size / line-height
width / height
```

`width` / `height`は明示宣言がある場合だけrowを作る。border boxの実寸はpanel headerへ常時表示する。

## 9. Measurement overlay

### 9.1 Single element

選択なしのhoverでは次を表示する。

- border box
- width × height
- margin box
- padding box
- transform chainによるgeometry warning

### 9.2 Selected element and hover target

選択後に別要素をhoverすると、2要素の位置関係を表示する。

- separated: 重なっていないaxisのgap
- contained: 上下左右のinset
- overlapping: overlap geometry
- 選択要素自身をhoverした場合はrelationを表示しない

### 9.3 Drawing

- 単一SVG layer
- `position: fixed`
- `getBoundingClientRect()`のviewport座標で統一
- selected targetは実線
- hover targetは破線
- guide lineとdistance labelを表示
- labelがgapへ収まらない場合は外側へ逃がす
- viewport端でlabel位置を反転
- `pointer-events: none`

### 9.4 Invalidations

- scroll capture
- resize
- selected elementの`ResizeObserver`
- style / DOM mutation
- Vite HMR
- `astro:after-swap`

DOM readとSVG writeを`requestAnimationFrame`内で分離する。

## 10. CSS source resolution

### 10.1 Source file

Viteが注入する`<style data-vite-dev-id>`からsource pathを解決する。

```ts
function sourceOf(sheet: CSSStyleSheet): string {
  const node = sheet.ownerNode as HTMLElement | null;
  return node?.dataset.viteDevId ?? sheet.href ?? '(inline)';
}
```

`.astro` scoped styleも同じ経路で元componentまで辿る。

### 10.2 Selector to line map

CSSOMはsource lineを持たないため、Vite pluginの`transform` hookでmapを構築する。

- CSSをPostCSSでparse
- `.astro`はcompile後codeではなくoriginal fileを再読込
- `<style>` blockのoffsetを加算
- selectorをnormalizeしてline配列へ対応
- 同じselectorの複数出現をoccurrenceで区別
- `/__styletrace/css-map`からbrowserへ配布
- browser startup時に一度取得し、hoverごとにfetchしない

### 10.3 Selector normalization

- `[data-astro-cid-*]`を正規化
- quote差を吸収
- `*::before`と`::before`を正規化
- selector listを個別keyでも保持
- normalization logicをserverとbrowserで共有

### 10.4 CSS rule walking

- native nestingの`&`をparent selectorへ解決
- nested `@media` / `@supports` / `@layer` / `@container`を再帰走査
- `CSSNestedDeclarations`を取りこぼさない
- `:is()` / `:where()` / `:has()`を含むspecificityを計算
- cross-origin stylesheetの`SecurityError`を捕捉
- unreadable sheetを索引上は保持するがproperty sourceとして断定しない

### 10.5 Editor jump security

- queryのfile pathを正規化
- project root外を拒否
- lineは正のintegerだけ許可
- arbitrary commandを受け取らない
- editor選択は`LAUNCH_EDITOR` / `EDITOR`またはrunning editorへ任せる

## 11. Architecture

### 11.1 Current composition

```text
Astro Integration (src/index.ts)
  ├─ dev commandだけでpage scriptをinject
  ├─ CSS map Vite plugin
  ├─ /__styletrace/css-map
  └─ /__styletrace/open-in-editor

Browser boot (src/app.ts)
  ├─ host + ShadowRoot
  ├─ shortcut
  ├─ indicator
  └─ inspector
       ├─ hit testing
       ├─ stylesheet index / rule matcher
       ├─ metrics / geometry
       ├─ SVG overlay
       └─ source panel / agent context
```

### 11.2 Dependency boundaries

```text
src/
├─ index.ts                 Astro Integration
├─ app.ts                   browser boot
├─ css-map.ts               Node/Vite側のline map
├─ core/                    DOM/CSSOMによる観測ロジック
└─ ui/                      overlay、panel、indicator、styles
```

- `core/`と`ui/`は`astro`をimportしない
- Node built-insとVite pluginはbrowser bundleへ入れない
- Astro hook wiringは`index.ts`へ閉じ込める
- `check:boundary`で機械検査する
- 将来のCLI/MCP追加時も既存coreをlocal APIへ依存させない

### 11.3 Host isolation

- hostを`document.documentElement`直下へ追加
- ShadowRootへ全UIを描画
- page CSSをUIへ入れず、UI CSSをpageへ漏らさない
- hostに`data-styletrace`を付けhit testingから除外
- Astro Dev Toolbarも除外
- invisible panelは`pointer-events: none`

## 12. Post-beta agent extension

agent連携は製品の第二経路であり、beta公開を妨げない。

### 12.1 Structured observation

現在のplain text formatterの前に、versioned JSONを正本として導入する。

```ts
type InspectorObservation = {
  schemaVersion: 1;
  route: string;
  viewport: { width: number; height: number };
  target: {
    label: string;
    rect: { width: number; height: number };
  };
  metrics: MetricObservation[];
  warnings: string[];
};
```

panel、clipboard、将来のCLI/MCPは同じobservationを使う。

### 12.2 Local agent pull

copy + pasteを必須にしないため、将来的に最小のlocal interfaceを追加する。

```text
inspect_current_selection()
list_css_reviews()
get_css_review(id)
verify_css_review(id)
```

ただし最初から汎用review queue、thread、assignment、PR連携は作らない。

### 12.3 Relation review

複雑なCSS修正をagentへ渡す場合、人間はCSS propertyではなく視覚的関係を指定できるようにする。

- 2要素間距離
- edge alignment
- width / height
- containment / overflow
- human judgment only

これらはpost-betaであり、現行の選択・panel・editor jumpを置き換えない。

### 12.4 Live re-measure

agentの修正後に、同じroute、viewport、targetをbrowserで再解決してgeometryを比較する。

- passはhuman approvalではない
- observation不能をfailへ潰さない
- browserがない場合に古い値を返さない
- locatorがambiguousなら自動選択しない

## 13. UI and accessibility

### 13.1 Visual hierarchy

対象pageの視覚評価を妨げないよう、UIは無彩色中心、計測だけ青を使う。

- panel background: `#F2F2F2` 90% + blur
- primary text: `#000000`
- secondary text: `#4D4D4D`
- tertiary text / borders: `#808080` / `#B3B3B3`
- measurement / source link: `#0000FF`
- panel radius: `16px`
- spacing unit: `4px`
- number: `font-variant-numeric: tabular-nums`

### 13.2 Interaction quality

- panel headerはdrag可能
- drag後は自動配置を停止
- panelを閉じたらpin位置をreset
- source linkはkeyboard focus可能
- hoverだけに依存するactionを置かない
- linkは色だけでなくhover/focusでunderline
- hidden UIをtab orderから外す
- `prefers-reduced-motion`を尊重
- icon-only buttonには`aria-label`

### 13.3 Non-interference

- overlayは常に`pointer-events: none`
- page本来のcopy shortcutを奪わない
- global `Cmd/Ctrl + C`を使わない
- page clickを不要にconsumeしない
- animationはtransformとopacityだけ
- UI textは`user-select: none`、source value等必要箇所は例外可

## 14. Performance and reliability

- hover中60fpsを目標
- pointermoveでは座標だけ更新
- DOM readとUI writeをrAF内で分離
- stylesheet indexをcache
- source line mapをhoverごとにfetchしない
- `getComputedStyle()`呼出しをtarget変更時へ抑える
- HMRでstylesheet index、inherit cache、CSS mapを無効化
- scrollとresizeを1frameへ集約
- disconnected nodeを測定しない
- transform chainでは不正確なgeometryを出さない
- production non-inclusionをcompat testで保証

## 15. Security and privacy

- dev command以外ではclientとendpointを有効化しない
- source fileの任意read endpointを作らない
- editor jumpはproject root内だけ
- selectorとsource labelは`textContent`で描画
- DOM subtree、input value、cookie、localStorageをcopyしない
- 外部serviceへ自動送信しない
- screenshotを収集しない
- API keyを要求しない
- production buildへagent contextを含めない

## 16. Testing strategy

### 16.1 Existing beta checks

- TypeScript strict typecheck
- core / uiからAstroへのdependency boundary
- cascade ordering
- nested selector handling
- separated / contained geometry
- npm tarballによるcompat fixture
- production buildへのclient非混入
- dev script injection
- CSS map endpoint
- Astro 5 / 6 / 7

### 16.2 Add before public beta

- source linkのproject root制約
- competing candidateの各source jump
- HMR後のpanel再計算
- selected node disconnect時の安全な解除
- cross-origin stylesheetが全体を壊さないこと
- native nestingとnested at-ruleのline mapping
- clipboardからsensitive dataを除外
- package tarballの内容

### 16.3 Content fixtures

playgroundはcomponent showcaseではなく、実サイトに近いCSS条件を持つ。

- 可変長headline
- prose、画像、caption
- card grid
- nested layout
- global + scoped style
- native CSS nesting
- responsive typography
- margin collapse
- `clamp()`、`minmax()`、aspect ratio
- CMS相当の短文 / 長文切替

## 17. Implementation plan

現在の`src/`はprototypeではなく、完成系の中核である。大規模なagent bridgeへ進む前に、既存インスペクターを公開する。

### B0 — Public beta hardening

目的: 現行機能を人間が日常利用できる品質で公開する。

- package name衝突の解消
- beta version、LICENSE、prepack、publishConfig
- READMEを`Understand → Fix yourself → Delegate`へ改稿
- source jumpのpath validation
- source linkへ解決済みline numberを表示
- package tarball検証
- Astro 5 / 6 / 7 compatをCI相当で固定
- editor未検出時のerror message改善
- current testsの不足を補う

完了条件:

- clean installから要素選択、source jump、編集、HMR確認まで完走
- `pnpm check`と`pnpm check:compat`が成功
- `npm publish --dry-run --tag beta`が成功
- production buildへ何も混入しない

### B1 — Human workflow refinement

目的: agentへ頼まず自分で直す流れをさらに短くする。

- HMR後の選択維持を改善
- source候補の表示順とrelevanceをdogfoodで調整
- source jump成功 / 失敗feedback
- panelから修正前後の値を追いやすくする
- keyboardだけでsourceへ移動可能にする

完了条件:

- 小さなCSS修正でpromptやcopyを使わず完了できる
- HMR後に対象と変更結果を見失いにくい

### B2 — Structured observation

目的: 人間向け表示とagent handoffのデータを共通化する。

- versioned `InspectorObservation`
- current metricsからJSON serializer
- panelとclipboardを同じmodelから生成
- sensitive field exclusion
- plain text formatterをmodelのconsumerへ変更

完了条件:

- DOM class instanceを含まないJSONを生成できる
- 現行`Copy for agent`の情報量を後退させない

### B3 — Optional agent pull

目的: 複雑な修正だけcopy + pasteなしでagentへ渡す。

- current selectionのlocal session
- minimal CLI
- optional STDIO MCP adapter
- source / observation read tools
- agent vendorに依存しないschema

完了条件:

- インスペクター単体のinstall / startup pathへ影響しない
- agentが現在選択中の要素とCSS根拠をpullできる

### B4 — Relation review and verification

目的: 人間が複雑な見た目の期待をagentへ渡し、修正後に再計測する。

- 2-target固定selection
- distance / alignment / size / overflow expectation
- locator再解決
- live browser measurement
- human approvalとの分離

完了条件:

- agentの修正後に同じ視覚的関係を再計測できる
- current inspectorとself-fix workflowを複雑化しない

## 18. Beta acceptance scenarios

### Scenario A — Human fixes a simple spacing issue

1. agentが実装したarticle pageを開く
2. 人間が余白に違和感のあるheadingを選択
3. panelで`margin-bottom`候補、computed、measuredを確認
4. `.astro:line`をclickしてeditorを開く
5. 人間が1行修正する
6. HMR後の実画面とpanelで結果を確認する
7. agentへのpromptは不要

### Scenario B — Human discovers the real cause

1. card間隔が広すぎる画面を選択
2. card自身のmarginではなくparentの`gap`がsourceとして表示される
3. computed `32px`とmeasured `48px`の差を見る
4. competing layout declarationを展開する
5. 正しいsourceへ移動して修正する

### Scenario C — Human delegates a complex fix

1. mobileでhero layoutが崩れる
2. 人間がtargetを選択し`Copy for agent`を実行
3. agentがelement、viewport、source、candidate、geometryを受け取る
4. 複数breakpointと親layoutを修正する
5. 人間がbrowserで最終確認する

### Scenario D — Production remains clean

1. integrationを有効にしたまま`astro build`
2. production HTML / JSに`astro-styletrace/app`がない
3. editor endpointとCSS map endpointがproductionに存在しない

## 19. Success criteria

betaではtelemetryを送信しない。dogfoodingで次を記録する。

- 選択から正しいsource `file:line`へ到達するまでの時間
- source候補を取り違えた回数
- agentへ頼まず完了できたCSS修正の割合
- DevToolsを開かず完了できたCSS調査の割合
- `Copy for agent`後に対象説明を追加で書いた回数
- HMR後に対象や変更結果を見失った回数
- caliperがpage操作やframe rateを妨げた事例

最初の価値指標はagentによる自動化率ではない。

> AIが書いたCSSを、人間が自分のコードとして理解し直し、適切な方法で修正できたか。

## 20. Competitive boundary

astro-styletraceが勝つべき領域:

- Astroの`.astro` scoped CSSへのsource mapping
- property単位のeditor jump
- declared candidate / computed / measuredの区別
- margin、gap、alignment等の実geometry
- AI実装後に失われた人間の実装理解を取り戻す体験
- 自分で直す経路とagentへ任せる経路の両立
- 小さなdev-only integration

競合へ任せる領域:

- 汎用annotationとclient sharing
- screenshot、console、networkを含むbug report
- agent内蔵IDE
- task assignment、thread、PR連携
- multi-framework runtime inspection
- cloud verification

## 21. Decisions and deferred work

### Decided

| Topic | Decision |
| --- | --- |
| Product category | AI-written CSSの理解・修正を支援するAstro inspector |
| Primary workflow | 人間がsourceを理解して自分で直す |
| Secondary workflow | 複雑な修正をagentへhandoff |
| Current `src/` | 完成系の中核。置き換えず磨く |
| Source action | propertyごとの`file:line`を直接開く |
| Browser editing | 実装しない |
| Agent transport | betaはclipboard、将来local CLI / MCP |
| Privacy | local only、外部送信なし |
| Framework | Astroに集中 |

### Deferred

- HMR / Astro navigation後のlocator再解決
- 2要素を固定したrelation inspector
- local CLI / MCP
- 数値expectationとlive re-measure
- 複数viewport review
- typography assertion
- screenshot / perceptual diff
- persistent review file
- Git diffとの関連付け
- Vite generalization

これらは、現行インスペクターが人間の理解と自己修正に価値を示した後に判断する。
