"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { BoardPublic, BoardMeta } from "@/types";

const SWATCH: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#fde047", text: "#713f12" },
  green:  { bg: "#86efac", text: "#14532d" },
  pink:   { bg: "#f9a8d4", text: "#831843" },
  blue:   { bg: "#93c5fd", text: "#1e3a8a" },
  purple: { bg: "#d8b4fe", text: "#581c87" },
};

interface BoardsOverviewProps {
  initialBoards: BoardPublic[];
  username: string;
  userEmail: string;
  userColor: string;
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
  userEmail,
  userColor,
  isAdmin,
}: BoardsOverviewProps) {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardPublic[]>(initialBoards);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [isTemporary, setIsTemporary] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAvatarMenu) return;
    function handleOutside(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showAvatarMenu]);

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
    <div className="flex flex-col h-screen overflow-hidden bg-[#fafafa]">

      {/* Header */}
      <header className="flex-shrink-0 h-[52px] bg-white flex items-center px-5 border-b border-[#e5e7eb]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#111827] rounded-md flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold">SB</span>
          </div>
          <span className="text-[15px] font-medium text-[#111827]">Sticky Board</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors"
            >
              Admin
            </Link>
          )}

          {/* Avatar + Dropdown */}
          <div className="relative" ref={avatarMenuRef}>
            {(() => {
              const c = SWATCH[userColor] ?? { bg: "#e5e7eb", text: "#6b7280" };
              return (
                <button
                  onClick={() => setShowAvatarMenu((v) => !v)}
                  title={username}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold select-none hover:scale-105 transition-transform"
                  style={{
                    backgroundColor: c.bg,
                    color: c.text,
                    boxShadow: "0 0 0 2px white, 0 0 0 3px " + c.bg,
                  }}
                >
                  {username.slice(0, 1).toUpperCase()}
                </button>
              );
            })()}

            {showAvatarMenu && (
              <div className="absolute top-full right-0 mt-2 w-52 bg-white border border-[#e5e7eb] rounded-lg shadow-lg py-1 z-50">
                <div className="px-3 py-2.5 border-b border-[#e5e7eb]">
                  <p className="text-sm font-medium text-[#111827] truncate">{username}</p>
                  <p className="text-xs text-[#6b7280] truncate">{userEmail}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full text-left px-3 py-2 text-sm text-[#374151] hover:bg-[#f3f4f6] transition-colors"
                >
                  Abmelden
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 pt-12 pb-8">

          {/* Titel-Bereich */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-semibold text-[#111827]">Meine Boards</h1>
            <button
              onClick={openModal}
              className="bg-[#111827] hover:bg-[#1f2937] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              Neues Board
            </button>
          </div>
          <p className="text-sm text-[#6b7280] mb-8">
            {boards.length} {boards.length === 1 ? "Board" : "Boards"}
          </p>

          {/* Board-Grid */}
          {boards.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm text-[#6b7280]">Keine Boards vorhanden</p>
              <p className="text-sm text-[#9ca3af] mt-1">
                Erstelle dein erstes Board, um loszulegen.
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
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-[400px] mx-4 border border-[#e5e7eb]">
            <h2 className="text-lg font-semibold text-[#111827] mb-5">Neues Board erstellen</h2>
            <form onSubmit={handleCreateBoard}>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">
                Board-Name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="z.B. Sprint Retro"
                maxLength={60}
                className="w-full border border-[#e5e7eb] rounded-md px-3 py-2.5 text-sm text-[#111827] placeholder-[#9ca3af] focus:border-[#9ca3af] focus:outline-none transition-colors"
              />

              {/* Board-Typ Toggle */}
              <div className="flex gap-0 mt-4 bg-[#f3f4f6] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setIsTemporary(false)}
                  className={`flex-1 text-sm py-2 rounded-md transition-colors ${
                    !isTemporary
                      ? "bg-[#111827] text-white font-medium"
                      : "text-[#6b7280] hover:text-[#111827]"
                  }`}
                >
                  Dauerhaft
                </button>
                <button
                  type="button"
                  onClick={() => setIsTemporary(true)}
                  className={`flex-1 text-sm py-2 rounded-md transition-colors ${
                    isTemporary
                      ? "bg-[#111827] text-white font-medium"
                      : "text-[#6b7280] hover:text-[#111827]"
                  }`}
                >
                  Temporär (24 Std)
                </button>
              </div>

              {createError && (
                <p className="mt-3 text-sm text-red-500">{createError}</p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 text-sm text-[#6b7280] hover:text-[#111827] py-2.5 rounded-md transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newBoardName.trim()}
                  className="flex-1 text-sm bg-[#111827] hover:bg-[#1f2937] disabled:bg-[#d1d5db] disabled:cursor-not-allowed text-white py-2.5 rounded-md transition-colors font-medium"
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
      className="group bg-white rounded-lg border border-[#e5e7eb] p-5 cursor-pointer hover:border-[#d1d5db] hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-base font-medium text-[#111827] leading-snug truncate pr-2">
          {board.name}
        </h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          {board.temporary && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
              Temporär
            </span>
          )}
          {isAdmin && board.id !== "main" && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-600 disabled:opacity-40 transition-all"
              title="Board löschen"
            >
              {isDeleting ? "…" : "Löschen"}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
        <span>{board.noteCount} Notes</span>
        <span>·</span>
        <span>Erstellt {formatDate(board.createdAt)}</span>
      </div>

      {/* Online-Indikator */}
      {board.onlineCount > 0 && (
        <div className="flex items-center gap-1.5 mt-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-[#6b7280]">{board.onlineCount} online</span>
        </div>
      )}

      {/* TTL */}
      {board.ttlSeconds && (
        <p className="text-xs text-amber-600 mt-3">
          Läuft ab in {formatTTL(board.ttlSeconds)}
        </p>
      )}
    </div>
  );
}
