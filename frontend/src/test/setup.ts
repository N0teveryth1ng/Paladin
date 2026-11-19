import '@testing-library/jest-dom/vitest';

/**
 * happy-dom has no layout engine. React Flow only needs a container size and a
 * ResizeObserver callback to render its nodes, so the test environment reports
 * the size declared by the node wrapper (or a viewport-sized container).
 */

class ResizeObserverMock implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    const element = target as HTMLElement;
    const width = Number.parseFloat(element.style?.width ?? '') || 1200;
    const height = Number.parseFloat(element.style?.height ?? '') || 800;
    const rect = {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    };
    this.callback(
      [
        {
          target,
          contentRect: rect as DOMRectReadOnly,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this,
    );
  }

  unobserve(): void {}

  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock;

/**
 * React Flow measures nodes with `offsetWidth`/`offsetHeight`, which happy-dom
 * reports as 0. Derive them from the inline size that React Flow writes, so a
 * node counts as measured and its edges are rendered.
 */
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement) {
    const width = Number.parseFloat(this.style?.width ?? '');
    return Number.isFinite(width) ? width : 0;
  },
});

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    const height = Number.parseFloat(this.style?.height ?? '');
    return Number.isFinite(height) ? height : 0;
  },
});

if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyMock {
    m22 = 1;
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
