import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllUsers } from "@/lib/redis";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  try {
    const users = await getAllUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("[GET /api/admin/users]", error);
    return NextResponse.json({ error: "Fehler beim Laden der Nutzer" }, { status: 500 });
  }
}
