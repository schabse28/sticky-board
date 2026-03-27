import { NextResponse } from "next/server";
import { createUser } from "@/lib/redis";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { username, password } = body;

  if (!username || username.trim().length < 3) {
    return NextResponse.json(
      { error: "Benutzername muss mindestens 3 Zeichen lang sein" },
      { status: 400 }
    );
  }

  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 6 Zeichen lang sein" },
      { status: 400 }
    );
  }

  try {
    await createUser({ username: username.trim(), password });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registrierung fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
