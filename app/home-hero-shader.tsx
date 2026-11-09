"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./home-hero.module.css";
import { homeHeroFragmentShader, homeHeroVertexShader } from "./home-hero-shaders";

const MAX_DEVICE_PIXEL_RATIO = 1.5;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("The browser could not create a homepage shader.");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;

  const message = gl.getShaderInfoLog(shader) || "Unknown shader compilation error.";
  gl.deleteShader(shader);
  throw new Error(message);
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, homeHeroVertexShader);
  let fragmentShader: WebGLShader;

  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, homeHeroFragmentShader);
  } catch (error) {
    gl.deleteShader(vertexShader);
    throw error;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("The browser could not create a homepage shader program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

  const message = gl.getProgramInfoLog(program) || "Unknown shader linking error.";
  gl.deleteProgram(program);
  throw new Error(message);
}

export default function HomeHeroShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const panel = canvas?.parentElement;
    if (!canvas || !panel) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let timeLocation: WebGLUniformLocation | null = null;
    let resolutionLocation: WebGLUniformLocation | null = null;
    let mouseLocation: WebGLUniformLocation | null = null;
    let frameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let isIntersecting = false;
    let isPageVisible = document.visibilityState === "visible";
    let isActive = false;
    let isDisposed = false;
    let hasFailed = false;
    let reducedMotion = motionPreference.matches;
    let elapsedTime = 0;
    let lastFrameTime: number | null = null;
    let mouseX = 10;
    let mouseY = 10;

    const stopLoop = () => {
      isActive = false;
      lastFrameTime = null;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };

    const stopWatching = () => {
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionPreference.removeEventListener("change", handleMotionPreferenceChange);
    };

    const resize = () => {
      if (!gl) return;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const releaseRenderer = () => {
      stopLoop();
      resizeObserver?.disconnect();
      resizeObserver = null;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      panel.removeEventListener("pointermove", handlePointerMove);
      panel.removeEventListener("pointerleave", handlePointerLeave);
      if (gl && buffer) gl.deleteBuffer(buffer);
      if (gl && program) gl.deleteProgram(program);
      buffer = null;
      program = null;
      timeLocation = null;
      resolutionLocation = null;
      mouseLocation = null;
      gl = null;
      if (!isDisposed) setReady(false);
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      hasFailed = true;
      stopWatching();
      releaseRenderer();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      mouseX = ((event.clientX - bounds.left) / bounds.width * 2 - 1) * (bounds.width / bounds.height);
      mouseY = 1 - (event.clientY - bounds.top) / bounds.height * 2;
    };

    const handlePointerLeave = () => {
      mouseX = 10;
      mouseY = 10;
    };

    const render = (now: number) => {
      frameId = null;
      if (!gl || !program || !timeLocation || !resolutionLocation || !mouseLocation || !isActive) return;

      if (lastFrameTime !== null) elapsedTime += (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      resize();
      gl.useProgram(program);
      gl.uniform1f(timeLocation, elapsedTime);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(mouseLocation, mouseX, mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frameId = requestAnimationFrame(render);
    };

    const initializeRenderer = () => {
      try {
        gl = canvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        if (!gl) throw new Error("WebGL is unavailable.");

        program = createProgram(gl);
        buffer = gl.createBuffer();
        if (!buffer) throw new Error("The browser could not create a homepage vertex buffer.");

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.useProgram(program);

        const positionLocation = gl.getAttribLocation(program, "a_position");
        timeLocation = gl.getUniformLocation(program, "u_time");
        resolutionLocation = gl.getUniformLocation(program, "u_resolution");
        mouseLocation = gl.getUniformLocation(program, "u_mouse");
        if (positionLocation < 0 || !timeLocation || !resolutionLocation || !mouseLocation) {
          throw new Error("The homepage shader attributes or uniforms could not be found.");
        }

        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        canvas.addEventListener("webglcontextlost", handleContextLost, { once: true });
        panel.addEventListener("pointermove", handlePointerMove, { passive: true });
        panel.addEventListener("pointerleave", handlePointerLeave);
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();
        setReady(true);
      } catch (error) {
        hasFailed = true;
        stopWatching();
        releaseRenderer();
        console.error("The homepage shader could not start; showing the image fallback.", error);
      }
    };

    const updateActivity = () => {
      if (isDisposed || hasFailed) return;

      if (reducedMotion) {
        releaseRenderer();
        return;
      }

      const shouldRun = isIntersecting && isPageVisible;
      if (!shouldRun) {
        if (isActive) stopLoop();
        return;
      }

      if (!gl) initializeRenderer();
      if (!gl || isActive) return;

      isActive = true;
      lastFrameTime = null;
      frameId = requestAnimationFrame(render);
    };

    const handleVisibilityChange = () => {
      isPageVisible = document.visibilityState === "visible";
      updateActivity();
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      updateActivity();
    };

    intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry.isIntersecting && entry.intersectionRatio > 0;
      updateActivity();
    });
    intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionPreference.addEventListener("change", handleMotionPreferenceChange);
    updateActivity();

    return () => {
      isDisposed = true;
      stopWatching();
      releaseRenderer();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`${styles.shaderCanvas} ${ready ? styles.shaderCanvasReady : ""}`}
    />
  );
}
