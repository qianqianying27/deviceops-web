import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'admin' | 'operator' | 'viewer';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '8h' });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, config.jwtSecret) as AuthUser;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: '缺少登录凭证' });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' });
  }
}

/** RBAC：路由级声明所需角色，越权统一 403，前端路由守卫只是体验层，真正的边界在后端。 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: `当前角色 ${req.user.role} 无权限执行该操作`,
      });
      return;
    }
    next();
  };
}
