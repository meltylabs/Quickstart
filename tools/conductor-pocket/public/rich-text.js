const MAX_BLOCKS = 400;
const MAX_NESTING = 4;
const MAX_INLINE_NODES = 2_000;
const MAX_INLINE_ATTEMPTS = 2_000;
const MAX_TABLE_COLUMNS = 12;
const MAX_TABLE_ROWS = 100;

const FENCE_PATTERN = /^\s*```([^\s`]*)?\s*$/;
const HEADING_PATTERN = /^\s*(#{1,6})\s+(.+?)\s*$/;
const THEMATIC_BREAK_PATTERN =
  /^\s{0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/;
const BLOCKQUOTE_PATTERN = /^\s{0,3}>\s?(.*)$/;
const LIST_ITEM_PATTERN = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.+)$/;
const TABLE_DELIMITER_CELL = /^:?-{3,}:?$/;
const ESCAPABLE = new Set([
  '\\',
  '`',
  '*',
  '_',
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
  '#',
  '+',
  '-',
  '.',
  '!',
  '|',
  '>',
  '~',
]);

function indentation(value) {
  return String(value).replaceAll('\t', '    ').length;
}

function listMarker(line) {
  const match = String(line).match(LIST_ITEM_PATTERN);
  if (!match) return null;
  const ordered = /^\d/.test(match[2]);
  return {
    indent: indentation(match[1]),
    ordered,
    number: ordered ? Number.parseInt(match[2], 10) : null,
    text: match[3],
  };
}

function isEscaped(value, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function splitTableRow(line) {
  const source = String(line).trim();
  if (!source.includes('|')) return null;
  const cells = [];
  let cell = '';
  let codeFence = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && index + 1 < source.length) {
      cell += character + source[index + 1];
      index += 1;
      continue;
    }
    if (character === '`') {
      let run = 1;
      while (source[index + run] === '`') run += 1;
      codeFence = codeFence === run ? 0 : codeFence || run;
      cell += '`'.repeat(run);
      index += run - 1;
      continue;
    }
    if (character === '|' && codeFence === 0) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  if (source.startsWith('|')) cells.shift();
  if (source.endsWith('|')) cells.pop();
  if (cells.length < 2 || cells.length > MAX_TABLE_COLUMNS) return null;
  return cells;
}

function tableDelimiter(line) {
  const cells = splitTableRow(line);
  if (!cells || !cells.every((cell) => TABLE_DELIMITER_CELL.test(cell))) {
    return null;
  }
  return cells.map((cell) => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
    if (cell.endsWith(':')) return 'right';
    return 'left';
  });
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) return false;
  const header = splitTableRow(lines[index]);
  const alignment = tableDelimiter(lines[index + 1]);
  return Boolean(header && alignment && header.length === alignment.length);
}

function startsBlock(lines, index, depth) {
  const line = lines[index];
  if (!line?.trim()) return true;
  if (FENCE_PATTERN.test(line)) return true;
  if (HEADING_PATTERN.test(line)) return true;
  if (THEMATIC_BREAK_PATTERN.test(line)) return true;
  if (BLOCKQUOTE_PATTERN.test(line)) return true;
  if (listMarker(line)) return true;
  return depth < MAX_NESTING && isTableStart(lines, index);
}

function hardBreakLine(line) {
  const source = String(line);
  if (/ {2,}$/.test(source)) {
    return { text: source.replace(/ {2,}$/, ''), hardBreak: true };
  }
  if (/\\$/.test(source) && !/\\\\$/.test(source)) {
    return { text: source.slice(0, -1), hardBreak: true };
  }
  return { text: source, hardBreak: false };
}

function parseList(lines, start, baseIndent, depth) {
  const first = listMarker(lines[start]);
  const block = {
    type: 'list',
    ordered: first.ordered,
    start: first.number || 1,
    items: [],
  };
  let index = start;

  while (index < lines.length && block.items.length < MAX_BLOCKS) {
    const marker = listMarker(lines[index]);
    if (
      !marker ||
      marker.indent !== baseIndent ||
      marker.ordered !== block.ordered
    ) {
      break;
    }

    const textLines = [marker.text];
    const children = [];
    index += 1;

    while (index < lines.length) {
      if (!lines[index].trim()) {
        let next = index;
        while (next < lines.length && !lines[next].trim()) next += 1;
        const nextMarker = listMarker(lines[next]);
        if (nextMarker && nextMarker.indent >= baseIndent) {
          index = next;
          if (nextMarker.indent === baseIndent) break;
          continue;
        }
        break;
      }

      const nestedMarker = listMarker(lines[index]);
      if (nestedMarker) {
        if (nestedMarker.indent === baseIndent) break;
        if (nestedMarker.indent < baseIndent) break;
        if (depth < MAX_NESTING) {
          const nested = parseList(
            lines,
            index,
            nestedMarker.indent,
            depth + 1,
          );
          children.push(nested.block);
          index = nested.next;
          continue;
        }
      }

      const leading = lines[index].match(/^\s*/)?.[0] || '';
      if (indentation(leading) > baseIndent) {
        textLines.push(lines[index].trimStart());
        index += 1;
        continue;
      }
      break;
    }

    const task = textLines[0].match(/^\[([ xX])\]\s+(.+)$/);
    if (task) textLines[0] = task[2];
    block.items.push({
      lines: textLines,
      checked: task ? task[1].toLowerCase() === 'x' : null,
      children,
      value: marker.number,
    });
  }

  return { block, next: index };
}

function parseBlocksFromLines(lines, depth = 0) {
  const blocks = [];
  let index = 0;

  while (index < lines.length && blocks.length < MAX_BLOCKS) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE_PATTERN);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: 'code',
        language: fence[1] || null,
        text: code.join('\n').replace(/\n+$/, ''),
      });
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitTableRow(lines[index]);
      const alignment = tableDelimiter(lines[index + 1]);
      const rows = [];
      index += 2;
      while (index < lines.length && rows.length < MAX_TABLE_ROWS) {
        if (!lines[index].trim()) break;
        const cells = splitTableRow(lines[index]);
        if (!cells || cells.length !== header.length) break;
        rows.push(cells);
        index += 1;
      }
      blocks.push({ type: 'table', header, alignment, rows });
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (THEMATIC_BREAK_PATTERN.test(line)) {
      blocks.push({ type: 'thematic-break' });
      index += 1;
      continue;
    }

    const quote = line.match(BLOCKQUOTE_PATTERN);
    if (quote && depth < MAX_NESTING) {
      const quoteLines = [];
      while (index < lines.length) {
        const match = lines[index].match(BLOCKQUOTE_PATTERN);
        if (!match) break;
        quoteLines.push(match[1]);
        index += 1;
      }
      blocks.push({
        type: 'blockquote',
        blocks: parseBlocksFromLines(quoteLines, depth + 1),
      });
      continue;
    }

    const marker = listMarker(line);
    if (marker) {
      const parsed = parseList(lines, index, marker.indent, depth);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      (paragraphLines.length === 0 || !startsBlock(lines, index, depth))
    ) {
      paragraphLines.push(lines[index].trimStart());
      index += 1;
    }
    if (paragraphLines.length === 0) {
      paragraphLines.push(line.trimStart());
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  if (index < lines.length) {
    blocks.push({
      type: 'paragraph',
      lines: ['This long response continues in Conductor on your Mac.'],
    });
  }
  return blocks;
}

function parseBlocks(text) {
  return parseBlocksFromLines(
    String(text).replace(/\r\n?/g, '\n').split('\n'),
  );
}

function appendPlain(document, parent, value) {
  let output = '';
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) {
    if (
      source[index] === '\\' &&
      index + 1 < source.length &&
      ESCAPABLE.has(source[index + 1])
    ) {
      output += source[index + 1];
      index += 1;
    } else {
      output += source[index];
    }
  }
  if (output) parent.append(document.createTextNode(output));
}

function closingDelimiter(source, delimiter, start) {
  let index = source.indexOf(delimiter, start);
  while (index >= 0) {
    if (!isEscaped(source, index)) return index;
    index = source.indexOf(delimiter, index + delimiter.length);
  }
  return -1;
}

function safeLink(destination) {
  try {
    const parsed = new URL(destination);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function inlineToken(source, index) {
  if (source[index] === '`') {
    let run = 1;
    while (source[index + run] === '`') run += 1;
    const delimiter = '`'.repeat(run);
    const close = closingDelimiter(source, delimiter, index + run);
    if (close > index + run && !source.slice(index + run, close).includes('\n')) {
      return {
        type: 'code',
        text: source.slice(index + run, close),
        end: close + run,
      };
    }
  }

  if (source[index] === '[') {
    const middle = closingDelimiter(source, '](', index + 1);
    if (middle > index + 1) {
      const close = closingDelimiter(source, ')', middle + 2);
      if (close > middle + 2) {
        const destination = source.slice(middle + 2, close).trim();
        const href = safeLink(destination);
        if (href) {
          return {
            type: 'link',
            text: source.slice(index + 1, middle),
            href,
            end: close + 1,
          };
        }
      }
    }
  }

  if (source.startsWith('**', index)) {
    const close = closingDelimiter(source, '**', index + 2);
    const text = close > index + 2 ? source.slice(index + 2, close) : '';
    if (text.trim() && !text.includes('\n')) {
      return { type: 'strong', text, end: close + 2 };
    }
  }

  if (source.startsWith('~~', index)) {
    const close = closingDelimiter(source, '~~', index + 2);
    const text = close > index + 2 ? source.slice(index + 2, close) : '';
    if (text.trim() && !text.includes('\n')) {
      return { type: 'strike', text, end: close + 2 };
    }
  }

  if (source[index] === '*' && source[index + 1] !== '*') {
    const previous = source[index - 1] || '';
    const next = source[index + 1] || '';
    if (!/[\w*]/.test(previous) && next && !/[\s*]/.test(next)) {
      const close = closingDelimiter(source, '*', index + 1);
      const text = close > index + 1 ? source.slice(index + 1, close) : '';
      const after = source[close + 1] || '';
      if (
        text.trim() &&
        !text.includes('\n') &&
        !/^\d+(?:[.,]\d+)?$/.test(text) &&
        !/\w/.test(after)
      ) {
        return { type: 'emphasis', text, end: close + 1 };
      }
    }
  }

  return null;
}

function appendInline(
  document,
  parent,
  value,
  depth = 0,
  budget = { count: 0 },
) {
  const source = String(value);
  let cursor = 0;
  let plainStart = 0;
  let attempts = 0;

  while (
    cursor < source.length &&
    budget.count < MAX_INLINE_NODES &&
    attempts < MAX_INLINE_ATTEMPTS
  ) {
    if (
      isEscaped(source, cursor) ||
      !['`', '[', '*', '~'].includes(source[cursor])
    ) {
      cursor += 1;
      continue;
    }
    attempts += 1;
    const token = inlineToken(source, cursor);
    if (!token) {
      cursor += 1;
      continue;
    }

    appendPlain(document, parent, source.slice(plainStart, cursor));
    budget.count += 1;
    if (token.type === 'code') {
      const code = document.createElement('code');
      code.textContent = token.text.replace(/\s*\n\s*/g, ' ');
      parent.append(code);
    } else {
      const tag =
        token.type === 'link'
          ? 'a'
          : token.type === 'strong'
            ? 'strong'
            : token.type === 'strike'
              ? 's'
              : 'em';
      const element = document.createElement(tag);
      if (token.type === 'link') {
        element.href = token.href;
        element.target = '_blank';
        element.rel = 'noopener noreferrer';
      }
      if (depth >= MAX_NESTING) {
        appendPlain(document, element, token.text);
      } else {
        appendInline(document, element, token.text, depth + 1, budget);
      }
      parent.append(element);
    }
    cursor = token.end;
    plainStart = cursor;
  }

  appendPlain(document, parent, source.slice(plainStart));
}

function appendInlineLines(document, parent, lines) {
  const budget = { count: 0 };
  lines.forEach((line, index) => {
    const parsed = hardBreakLine(line);
    appendInline(document, parent, parsed.text.trim(), 0, budget);
    if (index >= lines.length - 1) return;
    if (parsed.hardBreak) parent.append(document.createElement('br'));
    else parent.append(document.createTextNode(' '));
  });
}

function renderList(document, block) {
  const list = document.createElement(block.ordered ? 'ol' : 'ul');
  if (block.ordered) list.start = block.start;
  if (block.items.some((item) => item.checked != null)) {
    list.className = 'task-list';
  }

  for (const item of block.items) {
    const listItem = document.createElement('li');
    if (block.ordered && item.value != null) listItem.value = item.value;
    if (item.checked != null) {
      listItem.className = 'task-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      checkbox.checked = item.checked;
      checkbox.setAttribute?.(
        'aria-label',
        item.checked ? 'Completed item' : 'Incomplete item',
      );
      listItem.append(checkbox);
      const copy = document.createElement('span');
      appendInlineLines(document, copy, item.lines);
      listItem.append(copy);
    } else {
      appendInlineLines(document, listItem, item.lines);
    }
    for (const child of item.children) listItem.append(renderList(document, child));
    list.append(listItem);
  }
  return list;
}

function renderBlocks(document, parent, blocks) {
  for (const block of blocks) {
    if (block.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = block.text;
      if (block.language) code.className = `language-${block.language}`;
      pre.append(code);
      parent.append(pre);
      continue;
    }

    if (block.type === 'heading') {
      const tier = Math.min(4, Math.max(2, block.level));
      const heading = document.createElement(`h${tier}`);
      heading.className = `message-heading heading-tier-${tier}`;
      appendInline(document, heading, block.text);
      parent.append(heading);
      continue;
    }

    if (block.type === 'list') {
      parent.append(renderList(document, block));
      continue;
    }

    if (block.type === 'blockquote') {
      const quote = document.createElement('blockquote');
      renderBlocks(document, quote, block.blocks);
      parent.append(quote);
      continue;
    }

    if (block.type === 'thematic-break') {
      parent.append(document.createElement('hr'));
      continue;
    }

    if (block.type === 'table') {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      wrapper.tabIndex = 0;
      wrapper.setAttribute?.('role', 'region');
      wrapper.setAttribute?.('aria-label', 'Scrollable table');
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      block.header.forEach((cell, index) => {
        const heading = document.createElement('th');
        heading.scope = 'col';
        heading.className = `align-${block.alignment[index]}`;
        appendInline(document, heading, cell);
        headRow.append(heading);
      });
      head.append(headRow);
      table.append(head);
      if (block.rows.length > 0) {
        const body = document.createElement('tbody');
        for (const row of block.rows) {
          const tableRow = document.createElement('tr');
          row.forEach((cell, index) => {
            const data = document.createElement('td');
            data.className = `align-${block.alignment[index]}`;
            appendInline(document, data, cell);
            tableRow.append(data);
          });
          body.append(tableRow);
        }
        table.append(body);
      }
      wrapper.append(table);
      parent.append(wrapper);
      continue;
    }

    const paragraph = document.createElement('p');
    appendInlineLines(document, paragraph, block.lines);
    parent.append(paragraph);
  }
}

export function richTextProfile(text) {
  const blocks = parseBlocks(text);
  const structured =
    blocks.length > 1 || blocks.some((block) => block.type !== 'paragraph');
  const brief =
    blocks.length === 1 &&
    blocks[0].type === 'paragraph' &&
    String(text).trim().length <= 240;
  return {
    density: brief ? 'brief' : structured ? 'structured' : 'standard',
    blockCount: blocks.length,
  };
}

export function renderRichText(document, text) {
  const fragment = document.createDocumentFragment();
  renderBlocks(document, fragment, parseBlocks(text));
  return fragment;
}
