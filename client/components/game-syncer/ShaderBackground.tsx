import React, { useEffect, useRef } from 'react';

const ShaderBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;

    function syncSize() {
      const w = canvas?.clientWidth || 1280;
      const h = canvas?.clientHeight || 720;
      if (canvas && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(canvas);
    }
    syncSize();

    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return;
    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
    const fs = `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

varying vec2 v_texCoord;

// Helper for hex coordinates
vec2 get_hex_coords(vec2 uv) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    return dot(a, a) < dot(b, b) ? a : b;
}

float hex_dist(vec2 p) {
    p = abs(p);
    return max(p.x, dot(p, normalize(vec2(1.0, 1.7320508))));
}

void main() {
    // Correct for aspect ratio to prevent stretching
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (v_texCoord - 0.5) * aspect;
    
    // Normalize mouse coordinates correctly with aspect ratio
    vec2 mouse_norm = (u_mouse / u_resolution - 0.5) * aspect;
    
    // Parallax effect: shift the entire coordinate system slightly based on mouse
    vec2 shift = mouse_norm * 0.05;
    uv += shift;

    // Scale for hex size - adjusted for aspect ratio consistency
    float scale = 12.0;
    vec2 p = uv * scale;
    
    // Get hex grid info
    vec2 hex_p = get_hex_coords(p);
    vec2 hex_id = p - hex_p;
    
    // Mouse repulsion logic
    float d_to_mouse = length(hex_id - (mouse_norm + shift) * scale);
    float repulsion = smoothstep(2.5, 0.0, d_to_mouse);
    
    // Adjust hex position based on repulsion
    vec2 offset = normalize(hex_id - (mouse_norm + shift) * scale) * repulsion * 0.4;
    
    // Handle the case where the mouse is exactly on the hex center
    if (d_to_mouse < 0.001) offset = vec2(0.0);
    
    hex_p -= offset;
    
    // Hex shape
    float d = hex_dist(hex_p);
    float mask = smoothstep(0.45, 0.43, d);
    float border = smoothstep(0.48, 0.46, d) - mask;
    
    // Coloring
    vec3 color_a = vec3(0.545, 0.361, 0.965); // #8b5cf6 (Primary)
    vec3 color_b = vec3(0.192, 0.224, 0.302); // #31394d (Surface Bright)
    vec3 bg_color = vec3(0.043, 0.075, 0.149); // #0b1326 (Surface)
    
    // Variation based on hex ID
    float rnd = fract(sin(dot(hex_id, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 hex_color = mix(color_a, color_b, rnd);
    
    // Apply mouse glow/interaction
    hex_color += vec3(0.2, 0.1, 0.4) * repulsion;
    
    vec3 final_color = mix(bg_color, hex_color * 0.6, mask);
    final_color += color_a * border * 0.5; // Subtle border glow
    
    // Vignette - also aspect-aware for uniform feel
    float vig = smoothstep(1.2, 0.1, length(v_texCoord - 0.5));
    final_color *= vig;

    gl_FragColor = vec4(final_color, 1.0);
}`;
    function cs(type: number, src: string) {
      const s = gl?.createShader(type);
      if (!s) return null;
      gl?.shaderSource(s, src);
      gl?.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    if (!prog) return;
    const vShader = cs(gl.VERTEX_SHADER, vs);
    const fShader = cs(gl.FRAGMENT_SHADER, fs);
    if (vShader) gl.attachShader(prog, vShader);
    if (fShader) gl.attachShader(prog, fShader);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    
    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * canvas.width;
        mouse.y = ny * canvas.height;
      }
    };
    
    window.addEventListener('mousemove', onMouseMove);

    function render(t: number) {
      if (!canvas || !gl) return;
      if (typeof ResizeObserver === 'undefined') syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    }
    render(0);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full -z-10" style={{ display: 'block' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} width="1280" height="1024" />
    </div>
  );
};

export default ShaderBackground;
