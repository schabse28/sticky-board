import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserColor,
  setUserColor,
  setUserOnline,
  getOnlineUsers,
  publishPresenceEvent,
} from "@/lib/redis";

const VALID_COLORS = new Set(["yellow", "green", "pink", "blue", "purple"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  try {
    const color = await getUserColor(session.user.id);
    return NextResponse.json({ color });
  } catch (error) {
    console.error("[GET /api/user/color]", error);
    return NextResponse.json({ error: "Farbe konnte nicht geladen werden" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let body: { color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { color } = body;

  if (!color || !VALID_COLORS.has(color)) {
    return NextResponse.json({ error: "Ungültige Farbe" }, { status: 400 });
  }

  try {
    // Farbe kann nur einmalig gesetzt werden
    const existing = await getUserColor(session.user.id);
    if (existing) {
      // 409 = Farbe bereits gesetzt (z.B. Race Condition) → vorhandene Farbe zurückgeben
      return NextResponse.json({ error: "Farbe bereits festgelegt", color: existing }, { status: 409 });
    }

    await setUserColor(session.user.id, color);

    // Presence mit neuer Farbe aktualisieren und broadcasten
    await setUserOnline(session.user.id, session.user.name ?? "Unbekannt", color);
    const users = await getOnlineUsers();
    await publishPresenceEvent(users);

    return NextResponse.json({ color }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/user/color]", error);
    return NextResponse.json({ error: "Farbe konnte nicht gespeichert werden" }, { status: 500 });
  }
}
