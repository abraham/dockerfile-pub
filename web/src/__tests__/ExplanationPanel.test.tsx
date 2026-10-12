import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { ExplanationPanel } from '../components/ExplanationPanel';
import type { PanelEntry } from '../components/ExplanationPanel';

function entry(title: string, related: PanelEntry['explanation']['related'] = []): PanelEntry {
  return {
    key: `instruction:${title}`,
    ref: { kind: 'instruction', instruction: 'FROM' },
    explanation: {
      category: 'Instruction',
      title,
      short: [`About ${title}.`],
      details: [{ type: 'paragraph', content: ['Body.'] }],
      links: [{ label: 'Reference', url: 'https://docs.docker.com/reference/dockerfile/' }],
      related,
    },
  };
}

const noop = () => {};

function renderPanel(props: Partial<Parameters<typeof ExplanationPanel>[0]> = {}) {
  return render(
    <ExplanationPanel
      entry={entry('FROM')}
      previousTitle={null}
      onBack={noop}
      onClose={noop}
      onNavigate={noop}
      {...props}
    />,
  );
}

const panel = () => screen.getByTestId('side-panel');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExplanationPanel', () => {
  it('is an inert, empty landmark while closed (PNL-1, PNL-2, PNL-3)', () => {
    renderPanel({ entry: null });
    expect(panel()).toHaveAttribute('data-state', 'closed');
    expect(panel()).toHaveAttribute('inert');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('is a named complementary landmark while open, with no live region (\u00a77)', () => {
    renderPanel();
    expect(panel()).toHaveAttribute('data-state', 'open');
    expect(panel()).not.toHaveAttribute('inert');
    expect(panel()).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('complementary', { name: 'Explanation' })).toBe(panel());
    expect(screen.getByRole('heading', { level: 2, name: 'FROM' })).toBeInTheDocument();
  });

  it('unmounts the content at once when there is no transition', async () => {
    const view = renderPanel();
    view.rerender(
      <ExplanationPanel
        entry={null}
        previousTitle={null}
        onBack={noop}
        onClose={noop}
        onNavigate={noop}
      />,
    );
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull());
  });

  it('keeps the last content until the closing transition ends (PNL-2)', async () => {
    const view = renderPanel();
    const real = window.getComputedStyle.bind(window);
    const fake = { transitionDuration: '0.28s', transitionDelay: '0s', position: 'static' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
      el === panel() ? (fake as CSSStyleDeclaration) : real(el, pseudo),
    );
    view.rerender(
      <ExplanationPanel
        entry={null}
        previousTitle={null}
        onBack={noop}
        onClose={noop}
        onNavigate={noop}
      />,
    );
    await waitFor(() => expect(panel()).toHaveAttribute('data-state', 'closed'));
    expect(screen.getByRole('heading', { level: 2, name: 'FROM' })).toBeInTheDocument();
    fireEvent.transitionEnd(panel());
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull());
  });

  it('closes with Escape from anywhere, once, unless the event was handled (PNL-21)', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('heading', { level: 2 }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ignores Escape while closed', () => {
    const onClose = vi.fn();
    renderPanel({ entry: null, onClose });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the close button (PNL-7, PNL-30)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });
    await user.click(screen.getByRole('button', { name: 'Close explanation' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Back only with a previous entry, and focuses the heading (PNL-34, PNL-35)', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    const view = renderPanel({ onBack });
    expect(screen.queryByRole('button', { name: /^Back/ })).toBeNull();
    view.rerender(
      <ExplanationPanel
        entry={entry('--from')}
        previousTitle="FROM"
        onBack={onBack}
        onClose={noop}
        onNavigate={noop}
      />,
    );
    const back = screen.getByRole('button', { name: 'Back to FROM' });
    expect(back).toHaveTextContent('Back');
    await user.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });

  it('reports "See also" and focuses the heading (PNL-26, PNL-34)', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderPanel({
      entry: entry('FROM', [{ kind: 'instruction', instruction: 'ARG' }]),
      onNavigate,
    });
    await user.click(screen.getByRole('button', { name: 'ARG' }));
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'instruction', instruction: 'ARG' });
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });

  it('resets the body scroll when the entry changes, not on re-render (PNL-29)', async () => {
    const view = renderPanel();
    const body = panel().children[1] as HTMLElement;
    let scrollTop = 120;
    Object.defineProperty(body, 'scrollTop', {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
      configurable: true,
    });
    view.rerender(
      <ExplanationPanel
        entry={entry('FROM')}
        previousTitle={null}
        onBack={noop}
        onClose={noop}
        onNavigate={noop}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scrollTop).toBe(120);
    view.rerender(
      <ExplanationPanel
        entry={entry('RUN')}
        previousTitle={null}
        onBack={noop}
        onClose={noop}
        onNavigate={noop}
      />,
    );
    await waitFor(() => expect(scrollTop).toBe(0));
  });
});
