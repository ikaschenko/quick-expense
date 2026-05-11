import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { StatusBanner } from "../components/StatusBanner";
import { FEEDBACK_FORM_URL } from "../constants/feedback";

export function LoginPage(): JSX.Element {
  const auth = useAuth();
  const callbackError = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("error");
  }, []);

  if (auth.session) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="page-fullscreen">
      <div className="login-container">
        <div className="login-logo">
          <svg width="32" height="32" viewBox="0 0 120 120" fill="none">
            <defs>
              <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#5B21B6"/>
                <stop offset="100%" stopColor="#4F46E5"/>
              </linearGradient>
            </defs>
            <rect width="120" height="120" rx="27" fill="url(#logoBg)"/>
            <path d="M40 22 L80 22 C82.2 22 84 23.8 84 26 L84 88 L79 84 L74 88 L69 84 L64 88 L59 84 L54 88 L49 84 L44 88 L44 88 L39 84 L36 88 L36 26 C36 23.8 37.8 22 40 22 Z" fill="white" opacity="0.95"/>
            <rect x="44" y="34" width="28" height="3" rx="1.5" fill="#4338CA" opacity="0.6"/>
            <rect x="44" y="44" width="22" height="3" rx="1.5" fill="#4338CA" opacity="0.4"/>
            <rect x="44" y="54" width="26" height="3" rx="1.5" fill="#4338CA" opacity="0.6"/>
            <rect x="44" y="64" width="18" height="3" rx="1.5" fill="#4338CA" opacity="0.4"/>
            <circle cx="88" cy="86" r="17" fill="#10B981"/>
            <polyline points="79.5,86 85,91.5 96.5,80" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className="login-title">Quick Expense</h1>
        <p className="login-tagline">Track spending in seconds, not minutes.</p>

        {callbackError ? <StatusBanner variant="error" message={callbackError} /> : null}
        {auth.error ? <StatusBanner variant="error" message={auth.error} /> : null}

        <button className="login-google-btn" onClick={auth.signIn} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <div className="login-trust">
          <div className="login-trust-item">
            <Check size={16} className="login-trust-check" aria-hidden />
            <span>Free forever</span>
          </div>
          <div className="login-trust-item">
            <Check size={16} className="login-trust-check" aria-hidden />
            <span>Your data stays in Google Sheets</span>
          </div>
          <div className="login-trust-item">
            <Check size={16} className="login-trust-check" aria-hidden />
            <span>No account needed — just Google sign-in</span>
          </div>
        </div>

        <div className="login-footer">
          <a href="/privacy-policy.html">Privacy</a>
          <span aria-hidden>·</span>
          <a href="/terms-of-service.html">Terms</a>
          <span aria-hidden>·</span>
          <a href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">Feedback</a>
        </div>
      </div>
    </div>
  );
}
