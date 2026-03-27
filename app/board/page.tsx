import { redirect } from "next/navigation";

// /board ohne boardId → zur Board-Übersicht
export default function BoardIndexPage() {
  redirect("/boards");
}
