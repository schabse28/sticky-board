import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cleanupExpiredBoards } from "@/lib/redis";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const count = await cleanupExpiredBoards();
  return NextResponse.json({ cleaned: count });
}
