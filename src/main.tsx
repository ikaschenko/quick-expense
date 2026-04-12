import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { RouteTracker } from "./components/RouteTracker";
import { initAnalytics } from "./services/analytics";
import "react-datepicker/dist/react-datepicker.css";
import "./index.css";

initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RouteTracker />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
