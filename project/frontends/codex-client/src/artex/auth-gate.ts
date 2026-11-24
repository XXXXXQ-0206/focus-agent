import type { AuthStatus } from "./types";

export type AuthGateState = "ready" | "login" | "init";

export interface AuthRouteDecision {
  state: AuthGateState;
  redirect: string | null;
}

/**
 * Computes the auth gate result without coupling it to React navigation.
 * The caller can run this once per mount and keep the rendered shell mounted
 * while business routes change.
 */
export function authRouteDecision(
  status: AuthStatus,
  hasToken: boolean,
  pathname: string,
): AuthRouteDecision {
  if (!status.initialized) {
    return { state: "init", redirect: pathname === "/init" ? null : "/init" };
  }
  if (!hasToken) {
    return { state: "login", redirect: pathname === "/login" ? null : "/login" };
  }
  return {
    state: "ready",
    redirect: pathname === "/login" || pathname === "/init" ? "/new" : null,
  };
}
