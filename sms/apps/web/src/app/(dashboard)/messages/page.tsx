"use client";

import { MessagesInbox } from "../../../features/communications/MessagesInbox";

export default function MessagesInboxPage() {
  return (
    <main className="page page-narrow">
      <h1 className="page-title">Messages</h1>
      <MessagesInbox />
    </main>
  );
}
