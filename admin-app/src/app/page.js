"use client";
import { useState, useEffect } from "react";
import { auth } from "./lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Scanner from "./components/Scanner";
import LoginForm from "./components/LoginForm";
import { LogOut, User } from "lucide-react";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center bg-zinc-950 text-white">Initializing...</div>;

  if (!user) return <LoginForm />;

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
            <User size={16} />
          </div>
          <span className="font-medium text-sm text-zinc-300">{user.email.split('@')[0]}</span>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="p-2 text-zinc-400 hover:text-white transition-colors"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Scanner Body */}
      <div className="flex-1 relative flex flex-col">
        <Scanner />
      </div>
    </main>
  );
}