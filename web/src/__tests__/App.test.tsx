import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { App } from '../App';

// Mock clipboard API (navigator.clipboard is not available in jsdom)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// jsdom has no layout, so scrollIntoView is missing; record the calls instead.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

beforeEach(() => {
  localStorage.clear();
  scrollIntoView.mockClear();
});

const panel = () => screen.getByTestId('side-panel');
const token = (name: RegExp) => screen.getAllByRole('button', { name })[0];
const heading = () => screen.getByRole('heading', { level: 2 });
const status = () => screen.getByRole('status');

describe('App', () => {
  it('renders the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /dockerfile explainer/i })).toBeInTheDocument();
  });

  it('renders the example toggler with Simple, Average, Complex buttons', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /simple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /average/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complex/i })).toBeInTheDocument();
  });

  it('shows the simple Dockerfile by default', () => {
    render(<App />);
    expect(screen.getAllByRole('button', { name: /^FROM:/i }).length).toBeGreaterThan(0);
  });

  it('renders the copy button in the viewer header', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /copy dockerfile to clipboard/i }),
    ).toBeInTheDocument();
  });

  describe('example toggler', () => {
    it('switches to the Average example when Average is clicked', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: /average/i }));
      expect(screen.getAllByRole('button', { name: /^FROM:/i }).length).toBeGreaterThan(0);
    });

    it('marks the active example button as aria-pressed=true', async () => {
      const user = userEvent.setup();
      render(<App />);
      const simpleBtn = screen.getByRole('button', { name: /simple/i });
      const complexBtn = screen.getByRole('button', { name: /complex/i });
      expect(simpleBtn).toHaveAttribute('aria-pressed', 'true');
      await user.click(complexBtn);
      expect(complexBtn).toHaveAttribute('aria-pressed', 'true');
      expect(simpleBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('persists the selected example to localStorage', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: /average/i }));
      expect(localStorage.getItem('df-example')).toBe('average');
    });
  });

  describe('explanation panel', () => {
    it('is closed initially', () => {
      render(<App />);
      expect(panel()).toHaveAttribute('data-state', 'closed');
      expect(status()).toHaveTextContent('');
    });

    it('opens on a token without moving focus, and announces it (PNL-4, PNL-20, PNL-25)', async () => {
      const user = userEvent.setup();
      render(<App />);
      const from = token(/^FROM:/);
      await user.click(from);
      expect(panel()).toHaveAttribute('data-state', 'open');
      expect(heading()).toHaveAccessibleName('FROM');
      expect(from).toHaveFocus();
      expect(status()).toHaveTextContent('FROM: Starts a new build stage from a base image.');
    });

    it('swaps content for another token and keeps the same token a no-op (PNL-5, PNL-6)', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^FROM:/));
      await user.click(token(/^WORKDIR:/));
      expect(heading()).toHaveAccessibleName('WORKDIR');
      expect(status()).toHaveTextContent(/^WORKDIR: /);
      await user.click(token(/^WORKDIR:/));
      expect(heading()).toHaveAccessibleName('WORKDIR');
      expect(panel()).toHaveAttribute('data-state', 'open');
    });

    it('marks only the source token as current, and only for its own entry (PNL-33)', async () => {
      const user = userEvent.setup();
      render(<App />);
      const from = token(/^FROM:/);
      expect(from).not.toHaveAttribute('aria-current');
      expect(from).not.toHaveAttribute('aria-pressed');
      await user.click(from);
      expect(from).toHaveAttribute('aria-current', 'true');
      expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'COPY --from' }));
      expect(from).not.toHaveAttribute('aria-current');
      await user.click(screen.getByRole('button', { name: 'Back to FROM' }));
      expect(from).toHaveAttribute('aria-current', 'true');
      await user.click(screen.getByRole('button', { name: 'Close explanation' }));
      expect(from).not.toHaveAttribute('aria-current');
    });

    it('navigates "See also" and Back (PNL-26, PNL-35)', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^FROM:/));
      await user.click(screen.getByRole('button', { name: 'COPY --from' }));
      expect(heading()).toHaveAccessibleName('--from');
      expect(screen.getByText('COPY flag')).toBeInTheDocument();
      expect(status()).toHaveTextContent(/^--from: /);
      expect(heading()).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Back to FROM' }));
      expect(heading()).toHaveAccessibleName('FROM');
      expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
    });

    it('starts a new stack when another token is selected', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^FROM:/));
      await user.click(screen.getByRole('button', { name: 'COPY --from' }));
      await user.click(token(/^WORKDIR:/));
      expect(heading()).toHaveAccessibleName('WORKDIR');
      expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
    });

    it('explains shell options on continuation lines in context', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: /complex/i }));
      await user.click(token(/^--omit=dev:/));
      expect(heading()).toHaveAccessibleName('--omit=dev');
      expect(screen.getByText('npm option')).toBeInTheDocument();
    });

    it('returns focus to the source token when closed from inside (PNL-7, PNL-23)', async () => {
      const user = userEvent.setup();
      render(<App />);
      const from = token(/^FROM:/);
      await user.click(from);
      await user.click(screen.getByRole('button', { name: 'Close explanation' }));
      expect(panel()).toHaveAttribute('data-state', 'closed');
      expect(from).toHaveFocus();
      expect(status()).toHaveTextContent('');
    });

    it('closes with Escape from inside the panel and returns focus (PNL-21, PNL-23)', async () => {
      const user = userEvent.setup();
      render(<App />);
      const from = token(/^FROM:/);
      await user.click(from);
      screen.getByRole('button', { name: 'Close explanation' }).focus();
      await user.keyboard('{Escape}');
      expect(panel()).toHaveAttribute('data-state', 'closed');
      expect(from).toHaveFocus();
    });

    it('leaves focus alone when closed while focus is elsewhere (PNL-23)', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^FROM:/));
      const workdir = token(/^WORKDIR:/);
      workdir.focus();
      fireEvent.keyDown(workdir, { key: 'Escape' });
      expect(panel()).toHaveAttribute('data-state', 'closed');
      expect(workdir).toHaveFocus();
    });

    it('closes on example switch with focus on the example button (PNL-8)', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^FROM:/));
      const average = screen.getByRole('button', { name: /average/i });
      await user.click(average);
      expect(panel()).toHaveAttribute('data-state', 'closed');
      expect(average).toHaveFocus();
    });

    it('scrolls the source token into view (PNL-28)', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^WORKDIR:/));
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' }),
      );
    });

    it('shows documentation links', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(token(/^FROM:/));
      const docLink = screen
        .getAllByRole('link')
        .find((l) => l.getAttribute('href')?.startsWith('https://docs.docker.com/'));
      expect(docLink).toBeDefined();
    });
  });

  describe('viewer keyboard (PNL-24)', () => {
    const tabStops = () =>
      screen
        .getByRole('grid', { name: 'Dockerfile source' })
        .querySelectorAll('button[tabindex="0"]');

    it('is a grid with one tab stop, initially the first token', () => {
      render(<App />);
      expect(tabStops()).toHaveLength(1);
      expect(tabStops()[0]).toHaveTextContent('FROM');
    });

    it('moves with arrows, Home/End and Ctrl+Home/End, and selects with Enter', async () => {
      const user = userEvent.setup();
      render(<App />);
      const from = token(/^FROM:/);
      from.focus();
      await user.keyboard('{ArrowRight}');
      expect(token(/^node:26-alpine:/)).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(token(/^WORKDIR:/)).toHaveFocus();
      await user.keyboard('{End}');
      expect(token(/^\/app:/)).toHaveFocus();
      await user.keyboard('{Home}');
      expect(token(/^WORKDIR:/)).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(from).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(from).toHaveFocus();
      await user.keyboard('{Control>}{End}{/Control}');
      expect(document.activeElement).toHaveTextContent(']');
      await user.keyboard('{Control>}{Home}{/Control}');
      expect(from).toHaveFocus();
      await user.keyboard('{ArrowDown}{Enter}');
      expect(heading()).toHaveAccessibleName('WORKDIR');
      expect(token(/^WORKDIR:/)).toHaveFocus();
      expect(tabStops()).toHaveLength(1);
      expect(tabStops()[0]).toHaveTextContent('WORKDIR');
    });

    it('lets Tab go from the viewer straight into the panel (PNL-38)', async () => {
      const user = userEvent.setup();
      render(<App />);
      const from = token(/^FROM:/);
      await user.click(from);
      await user.tab();
      expect(panel()).toContainElement(document.activeElement as HTMLElement);
    });
  });
});
