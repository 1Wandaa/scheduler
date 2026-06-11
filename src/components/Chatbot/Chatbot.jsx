import React, { useState, useEffect, useRef } from 'react';
import { generativeModel } from '../../config/firebase';
import '../../styles/Chatbot.css';

const Chatbot = ({ schedules }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState(null);
  const messagesEndRef = useRef(null);
  const schedulesRef = useRef(schedules);

  // Reset chat session when schedules change so context stays current
  useEffect(() => {
    if (schedulesRef.current !== schedules) {
      schedulesRef.current = schedules;
      setChatSession(null);
    }
  }, [schedules]);

  useEffect(() => {
    if (!isOpen || chatSession) return;

    const initChat = () => {
      // Phase 5.1: Build a richer text representation of the current schedule
      const profLoad = {};
      const profRooms = {};
      const scheduleContext = schedules.map(s => {
        const subject = s.subject?.code || s.subject?.name || 'Unknown Subject';
        const section = s.section?.name || 'Unknown Section';
        const prof = s.professor?.name || 'Unknown Professor';
        const room = s.room?.name || 'Unknown Room';
        const day = s.day;
        const time = s.timeSlot?.label || 'Unknown Time';
        
        // Track stats for the prompt
        if (s.professor?.id) {
          const credits = Number(s.subject?.credits || 3);
          profLoad[s.professor.name] = (profLoad[s.professor.name] || 0) + credits;
          if (!profRooms[s.professor.name]) profRooms[s.professor.name] = new Set();
          if (s.room?.name) profRooms[s.professor.name].add(s.room.name);
        }

        return `${subject} for section ${section} is taught by ${prof} in ${room} on ${day} at ${time}.`;
      }).join('\n');

      const profStats = Object.entries(profLoad).map(([name, units]) => {
        const rooms = Array.from(profRooms[name] || []).join(', ');
        return `- ${name}: ~${units} units, Rooms used: [${rooms}]`;
      }).join('\n');

      const systemPrompt = `You are a helpful AI assistant for the SMARTSCHED university scheduling system.
Your job is to answer questions about the schedule, analyze workload, and spot issues.

Here is the current schedule data:
${scheduleContext || 'There are no classes scheduled yet.'}

PROFESSOR STATS (Estimated Workload & Rooms):
${profStats || 'No professor data available.'}

RULES:
1. Keep your answers concise and polite.
2. If asked about "workload", refer to the PROFESSOR STATS.
3. If asked about "conflicts" or "issues", look for professors or sections scheduled in multiple places at the same time, or professors teaching in many different rooms (they prefer just 1 room).
4. Do not make up data not present in the prompt.`;

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
    <div className={`chatbot-container ${isOpen ? 'open' : ''}`}>
      {!isOpen && (
        <button className="chatbot-fab" onClick={() => setIsOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
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
                  {msg.text}
                </div>
              </div>
            ))}
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

          {/* Phase 5.2: Actionable query buttons */}
          <div style={{ padding: '10px 15px', display: 'flex', gap: '8px', overflowX: 'auto', borderTop: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
            <button 
              onClick={() => setInput("Give me a workload summary for all professors.")}
              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '14px', background: 'var(--accent-primary)', color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              📊 Workload Summary
            </button>
            <button 
              onClick={() => setInput("Are there any scheduling conflicts or issues with room assignments?")}
              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '14px', background: 'var(--warning)', color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ⚠️ Find Conflicts
            </button>
            <button 
              onClick={() => setInput("What optimization tips do you have for this schedule?")}
              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '14px', background: 'var(--success)', color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              💡 Optimization Tips
            </button>
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

