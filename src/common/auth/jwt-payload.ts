export type Role = 'USER' | 'HOST' | 'ADMIN';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
