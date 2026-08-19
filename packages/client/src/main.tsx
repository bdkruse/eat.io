import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "@fontsource/karla/400.css";
import "@fontsource/karla/600.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/screens.css";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
