/**
 * EnvironmentManager.ts
 * Manages lighting, astronomical sun positioning, procedural sky dome gradient,
 * day/night transitions, and global wind uniform distribution.
 */

import * as THREE from "three";
import { EnvironmentSettings } from "@/types/threeDBackground";
import { GraphicsPresetConfig, getGraphicsPresetConfig } from "./GraphicsPresets";
import { TreeFactory } from "../nature/TreeFactory";

export interface GlobalWindUniforms {
  uWindTime: { value: number };
  uWindSpeed: { value: number };
  uWindDirection: { value: THREE.Vector2 };
  uWindGustiness: { value: number };
}

export interface IEnvironmentController {
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  ambientLight: THREE.AmbientLight;
  skyMesh: THREE.Mesh;
  update(settings: EnvironmentSettings): void;
  updateWindTime(deltaTime: number): void;
}

export class EnvironmentManager implements IEnvironmentController {
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public ambientLight: THREE.AmbientLight;
  public skyMesh: THREE.Mesh;

  private skyMaterial: THREE.ShaderMaterial;
  private currentSettings: EnvironmentSettings;
  private currentPresetConfig: GraphicsPresetConfig;

  public windUniforms: GlobalWindUniforms;
  private registeredMaterials = new Set<THREE.ShaderMaterial>();

  constructor(
    initialSettings: EnvironmentSettings,
    graphicsPreset: "low" | "medium" | "high" = "high"
  ) {
    this.currentSettings = { ...initialSettings };
    this.currentPresetConfig = getGraphicsPresetConfig(graphicsPreset);

    // 1. Directional Sun Light
    this.sunLight = new THREE.DirectionalLight(
      new THREE.Color(this.currentSettings.sunColor),
      this.currentSettings.sunIntensity
    );
    this.sunLight.castShadow = this.currentPresetConfig.enableShadows;
    this.setupSunShadows();

    // 2. Hemisphere Fill Light
    this.hemiLight = new THREE.HemisphereLight(
      new THREE.Color(this.currentSettings.skyColor),
      new THREE.Color(this.currentSettings.groundColor),
      this.currentSettings.ambientIntensity * 0.75
    );

    // 3. Ambient Base Light
    this.ambientLight = new THREE.AmbientLight(
      new THREE.Color(this.currentSettings.ambientColor),
      this.currentSettings.ambientIntensity * 0.25
    );

    // 4. Global Wind Uniforms
    const rad = (this.currentSettings.windDirection * Math.PI) / 180;
    this.windUniforms = {
      uWindTime: { value: 0.0 },
      uWindSpeed: { value: this.currentSettings.windSpeed },
      uWindDirection: { value: new THREE.Vector2(Math.cos(rad), Math.sin(rad)) },
      uWindGustiness: { value: this.currentSettings.windGustiness },
    };

    // 5. Procedural Sky Dome
    const skyGeom = new THREE.SphereGeometry(80, 32, 24);
    this.skyMaterial = this.createSkyMaterial();
    this.skyMesh = new THREE.Mesh(skyGeom, this.skyMaterial);
    this.skyMesh.renderOrder = -1000; // Render sky dome first

    this.applySettings(this.currentSettings);
  }

  private setupSunShadows(): void {
    const size = this.currentPresetConfig.shadowMapSize;
    this.sunLight.shadow.mapSize.width = size;
    this.sunLight.shadow.mapSize.height = size;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 100.0;
    this.sunLight.shadow.camera.left = -15;
    this.sunLight.shadow.camera.right = 15;
    this.sunLight.shadow.camera.top = 15;
    this.sunLight.shadow.camera.bottom = -15;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
  }

  private createSkyMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenithColor: { value: new THREE.Color(this.currentSettings.skyColor) },
        uHorizonColor: { value: new THREE.Color(this.currentSettings.ambientColor) },
        uGroundColor: { value: new THREE.Color(this.currentSettings.groundColor) },
        uSunPosition: {
          value: new THREE.Vector3(
            this.currentSettings.sunPosition[0],
            this.currentSettings.sunPosition[1],
            this.currentSettings.sunPosition[2]
          ),
        },
        uSunColor: { value: new THREE.Color(this.currentSettings.sunColor) },
        uSunIntensity: { value: this.currentSettings.sunIntensity },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunPosition;
        uniform vec3 uSunColor;
        uniform float uSunIntensity;
        varying vec3 vWorldPosition;

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = dir.y;
          vec3 sky;
          if (h >= 0.0) {
            float t = pow(h, 0.45);
            sky = mix(uHorizonColor, uZenithColor, t);
          } else {
            float t = pow(-h, 0.6);
            sky = mix(uHorizonColor, uGroundColor, t);
          }

          vec3 sunDir = normalize(uSunPosition);
          float cosTheta = dot(dir, sunDir);
          float sunDisc = smoothstep(0.9995, 0.9999, cosTheta);
          float halo = pow(max(0.0, cosTheta), 24.0) * 0.45;
          vec3 finalColor = sky + (sunDisc * 3.0 + halo) * uSunColor * min(uSunIntensity, 2.0);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }

  public applySettings(settings: EnvironmentSettings): void {
    this.currentSettings = { ...settings };

    // Sun light updates
    this.sunLight.color.set(settings.sunColor);
    this.sunLight.intensity = settings.sunIntensity;
    this.sunLight.position.set(
      settings.sunPosition[0],
      settings.sunPosition[1],
      settings.sunPosition[2]
    );

    // Hemisphere light updates
    this.hemiLight.color.set(settings.skyColor);
    this.hemiLight.groundColor.set(settings.groundColor);
    this.hemiLight.intensity = settings.ambientIntensity * 0.75;

    // Ambient light updates
    this.ambientLight.color.set(settings.ambientColor);
    this.ambientLight.intensity = settings.ambientIntensity * 0.25;

    // Sky dome shader uniforms
    if (this.skyMaterial.uniforms) {
      this.skyMaterial.uniforms.uZenithColor.value.set(settings.skyColor);
      this.skyMaterial.uniforms.uHorizonColor.value.set(settings.ambientColor);
      this.skyMaterial.uniforms.uGroundColor.value.set(settings.groundColor);
      this.skyMaterial.uniforms.uSunPosition.value.set(
        settings.sunPosition[0],
        settings.sunPosition[1],
        settings.sunPosition[2]
      );
      this.skyMaterial.uniforms.uSunColor.value.set(settings.sunColor);
      this.skyMaterial.uniforms.uSunIntensity.value = settings.sunIntensity;
    }

    // Wind uniforms
    const rad = (settings.windDirection * Math.PI) / 180;
    this.windUniforms.uWindSpeed.value = settings.windSpeed;
    this.windUniforms.uWindDirection.value.set(Math.cos(rad), Math.sin(rad));
    this.windUniforms.uWindGustiness.value = settings.windGustiness;

    // Synchronize tree factory wind
    TreeFactory.updateWind(
      this.windUniforms.uWindTime.value,
      settings.windSpeed,
      settings.windDirection,
      settings.windGustiness
    );
  }

  public update(settings: EnvironmentSettings): void {
    this.applySettings(settings);
  }

  public setGraphicsPreset(preset: "low" | "medium" | "high"): void {
    this.currentPresetConfig = getGraphicsPresetConfig(preset);
    this.sunLight.castShadow = this.currentPresetConfig.enableShadows;
    this.setupSunShadows();
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      (this.sunLight.shadow.map as any) = null;
    }
  }

  public updateWindTime(deltaTime: number): void {
    this.windUniforms.uWindTime.value += deltaTime;
    TreeFactory.updateWind(
      this.windUniforms.uWindTime.value,
      this.currentSettings.windSpeed,
      this.currentSettings.windDirection,
      this.currentSettings.windGustiness
    );
  }

  public registerWindMaterial(mat: THREE.ShaderMaterial): () => void {
    this.registeredMaterials.add(mat);
    mat.uniforms.uWindTime = this.windUniforms.uWindTime;
    mat.uniforms.uWindSpeed = this.windUniforms.uWindSpeed;
    mat.uniforms.uWindDirection = this.windUniforms.uWindDirection;
    mat.uniforms.uWindGustiness = this.windUniforms.uWindGustiness;

    return () => {
      this.registeredMaterials.delete(mat);
    };
  }

  // --- Static Helper Functions ---

  public static calculateSunCoordinates(
    elevationDegrees: number,
    azimuthDegrees: number,
    distance = 30
  ): [number, number, number] {
    const el = (elevationDegrees * Math.PI) / 180;
    const az = (azimuthDegrees * Math.PI) / 180;
    const y = distance * Math.sin(el);
    const x = distance * Math.cos(el) * Math.sin(az);
    const z = distance * Math.cos(el) * Math.cos(az);
    return [x, y, z];
  }

  public static calculateAnglesFromCoordinates(
    position: [number, number, number]
  ): { elevation: number; azimuth: number; distance: number } {
    const [x, y, z] = position;
    const distance = Math.sqrt(x * x + y * y + z * z);
    if (distance === 0) return { elevation: 0, azimuth: 0, distance: 0 };

    const elevation = (Math.asin(Math.max(-1, Math.min(1, y / distance))) * 180) / Math.PI;
    let azimuth = (Math.atan2(x, z) * 180) / Math.PI;
    if (azimuth < 0) azimuth += 360;

    return { elevation, azimuth, distance };
  }

  public static lerpEnvironment(
    envA: EnvironmentSettings,
    envB: EnvironmentSettings,
    alpha: number
  ): EnvironmentSettings {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const lerpArr = (
      a: [number, number, number],
      b: [number, number, number]
    ): [number, number, number] => [
      a[0] + (b[0] - a[0]) * clampedAlpha,
      a[1] + (b[1] - a[1]) * clampedAlpha,
      a[2] + (b[2] - a[2]) * clampedAlpha,
    ];

    const lerpColor = (c1: string, c2: string): string => {
      const colA = new THREE.Color(c1);
      const colB = new THREE.Color(c2);
      colA.lerp(colB, clampedAlpha);
      return `#${colA.getHexString()}`;
    };

    // Shortest angular arc for wind direction
    const diff = ((((envB.windDirection - envA.windDirection) % 360) + 540) % 360) - 180;
    const windDirection = (envA.windDirection + diff * clampedAlpha + 360) % 360;

    return {
      preset: clampedAlpha > 0.5 ? envB.preset : envA.preset,
      timeOfDay:
        (envA.timeOfDay ?? 12) +
        ((envB.timeOfDay ?? 12) - (envA.timeOfDay ?? 12)) * clampedAlpha,
      sunPosition: lerpArr(
        envA.sunPosition as [number, number, number],
        envB.sunPosition as [number, number, number]
      ),
      sunIntensity:
        envA.sunIntensity + (envB.sunIntensity - envA.sunIntensity) * clampedAlpha,
      sunColor: lerpColor(envA.sunColor, envB.sunColor),
      ambientColor: lerpColor(envA.ambientColor, envB.ambientColor),
      ambientIntensity:
        envA.ambientIntensity +
        (envB.ambientIntensity - envA.ambientIntensity) * clampedAlpha,
      skyColor: lerpColor(envA.skyColor, envB.skyColor),
      groundColor: lerpColor(envA.groundColor, envB.groundColor),
      windSpeed: envA.windSpeed + (envB.windSpeed - envA.windSpeed) * clampedAlpha,
      windDirection,
      windGustiness:
        envA.windGustiness + (envB.windGustiness - envA.windGustiness) * clampedAlpha,
      grassDensity: clampedAlpha > 0.5 ? envB.grassDensity : envA.grassDensity,
    };
  }

  public dispose(): void {
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
    }
    this.registeredMaterials.clear();
  }
}
