"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-[11px] text-slate-500 hover:text-slate-200 transition-colors px-2 py-1 rounded"
    >
      Abmelden
    </button>
  );
}
