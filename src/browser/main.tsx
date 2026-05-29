import React from "react";
import ReactDOM from "react-dom/client";
import "@fangxinyan/lumina/styles";
import App from "./App";
import "./styles/base.css";
import "./styles/app/workspace.css";
import "./styles/common-page.css";
import "./styles/app/sidebar.css";
import "./styles/task-center/task-center.css";
import "./styles/qq.css";
import "./styles/docs/layout.css";
import "./styles/docs/config.css";
import "./styles/docs/webview.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
