import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getNotesByBoard } from "@/lib/redis";
import Board from "./Board";

// Server Component: lädt Session und initiale Notes aus Redis,
// übergibt sie dann an die interaktive Client-Komponente Board.
// Die Middleware hat zu diesem Zeitpunkt bereits sichergestellt,
// dass nur authentifizierte Nutzer diese Route erreichen.
export default async function BoardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Jeder Nutzer hat sein eigenes Board – boardId = userId
  const notes = await getNotesByBoard(session.user.id);

  return (
    <Board
      initialNotes={notes}
      boardId={session.user.id}
      username={session.user.name ?? "Unbekannt"}
    />
  );
}
