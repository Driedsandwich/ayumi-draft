import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>画面を開き直してください</h1>
        <p>保存済みの内容は端末にあります。</p>
        <button onClick={() => location.reload()}>開き直す</button>
        <button
          onClick={() => {
            if (confirm("保存した内容を消してやり直しますか？")) {
              localStorage.removeItem("ayumi-draft-v1");
              location.reload();
            }
          }}
        >
          保存内容を消してやり直す
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
