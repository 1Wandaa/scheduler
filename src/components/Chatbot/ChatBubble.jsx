import React from 'react';

/**
 * Lightweight markdown renderer for chat bubbles.
 * Supports: **bold**, *italic*, `inline code`, headers (###),
 * bullet lists (- / •), numbered lists (1.), and horizontal rules (---).
 * No external dependencies — pure regex-based parsing.
 */

// Parse inline formatting: bold, italic, inline code
const renderInline = (text, keyPrefix = '') => {
  if (!text) return null;

  const parts = [];
  // Pattern order matters: code first (literal), then bold, then italic
  const regex = /(`[^`]+`)|(\*\*.*?\*\*)|(\*(?!\*).*?\*(?!\*))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      parts.push(
        <span key={`${keyPrefix}t${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }

    if (match[1]) {
      // Inline code: `code`
      parts.push(
        <code key={`${keyPrefix}c${match.index}`} className="chat-inline-code">
          {match[1].slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      // Bold: **text**
      parts.push(
        <strong key={`${keyPrefix}b${match.index}`}>
          {match[2].slice(2, -2)}
        </strong>
      );
    } else if (match[3]) {
      // Italic: *text*
      parts.push(
        <em key={`${keyPrefix}i${match.index}`}>
          {match[3].slice(1, -1)}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining plain text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`${keyPrefix}t${lastIndex}`}>
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : text;
};

const ChatBubble = ({ text }) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Empty line → spacer ──
    if (trimmed === '') {
      elements.push(<div key={`sp${i}`} className="chat-spacer" />);
      i++;
      continue;
    }

    // ── Horizontal rule: --- or *** or ___ ──
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr${i}`} className="chat-hr" />);
      i++;
      continue;
    }

    // ── Headers: # ## ### ──
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level + 2}`; // h3, h4, h5 (don't use h1/h2 inside chat)
      elements.push(
        <Tag key={`h${i}`} className="chat-header">
          {renderInline(headerMatch[2], `h${i}`)}
        </Tag>
      );
      i++;
      continue;
    }

    // ── Bullet list: - item or • item or * item (not bold) ──
    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/);
    if (bulletMatch && !trimmed.startsWith('**')) {
      // Collect consecutive bullet items
      const items = [];
      while (i < lines.length) {
        const bl = lines[i]?.trim();
        const bm = bl?.match(/^[-•*]\s+(.+)$/);
        if (bm && !bl.startsWith('**')) {
          items.push(bm[1]);
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`ul${i}`} className="chat-list">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul${i}li${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Numbered list: 1. item ──
    const numMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numMatch) {
      const items = [];
      while (i < lines.length) {
        const nl = lines[i]?.trim();
        const nm = nl?.match(/^\d+\.\s+(.+)$/);
        if (nm) {
          items.push(nm[1]);
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ol key={`ol${i}`} className="chat-list chat-list-ordered">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol${i}li${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Regular paragraph line ──
    elements.push(
      <span key={`p${i}`} className="chat-line">
        {renderInline(trimmed, `p${i}`)}
      </span>
    );
    i++;
  }

  return <div className="chat-bubble-content">{elements}</div>;
};

export default ChatBubble;
