import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllBoards, getUserColor } from "@/lib/redis";
import BoardsOverview from "./BoardsOverview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const [boards, userColor] = await Promise.all([
    getAllBoards(),
    getUserColor(session.user.id),
  ]);

  return (
    <BoardsOverview
      initialBoards={boards}
      username={session.user.name ?? "Unbekannt"}
      userEmail={session.user.email ?? ""}
      userColor={userColor ?? ""}
      userId={session.user.id}
      isAdmin={session.user.role === "admin"}
    />
  );
}
