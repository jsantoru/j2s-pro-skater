import { canvasMap } from './materials.js';

// Original, tileable surface art. Metre-scale UVs and a slower world-space
// colour variation keep aggregate from looking like stretched photographic noise.
export function riverwaySurface(kind) {
  const bases = { grass: [91, 106, 62], concrete: [169, 167, 151], asphalt: [70, 74, 73], road: [62, 66, 66], steel: [99, 70, 50] };
  const base = bases[kind];
  return canvasMap((c, s, r) => {
    const pixels = c.createImageData(s, s);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const n = (r() - .5) * (kind === 'grass' ? 31 : 22);
      for (let k = 0; k < 3; k++) pixels.data[i + k] = base[k] + n;
      pixels.data[i + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
    const cloudy = (count, rgb, opacity, radius) => {
      for (let i = 0; i < count; i++) {
        const x = r() * s, y = r() * s, rad = radius * (.4 + r());
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
          const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          g.addColorStop(0, `rgba(${rgb},${opacity})`); g.addColorStop(1, `rgba(${rgb},0)`);
          c.fillStyle = g; c.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        }
      }
    };
    cloudy(34, kind === 'grass' ? '154,143,75' : '52,49,43', kind === 'grass' ? .05 : .022, s * .08);
    cloudy(22, '224,216,182', .025, s * .07);
    if (kind === 'grass') {
      for (let i = 0; i < 46000; i++) {
        const x = r() * s, y = r() * s;
        c.strokeStyle = ['#b4b47766', '#4d623ca0', '#82925799', '#b2a67255'][i % 4];
        c.lineWidth = .55 + r() * .9; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 1 + r() * 2, y - 2 - r() * 5); c.stroke();
      }
    } else if (kind === 'concrete') {
      // Faint shuttering courses and filled tie holes, not painted-on stripes.
      for (let y = 0; y < s; y += 256) {
        c.fillStyle = '#353c3026'; c.fillRect(0, y, s, 1.1);
        c.fillStyle = '#f4e8c422'; c.fillRect(0, y + 2, s, 1);
        for (let x = 128; x < s; x += 256) {
          c.fillStyle = '#64655955'; c.beginPath(); c.ellipse(x, y + 115, 3.2, 3.2, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#b3b0a066'; c.beginPath(); c.arc(x + .6, y + 115, 2, 0, Math.PI * 2); c.fill();
        }
      }
      for (let i = 0; i < 180; i++) {
        c.fillStyle = '#5353430a'; c.fillRect(r() * s, r() * s, 1 + r() * 5, 12 + r() * 110);
      }
    } else {
      for (let i = 0; i < 23000; i++) {
        c.fillStyle = i % 3 ? '#beb9a62b' : '#131b2240';
        c.fillRect(r() * s, r() * s, .5 + r() * 1.8, .5 + r() * 1.8);
      }
    }
  }, 1024);
}

// Fragment noise is low frequency. The shared texture supplies close detail.
export function varySurface(material, strength = .13) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vRiverwayPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRiverwayPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vRiverwayPosition;
      float riverwayHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
      float riverwayNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(riverwayHash(i),riverwayHash(i+vec2(1,0)),f.x),mix(riverwayHash(i+vec2(0,1)),riverwayHash(i+vec2(1,1)),f.x),f.y); }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float weather = riverwayNoise(vRiverwayPosition.xz * .29) * .65 + riverwayNoise(vRiverwayPosition.xz * 1.17) * .35;
      diffuseColor.rgb *= 1.0 + (weather - .5) * ${strength.toFixed(3)};`);
  };
  material.customProgramCacheKey = () => 'riverway-surface-1-' + strength;
  return material;
}
