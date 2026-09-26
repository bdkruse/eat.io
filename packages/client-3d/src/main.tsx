import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "@fontsource/karla/400.css";
import "@fontsource/karla/600.css";
import "./ui/styles/tokens.css";
import "./ui/styles/interface.css";
import "./ui/styles/game.css";
import "./ui/styles/overlays.css";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
