import * as THREE from "three";

export const GRASS_VERTEX_SHADER = /* glsl */ `
  // Custom Instanced Attributes (12 floats = 48 bytes per blade)
  attribute vec3 instanceOffset;
  attribute vec3 instanceScale;
  attribute vec3 instanceRotation; // [pitch, yaw, roll]
  attribute vec3 instanceBladeTint;

  // Environment & Wind Simulation Uniforms
  uniform float uTime;
  uniform float uWindSpeed;       // 0.0 - 15.0 m/s
  uniform float uWindDirection;   // 0.0 - 360.0 degrees
  uniform float uWindGustiness;   // 0.0 - 1.0
  uniform float uBladeHeight;     // Nominal height, e.g. 0.6m

  // Varyings to Fragment Shader
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vBladeTint;
  varying float vHeightPercent;

  const float PI = 3.141592653589793;

  mat3 rotateY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c
    );
  }

  mat3 rotateX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
      1.0, 0.0, 0.0,
      0.0, c, -s,
      0.0, s, c
    );
  }

  mat3 rotateZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
      c, -s, 0.0,
      s, c, 0.0,
      0.0, 0.0, 1.0
    );
  }

  void main() {
    vUv = uv;
    vBladeTint = instanceBladeTint;
    vHeightPercent = uv.y;

    // 1. Local vertex scale
    vec3 scaledPos = position * instanceScale;

    // 2. Local orientation rotation (Yaw + subtle Pitch/Roll)
    mat3 rotMatrix = rotateY(instanceRotation.y) * rotateX(instanceRotation.x) * rotateZ(instanceRotation.z);
    vec3 rotatedPos = rotMatrix * scaledPos;
    vec3 rotatedNormal = rotMatrix * normal;

    // 3. World anchor coordinates of blade root
    vec3 anchorPos = instanceOffset;
    float totalBladeHeight = max(0.05, uBladeHeight * instanceScale.y);

    // 4. Dynamic Multi-Octave Wind Simulation
    vec3 displacement = vec3(0.0);

    if (uv.y > 0.001 && uWindSpeed > 0.001) {
      float rad = uWindDirection * (PI / 180.0);
      float dirX = cos(rad);
      float dirZ = sin(rad);

      // Wave 1: Primary traveling wave swell
      float wave1 = sin(anchorPos.x * 0.4 * dirX + anchorPos.z * 0.4 * dirZ - uTime * uWindSpeed * 0.5);

      // Wave 2: Orthogonal cross-wave for 2D turbulence
      float wave2 = sin(-anchorPos.x * 0.3 * dirZ + anchorPos.z * 0.3 * dirX - uTime * uWindSpeed * 0.8) * 0.5;

      // Micro flutter (high-frequency leaf rustle)
      float flutter = sin(uTime * 18.0 + anchorPos.x * 2.0 + anchorPos.z * 2.0) * 0.15;

      // Turbulent gust envelope multiplier
      float gust = 1.0 + uWindGustiness * sin(uTime * 0.7 + (anchorPos.x + anchorPos.z) * 0.1);

      // Tip deflection curve: flex = (uv.y)^1.8 (zero displacement at root uv.y = 0)
      float flex = pow(uv.y, 1.8);
      float totalSwayMagnitude = (wave1 + wave2 + flutter) * gust * (uWindSpeed / 10.0) * flex * 0.35;

      float dx = totalSwayMagnitude * dirX;
      float dz = totalSwayMagnitude * dirZ;

      // Length conservation constraint: dy = -(dx^2 + dz^2) / (2 * H)
      float horizDistSq = dx * dx + dz * dz;
      float dy = -horizDistSq / (2.0 * totalBladeHeight);

      displacement = vec3(dx, dy, dz);
    }

    // 5. Apply displacement in local space
    vec3 finalLocalPos = rotatedPos + displacement;
    vec4 worldPos = modelMatrix * vec4(anchorPos + finalLocalPos, 1.0);
    vWorldPosition = worldPos.xyz;

    // Normal bending: rotate normal along bending vector
    vNormal = normalize(normalMatrix * normalize(rotatedNormal + displacement * 0.8));

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const GRASS_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform vec3 uBaseColor;      // Deep root tint (default: #15803D)
  uniform vec3 uTipColor;       // Sunlit tip tint (default: #7CC832)
  uniform float uEnableSSS;     // 1.0 = enabled, 0.0 = disabled
  uniform float uTranslucency;  // SSS intensity (default: 0.7)

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vBladeTint;
  varying float vHeightPercent;

  void main() {
    // 1. Vertical Color Gradient: Dark Root -> Mid Spine -> Sunlit Apex
    vec3 rootColor = uBaseColor * 0.45;
    vec3 midColor = uBaseColor * 1.15;
    vec3 tipApexColor = uTipColor * 1.1;

    vec3 albedo;
    if (vHeightPercent < 0.65) {
      albedo = mix(rootColor, midColor, smoothstep(0.0, 0.65, vHeightPercent));
    } else {
      albedo = mix(midColor, tipApexColor, smoothstep(0.65, 1.0, vHeightPercent));
    }

    // Apply per-blade instance tint
    albedo *= vBladeTint;

    // 2. Simulated Ambient Occlusion at Ground Base (roots in shadow)
    float ao = clamp(pow(vHeightPercent, 0.45) * 0.85 + 0.15, 0.15, 1.0);

    // 3. Double-Sided Surface Normal Correction
    vec3 normal = normalize(vNormal);
    if (!gl_FrontFacing) {
      normal = -normal;
    }

    // 4. Directional Sun Lighting with Wrapped Diffuse
    vec3 lightDir = normalize(uSunPosition - vWorldPosition);
    float NdotL = max(0.0, (dot(normal, lightDir) + 0.3) / 1.3);
    vec3 directSunDiffuse = uSunColor * uSunIntensity * NdotL * ao;

    // 5. Ambient Fill Lighting
    vec3 ambientLight = uAmbientColor * uAmbientIntensity * ao;

    // 6. Subsurface Scattering (SSS) Backlight Transmission
    vec3 sssColor = vec3(0.0);
    if (uEnableSSS > 0.5) {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      // Backlight: camera views blade against sun (-lightDir . viewDir)
      float backlight = max(0.0, dot(-lightDir, viewDir));
      float sssTerm = pow(backlight, 3.0) * uTranslucency;
      float sssMask = smoothstep(0.2, 0.95, vHeightPercent);
      vec3 chlorophyllGlow = vec3(0.6, 0.9, 0.2);
      sssColor = uSunColor * chlorophyllGlow * sssTerm * sssMask * uSunIntensity;
    }

    // 7. Final Composite Color
    vec3 finalColor = albedo * (ambientLight + directSunDiffuse) + sssColor;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export interface GrassShaderUniforms {
  uTime: { value: number };
  uWindSpeed: { value: number };
  uWindDirection: { value: number };
  uWindGustiness: { value: number };
  uBladeHeight: { value: number };
  uSunPosition: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunIntensity: { value: number };
  uAmbientColor: { value: THREE.Color };
  uAmbientIntensity: { value: number };
  uBaseColor: { value: THREE.Color };
  uTipColor: { value: THREE.Color };
  uEnableSSS: { value: number };
  uTranslucency: { value: number };
  [uniform: string]: THREE.IUniform;
}

export function createGrassUniforms(initialValues?: Partial<Record<string, unknown>>): GrassShaderUniforms {
  return {
    uTime: { value: (initialValues?.uTime as number) ?? 0.0 },
    uWindSpeed: { value: (initialValues?.uWindSpeed as number) ?? 3.0 },
    uWindDirection: { value: (initialValues?.uWindDirection as number) ?? 45.0 },
    uWindGustiness: { value: (initialValues?.uWindGustiness as number) ?? 0.4 },
    uBladeHeight: { value: (initialValues?.uBladeHeight as number) ?? 0.6 },
    uSunPosition: { value: (initialValues?.uSunPosition as THREE.Vector3) ?? new THREE.Vector3(15, 25, 15) },
    uSunColor: { value: (initialValues?.uSunColor as THREE.Color) ?? new THREE.Color("#FFF8E7") },
    uSunIntensity: { value: (initialValues?.uSunIntensity as number) ?? 1.5 },
    uAmbientColor: { value: (initialValues?.uAmbientColor as THREE.Color) ?? new THREE.Color("#B0C4DE") },
    uAmbientIntensity: { value: (initialValues?.uAmbientIntensity as number) ?? 0.6 },
    uBaseColor: { value: (initialValues?.uBaseColor as THREE.Color) ?? new THREE.Color("#15803D") },
    uTipColor: { value: (initialValues?.uTipColor as THREE.Color) ?? new THREE.Color("#7CC832") },
    uEnableSSS: { value: (initialValues?.uEnableSSS as number) ?? 1.0 },
    uTranslucency: { value: (initialValues?.uTranslucency as number) ?? 0.7 },
  };
}

export function createGrassMaterial(uniforms?: GrassShaderUniforms): THREE.ShaderMaterial {
  const activeUniforms = uniforms ?? createGrassUniforms();

  return new THREE.ShaderMaterial({
    vertexShader: GRASS_VERTEX_SHADER,
    fragmentShader: GRASS_FRAGMENT_SHADER,
    uniforms: activeUniforms,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
}

/**
 * CPU evaluation function matching vertex shader math for verification and test suites.
 */
export function evaluateWindDisplacement(
  position: [number, number, number],
  uvY: number,
  time: number,
  windSpeed: number,
  windDirectionDegrees: number,
  gustiness: number,
  bladeHeight = 0.6
): { displacement: [number, number, number]; preservedHeightDelta: number } {
  if (uvY <= 0 || windSpeed <= 0) {
    return { displacement: [0, 0, 0], preservedHeightDelta: 0 };
  }

  const rad = (windDirectionDegrees * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirZ = Math.sin(rad);

  const wave1 = Math.sin(position[0] * 0.4 * dirX + position[2] * 0.4 * dirZ - time * windSpeed * 0.5);
  const wave2 = Math.sin(-position[0] * 0.3 * dirZ + position[2] * 0.3 * dirX - time * windSpeed * 0.8) * 0.5;
  const flutter = Math.sin(time * 18.0) * 0.15;
  const gust = 1.0 + gustiness * Math.sin(time * 0.7);

  const flex = Math.pow(uvY, 1.8);
  const totalSwayMagnitude = (wave1 + wave2 + flutter) * gust * (windSpeed / 10.0) * flex * 0.35;

  const dx = totalSwayMagnitude * dirX;
  const dz = totalSwayMagnitude * dirZ;

  const horizontalDistanceSquared = dx * dx + dz * dz;
  const preservedHeightDelta = -horizontalDistanceSquared / (2 * bladeHeight);

  return {
    displacement: [dx, preservedHeightDelta, dz],
    preservedHeightDelta,
  };
}
