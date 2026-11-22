// Vitrage avec « interior mapping » : derrière chaque vitre, une vraie pièce en perspective
// (sol, murs, plafond, mobilier, rideaux/stores, lampes la nuit), calculée par lancer de rayon dans une boîte.
import * as THREE from 'three';

export function makeGlassMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.25 });
  m.userData.uniforms = { uDay: { value: 1 }, uLit: { value: 0.1 }, uShop: { value: 1 }, uOffice: { value: 1 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aRoom; attribute vec4 aInfo;
        varying vec3 vPL; varying vec3 vCL; varying vec4 vRoom; varying vec4 vInfo; varying vec2 vWin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
          mat4 M = modelMatrix * instanceMatrix;
          vec3 cl = (inverse(M) * vec4(cameraPosition, 1.)).xyz;
          vCL = cl * vec3(sx, sy, 1.);
          vPL = vec3(position.x * sx, position.y * sy, 0.);
          vWin = vec2(sx, sy); vRoom = aRoom; vInfo = aInfo;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDay, uLit, uShop, uOffice;
        varying vec3 vPL; varying vec3 vCL; varying vec4 vRoom; varying vec4 vInfo; varying vec2 vWin;
        float h1(float n){ return fract(sin(n*127.1)*43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        vec3 pal(float s){
          vec3 a[6]; a[0]=vec3(.82,.78,.70); a[1]=vec3(.70,.74,.72); a[2]=vec3(.86,.82,.76); a[3]=vec3(.62,.66,.74); a[4]=vec3(.80,.70,.62); a[5]=vec3(.9,.88,.84);
          return a[int(mod(floor(s*6.),6.))];
        }
        vec3 interior(out float lamp){
          lamp = 0.;
          float W = vRoom.x, H = vRoom.y, D = vRoom.z, seed = vRoom.w;
          float type = vInfo.x, sill = vInfo.z, curtain = vInfo.w;
          vec3 ro = vPL; vec3 rd = normalize(vPL - vCL);
          if (rd.z > -0.001) rd.z = -0.001;
          float fy = -vWin.y*.5 - sill;          // sol
          vec3 bmin = vec3(-W*.5, fy, -D), bmax = vec3(W*.5, fy + H, 0.);
          vec3 t1 = (bmin - ro)/rd, t2 = (bmax - ro)/rd; vec3 tf = max(t1, t2);
          float t = min(min(tf.x, tf.y), tf.z);
          vec3 p = ro + rd*t;
          float depthK = clamp(-p.z / D, 0., 1.);
          vec3 wall = pal(seed);
          vec3 c; float face;
          float lit = step(h1(seed*7.3+3.1), uLit);
          if (type > 1.5) lit = step(h1(seed*3.7), uOffice);
          if (type > .5 && type < 1.5) lit = uShop;
          // --- faces ---
          if (t == tf.y && rd.y < 0.) { // sol
            if (type > .5 && type < 1.5) c = mix(vec3(.55,.53,.5), vec3(.75), step(.5, fract(p.x*.8)+fract(p.z*.8)*0.));
            else { float pl = floor(p.x*3.3); c = mix(vec3(.42,.28,.17), vec3(.55,.38,.24), h1(pl+seed*11.)); c *= .85+.15*step(.04, fract(p.x*3.3)); if (type>1.5) c = vec3(.38,.4,.42); }
            face = 0.;
          } else if (t == tf.y) { // plafond
            c = vec3(.86,.85,.82); face = 1.;
            vec2 q = p.xz - vec2(0., -D*.5);
            lamp = lit * smoothstep(.35, .0, length(q)) ;
            if (type > 1.5) { vec2 g = fract(p.xz*vec2(.5,.5)); lamp = lit * step(.75, g.x) * step(.5, g.y) * 1.0; }
          } else if (t == tf.z) { // mur du fond
            c = wall; face = 2.;
            float x = p.x, y = p.y - fy;
            if (type < .5) {
              float k = h1(seed*5.1);
              if (k < .4) { // canapé
                if (y < .85 && abs(x) < W*.33) c = mix(vec3(.25,.27,.32), vec3(.45,.3,.22), h1(seed*2.)) * (y < .45 ? .8 : 1.);
                if (y > 1.35 && y < 2.0 && abs(x) < .45) c = mix(vec3(.15), vec3(.8,.6,.4), h2(floor(vec2(x*6., y*6.))));
              } else if (k < .7) { // bibliothèque
                if (abs(x) < W*.3 && y < 2.1) { float sh = fract(y*2.6); c = sh < .12 ? vec3(.35,.24,.15) : mix(vec3(.6,.2,.15), vec3(.2,.3,.5), h2(floor(vec2(x*14., y*2.6)))) * .8; }
              } else { // porte + tableau
                if (abs(x - W*.25) < .45 && y < 2.05) c = vec3(.92,.9,.86) * (abs(x - W*.25) > .4 ? .7 : 1.);
                if (abs(x + W*.2) < .5 && abs(y - 1.6) < .35) c = mix(vec3(.2,.35,.5), vec3(.85,.7,.4), smoothstep(-.3,.3, y-1.6));
              }
            } else if (type < 1.5) { // commerce : rayonnages
              float row = fract(y*1.6); float col = floor(x*5.);
              c = (y < 2.2) ? (row < .12 ? vec3(.8) : mix(vec3(.9,.3,.2), vec3(.2,.6,.9), h2(vec2(col, floor(y*1.6)+seed)))*.85) : wall;
            } else { // bureau
              if (y < .75) c = vec3(.3,.31,.33);
              if (y > .75 && y < 1.15 && fract(x*.6) < .5) c = vec3(.05,.07,.1) + vec3(.2,.35,.5)*lit;
            }
          } else { // murs latéraux
            c = wall * .82; face = 3.;
            float y = p.y - fy;
            if (type < .5 && y < .9 && -p.z > D*.55 && h1(seed*9.) > .5) c = vec3(.5,.36,.24);
          }
          // éclairage intérieur
          vec3 dayL = vec3(1.,1.,1.) * uDay * mix(1.05, .38, depthK) * (face == 1. ? .7 : 1.);
          vec3 lampC = vec3(1.0,.78,.52);
          if (type > 1.5) lampC = vec3(.92,.96,1.);
          vec3 nightL = lit * lampC * (type > .5 && type < 1.5 ? 1.6 : 1.1) * mix(1.1, .6, depthK);
          vec3 col = c * (dayL * .55 + nightL) + lampC * lamp * 2.5;
          // rideaux / stores
          float ax = abs(ro.x) / (vWin.x*.5);
          if (curtain > 0. && ax > 1. - curtain) {
            float fold = .75 + .25*sin(ro.x*28. + seed*10.);
            vec3 cloth = mix(vec3(.85,.82,.76), vec3(.55,.62,.7), h1(seed*13.)) * fold;
            col = cloth * (uDay*.6 + lit*lampC*1.2);
          }
          float yb = (ro.y + vWin.y*.5) / vWin.y;
          float blind = h1(seed*17.) < .35 && type < .5 ? h1(seed*19.)*.7 : 0.;
          if (yb > 1. - blind) { float sl = step(.5, fract(ro.y*14.)); col = mix(vec3(.75,.74,.7), vec3(.55), sl) * (uDay*.55 + lit*lampC*1.1); }
          return col;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float lamp = 0.; vec3 ic = interior(lamp); totalEmissiveRadiance += ic * .85; }`);
  };
  m.customProgramCacheKey = () => 'glass-interior-v1';
  return m;
}
