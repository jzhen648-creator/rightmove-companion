// Entry point for the content script that mounts the React app onto Rightmove pages.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import styles from "./styles.css?inline";

const HOST_ID = "rmia-extension-host";

function mountExtension(): void {
  if (document.getElementById(HOST_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleTag = document.createElement("style");
  const appContainer = document.createElement("div");

  styleTag.textContent = styles;
  appContainer.id = "rmia-app-root";

  shadowRoot.append(styleTag, appContainer);
  (document.body ?? document.documentElement).appendChild(host);

  createRoot(appContainer).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

mountExtension();

