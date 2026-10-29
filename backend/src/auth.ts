import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = { id: string; role: "admin" | "student" };
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !process.env.JWT_SECRET) {
    res.status(401).json({ error: "Autenticação necessária" });
    return;
  }
  try {
    req.authUser = jwt.verify(token, process.env.JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito ao administrador" });
    return;
  }
  next();
}
