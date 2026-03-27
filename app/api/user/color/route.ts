import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserColor,
  setUserColor,
  setUserOnline,
  getOnlineUsers,
  publishBoardEvent,
} from "@/lib/redis";

const VALID_COLORS = new Set(["yellow", "green", "pink", "blue", "purple"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const color = await getUserColor(session.user.id);
  return NextResponse.json({ color });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { color } = await request.json();

  if (!VALID_COLORS.has(color)) {
    return NextResponse.json({ error: "Ungültige Farbe" }, { status: 400 });
  }

  // Farbe kann nur einmalig gesetzt werden
  const existing = await getUserColor(session.user.id);
  if (existing) {
    return NextResponse.json({ error: "Farbe bereits festgelegt", color: existing }, { status: 409 });
  }

  await setUserColor(session.user.id, color);

  // Presence mit neuer Farbe aktualisieren und broadcasten
  await setUserOnline(session.user.id, session.user.name ?? "Unbekannt", color);
  const users = await getOnlineUsers();
  await publishBoardEvent({ type: "presence:update", users });

  return NextResponse.json({ color }, { status: 201 });
}
