// src/app/App.tsx

import { Router } from "wouter";

import { AppProviders } from "./providers/AppProviders";
import { AppRoutes } from "./router";

export default function App() {
  return (
    <AppProviders>
      <Router base="/">
        <AppRoutes />
      </Router>
    </AppProviders>
  );
}
