import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/** ========= CONFIG ========= */
const WORLD_SIZE = 200;
const WORLD_RADIUS = WORLD_SIZE * 0.5 - 2;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 3.5;
const GHOST_SPEED = 3.0;
const GHOST_COUNT = 5;
const GHOST_SPAWN_DISTANCE = 30;
const GHOST_DAMAGE_DISTANCE = 1.2;
const OBJECT_COUNT = 40;
const CROSS_COUNT = 15;
const SKULL_COUNT = 12;
const ANGEL_COUNT = 8;
const FOG_DENSITY = 0.035;
const LIGHT_BEAM_DISTANCE = 25;
const LIGHT_BEAM_ANGLE = 0.3;

/** ========= DOM ELEMENTS ========= */
const startScreen = document.getElementById('startScreen');
const gameHUD = document.getElementById('gameHUD');
const gameOverScreen = document.getElementById('gameOverScreen');
const killCountEl = document.getElementById('killCount');
const timeCountEl = document.getElementById('timeCount');
const finalKillsEl = document.getElementById('finalKills');
const finalTimeEl = document.getElementById('finalTime');
const ambientAudio = document.getElementById('ambientAudio');

/** ========= RENDERER / SCENE / CAMERA ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
const player = new THREE.Group();
player.position.set(0, PLAYER_HEIGHT, 0);
player.add(camera);
scene.add(player);

const initialPosition = new THREE.Vector3(0, PLAYER_HEIGHT, 0);

/** ========= GAME STATE ========= */
let gameStarted = false;
let gameOver = false;
let killCount = 0;
let startTime = 0;
let currentTime = 0;

/** ========= HDRI ENVIRONMENT ========= */
const pmremGen = new THREE.PMREMGenerator(renderer);
pmremGen.compileEquirectangularShader();

async function setHDRI(url) {
  try {
    const hdr = await new Promise((res, rej) => 
      new RGBELoader().load(url, t => res(t), undefined, rej)
    );
    const env = pmremGen.fromEquirectangular(hdr).texture;
    scene.environment = env;
    hdr.dispose();
    pmremGen.dispose();
  } catch (e) {
    console.warn('Error cargando HDRI:', e);
  }
}
setHDRI('assets/hdr/Esenario.hdr');

/** ========= LUCES ========= */
const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0x8888cc, 0.6);
moonLight.position.set(20, 50, 20);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 1;
moonLight.shadow.camera.far = 150;
moonLight.shadow.camera.left = -WORLD_SIZE / 2;
moonLight.shadow.camera.right = WORLD_SIZE / 2;
moonLight.shadow.camera.top = WORLD_SIZE / 2;
moonLight.shadow.camera.bottom = -WORLD_SIZE / 2;
scene.add(moonLight);

/** ========= SUELO ========= */
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('assets/textures/graveyard/grass_dark.jpg');
grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(20, 20);

const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshStandardMaterial({
  map: grassTexture,
  roughness: 0.9,
  metalness: 0.1
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

/** ========= MURO LÍMITE ========= */
const wallHeight = 8;
const wallGeo = new THREE.CylinderGeometry(
  WORLD_RADIUS + 1, 
  WORLD_RADIUS + 1, 
  wallHeight, 
  64, 
  1, 
  true
);
const wallMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  side: THREE.BackSide,
  fog: false
});
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.y = wallHeight / 2;
scene.add(wall);

/** ========= AUDIO ========= */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

let ghostAudioBuffer = null;
audioLoader.load('assets/audio/ghost_boom.mp3', buf => {
  ghostAudioBuffer = buf;
});

function startAmbientAudio() {
  if (ambientAudio && ambientAudio.paused) {
    ambientAudio.volume = 0.3;
    ambientAudio.play().catch(() => {});
  }
}

function stopAmbientAudio() {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
  }
}

/** ========= COLISIONES ========= */
const colliders = [];

function addCollider(x, z, r) {
  colliders.push({ x, z, r });
}

function resolveCollisions(next) {
  for (const col of colliders) {
    const dx = next.x - col.x;
    const dz = next.z - col.z;
    const dist = Math.hypot(dx, dz);
    const minDist = PLAYER_RADIUS + col.r;
    
    if (dist < minDist) {
      const push = minDist - dist + 0.01;
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      next.x += nx * push;
      next.z += nz * push;
    }
  }
  
  // Límite del mundo
  const r = Math.hypot(next.x, next.z);
  if (r > WORLD_RADIUS - PLAYER_RADIUS) {
    const angle = Math.atan2(next.z, next.x);
    const maxR = WORLD_RADIUS - PLAYER_RADIUS;
    next.x = Math.cos(angle) * maxR;
    next.z = Math.sin(angle) * maxR;
  }
  
  return next;
}

/** ========= CRUCES (PLACEHOLDER) ========= */
function createCross() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.9,
    metalness: 0.1
  });
  
  const vertical = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 2, 0.3),
    material
  );
  vertical.position.y = 1;
  vertical.castShadow = true;
  vertical.receiveShadow = true;
  
  const horizontal = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.3, 0.3),
    material
  );
  horizontal.position.y = 1.5;
  horizontal.castShadow = true;
  horizontal.receiveShadow = true;
  
  const cross = new THREE.Group();
  cross.add(vertical, horizontal);
  
  return cross;
}

function addCross(x, z) {
  const cross = createCross();
  cross.position.set(x, 0, z);
  cross.rotation.y = Math.random() * Math.PI * 2;
  const scale = 0.8 + Math.random() * 0.4;
  cross.scale.setScalar(scale);
  scene.add(cross);
  addCollider(x, z, 0.5 * scale);
}

for (let i = 0; i < CROSS_COUNT; i++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * (WORLD_RADIUS - 15);
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  addCross(x, z);
}

/** ========= MODELOS GLTF (CALAVERAS Y ÁNGEL) ========= */
const gltfLoader = new GLTFLoader();

gltfLoader.load('assets/models/skull.glb', (gltf) => {
  for (let i = 0; i < SKULL_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * (WORLD_RADIUS - 12);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    const skull = gltf.scene.clone();
    skull.position.set(x, 0, z);
    skull.rotation.y = Math.random() * Math.PI * 2;
    const scale = 0.5 + Math.random() * 0.5;
    skull.scale.setScalar(scale);
    
    skull.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    scene.add(skull);
    addCollider(x, z, 0.4 * scale);
  }
}, undefined, (error) => {
  console.warn('Error cargando calaveras:', error);
});

gltfLoader.load('assets/models/angel_statue.glb', (gltf) => {
  for (let i = 0; i < ANGEL_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * (WORLD_RADIUS - 20);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    const angel = gltf.scene.clone();
    angel.position.set(x, 0, z);
    angel.rotation.y = Math.random() * Math.PI * 2;
    const scale = 1.5 + Math.random() * 0.8;
    angel.scale.setScalar(scale);
    
    angel.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    scene.add(angel);
    addCollider(x, z, 0.8 * scale);
  }
}, undefined, (error) => {
  console.warn('Error cargando estatuas:', error);
});

/** ========= FANTASMAS ========= */
const ghosts = [];
const fbxLoader = new FBXLoader();

fbxLoader.load('assets/models/ghost.fbx', (fbx) => {
  fbx.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.7,
        emissive: 0x666666,
        emissiveIntensity: 0.5
      });
    }
  });
  
  for (let i = 0; i < GHOST_COUNT; i++) {
    const ghost = fbx.clone();
    const scale = 0.01;
    ghost.scale.setScalar(scale);
    
    // Spawn detrás del jugador
    const angle = Math.random() * Math.PI * 2;
    const x = player.position.x + Math.cos(angle) * GHOST_SPAWN_DISTANCE;
    const z = player.position.z + Math.sin(angle) * GHOST_SPAWN_DISTANCE;
    ghost.position.set(x, 0, z);
    
    // Audio posicional
    const sound = new THREE.PositionalAudio(listener);
    if (ghostAudioBuffer) {
      sound.setBuffer(ghostAudioBuffer);
      sound.setRefDistance(10);
      sound.setLoop(true);
      sound.setVolume(0.5);
      sound.play();
    }
    ghost.add(sound);
    
    ghost.userData = {
      active: true,
      speed: GHOST_SPEED * (0.9 + Math.random() * 0.2),
      sound
    };
    
    scene.add(ghost);
    ghosts.push(ghost);
  }
}, undefined, (error) => {
  console.warn('Error cargando fantasmas:', error);
});

function updateGhosts(dt) {
  if (!gameStarted || gameOver) return;
  
  for (const ghost of ghosts) {
    if (!ghost.userData.active) continue;
    
    // Perseguir al jugador
    const dx = player.position.x - ghost.position.x;
    const dz = player.position.z - ghost.position.z;
    const dist = Math.hypot(dx, dz);
    
    if (dist > 0.5) {
      const nx = dx / dist;
      const nz = dz / dist;
      ghost.position.x += nx * ghost.userData.speed * dt;
      ghost.position.z += nz * ghost.userData.speed * dt;
      
      // Rotar hacia el jugador
      ghost.rotation.y = Math.atan2(dx, dz);
    }
    
    // Detectar colisión con jugador
    if (dist < GHOST_DAMAGE_DISTANCE) {
      triggerGameOver();
    }
  }
}

/** ========= LUZ SAGRADA (ARMA) ========= */
const lightBeamGeo = new THREE.ConeGeometry(0.5, LIGHT_BEAM_DISTANCE, 8, 1, true);
const lightBeamMat = new THREE.MeshBasicMaterial({
  color: 0xffffaa,
  transparent: true,
  opacity: 0.4,
  side: THREE.DoubleSide
});
const lightBeam = new THREE.Mesh(lightBeamGeo, lightBeamMat);
lightBeam.visible = false;
lightBeam.rotation.x = Math.PI / 2;
lightBeam.position.z = -LIGHT_BEAM_DISTANCE / 2;
scene.add(lightBeam);

function shootLightBeam(controller) {
  if (gameOver) return;
  
  lightBeam.visible = true;
  lightBeam.position.setFromMatrixPosition(controller.matrixWorld);
  
  const direction = new THREE.Vector3(0, 0, -1);
  direction.applyQuaternion(controller.quaternion);
  
  const beamEnd = lightBeam.position.clone().add(
    direction.multiplyScalar(LIGHT_BEAM_DISTANCE)
  );
  
  // Checkear fantasmas en el rayo
  for (const ghost of ghosts) {
    if (!ghost.userData.active) continue;
    
    const toGhost = new THREE.Vector3().subVectors(
      ghost.position, 
      lightBeam.position
    );
    const projection = toGhost.dot(direction);
    
    if (projection > 0 && projection < LIGHT_BEAM_DISTANCE) {
      const perpDist = toGhost.distanceTo(
        direction.clone().multiplyScalar(projection)
      );
      
      if (perpDist < 2) {
        ghost.userData.active = false;
        ghost.visible = false;
        if (ghost.userData.sound) {
          ghost.userData.sound.stop();
        }
        
        killCount++;
        if (killCountEl) killCountEl.textContent = String(killCount);
      }
    }
  }
  
  setTimeout(() => {
    lightBeam.visible = false;
  }, 100);
}

/** ========= VR CONTROLLERS ========= */
const vrBtn = VRButton.createButton(renderer);
vrBtn.classList.add('vr-button');
document.body.appendChild(vrBtn);

const controllerLeft = renderer.xr.getController(0);
const controllerRight = renderer.xr.getController(1);
player.add(controllerLeft, controllerRight);

const controllerModelFactory = new XRControllerModelFactory();
const grip0 = renderer.xr.getControllerGrip(0);
grip0.add(controllerModelFactory.createControllerModel(grip0));
player.add(grip0);

const grip1 = renderer.xr.getControllerGrip(1);
grip1.add(controllerModelFactory.createControllerModel(grip1));
player.add(grip1);

// Disparar con gatillo derecho
controllerRight.addEventListener('selectstart', () => {
  shootLightBeam(controllerRight);
});

// Reiniciar con botón secundario
controllerRight.addEventListener('squeezestart', () => {
  if (gameOver) {
    resetGame();
  } else {
    resetPosition();
  }
});

renderer.xr.addEventListener('sessionstart', () => {
  if (startScreen) startScreen.style.display = 'none';
  if (!gameStarted) {
    startGame();
  }
});

/** ========= LOCOMOCIÓN ========= */
function vrGamepadMove(dt) {
  if (gameOver) return;
  
  const session = renderer.xr.getSession();
  if (!session) return;
  
  for (const source of session.inputSources) {
    if (!source.gamepad) continue;
    
    let [x, y] = [source.gamepad.axes[2], source.gamepad.axes[3]];
    if (x === undefined || y === undefined) {
      x = source.gamepad.axes[0] ?? 0;
      y = source.gamepad.axes[1] ?? 0;
    }
    
    const deadzone = 0.15;
    if (Math.abs(x) < deadzone) x = 0;
    if (Math.abs(y) < deadzone) y = 0;
    if (x === 0 && y === 0) continue;
    
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    
    let next = player.position.clone();
    next.addScaledVector(forward, -y * MOVE_SPEED * dt);
    next.addScaledVector(right, x * MOVE_SPEED * dt);
    
    next = resolveCollisions(next);
    player.position.copy(next);
  }
}

/** ========= GAME LOGIC ========= */
function startGame() {
  gameStarted = true;
  gameOver = false;
  killCount = 0;
  startTime = performance.now();
  
  if (gameHUD) gameHUD.style.display = 'block';
  if (gameOverScreen) gameOverScreen.style.display = 'none';
  if (killCountEl) killCountEl.textContent = '0';
  if (timeCountEl) timeCountEl.textContent = '0';
  
  startAmbientAudio();
  
  // Reactivar fantasmas
  for (const ghost of ghosts) {
    ghost.userData.active = true;
    ghost.visible = true;
    
    // Respawn aleatorio
    const angle = Math.random() * Math.PI * 2;
    const x = player.position.x + Math.cos(angle) * GHOST_SPAWN_DISTANCE;
    const z = player.position.z + Math.sin(angle) * GHOST_SPAWN_DISTANCE;
    ghost.position.set(x, 0, z);
    
    if (ghost.userData.sound && ghostAudioBuffer) {
      ghost.userData.sound.play();
    }
  }
}

function triggerGameOver() {
  if (gameOver) return;
  
  gameOver = true;
  gameStarted = false;
  
  stopAmbientAudio();
  
  const survivalTime = Math.floor((performance.now() - startTime) / 1000);
  
  if (gameOverScreen) gameOverScreen.style.display = 'flex';
  if (finalKillsEl) finalKillsEl.textContent = String(killCount);
  if (finalTimeEl) finalTimeEl.textContent = String(survivalTime);
  
  // Detener audio de fantasmas
  for (const ghost of ghosts) {
    if (ghost.userData.sound) {
      ghost.userData.sound.stop();
    }
  }
}

function resetGame() {
  resetPosition();
  startGame();
}

function resetPosition() {
  player.position.copy(initialPosition);
}

/** ========= ANIMATION LOOP ========= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  
  if (renderer.xr.isPresenting) {
    vrGamepadMove(dt);
    updateGhosts(dt);
  }
  
  // Actualizar tiempo
  if (gameStarted && !gameOver) {
    currentTime = Math.floor((performance.now() - startTime) / 1000);
    if (timeCountEl) timeCountEl.textContent = String(currentTime);
  }
  
  renderer.render(scene, camera);
});

/** ========= RESIZE ========= */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});