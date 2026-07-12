// Camera focus and follow. Focusing flies the camera to a body along an eased
// path (the destination tracks the moving body), then locks on so the camera
// rides along with the body's orbital motion while OrbitControls still work.

import * as THREE from 'three';

const tmpDir = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class FocusController {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.target = null;
    this.anim = null;
    this.prevBodyPos = new THREE.Vector3();
    this.onChange = null;
  }

  focus(rec) {
    this.target = rec;
    const dist = Math.max(rec.visualRadius * 4.6, 0.08);
    this.anim = {
      t: 0,
      dur: 1.5,
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      dist,
    };
    if (this.onChange) this.onChange(rec);
  }

  release() {
    this.target = null;
    this.anim = null;
    if (this.onChange) this.onChange(null);
  }

  overview() {
    this.target = null;
    this.anim = {
      t: 0,
      dur: 1.6,
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      staticPos: new THREE.Vector3(-1400, 1600, 3400),
      staticTarget: new THREE.Vector3(0, 0, 0),
    };
    if (this.onChange) this.onChange(null);
  }

  update(dt) {
    if (this.anim) {
      const a = this.anim;
      a.t += dt / a.dur;
      const k = easeInOutCubic(Math.min(a.t, 1));
      if (a.staticPos) {
        this.camera.position.lerpVectors(a.fromPos, a.staticPos, k);
        this.controls.target.lerpVectors(a.fromTarget, a.staticTarget, k);
        if (a.t >= 1) this.anim = null;
      } else if (this.target) {
        const bp = this.target.worldPos;
        tmpDir.copy(a.fromPos).sub(bp);
        if (tmpDir.lengthSq() < 1e-9) tmpDir.set(0, 0.3, 1);
        tmpDir.normalize();
        tmpEnd.copy(bp).addScaledVector(tmpDir, a.dist);
        this.camera.position.lerpVectors(a.fromPos, tmpEnd, k);
        this.controls.target.lerpVectors(a.fromTarget, bp, k);
        if (a.t >= 1) {
          this.anim = null;
          this.prevBodyPos.copy(bp);
        }
      }
    } else if (this.target) {
      const bp = this.target.worldPos;
      tmpDelta.copy(bp).sub(this.prevBodyPos);
      this.camera.position.add(tmpDelta);
      this.controls.target.copy(bp);
      this.prevBodyPos.copy(bp);
    }
    this.controls.minDistance = this.target ? Math.max(this.target.visualRadius * 1.25, 0.02) : 0.2;
  }
}
