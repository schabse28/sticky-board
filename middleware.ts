import { withAuth } from "next-auth/middleware";

// withAuth schützt alle gematchten Routen: nur Nutzer mit gültigem JWT-Token
// kommen durch. Alle anderen werden zur Login-Seite umgeleitet.
export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: ["/board/:path*"],
};
