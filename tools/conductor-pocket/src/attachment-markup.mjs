const ATTACHMENT_MARKUP =
  /@⟦([^⟦⟧\r\n]{1,120})⟧\(([^()\s]{1,512})\)/gu;
const SAFE_ATTACHMENT_PATH =
  /^\.context\/attachments\/([A-Za-z0-9_-]{6,64})\/(image\.(?:jpe?g|png))$/i;
const SAFE_ATTACHMENT_ID = /^[A-Za-z0-9_-]{6,64}$/;

function safeRelativeAttachment(value) {
  if (typeof value !== 'string') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const match = SAFE_ATTACHMENT_PATH.exec(decoded);
  if (!match) return null;
  return {
    id: match[1],
    name: match[2].toLowerCase().replace('jpeg', 'jpg'),
    relativePath: decoded,
  };
}

export function validAttachmentId(value) {
  return typeof value === 'string' && SAFE_ATTACHMENT_ID.test(value);
}

export function hasAttachmentMentionSyntax(value) {
  return typeof value === 'string' && value.includes('@⟦');
}

export function attachmentMention({ name = 'image.jpg', relativePath }) {
  const parsed = safeRelativeAttachment(relativePath);
  if (!parsed) throw new TypeError('invalid_attachment_path');
  const safeName =
    typeof name === 'string' && /^image\.(?:jpe?g|png)$/i.test(name)
      ? name.toLowerCase().replace('jpeg', 'jpg')
      : parsed.name;
  return `@⟦${safeName}⟧(${encodeURIComponent(parsed.relativePath)})`;
}

export function parseAttachmentMessage(value) {
  const text = typeof value === 'string' ? value : '';
  const attachments = [];
  const cleaned = text.replace(
    ATTACHMENT_MARKUP,
    (markup, _displayName, encodedPath) => {
      const parsed = safeRelativeAttachment(encodedPath);
      if (!parsed) return markup;
      if (!attachments.some((attachment) => attachment.id === parsed.id)) {
        attachments.push(parsed);
      }
      return '';
    },
  );
  return {
    text: cleaned.trim(),
    attachments,
  };
}

export function composeAttachmentMessage(message, attachments = []) {
  const normalized = typeof message === 'string' ? message : '';
  const mentions = attachments.map(attachmentMention);
  if (mentions.length === 0) return normalized;
  return normalized.trim()
    ? `${mentions.join(' ')} ${normalized}`
    : mentions.join(' ');
}
