// Rendu : WebGL2, PBR, tone mapping, ombres dynamiques, post-process (GTAO, bloom, SMAA, étalonnage).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setAnisotropy } from './assets.js';

export const PRESETS = {
  low:    { pixelRatio: 0.75, shadow: 1024, shadowRange: 70,  ao: false, bloom: false, smaa: false, aniso: 4,  drawDist: 260, npc: 18, traffic: 10 },
  medium: { pixelRatio: 1.0,  shadow: 2048, shadowRange: 90,  ao: false, bloom: true,  smaa: true,  aniso: 8,  drawDist: 380, npc: 30, traffic: 16 },
  high:   { pixelRatio: 1.0,  shadow: 4096, shadowRange: 110, ao: true,  bloom: true,  smaa: true,  aniso: 16, drawDist: 520, npc: 44, traffic: 22 },
  ultra:  { pixelRatio: 1.5,  shadow: 4096, shadowRange: 140, ao: true,  bloom: true,  smaa: true,  aniso: 16, drawDist: 700, npc: 60, traffic: 28 },
};

// Étalonnage final : légère courbe en S, saturation, vignette et grain de film (appliqué après le tone mapping).
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uSat: { value: 1.06 }, uWarm: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uVignette,uSat,uWarm; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      float l=dot(c.rgb,vec3(.2126,.7152,.0722));
      c.rgb=mix(vec3(l),c.rgb,uSat);
      c.rgb=mix(c.rgb, c.rgb*c.rgb*(3.-2.*c.rgb), .18);
      c.rgb*=vec3(1.+uWarm*.06,1.,1.-uWarm*.06);
      vec2 d=vUv-.5; c.rgb*=1.-uVignette*dot(d,d)*1.6;
      c.rgb+=(h(vUv*vec2(1920.,1080.)+fract(uTime))-.5)*.018;
      gl_FragColor=c;
    }`
};

export class Renderer {
  constructor(canvas) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2500);
    this.quality = null;
    addEventListener('resize', () => this.resize());
  }

  setQuality(name, sun) {
    const q = this.q = PRESETS[name]; this.quality = name;
    setAnisotropy(q.aniso);
    const r = this.r;
    r.setPixelRatio(Math.min(devicePixelRatio, 2) * q.pixelRatio);
    if (sun) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      const s = q.shadowRange; const c = sun.shadow.camera;
      c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.updateProjectionMatrix();
    }
    this.camera.far = q.drawDist + 400; this.camera.updateProjectionMatrix();
    this.buildComposer();
    try { localStorage.setItem('lumen.quality', name); } catch (e) {}
  }

  buildComposer() {
    const r = this.r, q = this.q;
    if (this.composer) this.composer.dispose();
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.smaa ? 0 : 0 });
    const comp = this.composer = new EffectComposer(r, rt);
    comp.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const ao = this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.8;
      ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1, thickness: 0.2, distanceFallOff: 1, scale: 1.0, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      comp.addPass(ao);
    } else this.ao = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.55, 0.92);
      comp.addPass(this.bloom);
    } else this.bloom = null;
    comp.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    comp.addPass(this.grade);
    if (q.smaa) comp.addPass(new SMAAPass(size.x, size.y));
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.r.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.r.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  render(t) {
    if (this.grade) this.grade.uniforms.uTime.value = t;
    this.composer.render();
  }
}
