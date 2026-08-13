import type { InspectorObservation } from './observation.js';
import { fmt } from './units.js';

export function formatInspectorObservation(observation: InspectorObservation): string {
  const lines = [
    '[astro-styletrace]',
    '',
    `Observation version: ${observation.version}`,
    `Element: ${observation.target}`,
    `Border box: ${fmt(observation.borderBox.width)} × ${fmt(observation.borderBox.height)}px`,
    `Viewport: ${fmt(observation.viewport.width)} × ${fmt(observation.viewport.height)}px`,
  ];

  for (const metric of observation.metrics) {
    const declared = metric.declared;
    const via = declared.property === metric.property ? '' : ` via ${declared.property}`;
    const source =
      declared.source.line === null
        ? declared.source.label
        : `${declared.source.label}:${declared.source.line}`;

    lines.push(
      '',
      `${metric.property}:`,
      `- declared candidate: ${declared.value}${declared.important ? ' !important' : ''}${via}`,
      `- computed: ${metric.computed}`,
    );

    if (metric.measured !== null) {
      lines.push(`- measured: ${metric.measured.label}`);
    }

    lines.push(
      `- selector: ${declared.selector}`,
      `- source: ${source}`,
      `- competing candidates: ${metric.others.length}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

export const formatAgentContext = formatInspectorObservation;
