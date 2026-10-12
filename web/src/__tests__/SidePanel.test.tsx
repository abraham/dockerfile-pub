import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { SidePanel } from '../components/SidePanel';
import type { ResolvedToken } from '../components/DockerfileViewer';
import type { Explanation } from '../data/explanations';

const mockExplanation: Explanation = {
  title: 'FROM',
  short: 'Sets the base image.',
  details: 'Detail line one.\n\nDetail line two.',
  syntax: 'FROM <image>[:<tag>]',
  links: [{ label: 'FROM reference', url: 'https://docs.docker.com/reference/dockerfile/#from' }],
};

const mockToken: ResolvedToken = {
  id: '0-1',
  text: 'FROM',
  type: 'keyword',
  lineIndex: 0,
  tokenIndex: 1,
  explanationKey: 'FROM',
  explanation: mockExplanation,
};

describe('SidePanel', () => {
  it('is not visible when isOpen is false', () => {
    render(<SidePanel token={null} isOpen={false} onClose={() => {}} />);
    const panel = screen.getByTestId('side-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  it('is visible when isOpen is true with a token', () => {
    render(<SidePanel token={mockToken} isOpen={true} onClose={() => {}} />);
    const panel = screen.getByRole('complementary', { name: /explanation panel/i });
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('renders the explanation title when open', () => {
    render(<SidePanel token={mockToken} isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /from/i })).toBeInTheDocument();
  });

  it('renders the short description', () => {
    render(<SidePanel token={mockToken} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Sets the base image.')).toBeInTheDocument();
  });

  it('renders detail paragraphs', () => {
    render(<SidePanel token={mockToken} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Detail line one.')).toBeInTheDocument();
    expect(screen.getByText('Detail line two.')).toBeInTheDocument();
  });

  it('renders newline-separated mount type details as a list', () => {
    const mountToken: ResolvedToken = {
      ...mockToken,
      explanation: {
        ...mockExplanation,
        details:
          'type=cache — mounts a persistent cache directory.\n' +
          'type=secret — exposes a secret.\n' +
          'type=ssh — forwards an SSH agent socket.',
      },
    };

    render(<SidePanel token={mountToken} isOpen={true} onClose={() => {}} />);

    const firstItem = screen.getByText(/type=cache — mounts a persistent cache directory\./i);
    const list = firstItem.closest('ul');
    expect(list).toBeInTheDocument();
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the syntax block', () => {
    render(<SidePanel token={mockToken} isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('FROM <image>[:<tag>]')).toBeInTheDocument();
  });

  it('renders documentation links', () => {
    render(<SidePanel token={mockToken} isOpen={true} onClose={() => {}} />);
    const link = screen.getByRole('link', { name: /FROM reference/i });
    expect(link).toHaveAttribute('href', 'https://docs.docker.com/reference/dockerfile/#from');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SidePanel token={mockToken} isOpen={true} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close explanation panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Escape key is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SidePanel token={mockToken} isOpen={true} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when panel is closed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SidePanel token={null} isOpen={false} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing inside panel when isOpen=false', () => {
    render(<SidePanel token={mockToken} isOpen={false} onClose={() => {}} />);
    // Title heading should not be present
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });
});
