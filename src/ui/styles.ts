export const TOKENS = {
  ink: '#000000',
  ink2: '#4D4D4D',
  ink3: '#808080',
  rule: '#D9D9D9',
  accent: '#0000FF',
  warn: '#D40000',
  surface: '#F2F2F2E6',

  margin: 'rgba(0, 0, 255, 0.10)',
  padding: 'rgba(0, 0, 255, 0.20)',
  overlapFill: 'rgba(0, 0, 255, 0.12)',
  labelBg: '#0000FF',
  labelText: '#FFFFFF',
} as const;

const U = 4;

export const CSS = `
:host {
  --cal-ink: ${TOKENS.ink};
  --cal-ink-2: ${TOKENS.ink2};
  --cal-ink-3: ${TOKENS.ink3};
  --cal-rule: ${TOKENS.rule};
  --cal-accent: ${TOKENS.accent};
  --cal-warn: ${TOKENS.warn};
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
  background: var(--cal-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
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

.cal-panel {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483002;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 400px;
  max-width: calc(100vw - ${U * 8}px);
  max-height: min(70vh, 620px);
  overflow: hidden;
  border-radius: ${U * 4}px;
  border: 1px solid var(--cal-rule);
  background: var(--cal-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 ${U * 2}px ${U * 8}px -${U * 2}px rgba(0, 0, 0, 0.2);
  color: var(--cal-ink);
  font-family: var(--cal-font);
  font-size: var(--cal-size);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  transition: opacity 120ms ease-out;
}

.cal-panel[data-visible="true"] {
  opacity: 1;
  pointer-events: auto;
}

.cal-panel[data-visible="true"][data-dim="true"] {
  opacity: 0.2;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .cal-panel {
    transition: opacity 100ms linear;
  }
}

.cal-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: ${U * 4}px;
  border-bottom: 1px dashed var(--cal-rule);
  background: var(--cal-surface);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.cal-panel[data-dragging="true"] .cal-head {
  cursor: grabbing;
}

.cal-target {
  display: flex;
  align-items: center;
  gap: ${U * 1}px;
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

.cal-badge[data-tone="warn"] {
  border-color: var(--cal-warn);
  color: var(--cal-warn);
}

.cal-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: ${U * 4}px;
  padding: ${U * 4}px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.cal-empty {
  margin: 0;
  color: var(--cal-ink-2);
  font-size: var(--cal-size-s);
}

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
  flex: none;
  font-weight: 500;
  color: var(--cal-ink-2);
  white-space: nowrap;
}

.cal-selector {
  min-width: 0;
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

.cal-block[data-diverged="true"] .cal-val[data-row="measured"] {
  color: var(--cal-warn);
  font-weight: 600;
}

.cal-block[data-changed="true"] .cal-prop::after {
  content: "changed";
  margin-left: ${U * 1.5}px;
  color: var(--cal-accent);
  font-size: var(--cal-size-s);
  font-weight: 400;
}

.cal-val[data-row="before"] {
  display: flex;
  flex-wrap: wrap;
  gap: ${U}px;
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
}

.cal-diff {
  max-width: 100%;
  overflow-wrap: anywhere;
}

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

.cal-source[data-state="success"] {
  color: var(--cal-accent);
  text-decoration: underline;
}

.cal-agent-dot {
  flex: none;
  width: ${U * 1.5}px;
  height: ${U * 1.5}px;
  border-radius: 50%;
  background: var(--cal-accent);
  transform: scale(1);
  transform-origin: center;
  animation: cal-agent-pulse 1.6s ease-in-out infinite;
}

@keyframes cal-agent-pulse {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.82);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cal-agent-dot {
    animation: none;
  }
}

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

.cal-hint {
  flex: none;
  margin: 0;
  padding: ${U * 3}px ${U * 4}px;
  border-top: 1px dashed var(--cal-rule);
  background: var(--cal-surface);
  color: var(--cal-ink-3);
  font-size: var(--cal-size-s);
  user-select: none;
}
`;
