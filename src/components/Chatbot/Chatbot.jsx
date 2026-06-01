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

  useEffect(() => {
    // Initialize the chat session with a system prompt that includes the current schedule context
    const initChat = async () => {
      // Build a text representation of the current schedule
      const scheduleContext = schedules.map(s => {
        const subject = s.subject?.code || s.subject?.name || 'Unknown Subject';
        const section = s.section?.name || 'Unknown Section';
        const prof = s.professor?.name || 'Unknown Professor';
        const room = s.room?.name || 'Unknown Room';
        const day = s.day;
        const time = s.timeSlot?.label || 'Unknown Time';
        return `${subject} for section ${section} is taught by ${prof} in ${room} on ${day} at ${time}.`;
      }).join('\n');

      const systemInstruction = `You are a helpful AI assistant for the SMARTSCHED university scheduling system.
Your job is to answer questions about the schedule.
Here is the current schedule data:
${scheduleContext || 'There are no classes scheduled yet.'}
Keep your answers concise and polite.`;

      try {
        const chat = generativeModel.startChat({
          history: [
            {
              role: "user",
              parts: [{ text: systemInstruction }]
            },
            {
              role: "model",
              parts: [{ text: "Understood. I am ready to answer questions about the schedule." }]
            }
          ]
        });
        setChatSession(chat);
      } catch (error) {
        console.error("Failed to initialize chat:", error);
      }
    };

    if (isOpen && !chatSession) {
      initChat();
      setMessages([{ role: 'model', text: "Hello! I'm your SMARTSCHED assistant. Ask me anything about the schedule!" }]);
    }
  }, [isOpen, schedules, chatSession]);

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
      const result = await chatSession.sendMessageStream(userMsg);
      
      let fullResponse = '';
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].text = fullResponse;
          return newMessages;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error while trying to process your request.' }]);
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
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
