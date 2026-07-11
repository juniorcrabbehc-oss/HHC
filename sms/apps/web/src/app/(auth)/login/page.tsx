"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { AuthResponse } from "@sms/shared-types";
import { apiFetch, ApiError, setTokens } from "../../../lib/api-client";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    const isEmail = identifier.includes("@");

    try {
      const response = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: {
          [isEmail ? "email" : "phone"]: identifier,
          password,
        },
      });

      setTokens(response);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="identifier">Email or phone</label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        {error && <p role="alert">{error}</p>}
        {success && <p>Signed in successfully.</p>}
      </form>
    </main>
  );
}
