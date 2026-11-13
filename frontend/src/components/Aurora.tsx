"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { audioElement, levels } from "@/lib/audio";
import type { Palette } from "@/lib/palette";

type Props = {
  colors: Palette;
  light?: boolean;
};

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
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
  color *= 1.0 - 0.32 * uLight;

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function Aurora({ colors, light = false }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const targets = useRef(colors.map((value) => new THREE.Color(value)));
  const current = useRef(colors.map((value) => new THREE.Color(value)));
  const lightTarget = useRef(light ? 1 : 0);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    holder.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uEnergy: { value: 0 },
        uProgress: { value: 0 },
        uLight: { value: light ? 1 : 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uColorA: { value: current.current[0].clone() },
        uColorB: { value: current.current[1].clone() },
        uColorC: { value: current.current[2].clone() },
      },
    });

    materialRef.current = material;

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    const resize = () => {
      const width = holder.clientWidth;
      const height = holder.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      material.uniforms.uResolution.value.set(width, height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(holder);
    resize();
    renderer.render(scene, camera);

    const clock = new THREE.Clock();
    let frame = 0;

    const loop = () => {
      const sound = levels();
      const audio = audioElement();
      const progress = audio.duration ? Math.min(audio.currentTime / audio.duration, 1) : 0;

      current.current[0].lerp(targets.current[0], 0.03);
      current.current[1].lerp(targets.current[1], 0.03);
      current.current[2].lerp(targets.current[2], 0.03);

      const lightMix = material.uniforms.uLight.value;
      material.uniforms.uLight.value +=
        (lightTarget.current - material.uniforms.uLight.value) * 0.06;

      const white = new THREE.Color("#ffffff");

      material.uniforms.uColorA.value
        .copy(current.current[0])
        .lerp(white, 0.45 * lightMix);
      material.uniforms.uColorB.value
        .copy(current.current[1])
        .lerp(white, 0.45 * lightMix);
      material.uniforms.uColorC.value
        .copy(current.current[2])
        .lerp(white, 0.45 * lightMix);

      material.uniforms.uTime.value = clock.getElapsedTime();
      material.uniforms.uBass.value += (sound.bass - material.uniforms.uBass.value) * 0.03;
      material.uniforms.uMid.value += (sound.mid - material.uniforms.uMid.value) * 0.04;
      material.uniforms.uTreble.value += (sound.treble - material.uniforms.uTreble.value) * 0.03;
      material.uniforms.uEnergy.value += (sound.energy - material.uniforms.uEnergy.value) * 0.02;
      material.uniforms.uProgress.value += (progress - material.uniforms.uProgress.value) * 0.02;

      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === holder) {
        holder.removeChild(renderer.domElement);
      }
      materialRef.current = null;
    };
  }, []);

  useEffect(() => {
    targets.current = colors.map((value) => new THREE.Color(value));
  }, [colors]);

  useEffect(() => {
    lightTarget.current = light ? 1 : 0;
  }, [light]);

  return <div ref={holderRef} className="absolute inset-0 bg-[#0b0b0f]" />;
}
