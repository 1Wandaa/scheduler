import React, { useState, useEffect, useRef } from 'react';
import { generativeModel } from '../../config/firebase';
import '../../styles/Chatbot.css';

const Chatbot = ({ schedules, professors = [], subjects = [], sections = [], rooms = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState(null);
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
      try { e.target.releasePointerCapture(e.pointerId); } catch(err){}
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
      // Build a rich text representation of the current state
      const scheduleContext = schedules.map(s => {
        const subject = s.subject?.code || s.subject?.name || 'Unknown Subject';
        const section = s.section?.name || 'Unknown Section';
        const prof = s.professor?.name || 'Unknown Professor';
        const room = s.room?.name || 'Unknown Room';
        const day = s.day;
        const time = s.timeSlot?.label || 'Unknown Time';
        return `- ${subject} for section ${section} is taught by ${prof} in ${room} on ${day} at ${time}.`;
      }).join('\n');

      const profContext = professors.map(p => `- ${p.name} (${p.department || 'No Dept'}). Specs: ${(p.specialization || []).length} subjects.`).join('\n');
      const roomContext = rooms.map(r => `- ${r.name} (${r.department || 'SHARED'}). Cap: ${r.capacity || '?'}.`).join('\n');

      // --- Conflict Detection ---
      const conflicts = [];
      const timeMap = {};
      
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
            
            const subj1 = s1.subject?.code || s1.subject?.name;
            const subj2 = s2.subject?.code || s2.subject?.name;
            const timeDesc = `on ${s1.day} at ${s1.timeSlot?.label}`;

            if (s1.room?.id && s1.room.id === s2.room?.id) {
              conflicts.push(`ROOM CONFLICT: ${s1.room.name} is double-booked for ${subj1} and ${subj2} ${timeDesc}.`);
            }
            if (s1.professor?.id && s1.professor.id === s2.professor?.id) {
              conflicts.push(`PROFESSOR CONFLICT: ${s1.professor.name} is double-booked for ${subj1} and ${subj2} ${timeDesc}.`);
            }
            if (s1.section?.id && s1.section.id === s2.section?.id) {
              conflicts.push(`SECTION CONFLICT: Section ${s1.section.name} is double-booked for ${subj1} and ${subj2} ${timeDesc}.`);
            }
          }
        }
      });
      
      // Deduplicate conflicts
      const uniqueConflicts = [...new Set(conflicts)];
      const conflictContext = uniqueConflicts.length > 0 
        ? uniqueConflicts.join('\n') 
        : 'No conflicts detected in the current schedule.';

      const systemPrompt = `You are an expert AI assistant for the SMARTSCHED university scheduling system.
Your job is to answer questions about the schedule, faculty, rooms, and subjects.
Be extremely helpful, concise, and format your answers beautifully using markdown (like **bold** or bullet points).

--- CURRENT SCHEDULE (${schedules.length} classes) ---
${scheduleContext || 'There are no classes scheduled yet.'}

--- DETECTED CONFLICTS ---
If the user asks about conflicts or how to fix them, you MUST suggest alternative schedules based on the OVERVIEWS below. Suggest an alternative room, professor, or time that fixes the conflict.
${conflictContext}

--- FACULTY OVERVIEW (${professors.length} professors) ---
${profContext || 'No faculty data.'}

--- ROOMS OVERVIEW (${rooms.length} rooms) ---
${roomContext || 'No room data.'}

Do not list all data unless explicitly asked. Summarize when appropriate.`;

      try {
        const chat = generativeModel.startChat({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          history: []
        });
        setChatSession(chat);
        setMessages([{ role: 'model', text: "Hello! I'm your SMARTSCHED assistant. Ask me anything about the schedule!" }]);
      } catch (error) {
        console.error("Failed to initialize chat:", error);
        setMessages([{ role: 'model', text: "Sorry, I couldn't connect to the AI service. Please try again later." }]);
      }
    };

    initChat();
  }, [isOpen, chatSession, schedules]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // A simple markdown parser for the chat bubbles
  const renderText = (text) => {
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

  const SUGGESTIONS = [
    "Are there any conflicts? How can I fix them?",
    "Who teaches what?",
    "Show me the schedule for BSCS 1A",
    "Which rooms are available on Monday?"
  ];

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !chatSession) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      // Use non-streaming sendMessage for reliability
      const result = await chatSession.sendMessage(userMsg);
      const responseText = result.response.text();
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error("Chat error:", error);
      console.error("Error code:", error?.code);
      console.error("Error details:", error?.customErrorData);

      let errorMsg = 'Sorry, I encountered an error while trying to process your request.';
      if (error?.code === 'api-not-enabled') {
        errorMsg = 'The AI service is not yet enabled for this project. Please enable the Firebase AI API in the Firebase console.';
      } else if (error?.code === 'fetch-error') {
        errorMsg = 'Could not reach the AI service. Please check your internet connection and try again.';
      } else if (error?.message) {
        errorMsg = `Error: ${error.message}`;
      }

      setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);

      // Reset session on error so next attempt re-initializes
      setChatSession(null);
    } finally {
      setIsTyping(false);
    }
  };

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
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div className="chat-bubble">
                  {renderText(msg.text)}
                </div>
              </div>
            ))}
            
            {messages.length === 1 && !isTyping && (
              <div className="chat-suggestions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 15px', justifyContent: 'center' }}>
                {SUGGESTIONS.map((sug, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => { setInput(sug); }} 
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--accent-primary)', transition: 'all 0.2s' }}
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

export default Chatbot;

