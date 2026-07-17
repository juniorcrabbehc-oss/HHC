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
      // `credentials: "include"` lets the browser store the `sms_refresh`
      // httpOnly refresh-token cookie the API sets on this cross-origin
      // response; the JSON body only carries the access token + user.
      const response = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        credentials: "include",
        body: {
          [isEmail ? "email" : "phone"]: identifier,
          password,
        },
      });

      setTokens({ accessToken: response.accessToken, user: response.user });
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
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-wordmark">Sunrise International School</p>
        <p className="auth-subtitle">School Management System</p>
        <h1>Sign in</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
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
          <div className="field">
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
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
          {error && (
            <p role="alert" className="alert alert-error" style={{ marginTop: 14 }}>
              {error}
            </p>
          )}
          {success && (
            <p className="alert alert-success" style={{ marginTop: 14 }}>
              Signed in successfully.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
