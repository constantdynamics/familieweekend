"use client";

import { createContext, useContext } from "react";
import type { FeedChannel, FeedViewer, ReactionKind } from "@/lib/shared/board";

export type Person = { id: string; name: string };

/** What every post on a channel page needs from the board around it. */
export type BoardContextValue = {
  channel: FeedChannel;
  viewer: FeedViewer;
  /** The current time, for "5 minuten geleden". */
  now: number;
  /** Who posts and replies ("Plaats als"); null when this phone cannot post here. */
  author: Person | null;
  /** The name that gives hearts and thumbs; null when this phone cannot react. */
  reactor: Person | null;
  isOpen: (postId: string) => boolean;
  setOpen: (postId: string, open: boolean) => void;
  react: (postId: string, kind: ReactionKind, on: boolean) => void;
  /** After a change: fetch the channel again, then say what happened. */
  changed: (message: string) => Promise<void>;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoard werkt alleen binnen een kanaal van het prikbord.");
  return value;
}
