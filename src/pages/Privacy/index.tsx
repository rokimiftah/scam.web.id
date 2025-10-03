// src/pages/Privacy/index.tsx

import { useLocation } from "wouter";

export default function PrivacyPolicy() {
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
          <h1 className="text-3xl font-light">Privacy Policy</h1>
          <p className="mt-2 text-sm text-white/60">Last updated: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-white/80">
          <section>
            <h2 className="mb-3 text-xl font-light text-white">1. Introduction</h2>
            <p className="leading-relaxed">
              Travel Scam Stories ("we", "our", or "us") respects your privacy and is committed to protecting your personal data.
              This privacy policy explains how we collect, use, and safeguard your information when you use our platform.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">2. Information We Collect</h2>
            <p className="leading-relaxed">We collect the following types of information:</p>
            <ul className="mt-3 list-inside list-disc space-y-2">
              <li>
                <strong className="text-white">Account Information:</strong> Email address and username when you create an account
              </li>
              <li>
                <strong className="text-white">User Content:</strong> Stories, reviews, and experiences you share on the platform
              </li>
              <li>
                <strong className="text-white">Usage Data:</strong> Information about how you interact with our platform
              </li>
              <li>
                <strong className="text-white">Location Data:</strong> General location information related to the stories you
                share (not your personal location)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">3. How We Use Your Information</h2>
            <p className="leading-relaxed">We use your information to:</p>
            <ul className="mt-3 list-inside list-disc space-y-2">
              <li>Provide and maintain our service</li>
              <li>Authenticate users and manage accounts</li>
              <li>Display user-generated content on our platform</li>
              <li>Send important service updates and notifications</li>
              <li>Improve and optimize our platform</li>
              <li>Ensure compliance with our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">4. Information Sharing</h2>
            <p className="leading-relaxed">
              We do not sell, trade, or rent your personal information to third parties. We may share information only in the
              following circumstances:
            </p>
            <ul className="mt-3 list-inside list-disc space-y-2">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights, privacy, safety, or property</li>
              <li>In connection with a merger or acquisition (with notice to users)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">5. Data Security</h2>
            <p className="leading-relaxed">
              We implement appropriate technical and organizational measures to protect your personal data against unauthorized
              access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure,
              and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">6. User Rights</h2>
            <p className="leading-relaxed">You have the right to:</p>
            <ul className="mt-3 list-inside list-disc space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate or incomplete data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data in a portable format</li>
              <li>Opt-out of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">7. Cookies and Tracking</h2>
            <p className="leading-relaxed">
              We use essential cookies to maintain your session and preferences. We do not use tracking cookies for advertising
              purposes. You can control cookies through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">8. Children's Privacy</h2>
            <p className="leading-relaxed">
              Our service is not intended for children under 13 years of age. We do not knowingly collect personal information
              from children under 13. If you are a parent or guardian and believe your child has provided us with personal
              information, please contact us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">9. International Data Transfers</h2>
            <p className="leading-relaxed">
              Your information may be transferred to and maintained on servers located outside of your country. By using our
              service, you consent to such transfers.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">10. Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy
              Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-light text-white">11. Contact Us</h2>
            <p className="leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, please contact us through the platform's
              contact form or at our designated privacy contact email.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h2 className="mb-3 text-xl font-light text-white">Data Protection Commitment</h2>
            <p className="leading-relaxed">
              We are committed to protecting your privacy and ensuring that your personal information is handled in a safe and
              responsible manner. We follow industry best practices for data protection and regularly review our policies to
              ensure compliance with applicable privacy laws.
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
