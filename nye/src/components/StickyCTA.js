'use client';
import React, { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';

export default function StickyCTA({ onOpenModal }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {

    const toggleVisibility = () => {
      if (window.scrollY > 200) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:hidden z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-black/80 backdrop-blur-md p-1 rounded-full border border-purple-500/30 shadow-2xl shadow-purple-900/50">
        <button
          onClick={onOpenModal}
          className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-lg rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Ticket className="w-5 h-5 fill-white" />
          BOOK NOW
        </button>
      </div>
    </div>
  );
}