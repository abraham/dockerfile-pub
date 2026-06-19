import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { CopyButton } from '../components/CopyButton';

// Mock clipboard API (navigator.clipboard is not available in jsdom)
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe('CopyButton', () => {
  it('renders with "Copy" label by default', () => {
    render(<CopyButton text="FROM node:20" />);
    expect(screen.getByRole('button', { name: /copy dockerfile to clipboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button').textContent).toBe('Copy');
  });

  it('shows "Copied!" label after clicking', async () => {
    const user = userEvent.setup();
    render(<CopyButton text="FROM node:20" />);
    await user.click(screen.getByRole('button', { name: /copy dockerfile to clipboard/i }));
    expect(await screen.findByRole('button', { name: /copied to clipboard/i })).toBeInTheDocument();
  });

  it('reverts to "Copy" label after 2 seconds', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyButton text="FROM node:20" />);
    await user.click(screen.getByRole('button', { name: /copy dockerfile to clipboard/i }));
    await screen.findByRole('button', { name: /copied to clipboard/i });
    vi.advanceTimersByTime(2001);
    expect(await screen.findByRole('button', { name: /copy dockerfile to clipboard/i })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
