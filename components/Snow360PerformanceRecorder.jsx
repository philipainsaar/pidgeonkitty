"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { createRenderDiagnostics, diagnosticWindow, DIAGNOSTIC_SECONDS } from "./snow360RenderDiagnostics";

// Opt-in, local-only diagnostics. Nothing is sent to a server.
export default function Snow360PerformanceRecorder({ phase, stateRef }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setEnabled(new URLSearchParams(location.search).get("profile") === "1"); }, []);
  return enabled ? <Recorder phase={phase} stateRef={stateRef}/> : null;
}

function Recorder({ phase, stateRef }) {
  const { gl, scene } = useThree();
  const frameStart = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [status, setStatus] = useState("Start riding to record 60 seconds");
  const [download, setDownload] = useState(null);
  const panel = useRef(null);
  useEffect(() => {
    const node = document.createElement("div");
    Object.assign(node.style,{position:"fixed",zIndex:"10000",bottom:"45px",left:"12px",padding:"10px",background:"#10232ee8",color:"white",font:"13px system-ui",borderRadius:"8px",pointerEvents:"auto"});
    document.body.appendChild(node); panel.current = node;
    return () => { node.remove(); panel.current = null; };
  },[]);
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    node.textContent = status;
    if (download) {
      const link = document.createElement("a");
      link.href=download; link.download="snow360-profile.json"; link.textContent="Save report";
      Object.assign(link.style,{color:"#fff39b",marginLeft:"12px"}); node.appendChild(link);
      const compare = document.createElement("button");
      compare.textContent = "Compare original drawing";
      compare.onclick = () => {
        scene.userData.snowOriginalDrawing = !scene.userData.snowOriginalDrawing;
        compare.textContent = scene.userData.snowOriginalDrawing ? "Restore optimized drawing" : "Compare original drawing";
      };
      node.appendChild(compare);
    }
  },[status,download,scene]);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download); }, [download]);
  useFrame(() => { frameStart.current = performance.now(); stateRef.current.profileTiming = true; stateRef.current.animationMs = 0; }, -1000);

  useEffect(() => {
    const diagnosticMode = new URLSearchParams(location.search).get("diagnose");
    const diagnostic = diagnosticMode === "1" || diagnosticMode === "trees";
    const experiment = diagnostic ? createRenderDiagnostics() : null;
    const duration = diagnosticMode === "trees" ? 72 : diagnostic ? DIAGNOSTIC_SECONDS : 60;
    if (diagnostic) setStatus(`Render comparison: play for ${duration} seconds; restart after each run`);
    const context = gl.getContext();
    const ext = context.getExtension("EXT_disjoint_timer_query_webgl2");
    const original = gl.render;
    const frames = [], gpu = [], pending = [];
    let started = null, last = null, done = false, lastLabel = -1, activeMs = 0;
    const finish = () => {
      done = true;
      const report = { version: 1, label: diagnosticMode === "trees" ? "tree-material-isolation-v1" : diagnostic ? "render-isolation-v1" : "visible-star-instances", diagnostic, diagnosticMode, gpuTimerSupported: !!ext,
        pixelRatio: gl.getPixelRatio(), width: gl.domElement.width, height: gl.domElement.height,
        notes: "Frame intervals are browser cadence, not display FPS. CPU render is submission time, not GPU execution. Update time covers R3F frame callbacks. GPU queries sample every 15th frame; disjoint samples discarded.",
        activeMs, frames, gpu };
      setDownload(URL.createObjectURL(new Blob([JSON.stringify(report)], {type:"application/json"})));
      setStatus("Recording complete — save report");
    };
    function measuredRender(...args) {
      if (done) return original.apply(this, args);
      if (ext) {
        const disjoint = context.getParameter(ext.GPU_DISJOINT_EXT);
        for (let i = pending.length - 1; i >= 0; i--) {
          const p = pending[i];
          if (disjoint || context.getQueryParameter(p.query, context.QUERY_RESULT_AVAILABLE)) {
            if (!disjoint) gpu.push({frame:p.frame, ms:context.getQueryParameter(p.query, context.QUERY_RESULT)/1e6});
            context.deleteQuery(p.query); pending.splice(i,1);
          }
        }
      }
      if (phaseRef.current !== "playing" || document.hidden) {
        last = null;
        if (!diagnostic && started !== null && phaseRef.current === "finished") finish();
        return original.apply(this,args);
      }
      const now = performance.now();
      if (started === null) started = now;
      const interval = last === null ? null : now-last;
      if (interval !== null) activeMs += interval;
      last = now;
      let query = null;
      if (ext && frames.length % 15 === 0 && pending.length < 4 && !context.getQuery(ext.TIME_ELAPSED_EXT, context.CURRENT_QUERY)) {
        query = context.createQuery();
        if (query) context.beginQuery(ext.TIME_ELAPSED_EXT,query);
      }
      const window = diagnostic ? diagnosticWindow(activeMs, diagnosticMode) : { variant: "baseline", settled: true };
      const restore = experiment?.apply(args[0], window.variant);
      const before = performance.now();
      let result;
      try { result = original.apply(this,args); }
      finally { if (query) context.endQuery(ext.TIME_ELAPSED_EXT); restore?.(); }
      const end = performance.now();
      if (query) pending.push({query,frame:frames.length});
      const s = stateRef.current;
      frames.push({t:now-started,interval,variant:window.variant,settled:window.settled,updateMs:Math.max(0,now-frameStart.current),renderCpuMs:end-before,
        animationMs:s.animationMs || 0, calls:gl.info.render.calls,triangles:gl.info.render.triangles,
        pose:s.currentPose ?? null,air:!!s.inAir,recovery:!!s.recovery,distance:Math.max(0,-s.z)});
      const seconds = Math.floor(activeMs/1000);
      if (seconds !== lastLabel) { lastLabel=seconds; setStatus(`Recording ${Math.min(duration,seconds)} / ${duration} seconds${diagnostic ? " / " + window.variant : ""}`); }
      if (activeMs >= duration*1000 || frames.length >= 12000) finish();
      return result;
    }
    gl.render = measuredRender;
    return () => {
      if (gl.render === measuredRender) gl.render = original;
      stateRef.current.profileTiming = false;
      experiment?.dispose();
      for (const p of pending) context.deleteQuery(p.query);
    };
  }, [gl,stateRef]);

  return null;
}
