import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderRichText,
  richTextProfile,
} from '../public/rich-text.js';

class FakeNode {
  constructor(nodeName, value = null) {
    this.nodeName = nodeName;
    this.value = value;
    this.children = [];
    this.className = '';
    this.attributes = {};
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

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
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

test('enhanced rich text collapses soft wraps and preserves hard breaks', () => {
  const fragment = renderRichText(
    fakeDocument,
    ['Soft', 'wrap  ', 'hard\\', 'next'].join('\n'),
  );
  const paragraph = descendants(fragment, 'P')[0];

  assert.equal(paragraph.textContent, 'Soft wraphardnext');
  assert.equal(descendants(paragraph, 'BR').length, 2);
});

test('enhanced rich text renders structured Markdown with semantic elements', () => {
  const fragment = renderRichText(
    fakeDocument,
    [
      '# Main heading',
      '### Small heading',
      '> A compact **quote**',
      '- [x] shipped',
      '- [ ] pending',
      '---',
      '| Surface | State |',
      '| --- | :---: |',
      '| Pocket | **Live** |',
    ].join('\n'),
  );

  assert.deepEqual(
    fragment.children.map((child) => child.nodeName),
    ['H2', 'H3', 'BLOCKQUOTE', 'UL', 'HR', 'DIV'],
  );
  assert.equal(descendants(fragment, 'BLOCKQUOTE')[0].textContent, 'A compact quote');
  assert.equal(descendants(fragment, 'INPUT').length, 2);
  assert.equal(descendants(fragment, 'INPUT')[0].checked, true);
  assert.equal(descendants(fragment, 'INPUT')[0].disabled, true);
  assert.equal(descendants(fragment, 'TABLE').length, 1);
  assert.equal(descendants(fragment, 'TH').length, 2);
  assert.equal(descendants(fragment, 'TD').length, 2);
  assert.equal(descendants(fragment, 'STRONG').at(-1).textContent, 'Live');
});

test('enhanced rich text supports nested lists and inline formatting', () => {
  const fragment = renderRichText(
    fakeDocument,
    [
      '- parent',
      '  - child with **bold and `code`**',
      '    1. nested step',
      '- sibling',
    ].join('\n'),
  );

  assert.equal(descendants(fragment, 'UL').length, 2);
  assert.equal(descendants(fragment, 'OL').length, 1);
  assert.equal(descendants(fragment, 'STRONG')[0].textContent, 'bold and code');
  assert.equal(descendants(fragment, 'STRONG')[0].children[1].nodeName, 'CODE');
});

test('enhanced rich text creates only safe absolute web links', () => {
  const fragment = renderRichText(
    fakeDocument,
    [
      '[Pocket **docs**](https://example.com/docs?q=1)',
      '[insecure](http://example.com/docs)',
      '[blocked](javascript:alert(1))',
      '[local](/settings)',
      '~~obsolete~~',
    ].join(' · '),
  );
  const links = descendants(fragment, 'A');

  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.com/docs?q=1');
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.match(fragment.textContent, /\[insecure\]\(http:\/\/example\.com\/docs\)/);
  assert.match(fragment.textContent, /\[blocked\]\(javascript:alert\(1\)\)/);
  assert.match(fragment.textContent, /\[local\]\(\/settings\)/);
  assert.equal(descendants(fragment, 'S')[0].textContent, 'obsolete');
});

test('enhanced rich text profiles content-specific density', () => {
  assert.equal(richTextProfile('Quick answer.').density, 'brief');
  assert.equal(richTextProfile('## Answer\n- one\n- two').density, 'structured');
  assert.equal(richTextProfile('x'.repeat(241)).density, 'standard');
});

test('enhanced rich text bounds adversarial work without raw HTML', () => {
  const headings = Array.from({ length: 500 }, (_, index) => `## Part ${index}`);
  const fragment = renderRichText(
    fakeDocument,
    [...headings, '['.repeat(10_000), '<script>alert(1)</script>'].join('\n'),
  );

  assert.ok(fragment.children.length <= 401);
  assert.match(
    fragment.textContent,
    /This long response continues in Conductor on your Mac\./,
  );
  assert.equal(descendants(fragment, 'SCRIPT').length, 0);
});
