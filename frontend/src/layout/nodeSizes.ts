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
export const EDGE_LABEL_MAX_WIDTH = 440;
export const ASSUMED_BADGE_WIDTH = 76;

export function edgeLabelWidth(text: string, assumed = false): number {
  return Math.min(
    EDGE_LABEL_MAX_WIDTH,
    Math.max(120, 28 + text.length * 7.5 + (assumed ? ASSUMED_BADGE_WIDTH : 0)),
  );
}

export function edgeLabelHeight(
  text: string,
  width = edgeLabelWidth(text),
  assumed = false,
): number {
  const charsPerLine = Math.max(12, Math.floor((width - 28) / 7));
  const firstLineChars = Math.max(
    8,
    charsPerLine - (assumed ? Math.ceil(ASSUMED_BADGE_WIDTH / 7) : 0),
  );
  const remainingChars = Math.max(0, text.length - firstLineChars);
  const lines = 1 + Math.ceil(remainingChars / charsPerLine);
  return Math.max(EDGE_LABEL_HEIGHT, 20 + lines * 18);
}
