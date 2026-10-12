import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { SidePanel } from '../components/SidePanel';
import type { ResolvedToken } from '../components/DockerfileViewer';
import type { Explanation } from '../data/explanations';

const mockExplanation: Explanation = {
  category: 'Instruction',
  title: 'FROM',
  short: ['Sets the ', { code: 'base' }, ' image.'],
  details: [
    { type: 'paragraph', content: ['Detail line one.'] },
    { type: 'paragraph', content: ['Detail line two.'] },
  ],
  syntax: 'FROM <image>[:<tag>]',
  links: [{ label: 'FROM reference', url: 'https://docs.docker.com/reference/dockerfile/#from' }],
};

const mockToken: ResolvedToken = {
  id: '0-0',
  text: 'FROM',
  type: 'keyword',
  lineIndex: 0,
  tokenIndex: 0,
  column: 0,
  ref: { kind: 'instruction', instruction: 'FROM' },
  explanation: mockExplanation,
  summary: 'Sets the base image.',
};

function withExplanation(changes: Partial<Explanation>): ResolvedToken {
  return { ...mockToken, explanation: { ...mockExplanation, ...changes } };
}

const noop = () => {};

function renderPanel(
  token: ResolvedToken | null,
  isOpen = true,
  onClose = noop,
  onNavigate = noop,
) {
  return render(
    <SidePanel token={token} isOpen={isOpen} onClose={onClose} onNavigate={onNavigate} />,
  );
}

describe('SidePanel', () => {
  it('is not visible when isOpen is false', () => {
    renderPanel(null, false);
    expect(screen.getByTestId('side-panel')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is visible when isOpen is true with a token', () => {
    renderPanel(mockToken);
    const panel = screen.getByRole('complementary', { name: /explanation panel/i });
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('renders the category and title', () => {
    renderPanel(mockToken);
    expect(screen.getByText('Instruction')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FROM' })).toBeInTheDocument();
  });

  it('renders inline code in the short description as <code>', () => {
    renderPanel(mockToken);
    const code = screen.getByText('base');
    expect(code.tagName).toBe('CODE');
    expect(code.closest('p')).toHaveTextContent('Sets the base image.');
  });

  it('renders paragraphs, and lists only for list blocks', () => {
    renderPanel(
      withExplanation({
        details: [
          { type: 'paragraph', content: ['- not a list'] },
          { type: 'list', items: [['first ', { code: 'a' }], ['second']] },
        ],
      }),
    );
    expect(screen.getByText('- not a list').tagName).toBe('P');
    const list = screen.getByText('second').closest('ul');
    expect(list).toBeInTheDocument();
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('list')).toHaveLength(2); // details + links
  });

  it('renders markup-like text literally (EXP-5)', () => {
    renderPanel(withExplanation({ short: ['<img src=x onerror=alert(1)>', { code: '`-x`' }] }));
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('`-x`').tagName).toBe('CODE');
  });

  it('renders the syntax block', () => {
    renderPanel(mockToken);
    expect(screen.getByText('FROM <image>[:<tag>]')).toBeInTheDocument();
  });

  it('omits empty optional sections (EXP-7)', () => {
    renderPanel(withExplanation({ syntax: undefined }));
    expect(screen.queryByText('Syntax')).toBeNull();
    expect(screen.queryByText('See also')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows a deprecation notice', () => {
    renderPanel(
      withExplanation({ deprecated: { since: 'Docker 1.13', instead: [{ code: 'LABEL' }] } }),
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Deprecated since Docker 1.13. Use LABEL instead.',
    );
  });

  it('shows "See also" buttons that navigate', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const ref = { kind: 'flag', instruction: 'COPY', flag: '--from' } as const;
    renderPanel(withExplanation({ related: [ref] }), true, noop, onNavigate);
    await user.click(screen.getByRole('button', { name: 'COPY --from' }));
    expect(onNavigate).toHaveBeenCalledWith(ref);
  });

  it('renders documentation links', () => {
    renderPanel(mockToken);
    const link = screen.getByRole('link', { name: /FROM reference/i });
    expect(link).toHaveAttribute('href', 'https://docs.docker.com/reference/dockerfile/#from');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(mockToken, true, onClose);
    await user.click(screen.getByRole('button', { name: /close explanation panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Escape key is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(mockToken, true, onClose);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when panel is closed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(null, false, onClose);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing inside panel when isOpen=false', () => {
    renderPanel(mockToken, false);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });
});
