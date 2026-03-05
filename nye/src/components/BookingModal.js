'use client';
import React, { useState } from 'react';
import { X, Loader2, CheckCircle, Minus, Plus, ArrowRight, User, Phone, Mail, ChevronLeft } from 'lucide-react';

const TICKET_TYPES = [
  { id: 'women_free', name: 'Women Only (Free)', price: 0 },
  { id: 'early_bird', name: 'Early Bird', price: 999 },
  { id: 'couple', name: 'Couple Pass', price: 1500 },
  { id: 'group', name: 'Group (4+1)', price: 3999 },
];

export default function BookingModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Selection State
  const [selectedTicket, setSelectedTicket] = useState(TICKET_TYPES[0]);
  const [quantity, setQuantity] = useState(1);

  // Input State (Required for Cloud Function)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
  });

  const totalAmount = selectedTicket.price * quantity;

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validateStep2 = () => {
    return formData.name.length > 2 && formData.phone.length >= 10;
  };

  const handlePayment = async () => {
    setLoading(true);

    console.log(formData)

    try {
      const response = await fetch('https://asia-south1-nye-ticket-management.cloudfunctions.net/createOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          ticketType: selectedTicket.id,
          amount: totalAmount,
          quantity: quantity
        }),
      });

      const data = await response.json();

      if (!data.orderId) {
        console.log(data)
        throw new Error("Failed to create order");
      }

      const options = {
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        name: "Nayi Raat 2025",
        description: `${quantity} x ${selectedTicket.name}`,
        order_id: data.orderId,
        handler: function (r) {
          setStep(3);
          setLoading(false);
        },
        prefill: {
          name: formData.name,
          email: formData.email,
          contact: formData.phone
        },
        theme: { color: "#9333ea" },
        modal: {
          ondismiss: () => setLoading(false)
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-t-3xl md:rounded-3xl p-6 md:p-8 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition">
          <X className="w-6 h-6" />
        </button>

        {/* --- STEP 1: TICKET SELECTION --- */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-2xl font-black mb-6 text-white tracking-tight">Select Tickets</h3>
            <div className="space-y-3 mb-6">
              {TICKET_TYPES.map((type) => (
                <div
                  key={type.id}
                  onClick={() => setSelectedTicket(type)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${
                    selectedTicket.id === type.id ? 'border-purple-500 bg-purple-500/10' : 'border-white/5 bg-white/5'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-white">{type.name}</h4>
                    <p className="text-sm text-gray-400">₹{type.price} / person</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedTicket.id === type.id ? 'border-purple-500' : 'border-gray-700'}`}>
                    {selectedTicket.id === type.id && <div className="w-3 h-3 bg-purple-500 rounded-full" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 mb-8">
              <span className="text-gray-300 font-bold">Total Persons</span>
              <div className="flex items-center gap-6">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700"><Minus size={18}/></button>
                <span className="text-xl font-black text-white">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700"><Plus size={18}/></button>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-200 transition"
            >
              NEXT DETAILS <ArrowRight size={20} />
            </button>
          </div>
        )}

        {/* --- STEP 2: PERSONAL INFO --- */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-gray-400 text-sm mb-4 hover:text-white">
              <ChevronLeft size={16} /> Back to tickets
            </button>
            <h3 className="text-2xl font-black mb-6 text-white tracking-tight">Your Details</h3>

            <div className="space-y-4 mb-8">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text" name="name" placeholder="Full Name" value={formData.name} onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-purple-500 transition"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="tel" name="phone" placeholder="Phone Number" value={formData.phone} onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-purple-500 transition"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email" name="email" placeholder="Email (Optional)" value={formData.email} onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-purple-500 transition"
                />
              </div>
            </div>

            <div className="mb-6 flex justify-between items-center px-2">
              <span className="text-gray-400">Total Payable</span>
              <span className="text-2xl font-black text-white">₹{totalAmount}</span>
            </div>

            <button
              onClick={handlePayment}
              disabled={!validateStep2() || loading}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 disabled:opacity-50 text-white font-black rounded-2xl shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : "SECURE PAYMENT"}
            </button>
          </div>
        )}

        {/* --- STEP 3: SUCCESS --- */}
        {step === 3 && (
          <div className="text-center py-8 animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/50">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h3 className="text-3xl font-black text-white mb-2">You&apos;re In! 🕺</h3>
            <p className="text-gray-400 mb-8 leading-relaxed">
              Booking confirmed for <span className="text-white font-bold">{formData.name}</span>.<br />
              We&apos;ll send your ticket to <span className="text-white font-bold">{formData.phone}</span> via WhatsApp shortly.
            </p>
            <button onClick={onClose} className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition">
              CLOSE WINDOW
            </button>
          </div>
        )}
      </div>
    </div>
  );
}