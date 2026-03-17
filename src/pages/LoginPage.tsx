import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Layout } from "../components/Layout";
import { StatusBanner } from "../components/StatusBanner";

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
    <Layout>
      <section className="card hero-card">
        <h1>Quick Expense</h1>
        <p>
          Capture expenses quickly, store them in a shared Google Sheet, and review
          them later from desktop or mobile.
        </p>
        {callbackError ? <StatusBanner variant="error" message={callbackError} /> : null}
        {auth.error ? <StatusBanner variant="error" message={auth.error} /> : null}
        <div className="hero-actions">
          <button className="primary-button" onClick={auth.signIn} type="button">
            Sign in with Google
          </button>
        </div>
        <p className="muted small">
          Google authentication happens on the backend, so your signed-in account and
          spreadsheet setup can be remembered across visits.
        </p>
        <p className="muted small feedback-note">
          If sign-in or setup is confusing, you can open the short feedback form without logging in.
        </p>
      </section>
    </Layout>
  );
}
