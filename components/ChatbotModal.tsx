
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import Icon from './common/Icon';
import { initializeChat, sendChatMessage } from '../services/chatService';
import { Message } from '../types';
import { Chat } from '@google/genai'; // Import Chat type

interface ChatbotModalProps {
  onClose: () => void;
}

const ChatbotModal: React.FC<ChatbotModalProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hello! I'm CraveBiZ AI, your intelligent assistant. How can I help you with your invoice management today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null); // Use ref for chat session

  useEffect(() => {
    const initChat = async () => {
      try {
        const session = await initializeChat();
        chatSessionRef.current = session;
      } catch (error) {
        console.error("Failed to initialize chat session:", error);
        setMessages(prev => [...prev, { role: 'model', text: "Sorry, I couldn't start the chat. Please try again later." }]);
      }
    };
    initChat();
  }, []);

  // Scroll to bottom of messages whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
        if (!process.env.API_KEY) {
            setMessages(prev => [...prev, { role: 'model', text: "Gemini AI is not configured. Please set your API key." }]);
            return;
        }

        // Changed this line to pass only the new message text
        const response = await sendChatMessage(userMessage.text);
        setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (error) {
        console.error("Error sending message:", error);
        setMessages(prev => [...prev, { role: 'model', text: "Sorry, I couldn't get a response. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="CraveBiZ AI Assistant">
      <div className="flex flex-col h-96">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 rounded-lg">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                  msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-800'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="mt-4 flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400"
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : (
                <Icon name="send" className="w-5 h-5"/>
            )}
          </button>
        </form>
      </div>
    </Modal>
  );
};

export default ChatbotModal;