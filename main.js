// main.js - Cementerio Fantasma VR: Simplificado y Corregido
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/** ========= CONFIG ========= */
const WORLD_RADIUS = 50;
const PLAYER_RADIUS = 0.35;
const GAME_DURATION = 60;
let gameTime = 0;
let gameActive = false;
let ghosts = [];
const WALK_SPEED = 4.0;
const STRAFE_SPEED = 3.2;
const GHOST_SPEED = 2.8;

/** ========= DOM / UI ========= */
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const resultEl = document.getElementById('result');

/** ========= RENDERER / SCENES ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;

// IMPORTANTE: Crear VRButton después de habilitar XR
const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010408);
scene.fog = new THREE.FogExp2(0x010408, 0.015);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
const player = new THREE.Group();
player.position.set(0, 1.6, 0);
player.add(camera);
scene.add(player);

/** ========= HDRI / LUCES ========= */
const pmremGen = new THREE.PMREMGenerator(renderer);
new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonlit_golf_1k.hdr', (tex) => {
    const env = pmremGen.fromEquirectangular(tex).texture;
    scene.environment = env;
    tex.dispose();
    pmremGen.dispose();
});

const moonLight = new THREE.DirectionalLight(0xaad4ff, 1.8);
moonLight.position.set(30, 80, -50);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 150;
scene.add(moonLight);

const ambient = new THREE.HemisphereLight(0x4b6b8a, 0x0a0e15, 0.4);
scene.add(ambient);

/** ========= CIELO + LUNA ========= */
const skyGeo = new THREE.SphereGeometry(1500, 60, 40);
const skyMat = new THREE.MeshBasicMaterial({ color: 0x01040a, side: THREE.BackSide, fog: false });
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

const moonTex = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/moon_1024.jpg');
const moon = new THREE.Mesh(new THREE.SphereGeometry(35, 64, 64), new THREE.MeshBasicMaterial({ map: moonTex, fog: false }));
scene.add(moon);

/** ========= PISO DE CEMENTERIO MEJORADO ========= */
function createCemeteryGround() {
    const groundGroup = new THREE.Group();
    
    // Suelo base oscuro
    const groundGeometry = new THREE.CircleGeometry(WORLD_RADIUS + 15, 64);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.9,
        metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    groundGroup.add(ground);
    
    // Agregar texturas de hierba en parches
    const grassColors = [0x2d4a2d, 0x3a5a3a, 0x455c45, 0x2e382e];
    const grassPatches = 80;
    
    for (let i = 0; i < grassPatches; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * WORLD_RADIUS;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        const patchSize = 2 + Math.random() * 4;
        const patchGeometry = new THREE.PlaneGeometry(patchSize, patchSize);
        const patchMaterial = new THREE.MeshStandardMaterial({ 
            color: grassColors[Math.floor(Math.random() * grassColors.length)],
            roughness: 1.0,
            metalness: 0.0
        });
        
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(x, 0.01, z);
        patch.receiveShadow = true;
        groundGroup.add(patch);
    }
    
    // Agregar caminos de tierra
    const pathPoints = 8;
    for (let i = 0; i < pathPoints; i++) {
        const angle = (i / pathPoints) * Math.PI * 2;
        const nextAngle = ((i + 1) / pathPoints) * Math.PI * 2;
        
        const startX = Math.cos(angle) * 8;
        const startZ = Math.sin(angle) * 8;
        const endX = Math.cos(nextAngle) * 8;
        const endZ = Math.sin(nextAngle) * 8;
        
        const pathGeometry = new THREE.PlaneGeometry(2, 16);
        const pathMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x5d4037,
            roughness: 0.8
        });
        
        const path = new THREE.Mesh(pathGeometry, pathMaterial);
        path.rotation.x = -Math.PI / 2;
        path.position.set((startX + endX) / 2, 0.02, (startZ + endZ) / 2);
        path.rotation.y = angle + Math.PI / 2;
        groundGroup.add(path);
    }
    
    scene.add(groundGroup);
    return groundGroup;
}

/** ========= REJAS SIMPLIFICADAS ========= */
function createFence() {
    const fenceGroup = new THREE.Group();
    const segments = 48;
    const fenceRadius = WORLD_RADIUS + 2.5;
    
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const nextAngle = ((i + 1) / segments) * Math.PI * 2;
        
        // Poste de la reja
        const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 4);
        const postMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const post = new THREE.Mesh(postGeometry, postMaterial);
        
        post.position.set(
            Math.cos(angle) * fenceRadius,
            2,
            Math.sin(angle) * fenceRadius
        );
        fenceGroup.add(post);
        
        // Barra horizontal
        const barGeometry = new THREE.BoxGeometry(0.05, 0.05, fenceRadius * Math.PI * 2 / segments);
        const barMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        
        bar.position.set(
            Math.cos(angle) * fenceRadius,
            3.5,
            Math.sin(angle) * fenceRadius
        );
        bar.rotation.y = angle + Math.PI / 2;
        fenceGroup.add(bar);
    }
    
    scene.add(fenceGroup);
    return fenceGroup;
}

/** ========= SISTEMA DE CARGA DE MODELOS MEJORADO ========= */
let angelModel = null;
let skullModel = null;
let ghostModel = null;

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

// Función mejorada para cargar modelos
function loadModel(path, isFBX = false) {
    return new Promise((resolve, reject) => {
        const loader = isFBX ? fbxLoader : gltfLoader;
        
        loader.load(path, 
            (object) => {
                console.log('✅ Modelo cargado:', path);
                const model = object.scene || object;
                
                // Configuración estándar para todos los modelos
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        if (child.material) {
                            // Materiales más visibles
                            child.material.roughness = 0.8;
                            child.material.metalness = 0.2;
                        }
                    }
                });
                
                resolve(model);
            },
            undefined,
            (error) => {
                console.warn('❌ Error cargando modelo:', path, error);
                reject(error);
            }
        );
    });
}

async function loadAllModels() {
    console.log('🎮 Cargando modelos...');
    
    try {
        // Cargar ángel (GLB/GLTF)
        angelModel = await loadModel('assets/models/angel_statue.glb').catch(() => {
            return loadModel('assets/models/angel_statue.gltf').catch(() => {
                return loadModel('assets/models/angel_statue.fbx', true);
            });
        });
    } catch (e) {
        console.warn('No se pudo cargar el modelo de ángel, usando placeholder');
        angelModel = createAngelPlaceholder();
    }
    
    try {
        // Cargar calavera (GLB/GLTF/FBX)
        skullModel = await loadModel('assets/models/skull.glb').catch(() => {
            return loadModel('assets/models/skull.gltf').catch(() => {
                return loadModel('assets/models/skull.fbx', true);
            });
        });
        // Ajustar calavera
        skullModel.scale.setScalar(1.2);
        skullModel.position.y = 0.3;
    } catch (e) {
        console.warn('No se pudo cargar el modelo de calavera, usando placeholder');
        skullModel = createSkullPlaceholder();
    }
    
    try {
        // Cargar fantasma (FBX/GLB)
        ghostModel = await loadModel('assets/models/ghost.fbx', true).catch(() => {
            return loadModel('assets/models/ghost.glb').catch(() => {
                return loadModel('assets/models/ghost.gltf');
            });
        });
        // Configurar fantasma para ser transparente
        ghostModel.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.opacity = 0.8;
            }
        });
    } catch (e) {
        console.warn('No se pudo cargar el modelo de fantasma, usando sistema básico');
        ghostModel = null;
    }
    
    console.log('🎮 Todos los modelos cargados');
}

// Placeholders mejorados
function createAngelPlaceholder() {
    const group = new THREE.Group();
    
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.5, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    
    const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.8, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0xcccccc })
    );
    body.position.y = 1.8;
    
    const wings = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide })
    );
    wings.position.set(0, 2, 0.8);
    wings.rotation.x = Math.PI / 4;
    
    group.add(base, body, wings);
    return group;
}

function createSkullPlaceholder() {
    const group = new THREE.Group();
    
    const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 })
    );
    
    const jaw = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 4),
        new THREE.MeshStandardMaterial({ color: 0xdddddd })
    );
    jaw.position.y = -0.2;
    jaw.scale.y = 0.5;
    
    group.add(skull, jaw);
    group.position.y = 0.3;
    return group;
}

function createGhostPlaceholder() {
    const group = new THREE.Group();
    
    const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 12, 8),
        new THREE.MeshBasicMaterial({ 
            color: 0x88ddff, 
            transparent: true, 
            opacity: 0.8 
        })
    );
    body.scale.y = 1.5;
    
    const eyes = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff0000, emissive: 0xff0000 })
    );
    eyes.position.set(-0.2, 0.3, 0.4);
    
    const eyes2 = eyes.clone();
    eyes2.position.set(0.2, 0.3, 0.4);
    
    group.add(body, eyes, eyes2);
    return group;
}

/** ========= OBJETOS DEL CEMENTERIO ========= */
function randomCirclePos(radius) {
    const angle = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * (radius - 8);
    return new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
}

// Tumbas básicas
function createGraves() {
    for (let i = 0; i < 50; i++) {
        const pos = randomCirclePos(WORLD_RADIUS - 6);
        const grave = new THREE.Group();
        
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.3, 0.9),
            new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        
        const cross = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 1.8, 0.15),
            new THREE.MeshStandardMaterial({ color: 0x222222 })
        );
        cross.position.y = 0.9;
        
        grave.add(base, cross);
        grave.position.copy(pos);
        grave.position.y = 0.15;
        grave.rotation.y = Math.random() * Math.PI;
        grave.scale.setScalar(0.6 + Math.random() * 0.6);
        grave.castShadow = true;
        
        scene.add(grave);
    }
}

// Estatuas de ángel
function spawnAngels() {
    for (let i = 0; i < 12; i++) {
        const pos = randomCirclePos(WORLD_RADIUS - 10);
        const angel = angelModel.clone();
        angel.position.copy(pos);
        angel.position.y = 0;
        angel.rotation.y = Math.random() * Math.PI * 2;
        angel.scale.setScalar(1.5 + Math.random() * 0.7);
        scene.add(angel);
    }
}

// Calaveras decorativas
function spawnSkulls() {
    for (let i = 0; i < 25; i++) {
        const pos = randomCirclePos(WORLD_RADIUS - 5);
        const skull = skullModel.clone();
        skull.position.copy(pos);
        skull.position.y = 0.3;
        skull.rotation.y = Math.random() * Math.PI * 2;
        skull.rotation.x = (Math.random() - 0.5) * 0.5;
        skull.scale.setScalar(0.8 + Math.random() * 0.5);
        scene.add(skull);
    }
}

/** ========= AUDIO MEJORADO ========= */
let ambientMusic = null;
let isMusicPlaying = false;

function setupAudio() {
    const listener = new THREE.AudioListener();
    camera.add(listener);
    
    // Crear audio solo una vez
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('assets/audio/terror_ambient.mp3', (buffer) => {
        ambientMusic = new THREE.Audio(listener);
        ambientMusic.setBuffer(buffer);
        ambientMusic.setLoop(true);
        ambientMusic.setVolume(0.5);
        
        console.log('🎵 Audio cargado correctamente');
    });
}

function playMusic() {
    if (ambientMusic && !isMusicPlaying) {
        ambientMusic.play();
        isMusicPlaying = true;
        console.log('🎵 Reproduciendo música');
    }
}

function stopMusic() {
    if (ambientMusic && isMusicPlaying) {
        ambientMusic.stop();
        isMusicPlaying = false;
        console.log('🎵 Música detenida');
    }
}

/** ========= SISTEMA DE FANTASMAS MEJORADO ========= */
function spawnGhost() {
    if (!gameActive) return;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 15 + Math.random() * 20;
    const pos = new THREE.Vector3(
        Math.cos(angle) * distance,
        1.6,
        Math.sin(angle) * distance
    );

    const ghost = new THREE.Group();
    
    // Usar modelo 3D o placeholder
    let ghostMesh;
    if (ghostModel) {
        ghostMesh = ghostModel.clone();
        ghostMesh.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.opacity = 0.0; // Empezar transparente
            }
        });
    } else {
        ghostMesh = createGhostPlaceholder();
        ghostMesh.traverse((child) => {
            if (child.material) {
                child.material.opacity = 0.0;
            }
        });
    }
    
    ghost.add(ghostMesh);
    ghost.position.copy(pos);
    ghost.userData = { 
        scared: false,
        speed: GHOST_SPEED * (0.7 + Math.random() * 0.6)
    };
    
    scene.add(ghost);
    ghosts.push(ghost);

    // Efecto de aparición
    let opacity = 0;
    const fadeIn = () => {
        if (!ghost.parent || ghost.userData.scared) return;
        
        opacity += 0.03;
        ghost.traverse((child) => {
            if (child.isMesh && child.material && child.material.opacity !== undefined) {
                child.material.opacity = Math.min(opacity, 0.85);
            }
        });
        
        if (opacity < 0.85) {
            requestAnimationFrame(fadeIn);
        }
    };
    fadeIn();
}

function updateGhosts(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const ghost = ghosts[i];
        if (!ghost.parent || ghost.userData.scared) continue;

        // Movimiento hacia el jugador
        const direction = new THREE.Vector3()
            .subVectors(player.position, ghost.position)
            .normalize();
        
        ghost.position.add(direction.multiplyScalar(ghost.userData.speed * dt));
        ghost.position.y = 1.6;
        
        // Rotar para mirar al jugador
        ghost.lookAt(player.position.x, ghost.position.y, player.position.z);
        
        // Colisión
        if (ghost.position.distanceTo(player.position) < 1.8) {
            endGame('¡Un fantasma te atrapó!');
            return;
        }
    }
}

function scareGhost(controller) {
    if (!controller) return false;
    
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    
    origin.setFromMatrixPosition(controller.matrixWorld);
    direction.transformDirection(controller.matrixWorld);
    
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const ghost = ghosts[i];
        if (!ghost.parent || ghost.userData.scared) continue;
        
        const toGhost = new THREE.Vector3().subVectors(ghost.position, origin);
        const distance = toGhost.length();
        
        if (distance > 20) continue;
        
        toGhost.normalize();
        const angle = toGhost.dot(direction);
        
        if (angle > 0.5) {
            // Flash de luz
            const flash = new THREE.PointLight(0xffffff, 10, 25, 1.5);
            flash.position.copy(origin);
            scene.add(flash);
            setTimeout(() => scene.remove(flash), 100);
            
            // Desaparecer fantasma
            ghost.userData.scared = true;
            const fadeOut = () => {
                if (!ghost.parent) return;
                
                let allInvisible = true;
                ghost.traverse((child) => {
                    if (child.isMesh && child.material && child.material.opacity !== undefined) {
                        child.material.opacity -= 0.1;
                        if (child.material.opacity > 0) {
                            allInvisible = false;
                        }
                    }
                });
                
                if (!allInvisible) {
                    requestAnimationFrame(fadeOut);
                } else {
                    scene.remove(ghost);
                    ghosts.splice(i, 1);
                }
            };
            fadeOut();
            
            return true;
        }
    }
    return false;
}

/** ========= VR CONTROLS ========= */
const controllerModelFactory = new XRControllerModelFactory();
const controllerLeft = renderer.xr.getController(0);
const controllerRight = renderer.xr.getController(1);

controllerRight.addEventListener('selectstart', () => {
    scareGhost(controllerRight);
});

scene.add(controllerLeft, controllerRight);

const gripLeft = renderer.xr.getControllerGrip(0);
gripLeft.add(controllerModelFactory.createControllerModel(gripLeft));
scene.add(gripLeft);

const gripRight = renderer.xr.getControllerGrip(1);
gripRight.add(controllerModelFactory.createControllerModel(gripRight));
scene.add(gripRight);

function vrGamepadMove(dt) {
    const session = renderer.xr.getSession();
    if (!session) return;
    
    for (const src of session.inputSources) {
        if (!src.gamepad || src.handedness !== 'left') continue;
        
        const gp = src.gamepad;
        let x = gp.axes[2] || gp.axes[0] || 0;
        let y = gp.axes[3] || gp.axes[1] || 0;
        
        const deadzone = 0.15;
        if (Math.abs(x) < deadzone) x = 0;
        if (Math.abs(y) < deadzone) y = 0;
        
        if (x === 0 && y === 0) continue;

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const delta = player.position.clone()
            .add(forward.clone().multiplyScalar(-y * WALK_SPEED * dt))
            .add(right.multiplyScalar(x * STRAFE_SPEED * dt));

        const r = Math.hypot(delta.x, delta.z);
        if (r > WORLD_RADIUS - PLAYER_RADIUS - 2) {
            const ang = Math.atan2(delta.z, delta.x);
            delta.x = Math.cos(ang) * (WORLD_RADIUS - PLAYER_RADIUS - 2);
            delta.z = Math.sin(ang) * (WORLD_RADIUS - PLAYER_RADIUS - 2);
        }
        player.position.copy(delta);
    }
}

/** ========= JUEGO ========= */
function startGame() {
    // Limpiar fantasmas anteriores
    ghosts.forEach(ghost => scene.remove(ghost));
    ghosts = [];
    
    gameTime = GAME_DURATION;
    gameActive = true;
    
    // Siempre reproducir música al empezar juego
    playMusic();
    
    overlay.classList.add('hidden');

    // Spawn de fantasmas
    const spawnLoop = () => {
        if (!gameActive) return;
        spawnGhost();
        setTimeout(spawnLoop, 3000 + Math.random() * 4000);
    };
    setTimeout(spawnLoop, 2000);
}

function endGame(message) {
    gameActive = false;
    resultEl.textContent = message;
    overlay.classList.remove('hidden');
    //stopMusic();
}

startBtn.onclick = startGame;

/** ========= INIT Y LOOP ========= */
const clock = new THREE.Clock();

async function init() {
    console.log('🚀 Inicializando juego...');
    
    // Crear escenario primero
    createCemeteryGround();
    createFence();
    createGraves();
    
    // Cargar modelos
    await loadAllModels();
    
    // Spawn de objetos con modelos
    spawnAngels();
    spawnSkulls();
    
    // Configurar audio
    setupAudio();
    
    console.log('✅ Juego inicializado correctamente');
    renderer.setAnimationLoop(loop);
}

function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (renderer.xr.isPresenting) {
        vrGamepadMove(dt);
    }

    if (gameActive) {
        gameTime -= dt;
        if (timerEl) timerEl.textContent = Math.max(0, gameTime.toFixed(1)) + 's';

        updateGhosts(dt);

        if (gameTime <= 0) {
            endGame('¡SOBREVIVISTE!');
        }
    }

    // Actualizar luna y cielo
    moon.position.set(player.position.x + 80, 100, player.position.z - 150);
    sky.position.copy(player.position);

    renderer.render(scene, camera);
}

// Iniciar el juego
init();

/** ========= RESIZE ========= */
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});