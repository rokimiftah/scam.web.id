// src/pages/Auth/MagicLinkPage/index.tsx

import { useEffect, useState } from "react";

import { useAuthActions } from "@convex-dev/auth/react";
import { useLocation } from "wouter";

export default function MagicLinkPage() {
  const { signIn } = useAuthActions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [, navigate] = useLocation();

  // Parse URL parameters
  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const tokenParam = params.get("token");
    const emailParam = params.get("email");

    if (tokenParam && emailParam) {
      setToken(tokenParam);
      setEmail(decodeURIComponent(emailParam));
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleSignIn = async () => {
    if (!token || !email) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("code", token);
      formData.set("email", email);

      await signIn("resend-magic-link", formData);
      // Will automatically redirect on success due to auth state change
    } catch (_err) {
      setError("Failed to sign in. The link may have expired.");
      setLoading(false);
    }
  };

  if (!email || !token) {
    return null;
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 text-white"
      style={{
        background: "linear-gradient(180deg, #1a1a1f 0%, #16161b 100%)",
      }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <img src="/logo.png" alt="Travel Scam Alert" className="mx-auto h-12 w-auto" />
        </div>

        {/* Card */}
        <div
          className="border border-white/10 p-8"
          style={{
            backgroundColor: "rgba(25, 25, 30, 0.5)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-light text-white/90">Confirm Sign In</h2>
              <p className="mt-3 text-sm text-white/60">You are about to sign in with email:</p>
              <p className="mt-2 text-sm font-medium break-all text-white/80">{email}</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full cursor-pointer bg-white px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Continue"}
              </button>

              <button
                onClick={() => navigate("/")}
                disabled={loading}
                className="w-full cursor-pointer border border-white/20 px-4 py-2.5 text-sm text-white/60 transition-all hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back to Home
              </button>
            </div>

            {/* Info */}
            <div className="text-center">
              <p className="text-xs text-white/40">This link will expire in 10 minutes for your security.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-white/40">© 2025 Travel Scam Alert. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
