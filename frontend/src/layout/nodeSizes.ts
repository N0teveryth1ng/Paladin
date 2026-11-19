/**
 * Fixed geometry. Content measurement in the DOM would make layout
 * non-deterministic, so every component box is the same size and long text is
 * clipped in the renderer.
 */

export const COMPONENT_WIDTH = 220;
export const COMPONENT_HEIGHT = 88;

export const GROUP_PADDING = {
  top: 44,
  left: 28,
  bottom: 28,
  right: 28,
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
