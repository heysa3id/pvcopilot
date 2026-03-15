import { Link } from "react-router-dom";

export default function PlaceholderPage({ icon, title, color, desc }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "calc(100vh - 56px)", background: "#FAFBFC",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: 40, maxWidth: 460 }}>
        <div
          style={{
            width: 80, height: 80, borderRadius: 20,
            background: `${color}12`, border: `2px solid ${color}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          {icon}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
          {title}
        </h1>
        <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 32, lineHeight: 1.6 }}>
          {desc}
        </p>
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 20px", background: `${color}12`,
            border: `1.5px solid ${color}40`, borderRadius: 8,
            fontSize: 13, fontWeight: 700, color: color,
          }}
        >
          Module in development
        </div>
        <div style={{ marginTop: 24 }}>
          <Link to="/" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
            ← Back to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
