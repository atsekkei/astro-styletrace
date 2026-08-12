import { compare, type Specificity } from './specificity.js';

export type CascadeWeight = {
  important: boolean;
  inline: boolean;
  layer: number | null;
  specificity: Specificity;
  order: number;
  declarationOrder: number;
};

/** Returns a positive number when `a` wins the author-origin cascade. */
export function compareCascade(a: CascadeWeight, b: CascadeWeight): number {
  if (a.important !== b.important) return a.important ? 1 : -1;
  if (a.inline !== b.inline) return a.inline ? 1 : -1;

  const layer = compareLayer(a, b);
  if (layer !== 0) return layer;

  const specificity = compare(a.specificity, b.specificity);
  if (specificity !== 0) return specificity;
  if (a.order !== b.order) return a.order - b.order;
  return a.declarationOrder - b.declarationOrder;
}

function compareLayer(a: CascadeWeight, b: CascadeWeight): number {
  if (a.layer === b.layer) return 0;

  // Normal declarations outside a layer win. For !important the layer order is
  // reversed and layered declarations win over unlayered declarations.
  if (a.layer === null) return a.important ? -1 : 1;
  if (b.layer === null) return a.important ? 1 : -1;
  return a.important ? b.layer - a.layer : a.layer - b.layer;
}
