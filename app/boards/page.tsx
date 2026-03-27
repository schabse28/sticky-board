import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllBoards } from "@/lib/redis";
import BoardsOverview from "./BoardsOverview";

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const boards = await getAllBoards();

  return (
    <BoardsOverview
      initialBoards={boards}
      username={session.user.name ?? "Unbekannt"}
      userId={session.user.id}
      isAdmin={session.user.role === "admin"}
    />
  );
}
