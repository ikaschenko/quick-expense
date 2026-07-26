import { Navigate } from "react-router-dom";
import { Layout } from "../components/Layout";

export function AuthCallbackPage(): JSX.Element {
  return (
    <Layout>
      <Navigate to="/home" replace />
    </Layout>
  );
}
