import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyUser } from "@/lib/redis";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Benutzername", type: "text" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await verifyUser(credentials.username, credentials.password);
        if (!user) return null;

        return { id: user.id, name: user.username };
      },
    }),
  ],

  // JWT-Strategie: kein Datenbankadapter nötig, Session liegt verschlüsselt
  // im Cookie – skaliert ohne weiteren State auf dem Server.
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    // userId in den JWT-Token schreiben, damit er in der Session verfügbar ist
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    // JWT-Token in das Session-Objekt übertragen (Client & Server)
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
};
