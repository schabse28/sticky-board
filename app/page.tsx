import { redirect } from "next/navigation";

// Startseite leitet zur Board-Übersicht.
// Die Middleware sorgt dafür, dass /boards nur mit gültiger Session erreichbar ist.
export default function Home() {
  redirect("/boards");
}
