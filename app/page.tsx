import { redirect } from "next/navigation";

// Startseite leitet direkt zum Board weiter.
// Die Middleware sorgt dafür, dass /board nur mit gültiger Session erreichbar ist.
export default function Home() {
  redirect("/board");
}
