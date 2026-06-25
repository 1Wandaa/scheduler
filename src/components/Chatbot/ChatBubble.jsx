import React from 'react';

const ChatBubble = ({ text }) => {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    // Bold syntax
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <span key={i} style={{ display: 'block', minHeight: '1.2em' }}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return <span key={j}>{part}</span>;
        })}
      </span>
    );
  });
};

export default ChatBubble;
