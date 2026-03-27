"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardPublic, UserPublic } from "@/types";

const SWATCH: Record<string, string> = {
  yellow: "#fde047",
  green:  "#86efac",
  pink:   "#f9a8d4",
  blue:   "#93c5fd",
  purple: "#d8b4fe",
};

interface AdminDashboardProps {
  initialBoards: BoardPublic[];
  initialUsers: UserPublic[];
  currentUserId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminDashboard({
  initialBoards,
  initialUsers,
  currentUserId,
}: AdminDashboardProps) {
  const [boards, setBoards] = useState<BoardPublic[]>(initialBoards);
  const [users, setUsers] = useState<UserPublic[]>(initialUsers);
  const [deletingBoardIds, setDeletingBoardIds] = useState<Set<string>>(new Set());
  const [clearingBoardId, setClearingBoardId] = useState<string | null>(null);
  const [deletingUserIds, setDeletingUserIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"boards" | "users">("boards");

  // ── Board-Management ──────────────────────────────────────────────────────

  async function handleClearBoard(boardId: string, boardName: string) {
    if (!confirm(`Alle Notes in "${boardName}" wirklich löschen?`)) return;
    setClearingBoardId(boardId);
    try {
      const res = await fetch(`/api/admin/notes?boardId=${boardId}`, { method: "DELETE" });
      if (res.ok) {
        setBoards((prev) => prev.map((b) => b.id === boardId ? { ...b, noteCount: 0 } : b));
      }
    } finally {
      setClearingBoardId(null);
    }
  }

  async function handleDeleteBoard(boardId: string, boardName: string) {
    if (!confirm(`Board "${boardName}" wirklich löschen? Alle Notes werden gelöscht.`)) return;
    setDeletingBoardIds((prev) => new Set(prev).add(boardId));
    try {
      const res = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
      if (res.ok) setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } finally {
      setDeletingBoardIds((prev) => { const s = new Set(prev); s.delete(boardId); return s; });
    }
  }

  // ── User-Management ───────────────────────────────────────────────────────

  async function handleDeleteUser(userId: string) {
    if (!confirm("Nutzer wirklich löschen?")) return;
    setDeletingUserIds((prev) => new Set(prev).add(userId));
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setDeletingUserIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
    }
  }

  async function handleToggleRole(user: UserPublic) {
    const newRole = user.role === "admin" ? "user" : "admin";
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">

      {/* Header */}
      <header className="flex-shrink-0 h-11 bg-slate-900 flex items-center px-4 gap-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-bold tracking-tight">SB</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight whitespace-nowrap">
            Sticky Board
          </span>
          <span className="text-slate-500 text-sm">/</span>
          <span className="text-slate-300 text-sm">Admin</span>
        </div>
        <div className="flex-1" />
        <Link
          href="/boards"
          className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10"
        >
          ← Boards
        </Link>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Admin-Dashboard</h1>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-200 w-fit">
            <button
              onClick={() => setActiveTab("boards")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "boards"
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Boards ({boards.length})
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "users"
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Nutzer ({users.length})
            </button>
          </div>

          {/* Boards-Tab */}
          {activeTab === "boards" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-slate-700">Alle Boards</h2>
              </div>

              {boards.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Keine Boards vorhanden
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Name</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Notes</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Online</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Erstellt</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {boards.map((board) => (
                      <tr key={board.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/board/${board.id}`}
                            className="font-medium text-slate-700 hover:text-slate-900 hover:underline"
                          >
                            {board.name}
                          </Link>
                          {board.id === "main" && (
                            <span className="ml-1.5 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                              Standard
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{board.noteCount}</td>
                        <td className="px-4 py-2.5">
                          {board.onlineCount > 0 ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {board.onlineCount}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                          {formatDate(board.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3 justify-end">
                            <button
                              onClick={() => handleClearBoard(board.id, board.name)}
                              disabled={clearingBoardId === board.id || board.noteCount === 0}
                              className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              {clearingBoardId === board.id ? "…" : "Leeren"}
                            </button>
                            {board.id !== "main" && (
                              <button
                                onClick={() => handleDeleteBoard(board.id, board.name)}
                                disabled={deletingBoardIds.has(board.id)}
                                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {deletingBoardIds.has(board.id) ? "…" : "Löschen"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Users-Tab */}
          {activeTab === "users" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-slate-700">Alle Nutzer</h2>
              </div>

              {users.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Keine Nutzer vorhanden
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Nutzer</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Rolle</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Registriert</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSelf = user.id === currentUserId;
                      return (
                        <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {user.color && (
                                <span
                                  className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: SWATCH[user.color] ?? "#fde047" }}
                                />
                              )}
                              <span className="font-medium text-slate-700">
                                {user.username}
                                {isSelf && (
                                  <span className="ml-1 text-[10px] text-slate-400">(du)</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                user.role === "admin"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {user.role === "admin" ? "Admin" : "Nutzer"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {user.isOnline ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Online
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {user.lastSeen ? `Zuletzt: ${formatDate(user.lastSeen)}` : "Nie gesehen"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="px-4 py-2.5">
                            {!isSelf && (
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => handleToggleRole(user)}
                                  className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                                  title={user.role === "admin" ? "Zum Nutzer degradieren" : "Zum Admin befördern"}
                                >
                                  {user.role === "admin" ? "→ Nutzer" : "→ Admin"}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={deletingUserIds.has(user.id)}
                                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  {deletingUserIds.has(user.id) ? "…" : "Löschen"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
