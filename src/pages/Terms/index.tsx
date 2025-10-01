// src/pages/Terms/index.tsx

import { useLocation } from "wouter";

export default function TermsOfService() {
	const [, navigate] = useLocation();

	return (
		<div className="min-h-screen text-white" style={{ backgroundColor: "#1a1a1f" }}>
			<div className="mx-auto max-w-4xl px-6 py-12">
				{/* Header */}
				<div className="mb-8">
					<button
						onClick={() => navigate("/")}
						className="mb-6 flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
					>
						<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
						</svg>
						Back to Home
					</button>
					<h1 className="text-3xl font-light">Terms of Service</h1>
					<p className="mt-2 text-sm text-white/60">Last updated: {new Date().toLocaleDateString()}</p>
				</div>

				{/* Content */}
				<div className="space-y-8 text-white/80">
					<section>
						<h2 className="mb-3 text-xl font-light text-white">1. Acceptance of Terms</h2>
						<p className="leading-relaxed">
							By accessing and using Travel Scam Stories, you accept and agree to be bound by the terms and provision of this
							agreement.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">2. Purpose and Disclaimer</h2>
						<p className="leading-relaxed">
							Travel Scam Stories is a platform for sharing personal experiences related to travel scams. The stories and reviews
							shared on this platform are based on individual experiences and perspectives.
						</p>
						<p className="mt-3 leading-relaxed">
							<strong className="text-white">Important:</strong> This website is not intended to defame, harm, or undermine the
							sovereignty of any country, government, or nation. All content represents individual experiences and should not be
							interpreted as official statements or judgments about any country or its people.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">3. User Content</h2>
						<p className="leading-relaxed">
							Users are responsible for the content they share. By posting content, you agree that:
						</p>
						<ul className="mt-3 list-inside list-disc space-y-2">
							<li>Your content is based on genuine personal experiences</li>
							<li>You will not post false, misleading, or defamatory content</li>
							<li>You will respect the dignity and sovereignty of all nations</li>
							<li>You will not use this platform to promote hate, discrimination, or violence</li>
						</ul>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">4. Educational Purpose</h2>
						<p className="leading-relaxed">
							The primary purpose of this platform is educational - to help travelers stay informed and safe during their
							journeys. Content should be shared with the intent to help others, not to harm any country's reputation or tourism
							industry.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">5. No Liability</h2>
						<p className="leading-relaxed">
							Travel Scam Stories and its operators are not liable for any decisions made based on user-generated content. We
							encourage all travelers to conduct their own research and exercise personal judgment when traveling.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">6. Respect for All Nations</h2>
						<p className="leading-relaxed">
							We respect the sovereignty and dignity of all nations. Individual negative experiences shared on this platform do
							not reflect the character of entire countries or their citizens. Every country has both positive and negative
							aspects, and isolated incidents should not define an entire nation.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">7. Content Moderation</h2>
						<p className="leading-relaxed">
							We reserve the right to remove content that violates these terms, including but not limited to content that:
						</p>
						<ul className="mt-3 list-inside list-disc space-y-2">
							<li>Attacks or undermines national sovereignty</li>
							<li>Contains hate speech or discrimination</li>
							<li>Is demonstrably false or misleading</li>
							<li>Violates local or international laws</li>
						</ul>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">8. Changes to Terms</h2>
						<p className="leading-relaxed">
							We reserve the right to modify these terms at any time. Continued use of the platform after changes constitutes
							acceptance of the new terms.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-xl font-light text-white">9. Contact</h2>
						<p className="leading-relaxed">
							For questions about these Terms of Service, please contact us through the platform's contact form.
						</p>
					</section>
				</div>

				{/* Footer */}
				<div className="mt-12 border-t border-white/10 pt-8">
					<p className="text-center text-sm text-white/40">© 2025 Travel Scam Stories. All rights reserved.</p>
				</div>
			</div>
		</div>
	);
}
