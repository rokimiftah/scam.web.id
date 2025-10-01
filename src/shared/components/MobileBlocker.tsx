// src/shared/components/MobileBlocker.tsx

import { useEffect, useState } from "react";

export default function MobileBlocker({ children }: { children: React.ReactNode }) {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkMobile = () => {
			const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

			// Check if it's a mobile device
			const mobileCheck = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());

			// Also check screen width
			const screenCheck = window.innerWidth < 768;

			// Check if touch device
			const touchCheck = "ontouchstart" in window || navigator.maxTouchPoints > 0;

			// Consider it mobile if it matches mobile user agent OR (small screen AND touch capable)
			setIsMobile(mobileCheck || (screenCheck && touchCheck));
		};

		// Check on mount
		checkMobile();

		// Check on resize
		window.addEventListener("resize", checkMobile);

		// Check on orientation change
		window.addEventListener("orientationchange", checkMobile);

		return () => {
			window.removeEventListener("resize", checkMobile);
			window.removeEventListener("orientationchange", checkMobile);
		};
	}, []);

	if (isMobile) {
		return (
			<div
				className="fixed inset-0 z-[9999] flex items-center justify-center"
				style={{
					background: "linear-gradient(135deg, #1a1a1f 0%, #2d2d35 100%)",
				}}
			>
				<div className="max-w-md px-6 text-center">
					{/* Logo */}
					<div className="mb-8">
						<img src="/logo.png" alt="Travel Scam Alert" className="mx-auto mb-4 h-16 w-auto" />
					</div>

					{/* Icon */}
					<div className="mb-6 flex justify-center">
						<div className="rounded-full bg-white/10 p-6">
							<svg className="h-12 w-12 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
								/>
							</svg>
						</div>
					</div>

					{/* Title */}
					<h1 className="mb-4 text-2xl font-light text-white">Desktop Only Experience</h1>

					{/* Message */}
					<p className="mb-8 text-base leading-relaxed text-white/70">
						Travel Scam Alert is optimized for desktop viewing. Our interactive globe and detailed scam reports are best
						experienced on a larger screen.
					</p>

					{/* Instructions */}
					<div className="mb-8 rounded-lg border border-white/10 bg-white/5 p-4">
						<p className="text-sm text-white/60">Please visit us from your desktop computer for the full experience</p>
					</div>

					{/* Alternative Actions */}
					<div className="space-y-3">
						<a
							href="mailto:?subject=Check out Travel Scam Alert&body=Visit Travel Scam Alert on your desktop: https://scam.web.id"
							className="inline-block w-full rounded border border-white/20 px-4 py-3 text-sm text-white/80 transition-all hover:bg-white/10"
						>
							📧 Email myself the link
						</a>

						<button
							onClick={() => {
								if (navigator.share) {
									navigator.share({
										title: "Travel Scam Alert",
										text: "Check out Travel Scam Alert - Everyone Should Be Safe Everywhere",
										url: window.location.href,
									});
								}
							}}
							className="inline-block w-full rounded bg-white/10 px-4 py-3 text-sm text-white/80 transition-all hover:bg-white/20"
						>
							📤 Share this site
						</button>
					</div>

					{/* Footer */}
					<div className="mt-12">
						<p className="text-xs text-white/40">Everyone Should Be Safe Everywhere</p>
						<p className="mt-2 text-xs text-white/30">© {new Date().getFullYear()} Travel Scam Alert</p>
					</div>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
