import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

// Erweitert die eingebauten NextAuth-Typen um `id` und `role`,
// damit session.user.id und session.user.role überall typsicher verfügbar sind.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "admin" | "user";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "user";
  }
}
