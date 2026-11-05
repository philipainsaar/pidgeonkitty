"use client";

import { Component } from "react";
import { Html } from "@react-three/drei";

// Keep the course and Settings usable if a model cannot be loaded.
export default class Snow360RiderBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { this.props.onError?.(error.message); }
  render() {
    return this.state.failed
      ? <Html center><div role="alert" style={{ padding: 12, background: "#163d59", color: "white", borderRadius: 8, width: 220, textAlign: "center" }}>The rider could not load. Please retry from Settings.</div></Html>
      : this.props.children;
  }
}
