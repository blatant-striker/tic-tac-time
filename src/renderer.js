import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class Renderer {
  constructor(container, game, onCellClick, options = {}) {
    this.container = container;
    this.game = game;
    this.onCellClick = onCellClick;
    this.options = options || {};
    this.reducedMotion = !!this.options.reducedMotion;
    this.cellMeshes = [];
    this.markerMeshes = [];
    this.winLineMesh = null;
    this.isAnimating = false;
    this.distance = 8;
    this.initialDistance = 4;
    this.viewAngles = { yaw: 0, pitch: 0 };
    this.currentUpVector = new THREE.Vector3(0, 1, 0);
    this.roll = 0;
    this.lastDirection = 'front';
    this.opponentCell = null; // Track opponent last move
    this.selfCell = null; // Track my last move
    this.pendingCell = null; // Track cell awaiting confirmation
    this.pendingDirection = null; // Queue for snap inputs during animation
    this.tooltip = null;
    this.isPointerDown = false;
    this.pointerDown = { x: 0, y: 0 };
    this.skipClick = false;
    this.isHoveringCell = false;
    this.pendingOpponentHighlight = null;
    this.pendingTimeCarouselDir = null;
    this.timeParticles = null;
    this.timeParticlesBase = null;
    this.baseBackground = new THREE.Color(0x0a0a0a);
    this.tintOverlayEl = null;
    this.timeOverlayEl = null;

    this.updateCurrentUpVector();
    this.init();
    this.createGrid();
    this.animate();

    // Initial animation from close-up to face view
    this.performInitialAnimation();
  }

  highlightOpponentCell(x, y, z) {
    // Clear previous opponent highlight
    this.clearOpponentHighlight();
    this.opponentCell = { x, y, z };
    if (this.isAnimating) {
      this.pendingOpponentHighlight = { x, y, z };
    }

    // Apply red highlight to the occupied cell block under the marker
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' && 
          mesh.userData.x === x && 
          mesh.userData.y === y && 
          mesh.userData.z === z) {
        mesh.material.opacity = 0.6;
        mesh.material.emissiveIntensity = 0.9;
        mesh.material.emissive.setHex(0xff4444); // Red tint for opponent move
      }
    });
  }

  clearOpponentHighlight() {
    if (!this.opponentCell) return;
    const { x, y, z } = this.opponentCell;
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' && 
          mesh.userData.x === x && 
          mesh.userData.y === y && 
          mesh.userData.z === z) {
        mesh.material.opacity = 0.4;
        mesh.material.emissiveIntensity = 0.6;
        mesh.material.emissive.setHex(0x202020);
      }
    });
    this.opponentCell = null;
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = this.baseBackground.clone();

    // Camera - fixed distance for consistent cube size
    this.camera = new THREE.PerspectiveCamera(
      50,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );

    // Start camera closer for initial animation
    const startDistance = this.initialDistance;
    this.camera.position.set(startDistance, startDistance, startDistance);
    this.camera.up.copy(this.currentUpVector);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.container.style.position = 'relative';
    this.tooltip = document.createElement('div');
    const s = this.tooltip.style;
    s.position = 'absolute';
    s.padding = '6px 8px';
    s.background = 'rgba(0,0,0,0.75)';
    s.color = '#fff';
    s.fontSize = '12px';
    s.borderRadius = '4px';
    s.pointerEvents = 'none';
    s.whiteSpace = 'nowrap';
    s.zIndex = '10';
    s.display = 'none';
    this.tooltip.textContent = 'Shift: center | Ctrl: back';
    this.container.appendChild(this.tooltip);

    // Time travel overlays
    this.tintOverlayEl = document.createElement('div');
    const tS = this.tintOverlayEl.style;
    tS.position = 'absolute';
    tS.left = '0';
    tS.top = '0';
    tS.right = '0';
    tS.bottom = '0';
    tS.pointerEvents = 'none';
    tS.zIndex = '5';
    tS.background = 'transparent';
    tS.opacity = '0';
    tS.display = 'none';
    this.container.appendChild(this.tintOverlayEl);

    this.timeOverlayEl = document.createElement('div');
    const oS = this.timeOverlayEl.style;
    oS.position = 'absolute';
    oS.left = '50%';
    oS.top = '50%';
    oS.transform = 'translate(-50%, 0)';
    oS.pointerEvents = 'none';
    oS.color = '#e6e6ff';
    oS.fontSize = '13px';
    oS.fontWeight = '600';
    oS.letterSpacing = '0.06em';
    oS.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
    oS.zIndex = '12';
    oS.opacity = '0';
    oS.display = 'none';
    this.timeOverlayEl.textContent = 'Time traveling…';
    this.container.appendChild(this.timeOverlayEl);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);

    this.createTimeParticles();

    // Orbit Controls for camera rotation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; // Disable damping to prevent drift after snaps
    this.controls.enablePan = false;
    this.controls.enableZoom = false; // Disable zoom
    this.controls.target.set(0, 0, 0);
    this.controls.enabled = false; // Start disabled, will enable after initial animation

    // Raycaster for mouse interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Event listeners
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('mouseenter', (e) => this.onMouseEnter(e));
    this.renderer.domElement.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    this.renderer.domElement.addEventListener('mousedown', (e) => this.onPointerDown(e));
    this._onWindowMouseUp = (e) => this.onPointerUp(e);
    this._onKeyDown = (e) => this.onKeyChange(e);
    this._onKeyUp = (e) => this.onKeyChange(e);
    window.addEventListener('mouseup', this._onWindowMouseUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', () => this.onResize());
  }

  snapToView(direction) {
    console.log('snapToView called:', direction, 'isAnimating:', this.isAnimating);

    if (this.isAnimating) {
      this.pendingDirection = direction; // queue latest intent
      console.log('Animation in progress, queued:', direction);
      return;
    }

    const startPos = this.camera.position.clone();
    const startUp = this.camera.up.clone();

    // Capture starting angles
    const fromYaw = this.viewAngles.yaw;
    const fromPitch = this.viewAngles.pitch;
    const fromRoll = this.roll || 0;

    // Update target angles based on direction
    this.updateViewAngles(direction);
    const toYaw = this.viewAngles.yaw;
    const toPitch = this.viewAngles.pitch;
    const toRoll = this.roll || 0;

    const targetPos = this.getCameraPositionFromAngles(toYaw, toPitch);
    // Helper to compute continuous up given forward and a reference up
    const computeUp = (forwardVec, refUp, rollDeg) => {
      const forward = forwardVec.clone().normalize();
      // Project refUp onto plane perpendicular to forward
      let upBase = refUp.clone().sub(forward.clone().multiplyScalar(refUp.clone().dot(forward)));
      if (upBase.lengthSq() < 1e-6) {
        // Fallback axis if refUp ~ parallel to forward
        const fallback = Math.abs(forward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        upBase = fallback.sub(forward.clone().multiplyScalar(fallback.dot(forward)));
      }
      upBase.normalize();
      // Apply roll about forward
      const rollRad = THREE.MathUtils.degToRad(rollDeg || 0);
      if (Math.abs(rollRad) > 1e-6) {
        const q = new THREE.Quaternion().setFromAxisAngle(forward, rollRad);
        upBase.applyQuaternion(q);
      }
      return upBase.normalize();
    };
    // Precompute start direction and axis for 90° rotation per command
    const getDir = (yawDeg, pitchDeg) => {
      const yaw = THREE.MathUtils.degToRad(yawDeg);
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      const x = Math.cos(pitch) * Math.sin(yaw);
      const y = Math.sin(pitch);
      const z = Math.cos(pitch) * Math.cos(yaw);
      return new THREE.Vector3(x, y, z).normalize();
    };
    const quant = (a) => ((Math.round(a / 90) * 90) % 360 + 360) % 360;
    const startDir = getDir(fromYaw, fromPitch);
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Choose rotation axis and angle per direction
    let axis = new THREE.Vector3();
    let angleDeg = 0;
    let axisQuat = null; // optional composite rotation
    const prevPitch = quant(fromPitch);
    if (direction === 'left' || direction === 'right') {
      if (prevPitch === 90 || prevPitch === 270) {
        // Flip from pole to side: tilt to equator, then yaw to side
        // Camera right axis from current orientation
        let rightAxis = startDir.clone().cross(startUp).normalize();
        if (rightAxis.lengthSq() < 1e-6) {
          const fallback = Math.abs(startDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          rightAxis = fallback.sub(startDir.clone().multiplyScalar(fallback.dot(startDir))).normalize();
        }
        const tiltDeg = (prevPitch === 90) ? -90 : +90; // move to pitch=0
        const yawDeg = (direction === 'right') ? +90 : -90;
        const qTilt = new THREE.Quaternion().setFromAxisAngle(rightAxis, THREE.MathUtils.degToRad(tiltDeg));
        const qYaw = new THREE.Quaternion().setFromAxisAngle(worldUp, THREE.MathUtils.degToRad(yawDeg));
        axisQuat = qYaw.clone().multiply(qTilt); // apply tilt then yaw
      } else {
        axis.copy(worldUp);
        angleDeg = (direction === 'right') ? +90 : -90;
      }
    } else if (direction === 'top' || direction === 'bottom') {
      // rotate around camera right axis
      const rightAxis = startDir.clone().cross(startUp).normalize();
      if (rightAxis.lengthSq() < 1e-6) {
        // fallback axis orthogonal to forward
        const fallback = Math.abs(startDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        axis.copy(fallback.sub(startDir.clone().multiplyScalar(fallback.dot(startDir))).normalize());
      } else {
        axis.copy(rightAxis);
      }
      angleDeg = (direction === 'top') ? +90 : -90;
    } else {
      axis.copy(worldUp);
      angleDeg = 0;
    }

    if (!axisQuat) {
      axisQuat = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(angleDeg));
    }
    const endDir = startDir.clone().applyQuaternion(axisQuat).normalize();
    const targetUp = startUp.clone().applyQuaternion(axisQuat).normalize();
    const rotQE = axisQuat.clone();

    const duration = this.reducedMotion ? 0 : 400; // ms

    if (duration === 0) {
      this.camera.position.copy(targetPos);
      this.camera.up.copy(targetUp);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      this.syncControlsWithCamera();
      this.isAnimating = false;
      return;
    }

    this.isAnimating = true;
    this.controls.enabled = false;

    const startTime = Date.now();

    const norm = (a) => ((a % 360) + 360) % 360;
    const lerpAngle = (a, b, t) => {
      a = norm(a); b = norm(b);
      let diff = b - a;
      // Shortest path in [-180, 180]
      diff = ((diff + 540) % 360) - 180;
      return norm(a + diff * t);
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // Spherical interpolation of rotation about explicit axis
      const qStep = new THREE.Quaternion();
      qStep.slerpQuaternions(new THREE.Quaternion(), rotQE, eased);
      const curDir = startDir.clone().applyQuaternion(qStep).normalize();
      const curPos = curDir.clone().multiplyScalar(this.distance);

      // Rotate up via the same quaternion step from the starting up vector
      const currentUp = startUp.clone().applyQuaternion(qStep).normalize();
      this.camera.up.copy(currentUp);
      this.camera.position.copy(curPos);
      this.camera.lookAt(0, 0, 0);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation done - snap to target and enable controls
        this.camera.position.copy(targetPos);
        this.camera.up.copy(targetUp);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();

        const finalYaw = quant(toYaw);
        const finalPitch = quant(toPitch);
        // If not at a pole, zero roll; at poles, keep quantized roll
        const finalRoll = (finalPitch === 90 || finalPitch === 270) ? quant(toRoll) : 0;
        this.viewAngles = { yaw: finalYaw, pitch: finalPitch };
        this.roll = finalRoll;
        this.syncControlsWithCamera();
        this.isAnimating = false;

        console.log(
          `Snap complete: yaw=${finalYaw}, pitch=${finalPitch}, roll=${finalRoll}, ` +
          `pos=(${this.camera.position.x.toFixed(3)}, ${this.camera.position.y.toFixed(3)}, ${this.camera.position.z.toFixed(3)})`
        );

        // Execute any queued direction next
        if (this.pendingDirection) {
          const next = this.pendingDirection;
          this.pendingDirection = null;
          this.snapToView(next);
        }
      }
    };

    animate();
  }

  updateViewAngles(direction) {
    const norm = (a) => ((a % 360) + 360) % 360;
    const quant = (a) => ((Math.round(a / 90) * 90) % 360 + 360) % 360;
    const step = 90;

    const prevPitch = quant(this.viewAngles.pitch);
    switch (direction) {
      case 'left': {
        // At poles, flip to side face: set pitch to 0 and yaw -90; no roll
        if (prevPitch === 90 || prevPitch === 270) {
          this.viewAngles.yaw = norm(quant(this.viewAngles.yaw) - step);
          this.viewAngles.pitch = 0;
          this.roll = 0;
        } else {
          this.viewAngles.yaw = norm(quant(this.viewAngles.yaw) - step);
          this.roll = 0;
        }
        break;
      }
      case 'right': {
        if (prevPitch === 90 || prevPitch === 270) {
          this.viewAngles.yaw = norm(quant(this.viewAngles.yaw) + step);
          this.viewAngles.pitch = 0;
          this.roll = 0;
        } else {
          this.viewAngles.yaw = norm(quant(this.viewAngles.yaw) + step);
          this.roll = 0;
        }
        break;
      }
      case 'front':
        this.viewAngles.pitch = 0;
        this.viewAngles.yaw = 0;
        this.roll = 0;
        break;
      case 'back':
        this.viewAngles.pitch = 0;
        this.viewAngles.yaw = 180;
        this.roll = 0;
        break;
      case 'top': {
        const newPitch = norm(quant(this.viewAngles.pitch) + step);
        // If leaving pole -> zero roll
        if ((prevPitch === 90 || prevPitch === 270) && !(newPitch === 90 || newPitch === 270)) {
          this.roll = 0;
        }
        this.viewAngles.pitch = newPitch;
        break;
      }
      case 'bottom': {
        const newPitch = norm(quant(this.viewAngles.pitch) - step);
        if ((prevPitch === 90 || prevPitch === 270) && !(newPitch === 90 || newPitch === 270)) {
          this.roll = 0;
        }
        this.viewAngles.pitch = newPitch;
        break;
      }
      default:
        break;
    }

    this.lastDirection = direction;
    this.updateCurrentUpVector();
  }

  getUpVectorFromAngles(yawDeg, pitchDeg, rollDeg = 0) {
    // Continuous up computation from forward vector with fallback axis
    const pos = this.getCameraPositionFromAngles(yawDeg, pitchDeg);
    const forward = pos.clone().negate().normalize();

    // Choose a provisional world-up that isn't parallel to forward
    const worldUpY = new THREE.Vector3(0, 1, 0);
    const worldUpZ = new THREE.Vector3(0, 0, 1);
    const dotY = Math.abs(forward.dot(worldUpY));
    const provisionalUp = dotY > 0.98 ? worldUpZ : worldUpY;

    // Build an orthonormal basis (right, up) relative to forward
    const right = provisionalUp.clone().cross(forward).normalize();
    let up = forward.clone().cross(right).normalize();

    // Apply roll about the forward axis
    const rollRad = THREE.MathUtils.degToRad(rollDeg || 0);
    if (Math.abs(rollRad) > 1e-6) {
      const q = new THREE.Quaternion().setFromAxisAngle(forward, rollRad);
      up.applyQuaternion(q);
    }
    return up.normalize();
  }

  updateCurrentUpVector() {
    this.currentUpVector.copy(
      this.getUpVectorFromAngles(this.viewAngles.yaw, this.viewAngles.pitch, this.roll || 0)
    );
  }

  getCameraPositionFromAngles(yawDeg, pitchDeg) {
    const radius = this.distance;
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    // Spherical coordinates
    const x = radius * Math.cos(pitch) * Math.sin(yaw);
    const y = radius * Math.sin(pitch);
    const z = radius * Math.cos(pitch) * Math.cos(yaw);

    const clamp = (value) => Math.abs(value) < 1e-4 ? 0 : value;

    return new THREE.Vector3(clamp(x), clamp(y), clamp(z));
  }

  syncControlsWithCamera() {
    this.controls.target.set(0, 0, 0);
    this.controls.position0.copy(this.camera.position);
    this.controls.zoom0 = this.camera.zoom;
    this.controls.enabled = true;
    this.controls.update();
  }

  performInitialAnimation() {
    // Animate from close-up diagonal to front face view
    const duration = this.reducedMotion ? 0 : 800; // ms

    const startPos = this.camera.position.clone();
    const startUp = this.camera.up.clone();

    this.viewAngles.yaw = 0;
    this.viewAngles.pitch = 0;
    this.roll = 0;
    this.lastDirection = 'front';
    this.updateCurrentUpVector();

    const targetPos = this.getCameraPositionFromAngles(0, 0); // Front face view
    const targetUp = this.currentUpVector.clone();

    // Reduced motion: snap immediately
    if (duration === 0) {
      this.camera.position.copy(targetPos);
      this.camera.up.copy(targetUp);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      this.viewAngles = { yaw: 0, pitch: 0 };
      this.syncControlsWithCamera();
      this.isAnimating = false;
      return;
    }

    this.isAnimating = true;
    this.controls.enabled = false;

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentUp = startUp.clone().lerp(targetUp, eased).normalize();
      this.camera.up.copy(currentUp);
      this.camera.position.lerpVectors(startPos, targetPos, eased);
      this.camera.lookAt(0, 0, 0);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation done - snap to front view and enable controls
        this.camera.position.copy(targetPos);
        this.camera.up.copy(targetUp);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();

        this.viewAngles = { yaw: 0, pitch: 0 };

        this.syncControlsWithCamera();
        this.isAnimating = false;
      }
    };

    animate();
  }

  createGrid() {
    this.clearGrid();

    
    const cellSize = 0.8;
    const spacing = 1.2;
    const gridSize = this.game.gridSize;
    const offset = -(gridSize - 1) * spacing / 2;

    // Create cells for current time slice
    for (let z = 0; z < gridSize; z++) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const geometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
          const material = new THREE.MeshPhongMaterial({
            color: 0x353535,
            transparent: true,
            opacity: 0.4,
            emissive: 0x202020,
            emissiveIntensity: 0.6
          });
          
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(
            offset + x * spacing,
            offset + y * spacing,
            offset + z * spacing
          );
          
          mesh.userData = { x, y, z, type: 'cell' };
          this.cellMeshes.push(mesh);
          this.scene.add(mesh);

          // Add wireframe
          const edges = new THREE.EdgesGeometry(geometry);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.3, transparent: true })
          );
          line.position.copy(mesh.position);
          line.userData = { x, y, z, type: 'wireframe' };
          this.cellMeshes.push(line); // Add to clickable objects
          this.scene.add(line);
        }
      }
    }

    this.updateMarkers();
    if (this.pendingOpponentHighlight) {
      const { x, y, z } = this.pendingOpponentHighlight;
      this.highlightOpponentCell(x, y, z);
      this.pendingOpponentHighlight = null;
    }
  }

  updateMarkers() {
    // Remove old markers
    this.markerMeshes.forEach(group => {
      this.scene.remove(group);
      // Dispose of geometries and materials in the group
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    });
    this.markerMeshes = [];

    const cellSize = 0.8;
    const spacing = 1.2;
    const gridSize = this.game.gridSize;
    const offset = -(gridSize - 1) * spacing / 2;
    const t = this.game.currentTime;

    // Create markers for current time slice
    for (let z = 0; z < gridSize; z++) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const value = this.game.board[t][z][y][x];
          if (value) {
            const marker = this.createMarker(value, cellSize * 0.6);
            marker.position.set(
              offset + x * spacing,
              offset + y * spacing,
              offset + z * spacing
            );
            this.markerMeshes.push(marker);
            this.scene.add(marker);
          }
        }
      }
    }
  }

  createMarker(type, size) {
    const group = new THREE.Group();
    
    if (type === 'X') {
      // Create X shape
      const geometry = new THREE.BoxGeometry(size, size * 0.15, size * 0.15);
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0xaaaaaa,
        emissiveIntensity: 0.5
      });
      
      const bar1 = new THREE.Mesh(geometry, material);
      bar1.rotation.z = Math.PI / 4;
      group.add(bar1);
      
      const bar2 = new THREE.Mesh(geometry, material);
      bar2.rotation.z = -Math.PI / 4;
      group.add(bar2);
      
    } else if (type === 'O') {
      // Create O shape
      const geometry = new THREE.TorusGeometry(size * 0.4, size * 0.1, 16, 32);
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0xaaaaaa,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
    }
    
    return group;
  }

  drawWinLine(line) {
    if (this.winLineMesh) {
      this.scene.remove(this.winLineMesh);
      this.winLineMesh.geometry.dispose();
      this.winLineMesh.material.dispose();
    }

    const spacing = 1.2;
    const gridSize = this.game.gridSize;
    const offset = -(gridSize - 1) * spacing / 2;

    const points = line.map(([x, y, z]) => 
      new THREE.Vector3(
        offset + x * spacing,
        offset + y * spacing,
        offset + z * spacing
      )
    );

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 5
    });

    this.winLineMesh = new THREE.Line(geometry, material);
    this.scene.add(this.winLineMesh);
  }

  onClick(event) {
    if (this.isAnimating) return;
    if (this.skipClick) { this.skipClick = false; return; }
    this.updateMousePosition(event);
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Only raycast against actual meshes, not wireframes
    const meshesOnly = this.cellMeshes.filter(obj => obj.type === 'Mesh');
    const intersects = this.raycaster.intersectObjects(meshesOnly);
    
    if (intersects.length > 0) {
      const useCenter = !!event.shiftKey;
      const useBack = !!event.ctrlKey && !useCenter;
      const first = intersects[0];
      const { x: cx, y: cy } = first.object.userData || {};
      const column = intersects.filter(i => {
        const u = i.object.userData;
        return u && u.x === cx && u.y === cy;
      });
      const pick = column.length > 0
        ? (useCenter
          ? column[Math.floor(column.length / 2)]
          : (useBack ? column[column.length - 1] : column[0]))
        : first;
      const { x, y, z } = pick.object.userData;
      this.onCellClick(x, y, z);
    }
  }

  onMouseMove(event) {
    this.updateMousePosition(event);
    if (this.isAnimating) {
      // Still update tooltip position/visibility while animating
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const meshesOnly = this.cellMeshes.filter(obj => obj.type === 'Mesh');
      const intersects = this.raycaster.intersectObjects(meshesOnly);
      this.isHoveringCell = intersects.length > 0;
      if (this.tooltip) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        this.tooltip.style.top = `${event.clientY - rect.top + 12}px`;
        if (intersects.length > 0) {
          this.tooltip.style.display = 'block';
        } else {
          this.tooltip.style.display = 'none';
        }
      }
      return;
    }
    if (this.isPointerDown) {
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (dx*dx + dy*dy > 25) this.skipClick = true;
    }
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Only raycast against actual meshes, not wireframes
    const meshesOnly = this.cellMeshes.filter(obj => obj.type === 'Mesh');
    const intersects = this.raycaster.intersectObjects(meshesOnly);
    this.isHoveringCell = intersects.length > 0;
    if (this.tooltip) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.tooltip.style.left = `${event.clientX - rect.left + 12}px`;
      this.tooltip.style.top = `${event.clientY - rect.top + 12}px`;
      if (intersects.length > 0) {
        this.tooltip.style.display = 'block';
        if (event.shiftKey) this.tooltip.textContent = 'Center select (Shift)';
        else if (event.ctrlKey) this.tooltip.textContent = 'Back select (Ctrl)';
        else this.tooltip.textContent = 'Shift: center | Ctrl: back';
      } else {
        this.tooltip.style.display = 'none';
      }
    }
    
    // Reset all cells (only meshes, not wireframes), except pending and highlighted cells
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' && mesh.material.opacity !== undefined) {
        // Skip pending/self/opponent highlighted cells - keep them
        const isPending = this.pendingCell && mesh.userData.x === this.pendingCell.x && mesh.userData.y === this.pendingCell.y && mesh.userData.z === this.pendingCell.z;
        const isSelf = this.selfCell && mesh.userData.x === this.selfCell.x && mesh.userData.y === this.selfCell.y && mesh.userData.z === this.selfCell.z;
        const isOpponent = this.opponentCell && mesh.userData.x === this.opponentCell.x && mesh.userData.y === this.opponentCell.y && mesh.userData.z === this.opponentCell.z;
        if (isPending || isSelf || isOpponent) return;
        mesh.material.opacity = 0.4;
        mesh.material.emissiveIntensity = 0.6;
      }
    });
    
    // Highlight hovered cell
    if (intersects.length > 0) {
      const useCenter = !!event.shiftKey;
      const useBack = !!event.ctrlKey && !useCenter;
      const first = intersects[0];
      const { x: cx, y: cy } = first.object.userData || {};
      const column = intersects.filter(i => {
        const u = i.object.userData;
        return u && u.x === cx && u.y === cy;
      });
      const pick = column.length > 0
        ? (useCenter
          ? column[Math.floor(column.length / 2)]
          : (useBack ? column[column.length - 1] : column[0]))
        : first;
      const obj = pick.object;
      const { x, y, z } = obj.userData;
      
      // Find the corresponding mesh to highlight (unless it's the pending cell)
      this.cellMeshes.forEach(mesh => {
        if (mesh.type === 'Mesh' && mesh.userData.x === x && mesh.userData.y === y && mesh.userData.z === z) {
          // Don't override pending cell highlight style
          if (this.pendingCell && x === this.pendingCell.x && y === this.pendingCell.y && z === this.pendingCell.z) {
            return;
          }
          mesh.material.opacity = 0.7;
          mesh.material.emissiveIntensity = 1.2;
        }
      });
      
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.renderer.domElement.style.cursor = 'default';
    }
  }
  
  highlightPendingCell(x, y, z) {
    this.clearPendingHighlight();
    this.pendingCell = { x, y, z };
    
    // Apply strong highlight to pending cell
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' && 
          mesh.userData.x === x && 
          mesh.userData.y === y && 
          mesh.userData.z === z) {
        mesh.material.opacity = 0.9;
        mesh.material.emissiveIntensity = 1.5;
        mesh.material.emissive.setHex(0x4444ff); // Blue tint for pending
      }
    });
  }
  
  clearPendingHighlight() {
    if (!this.pendingCell) return;
    
    const { x, y, z } = this.pendingCell;
    
    // Reset pending cell to normal
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' && 
          mesh.userData.x === x && 
          mesh.userData.y === y && 
          mesh.userData.z === z) {
        mesh.material.opacity = 0.4;
        mesh.material.emissiveIntensity = 0.6;
        mesh.material.emissive.setHex(0x202020); // Reset to normal color
      }
    });
    
    this.pendingCell = null;
  }

  highlightSelfCell(x, y, z) {
    // Clear previous self highlight
    this.clearSelfHighlight();
    this.selfCell = { x, y, z };
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' &&
          mesh.userData.x === x &&
          mesh.userData.y === y &&
          mesh.userData.z === z) {
        mesh.material.opacity = 0.6;
        mesh.material.emissiveIntensity = 0.9;
        mesh.material.emissive.setHex(0x44ff44); // Green tint for own last move
      }
    });
  }

  clearSelfHighlight() {
    if (!this.selfCell) return;
    const { x, y, z } = this.selfCell;
    this.cellMeshes.forEach(mesh => {
      if (mesh.type === 'Mesh' &&
          mesh.userData.x === x &&
          mesh.userData.y === y &&
          mesh.userData.z === z) {
        mesh.material.opacity = 0.4;
        mesh.material.emissiveIntensity = 0.6;
        mesh.material.emissive.setHex(0x202020);
      }
    });
    this.selfCell = null;
  }

  updateMousePosition(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update camera matrices to ensure raycaster works correctly after rotations
    this.camera.updateMatrixWorld();
  }

  onKeyChange(event) {
    if (!this.tooltip) return;
    if (this.isHoveringCell) {
      if (event.shiftKey) this.tooltip.textContent = 'Center select (Shift)';
      else if (event.ctrlKey) this.tooltip.textContent = 'Back select (Ctrl)';
      else this.tooltip.textContent = 'Shift: center | Ctrl: back';
      this.tooltip.style.display = 'block';
    } else {
      this.tooltip.style.display = 'none';
    }
  }

  onMouseEnter(event) {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  onMouseLeave(event) {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  onPointerDown(event) {
    this.isPointerDown = true;
    this.pointerDown = { x: event.clientX, y: event.clientY };
    this.skipClick = false;
  }

  onPointerUp(event) {
    this.isPointerDown = false;
  }

  onResize() {
    // Update camera aspect ratio
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    
    // Update renderer size
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    // Update controls for smooth damping only if not animating
    if (!this.isAnimating) {
      this.controls.update();
    }
    
    // Make all markers face the camera (billboard effect)
    this.markerMeshes.forEach(marker => {
      marker.quaternion.copy(this.camera.quaternion);
    });
    
    this.renderer.render(this.scene, this.camera);
  }

  animateTimeCarousel(direction) {
    if (this.isAnimating) {
      this.pendingTimeCarouselDir = direction;
      return;
    }
    if (this.reducedMotion) {
      this.createGrid();
      return;
    }
    const startPos = this.camera.position.clone();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = forward.clone().cross(this.camera.up).normalize();
    const amplitude = 1.3;
    const duration = 1100;
    const sign = direction >= 0 ? 1 : -1;
    let swapped = false;
    const startTime = Date.now();
    this.isAnimating = true;
    this.controls.enabled = false;

    const startBg = this.scene.background.clone();
    const targetBg = new THREE.Color(sign > 0 ? 0x301020 : 0x102030);
    if (this.timeParticles) this.timeParticles.visible = true;

    // Cache arrows (time + cube side view) and disable interactions
    const prevBtn = document.getElementById('prevTime');
    const nextBtn = document.getElementById('nextTime');
    const viewTop = document.getElementById('viewTop');
    const viewBottom = document.getElementById('viewBottom');
    const viewLeft = document.getElementById('viewLeft');
    const viewRight = document.getElementById('viewRight');
    const arrows = [prevBtn, nextBtn, viewTop, viewBottom, viewLeft, viewRight].filter(Boolean);
    arrows.forEach(btn => {
      btn.style.pointerEvents = 'none';
    });

    // Prepare overlays
    if (this.tintOverlayEl) {
      this.tintOverlayEl.style.display = 'block';
      this.tintOverlayEl.style.opacity = '0';
    }
    if (this.timeOverlayEl) {
      this.timeOverlayEl.style.display = 'block';
      this.timeOverlayEl.style.opacity = '0';
      const names = ['Past', 'Present', 'Future'];
      const idx = Math.max(0, Math.min((this.game && typeof this.game.currentTime === 'number') ? this.game.currentTime : 0, names.length - 1));
      this.timeOverlayEl.textContent = ` Time Traveling to ${names[idx]}…`;
    }

    const step = () => {
      const elapsed = Date.now() - startTime;
      const p = Math.min(elapsed / duration, 1);
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * p); // easeInOutSine
      const offsetScale = Math.sin(Math.PI * eased);
      const offset = right.clone().multiplyScalar(sign * amplitude * offsetScale);
      const pos = startPos.clone().add(offset);
      this.camera.position.copy(pos);
      this.camera.lookAt(0, 0, 0);

      // Background tint
      this.scene.background = startBg.clone().lerp(targetBg, eased * 0.5);
      // DOM tint overlay
      if (this.tintOverlayEl) {
        const alpha = Math.sin(Math.PI * eased) * 0.5; // soft in/out
        const col = sign > 0 ? '48,16,32' : '16,32,48';
        this.tintOverlayEl.style.background = `radial-gradient(ellipse at center, rgba(${col},${alpha}) 0%, rgba(${col},${alpha * 0.6}) 45%, rgba(${col},0) 85%)`;
        this.tintOverlayEl.style.opacity = String(Math.min(1, alpha + 0.1));
      }

      // Position label just below cube and smooth opacity
      if (this.timeOverlayEl) {
        const labelAlpha = Math.sin(Math.PI * eased);
        this.timeOverlayEl.style.opacity = String(Math.min(1, labelAlpha));
        const cellSize = 0.8;
        const spacing = 1.2;
        const gridSize = this.game.gridSize;
        const offset = -(gridSize - 1) * spacing / 2;
        const belowY = offset - cellSize / 2 - 0.7;
        const world = new THREE.Vector3(0, belowY, 0);
        const projected = world.clone().project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        const sx = (projected.x * 0.5 + 0.5) * rect.width;
        const sy = (-projected.y * 0.5 + 0.5) * rect.height;
        this.timeOverlayEl.style.left = `${sx}px`;
        this.timeOverlayEl.style.top = `${Math.min(rect.height - 12, sy)}px`;
      }

      // Fade arrows out and back in
      if (arrows.length) {
        const arrowOpacity = 1 - Math.sin(Math.PI * eased);
        arrows.forEach(btn => { btn.style.opacity = String(arrowOpacity); });
      }

      // Particles streaking
      if (this.timeParticles && this.timeParticlesBase) {
        const positions = this.timeParticles.geometry.attributes.position;
        const base = this.timeParticlesBase;
        const alpha = Math.sin(Math.PI * eased);
        for (let i = 0; i < base.length; i += 3) {
          const bx = base[i], by = base[i+1], bz = base[i+2];
          const ox = right.x * sign * 1.6 * eased;
          const oy = right.y * sign * 1.6 * eased;
          const oz = right.z * sign * 1.6 * eased;
          positions.array[i]   = bx + ox;
          positions.array[i+1] = by + oy;
          positions.array[i+2] = bz + oz;
        }
        positions.needsUpdate = true;
        const mat = this.timeParticles.material;
        mat.opacity = 0.0 + 0.8 * alpha;
      }

      // Pulse marker emissive at mid-swap
      const pulse = 0.5 + 0.7 * Math.sin(Math.PI * eased);
      this.markerMeshes.forEach(group => {
        group.traverse(obj => {
          if (obj.material && 'emissiveIntensity' in obj.material) {
            obj.material.emissiveIntensity = Math.min(1.2, 0.5 + pulse * 0.7);
          }
        });
      });

      // Crossfade cells and wireframes (fade-out before swap, fade-in after)
      const fadeMultiplier = p < 0.5 ? (1 - p / 0.5) : ((p - 0.5) / 0.5);
      this.cellMeshes.forEach(obj => {
        if (obj.type === 'Mesh' && obj.material && obj.material.opacity !== undefined) {
          obj.material.opacity = 0.4 * fadeMultiplier;
        } else if (obj.type !== 'Mesh' && obj.material && obj.material.opacity !== undefined) {
          obj.material.opacity = 0.3 * fadeMultiplier;
        }
      });

      if (!swapped && p >= 0.5) {
        swapped = true;
        this.createGrid();
      }

      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        this.camera.position.copy(startPos);
        this.camera.lookAt(0, 0, 0);
        this.syncControlsWithCamera();
        this.isAnimating = false;
        // restore background and particles
        this.scene.background = startBg;
        if (this.timeParticles) {
          this.timeParticles.visible = false;
          const positions = this.timeParticles.geometry.attributes.position;
          const base = this.timeParticlesBase;
          for (let i = 0; i < base.length; i++) positions.array[i] = base[i];
          positions.needsUpdate = true;
          this.timeParticles.material.opacity = 0;
        }
        if (this.tintOverlayEl) {
          this.tintOverlayEl.style.display = 'none';
          this.tintOverlayEl.style.opacity = '0';
        }
        if (this.timeOverlayEl) {
          this.timeOverlayEl.style.display = 'none';
          this.timeOverlayEl.style.opacity = '0';
        }
        if (this.pendingTimeCarouselDir !== null) {
          const next = this.pendingTimeCarouselDir;
          this.pendingTimeCarouselDir = null;
          this.animateTimeCarousel(next);
        }
        // Restore arrows
        if (arrows.length) {
          arrows.forEach(btn => {
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
          });
        }
      }
    };
    step();
  }

  createTimeParticles() {
    const count = 250;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const radius = 3.0;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * radius;
      const y = (Math.random() * 2 - 1) * radius;
      const z = (Math.random() * 2 - 1) * radius;
      positions[i*3] = base[i*3] = x;
      positions[i*3+1] = base[i*3+1] = y;
      positions[i*3+2] = base[i*3+2] = z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x88ccff,
      size: 0.06,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    this.scene.add(points);
    this.timeParticles = points;
    this.timeParticlesBase = base;
  }

  clearGrid() {
    this.cellMeshes.forEach(obj => {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this.cellMeshes = [];
  }

  destroy() {
    this.clearGrid();
    this.markerMeshes.forEach(group => {
      this.scene.remove(group);
      // Safely dispose nested geometries/materials
      if (group && typeof group.traverse === 'function') {
        group.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
      } else {
        if (group?.geometry) group.geometry.dispose();
        if (group?.material) group.material.dispose();
      }
    });
    if (this.winLineMesh) {
      this.scene.remove(this.winLineMesh);
      this.winLineMesh.geometry.dispose();
      this.winLineMesh.material.dispose();
    }
    this.renderer.dispose();
    if (this.tooltip && this.tooltip.parentNode === this.container) {
      this.container.removeChild(this.tooltip);
      this.tooltip = null;
    }
    if (this.tintOverlayEl && this.tintOverlayEl.parentNode === this.container) {
      this.container.removeChild(this.tintOverlayEl);
      this.tintOverlayEl = null;
    }
    if (this.timeOverlayEl && this.timeOverlayEl.parentNode === this.container) {
      this.container.removeChild(this.timeOverlayEl);
      this.timeOverlayEl = null;
    }
    if (this._onWindowMouseUp) {
      window.removeEventListener('mouseup', this._onWindowMouseUp);
      this._onWindowMouseUp = null;
    }
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onKeyUp) {
      window.removeEventListener('keyup', this._onKeyUp);
      this._onKeyUp = null;
    }
    this.container.removeChild(this.renderer.domElement);
  }
}
