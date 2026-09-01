/**
 * In-process real-time event hub.
 *
 * Support ticket / message mutations are broadcast here so that connected SSE
 * clients are notified instantly without polling.
 */

export interface RealtimeChangeEvent {
  /** The table that changed (lowercase). */
  table: string;
  /** The DML event type. */
  event: "INSERT" | "UPDATE" | "DELETE";
  schema: "public";
  /** The new record (null for DELETE). */
  new: any | null;
  /** The previous record (null for INSERT). */
  old: any | null;
  /**
   * The user_id of the record owner. Used to route events to the right SSE
   * connection. Leave undefined to broadcast only to admins.
   */
  targetUserId?: string;
}

type RealtimeListener = (event: RealtimeChangeEvent) => void;

/** Tables for which admins should receive all events. */
const ADMIN_TABLES = new Set(["support_tickets", "support_messages"]);

/** Per-user listener sets. */
const userListeners = new Map<string, Set<RealtimeListener>>();

/** Admin listener set (receives all ADMIN_TABLES events). */
const adminListeners = new Set<RealtimeListener>();

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

export function subscribeUser(userId: string, listener: RealtimeListener): void {
  let set = userListeners.get(userId);
  if (!set) {
    set = new Set();
    userListeners.set(userId, set);
  }
  set.add(listener);
}

export function unsubscribeUser(
  userId: string,
  listener: RealtimeListener,
): void {
  const set = userListeners.get(userId);
  if (set) {
    set.delete(listener);
    if (set.size === 0) userListeners.delete(userId);
  }
}

export function subscribeAdmin(listener: RealtimeListener): void {
  adminListeners.add(listener);
}

export function unsubscribeAdmin(listener: RealtimeListener): void {
  adminListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/**
 * Broadcast a data-change event to all matching SSE connections.
 *
 * - Always notifies the owner's per-user listeners (if `targetUserId` is set).
 * - Always notifies all admin listeners for support-related tables.
 */
export function broadcastChange(event: RealtimeChangeEvent): void {
  const table = event.table.toLowerCase();

  // Notify the record owner
  if (event.targetUserId) {
    const set = userListeners.get(event.targetUserId);
    if (set) {
      for (const listener of set) {
        try {
          listener(event);
        } catch {
          // ignore individual listener errors
        }
      }
    }
  }

  // Notify admins for support tables
  if (ADMIN_TABLES.has(table)) {
    for (const listener of adminListeners) {
      try {
        listener(event);
      } catch {
        // ignore individual listener errors
      }
    }
  }
}
