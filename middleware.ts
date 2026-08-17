import { clerkMiddleware } from '@clerk/nextjs/server';

function isPublicPath(pathname: string) {
	if (pathname === '/') {
		return true;
	}
	if (pathname === '/rate' || pathname.startsWith('/rate/')) {
		return true;
	}
	if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) {
		return true;
	}
	if (pathname.startsWith('/api/menu')) {
		return true;
	}
	return false;
}

export default clerkMiddleware(async (auth, req) => {
	if (!isPublicPath(req.nextUrl.pathname)) {
		await auth.protect();
	}
});

export const config = {
	matcher: [
		'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
		'/(api|trpc)(.*)',
	],
};
