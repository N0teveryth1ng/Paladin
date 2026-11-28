import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toolbar } from '../render/Toolbar';

afterEach(cleanup);

function renderToolbar(): void {
  render(
    <Toolbar
      theme="dark"
      locked={false}
      onTheme={() => {}}
      onFit={() => {}}
      onDownload={() => {}}
      onSave={() => {}}
    />,
  );
}

describe('compact toolbar', () => {
  it('groups tools and keeps the action test ids', () => {
    renderToolbar();

    expect(screen.getByRole('group', { name: 'File' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Design' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'History' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'View and export' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByTestId('theme-button')).toHaveAttribute('aria-label', 'Toggle theme');
  });

  it('closes the export menu on outside mousedown, even when the canvas stops propagation', () => {
    renderToolbar();
    const button = screen.getByTestId('export-menu-button');

    fireEvent.click(button);
    expect(screen.getByTestId('download-diagram')).toBeTruthy();

    // React Flow stops mousedown propagation on its pane; the handler must
    // listen in the capture phase to see clicks outside the sidebar.
    const pane = document.createElement('div');
    pane.className = 'react-flow__pane';
    document.body.append(pane);
    pane.addEventListener('mousedown', (event) => event.stopPropagation());
    fireEvent.mouseDown(pane);

    expect(screen.queryByTestId('download-diagram')).toBeNull();
    pane.remove();
  });

  it('keeps the export menu open for clicks inside it and closes it on Escape', () => {
    const onSave = vi.fn();
    render(
      <Toolbar
        theme="light"
        locked={false}
        onTheme={() => {}}
        onFit={() => {}}
        onDownload={() => {}}
        onSave={onSave}
      />,
    );
    const button = screen.getByTestId('export-menu-button');

    fireEvent.click(button);
    const menu = screen.getByRole('group', { name: 'Export or save' });
    fireEvent.mouseDown(menu);
    expect(screen.getByTestId('save-file')).toBeTruthy();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByTestId('save-file')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
