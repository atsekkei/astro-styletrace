import { sourceLocationFor } from './css-map.js';
import { formatMeasured, type Candidate, type Metric } from './metrics.js';
import type { Source } from './resolve-source.js';

export const INSPECTOR_OBSERVATION_VERSION = 1;

export type ObservationSource = {
  label: string;
  line: number | null;
  target: string | null;
};

export type ObservationCandidate = {
  value: string;
  property: string;
  selector: string;
  important: boolean;
  source: ObservationSource;
};

export type ObservationMetric = {
  property: string;
  declared: ObservationCandidate;
  others: ObservationCandidate[];
  inheritedFrom: string | null;
  computed: string;
  measured: { value: number; label: string } | null;
  diverged: boolean;
};

export type InspectorObservation = {
  version: typeof INSPECTOR_OBSERVATION_VERSION;
  target: string;
  borderBox: {
    width: number;
    height: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  transformed: boolean;
  metrics: ObservationMetric[];
};

export type CreateInspectorObservationInput = {
  target: string;
  rect: Pick<DOMRect, 'width' | 'height'>;
  viewport: {
    width: number;
    height: number;
  };
  metrics: Metric[];
  transformed: boolean;
  sourceTarget?: (source: Source) => string | null;
};

export function createInspectorObservation(
  input: CreateInspectorObservationInput,
): InspectorObservation {
  return {
    version: INSPECTOR_OBSERVATION_VERSION,
    target: input.target,
    borderBox: {
      width: input.rect.width,
      height: input.rect.height,
    },
    viewport: input.viewport,
    transformed: input.transformed,
    metrics: input.metrics.map((metric) => toObservationMetric(metric, input.sourceTarget)),
  };
}

export function serializeInspectorObservation(observation: InspectorObservation): string {
  return `${JSON.stringify(stripSensitiveFields(observation), null, 2)}\n`;
}

function toObservationMetric(
  metric: Metric,
  sourceTarget?: (source: Source) => string | null,
): ObservationMetric {
  return {
    property: metric.property,
    declared: toObservationCandidate(metric.declared, sourceTarget),
    others: metric.others.map((candidate) => toObservationCandidate(candidate, sourceTarget)),
    inheritedFrom: metric.inheritedFrom,
    computed: metric.computed,
    measured:
      metric.measured === null
        ? null
        : { value: metric.measured, label: formatMeasured(metric.measured) },
    diverged: metric.diverged,
  };
}

function toObservationCandidate(
  candidate: Candidate,
  sourceTarget?: (source: Source) => string | null,
): ObservationCandidate {
  const location = sourceLocationFor(candidate.source, candidate.selector, candidate.occurrence);
  const source = location?.source ?? candidate.source;
  const line = location?.line ?? null;
  const target = sourceTarget?.(source) ?? null;

  return {
    value: candidate.value,
    property: candidate.property,
    selector: candidate.selector,
    important: candidate.important,
    source: {
      label: source.label,
      line,
      target: target && line !== null ? `${target}:${line}` : target,
    },
  };
}

function stripSensitiveFields(observation: InspectorObservation): SerializedInspectorObservation {
  return {
    ...observation,
    metrics: observation.metrics.map((metric) => ({
      ...metric,
      declared: stripCandidate(metric.declared),
      others: metric.others.map(stripCandidate),
    })),
  };
}

function stripCandidate(candidate: ObservationCandidate): SerializedObservationCandidate {
  return {
    ...candidate,
    source: {
      label: candidate.source.label,
      line: candidate.source.line,
    },
  };
}

type SerializedObservationCandidate = Omit<ObservationCandidate, 'source'> & {
  source: Omit<ObservationSource, 'target'>;
};

type SerializedObservationMetric = Omit<ObservationMetric, 'declared' | 'others'> & {
  declared: SerializedObservationCandidate;
  others: SerializedObservationCandidate[];
};

type SerializedInspectorObservation = Omit<InspectorObservation, 'metrics'> & {
  metrics: SerializedObservationMetric[];
};
