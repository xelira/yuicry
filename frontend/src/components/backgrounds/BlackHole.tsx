"use client";

import { useEffect, useRef, useState } from "react";

import { levels } from "@/lib/audio";
import { alpha, grainTexture, mixHex, tone, useBackgroundCanvas } from "@/lib/background";
import type { Palette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";

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
precision highp float;

uniform float uTime;
uniform float uBass;
uniform float uLight;
uniform vec2 uResolution;
uniform vec3 uHot;
uniform vec3 uWarm;
uniform vec3 uDeep;

const float HORIZON = 1.0;
const float DISK_IN = 2.7;
const float DISK_OUT = 8.5;
const int STEPS = 170;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise3(p);
    p *= 2.03;
    amplitude *= 0.5;
  }

  return value;
}

vec2 rot2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec3 sky(vec3 dir) {
  if (uLight > 0.5) {
    vec3 base = vec3(0.985, 0.972, 0.952);
    float neb = fbm3(dir * 2.6 + 5.0);
    base = mix(base, uWarm * 0.8, neb * 0.3);

    vec3 q = dir * 46.0;
    vec3 id = floor(q);
    vec3 f = fract(q) - 0.5;
    float h = hash13(id);

    if (h > 0.984) {
      float d = length(f);
      base -= vec3(0.16, 0.13, 0.12) * smoothstep(0.3, 0.0, d);
    }

    return base;
  }

  vec3 base = vec3(0.014, 0.013, 0.02);
  float neb = fbm3(dir * 2.6 + 5.0);
  base += uWarm * neb * 0.14;

  vec3 q = dir * 46.0;
  vec3 id = floor(q);
  vec3 f = fract(q) - 0.5;
  float h = hash13(id);

  if (h > 0.982) {
    float d = length(f);
    float star = smoothstep(0.34, 0.0, d);
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.7 + h * 90.0);
    base += vec3(0.85, 0.88, 1.0) * star * twinkle * 1.25;
  }

  return base;
}

vec3 diskColor(vec3 p, float r) {
  float omega = 1.0 / pow(r, 1.5);
  vec2 swirl = rot2(p.xz, -uTime * omega * 5.5);
  float grain = fbm3(vec3(swirl * 0.8, r * 0.4));
  float bands = 0.22 + 1.05 * grain;

  float heat = clamp(2.5 / r, 0.0, 1.0);
  heat = pow(heat, 1.4);

  vec3 col = mix(uDeep, uWarm, smoothstep(0.0, 0.62, heat));
  col = mix(col, uHot, smoothstep(0.72, 1.0, heat));

  float bright = pow(2.5 / r, 2.1);
  col *= (0.32 + bands * 1.85) * (0.38 + bright) * (1.0 + uBass * 0.4);
  col *= 1.0 + 2.6 * smoothstep(4.6, 2.7, r);

  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv.y += 0.13;

  float orbit = uTime * 0.012;
  vec3 ro = vec3(sin(orbit) * 20.0, 3.4, -cos(orbit) * 20.0);
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(right * uv.x + up * uv.y + fwd * 1.3);

  vec3 pos = ro;
  vec3 vel = rd;
  vec3 angular = cross(pos, vel);
  float h2 = dot(angular, angular);

  vec3 col = vec3(0.0);
  float transmit = 1.0;
  float captured = 0.0;

  for (int i = 0; i < STEPS; i++) {
    float r2 = dot(pos, pos);

    if (r2 < HORIZON * HORIZON) {
      captured = 1.0;
      break;
    }

    if (r2 > 1600.0) break;

    float r = sqrt(r2);
    float dt = clamp(0.06 * r, 0.05, 0.6);

    vec3 acceleration = -1.5 * h2 * pos / (r2 * r2 * r);
    vel += acceleration * dt;

    vec3 next = pos + vel * dt;

    if (pos.y * next.y < 0.0) {
      float share = pos.y / (pos.y - next.y);
      vec3 hit = mix(pos, next, share);
      float hr = length(hit.xz);

      if (hr > DISK_IN && hr < DISK_OUT) {
        vec3 dc = diskColor(hit, hr);
        float density = smoothstep(DISK_IN, DISK_IN + 1.4, hr) * (1.0 - smoothstep(DISK_OUT - 3.2, DISK_OUT, hr));
        density *= 0.5 + 0.5 * fbm3(vec3(hit.xz * 0.65, hr * 0.4));

        col += dc * clamp(density, 0.0, 1.0) * 1.25 * transmit;
        transmit *= 1.0 - clamp(density * 0.92, 0.0, 1.0);

        if (transmit < 0.03) break;
      }
    }

    pos = next;
  }

  if (captured < 0.5) {
    col += sky(normalize(vel)) * transmit;
  }

  if (uLight < 0.5) {
    col = col / (1.0 + col * 0.62);
  }

  gl_FragColor = vec4(col, 1.0);
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

function paletteTriple(
  colors: Palette,
  light: boolean,
): [[number, number, number], [number, number, number], [number, number, number]] {
  const warm = light ? colors[0] : mixHex(colors[0], "#ffffff", 0.08);
  const hot = light ? mixHex("#fff8ee", colors[0], 0.28) : mixHex("#fff6e8", colors[0], 0.14);
  const deep = light
    ? mixHex(colors[1], "#2a0b06", 0.45)
    : mixHex(colors[1], "#170409", 0.86);

  return [rgb(hot), rgb(warm), rgb(deep)];
}

function BlackHoleFlat({ colors, light = false }: Props) {
  const accent = useAccentColor();

  const canvasRef = useBackgroundCanvas((ctx, width, height, time) => {
    const accentTone = light ? tone(accent, true) : accent;
    const base = Math.min(width, height);
    const cx = width * 0.5;
    const cy = height * 0.63;
    const radius = base * 0.19;
    const tilt = -0.16;
    const flatten = 0.33;
    const inner = 1.85;
    const outer = 5.0;
    const spin = time * 0.2;

    const hot = light ? mixHex("#fff8ee", accent, 0.18) : "#fff8ee";
    const warm = light ? accent : accentTone;
    const deep = mixHex(warm, "#170409", light ? 0.78 : 0.86);

    ctx.clearRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 6);
    glow.addColorStop(0, alpha(warm, light ? 0.24 : 0.4));
    glow.addColorStop(0.4, alpha(warm, light ? 0.1 : 0.16));
    glow.addColorStop(1, alpha(warm, 0));

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    if (!light) {
      for (let index = 0; index < 90; index += 1) {
        const x = (index * 137.51) % width;
        const y = (index * 71.93) % (height * 0.86);
        const flicker = 0.5 + 0.5 * Math.sin(time * 0.5 + index * 1.7);
        const size = index % 11 === 0 ? 1.6 : 1;

        ctx.fillStyle = `rgba(255,255,255,${0.06 + flicker * 0.2})`;
        ctx.fillRect(x, y, size, size);
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(1, flatten);

    const disk = ctx.createRadialGradient(0, 0, radius * inner, 0, 0, radius * outer);
    disk.addColorStop(0, alpha(hot, light ? 0.98 : 1));
    disk.addColorStop(0.2, alpha(warm, light ? 0.9 : 1));
    disk.addColorStop(0.5, alpha(mixHex(warm, deep, 0.42), light ? 0.7 : 0.82));
    disk.addColorStop(0.78, alpha(deep, light ? 0.42 : 0.52));
    disk.addColorStop(1, alpha(deep, 0));

    ctx.beginPath();
    ctx.arc(0, 0, radius * outer, 0, Math.PI * 2);
    ctx.arc(0, 0, radius * inner, 0, Math.PI * 2, true);
    ctx.fillStyle = disk;
    ctx.fill("evenodd");

    for (let index = 0; index < 54; index += 1) {
      const t = index / 54;
      const orbit = radius * (inner + t * (outer - inner));
      const start = (index * 2.399 + spin * (0.6 + (index % 3) * 0.22)) % (Math.PI * 2);
      const length = 0.55 + (index % 5) * 0.24;
      const fade = Math.pow(1 - t, 1.5);

      ctx.strokeStyle = alpha(mixHex(hot, warm, t), fade * (light ? 0.42 : 0.62));
      ctx.lineWidth = Math.max(1.2, radius * 0.024);
      ctx.beginPath();
      ctx.arc(0, 0, orbit, start, start + length);
      ctx.stroke();
    }

    ctx.strokeStyle = alpha(hot, light ? 0.85 : 1);
    ctx.lineWidth = Math.max(1.2, radius * 0.026);
    ctx.beginPath();
    ctx.arc(0, 0, radius * inner, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    const arcStart = Math.PI * 1.04;
    const arcEnd = Math.PI * 1.96;
    const segments = 46;

    for (let index = 0; index < segments; index += 1) {
      const from = arcStart + ((arcEnd - arcStart) * index) / segments;
      const to = arcStart + ((arcEnd - arcStart) * (index + 1)) / segments;
      const fade = Math.pow(Math.sin((Math.PI * (index + 0.5)) / segments), 0.55);

      ctx.strokeStyle = alpha(mixHex(hot, warm, index / segments), (light ? 0.8 : 1) * fade);
      ctx.lineWidth = Math.max(1.5, radius * 0.055);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.19, from, to);
      ctx.stroke();
    }

    ctx.strokeStyle = alpha(warm, light ? 0.16 : 0.22);
    ctx.lineWidth = Math.max(1, radius * 0.03);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.19, 0, Math.PI * 2);
    ctx.stroke();

    for (let index = 0; index < 52; index += 1) {
      const phase = time * (0.16 + (index % 6) * 0.022) + index * 1.61;
      const drift = (((index / 52 + time * 0.01) % 1) + 1) % 1;
      const orbit = radius * (inner + drift * (outer - inner) * 0.85);
      const x = cx + Math.cos(phase) * orbit;
      const y = cy + Math.sin(phase) * orbit * flatten;
      const fade = Math.pow(1 - drift, 1.3);

      ctx.fillStyle = alpha(hot, fade * (light ? 0.45 : 0.8));
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, radius * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }

    if (light) {
      const shade = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.75);
      shade.addColorStop(0, "rgba(12,8,8,0.16)");
      shade.addColorStop(0.55, "rgba(12,8,8,0.06)");
      shade.addColorStop(1, "rgba(12,8,8,0)");

      ctx.fillStyle = shade;
      ctx.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 4);
    }

    const core = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    core.addColorStop(0, "#000000");
    core.addColorStop(0.88, "#000000");
    core.addColorStop(1, light ? "#08080b" : "#010103");

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = alpha(hot, 1);
    ctx.lineWidth = Math.max(1.6, radius * 0.026);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.03, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = alpha(hot, light ? 0.2 : 0.3);
    ctx.lineWidth = Math.max(7, radius * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.03, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(1, flatten);

    const band = ctx.createRadialGradient(
      0,
      0,
      radius * inner,
      0,
      0,
      radius * inner * 1.24,
    );
    band.addColorStop(0, alpha(hot, light ? 0.9 : 1));
    band.addColorStop(0.55, alpha(warm, light ? 0.7 : 1));
    band.addColorStop(1, alpha(warm, 0));

    const bandSegments = 26;

    for (let index = 0; index < bandSegments; index += 1) {
      const from = (Math.PI * index) / bandSegments;
      const to = (Math.PI * (index + 1)) / bandSegments;
      const fade = Math.pow(Math.sin((Math.PI * (index + 0.5)) / bandSegments), 1.15);

      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(0, 0, radius * inner * 1.24, from, to);
      ctx.arc(0, 0, radius * inner, to, from, true);
      ctx.closePath();
      ctx.fillStyle = band;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  });

  return (
    <div className="absolute inset-0 animate-[fade-in_.6s_ease-out]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
        style={{ backgroundImage: grainTexture, backgroundSize: "140px 140px" }}
      />
    </div>
  );
}

function useWebGL() {
  const [capable, setCapable] = useState<boolean | null>(null);

  useEffect(() => {
    let ok = false;

    try {
      const canvas = document.createElement("canvas");
      ok = Boolean(canvas.getContext("webgl"));
    } catch {
      ok = false;
    }

    setCapable(ok);
  }, []);

  return capable;
}

export default function BlackHole({ colors, light = false }: Props) {
  const capable = useWebGL();

  if (capable === null) return <div className="absolute inset-0" />;
  if (!capable) return <BlackHoleFlat colors={colors} light={light} />;

  return <BlackHoleScene colors={colors} light={light} />;
}

function BlackHoleScene({ colors, light = false }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const targets = useRef(paletteTriple(colors, light));
  const lightTarget = useRef(light ? 1 : 0);

  useEffect(() => {
    targets.current = paletteTriple(colors, light);
  }, [colors, light]);

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

      const gl = canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
      if (!gl) return;

      const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);

      if (!vertex || !fragment) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return;
      }

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
      const lightUniform = uniform("uLight");
      const resolution = uniform("uResolution");
      const hot = uniform("uHot");
      const warm = uniform("uWarm");
      const deep = uniform("uDeep");

      const current = targets.current.map((color) => [...color]);
      let lightMix = light ? 1 : 0;
      let frame = 0;
      let running = false;
      let lost = false;
      let visible = !document.hidden;
      let lastDraw = 0;
      const started = performance.now();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const resize = () => {
        if (lost || gl.isContextLost()) return;

        const width = holder.clientWidth;
        const height = holder.clientHeight;
        if (width === 0 || height === 0) return;

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(1, 560 / Math.max(width * ratio, 1));
        const bufferWidth = Math.max(2, Math.round(width * ratio * scale));
        const bufferHeight = Math.max(2, Math.round(height * ratio * scale));

        if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
          canvas.width = bufferWidth;
          canvas.height = bufferHeight;
        }

        gl.viewport(0, 0, bufferWidth, bufferHeight);
        gl.uniform2f(resolution, bufferWidth, bufferHeight);
      };

      const draw = (now: number) => {
        if (lost || gl.isContextLost()) return;
        if (!reduced && now - lastDraw < 33) return;
        lastDraw = now;

        const sound = levels();

        for (let index = 0; index < 3; index += 1) {
          const target = targets.current[index];
          for (let channel = 0; channel < 3; channel += 1) {
            current[index][channel] += (target[channel] - current[index][channel]) * 0.05;
          }
        }

        lightMix += (lightTarget.current - lightMix) * 0.08;

        gl.uniform3f(hot, current[0][0], current[0][1], current[0][2]);
        gl.uniform3f(warm, current[1][0], current[1][1], current[1][2]);
        gl.uniform3f(deep, current[2][0], current[2][1], current[2][2]);
        gl.uniform1f(time, (performance.now() - started) / 1000);
        gl.uniform1f(bass, sound.bass);
        gl.uniform1f(lightUniform, lightMix);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      const loop = () => {
        if (!running || lost || !visible || disposed) return;
        draw(performance.now());
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
          draw(performance.now());
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
