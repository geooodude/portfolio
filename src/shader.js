/** Renders fractal to texture; second pass displaces plane by luma (see Main). */
/** No texture in vertex stage — many WebGL devices lack vertex texture fetch (black screen if sampled here). */
export const EMBOSS_DISPLAY_VERTEX = `
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const EMBOSS_DISPLAY_FRAGMENT = `
precision highp float;

uniform sampler2D fractalMap;
uniform vec3 lightDir;
uniform vec3 uCameraPosition;
uniform vec2 fractalTexel;
uniform vec2 pixelUv;
uniform float depthScale;
uniform float invertDepth;
uniform float audioPulse;
uniform float beat;

varying vec2 vUv;
varying vec3 vWorldPos;

float fractalLuma(vec2 u) {
  vec3 c = texture2D(fractalMap, u).rgb;
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  if (invertDepth > 0.5) y = 1.0 - y;
  return y;
}

// 4×4 Bayer threshold for bitmap / ordered dither (values 0–15)
float bayer16(vec2 fc) {
  float x = mod(floor(fc.x), 4.0);
  float y = mod(floor(fc.y), 4.0);
  if (x < 0.5) {
    if (y < 0.5) return 0.0;
    if (y < 1.5) return 8.0;
    if (y < 2.5) return 2.0;
    return 10.0;
  } else if (x < 1.5) {
    if (y < 0.5) return 12.0;
    if (y < 1.5) return 4.0;
    if (y < 2.5) return 14.0;
    return 6.0;
  } else if (x < 2.5) {
    if (y < 0.5) return 3.0;
    if (y < 1.5) return 11.0;
    if (y < 2.5) return 1.0;
    return 9.0;
  } else {
    if (y < 0.5) return 15.0;
    if (y < 1.5) return 7.0;
    if (y < 2.5) return 13.0;
    return 5.0;
  }
}

void main() {
  float pulse = 1.0 + beat * 0.12 + audioPulse * 0.08;
  vec2 pu = max(pixelUv, fractalTexel);
  vec2 su = floor(vUv / pu) * pu + pu * 0.5;
  su = clamp(su, pu * 0.5, vec2(1.0) - pu * 0.5);

  float h0 = fractalLuma(su);
  vec2 hxUv = clamp(su + vec2(pu.x, 0.0), pu * 0.5, vec2(1.0) - pu * 0.5);
  vec2 hyUv = clamp(su + vec2(0.0, pu.y), pu * 0.5, vec2(1.0) - pu * 0.5);
  float hx = fractalLuma(hxUv);
  float hy = fractalLuma(hyUv);
  float bump = depthScale * pulse * 26.0;
  vec3 n = normalize(vec3((h0 - hx) * bump, (h0 - hy) * bump, 1.0));
  vec3 alb = texture2D(fractalMap, su).rgb;

  vec3 L = normalize(lightDir);
  vec3 V = normalize(uCameraPosition - vWorldPos);
  vec3 H = normalize(L + V);

  float NdotL = max(dot(n, L), 0.0);
  float diff = NdotL;
  float NdotH = max(dot(n, H), 0.0);
  float glossMix = clamp(audioPulse * 0.35 + beat * 0.25, 0.0, 1.0);
  float gloss = mix(22.0, 52.0, glossMix);
  float spec = pow(NdotH, gloss);
  float sheenBoost = 0.06 + audioPulse * 0.1 + beat * 0.12;
  vec3 specTint = vec3(0.88, 0.9, 0.95);
  vec3 specCol = specTint * spec * sheenBoost;

  float NdotV = max(dot(n, V), 0.001);
  float fresnel = pow(1.0 - NdotV, 3.2);
  vec3 metalHi = vec3(0.55, 0.62, 0.72);
  vec3 metalLo = vec3(0.04, 0.05, 0.07);
  vec3 metal = mix(metalLo, metalHi, fresnel);

  vec3 lit = alb * (0.04 + 0.96 * diff);
  lit += specCol;
  lit += metal * (0.06 + fresnel * 0.14);

  float slope = abs(h0 - hx) + abs(h0 - hy);
  float contour = smoothstep(0.04, 0.0, abs(fract(h0 * 22.0 + 0.5) - 0.5));
  lit *= 1.0 - contour * 0.5;
  lit += slope * 0.55 * (0.2 + diff * 0.35);

  vec2 fc = gl_FragCoord.xy;
  float bn = bayer16(fc) / 16.0 - 0.5;
  float bnG = bayer16(fc + vec2(1.7, 3.1)) / 16.0 - 0.5;
  float bnB = bayer16(fc + vec2(4.2, 1.3)) / 16.0 - 0.5;
  float levels = mix(3.0, 6.0, 0.45 + audioPulse * 0.35);
  float dthr = 1.15 / levels;
  float j = fract(sin(dot(fc, vec2(127.1, 311.7))) * 43758.5453) - 0.5;
  float dmix = dthr * 6.0;
  float jmix = j * dthr * 2.5;
  float qR = lit.r * levels + 0.5 + bn * dmix + jmix;
  float qG = lit.g * levels + 0.5 + bnG * dmix + jmix;
  float qB = lit.b * levels + 0.5 + bnB * dmix + jmix;
  lit = vec3(floor(qR), floor(qG), floor(qB)) / levels;

  float grain = fract(sin(dot(fc + vec2(19.1, 47.3), vec2(12.9898, 78.233))) * 43758.5453);
  lit += (grain - 0.5) * 0.055;

  gl_FragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
}
`;

export const FRAGMENT_SHADER = 
`
precision highp float;

// ==============
// === WINDOW ===
// ==============

uniform vec2 res;
uniform float aspect;
uniform float zoom;
uniform vec2 offset;
uniform float pixelSize;
uniform int color_scheme;

// ======================
// === GUI PARAMETERS ===
// ======================

uniform float a;
uniform float b;
uniform float c;
uniform float d;
uniform float e;
uniform float f;

// =================================
// === COMPLEX NUMBER OPERATIONS ===
// =================================

vec2 cm (vec2 a, vec2 b) {
  return vec2(a.x*b.x - a.y*b.y, a.x*b.y + b.x*a.y);
}

vec2 conj (vec2 a) {
  return vec2(a.x, -a.y);
}

// =====================
// === COLOR SCHEMES ===
// =====================

/// s: always between 0.0 and 1.0
vec4 basic_colormap(float s, vec3 shade) {
  vec3 coord = vec3(s, s, s);
  return vec4(pow(coord, shade), 1.0);
}

vec4 custom_colormap_1(float s) {
  vec3 color_1 = vec3(0.22, 0.07, 0.08);
  vec3 color_2 = vec3(0.29, 0.08, 0.08);
  vec3 color_3 = vec3(0.49, 0.11, 0.09);
  vec3 color_4 = vec3(0.66, 0.26, 0.14);
  vec3 color_5 = vec3(0.78, 0.47, 0.24);
  vec3 color_6 = vec3(0.87, 0.72, 0.39);
  vec3 color_7 = vec3(0.9, 0.87, 0.55);
  vec3 color_8 = vec3(0.85, 0.96, 0.67);

  vec3 color;

  if (s < 0.143) {
    float x = 7.0 * s;
    color = (1.0 - x) * color_1 + x * color_2;
  }
  else if (s < 0.286) {
    float x = 7.0 * (s - 0.143);
    color = (1.0 - x) * color_2 + x * color_3;
  }
  else if (s < 0.423) {
    float x = 7.0 * (s - 0.286);
    color = (1.0 - x) * color_3 + x * color_4;
  }
  else if (s < 0.571) {
    float x = 7.0 * (s - 0.423);
    color = (1.0 - x) * color_4 + x * color_5;
  }
  else if (s < 0.714) {
    float x = 7.0 * (s - 0.571);
    color = (1.0 - x) * color_5 + x * color_6;
  }
  else if (s < 0.857) {
    float x = 7.0 * (s - 0.714);
    color = (1.0 - x) * color_6 + x * color_7;
  }
  else {
    float x = 7.0 * (s - 0.857);
    color = (1.0 - x) * color_7 + x * color_8;
  }

  return vec4(color, 1.0);
}

vec4 custom_colormap_2(float s) {
  vec3 color_1 = vec3(0.04, 0.08, 0.09);
  vec3 color_2 = vec3(0.06, 0.26, 0.33);
  vec3 color_3 = vec3(0.14, 0.35, 0.61);
  vec3 color_4 = vec3(0.30, 0.37, 0.80);
  vec3 color_5 = vec3(0.43, 0.40, 0.86);
  vec3 color_6 = vec3(0.55, 0.44, 0.91);
  vec3 color_7 = vec3(0.78, 0.56, 0.96);
  vec3 color_8 = vec3(0.97, 0.86, 0.98);

  vec3 color;

  if (s < 0.143) {
    float x = 7.0 * s;
    color = (1.0 - x) * color_1 + x * color_2;
  }
  else if (s < 0.286) {
    float x = 7.0 * (s - 0.143);
    color = (1.0 - x) * color_2 + x * color_3;
  }
  else if (s < 0.423) {
    float x = 7.0 * (s - 0.286);
    color = (1.0 - x) * color_3 + x * color_4;
  }
  else if (s < 0.571) {
    float x = 7.0 * (s - 0.423);
    color = (1.0 - x) * color_4 + x * color_5;
  }
  else if (s < 0.714) {
    float x = 7.0 * (s - 0.571);
    color = (1.0 - x) * color_5 + x * color_6;
  }
  else if (s < 0.857) {
    float x = 7.0 * (s - 0.714);
    color = (1.0 - x) * color_6 + x * color_7;
  }
  else {
    float x = 7.0 * (s - 0.857);
    color = (1.0 - x) * color_7 + x * color_8;
  }

  return vec4(color, 1.0);
}

vec4 custom_colormap_3(float s) {
  vec3 color_1 = vec3(0.27, 0.0, 0.19);
  vec3 color_2 = vec3(0.43, 0.02, 0.45);
  vec3 color_3 = vec3(0.55, 0.06, 0.7);
  vec3 color_4 = vec3(0.65, 0.16, 0.93);
  vec3 color_5 = vec3(0.68, 0.42, 0.98);
  vec3 color_6 = vec3(0.73, 0.61, 0.99);
  vec3 color_7 = vec3(0.77, 0.81, 0.96);
  vec3 color_8 = vec3(0.92, 0.91, 1.0);

  vec3 color;

  if (s < 0.143) {
    float x = 7.0 * s;
    color = (1.0 - x) * color_1 + x * color_2;
  }
  else if (s < 0.286) {
    float x = 7.0 * (s - 0.143);
    color = (1.0 - x) * color_2 + x * color_3;
  }
  else if (s < 0.423) {
    float x = 7.0 * (s - 0.286);
    color = (1.0 - x) * color_3 + x * color_4;
  }
  else if (s < 0.571) {
    float x = 7.0 * (s - 0.423);
    color = (1.0 - x) * color_4 + x * color_5;
  }
  else if (s < 0.714) {
    float x = 7.0 * (s - 0.571);
    color = (1.0 - x) * color_5 + x * color_6;
  }
  else if (s < 0.857) {
    float x = 7.0 * (s - 0.714);
    color = (1.0 - x) * color_6 + x * color_7;
  }
  else {
    float x = 7.0 * (s - 0.857);
    color = (1.0 - x) * color_7 + x * color_8;
  }

  return vec4(color, 1.0);
}

// ============
// === MAIN ===
// ============

float mandelbrot(vec2 point){
    float alpha = 1.0;
    vec2 z = vec2(0.0, 0.0);
    vec2 z_0;
    vec2 z_1;

    // i < max iterations
    for (int i=0; i < 200; i++){
        z_1 = z_0;
        z_0 = z;

        // ===============================
        // =========== CACHING ===========
        // ===============================
        float x_0_sq = z_0.x*z_0.x;
        float y_0_sq = z_0.y*z_0.y;
        vec2 z_0_sq = vec2(x_0_sq - y_0_sq, 2.0*z_0.x*z_0.y);
        vec2 z_0_conj = conj(z_0);
        
        float x_1_sq = z_1.x*z_1.x;
        float y_1_sq = z_1.y*z_1.y;
        vec2 z_1_sq = vec2(x_1_sq - y_1_sq, 2.0*z_1.x*z_1.y);
        vec2 z_1_conj = conj(z_1);
        
        // ===============================
        // ===== RECURRENCE RELATION =====
        // ===============================
        z = z_0_sq + point;
        z = z + a * z_0_conj + b * z_1_conj + c * z_0_sq * z_1;
        z = z + d * cm(z_0_sq, z_0) + e * cm(z_0, z_1_conj) + f * cm(z_0_sq, z_1);

        //z = z + a * z_1 * x_0_sq + b * z_0 * x_1_sq + c * cm(z_0_sq, z_1) + d * cm(z_0, z_1_conj);
        //z = z + a * z_1_conj + b * cm(z_1, z_0) + c * z_0_sq * z_1 + d * z_0 * z_1_conj;
        //z = z + a * z_0_conj + b * z_1_conj + c * cm(z_1, z_0) + d * z_0_sq * z_1;
        //z = z + a * z_0_conj + b * cm(z_0_sq, z_0_conj) + c * cm(z_0_conj, z_0_conj) + d * cm(z_0_sq, z_0);

        float z_0_mag = x_0_sq + y_0_sq;
        float z_1_mag = x_1_sq + y_1_sq;

        if(z_0_mag > 15.0) {
            float frac = (15.0 - z_1_mag) / (z_0_mag - z_1_mag);
            alpha = (float(i) + frac)/200.0; // should be same as max iterations
            break;
        }
    }

    // in interval [0, 1]
    return alpha;
}

void main(){
    float ps = max(pixelSize, 1.0);
    vec2 pc = floor(gl_FragCoord.xy / ps) * ps + ps * 0.5;
    vec2 uv = zoom * vec2(aspect, 1.0) * pc / res + offset;
    float s = 1.0 - mandelbrot(uv);


    if (color_scheme == 0) {
      vec3 shade = vec3(5.38, 6.15, 3.85);
      gl_FragColor = basic_colormap(s, shade);
    }
    else if (color_scheme == 1) {
      vec3 shade = vec3(7.0, 3.0, 2.0);
      gl_FragColor = basic_colormap(s, shade);
    }
    else if (color_scheme == 2) {
      gl_FragColor = custom_colormap_1(pow(s, 6.0));
    }
    else if (color_scheme == 3) {
      gl_FragColor = custom_colormap_2(pow(s, 6.0));
    }
    else {
      gl_FragColor = custom_colormap_3(pow(s, 6.0));
    }
}
`