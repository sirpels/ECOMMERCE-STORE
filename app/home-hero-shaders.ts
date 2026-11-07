export const homeHeroVertexShader = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const homeHeroFragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  float time = u_time * 0.16;
  float mouseInfluence = exp(-length(p - u_mouse) * 3.2);
  p += normalize(p - u_mouse + vec2(0.0001)) * mouseInfluence * 0.035;

  float foldA = sin(p.x * 2.0 + sin(p.y * 1.7 + time) * 0.8 - time);
  float foldB = cos(p.y * 2.5 - p.x * 1.15 + sin(p.x * 1.3 + time * 0.7));
  float folds = 0.5 + 0.5 * sin(p.x * 2.1 + p.y * 0.85 + foldA * 0.95 + foldB * 0.4 + time);
  float amberLight = smoothstep(0.68, 0.98, folds + 0.08 * sin(p.y * 2.8 - time));
  float copperLight = smoothstep(0.22, 0.82, folds);

  vec3 burgundy = vec3(0.18, 0.035, 0.075);
  vec3 wine = vec3(0.36, 0.055, 0.10);
  vec3 copper = vec3(0.64, 0.19, 0.095);
  vec3 amber = vec3(0.96, 0.47, 0.16);
  vec3 colour = mix(burgundy, wine, copperLight * 0.8);
  colour = mix(colour, copper, copperLight * 0.52);
  colour = mix(colour, amber, amberLight * 0.46);
  colour *= 0.88 + 0.12 * sin(p.y * 1.9 + foldA + time * 0.45);

  gl_FragColor = vec4(colour * 0.84, 0.84);
}
`;
