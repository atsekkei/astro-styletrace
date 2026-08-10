/**
 * ShadowRoot に流し込むスタイル。
 *
 * .css ファイルにすると Vite が dev server 経由でページ全体に注入してしまうため
 * （ShadowRoot に閉じ込められない）、文字列として持つ。
 *
 * 見た目のトーン: 半透明ガラス + 発光する細いエッジ。§8 の床は全て満たすこと。
 */

export const TOKENS = {
  pin: '#b18cff',
  hover: '#4fd1ff',
  measure: '#ff5c8a',
  margin: 'rgba(255, 176, 92, 0.22)',
  padding: 'rgba(79, 209, 255, 0.18)',
  labelBg: 'rgba(10, 12, 22, 0.82)',
  labelText: '#f2f6ff',
} as const;

export const CSS = `
:host {
  --cal-pin: ${TOKENS.pin};
  --cal-hover: ${TOKENS.hover};
  --cal-measure: ${TOKENS.measure};

  --cal-glass: color-mix(in oklab, #070912 90%, transparent);
  --cal-glass-edge: rgba(255, 255, 255, 0.16);
  --cal-glass-sheen: rgba(255, 255, 255, 0.5);
  --cal-text: rgba(244, 247, 255, 0.94);
  --cal-dim: rgba(244, 247, 255, 0.52);
  --cal-faint: rgba(244, 247, 255, 0.3);

  --cal-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --cal-sans: system-ui, -apple-system, "Hiragino Sans", sans-serif;
}

.caliper-svg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2147483000;
  overflow: visible;
}

.caliper-label-text {
  font-family: var(--cal-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  fill: ${TOKENS.labelText};
  user-select: none;
}

.caliper-panel {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483001;
  box-sizing: border-box;
  width: 380px;
  max-height: min(70vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0;
  border-radius: 16px;
  border: 1px solid var(--cal-glass-edge);
  background: var(--cal-glass);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.14) inset,
    0 0 0 0.5px rgba(0, 0, 0, 0.6),
    0 24px 60px -12px rgba(0, 0, 0, 0.7);
  color: var(--cal-text);
  font-family: var(--cal-sans);
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  opacity: 0;
  transform: translate3d(0, 0, 0);
  scale: 0.98;
  transition: opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), scale 140ms cubic-bezier(0.22, 1, 0.36, 1);
}

.caliper-panel[data-visible="true"] {
  opacity: 1;
  scale: 1;
}

/* 追従アニメーションは付けない（§5）。位置は transform で即時反映する */
.caliper-panel::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cal-glass-sheen), transparent);
  opacity: 0.6;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .caliper-panel {
    transition: opacity 100ms linear;
    transform: none;
    scale: 1;
  }
}

.caliper-head {
  position: sticky;
  top: 0;
  padding: 12px 14px 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.caliper-target {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--cal-mono);
  font-size: 12.5px;
  letter-spacing: 0.01em;
  user-select: none;
}

.caliper-target b {
  font-weight: 600;
  color: var(--cal-hover);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caliper-size {
  margin-left: auto;
  color: var(--cal-dim);
  font-size: 11px;
  white-space: nowrap;
}

.caliper-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.caliper-badge {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--cal-dim);
  font-size: 10px;
  letter-spacing: 0.02em;
  user-select: none;
}

.caliper-badge[data-tone="warn"] {
  border-color: color-mix(in oklab, var(--cal-measure) 50%, transparent);
  color: color-mix(in oklab, var(--cal-measure) 80%, white);
}

.caliper-badge[data-tone="pin"] {
  border-color: color-mix(in oklab, var(--cal-pin) 50%, transparent);
  color: color-mix(in oklab, var(--cal-pin) 80%, white);
}

.caliper-body {
  padding: 8px 0 10px;
}

/* 3 列表示（§F2）。宣言値 / 計算値 / 実測値 */
.caliper-metrics {
  padding: 2px 0 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.caliper-metric {
  padding: 3px 14px;
}

.caliper-metric[data-diverged="true"] {
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--cal-measure) 14%, transparent),
    transparent 70%
  );
}

.caliper-metric-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--cal-mono);
  font-size: 11px;
}

.caliper-metric-head .caliper-value {
  color: var(--cal-text);
}

.caliper-alt {
  margin-left: auto;
  color: var(--cal-faint);
  font-size: 10px;
  white-space: nowrap;
}

.caliper-cols {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 8px;
  margin: 1px 0 2px 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.09);
  padding-left: 8px;
  font-family: var(--cal-mono);
  font-size: 11px;
}

.caliper-col-label {
  color: var(--cal-faint);
  font-size: 10px;
  white-space: nowrap;
}

.caliper-col-value {
  margin: 0;
  overflow-wrap: anywhere;
}

.caliper-col-value[data-col="computed"] {
  color: var(--cal-hover);
}

.caliper-col-value[data-col="measured"] {
  color: var(--cal-text);
}

.caliper-col-note {
  margin-left: 6px;
  color: var(--cal-faint);
  font-size: 10px;
  white-space: nowrap;
}

.caliper-col-value[data-col="variables"] {
  color: var(--cal-faint);
  font-size: 10px;
}

.caliper-metric[data-diverged="true"] .caliper-col-value[data-col="measured"] {
  color: color-mix(in oklab, var(--cal-measure) 80%, white);
}

.caliper-origin {
  margin-left: 10px;
  color: var(--cal-dim);
  font-family: var(--cal-mono);
  font-size: 10px;
  overflow-wrap: anywhere;
}

.caliper-group + .caliper-group {
  margin-top: 2px;
}

.caliper-file {
  display: block;
  width: 100%;
  padding: 6px 14px 4px;
  border: 0;
  background: none;
  color: var(--cal-hover);
  font-family: var(--cal-mono);
  font-size: 11px;
  text-align: left;
  overflow-wrap: anywhere;
  user-select: none;
}

.caliper-file[data-inline="true"] {
  color: var(--cal-pin);
}

.caliper-rule {
  padding: 3px 14px 7px;
}

.caliper-selector {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--cal-mono);
  font-size: 11.5px;
  color: var(--cal-text);
  overflow-wrap: anywhere;
}

.caliper-spec {
  margin-left: auto;
  color: var(--cal-faint);
  font-size: 10px;
  white-space: nowrap;
}

.caliper-cond {
  color: var(--cal-dim);
  font-family: var(--cal-mono);
  font-size: 10.5px;
}

.caliper-decls {
  margin: 3px 0 0;
  padding: 0;
  list-style: none;
}

.caliper-decl {
  display: flex;
  gap: 8px;
  padding: 1px 0 1px 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.09);
  font-family: var(--cal-mono);
  font-size: 11px;
}

.caliper-decl[data-overridden="true"] {
  color: var(--cal-faint);
  text-decoration: line-through;
}

.caliper-decl[data-computed="true"] {
  border-left-color: var(--cal-hover);
}

.caliper-prop {
  color: var(--cal-dim);
  white-space: nowrap;
}

.caliper-value {
  color: var(--cal-text);
  overflow-wrap: anywhere;
}

.caliper-decl[data-computed="true"] .caliper-value {
  color: var(--cal-hover);
}

.caliper-important {
  color: var(--cal-measure);
}

.caliper-toggle {
  display: block;
  margin: 6px 14px 0;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: var(--cal-dim);
  font-family: var(--cal-sans);
  font-size: 10.5px;
  cursor: pointer;
  user-select: none;
  transition: background 120ms ease, color 120ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .caliper-toggle:hover {
    background: rgba(255, 255, 255, 0.11);
    color: var(--cal-text);
  }
}

.caliper-toggle:focus-visible {
  outline: 2px solid var(--cal-hover);
  outline-offset: 2px;
}

.caliper-empty {
  padding: 10px 14px;
  color: var(--cal-dim);
  font-size: 11.5px;
}

.caliper-hint {
  padding: 8px 14px 0;
  color: var(--cal-faint);
  font-size: 10.5px;
  user-select: none;
}
`;
