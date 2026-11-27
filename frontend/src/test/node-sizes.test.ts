import { describe, expect, it } from 'vitest';

import { displayEdgeLabel, EDGE_LABEL_MAX_CHARS } from '../layout/nodeSizes';

describe('displayEdgeLabel', () => {
  it('keeps short connection labels unchanged', () => {
    expect(displayEdgeLabel('Writes trip status')).toBe('Writes trip status');
  });

  it('keeps the canvas label concise without mutating the source wording', () => {
    const fullLabel = 'The matching service consumes location updates and trip events from the queue.';
    const displayed = displayEdgeLabel(fullLabel);

    expect(displayed.length).toBeLessThanOrEqual(EDGE_LABEL_MAX_CHARS + 1);
    expect(displayed.endsWith('…')).toBe(true);
    expect(fullLabel).toContain('location updates and trip events from the queue');
  });
});
