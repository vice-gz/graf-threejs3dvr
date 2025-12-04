import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/** ========= CONFIGURACIÓN PRINCIPAL ========= */
// MUNDO
const WORLD_SIZE = 200;
const WORLD_RADIUS = WORLD_SIZE * 0.5 - 2;
const FOG_DENSITY = 0.035;

// JUGADOR
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 3;

// FANTASMAS
const GHOST_COUNT = 7.2; // Más fantasmas
const GHOST_SPEED = 1.5; // Más lentos
const GHOST_SPAWN_DISTANCE = 30;
const GHOST_DAMAGE_DISTANCE = 1.2;
const GHOST_SCALE = 0.012; // Escala del modelo FBX

// ORBES DE LUZ (PROYECTILES)
const LIGHT_ORB_SPEED = 20;
const LIGHT_ORB_SIZE = 0.4;
const LIGHT_ORB_LIFETIME = 4.0;
const LIGHT_ORB_HIT_RADIUS = 3.2;
const LIGHT_ORB_COLOR = 0xffffdd;
const LIGHT_ORB_LIGHT_INTENSITY = 200;
const LIGHT_ORB_LIGHT_DISTANCE = 12;

// OBJETOS DEL ESCENARIO
const CROSS_COUNT = 30;
const CROSS_SCALE_MIN = 1;
const CROSS_SCALE_MAX = 1.5;
const CROSS_COLLISION_RADIUS = 0.5;

const SKULL_COUNT = 25;
const SKULL_SCALE_MIN = 0.2;
const SKULL_SCALE_MAX = 0.5;
const SKULL_COLLISION_RADIUS = 0.6;
const SKULL_HEIGHT_OFFSET = 1.2; // Altura sobre el suelo

const ANGEL_COUNT = 20;
const ANGEL_SCALE_MIN = 2; // MUCHO más grandes
const ANGEL_SCALE_MAX = 3; // MUCHO más grandes
const ANGEL_COLLISION_RADIUS = 3.0;
const ANGEL_HEIGHT_OFFSET = 1.2; // Altura sobre el suelo

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
  const scale = CROSS_SCALE_MIN + Math.random() * (CROSS_SCALE_MAX - CROSS_SCALE_MIN);
  
  // Aplicar escala a cada eje individualmente
  cross.scale.x = scale;
  cross.scale.y = scale;
  cross.scale.z = scale;
  
  cross.position.set(x, 0, z);
  cross.rotation.y = Math.random() * Math.PI * 2;
  scene.add(cross);
  addCollider(x, z, CROSS_COLLISION_RADIUS * scale);
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
  console.log('Calaveras cargadas, generando', SKULL_COUNT);
  for (let i = 0; i < SKULL_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * (WORLD_RADIUS - 12);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    const skull = gltf.scene.clone();
    const scale = SKULL_SCALE_MIN + Math.random() * (SKULL_SCALE_MAX - SKULL_SCALE_MIN);
    
    // Aplicar escala a cada eje individualmente
    skull.scale.x = scale;
    skull.scale.y = scale;
    skull.scale.z = scale;
    
    skull.position.set(x, SKULL_HEIGHT_OFFSET, z);
    skull.rotation.y = Math.random() * Math.PI * 2;
    
    skull.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    scene.add(skull);
    addCollider(x, z, SKULL_COLLISION_RADIUS * scale);
    console.log(`Calavera ${i}: escala=${scale.toFixed(2)}, pos=(${x.toFixed(1)}, ${SKULL_HEIGHT_OFFSET}, ${z.toFixed(1)})`);
  }
}, undefined, (error) => {
  console.warn('Error cargando calaveras:', error);
});

gltfLoader.load('assets/models/angel_statue.glb', (gltf) => {
  console.log('Ángeles cargados, generando', ANGEL_COUNT);
  for (let i = 0; i < ANGEL_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * (WORLD_RADIUS - 20);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    const angel = gltf.scene.clone();
    const scale = ANGEL_SCALE_MIN + Math.random() * (ANGEL_SCALE_MAX - ANGEL_SCALE_MIN);
    
    // Aplicar escala a cada eje individualmente
    angel.scale.x = scale;
    angel.scale.y = scale;
    angel.scale.z = scale;
    
    angel.position.set(x, ANGEL_HEIGHT_OFFSET, z);
    angel.rotation.y = Math.random() * Math.PI * 2;
    
    angel.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    scene.add(angel);
    addCollider(x, z, ANGEL_COLLISION_RADIUS * scale);
    console.log(`Ángel ${i}: escala=${scale.toFixed(2)}, pos=(${x.toFixed(1)}, ${ANGEL_HEIGHT_OFFSET}, ${z.toFixed(1)})`);
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
  
  console.log('Fantasmas cargados, generando', GHOST_COUNT);
  
  for (let i = 0; i < GHOST_COUNT; i++) {
    const ghost = fbx.clone();
    ghost.scale.x = GHOST_SCALE;
    ghost.scale.y = GHOST_SCALE;
    ghost.scale.z = GHOST_SCALE;
    
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
    
    console.log(`Fantasma ${i}: velocidad=${ghost.userData.speed.toFixed(2)}, pos=(${x.toFixed(1)}, 0, ${z.toFixed(1)})`);
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

/** ========= SISTEMA DE PARTÍCULAS ========= */
function createGhostParticles(position) {
  const particleCount = 50;
  const particles = [];
  
  for (let i = 0; i < particleCount; i++) {
    const particleGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8
    });
    const particle = new THREE.Mesh(particleGeo, particleMat);
    
    particle.position.copy(position);
    
    // Velocidad aleatoria en todas direcciones
    const speed = 2 + Math.random() * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    particle.userData = {
      velocity: new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed
      ),
      lifetime: 1.0,
      age: 0
    };
    
    scene.add(particle);
    particles.push(particle);
  }
  
  return particles;
}

const particleSystems = [];

function updateParticles(dt) {
  for (let i = particleSystems.length - 1; i >= 0; i--) {
    const particles = particleSystems[i];
    let allDead = true;
    
    for (let j = particles.length - 1; j >= 0; j--) {
      const particle = particles[j];
      particle.userData.age += dt;
      
      if (particle.userData.age < particle.userData.lifetime) {
        allDead = false;
        
        // Mover partícula
        particle.position.add(
          particle.userData.velocity.clone().multiplyScalar(dt)
        );
        
        // Aplicar gravedad
        particle.userData.velocity.y -= 5 * dt;
        
        // Fade out
        const life = 1 - (particle.userData.age / particle.userData.lifetime);
        particle.material.opacity = life * 0.8;
        particle.scale.setScalar(life);
      } else {
        // Eliminar partícula
        scene.remove(particle);
        particle.geometry.dispose();
        particle.material.dispose();
        particles.splice(j, 1);
      }
    }
    
    if (allDead || particles.length === 0) {
      particleSystems.splice(i, 1);
    }
  }
}

/** ========= ORBES DE LUZ (PROYECTILES) ========= */
const lightOrbs = [];

function createLightOrb(position, direction) {
  // Esfera visible
  const orbGeo = new THREE.SphereGeometry(LIGHT_ORB_SIZE, 16, 16);
  const orbMat = new THREE.MeshBasicMaterial({
    color: LIGHT_ORB_COLOR,
    transparent: true,
    opacity: 0.95
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.copy(position);
  
  // Luz puntual para iluminar alrededor
  const light = new THREE.PointLight(
    LIGHT_ORB_COLOR, 
    LIGHT_ORB_LIGHT_INTENSITY, 
    LIGHT_ORB_LIGHT_DISTANCE
  );
  orb.add(light);
  
  // Trail/estela opcional
  const trailGeo = new THREE.SphereGeometry(LIGHT_ORB_SIZE * 0.6, 12, 12);
  const trailMat = new THREE.MeshBasicMaterial({
    color: LIGHT_ORB_COLOR,
    transparent: true,
    opacity: 0.4
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  orb.add(trail);
  
  orb.userData = {
    velocity: direction.clone().normalize().multiplyScalar(LIGHT_ORB_SPEED),
    lifetime: LIGHT_ORB_LIFETIME,
    age: 0
  };
  
  scene.add(orb);
  lightOrbs.push(orb);
  
  return orb;
}

function updateLightOrbs(dt) {
  for (let i = lightOrbs.length - 1; i >= 0; i--) {
    const orb = lightOrbs[i];
    orb.userData.age += dt;
    
    // Mover orbe
    orb.position.add(
      orb.userData.velocity.clone().multiplyScalar(dt)
    );
    
    // Rotación para efecto visual
    orb.rotation.x += dt * 3;
    orb.rotation.y += dt * 2;
    
    // Checkear colisión con fantasmas
    let hitGhost = false;
    for (const ghost of ghosts) {
      if (!ghost.userData.active) continue;
      
      const dist = orb.position.distanceTo(ghost.position);
      
      if (dist < LIGHT_ORB_HIT_RADIUS) {
        // ¡COLISIÓN! Eliminar fantasma con efecto de partículas
        ghost.userData.active = false;
        
        // Crear partículas en la posición del fantasma
        const particles = createGhostParticles(ghost.position.clone());
        particleSystems.push(particles);
        
        // Ocultar fantasma después de un frame
        setTimeout(() => {
          ghost.visible = false;
        }, 50);
        
        if (ghost.userData.sound) {
          ghost.userData.sound.stop();
        }
        
        killCount++;
        if (killCountEl) killCountEl.textContent = String(killCount);
        
        console.log(`¡Fantasma eliminado! Total: ${killCount}`);
        
        hitGhost = true;
        break;
      }
    }
    
    // Eliminar orbe si golpeó o expiró
    if (hitGhost || 
        orb.userData.age > orb.userData.lifetime || 
        orb.position.length() > WORLD_RADIUS * 1.5) {
      
      scene.remove(orb);
      if (orb.geometry) orb.geometry.dispose();
      if (orb.material) orb.material.dispose();
      
      // Limpiar hijos (luz y trail)
      orb.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      
      lightOrbs.splice(i, 1);
    }
  }
}

function shootLightOrb(controller) {
  if (gameOver || !gameStarted) return;
  
  // Posición del controlador en el mundo
  const worldPosition = new THREE.Vector3();
  controller.getWorldPosition(worldPosition);
  
  // Dirección del controlador en el mundo
  const worldQuaternion = new THREE.Quaternion();
  controller.getWorldQuaternion(worldQuaternion);
  
  const direction = new THREE.Vector3(0, 0, -1);
  direction.applyQuaternion(worldQuaternion);
  direction.normalize();
  
  // Offset para que salga del controlador
  worldPosition.add(direction.clone().multiplyScalar(0.2));
  
  createLightOrb(worldPosition, direction);
  
  console.log('Orbe disparado desde:', worldPosition, 'dirección:', direction);
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
  shootLightOrb(controllerRight);
});

// También permitir disparar con izquierdo
controllerLeft.addEventListener('selectstart', () => {
  shootLightOrb(controllerLeft);
});

// Reiniciar con botón secundario
controllerRight.addEventListener('squeezestart', () => {
  if (gameOver) {
    resetGame();
  } else {
    resetPosition();
  }
});

controllerLeft.addEventListener('squeezestart', () => {
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
  
  // Limpiar orbes
  for (const orb of lightOrbs) {
    scene.remove(orb);
    if (orb.geometry) orb.geometry.dispose();
    if (orb.material) orb.material.dispose();
  }
  lightOrbs.length = 0;
  
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
    updateLightOrbs(dt);
    updateParticles(dt); // Actualizar partículas
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