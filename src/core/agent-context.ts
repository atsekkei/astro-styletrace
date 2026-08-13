import { lineFor } from './css-map.js';
import { formatMeasured, type Metric } from './metrics.js';
import { fmt } from './units.js';

export type AgentContext = {
  target: string;
  rect: Pick<DOMRect, 'width' | 'height'>;
  metrics: Metric[];
  viewport: {
    width: number;
    height: number;
  };
};

export function formatAgentContext(context: AgentContext): string {
  const lines = [
    '[astro-styletrace]',
    '',
    `Element: ${context.target}`,
    `Border box: ${fmt(context.rect.width)} × ${fmt(context.rect.height)}px`,
    `Viewport: ${fmt(context.viewport.width)} × ${fmt(context.viewport.height)}px`,
  ];

  for (const metric of context.metrics) {
    const declared = metric.declared;
    const via = declared.property === metric.property ? '' : ` via ${declared.property}`;
    const line = lineFor(declared.source, declared.selector, declared.occurrence);
    const source = line === null ? declared.source.label : `${declared.source.label}:${line}`;

    lines.push(
      '',
      `${metric.property}:`,
      `- declared candidate: ${declared.value}${declared.important ? ' !important' : ''}${via}`,
      `- computed: ${metric.computed}`,
    );

    if (metric.measured !== null) {
      lines.push(`- measured: ${formatMeasured(metric.measured)}`);
    }

    lines.push(
      `- selector: ${declared.selector}`,
      `- source: ${source}`,
      `- competing candidates: ${metric.others.length}`,
    );
  }

  return `${lines.join('\n')}\n`;
}
