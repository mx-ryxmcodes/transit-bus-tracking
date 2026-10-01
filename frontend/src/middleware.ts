// Edge middleware: page-level role guards. (The API still enforces permissions itself.)
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { ROLE_HOME, ROUTE_GUARDS, type Role } from '@shared/rbac';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guard = ROUTE_GUARDS.find((g) => pathname === g.prefix || pathname.startsWith(g.prefix + '/'));
  if (!guard) return NextResponse.next();
  if (pathname === '/driver/login') return NextResponse.next(); // must be reachable logged out

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = pathname.startsWith('/driver') ? '/driver/login' : '/login';
  loginUrl.search = `?next=${encodeURIComponent(pathname)}`;

  const token = req.cookies.get('at')?.value;
  if (!token) return NextResponse.redirect(loginUrl);
  try {
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as Role;
    if (!guard.roles.includes(role)) {
      const u = req.nextUrl.clone(); u.pathname = ROLE_HOME[role]; u.search = '';
      return NextResponse.redirect(u);
    }
    return NextResponse.next();
  } catch {
    // access token expired: the login page silently re-establishes the session via the refresh cookie
    return NextResponse.redirect(loginUrl);
  }
}

export const config = { matcher: ['/operator/:path*', '/driver/:path*', '/account/:path*'] };
