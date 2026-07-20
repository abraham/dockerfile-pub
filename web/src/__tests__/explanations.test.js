import { describe, it, expect } from 'vitest';
import { getExplanation } from '../data/explanations';

describe('RUN explanation', () => {
  it('explains chained user/group creation commands', () => {
    const run = getExplanation('RUN');
    expect(run.details).toContain('Everything after RUN is the shell command.');
    expect(run.details).toContain('addgroup -S appgroup');
    expect(run.details).toContain('adduser -S appuser -G appgroup');
    expect(run.details).toContain('only if that succeeds');
  });
});
