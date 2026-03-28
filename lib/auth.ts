import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyUser } from "@/lib/redis";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const result = await verifyUser(credentials.email, credentials.password);
        if (result === "locked") throw new Error("AccountLocked");
        if (!result) return null;

        return {
          id: result.id,
          name: result.displayName,
          email: result.email,
          role: result.role,
        };
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
