"use client";

import { useEffect, useState } from "react";
import { ApiError, createMessageTemplate, listMessageTemplates, updateMessageTemplate } from "../../lib/api-client";
import type { MessageChannel, MessageEventTrigger, MessageTemplateDto } from "../../lib/api-client";

const CHANNELS: MessageChannel[] = ["sms", "in_app"];
const EVENT_TRIGGERS: MessageEventTrigger[] = [
  "absence_alert",
  "fee_reminder",
  "report_card_ready",
  "payment_received",
  "manual",
];

/** Admin CRUD for `MessageTemplate` — create + list + activate/deactivate. */
export function MessageTemplatesAdmin() {
  const [templates, setTemplates] = useState<MessageTemplateDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("sms");
  const [eventTrigger, setEventTrigger] = useState<MessageEventTrigger>("absence_alert");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await listMessageTemplates();
      setTemplates(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load templates.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate() {
    if (!name.trim() || !bodyTemplate.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await createMessageTemplate({ name: name.trim(), channel, eventTrigger, bodyTemplate: bodyTemplate.trim() });
      setTemplates((prev) => [...prev, created]);
      setName("");
      setBodyTemplate("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create template.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleActive(template: MessageTemplateDto) {
    setError(null);
    try {
      const updated = await updateMessageTemplate(template.id, { isActive: !template.isActive });
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update template.");
    }
  }

  return (
    <div>
      <h2>New template</h2>
      <div>
        <label htmlFor="template-name">Name</label>
        <input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="template-channel">Channel</label>
        <select id="template-channel" value={channel} onChange={(e) => setChannel(e.target.value as MessageChannel)}>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label htmlFor="template-trigger">Event trigger</label>
        <select id="template-trigger" value={eventTrigger} onChange={(e) => setEventTrigger(e.target.value as MessageEventTrigger)}>
          {EVENT_TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label htmlFor="template-body">{"Body (use {{placeholders}}, e.g. {{learnerName}})"}</label>
        <textarea id="template-body" value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} rows={3} />

        <button type="button" onClick={() => void handleCreate()} disabled={isCreating || !name.trim() || !bodyTemplate.trim()}>
          {isCreating ? "Creating..." : "Create template"}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
      {isLoading && <p>Loading templates...</p>}

      {!isLoading && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Channel</th>
              <th>Trigger</th>
              <th>Body</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>{template.name}</td>
                <td>{template.channel}</td>
                <td>{template.eventTrigger}</td>
                <td>{template.bodyTemplate}</td>
                <td>{template.isActive ? "Yes" : "No"}</td>
                <td>
                  <button type="button" onClick={() => void handleToggleActive(template)}>
                    {template.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={6}>No templates yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
