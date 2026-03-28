import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { redis, deleteUserAccount } from "@/lib/redis";

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  if (!body.password) {
    return NextResponse.json({ error: "Passwort erforderlich" }, { status: 400 });
  }

  const userId = session.user.id;

  // Passwort verifizieren
  const passwordHash = await redis.hget(`user:${userId}`, "passwordHash");
  if (!passwordHash) {
    return NextResponse.json({ error: "Nutzer nicht gefunden" }, { status: 404 });
  }

  const isValid = await bcrypt.compare(body.password, passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Passwort falsch" }, { status: 403 });
  }

  // Account und alle zugehörigen Daten löschen
  await deleteUserAccount(userId);

  return NextResponse.json({ success: true });
}
