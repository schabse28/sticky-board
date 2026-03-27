"use client";

import { signOut } from "next-auth/react";

// Ausgelagerte Client-Komponente, damit die Board-Seite ein Server Component
// bleiben kann und getServerSession() ohne Umwege nutzen darf.
export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition"
    >
      Abmelden
    </button>
  );
}
