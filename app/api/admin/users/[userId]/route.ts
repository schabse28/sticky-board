import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteUser, setUserRole } from "@/lib/redis";

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.role !== "admin") return null;
  return session;
}

// PATCH: Rolle ändern
export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { userId } = params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const role = body.role;
  if (role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "Ungültige Rolle" }, { status: 400 });
  }

  try {
    await setUserRole(userId, role);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[PATCH /api/admin/users/${userId}]`, error);
    return NextResponse.json({ error: "Rolle konnte nicht geändert werden" }, { status: 500 });
  }
}

// DELETE: Nutzer löschen
export async function DELETE(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { userId } = params;

  // Admin kann sich nicht selbst löschen
  if (userId === session.user.id) {
    return NextResponse.json({ error: "Eigenen Account nicht löschbar" }, { status: 400 });
  }

  try {
    await deleteUser(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[DELETE /api/admin/users/${userId}]`, error);
    return NextResponse.json({ error: "Nutzer konnte nicht gelöscht werden" }, { status: 500 });
  }
}
