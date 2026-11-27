/**
 * Fixed geometry. Content measurement in the DOM would make layout
 * non-deterministic, so every component box is the same size and long text is
 * clipped in the renderer.
 */

export const COMPONENT_WIDTH = 216;
export const COMPONENT_HEIGHT = 76;

export const GROUP_PADDING = {
  top: 38,
  left: 24,
  bottom: 20,
  right: 24,
} as const;

export const EDGE_LABEL_HEIGHT = 18;
export const EDGE_LABEL_MAX_CHARS = 28;

export function edgeLabelWidth(text: string): number {
  return Math.min(220, 12 + text.length * 7);
}

export function truncateLabel(text: string, max = EDGE_LABEL_MAX_CHARS): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}
