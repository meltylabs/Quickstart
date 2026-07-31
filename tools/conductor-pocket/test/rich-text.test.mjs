import assert from 'node:assert/strict';
import test from 'node:test';

import { renderRichText } from '../public/rich-text.js';

class FakeNode {
  constructor(nodeName, value = null) {
    this.nodeName = nodeName;
    this.value = value;
    this.children = [];
    this.className = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  set textContent(value) {
    this.children = [new FakeNode('#text', String(value))];
  }

  get textContent() {
    if (this.nodeName === '#text') return this.value;
    return this.children.map((child) => child.textContent).join('');
  }
}

const fakeDocument = {
  createDocumentFragment() {
    return new FakeNode('#document-fragment');
  },
  createElement(tag) {
    return new FakeNode(String(tag).toUpperCase());
  },
  createTextNode(text) {
    return new FakeNode('#text', String(text));
  },
};

function descendants(node, nodeName) {
  const matches = node.nodeName === nodeName ? [node] : [];
  for (const child of node.children) {
    matches.push(...descendants(child, nodeName));
  }
  return matches;
}

test('rich text recognizes adjacent Markdown blocks without blank lines', () => {
  const fragment = renderRichText(
    fakeDocument,
    [
      '## Fast path',
      'Intro copy',
      '- first',
      '- **second**',
      '3. three',
      '7. use `Conductor`',
      '```text',
      'phone → relay',
      '```',
    ].join('\n'),
  );

  assert.deepEqual(
    fragment.children.map((child) => child.nodeName),
    ['H2', 'P', 'UL', 'OL', 'PRE'],
  );
  assert.equal(descendants(fragment, 'STRONG')[0].textContent, 'second');
  assert.equal(descendants(fragment, 'CODE')[0].textContent, 'Conductor');
  assert.equal(descendants(fragment, 'PRE')[0].textContent, 'phone → relay');
  assert.equal(descendants(fragment, 'OL')[0].start, 3);
  assert.deepEqual(
    descendants(fragment, 'OL')[0].children.map((child) => child.value),
    [3, 7],
  );
});

test('rich text keeps code identifiers and multiplication literal', () => {
  const source =
    'MAX_RETRY_COUNT, 2 * 3 * 4, 2*3*4, and 2 *3* 4 stay exact.';
  const fragment = renderRichText(fakeDocument, source);

  assert.equal(fragment.textContent, source);
  assert.equal(descendants(fragment, 'EM').length, 0);
});

test('rich text creates only fixed safe elements for hostile model text', () => {
  const hostile = '<img src=x onerror=alert(1)> **visible**';
  const fragment = renderRichText(fakeDocument, hostile);
  const elementNames = descendants(fragment, 'P')[0].children
    .filter((child) => child.nodeName !== '#text')
    .map((child) => child.nodeName);

  assert.equal(fragment.textContent, '<img src=x onerror=alert(1)> visible');
  assert.deepEqual(elementNames, ['STRONG']);
  assert.equal(descendants(fragment, 'IMG').length, 0);
});
