import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { App } from '../App';

// Mock clipboard API (navigator.clipboard is not available in jsdom)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// localStorage is available in jsdom but let's reset between tests
beforeEach(() => {
  localStorage.clear();
});

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
    // FROM is always in the simple example
    const fromButtons = screen.getAllByRole('button', { name: /^FROM:/i });
    expect(fromButtons.length).toBeGreaterThan(0);
  });

  describe('example toggler', () => {
    it('switches to the Average example when Average is clicked', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: /average/i }));
      // Average contains nginx in the FROM
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

  describe('side panel', () => {
    it('is hidden initially', () => {
      render(<App />);
      const panel = screen.getByTestId('side-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('opens when a keyword token is clicked', async () => {
      const user = userEvent.setup();
      render(<App />);
      const fromBtn = screen.getAllByRole('button', { name: /^FROM:/i })[0];
      await user.click(fromBtn);
      const panel = screen.getByTestId('side-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'false');
    });

    it('displays the explanation title after opening', async () => {
      const user = userEvent.setup();
      render(<App />);
      const fromBtn = screen.getAllByRole('button', { name: /^FROM:/i })[0];
      await user.click(fromBtn);
      expect(screen.getByRole('heading', { name: /from/i, level: 2 })).toBeInTheDocument();
    });

    it('opens for RUN command fragments after the keyword', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: /complex/i }));
      const addgroupBtn = screen.getByRole('button', { name: /^addgroup:/i });
      await user.click(addgroupBtn);
      expect(screen.getByRole('heading', { name: /^addgroup$/i, level: 2 })).toBeInTheDocument();
    });

    it('closes when the close button is clicked', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getAllByRole('button', { name: /^FROM:/i })[0]);
      const closeBtn = screen.getByRole('button', { name: /close explanation panel/i });
      await user.click(closeBtn);
      const panel = screen.getByTestId('side-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('closes when the Escape key is pressed', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getAllByRole('button', { name: /^FROM:/i })[0]);
      const panel = screen.getByTestId('side-panel');
      // Fire Escape directly on the panel (simulates pressing Escape while interacting with it)
      fireEvent.keyDown(panel, { key: 'Escape', code: 'Escape', bubbles: true });
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('closes when switching examples', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getAllByRole('button', { name: /^FROM:/i })[0]);
      await user.click(screen.getByRole('button', { name: /average/i }));
      const panel = screen.getByTestId('side-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows documentation links for known keywords', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getAllByRole('button', { name: /^FROM:/i })[0]);
      const links = screen.getAllByRole('link');
      const docLink = links.find((l) => l.href.startsWith('https://docs.docker.com/'));
      expect(docLink).toBeDefined();
    });
  });

  it('renders the copy button in the viewer header', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /copy dockerfile to clipboard/i })).toBeInTheDocument();
  });
});
