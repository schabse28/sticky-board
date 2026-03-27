export { default } from "next-auth/middleware";

// Alle Routen unter /board erfordern eine gültige Session.
// next-auth/middleware leitet unauthentifizierte Anfragen automatisch
// zur in authOptions.pages.signIn definierten Login-Seite um.
export const config = {
  matcher: ["/board/:path*"],
};
