"use client";

import { useEffect, useState } from "react";
import { ApiError, listMessages } from "../../lib/api-client";
import type { MessageDto } from "../../lib/api-client";

/**
 * In-app inbox: messages where the current user is the recipient, via
 * their linked `Guardian` record (see `MessagesService.list` for the
 * server-side linkage). Staff without a linked guardian profile simply
 * see an empty inbox — there's no staff-to-staff messaging in this
 * schema yet.
 */
export function MessagesInbox() {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listMessages("inbox");
        if (!cancelled) setMessages(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load messages.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <p>Loading messages...</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <ul>
      {messages.map((message) => (
        <li key={message.id}>
          <p>{message.body}</p>
          <small>{new Date(message.createdAt).toLocaleString()}</small>
        </li>
      ))}
      {messages.length === 0 && <li>No messages yet.</li>}
    </ul>
  );
}
