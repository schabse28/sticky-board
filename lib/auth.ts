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

        return { id: user.id, name: user.username, role: user.role };
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
    // userId und role in den JWT-Token schreiben
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // JWT-Token in das Session-Objekt übertragen (Client & Server)
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
