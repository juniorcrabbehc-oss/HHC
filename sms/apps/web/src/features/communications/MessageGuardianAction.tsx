"use client";

import { useState } from "react";
import { ApiError, sendMessage } from "../../lib/api-client";
import type { MessageChannel } from "../../lib/api-client";

/**
 * Compact, inline "message a guardian" action — resolves to a learner's
 * primary-contact guardian server-side (`MessagesService.resolveRecipientGuardian`),
 * so this component only needs a `learnerId`. Kept expand-in-place rather
 * than a modal/route, since it's meant to be dropped into a table row
 * (see `front-office/learners/page.tsx`) without pulling in a dialog
 * component that doesn't otherwise exist in this codebase yet.
 */
export function MessageGuardianAction({ learnerId }: { learnerId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [channel, setChannel] = useState<MessageChannel>("sms");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSend() {
    if (!body.trim()) return;
    setIsSending(true);
    setFeedback(null);
    try {
      await sendMessage({ learnerId, channel, body: body.trim() });
      setFeedback("Message sent.");
      setBody("");
      setIsOpen(false);
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  }

  if (!isOpen) {
    return (
      <>
        <button type="button" className="btn btn-sm" onClick={() => setIsOpen(true)}>
          Message guardian
        </button>
        {feedback && <span role="status" className="muted"> {feedback}</span>}
      </>
    );
  }

  return (
    <div className="inline-action">
      <select value={channel} onChange={(e) => setChannel(e.target.value as MessageChannel)}>
        <option value="sms">SMS</option>
        <option value="in_app">In-app</option>
      </select>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Message body" />
      <div className="inline-action-buttons">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleSend()} disabled={isSending || !body.trim()}>
          {isSending ? "Sending..." : "Send"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setIsOpen(false)}>
          Cancel
        </button>
      </div>
      {feedback && <p role="status" className="muted" style={{ margin: 0 }}>{feedback}</p>}
    </div>
  );
}
