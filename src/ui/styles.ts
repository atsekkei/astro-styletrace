/**
 * ShadowRoot に流し込むスタイル（§5）。
 *
 * .css ファイルにすると Vite が dev server 経由でページ全体に注入してしまうため
 * （ShadowRoot に閉じ込められない）、文字列として持つ。
 *
 * トーン: 明色・無彩色 + 1 色。読む対象ではなく確かめる対象なので、装飾を持たせない。
 */

export const TOKENS = {
  ink: '#000000',
  ink2: '#4D4D4D',
  ink3: '#808080',
  rule: '#D9D9D9',
  accent: '#0000FF',
  surface: '#F2F2F2',

  /** オーバーレイ。パネルと同じ体系に寄せる（§5） */
  margin: 'rgba(0, 0, 255, 0.10)',
  padding: 'rgba(0, 0, 255, 0.20)',
  overlapFill: 'rgba(0, 0, 255, 0.12)',
  labelBg: '#0000FF',
  labelText: '#FFFFFF',
} as const;

/** 余白は全てこの倍数（§5） */
const U = 4;

export const CSS = `
:host {
  --cal-ink: ${TOKENS.ink};
  --cal-ink-2: ${TOKENS.ink2};
  --cal-ink-3: ${TOKENS.ink3};
  --cal-rule: ${TOKENS.rule};
  --cal-accent: ${TOKENS.accent};
  --cal-surface: ${TOKENS.surface};

  --cal-font: Inter, system-ui, -apple-system, "Hiragino Sans", sans-serif;
  --cal-size: 14px;
  --cal-size-s: 12px;
  --cal-u: ${U}px;
}

.cal-svg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2147483000;
  overflow: visible;
}

.cal-label-text {
  font-family: var(--cal-font);
  font-size: var(--cal-size-s);
  font-variant-numeric: tabular-nums;
  fill: ${TOKENS.labelText};
  user-select: none;
}

/* ---- ON インジケータ（§F4） ---- */

.cal-indicator {
  position: fixed;
  left: ${U * 4}px;
  bottom: ${U * 4}px;
  z-index: 2147483001;
  display: none;
  align-items: center;
  gap: ${U * 2}px;
  padding: ${U * 1.5}px ${U * 2.5}px;
  border-radius: ${U}px;
  border: 1px solid var(--cal-rule);
  background: color-mix(in srgb, var(--cal-surface) 90%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--cal-ink-2);
  font-family: var(--cal-font);
  font-size: var(--cal-size-s);
  line-height: 1.2;
  pointer-events: none;
  user-select: none;
}

.cal-indicator[data-visible="true"] {
  display: flex;
}

.cal-indicator::before {
  content: "";
  width: ${U}px;
  height: ${U}px;
  border-radius: 50%;
  background: var(--cal-accent);
}

.cal-indicator b {
  color: var(--cal-ink);
  font-weight: 600;
}

/* ---- パネル ---- */

.cal-panel {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483002;
  box-sizing: border-box;
  width: 400px;
  max-width: calc(100vw - ${U * 8}px);
  max-height: min(70vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: ${U * 4}px;
  /* 明色パネルが明色ページの上に出る。90% + blur だけでは輪郭が消える（§5） */
  border: 1px solid var(--cal-rule);
  background: color-mix(in srgb, var(--cal-surface) 90%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 ${U * 2}px ${U * 8}px -${U * 2}px rgba(0, 0, 0, 0.25);
  color: var(--cal-ink);
  font-family: var(--cal-font);
  font-size: var(--cal-size);
  line-height: 1.2;
  /* 等幅をやめた以上これが無いと hover 移動中に桁が踊る（§5 / §8） */
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  opacity: 0;
  transform: translate3d(0, 0, 0);
  transition: opacity 120ms ease-out;
}

.cal-panel[data-visible="true"] {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .cal-panel {
    transition: opacity 100ms linear;
  }
}

/* ---- 見出し ---- */

.cal-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: ${U * 4}px;
  border-bottom: 1px dashed var(--cal-rule);
}

.cal-target {
  display: flex;
  align-items: baseline;
  gap: ${U * 2}px;
  user-select: none;
}

.cal-target b {
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cal-size {
  margin-left: auto;
  color: var(--cal-ink-2);
  font-size: var(--cal-size-s);
  white-space: nowrap;
}

.cal-badges {
  display: flex;
  flex-wrap: wrap;
  gap: ${U}px;
  margin-top: ${U * 2}px;
}

.cal-badges:empty {
  display: none;
}

.cal-badge {
  padding: ${U / 2}px ${U * 1.5}px;
  border-radius: ${U}px;
  border: 1px solid var(--cal-rule);
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
  user-select: none;
}

.cal-badge[data-tone="warn"],
.cal-badge[data-tone="pin"] {
  border-color: var(--cal-accent);
  color: var(--cal-accent);
}

/* ---- 本体 ---- */

.cal-body {
  display: flex;
  flex-direction: column;
  gap: ${U * 4}px;
  padding: ${U * 4}px;
}

.cal-empty {
  margin: 0;
  color: var(--cal-ink-2);
  font-size: var(--cal-size-s);
}

/* ---- プロパティ 1 件（§F2） ---- */

.cal-block {
  display: flex;
  flex-direction: column;
  gap: ${U}px;
}

.cal-block-head {
  display: flex;
  align-items: baseline;
  gap: ${U * 2}px;
}

.cal-prop {
  font-weight: 500;
  color: var(--cal-ink-2);
}

.cal-selector {
  margin-left: auto;
  overflow: hidden;
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cal-inherit {
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
}

/* 「表示している 1 件が外れているかもしれない」という信号（§F2） */
.cal-more {
  flex: none;
  padding: 0 ${U}px;
  border: 1px solid var(--cal-rule);
  border-radius: ${U}px;
  background: transparent;
  color: var(--cal-ink-3);
  font: inherit;
  font-size: var(--cal-size-s);
  line-height: 1.4;
  cursor: pointer;
}

.cal-more:hover,
.cal-more[aria-expanded="true"] {
  border-color: var(--cal-accent);
  color: var(--cal-accent);
}

/* declared / computed / measured がひとまとまりであることを示す縦罫（§5） */
.cal-rows {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: ${U}px ${U * 2}px;
  margin: 0;
  padding-left: ${U * 2}px;
  border-left: 1px solid var(--cal-rule);
}

.cal-label {
  color: var(--cal-ink-3);
  font-size: var(--cal-size);
}

.cal-val {
  margin: 0;
  overflow-wrap: anywhere;
}

.cal-note {
  margin-left: ${U * 2}px;
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
}

/* computed と measured の乖離がバグの発見点（§F2） */
.cal-block[data-diverged="true"] .cal-val[data-row="measured"] {
  color: var(--cal-accent);
  font-weight: 600;
}

/* ---- 出自リンク（§F3） ---- */

.cal-source {
  align-self: flex-start;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cal-accent);
  font: inherit;
  font-size: var(--cal-size);
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration: none;
  cursor: pointer;
}

/* 色だけで示さない（§8）。hover / focus で下線を出す */
@media (hover: hover) and (pointer: fine) {
  .cal-source:hover {
    text-decoration: underline;
  }
}

.cal-source:focus-visible,
.cal-more:focus-visible {
  outline: 2px solid var(--cal-accent);
  outline-offset: 2px;
  text-decoration: underline;
}

.cal-source[data-open="false"] {
  color: var(--cal-ink-3);
  cursor: default;
}

.cal-source[data-state="fail"] {
  color: var(--cal-ink-3);
  text-decoration: line-through;
}

/* ---- 他の候補（+N の展開） ---- */

.cal-others {
  display: flex;
  flex-direction: column;
  gap: ${U}px;
  margin-left: ${U * 2}px;
  padding-left: ${U * 2}px;
  border-left: 1px dashed var(--cal-rule);
}

.cal-other {
  display: flex;
  flex-direction: column;
  gap: ${U / 2}px;
  font-size: var(--cal-size-s);
}

.cal-other-value {
  color: var(--cal-ink-2);
  overflow-wrap: anywhere;
}

.cal-other-selector {
  color: var(--cal-ink-3);
  overflow-wrap: anywhere;
}

/* ---- ヒント ---- */

.cal-hint {
  margin: 0;
  padding: ${U * 3}px ${U * 4}px;
  border-top: 1px dashed var(--cal-rule);
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
  user-select: none;
}
`;
