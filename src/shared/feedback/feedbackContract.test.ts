import { describe, expect, it } from 'vitest';

import { FEEDBACK_LIMITS, validateFeedbackSubmission } from './feedbackContract';

const image = {
  contentBase64: 'aGVsbG8=',
  name: 'screen.png',
  size: 128,
  type: 'image/png'
};

describe('validateFeedbackSubmission', () => {
  it('accepts a minimal message', () => {
    expect(validateFeedbackSubmission({ message: 'Please add a lighter feedback path.' })).toMatchObject({
      ok: true
    });
  });

  it('keeps submitted app version metadata', () => {
    expect(validateFeedbackSubmission({
      message: 'Please add a lighter feedback path.',
      metadata: { appVersion: '0.6.4' }
    })).toMatchObject({
      ok: true,
      value: { metadata: { appVersion: '0.6.4' } }
    });
  });

  it('rejects an empty message', () => {
    expect(validateFeedbackSubmission({ message: '   ' })).toEqual({
      errors: ['message_required'],
      ok: false
    });
  });

  it('rejects oversized or unsupported attachments', () => {
    const result = validateFeedbackSubmission({
      attachments: [
        { ...image, size: FEEDBACK_LIMITS.attachmentSizeBytes + 1 },
        { ...image, type: 'image/gif' }
      ],
      message: 'The screenshot explains the problem.'
    });
    expect(result).toEqual({
      errors: ['attachment_0_size', 'attachment_1_type'],
      ok: false
    });
  });

  it('rejects too many attachments', () => {
    const result = validateFeedbackSubmission({
      attachments: [image, image, image, image],
      message: 'Too many images.'
    });
    expect(result).toMatchObject({
      errors: ['attachments_count'],
      ok: false
    });
  });
});
