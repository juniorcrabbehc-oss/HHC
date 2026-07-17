"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@sms/shared-types";
import { getCurrentUser, logout } from "../lib/api-client";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

/**
 * Role-aware nav. An item shows if the current user holds any of its
 * roles; admins see everything. Purely presentational — actual access
 * control stays server-side, this only decides which links to surface.
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/teacher/attendance", label: "Attendance", roles: ["admin", "teacher"] },
  { href: "/teacher/scores", label: "Scores", roles: ["admin", "teacher"] },
  { href: "/front-office/learners", label: "Learners", roles: ["admin", "teacher", "front_office"] },
  { href: "/bursar/invoices", label: "Invoices", roles: ["admin", "bursar"] },
  { href: "/parent/invoices", label: "Invoices", roles: ["parent", "learner"] },
  { href: "/admin/report-cards", label: "Report Cards", roles: ["admin"] },
  { href: "/admin/message-templates", label: "Templates", roles: ["admin"] },
  {
    href: "/messages",
    label: "Messages",
    roles: ["admin", "teacher", "front_office", "bursar", "parent", "learner"],
  },
];

function roleLabel(role: Role): string {
  return role.replace(/_/g, " ");
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // The dashboard layout only renders its children after the client-side
  // auth check passes, so reading localStorage here is safe.
  const user = useMemo(() => getCurrentUser(), []);
  const roles = user?.roles ?? [];

  const navItems = NAV_ITEMS.filter((item) => item.roles.some((role) => roles.includes(role)));

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleSignOut() {
    await logout();
    router.push("/login");
  }

  return (
    <div>
      <header className="topbar">
        <div className="topbar-brand">Sunrise International School</div>
        <div className="topbar-user">
          {user?.email || user?.phone ? (
            <span className="topbar-email">{user?.email ?? user?.phone}</span>
          ) : null}
          {roles.map((role) => (
            <span key={role} className="role-chip">
              {roleLabel(role)}
            </span>
          ))}
          <button type="button" className="btn btn-signout" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </header>

      {navItems.length > 0 && (
        <nav className="navbar" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${isActive(item.href) ? " is-active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {children}
    </div>
  );
}
