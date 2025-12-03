// main.js - Cementerio Fantasma VR: Corregido
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
const GHOST_COUNT = 8;
const WALK_SPEED = 4.0;
const STRAFE_SPEED = 3.2;
const GHOST_SPEED = 2.8;
const FOG_DENSITY = 0.015;
const MAX_SLOPE_DEG = 45;
const ARC_STEPS = 40;
const ARC_SPEED = 7.5;
const ARC_GRAVITY = 9.8;
const HDRI_LOCAL = 'assets/hdr/moonlit_golf_1k.hdr';
const HDRI_FALLBACK = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonlit_golf_1k.hdr';

/** ========= DOM / UI ========= */
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const resultEl = document.getElementById('result');
const ambientEl = document.getElementById('ambient');

/** ========= RENDERER / SCENES / CAMERA ========= */
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
renderer.autoClear = true;

// Escena principal
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010408);
scene.fog = new THREE.FogExp2(0x010408, FOG_DENSITY);

// Escena de fondo (cielo/estrellas/luna) - sin niebla
const bgScene = new THREE.Scene();
const bgCam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 5000);

// Cámara del jugador
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
const player = new THREE.Group();
player.position.set(0, 1.6, 0);
player.add(camera);
scene.add(player);

/** ========= IBL / HDRI ========= */
const pmremGen = new THREE.PMREMGenerator(renderer);
pmremGen.compileEquirectangularShader();
async function setHDRI(url) {
    const hdr = await new Promise((res, rej) => new RGBELoader().load(url, (t) => res(t), undefined, rej));
    const env = pmremGen.fromEquirectangular(hdr).texture;
    scene.environment = env;
    hdr.dispose(); 
    pmremGen.dispose();
}
setHDRI(HDRI_LOCAL).catch(() => setHDRI(HDRI_FALLBACK).catch(e => console.warn('Sin HDRI:', e)));

/** ========= LUCES ========= */
const moonLight = new THREE.DirectionalLight(0xaad4ff, 2.0); // Luz más intensa
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 150;
scene.add(moonLight);

const ambient = new THREE.HemisphereLight(0x4b6b8a, 0x0a0e15, 0.5); // Más iluminación ambiental
scene.add(ambient);

/** ========= CIELO / ESTRELLAS / LUNA en bgScene ========= */
// Skydome shader
const skyGeo = new THREE.SphereGeometry(1500, 60, 40);
const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
        topColor: { value: new THREE.Color(0x0a1f35) },
        bottomColor: { value: new THREE.Color(0x050910) }
    },
    vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        void main(){
            float t = smoothstep(-0.2, 0.8, vDir.y);
            vec3 col = mix(bottomColor, topColor, t);
            gl_FragColor = vec4(col, 1.0);
        }
    `
});
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.renderOrder = -2;
skyMesh.frustumCulled = false;
bgScene.add(skyMesh);

// Estrellas con Points
const starCount = 3000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
    const r = 1400 + Math.random() * 400;
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3 + 0] = r * Math.sin(b) * Math.cos(a);
    starPositions[i * 3 + 1] = r * Math.cos(b);
    starPositions[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    color: 0xffffff,
    fog: false,
    depthTest: false,
    transparent: true,
    opacity: 0.95
});
const starField = new THREE.Points(starGeo, starMat);
starField.renderOrder = -1;
starField.matrixAutoUpdate = false;
starField.frustumCulled = false;
bgScene.add(starField);

// Luna en bgScene
const moonTex = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/moon_1024.jpg');
const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, fog: false, depthTest: false });
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(35, 64, 64), moonMat);
moonMesh.renderOrder = 1;
moonMesh.frustumCulled = false;
bgScene.add(moonMesh);

/** ========= MURO PERIMETRAL ========= */
const wallHeight = 6;
const wallGeo = new THREE.CylinderGeometry(WORLD_RADIUS + 2.5, WORLD_RADIUS + 2.5, wallHeight, 64, 1, true);
const wallMat = new THREE.MeshBasicMaterial({ 
    color: 0x000000, 
    side: THREE.BackSide, 
    fog: false,
    transparent: true,
    opacity: 0.7
});
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.y = wallHeight / 2;
wallMesh.renderOrder = 5;
scene.add(wallMesh);

/** ========= PERLIN NOISE & TERRENO ========= */
function makePerlin(seed = 1337) {
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    let n, q;
    for (let i = 255; i > 0; i--) { 
        n = Math.floor((seed = (seed * 16807) % 2147483647) / 2147483647 * (i + 1)); 
        q = p[i]; p[i] = p[n]; p[n] = q; 
    }
    for (let i = 0; i < 256; i++) p[256 + i] = p[i];
    const grad = (h, x, y) => { 
        switch(h & 3) {
            case 0: return x + y;
            case 1: return -x + y;
            case 2: return x - y;
            default: return -x - y;
        }
    };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    return function noise(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; 
        x -= Math.floor(x); 
        y -= Math.floor(y);
        const u = fade(x), v = fade(y), A = p[X] + Y, B = p[X + 1] + Y;
        return lerp(
            lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
            lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), 
            v
        );
    };
}
const noise2D = makePerlin(2025);

// Crear terreno con ruido Perlin
const TERRAIN_SIZE = WORLD_RADIUS * 2;
const TERRAIN_RES = 128;
const TERRAIN_MAX_H = 1.2;

const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RES, TERRAIN_RES);
terrainGeo.rotateX(-Math.PI / 2);
const tPos = terrainGeo.attributes.position;
for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i);
    const h = noise2D(x * 0.02, z * 0.02) * 0.6 + 
              noise2D(x * 0.05, z * 0.05) * 0.25 + 
              noise2D(x * 0.1, z * 0.1) * 0.1;
    tPos.setY(i, h * TERRAIN_MAX_H);
}
tPos.needsUpdate = true;
terrainGeo.computeVertexNormals();

// Textura del terreno
const texLoader = new THREE.TextureLoader();
const groundColor = texLoader.load('assets/textures/ground/ground_color.jpg');
groundColor.wrapS = groundColor.wrapT = THREE.RepeatWrapping;
groundColor.repeat.set(16, 16);

const terrainMat = new THREE.MeshStandardMaterial({
    map: groundColor,
    color: 0x2a2a2a,
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.DoubleSide
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
scene.add(terrain);

/** ========= RAYCAST / UTIL ========= */
const raycaster = new THREE.Raycaster();
function getTerrainHitRay(origin, dir, far = 500) {
    raycaster.set(origin, dir); 
    raycaster.far = far;
    const hit = raycaster.intersectObject(terrain, false)[0];
    return hit || null;
}

function getTerrainHeight(x, z) {
    const hit = getTerrainHitRay(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
    return hit ? hit.point.y : 0;
}

function clampToWorld(v) {
    const r = Math.hypot(v.x, v.z);
    if (r > WORLD_RADIUS - PLAYER_RADIUS) {
        const ang = Math.atan2(v.z, v.x);
        const rr = WORLD_RADIUS - PLAYER_RADIUS - 2;
        v.x = Math.cos(ang) * rr;
        v.z = Math.sin(ang) * rr;
    }
    return v;
}

/** ========= SISTEMA DE CARGA DE MODELOS MEJORADO ========= */
let angelModel = null;
let skullModel = null;
let ghostModel = null;
let crossModel = null; // Nuevo: modelo de cruz/tumba

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

// Función mejorada para cargar modelos
function loadModel(path, isFBX = false, options = {}) {
    return new Promise((resolve, reject) => {
        const loader = isFBX ? fbxLoader : gltfLoader;
        
        console.log(`📥 Intentando cargar: ${path} (${isFBX ? 'FBX' : 'GLTF/GLB'})`);
        
        loader.load(path, 
            (object) => {
                console.log(`✅ Modelo cargado: ${path}`);
                const model = object.scene || object;
                
                // Configuración estándar
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        if (child.material) {
                            // Asegurar que los materiales sean clonables
                            child.material = child.material.clone();
                            child.material.roughness = 0.8;
                            child.material.metalness = 0.2;
                            child.material.needsUpdate = true;
                        }
                    }
                });
                
                // Opciones específicas
                if (options.adjustHeight !== false) {
                    // Centrar y ajustar al suelo automáticamente
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    console.log(`📏 ${path}: Centro=${center.toArray()}, Tamaño=${size.toArray()}`);
                    
                    // Ajustar para que la base esté en Y=0
                    const baseOffset = center.y - (size.y / 2);
                    model.position.y = -baseOffset;
                    
                    // Escalado personalizable
                    const maxSize = Math.max(size.x, size.y, size.z);
                    let targetSize = options.targetSize || (isFBX ? 1.2 : 1.0);
                    if (options.fixedScale) {
                        targetSize = options.fixedScale;
                    }
                    const scale = targetSize / maxSize;
                    
                    console.log(`📏 ${path}: Escala aplicada=${scale.toFixed(3)}`);
                    model.scale.setScalar(scale);
                }
                
                if (options.transparent) {
                    model.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.transparent = true;
                            child.material.opacity = options.initialOpacity || 0.0;
                            child.material.needsUpdate = true;
                        }
                    });
                }
                
                resolve(model);
            },
            (progress) => {
                if (progress.lengthComputable) {
                    const percent = (progress.loaded / progress.total * 100).toFixed(1);
                    console.log(`📊 ${path}: ${percent}%`);
                }
            },
            (error) => {
                console.error(`❌ Error cargando ${path}:`, error);
                reject(error);
            }
        );
    });
}

async function loadAllModels() {
    console.log('🎮 Cargando modelos...');
    
    // Cargar ángel - ESTATUA GRANDE
    try {
        angelModel = await loadModel('assets/models/angel_statue.glb', false, {
            targetSize: 2.5, // Mucho más grande
            fixedScale: 2.5 // Forzar escala grande
        }).catch(async () => {
            return await loadModel('assets/models/angel_statue.gltf', false, {
                targetSize: 2.5,
                fixedScale: 2.5
            }).catch(async () => {
                return await loadModel('assets/models/angel_statue.fbx', true, {
                    targetSize: 2.5,
                    fixedScale: 2.5
                });
            });
        });
        console.log('✅ Ángel cargado - ESCALA GRANDE');
    } catch (e) {
        console.warn('No se pudo cargar ángel, usando placeholder grande');
        angelModel = createAngelPlaceholder();
        angelModel.scale.setScalar(2.5); // Placeholder también grande
    }
    
    // Cargar calavera
    try {
        skullModel = await loadModel('assets/models/skull.glb', false, {
            targetSize: 1.2
        }).catch(async () => {
            return await loadModel('assets/models/skull.gltf', false, {
                targetSize: 1.2
            }).catch(async () => {
                return await loadModel('assets/models/skull.fbx', true, {
                    targetSize: 1.2
                });
            });
        });
        console.log('✅ Calavera cargada');
    } catch (e) {
        console.warn('No se pudo cargar calavera, usando placeholder');
        skullModel = createSkullPlaceholder();
    }
    
    // Cargar CRUZ/TUMBA (nuevo)
    try {
        crossModel = await loadModel('assets/models/cross.glb', false, {
            targetSize: 1.5
        }).catch(async () => {
            return await loadModel('assets/models/cross.gltf', false, {
                targetSize: 1.5
            }).catch(async () => {
                return await loadModel('assets/models/cross.fbx', true, {
                    targetSize: 1.5
                }).catch(async () => {
                    return await loadModel('assets/models/grave.glb', false, {
                        targetSize: 1.5
                    }).catch(async () => {
                        return await loadModel('assets/models/grave.fbx', true, {
                            targetSize: 1.5
                        });
                    });
                });
            });
        });
        console.log('✅ Cruz/Tumba cargada');
    } catch (e) {
        console.warn('No se pudo cargar cruz/tumba, usando placeholder');
        crossModel = createCrossPlaceholder();
    }
    
    // Cargar FANTASMA - PROBLEMA CRÍTICO ARREGLADO
    try {
        ghostModel = await loadModel('assets/models/ghost.fbx', true, {
            targetSize: 1.8,
            transparent: true,
            initialOpacity: 0.0, // IMPORTANTE: empezar invisible
            adjustHeight: false // No ajustar altura para fantasmas
        }).catch(async () => {
            return await loadModel('assets/models/ghost.glb', false, {
                targetSize: 1.8,
                transparent: true,
                initialOpacity: 0.0,
                adjustHeight: false
            }).catch(async () => {
                return await loadModel('assets/models/ghost.gltf', false, {
                    targetSize: 1.8,
                    transparent: true,
                    initialOpacity: 0.0,
                    adjustHeight: false
                });
            });
        });
        
        console.log('✅ FANTASMA cargado - TRANSPARENTE Y VISIBLE');
        
        // VERIFICAR QUE EL MATERIAL SEA CORRECTO
        ghostModel.traverse((child) => {
            if (child.isMesh && child.material) {
                console.log('👻 Material del fantasma:', {
                    transparent: child.material.transparent,
                    opacity: child.material.opacity,
                    type: child.material.type
                });
                
                // Asegurar propiedades fantasmales
                child.material.transparent = true;
                child.material.opacity = 0.0; // Inicialmente invisible
                child.material.depthWrite = false; // IMPORTANTE para transparencia
                child.material.needsUpdate = true;
                
                // Efecto fantasmagórico
                child.material.emissive = child.material.emissive || new THREE.Color(0x88ddff);
                child.material.emissiveIntensity = 0.4;
            }
        });
        
    } catch (e) {
        console.error('❌ NO se pudo cargar el modelo de fantasma:', e);
        console.log('⚠️ Usando placeholder para fantasma');
        ghostModel = createGhostPlaceholder();
    }
    
    console.log('🎮 Todos los modelos cargados');
}

// Placeholders mejorados
function createAngelPlaceholder() {
    const group = new THREE.Group();
    
    // Base grande
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.0, 2.5, 0.8, 16),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8 })
    );
    
    // Cuerpo grande (estatua)
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 0.8, 4.0, 12),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 })
    );
    body.position.y = 2.5;
    
    // Alas grandes
    const wingGeo = new THREE.PlaneGeometry(3, 2);
    const wingMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, 
        side: THREE.DoubleSide,
        roughness: 0.7 
    });
    
    const wingLeft = new THREE.Mesh(wingGeo, wingMat);
    wingLeft.position.set(-1.5, 2.5, 0);
    wingLeft.rotation.y = Math.PI / 6;
    
    const wingRight = new THREE.Mesh(wingGeo, wingMat);
    wingRight.position.set(1.5, 2.5, 0);
    wingRight.rotation.y = -Math.PI / 6;
    
    group.add(base, body, wingLeft, wingRight);
    return group;
}

function createSkullPlaceholder() {
    const group = new THREE.Group();
    
    const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 })
    );
    
    const jaw = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.15, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xdddddd })
    );
    jaw.position.y = -0.15;
    
    group.add(skull, jaw);
    group.position.y = 0.3;
    return group;
}

function createCrossPlaceholder() {
    const group = new THREE.Group();
    
    // Base de la tumba
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.4, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    
    // Cruz vertical
    const vertical = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 2.5, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    vertical.position.y = 1.25;
    
    // Cruz horizontal
    const horizontal = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.2, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    horizontal.position.y = 1.8;
    
    group.add(base, vertical, horizontal);
    return group;
}

function createGhostPlaceholder() {
    const group = new THREE.Group();
    
    // Cuerpo fantasma - IMPORTANTE: material transparente desde el inicio
    const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.8, 2.0, 8),
        new THREE.MeshPhongMaterial({ 
            color: 0x88ddff, 
            transparent: true, 
            opacity: 0.0, // INICIALMENTE INVISIBLE
            shininess: 30,
            specular: 0xffffff,
            depthWrite: false // CRÍTICO para transparencia
        })
    );
    
    // Ojos brillantes
    const eyeMat = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, 
        emissive: 0xff0000,
        emissiveIntensity: 2.0
    });
    
    const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), eyeMat);
    eyeLeft.position.set(-0.25, 0.5, 0.35);
    
    const eyeRight = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), eyeMat);
    eyeRight.position.set(0.25, 0.5, 0.35);
    
    group.add(body, eyeLeft, eyeRight);
    
    // Rotar para que apunte hacia arriba
    group.rotation.x = Math.PI / 2;
    
    return group;
}

/** ========= OBJETOS DEL CEMENTERIO ========= */
function randomCirclePos(radius) {
    const angle = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * (radius - 8);
    return new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
}

const graveColliders = [];

// Tumbas usando modelos de cruz
function addGrave(x, z) {
    const y = getTerrainHeight(x, z);
    
    let grave;
    if (crossModel) {
        grave = crossModel.clone();
    } else {
        grave = createCrossPlaceholder();
    }
    
    grave.position.set(x, y, z);
    grave.rotation.y = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.4;
    grave.scale.setScalar(s);
    
    // Asegurar sombras
    grave.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    scene.add(grave);
    graveColliders.push({ x, z, r: 0.8 * s });
}

// Estatuas de ángel GRANDES
function spawnAngels() {
    if (!angelModel) {
        console.warn('Modelo de ángel no disponible');
        return;
    }
    
    console.log('🪦 Spawneando estatuas de ángel GRANDES...');
    
    for (let i = 0; i < 8; i++) { // Menos estatuas pero más grandes
        const pos = randomCirclePos(WORLD_RADIUS - 8);
        const angel = angelModel.clone();
        
        const y = getTerrainHeight(pos.x, pos.z);
        angel.position.set(pos.x, y, pos.z);
        angel.rotation.y = Math.random() * Math.PI * 2;
        
        // Escala adicional para hacerlas aún más grandes
        const additionalScale = 1.2 + Math.random() * 0.3;
        angel.scale.multiplyScalar(additionalScale);
        
        console.log(`🪦 Ángel ${i} en:`, angel.position, 'Escala:', angel.scale);
        
        scene.add(angel);
    }
}

// Calaveras decorativas
function spawnSkulls() {
    if (!skullModel) return;
    
    for (let i = 0; i < 20; i++) {
        const pos = randomCirclePos(WORLD_RADIUS - 5);
        const skull = skullModel.clone();
        
        skull.position.copy(pos);
        skull.position.y = getTerrainHeight(pos.x, pos.z) + 0.2;
        skull.rotation.y = Math.random() * Math.PI * 2;
        skull.rotation.x = (Math.random() - 0.5) * 0.5;
        skull.scale.setScalar(0.8 + Math.random() * 0.4);
        
        scene.add(skull);
    }
}

/** ========= AUDIO ========= */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

let ambientBuffer = null;
let scareBuffer = null;

audioLoader.load('assets/audio/terror_ambient.mp3', (buf) => ambientBuffer = buf);
audioLoader.load('assets/audio/scare.mp3', (buf) => scareBuffer = buf);

let ambientSfx = null;
function startAmbientAudio() {
    const ctx = listener.context;
    
    // Audio ambiente
    if (ambientEl) {
        try {
            const srcNode = ctx.createMediaElementSource(ambientEl);
            srcNode.connect(listener.getInput());
            ambientEl.loop = true;
            ambientEl.volume = 0.5;
            ambientEl.play().catch((e) => {
                console.warn('Audio HTML bloqueado:', e);
            });
        } catch (e) {
            console.warn('Error con audio HTML:', e);
        }
    }
    
    // Audio adicional
    if (ambientBuffer && !ambientSfx) {
        ambientSfx = new THREE.Audio(listener);
        ambientSfx.setBuffer(ambientBuffer);
        ambientSfx.setLoop(true);
        ambientSfx.setVolume(0.4);
        ambientSfx.play().catch(e => {
            console.warn('Error reproduciendo audio Three.js:', e);
        });
    }
}

/** ========= SISTEMA DE FANTASMAS - CORREGIDO ========= */
let ghosts = [];
let ghostColliders = [];
let gameTime = 0;
let gameActive = false;
let ghostSpawnInterval = null;

function spawnGhost() {
    if (!gameActive) {
        console.log('⚠️ Juego no activo, no spawnear fantasma');
        return;
    }
    
    if (!ghostModel) {
        console.error('❌ No hay modelo de fantasma disponible');
        return;
    }
    
    console.log('👻 Intentando spawnear fantasma...');
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 25;
    const pos = new THREE.Vector3(
        Math.cos(angle) * distance,
        1.6,
        Math.sin(angle) * distance
    );

    console.log('👻 Posición de spawn:', pos);
    
    let ghost;
    try {
        ghost = ghostModel.clone();
        console.log('✅ Fantasma clonado exitosamente');
    } catch (e) {
        console.error('❌ Error clonando fantasma:', e);
        return;
    }
    
    // CONFIGURACIÓN CRÍTICA DEL FANTASMA
    let hasTransparentMaterial = false;
    
    ghost.traverse((child) => {
        if (child.isMesh && child.material) {
            // Clonar material si no está ya clonado
            if (!child.material.isMaterial) {
                child.material = child.material.clone();
            }
            
            // FORZAR transparencia y visibilidad
            child.material.transparent = true;
            child.material.opacity = 0.0; // INICIALMENTE INVISIBLE
            child.material.depthWrite = false; // IMPORTANTE para transparencias
            child.material.needsUpdate = true;
            
            // Efecto fantasmagórico
            child.material.emissive = child.material.emissive || new THREE.Color(0x88ddff);
            child.material.emissiveIntensity = 0.4;
            
            hasTransparentMaterial = true;
            console.log('👻 Material configurado:', {
                transparent: child.material.transparent,
                opacity: child.material.opacity,
                depthWrite: child.material.depthWrite
            });
        }
    });
    
    if (!hasTransparentMaterial) {
        console.warn('⚠️ Fantasma no tiene materiales transparentes, forzando placeholder');
        ghost = createGhostPlaceholder();
    }
    
    ghost.position.copy(pos);
    ghost.userData = {
        scared: false,
        speed: GHOST_SPEED * (0.7 + Math.random() * 0.6),
        fadeDirection: 1, // 1 = apareciendo, -1 = desapareciendo
        opacity: 0.0, // Control centralizado de opacidad
        spawnTime: Date.now(),
        visible: false
    };
    
    scene.add(ghost);
    ghosts.push(ghost);
    ghostColliders.push({ 
        x: pos.x, 
        z: pos.z, 
        r: 0.8, 
        idx: ghosts.length - 1 
    });
    
    console.log(`✅ Fantasma spawnado! Total: ${ghosts.length}`);
    
    // Iniciar aparición inmediatamente
    ghost.userData.fadeDirection = 1;
    ghost.userData.visible = true;
}

function updateGhosts(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const ghost = ghosts[i];
        if (!ghost.parent) {
            console.log('👻 Fantasma sin parent, removiendo');
            ghosts.splice(i, 1);
            ghostColliders.splice(i, 1);
            continue;
        }

        // CONTROL CENTRALIZADO DE OPACIDAD - ARREGLADO
        if (ghost.userData.fadeDirection !== 0) {
            const fadeSpeed = ghost.userData.scared ? 3.0 : 1.5;
            ghost.userData.opacity += ghost.userData.fadeDirection * fadeSpeed * dt;
            ghost.userData.opacity = Math.max(0, Math.min(1, ghost.userData.opacity));
            
            // DEBUG: Monitorear opacidad
            if (Math.random() < 0.01) { // Log ocasional
                console.log(`👻 Fantasma ${i}: opacidad=${ghost.userData.opacity.toFixed(2)}, fadeDir=${ghost.userData.fadeDirection}`);
            }
            
            // APLICAR OPACIDAD A TODOS LOS MATERIALES
            ghost.traverse((child) => {
                if (child.isMesh && child.material && child.material.opacity !== undefined) {
                    // Usar una curva de aparición más dramática
                    const visibleOpacity = ghost.userData.opacity * 0.9;
                    child.material.opacity = visibleOpacity;
                    child.material.needsUpdate = true;
                    
                    // Ajustar emisivo basado en opacidad
                    if (child.material.emissive) {
                        child.material.emissiveIntensity = 0.3 + (visibleOpacity * 0.3);
                    }
                }
            });
            
            // Remover fantasma si desapareció completamente
            if (ghost.userData.scared && ghost.userData.opacity <= 0) {
                console.log(`👻 Fantasma ${i} desaparecido completamente`);
                scene.remove(ghost);
                
                // Liberar recursos
                ghost.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    }
                });
                
                ghosts.splice(i, 1);
                ghostColliders.splice(i, 1);
                continue;
            }
            
            // Si todavía está apareciendo, no moverse aún
            if (ghost.userData.opacity < 0.7 && !ghost.userData.scared) {
                continue;
            }
        }

        // Si está asustado, solo desaparecer
        if (ghost.userData.scared) continue;

        // MOVIMIENTO HACIA EL JUGADOR
        const direction = new THREE.Vector3()
            .subVectors(player.position, ghost.position)
            .normalize();
        
        ghost.position.add(direction.multiplyScalar(ghost.userData.speed * dt));
        
        // Mantener altura constante (fantasmas flotan)
        ghost.position.y = 1.6 + Math.sin(Date.now() * 0.002 + i) * 0.2;
        
        // Actualizar colisionador
        if (ghostColliders[i]) {
            ghostColliders[i].x = ghost.position.x;
            ghostColliders[i].z = ghost.position.z;
        }
        
        // Rotar para mirar al jugador (suavizado)
        const targetRotation = Math.atan2(
            player.position.x - ghost.position.x,
            player.position.z - ghost.position.z
        );
        ghost.rotation.y = targetRotation;
        
        // Verificar colisión con jugador
        const distanceToPlayer = ghost.position.distanceTo(player.position);
        if (distanceToPlayer < 1.5 && !ghost.userData.scared) {
            console.log('👻 COLISIÓN CON JUGADOR!');
            endGame('¡Un fantasma te atrapó!');
            return;
        }
    }
}

function scareGhost(controller) {
    if (!controller || !gameActive) {
        console.log('⚠️ No se puede asustar: controlador no disponible o juego inactivo');
        return false;
    }
    
    console.log('🔫 Intentando asustar fantasma...');
    
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    
    origin.setFromMatrixPosition(controller.matrixWorld);
    direction.transformDirection(controller.matrixWorld);
    
    let ghostScared = false;
    
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const ghost = ghosts[i];
        if (!ghost.parent || ghost.userData.scared) continue;
        
        const toGhost = new THREE.Vector3().subVectors(ghost.position, origin);
        const distance = toGhost.length();
        
        // Rango mayor para hacerlo más fácil
        if (distance > 20) continue;
        
        toGhost.normalize();
        const angle = toGhost.dot(direction);
        
        // Ángulo más permisivo
        if (angle > 0.3) {
            console.log(`💥 Fantasma ${i} asustado! Distancia: ${distance.toFixed(1)}, Ángulo: ${angle.toFixed(2)}`);
            
            // Flash de luz
            const flash = new THREE.PointLight(0xffffff, 20, 25, 1.5);
            flash.position.copy(origin);
            scene.add(flash);
            
            setTimeout(() => {
                if (flash.parent) scene.remove(flash);
            }, 100);
            
            // Sonido de asustar
            if (scareBuffer) {
                const sfx = new THREE.Audio(listener);
                sfx.setBuffer(scareBuffer);
                sfx.setLoop(false);
                sfx.setVolume(0.7);
                sfx.play().catch(e => console.warn('Error sonido:', e));
            }
            
            // Marcar fantasma como asustado
            ghost.userData.scared = true;
            ghost.userData.fadeDirection = -1; // Comenzar a desaparecer
            ghostScared = true;
            
            // Feedback visual adicional
            ghost.traverse((child) => {
                if (child.isMesh && child.material && child.material.emissive) {
                    child.material.emissive.setHex(0xff5555);
                    child.material.emissiveIntensity = 1.0;
                }
            });
        }
    }
    
    return ghostScared;
}

/** ========= COLISIONES ========= */
function resolveCollisions(curr, next) {
    // Tumbas
    for (const g of graveColliders) {
        const dx = next.x - g.x, dz = next.z - g.z;
        const dist = Math.hypot(dx, dz);
        const minD = PLAYER_RADIUS + g.r;
        if (dist < minD) {
            const push = (minD - dist) + 1e-3;
            const nx = dx / (dist || 1), nz = dz / (dist || 1);
            next.x += nx * push;
            next.z += nz * push;
        }
    }
    
    return clampToWorld(next);
}

/** ========= VR: CONTROLADORES + TELEPORT ========= */
const vrBtn = VRButton.createButton(renderer);
vrBtn.classList.add('vr-button');
document.body.appendChild(vrBtn);

const controllerLeft = renderer.xr.getController(0);
const controllerRight = renderer.xr.getController(1);
scene.add(controllerLeft, controllerRight);

const controllerModelFactory = new XRControllerModelFactory();
const grip0 = renderer.xr.getControllerGrip(0);
grip0.add(controllerModelFactory.createControllerModel(grip0)); 
scene.add(grip0);
const grip1 = renderer.xr.getControllerGrip(1);
grip1.add(controllerModelFactory.createControllerModel(grip1)); 
scene.add(grip1);

// Arco de teleport
const arcMatOK = new THREE.LineBasicMaterial({ color: 0x7ad1ff, transparent: true, opacity: 0.95 });
const arcMatBAD = new THREE.LineBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.95 });
let arcMaterial = arcMatOK;
const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(ARC_STEPS).fill(0).map(() => new THREE.Vector3()));
const arcLine = new THREE.Line(arcGeo, arcMaterial); 
arcLine.visible = false; 
scene.add(arcLine);

const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.30, 32), 
    new THREE.MeshBasicMaterial({ color: 0x7ad1ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
);
marker.rotation.x = -Math.PI / 2; 
marker.visible = false; 
scene.add(marker);

let teleportValid = false;
const teleportPoint = new THREE.Vector3();

controllerRight.addEventListener('selectstart', () => { 
    arcLine.visible = true; 
    marker.visible = true; 
});

controllerRight.addEventListener('selectend', () => {
    arcLine.visible = false;
    marker.visible = false;
    if (teleportValid) {
        const clamped = clampToWorld(teleportPoint.clone());
        player.position.set(clamped.x, getTerrainHeight(clamped.x, clamped.z) + 1.6, clamped.z);
    }
});

// Audio al entrar a VR
renderer.xr.addEventListener('sessionstart', async () => {
    console.log('🎮 Sesión VR iniciada');
    try { 
        if (ambientEl) { 
            ambientEl.volume = 0.5; 
            await ambientEl.play(); 
        } 
    } catch (e) { 
        console.warn('Audio bloqueado:', e); 
    }
    startAmbientAudio();
});

/** ========= LOCOMOCIÓN (stick) ========= */
function vrGamepadMove(dt) {
    const session = renderer.xr.getSession(); 
    if (!session) return;
    
    for (const src of session.inputSources) {
        if (!src.gamepad || src.handedness !== 'left') continue;
        
        let [x, y] = [src.gamepad.axes[2], src.gamepad.axes[3]];
        if (x === undefined || y === undefined) { 
            x = src.gamepad.axes[0] ?? 0; 
            y = src.gamepad.axes[1] ?? 0; 
        }
        
        const dead = 0.12; 
        if (Math.abs(x) < dead) x = 0; 
        if (Math.abs(y) < dead) y = 0; 
        if (x === 0 && y === 0) continue;

        const forward = new THREE.Vector3(); 
        camera.getWorldDirection(forward); 
        forward.y = 0; 
        forward.normalize();
        
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        let next = player.position.clone();
        next.addScaledVector(forward, -y * WALK_SPEED * dt);
        next.addScaledVector(right, x * STRAFE_SPEED * dt);

        next = clampToWorld(next);
        next.y = getTerrainHeight(next.x, next.z) + 1.6;
        next = resolveCollisions(player.position, next);
        player.position.copy(next);
    }
}

/** ========= TELEPORT ========= */
const arcPointsBuf = new Float32Array(ARC_STEPS * 3);

function segmentIntersectTerrain(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length(); 
    if (!len) return null; 
    dir.normalize();
    
    raycaster.set(a, dir); 
    raycaster.far = len + 0.01;
    const h = raycaster.intersectObject(terrain, false)[0];
    if (!h) return null;
    
    const n = h.face?.normal.clone() || new THREE.Vector3(0, 1, 0);
    n.transformDirection(terrain.matrixWorld);
    return { point: h.point.clone(), faceNormal: n.normalize() };
}

function updateTeleportArc() {
    if (!arcLine.visible) return;
    teleportValid = false;

    const origin = new THREE.Vector3().setFromMatrixPosition(controllerRight.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(controllerRight.quaternion).normalize();

    const pts = [];
    let hit = null;
    const v0 = dir.clone().multiplyScalar(ARC_SPEED);
    const g = new THREE.Vector3(0, -ARC_GRAVITY, 0);
    let p = origin.clone(), v = v0.clone();

    for (let i = 0; i < ARC_STEPS; i++) {
        pts.push(p.clone());
        v.addScaledVector(g, 1 / 60);
        const np = p.clone().addScaledVector(v, 1 / 60);
        const segHit = segmentIntersectTerrain(p, np);
        if (segHit) { hit = segHit; break; }
        p.copy(np);
    }

    for (let i = 0; i < ARC_STEPS; i++) {
        const P = pts[Math.min(i, pts.length - 1)];
        arcPointsBuf[i * 3 + 0] = P.x;
        arcPointsBuf[i * 3 + 1] = P.y;
        arcPointsBuf[i * 3 + 2] = P.z;
    }
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPointsBuf, 3));
    arcGeo.attributes.position.needsUpdate = true;

    if (hit) {
        const slopeDeg = THREE.MathUtils.radToDeg(Math.acos(hit.faceNormal.dot(new THREE.Vector3(0, 1, 0))));
        const inside = hit.point.distanceTo(new THREE.Vector3(0, hit.point.y, 0)) <= WORLD_RADIUS;
        teleportValid = (slopeDeg <= MAX_SLOPE_DEG) && inside;

        arcLine.material = teleportValid ? arcMatOK : arcMatBAD;
        marker.material.color.set(teleportValid ? 0x7ad1ff : 0xff5a5a);

        const clamped = clampToWorld(hit.point.clone());
        marker.position.set(clamped.x, getTerrainHeight(clamped.x, clamped.z) + 0.02, clamped.z);
        teleportPoint.copy(clamped);
    }
}

/** ========= JUEGO ========= */
function startGame() {
    console.log('🎮 INICIANDO JUEGO...');
    
    // Limpiar fantasmas anteriores
    ghosts.forEach(ghost => {
        if (ghost.parent) {
            scene.remove(ghost);
        }
    });
    ghosts = [];
    ghostColliders = [];
    
    // Limpiar intervalo anterior
    if (ghostSpawnInterval) {
        clearInterval(ghostSpawnInterval);
        ghostSpawnInterval = null;
    }
    
    gameTime = GAME_DURATION;
    gameActive = true;
    
    overlay.classList.add('hidden');
    
    // Spawn de fantasmas con intervalo - MÁS RÁPIDO PARA TESTING
    ghostSpawnInterval = setInterval(() => {
        if (!gameActive) {
            clearInterval(ghostSpawnInterval);
            return;
        }
        
        if (ghosts.length < GHOST_COUNT) {
            spawnGhost();
        } else {
            console.log(`👻 Límite alcanzado: ${ghosts.length}/${GHOST_COUNT} fantasmas`);
        }
    }, 2000 + Math.random() * 2000); // Más rápido para testing
    
    // Spawn inicial INMEDIATO
    setTimeout(() => {
        if (gameActive) {
            console.log('👻 Spawn inicial de fantasmas');
            for (let i = 0; i < 3; i++) {
                setTimeout(() => spawnGhost(), i * 500);
            }
        }
    }, 500);
    
    console.log('🎮 Juego iniciado - fantasmas deberían aparecer pronto...');
}

function endGame(message) {
    console.log('🎮 FIN DEL JUEGO:', message);
    
    gameActive = false;
    resultEl.textContent = message;
    overlay.classList.remove('hidden');
    
    // Limpiar intervalo
    if (ghostSpawnInterval) {
        clearInterval(ghostSpawnInterval);
        ghostSpawnInterval = null;
    }
    
    // Hacer visibles todos los fantasmas restantes (para debug)
    ghosts.forEach((ghost, i) => {
        console.log(`👻 Fantasma ${i} al final:`, {
            scared: ghost.userData.scared,
            opacity: ghost.userData.opacity,
            position: ghost.position
        });
    });
}

startBtn.onclick = startGame;

// Evento de disparo con cooldown
let canShoot = true;
const shootCooldown = 300;

controllerRight.addEventListener('selectstart', () => {
    if (canShoot && gameActive) {
        console.log('🔫 Disparo detectado');
        if (scareGhost(controllerRight)) {
            console.log('✅ Fantasma asustado!');
        } else {
            console.log('❌ No se asustó ningún fantasma');
        }
        
        canShoot = false;
        setTimeout(() => {
            canShoot = true;
        }, shootCooldown);
    }
});

/** ========= INIT ========= */
async function init() {
    console.log('🚀 INICIALIZANDO JUEGO...');
    
    // Crear tumbas usando modelos
    console.log('🪦 Creando tumbas...');
    for (let i = 0; i < 40; i++) {
        const pos = randomCirclePos(WORLD_RADIUS - 6);
        addGrave(pos.x, pos.z);
    }
    
    // Cargar modelos
    console.log('📦 Cargando modelos 3D...');
    await loadAllModels();
    
    // Spawn de objetos decorativos
    console.log('🎨 Spawneando decoraciones...');
    spawnAngels();
    spawnSkulls();
    
    console.log('✅ JUEGO INICIALIZADO CORRECTAMENTE');
    console.log('👉 Presiona el botón START para comenzar');
    console.log('👉 Los fantasmas deberían aparecer y ser visibles');
    
    renderer.setAnimationLoop(loop);
}

/** ========= LOOP ========= */
const clock = new THREE.Clock();
let lastGhostLog = 0;

function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = Date.now();

    if (renderer.xr.isPresenting) {
        vrGamepadMove(dt);
        updateTeleportArc();
    }

    // Actualizar juego si está activo
    if (gameActive) {
        gameTime -= dt;
        if (timerEl) timerEl.textContent = Math.max(0, gameTime.toFixed(1)) + 's';

        updateGhosts(dt);

        if (gameTime <= 0) {
            endGame('¡SOBREVIVISTE!');
        }
        
        // Log de fantasmas ocasional (cada 5 segundos)
        if (now - lastGhostLog > 5000) {
            console.log(`👻 Estado: ${ghosts.length} fantasmas activos`);
            ghosts.forEach((ghost, i) => {
                console.log(`  Fantasma ${i}:`, {
                    opacidad: ghost.userData.opacity.toFixed(2),
                    asustado: ghost.userData.scared,
                    posición: ghost.position.toArray().map(n => n.toFixed(1))
                });
            });
            lastGhostLog = now;
        }
    }

    // Mantener el fondo centrado en el jugador
    const p = player.position;
    skyMesh.position.copy(p);
    starField.position.copy(p);

    // Posicionar luna y ajustar luz
    const moonOffset = new THREE.Vector3(80, 100, -150);
    moonMesh.position.copy(p).add(moonOffset);
    moonLight.position.copy(moonMesh.position.clone().normalize().multiplyScalar(60));

    // Render: primero fondo, luego mundo
    renderer.clear();
    bgCam.projectionMatrix.copy(camera.projectionMatrix);
    bgCam.matrixWorld.copy(camera.matrixWorld);
    bgCam.matrixWorldInverse.copy(camera.matrixWorldInverse);
    renderer.render(bgScene, bgCam);
    renderer.render(scene, camera);
}

// Iniciar
init().catch(error => {
    console.error('❌ ERROR CRÍTICO al inicializar el juego:', error);
    resultEl.textContent = `Error: ${error.message}`;
    overlay.classList.remove('hidden');
});

/** ========= RESIZE ========= */
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

/** ========= DEBUG / TESTING ========= */
window.debugGame = {
    spawnGhost: () => {
        if (gameActive) {
            spawnGhost();
            console.log('👻 Fantasma spawnado manualmente');
        } else {
            console.log('⚠️ Juego no activo');
        }
    },
    showGhosts: () => {
        console.log('=== FANTASMAS ACTUALES ===');
        ghosts.forEach((ghost, i) => {
            console.log(`Fantasma ${i}:`, {
                posición: ghost.position,
                opacidad: ghost.userData.opacity,
                asustado: ghost.userData.scared,
                materiales: ghost.children.map(c => c.material?.opacity)
            });
        });
    },
    forceVisible: () => {
        ghosts.forEach(ghost => {
            ghost.userData.opacity = 1.0;
            ghost.traverse(child => {
                if (child.material) {
                    child.material.opacity = 0.9;
                    child.material.needsUpdate = true;
                }
            });
        });
        console.log('👻 Fantasmas forzados a visibles');
    }
};

console.log('🎮 Para debug: window.debugGame.spawnGhost()');
console.log('🎮 Para debug: window.debugGame.showGhosts()');
console.log('🎮 Para debug: window.debugGame.forceVisible()');