import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentMention,
  composeAttachmentMessage,
  hasAttachmentMentionSyntax,
  parseAttachmentMessage,
} from '../src/attachment-markup.mjs';

const attachment = {
  id: 'safe_image_123',
  name: 'image.jpg',
  relativePath:
    '.context/attachments/safe_image_123/image.jpg',
};

test('native Conductor attachment markup round-trips without exposing it in Pocket text', () => {
  const content = composeAttachmentMessage(
    'Explain this screenshot.',
    [attachment],
  );
  assert.equal(
    content,
    '@⟦image.jpg⟧(.context%2Fattachments%2Fsafe_image_123%2Fimage.jpg) Explain this screenshot.',
  );
  assert.deepEqual(parseAttachmentMessage(content), {
    text: 'Explain this screenshot.',
    attachments: [
      {
        id: 'safe_image_123',
        name: 'image.jpg',
        relativePath:
          '.context/attachments/safe_image_123/image.jpg',
      },
    ],
  });
});

test('image-only sends stay captionless and unsafe paths remain inert text', () => {
  const imageOnly = composeAttachmentMessage('', [attachment]);
  assert.equal(
    imageOnly,
    '@⟦image.jpg⟧(.context%2Fattachments%2Fsafe_image_123%2Fimage.jpg)',
  );
  assert.deepEqual(parseAttachmentMessage(imageOnly), {
    text: '',
    attachments: [
      {
        id: 'safe_image_123',
        name: 'image.jpg',
        relativePath:
          '.context/attachments/safe_image_123/image.jpg',
      },
    ],
  });
  const unsafe =
    '@⟦image.jpg⟧(..%2F..%2FSecrets%2Fimage.jpg) keep this';
  assert.deepEqual(parseAttachmentMessage(unsafe), {
    text: unsafe,
    attachments: [],
  });
  assert.equal(hasAttachmentMentionSyntax(unsafe), true);
  assert.equal(hasAttachmentMentionSyntax('ordinary caption'), false);
  assert.throws(
    () =>
      attachmentMention({
        name: 'image.jpg',
        relativePath: '../../Secrets/image.jpg',
      }),
    /invalid_attachment_path/,
  );
});
