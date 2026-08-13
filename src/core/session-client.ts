import type { InspectorObservation } from './observation.js';

const OBSERVATION_ENDPOINT = '/__styletrace/session/observation';

export function publishObservation(observation: InspectorObservation): void {
  const body = JSON.stringify(observation);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const ok = navigator.sendBeacon(
      OBSERVATION_ENDPOINT,
      new Blob([body], { type: 'application/json' }),
    );
    if (ok) return;
  }

  void fetch(OBSERVATION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Agent pull is optional. Inspector interaction should never depend on it.
  });
}

export function clearObservation(): void {
  void fetch(OBSERVATION_ENDPOINT, { method: 'DELETE', keepalive: true }).catch(() => {
    // Agent pull is optional. Inspector interaction should never depend on it.
  });
}
