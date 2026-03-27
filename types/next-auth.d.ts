import NextAuth, { DefaultSession } from "next-auth";

// Erweitert die eingebauten NextAuth-Typen um das `id`-Feld,
// damit session.user.id überall typsicher verfügbar ist.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
