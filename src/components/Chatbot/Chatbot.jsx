import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generativeModel } from '../../config/firebase';
import '../../styles/Chatbot.css';
import { buildSystemPrompt } from './chatPromptBuilder';
import ChatBubble from './ChatBubble';

// Unique message ID generator
let msgIdCounter = 0;
const nextMsgId = () => `msg_${++msgIdCounter}_${Date.now()}`;

// Errors that are fatal and require session reset
const FATAL_ERROR_CODES = new Set(['api-not-enabled', 'permission-denied', 'not-found']);

// Determine if an error is transient (retry-able) vs fatal
const isTransientError = (error) => {
  if (!error) return false;
  if (FATAL_ERROR_CODES.has(error?.code)) return false;
  if (error?.code === 'fetch-error') return true;
  if (error?.message?.includes('network')) return true;
  if (error?.message?.includes('timeout')) return true;
  if (error?.message?.includes('500')) return true;
  if (error?.message?.includes('503')) return true;
  // Default: treat unknown errors as transient to preserve session
  return true;
};

const Chatbot = ({ schedules, professors = [], subjects = [], sections = [], rooms = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState(null);
  const [failedMessage, setFailedMessage] = useState(null); // Track last failed user message for retry
  const messagesEndRef = useRef(null);
  const dataRef = useRef({ schedules, professors, subjects, sections, rooms });
  const containerRef = useRef(null);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, moved: false });

  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.button !== undefined) return; // Left click or touch
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
      moved: false
    };
    if (e.target.setPointerCapture && e.pointerId) {
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }
    
    setPosition({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    if (e.target.releasePointerCapture && e.pointerId) {
      try { e.target.releasePointerCapture(e.pointerId); } catch(e){ console.error(e); }
    }
  };

  const handleFabClick = (e) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setIsOpen(true);
  };

  // Clamp position to viewport when chatbot is opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      // Small timeout to allow the window to render fully before measuring
      setTimeout(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const padding = 20;
        
        let dx = 0;
        let dy = 0;

        // Check if out of bounds on any side
        if (rect.left < padding) dx = padding - rect.left;
        else if (rect.right > window.innerWidth - padding) dx = window.innerWidth - padding - rect.right;
        
        if (rect.top < padding) dy = padding - rect.top;
        else if (rect.bottom > window.innerHeight - padding) dy = window.innerHeight - padding - rect.bottom;

        if (dx !== 0 || dy !== 0) {
          setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        }
      }, 10);
    }
  }, [isOpen]);

  // Reset chat session when data changes so context stays current
  useEffect(() => {
    const isDataDifferent = 
      dataRef.current.schedules !== schedules ||
      dataRef.current.professors !== professors ||
      dataRef.current.subjects !== subjects ||
      dataRef.current.sections !== sections ||
      dataRef.current.rooms !== rooms;

    if (isDataDifferent) {
      dataRef.current = { schedules, professors, subjects, sections, rooms };
      setChatSession(null);
    }
  }, [schedules, professors, subjects, sections, rooms]);

  useEffect(() => {
    if (!isOpen || chatSession) return;

    const initChat = () => {
      const systemPrompt = buildSystemPrompt(schedules, professors, rooms, sections, subjects);

      try {
        const chat = generativeModel.startChat({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          history: []
        });
        setChatSession(chat);

        // Build a contextual greeting based on current data
        const conflictCount = countConflicts(schedules);
        let greeting = "Hello! I'm your **SMARTSCHED Assistant**. I have access to your complete scheduling data.";
        if (schedules.length === 0) {
          greeting += "\n\nIt looks like there are no classes scheduled yet. I can help you once schedules are added!";
        } else {
          greeting += `\n\nI can see **${schedules.length}** scheduled classes across **${sections.length}** sections.`;
          if (conflictCount > 0) {
            greeting += ` ⚠️ I've detected **${conflictCount} conflict${conflictCount > 1 ? 's' : ''}** — ask me about them!`;
          } else {
            greeting += " ✅ No conflicts detected!";
          }
        }
        greeting += "\n\nWhat would you like to know?";

        setMessages([{ id: nextMsgId(), role: 'model', text: greeting, timestamp: Date.now() }]);
        setFailedMessage(null);
      } catch (error) {
        console.error("Failed to initialize chat:", error);
        setMessages([{ id: nextMsgId(), role: 'model', text: "Sorry, I couldn't connect to the AI service. Please try again later.", timestamp: Date.now() }]);
      }
    };

    initChat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, chatSession, schedules]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Dynamic suggestion generation ──
  const getFollowUpSuggestions = useCallback(() => {
    const lastBotMsg = [...messages].reverse().find(m => m.role === 'model');
    const lastBotText = (lastBotMsg?.text || '').toLowerCase();
    const hasConflicts = countConflicts(schedules) > 0;

    // If this is the initial greeting (only 1 message)
    if (messages.length <= 1) {
      const initial = [];
      if (hasConflicts) initial.push("Are there any conflicts? How can I fix them?");
      initial.push("Show me a summary of the current schedule");
      if (sections.length > 0) initial.push(`Show schedule for ${sections[0]?.name || 'a section'}`);
      initial.push("Which rooms are available on Monday?");
      return initial;
    }

    // Context-aware follow-ups based on what the AI just talked about
    const suggestions = [];

    if (lastBotText.includes('conflict')) {
      suggestions.push("How do I fix these conflicts?");
      suggestions.push("Which rooms are available as alternatives?");
    } else if (lastBotText.includes('schedule for') || lastBotText.includes('assigned to')) {
      if (hasConflicts) suggestions.push("Are there any conflicts here?");
      suggestions.push("What about the next section?");
      suggestions.push("Show faculty workload summary");
    } else if (lastBotText.includes('available') || lastBotText.includes('free')) {
      suggestions.push("Show me the busiest day");
      suggestions.push("Which professors are underloaded?");
    } else if (lastBotText.includes('professor') || lastBotText.includes('faculty') || lastBotText.includes('workload')) {
      suggestions.push("Who is the most loaded professor?");
      suggestions.push("Are any professors overloaded?");
    }

    // Always offer a general option
    if (suggestions.length === 0) {
      if (hasConflicts) suggestions.push("Show all conflicts");
      suggestions.push("Give me a schedule summary");
      suggestions.push("Which rooms are busiest?");
    }

    return suggestions.slice(0, 4); // Max 4 suggestions
  }, [messages, schedules, sections]);

  // ── Send message handler ──
  const sendMessage = useCallback(async (messageText) => {
    if (!messageText.trim() || !chatSession) return;

    const userMsg = messageText.trim();
    setInput('');
    setFailedMessage(null);
    setMessages(prev => [...prev, { id: nextMsgId(), role: 'user', text: userMsg, timestamp: Date.now() }]);
    setIsTyping(true);

    try {
      const result = await chatSession.sendMessage(userMsg);
      const responseText = result.response.text();
      setMessages(prev => [...prev, { id: nextMsgId(), role: 'model', text: responseText, timestamp: Date.now() }]);
      setFailedMessage(null);
    } catch (error) {
      console.error("Chat error:", error);
      console.error("Error code:", error?.code);
      console.error("Error details:", error?.customErrorData);

      let errorMsg;
      const transient = isTransientError(error);

      if (error?.code === 'api-not-enabled') {
        errorMsg = 'The AI service is not yet enabled for this project. Please enable the Firebase AI API in the Firebase console.';
      } else if (error?.code === 'fetch-error') {
        errorMsg = 'Could not reach the AI service. Please check your internet connection.';
      } else if (error?.message) {
        errorMsg = `Something went wrong: ${error.message}`;
      } else {
        errorMsg = 'Sorry, I encountered an error while processing your request.';
      }

      if (transient) {
        // Keep the session alive — just show error with retry option
        errorMsg += '\n\nYou can **retry** your last message using the button below.';
        setFailedMessage(userMsg);
      } else {
        // Fatal error — reset session
        setChatSession(null);
        setFailedMessage(null);
      }

      setMessages(prev => [...prev, { id: nextMsgId(), role: 'model', text: errorMsg, isError: true, timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  }, [chatSession]);

  const handleSend = async (e) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleRetry = () => {
    if (failedMessage) {
      // Remove the error message before retrying
      setMessages(prev => {
        const msgs = [...prev];
        // Remove last error message
        if (msgs.length > 0 && msgs[msgs.length - 1].isError) {
          msgs.pop();
        }
        // Remove the failed user message
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
          msgs.pop();
        }
        return msgs;
      });
      sendMessage(failedMessage);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
    // Auto-send if chat session is ready
    if (chatSession && !isTyping) {
      sendMessage(suggestion);
    }
  };

  const suggestions = getFollowUpSuggestions();

  return (
    <div 
      ref={containerRef}
      className={`chatbot-container ${isOpen ? 'open' : ''}`}
      style={{ 
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.1s ease',
        touchAction: 'none'
      }}
    >
      {!isOpen && (
        <button 
          className="chatbot-fab" 
          onClick={handleFabClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="chatbot-window">
          <div 
            className="chatbot-header"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          >
            <div className="chatbot-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              SMARTSCHED Assistant
            </div>
            <button className="chatbot-close" onClick={() => setIsOpen(false)}>×</button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.role}${msg.isError ? ' error' : ''}`}>
                <div className="chat-bubble">
                  <ChatBubble text={msg.text} />
                </div>
              </div>
            ))}

            {/* Retry button for failed messages */}
            {failedMessage && !isTyping && (
              <div className="chat-retry-container">
                <button className="chat-retry-btn" onClick={handleRetry}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  Retry last message
                </button>
              </div>
            )}
            
            {/* Dynamic suggestion chips — shown after any bot response when not typing */}
            {!isTyping && !failedMessage && suggestions.length > 0 && messages.length > 0 && (
              <div className="chat-suggestions">
                {suggestions.map((sug, idx) => (
                  <button 
                    key={idx} 
                    className="chat-suggestion-chip"
                    onClick={() => handleSuggestionClick(sug)} 
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}

            {isTyping && (
              <div className="chat-message model">
                <div className="chat-bubble typing">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chatbot-input-area" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the schedule..."
              disabled={isTyping}
            />
            <button type="submit" disabled={!input.trim() || isTyping}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// ── Utility: count conflicts from schedule data ──
function countConflicts(schedules) {
  const timeMap = {};
  let count = 0;

  schedules.forEach(s => {
    if (!s.day || !s.timeSlot?.id) return;
    const key = `${s.day}_${s.timeSlot.id}`;
    if (!timeMap[key]) timeMap[key] = [];
    timeMap[key].push(s);
  });

  Object.values(timeMap).forEach(slotSchedules => {
    if (slotSchedules.length < 2) return;
    for (let i = 0; i < slotSchedules.length; i++) {
      for (let j = i + 1; j < slotSchedules.length; j++) {
        const s1 = slotSchedules[i];
        const s2 = slotSchedules[j];
        if (s1.room?.id && s1.room.id === s2.room?.id) count++;
        if (s1.professor?.id && s1.professor.id === s2.professor?.id) count++;
        if (s1.section?.id && s1.section.id === s2.section?.id) count++;
      }
    }
  });

  return count;
}

export default Chatbot;
