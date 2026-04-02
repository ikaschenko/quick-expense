import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../services/analytics";

export function RouteTracker(): null {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
