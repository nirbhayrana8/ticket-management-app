'use client';
// We use 'use client' here so we can use state,
// but we keep the heavy text in the component to avoid complex passing.

import React, { useState } from 'react';
import { Ticket, Clock, Music, Users } from 'lucide-react';
import BookingModal from './BookingModal';
import StickyCTA from './StickyCTA';

export default function LandingPage() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500 selection:text-white">

      {/* 1. Navbar / Header */}
      <nav className="fixed top-0 w-full z-40 bg-black/50 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-black text-xl tracking-tighter bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">NAYI RAAT</span>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-white text-black text-sm font-bold rounded-full hover:scale-105 transition"
          >
            Book Now
          </button>
        </div>
      </nav>

      <div className="relative">
        {/* Background Gradients */}
        <div className="fixed inset-0 opacity-20 pointer-events-none">
           <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600 rounded-full blur-[128px]" />
           <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600 rounded-full blur-[128px]" />
        </div>

        {/* 2. Hero Section */}
        <header className="relative pt-32 pb-20 px-4 text-center">
          <div className="inline-block px-3 py-1 mb-6 border border-purple-500/30 rounded-full bg-purple-500/10 backdrop-blur-sm">
            <span className="text-purple-300 text-xs font-bold tracking-widest uppercase">✨ The Ultimate NYE Bash</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black mb-6 tracking-tight leading-none">
            SAY GOODBYE <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500">
              TO 2025
            </span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-xl mx-auto mb-10">
            Hotel Devdar • Dec 31st • 8 PM Onwards
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold text-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all active:scale-95"
            >
              Get Early Bird Tickets
            </button>
            <a
              href="#details"
              className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 rounded-full font-bold text-lg hover:bg-white/10 transition-colors"
            >
              View Lineup
            </a>
          </div>
          <p className="mt-4 text-xs text-red-400 font-medium animate-pulse">
            ⚡ 8 tickets booked in the last 15 minutes
          </p>
        </header>

        {/* 3. Features / Vibe Grid */}
        <section className="max-w-5xl mx-auto px-4 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Music, title: "Live DJ", desc: "Non-stop commercial & bollywood hits" },
              { icon: Clock, title: "Open All Night", desc: "Party till 12:30 AM" },
              { icon: Users, title: "Safe Crowd", desc: "Stags strictly profiled, safe for girls" }
            ].map((feature, i) => (
              <div key={i} className="p-6 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition cursor-default">
                <feature.icon className="w-8 h-8 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Offers Section */}
        <section className="max-w-3xl mx-auto px-4 py-10 pb-32">
          <h2 className="text-3xl font-bold text-center mb-8">🎟️ Ticket Categories</h2>
          <div className="space-y-3">
            {[
              { label: "Girls Entry", price: "FREE", sub: "First 25 girls only (ID required)", color: "text-pink-400" },
              { label: "Stag Pass", price: "₹999", sub: "Includes cover charge", color: "text-white" },
              { label: "Couple Pass", price: "₹1500", sub: "VIP Access area included", color: "text-yellow-400" },
            ].map((ticket, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-900 to-black border border-gray-800 rounded-xl">
                <div>
                  <h4 className="font-bold text-lg">{ticket.label}</h4>
                  <p className="text-xs text-gray-500">{ticket.sub}</p>
                </div>
                <div className={`text-xl font-bold ${ticket.color}`}>{ticket.price}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Sticky Mobile CTA (Only visible on mobile) */}
        <div className="fixed bottom-4 left-4 right-4 md:hidden z-30">
          <button
            onClick={() => setShowModal(true)}
            className="w-full py-4 bg-white text-black font-black text-lg rounded-full shadow-2xl shadow-white/20 flex items-center justify-center gap-2"
          >
            <Ticket className="w-5 h-5" />
            BOOK NOW
          </button>
        </div>

      </div>

	  <StickyCTA onOpenModal={() => setShowModal(true)} />

      {showModal && <BookingModal onClose={() => setShowModal(false)} />}
    </div>
  );
}