import { Navigate } from "react-router-dom";
import { Layout } from "../components/Layout";

import type { JSX } from "react";

export function AuthCallbackPage(): JSX.Element {
  return (
    <Layout>
      <Navigate to="/home" replace />
    </Layout>
  );
}
