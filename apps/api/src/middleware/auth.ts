import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { HttpError } from "../lib/http";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
};

export type AppBindings = {
  Variables: {
    user: AuthUser;
  };
};

export const authCookieName = "kc_token";
export const jwtExpiresIn = "7d";
const jwtMaxAgeSeconds = 7 * 24 * 60 * 60;

export function signAuthToken(user: AuthUser, jwtSecret: string) {
  return jwt.sign(
    {
      name: user.name,
      email: user.email,
      role: user.role
    },
    jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: jwtExpiresIn,
      subject: user.id
    }
  );
}

export function setAuthCookie(c: any, token: string, isProd: boolean) {
  setCookie(c, authCookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/",
    maxAge: jwtMaxAgeSeconds,
    expires: new Date(Date.now() + jwtMaxAgeSeconds * 1000)
  });
}

export function clearAuthCookie(c: any, isProd: boolean) {
  deleteCookie(c, authCookieName, {
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/"
  });
}

function isAuthRole(role: unknown): role is AuthUser["role"] {
  return role === "admin" || role === "user";
}

function jwtPayloadToUser(payload: string | JwtPayload): AuthUser {
  if (typeof payload === "string") throw new HttpError(401, "Invalid token payload");
  if (!payload.sub || typeof payload.sub !== "string") throw new HttpError(401, "Invalid token subject");
  if (typeof payload.name !== "string") throw new HttpError(401, "Invalid token name");
  if (typeof payload.email !== "string") throw new HttpError(401, "Invalid token email");
  if (!isAuthRole(payload.role)) throw new HttpError(401, "Invalid token role");

  return {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role
  };
}

export function requireAuth(jwtSecret: string): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const token = getCookie(c, authCookieName);
    if (!token) throw new HttpError(401, "Authentication required");

    try {
      c.set("user", jwtPayloadToUser(jwt.verify(token, jwtSecret)));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(401, "Invalid or expired token");
    }

    await next();
  };
}

export function requireAdmin(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = c.get("user");
    if (user.role !== "admin") throw new HttpError(403, "Admin access required");
    await next();
  };
}
