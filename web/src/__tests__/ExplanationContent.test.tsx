import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { ExplanationContent } from '../components/ExplanationContent';
import type { Explanation } from '../data/explanations';

const base: Explanation = {
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

function renderContent(changes: Partial<Explanation> = {}, onNavigate = vi.fn()) {
  return render(
    <ExplanationContent
      explanation={{ ...base, ...changes }}
      close={<button type="button">Close</button>}
      onNavigate={onNavigate}
    />,
  );
}

describe('ExplanationContent (\u00a74)', () => {
  it('renders the category, the title as a code heading, and the close slot', () => {
    renderContent();
    expect(screen.getByText('Instruction')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 2, name: 'FROM' });
    expect(heading.querySelector('code')).toHaveTextContent('FROM');
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders inline code in the summary as <code> (EXP-18)', () => {
    renderContent();
    const code = screen.getByText('base');
    expect(code.tagName).toBe('CODE');
    expect(code.closest('p')).toHaveTextContent('Sets the base image.');
  });

  it('renders paragraphs, and lists only for list blocks (EXP-16, EXP-17)', () => {
    renderContent({
      details: [
        { type: 'paragraph', content: ['- not a list'] },
        { type: 'list', items: [['first ', { code: 'a' }], ['second']] },
      ],
    });
    expect(screen.getByText('- not a list').tagName).toBe('P');
    const list = screen.getByText('second').closest('ul');
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders markup-like text literally (PNL-12)', () => {
    renderContent({ short: ['<img src=x onerror=alert(1)>', { code: '`-x`' }] });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('`-x`').tagName).toBe('CODE');
  });

  it('renders the syntax block as a focusable region', () => {
    renderContent();
    const syntax = screen.getByRole('region', { name: 'Syntax' });
    expect(syntax).toHaveTextContent('FROM <image>[:<tag>]');
    expect(syntax).toHaveAttribute('tabindex', '0');
  });

  it('omits empty optional sections (EXP-7)', () => {
    renderContent({ syntax: undefined, related: [] });
    expect(screen.queryByText('Syntax')).toBeNull();
    expect(screen.queryByText('See also')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows a deprecation notice', () => {
    renderContent({ deprecated: { since: 'Docker 1.13', instead: [{ code: 'LABEL' }] } });
    expect(screen.getByRole('note')).toHaveTextContent(
      'Deprecated since Docker 1.13. Use LABEL instead.',
    );
  });

  it('labels "See also" buttons and reports the ref (PNL-26)', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderContent(
      {
        related: [
          { kind: 'flag', instruction: 'COPY', flag: '--from' },
          { kind: 'subkeyword', instruction: 'FROM', word: 'AS' },
          { kind: 'instruction', instruction: 'ARG' },
          { kind: 'directive', directive: 'syntax' },
        ],
      },
      onNavigate,
    );
    for (const name of ['FROM AS', 'ARG', '# syntax']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'COPY --from' }));
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'flag', instruction: 'COPY', flag: '--from' });
  });

  it('opens links safely and says they open a new tab (PNL-27)', () => {
    renderContent();
    const link = screen.getByRole('link', { name: 'FROM reference (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://docs.docker.com/reference/dockerfile/#from');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
