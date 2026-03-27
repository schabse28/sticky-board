import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllBoards, getAllUsers } from "@/lib/redis";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/boards");

  const [boards, users] = await Promise.all([
    getAllBoards(),
    getAllUsers(),
  ]);

  return (
    <AdminDashboard
      initialBoards={boards}
      initialUsers={users}
      currentUserId={session.user.id}
    />
  );
}
