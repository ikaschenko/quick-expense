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
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#4F46E5" />
            <path d="M16 8v16M8 16h16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
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
