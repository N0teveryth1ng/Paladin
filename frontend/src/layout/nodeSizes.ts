/**
 * Fixed geometry. Content measurement in the DOM would make layout
 * non-deterministic, so every component box is the same size and long text is
 * clipped in the renderer.
 */

export const COMPONENT_WIDTH = 280;
export const COMPONENT_HEIGHT = 100;

export const GROUP_PADDING = {
  top: 52,
  left: 32,
  bottom: 28,
  right: 32,
} as const;

export const EDGE_LABEL_HEIGHT = 40;
export const EDGE_LABEL_MAX_WIDTH = 360;

export function edgeLabelWidth(text: string): number {
  return Math.min(EDGE_LABEL_MAX_WIDTH, Math.max(120, 28 + text.length * 7.5));
}

export function edgeLabelHeight(text: string, width = edgeLabelWidth(text)): number {
  const charsPerLine = Math.max(12, Math.floor((width - 28) / 7));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return Math.max(EDGE_LABEL_HEIGHT, 16 + lines * 18);
}
