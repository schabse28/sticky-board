import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Einzelner Handler für GET (Session abrufen) und POST (Sign-in / Sign-out)
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
