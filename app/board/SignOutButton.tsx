"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors"
    >
      Abmelden
    </button>
  );
}
