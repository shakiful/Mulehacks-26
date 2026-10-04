import type { StudentNotification } from "../api/types";

export const NOTIFICATIONS_CHANGED = "mulecampus-notifications-changed";
export function refreshNotifications() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
export function notificationText(item: StudentNotification) {
  switch (item.kind) {
    case "NEW_MESSAGE": return `${item.actor.name} sent you a message`;
    case "JOIN_REQUEST": return `${item.actor.name} requested to join your invitation`;
    case "JOIN_ACCEPTED": return `${item.actor.name} accepted your join request`;
    case "CONNECTION_REQUEST": return `${item.actor.name} requested a connection`;
    case "CONNECTION_ACCEPTED": return `${item.actor.name} accepted your connection request`;
  }
}
export function notificationHref(item: StudentNotification) {
  const kind = item.join_id !== null ? "join" : "connection";
  const id = item.join_id ?? item.connection_id;
  return ["JOIN_REQUEST", "CONNECTION_REQUEST"].includes(item.kind)
    ? `/connections?kind=${kind}&id=${id}` : `/messages/${kind}/${id}`;
}
