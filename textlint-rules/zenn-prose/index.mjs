const DEFAULT_OPTIONS = {
  maxParagraphLength: 250,
  maxConsecutiveSentenceEndings: 3,
};

const SENTENCE_ENDINGS = ['ませんでした', 'ました', 'でした', 'ません', 'です', 'ます', 'した'];
const CLOSING_CLICHE_RE = /参考になれば[*_\s]*(?:幸い|嬉しい|うれしい)[*_\s]*です/g;
const FULLWIDTH_COLON_RE = /：/g;
const ZENN_CONTAINER_LINE_RE = /^:::.*$/gm;
const ZENN_CONTAINER_KEYWORD_RE = /^:{3,}(?:message(?:[ \t]+alert)?|details)?/gm;
const ZENN_EMBED_LINE_RE = /^@\[[a-z0-9_-]+\]\([^\n]+\)[ \t]*$/gm;
const BARE_URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;

const BRACKET_GROUP_BY_OPEN = new Map([
  ['「', 'kagi'],
  ['『', 'double-kagi'],
  ['（', 'paren'],
  ['(', 'paren'],
  ['【', 'sumi'],
]);
const BRACKET_GROUP_BY_CLOSE = new Map([
  ['」', 'kagi'],
  ['』', 'double-kagi'],
  ['）', 'paren'],
  [')', 'paren'],
  ['】', 'sumi'],
]);
const SENTENCE_DELIMITERS = new Set(['。', '！', '？', '!', '?']);
const TRAILING_SENTENCE_DELIMITERS = new Set(['。', '！', '？', '!', '?']);

function trimTrailingUnbalancedParens(url) {
  let end = url.length;
  let balance = 0;
  for (const ch of url) {
    if (ch === '(') balance++;
    else if (ch === ')') balance--;
  }
  while (end > 0 && balance < 0) {
    let cursor = end;
    while (cursor > 0 && /[.,:;!?]/.test(url[cursor - 1])) {
      cursor--;
    }
    if (cursor > 0 && url[cursor - 1] === ')') {
      end = cursor - 1;
      balance++;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

function maskRange(chars, start, end) {
  for (let i = Math.max(0, start); i < Math.min(chars.length, end); i++) {
    if (chars[i] !== '\n') {
      chars[i] = ' ';
    }
  }
}

function maskPattern(chars, text, regex) {
  for (const match of text.matchAll(regex)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }
}

function maskBareUrls(chars, text) {
  for (const match of text.matchAll(BARE_URL_RE)) {
    const trimmed = trimTrailingUnbalancedParens(match[0]);
    maskRange(chars, match.index, match.index + trimmed.length);
  }
}

function walkChildren(node, visitor) {
  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) {
    visitor(child);
    walkChildren(child, visitor);
  }
}

function getMatchRanges(text, regex) {
  return [...text.matchAll(regex)].map((match) => [match.index, match.index + match[0].length]);
}

function stripRangesFromText(text, rangeStart, excludedRanges) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const offset = rangeStart + i;
    const excluded = excludedRanges.some(([start, end]) => offset >= start && offset < end);
    if (!excluded) result += text[i];
  }
  return result;
}

function stripExcludedLines(value, rawSlice, rangeStart, excludedRanges) {
  if (excludedRanges.length === 0) return value;
  const rawLines = rawSlice.split('\n');
  const valueLines = value.split('\n');
  if (rawLines.length !== valueLines.length) {
    return stripRangesFromText(value, rangeStart, excludedRanges);
  }
  let offset = rangeStart;
  const kept = [];
  for (let i = 0; i < rawLines.length; i++) {
    const lineEnd = offset + rawLines[i].length;
    const excluded =
      rawLines[i].length > 0 &&
      excludedRanges.some(([start, end]) => offset >= start && lineEnd <= end);
    if (!excluded) kept.push(valueLines[i]);
    offset = lineEnd + 1;
  }
  return kept.join('\n');
}

function buildMaskedProse(node, raw) {
  const chars = raw.split('');
  const baseStart = node.range[0];

  maskPattern(chars, raw, ZENN_CONTAINER_KEYWORD_RE);
  maskPattern(chars, raw, ZENN_EMBED_LINE_RE);

  walkChildren(node, (child) => {
    if (
      child.type === 'Code' ||
      child.type === 'Html' ||
      child.type === 'Image' ||
      child.type === 'footnoteReference'
    ) {
      maskRange(chars, child.range[0] - baseStart, child.range[1] - baseStart);
      return;
    }
    if (child.type === 'Link' && Array.isArray(child.children)) {
      const linkStart = child.range[0] - baseStart;
      const linkEnd = child.range[1] - baseStart;
      const lastChild = child.children[child.children.length - 1];
      const textEnd = lastChild ? lastChild.range[1] - baseStart : linkStart;
      maskRange(chars, textEnd, linkEnd);
    }
  });

  maskBareUrls(chars, chars.join(''));

  return chars.join('');
}

function collectVisibleParagraphText(node, raw) {
  const baseStart = node.range[0];
  const excludedRanges = [
    ...getMatchRanges(raw, ZENN_EMBED_LINE_RE),
    ...getMatchRanges(raw, ZENN_CONTAINER_LINE_RE),
  ];
  const parts = [];

  function isWithinExcluded(start, end) {
    return excludedRanges.some(([exStart, exEnd]) => start >= exStart && end <= exEnd);
  }

  function visit(current) {
    if (current.type === 'Html' || current.type === 'Image') return;
    if (current.type === 'Break') {
      parts.push('\n');
      return;
    }
    if (current.type === 'Str' || current.type === 'Code') {
      const value = current.value ?? '';
      const relStart = current.range[0] - baseStart;
      const relEnd = current.range[1] - baseStart;
      if (current.type === 'Str') {
        parts.push(
          stripExcludedLines(value, raw.slice(relStart, relEnd), relStart, excludedRanges),
        );
      } else if (!isWithinExcluded(relStart, relEnd)) {
        parts.push(value);
      }
      return;
    }
    if (Array.isArray(current.children)) {
      for (const child of current.children) {
        visit(child);
      }
    }
  }

  visit(node);

  return parts
    .join('')
    .replace(BARE_URL_RE, (match) => match.slice(trimTrailingUnbalancedParens(match).length))
    .replace(/\s+/g, '');
}

function splitSentences(text) {
  const sentences = [];
  const bracketStack = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const openGroup = BRACKET_GROUP_BY_OPEN.get(ch);
    const closeGroup = BRACKET_GROUP_BY_CLOSE.get(ch);
    if (openGroup) {
      bracketStack.push(openGroup);
    } else if (closeGroup) {
      const idx = bracketStack.lastIndexOf(closeGroup);
      if (idx !== -1) bracketStack.length = idx;
    } else if (bracketStack.length === 0 && SENTENCE_DELIMITERS.has(ch)) {
      while (i + 1 < text.length && TRAILING_SENTENCE_DELIMITERS.has(text[i + 1])) {
        i++;
      }
      const slice = text.slice(start, i + 1);
      if (slice.trim().length > 0) {
        sentences.push({ text: slice, startIndex: start });
      }
      start = i + 1;
    }
  }

  const rest = text.slice(start);
  if (rest.trim().length > 0) {
    sentences.push({ text: rest, startIndex: start });
  }

  return sentences;
}

function stripTrailingParentheticals(text) {
  let result = text;
  while (result.length > 0) {
    const trimmed = result.replace(/\s+$/, '');
    const last = trimmed[trimmed.length - 1];
    const open = last === '）' ? '（' : last === ')' ? '(' : null;
    if (!open) break;
    let depth = 0;
    let matchStart = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i] === last) depth++;
      else if (trimmed[i] === open) {
        depth--;
        if (depth === 0) {
          matchStart = i;
          break;
        }
      }
    }
    if (matchStart <= 0) break;
    result = trimmed.slice(0, matchStart);
  }
  return result;
}

function extractSentenceEnding(sentence) {
  let normalized = sentence
    .trim()
    .replace(/[。！？!?…\s」』\]*_~\p{Extended_Pictographic}️]+$/u, '');
  normalized = stripTrailingParentheticals(normalized).replace(/[。！？!?…\s」』）)\]*_~]+$/, '');
  for (const ending of SENTENCE_ENDINGS) {
    if (normalized.endsWith(ending)) {
      return ending;
    }
  }
  return null;
}

function firstNonWhitespaceIndex(text, offset) {
  const match = text.match(/\S/);
  return match ? offset + match.index : offset;
}

function findHeadingStructureErrors(headings) {
  const errors = [];

  for (let i = 0; i < headings.length; i++) {
    // 最初の見出しは記事タイトル（H1）の次として比べる
    const prevDepth = headings[i - 1]?.depth ?? 1;
    const current = headings[i];
    if (current.depth - prevDepth >= 2) {
      errors.push({
        node: current.node,
        message: `H${prevDepth} の次に H${current.depth} があり、見出しの段が飛んでいます。H${prevDepth + 1} にしてください。`,
      });
    }
  }

  const childrenByParent = new Map();
  const ancestors = [];
  for (const heading of headings) {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= heading.depth) {
      ancestors.pop();
    }
    const parent = ancestors[ancestors.length - 1] ?? null;
    if (heading.depth <= 4 && heading.depth === (parent?.depth ?? 1) + 1) {
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent).push(heading);
    }
    ancestors.push(heading);
  }

  for (const [parent, children] of childrenByParent) {
    if (children.length !== 1) continue;
    const [child] = children;
    const owner = parent ? `H${parent.depth}「${parent.text}」の下` : '記事';
    errors.push({
      node: child.node,
      message: `${owner}の H${child.depth} が 1 つだけです。見出しを外して本文に続けるか、同じ段の見出しを増やしてください。`,
    });
  }

  return errors;
}

export default function zennProseRule(context, userOptions = {}) {
  const { Syntax, RuleError, report, getSource } = context;
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  let blockquoteDepth = 0;
  const headings = [];

  function checkProhibitedExpressions(node, maskedText) {
    const raw = getSource(node);
    const quotedLinkTitleRanges = [];
    walkChildren(node, (child) => {
      const start = child.range[0] - node.range[0];
      // 裸の URL も Link になり、後ろの全角文字まで範囲に含むので、[...](...) の形だけにする
      if (child.type === 'Link' && raw[start] === '[') {
        quotedLinkTitleRanges.push([start, child.range[1] - node.range[0]]);
      }
    });

    for (const match of maskedText.matchAll(FULLWIDTH_COLON_RE)) {
      const isInQuotedLinkTitle = quotedLinkTitleRanges.some(
        ([start, end]) => match.index >= start && match.index < end,
      );
      if (isInQuotedLinkTitle) continue;
      report(
        node,
        new RuleError('全角コロン「：」ではなく半角コロン「:」を使ってください。', {
          index: match.index,
        }),
      );
    }

    for (const match of maskedText.matchAll(CLOSING_CLICHE_RE)) {
      report(
        node,
        new RuleError(
          `定型クロージング「${match[0]}」は避け、具体的な次の一歩や問いかけを書いてください。`,
          { index: match.index },
        ),
      );
    }
  }

  return {
    [Syntax.BlockQuote]() {
      blockquoteDepth++;
    },
    [`${Syntax.BlockQuote}:exit`]() {
      blockquoteDepth--;
    },
    [`${Syntax.Document}:exit`]() {
      for (const { node, message } of findHeadingStructureErrors(headings)) {
        report(node, new RuleError(message));
      }
    },
    [Syntax.Header](node) {
      if (blockquoteDepth > 0) return;

      headings.push({
        node,
        depth: node.depth,
        text: getSource(node).replace(/^#+\s*/, ''),
      });

      if (node.depth >= 5) {
        report(
          node,
          new RuleError(`H${node.depth} 見出しは使わず、H2〜H4 の階層に整理してください。`),
        );
      }

      const masked = buildMaskedProse(node, getSource(node));
      checkProhibitedExpressions(node, masked);
    },
    [Syntax.Paragraph](node) {
      if (blockquoteDepth > 0) return;

      const raw = getSource(node);
      const visibleLength = [...collectVisibleParagraphText(node, raw)].length;
      if (visibleLength > options.maxParagraphLength) {
        report(
          node,
          new RuleError(
            `1 段落が ${visibleLength} 字あります（上限 ${options.maxParagraphLength} 字）。段落を分割してください。`,
          ),
        );
      }

      const masked = buildMaskedProse(node, raw);
      checkProhibitedExpressions(node, masked);

      const sentences = splitSentences(masked);
      const zennBlockBoundaries = getMatchRanges(raw, ZENN_CONTAINER_LINE_RE);
      let prevEnding = null;
      let streak = 0;

      for (const sentence of sentences) {
        const sentenceEnd = sentence.startIndex + sentence.text.length;
        const boundary = zennBlockBoundaries.find(
          ([start]) => start >= sentence.startIndex && start < sentenceEnd,
        );
        if (boundary) {
          prevEnding = null;
          streak = 0;
          const isDetailsTitle = masked.slice(boundary[1], sentenceEnd).trim() === '';
          if (isDetailsTitle) continue;
        }
        const ending = extractSentenceEnding(sentence.text);
        if (ending && ending === prevEnding) {
          streak++;
        } else if (ending) {
          prevEnding = ending;
          streak = 1;
        } else {
          prevEnding = null;
          streak = 0;
        }

        if (streak >= options.maxConsecutiveSentenceEndings) {
          report(
            node,
            new RuleError(
              `文末「${ending}」が ${streak} 回連続しています。語尾に変化をつけてください。`,
              { index: firstNonWhitespaceIndex(sentence.text, sentence.startIndex) },
            ),
          );
        }
      }
    },
    [Syntax.TableCell](node) {
      if (blockquoteDepth > 0) return;
      const masked = buildMaskedProse(node, getSource(node));
      checkProhibitedExpressions(node, masked);
    },
  };
}
