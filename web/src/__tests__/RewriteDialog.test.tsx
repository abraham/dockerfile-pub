import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { RewriteDialog, ERROR_MESSAGES } from '../components/RewriteDialog';
import { SYSTEM_PROMPT } from '../data/rewrite/prompt';
import { deferred, fakeLanguageModel, VALID_DOCKERFILE } from './fake-language-model';
import type { FakeOptions } from './fake-language-model';

const CURRENT =
  'FROM node:26-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD ["node", "server.js"]';

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

function setup(options: FakeOptions = {}) {
  const fake = fakeLanguageModel(options);
  const onApply = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <RewriteDialog model={fake.model} dockerfile={CURRENT} onApply={onApply} onClose={onClose} />,
  );
  return { ...fake, onApply, onClose, user };
}

const textarea = () => screen.getByLabelText<HTMLTextAreaElement>('What do you need?');
const button = (name: string) => screen.getByRole('button', { name });
const status = () => screen.getByRole('status');

async function submit(user: ReturnType<typeof userEvent.setup>, text = 'Run as a non-root user') {
  await user.type(textarea(), text);
  await user.click(button('Rewrite'));
}

describe('RewriteDialog', () => {
  describe('request (§5.2)', () => {
    it('opens as a labelled modal dialog with focus in the request field', () => {
      setup();
      const dialog = screen.getByRole('dialog', { name: 'Rewrite this Dockerfile' });
      expect(dialog).toHaveAttribute('open');
      expect(dialog).toHaveAccessibleDescription(
        "Runs on your device with Chrome's built-in AI. Nothing is sent to a server.",
      );
      expect(textarea()).toHaveFocus();
      expect(textarea()).toHaveAttribute('maxlength', '500');
    });

    it('enables Rewrite only once there is a request, and counts characters', async () => {
      const { user } = setup();
      expect(button('Rewrite')).toBeDisabled();
      await user.type(textarea(), '   ');
      expect(button('Rewrite')).toBeDisabled();
      await user.type(textarea(), 'hi');
      expect(button('Rewrite')).toBeEnabled();
      expect(screen.getByText(/^5\/500/)).toBeInTheDocument();
    });

    it('inserts suggestions on their own lines', async () => {
      const { user } = setup();
      await user.click(button('Make the image smaller'));
      await user.click(button('Add a health check'));
      expect(textarea().value).toBe('Make the image smaller\nAdd a health check');
      expect(textarea()).toHaveFocus();
    });

    it('submits with Ctrl+Enter', async () => {
      const { user, prompts } = setup();
      await user.type(textarea(), 'Pin versions{Control>}{Enter}{/Control}');
      await screen.findByRole('heading', { name: /what changed/i });
      expect(prompts[0]).toContain('<request>\nPin versions\n</request>');
      expect(prompts[0]).toContain(`<dockerfile>\n${CURRENT}\n</dockerfile>`);
    });
  });

  describe('generation and review', () => {
    it('shows progress, then the changes and a diff, and moves focus to the result', async () => {
      const gate = deferred();
      const { user } = setup({ promptGate: gate.promise });
      await submit(user);
      expect(await screen.findByText('Rewriting…', { selector: 'p' })).toBeInTheDocument();
      expect(status()).toHaveTextContent('Rewriting…');
      expect(textarea()).toHaveAttribute('readonly');
      expect(button('Stop')).toBeInTheDocument();

      gate.resolve();
      const heading = await screen.findByRole('heading', { name: /what changed/i });
      expect(heading).toHaveTextContent('(AI-generated, may be inaccurate)');
      await waitFor(() => expect(heading).toHaveFocus());
      expect(status()).toHaveTextContent('Rewrite ready. Review the changes.');
      expect(screen.getByRole('listitem')).toHaveTextContent(
        'Runs the app as the non-root node user.',
      );

      const diff = screen.getByRole('region', { name: 'Changes to the Dockerfile' });
      expect(diff).toHaveAttribute('tabindex', '0');
      expect(diff.textContent).toContain('- EXPOSE 3000');
      expect(diff.textContent).toContain('+ USER node');
      expect(diff.textContent).toContain('  FROM node:26-alpine');
    });

    it('toggles between the diff and the full rewritten file', async () => {
      const { user } = setup();
      await submit(user);
      await user.click(await screen.findByRole('button', { name: 'Show full file' }));
      expect(button('Show full file')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('region', { name: 'Rewritten Dockerfile' }).textContent).toBe(
        VALID_DOCKERFILE,
      );
    });

    it('applies the rewrite with the trimmed request and closes (AIR-21)', async () => {
      const { user, onApply, onClose } = setup();
      await submit(user, '  Run as a non-root user  ');
      await user.click(await screen.findByRole('button', { name: 'Open in viewer' }));
      expect(onApply).toHaveBeenCalledWith(VALID_DOCKERFILE, 'Run as a non-root user');
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('goes back to the request with the same text on Try again', async () => {
      const { user } = setup();
      await submit(user, 'Smaller');
      await user.click(await screen.findByRole('button', { name: 'Try again' }));
      expect(textarea().value).toBe('Smaller');
      expect(textarea()).toHaveFocus();
    });

    it('uses one base session with the system prompt and destroys each clone (AIR-15)', async () => {
      const { user, create, sessions } = setup();
      await submit(user);
      await user.click(await screen.findByRole('button', { name: 'Try again' }));
      await user.click(button('Rewrite'));
      await screen.findByRole('heading', { name: /what changed/i });
      expect(create).toHaveBeenCalledOnce();
      const options = create.mock.calls[0][0];
      expect(options).toMatchObject({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });
      expect(options.initialPrompts).toEqual([{ role: 'system', content: SYSTEM_PROMPT }]);
      const [base, ...clones] = sessions;
      expect(clones).toHaveLength(2);
      expect(clones.every((clone) => clone.destroy.mock.calls.length === 1)).toBe(true);
      expect(base.destroy).not.toHaveBeenCalled();
    });
  });

  describe('download (AIR-17)', () => {
    it('creates the session only when Rewrite is pressed, and shows progress', async () => {
      const gate = deferred();
      const { user, create } = setup({
        availability: 'downloadable',
        download: [0.25, 1],
        downloadGate: gate.promise,
      });
      await user.type(textarea(), 'Smaller');
      expect(create).not.toHaveBeenCalled();
      await user.click(button('Rewrite'));
      expect(create).toHaveBeenCalledOnce();
      expect(await screen.findByText('25%')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Model download progress' })).toHaveAttribute(
        'value',
        '0.25',
      );
      expect(status()).toHaveTextContent("Downloading Chrome's on-device AI model");
      expect(button('Rewrite')).toBeDisabled();

      gate.resolve();
      await screen.findByRole('heading', { name: /what changed/i });
    });

    it('shows an indeterminate state while the model is prepared', async () => {
      const { user } = setup({
        availability: 'downloading',
        download: [1],
        downloadGate: new Promise(() => {}),
      });
      await submit(user);
      expect(
        await screen.findByText('Preparing the model…', { selector: 'p' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Preparing the model' })).not.toHaveAttribute(
        'value',
      );
    });
  });

  describe('stop and cancel (AIR-20)', () => {
    it('Stop aborts, destroys the clone and returns to the request without an error', async () => {
      const { user, sessions } = setup({ promptGate: new Promise(() => {}) });
      await submit(user);
      await user.click(await screen.findByRole('button', { name: 'Stop' }));
      await waitFor(() => expect(sessions[1].destroy).toHaveBeenCalled());
      expect(button('Rewrite')).toBeEnabled();
      expect(screen.queryByText("Couldn't rewrite")).not.toBeInTheDocument();
      expect(status()).toHaveTextContent('');
    });

    it('Escape closes the dialog and aborts the request', async () => {
      const { user, sessions, onClose } = setup({ promptGate: new Promise(() => {}) });
      await submit(user);
      await screen.findByRole('button', { name: 'Stop' });
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledOnce();
      await waitFor(() => expect(sessions[1].destroy).toHaveBeenCalled());
    });

    it('Cancel closes the dialog', async () => {
      const { user, onClose, onApply } = setup();
      await user.click(button('Cancel'));
      expect(onClose).toHaveBeenCalledOnce();
      expect(onApply).not.toHaveBeenCalled();
    });
  });

  describe('errors (§7, AIR-27)', () => {
    it('reports an unavailable model on open, with no way to retry (AIR-9)', async () => {
      setup({ availability: 'unavailable' });
      expect(
        await screen.findByText(ERROR_MESSAGES.unavailable, { selector: 'p' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^(Rewrite|Try again)$/ }),
      ).not.toBeInTheDocument();
      expect(button('Cancel')).toBeInTheDocument();
    });

    it.each<[string, FakeOptions, keyof typeof ERROR_MESSAGES]>([
      [
        'create() is not allowed',
        { createError: new DOMException('secret', 'NotAllowedError') },
        'prepare',
      ],
      ['the download fails', { createError: new Error('secret') }, 'prepare'],
      ['the input is larger than the free context', { usage: 901 }, 'too-long'],
      [
        'the prompt exceeds the quota',
        { promptError: new DOMException('secret', 'QuotaExceededError') },
        'too-long',
      ],
      ['the reply is not a Dockerfile', { reply: 'Sure! secret' }, 'invalid'],
      [
        'the input is not supported',
        { promptError: new DOMException('secret', 'NotSupportedError') },
        'generic',
      ],
      ['anything else fails', { promptError: new TypeError('secret') }, 'generic'],
    ])('shows a fixed message when %s', async (_, options, code) => {
      const { user } = setup(options);
      await submit(user);
      const heading = await screen.findByRole('heading', { name: "Couldn't rewrite" });
      await waitFor(() => expect(heading).toHaveFocus());
      expect(screen.getByText(ERROR_MESSAGES[code], { selector: 'p' })).toBeInTheDocument();
      expect(status()).toHaveTextContent(ERROR_MESSAGES[code]);
      expect(screen.getByRole('dialog').textContent).not.toContain('secret');
      expect(console.debug).toHaveBeenCalled();
    });

    it('Try again reruns the request', async () => {
      const { user, prompts } = setup({ reply: 'oops' });
      await submit(user);
      await user.click(await screen.findByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(prompts).toHaveLength(2));
    });
  });
});
