"use client";

import { MessageTemplatesAdmin } from "../../../../features/communications/MessageTemplatesAdmin";

export default function AdminMessageTemplatesPage() {
  return (
    <main className="page">
      <h1 className="page-title">Message Templates</h1>
      <MessageTemplatesAdmin />
    </main>
  );
}
