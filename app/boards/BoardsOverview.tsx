"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { BoardPublic, BoardMeta } from "@/types";
import SignOutButton from "@/app/board/SignOutButton";

interface BoardsOverviewProps {
  initialBoards: BoardPublic[];
  username: string;
  userId: string;
  isAdmin: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTTL(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} Std ${m} Min` : `${h} Std`;
  if (m > 0) return `${m} Min`;
  return "< 1 Min";
}

export default function BoardsOverview({
  initialBoards,
  username,
  isAdmin,
}: BoardsOverviewProps) {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardPublic[]>(initialBoards);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [isTemporary, setIsTemporary] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    const name = newBoardName.trim();
    if (!name) return;

    setIsCreating(true);
    setCreateError("");

    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, temporary: isTemporary }),
      });

      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error ?? "Fehler beim Erstellen");
        return;
      }

      const board: BoardMeta = await res.json();
      setBoards((prev) => [
        ...prev,
        { ...board, noteCount: 0, onlineCount: 0, ttlSeconds: isTemporary ? 86400 : null },
      ]);
      setNewBoardName("");
      setShowCreateModal(false);
      router.push(`/board/${board.id}`);
    } catch {
      setCreateError("Netzwerkfehler – bitte erneut versuchen");
    } finally {
      setIsCreating(false);
    }
  }

  function openModal() {
    setNewBoardName("");
    setIsTemporary(false);
    setCreateError("");
    setShowCreateModal(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

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
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <a
              href="/admin"
              className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10"
            >
              Admin
            </a>
          )}
          <span className="text-xs text-slate-400 select-none">{username}</span>
          <SignOutButton />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">

          {/* Heading */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-slate-900">Boards</h1>
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              <span className="text-base leading-none font-semibold">+</span>
              <span>Neues Board</span>
            </button>
          </div>

          {/* Board-Grid */}
          {boards.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm font-medium text-gray-400">Keine Boards vorhanden</p>
              <p className="text-xs text-gray-300 mt-1">
                Klicke auf &bdquo;+ Neues Board&ldquo;, um loszulegen
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  isAdmin={isAdmin}
                  onDelete={(id) => setBoards((prev) => prev.filter((b) => b.id !== id))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create-Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Neues Board erstellen</h2>
            <form onSubmit={handleCreateBoard}>
              <input
                ref={inputRef}
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="Board-Name…"
                maxLength={60}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
              {/* Board-Typ: Dauerhaft oder Temporär */}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setIsTemporary(false)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    !isTemporary
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-gray-200 text-slate-500 hover:border-slate-400"
                  }`}
                >
                  Dauerhaft
                </button>
                <button
                  type="button"
                  onClick={() => setIsTemporary(true)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    isTemporary
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-slate-500 hover:border-amber-400"
                  }`}
                >
                  Temporär (24 Std)
                </button>
              </div>
              {createError && (
                <p className="mt-2 text-xs text-red-500">{createError}</p>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 text-sm text-slate-500 hover:text-slate-700 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newBoardName.trim()}
                  className="flex-1 text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-xl transition-colors font-medium"
                >
                  {isCreating ? "Wird erstellt…" : "Erstellen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Board-Karte ─────────────────────────────────────────────────────────────

function BoardCard({
  board,
  isAdmin,
  onDelete,
}: {
  board: BoardPublic;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Board "${board.name}" wirklich löschen?`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
      if (res.ok) onDelete(board.id);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      onClick={() => router.push(`/board/${board.id}`)}
      className="group bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer hover:border-slate-400 hover:shadow-md transition-all"
    >
      {/* Header der Karte */}
      <div className="flex items-start justify-between mb-3">
        <h2 className="font-semibold text-slate-900 text-sm leading-snug truncate pr-2">
          {board.name}
        </h2>
        {isAdmin && board.id !== "main" && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-all flex-shrink-0"
            title="Board löschen"
          >
            {isDeleting ? "…" : "Löschen"}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>
          <span className="font-medium text-slate-600">{board.noteCount}</span> Notes
        </span>
        {board.onlineCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="font-medium text-emerald-600">{board.onlineCount}</span> online
          </span>
        )}
      </div>

      {/* Footer */}
      {board.ttlSeconds ? (
        <p className="text-[11px] text-amber-500 mt-3 font-medium">
          ⏱ Läuft ab in {formatTTL(board.ttlSeconds)}
        </p>
      ) : (
        <p className="text-[11px] text-slate-300 mt-3">
          Erstellt {formatDate(board.createdAt)}
        </p>
      )}
    </div>
  );
}
