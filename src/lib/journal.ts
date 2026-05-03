export interface JournalEntry {
  id: string;
  title: string;
  bias: string;
  note: string;
  createdAt: string;
  source?: "manual" | "chart";
  symbol?: string;
  timeframe?: string;
  verdict?: string;
}

export const journalStorageKey = "positionguard.journal";
const legacyJournalStorageKey = "co" + "ters.journal";

export function loadJournalEntries(): JournalEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const saved = window.localStorage.getItem(journalStorageKey) ?? window.localStorage.getItem(legacyJournalStorageKey);
    if (saved) {
      window.localStorage.setItem(journalStorageKey, saved);
      window.localStorage.removeItem(legacyJournalStorageKey);
    }
    return saved ? (JSON.parse(saved) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveJournalEntries(entries: JournalEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(journalStorageKey, JSON.stringify(entries));
  window.localStorage.removeItem(legacyJournalStorageKey);
}

export function appendJournalEntry(entry: Omit<JournalEntry, "id" | "createdAt">) {
  const current = loadJournalEntries();
  const next: JournalEntry[] = [
    {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    },
    ...current
  ];

  saveJournalEntries(next);
  return next;
}
