"use client";

import { useEffect, useRef } from "react";

import { audioElement, levels } from "@/lib/audio";
import type { Palette } from "@/lib/palette";

type Props = {
  colors: Palette;
  light?: boolean;
};

const vertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShader = `
precision mediump float;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uProgress;
uniform float uLight;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

varying vec2 vUv;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.2;

  float t = uTime * 0.055 + uBass * 0.04;

  vec2 q = vec2(
    fbm(p + vec2(0.0, t)),
    fbm(p + vec2(5.2, 1.3) - t)
  );

  vec2 r = vec2(
    fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 1.4),
    fbm(p + 3.2 * q + vec2(8.3, 2.8) - t * 1.2)
  );

  float f = fbm(p + (2.6 + uMid * 0.9) * r + uBass * 0.4);

  vec3 first = mix(uColorA, uColorC, uProgress * 0.45);
  vec3 second = mix(uColorB, uColorA, uProgress * 0.35);

  vec3 color = mix(first, second, clamp(f * 1.7 + 0.5, 0.0, 1.0));
  color = mix(color, uColorC, clamp(length(q) * 0.6, 0.0, 1.0));

  float light = 0.95 + 0.8 * (f + 0.5) + uEnergy * 0.2 + uTreble * 0.15;
  color *= light;

  float vignette = smoothstep(1.15, 0.25, length(uv - 0.5));
  color *= 0.65 + 0.35 * vignette;
  color *= 1.0 - 0.08 * uLight;

  gl_FragColor = vec4(color, 1.0);
}
`;

function rgb(value: string): [number, number, number] {
  const parsed = parseInt(value.slice(1), 16);

  return [
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
  ];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

type Scene = {
  dispose: () => void;
};

export default function Aurora({ colors, light = false }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const targets = useRef(colors.map(rgb));
  const lightTarget = useRef(light ? 1 : 0);

  useEffect(() => {
    targets.current = colors.map(rgb);
  }, [colors]);

  useEffect(() => {
    lightTarget.current = light ? 1 : 0;
  }, [light]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let disposed = false;
    let scene: Scene | null = null;
    let rebuiltAt = 0;

    const build = () => {
      if (disposed) return;

      scene?.dispose();
      scene = null;

      const canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";

      const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
      if (!gl) return;

      const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);

      if (!vertex || !fragment) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

      gl.useProgram(program);
      holder.appendChild(canvas);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const uniform = (name: string) => gl.getUniformLocation(program, name);
      const time = uniform("uTime");
      const bass = uniform("uBass");
      const mid = uniform("uMid");
      const treble = uniform("uTreble");
      const energy = uniform("uEnergy");
      const progress = uniform("uProgress");
      const lightUniform = uniform("uLight");
      const resolution = uniform("uResolution");
      const colorA = uniform("uColorA");
      const colorB = uniform("uColorB");
      const colorC = uniform("uColorC");

      const current = targets.current.map((color) => [...color]);
      let lightMix = light ? 1 : 0;
      let frame = 0;
      let running = false;
      let lost = false;
      let visible = !document.hidden;
      const started = performance.now();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const resize = () => {
        if (lost || gl.isContextLost()) return;

        const width = holder.clientWidth;
        const height = holder.clientHeight;
        if (width === 0 || height === 0) return;

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const bufferWidth = Math.round(width * ratio);
        const bufferHeight = Math.round(height * ratio);

        if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
          canvas.width = bufferWidth;
          canvas.height = bufferHeight;
        }

        gl.viewport(0, 0, bufferWidth, bufferHeight);
        gl.uniform2f(resolution, bufferWidth, bufferHeight);
      };

      const draw = () => {
        if (lost || gl.isContextLost()) return;

        const sound = levels();
        const audio = audioElement();
        const position = audio.duration ? Math.min(audio.currentTime / audio.duration, 1) : 0;

        for (let index = 0; index < 3; index += 1) {
          const target = targets.current[index];
          for (let channel = 0; channel < 3; channel += 1) {
            current[index][channel] += (target[channel] - current[index][channel]) * 0.03;
          }
        }

        lightMix += (lightTarget.current - lightMix) * 0.06;

        const mix = (color: number[]) =>
          color.map((value) => value + (1 - value) * 0.24 * lightMix);

        const first = mix(current[0]);
        const second = mix(current[1]);
        const third = mix(current[2]);

        gl.uniform3f(colorA, first[0], first[1], first[2]);
        gl.uniform3f(colorB, second[0], second[1], second[2]);
        gl.uniform3f(colorC, third[0], third[1], third[2]);

        gl.uniform1f(time, (performance.now() - started) / 1000);
        gl.uniform1f(bass, sound.bass);
        gl.uniform1f(mid, sound.mid);
        gl.uniform1f(treble, sound.treble);
        gl.uniform1f(energy, sound.energy);
        gl.uniform1f(progress, position);
        gl.uniform1f(lightUniform, lightMix);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      const loop = () => {
        if (!running || lost || !visible || disposed) return;
        draw();
        frame = requestAnimationFrame(loop);
      };

      const stop = () => {
        running = false;
        cancelAnimationFrame(frame);
      };

      const start = () => {
        if (lost || disposed) return;

        resize();

        if (reduced) {
          draw();
          return;
        }

        if (running) return;
        running = true;
        frame = requestAnimationFrame(loop);
      };

      const onLost = (event: Event) => {
        event.preventDefault();
        lost = true;
        stop();

        const now = Date.now();
        if (now - rebuiltAt < 1500) return;

        rebuiltAt = now;
        window.setTimeout(() => {
          if (!disposed && !document.hidden) build();
        }, 350);
      };

      const onRestored = () => {
        if (disposed) return;
        lost = false;
        start();
      };

      const onVisibility = () => {
        visible = !document.hidden;

        if (!visible) {
          stop();
          return;
        }

        if (lost || gl.isContextLost()) {
          build();
          return;
        }

        start();
      };

      const observer = new ResizeObserver(resize);
      observer.observe(holder);
      canvas.addEventListener("webglcontextlost", onLost, false);
      canvas.addEventListener("webglcontextrestored", onRestored, false);
      window.addEventListener("resize", resize);
      window.addEventListener("orientationchange", resize);
      window.addEventListener("pageshow", onVisibility);
      window.addEventListener("focus", onVisibility);
      window.visualViewport?.addEventListener("resize", resize);
      document.addEventListener("visibilitychange", onVisibility);
      resize();
      start();

      scene = {
        dispose: () => {
          stop();
          observer.disconnect();
          canvas.removeEventListener("webglcontextlost", onLost);
          canvas.removeEventListener("webglcontextrestored", onRestored);
          window.removeEventListener("resize", resize);
          window.removeEventListener("orientationchange", resize);
          window.removeEventListener("pageshow", onVisibility);
          window.removeEventListener("focus", onVisibility);
          window.visualViewport?.removeEventListener("resize", resize);
          document.removeEventListener("visibilitychange", onVisibility);
          gl.deleteBuffer(buffer);
          gl.deleteProgram(program);
          gl.deleteShader(vertex);
          gl.deleteShader(fragment);
          canvas.remove();
        },
      };
    };

    build();

    return () => {
      disposed = true;
      scene?.dispose();
    };
  }, []);

  return <div ref={holderRef} className="absolute inset-0" />;
}
