// ========================================
// CONFIGURACIÓN Y CONSTANTES
// ========================================

const CEMETERY_RADIUS = 50;
const GAME_DURATION = 60;
const GHOST_SPEED = 0.03; // velocidad reducida
const MOVE_SPEED = 0.15;
const DANGER_DISTANCE = 1.8;
const GHOST_COUNT = 10; // más fantasmas

// ========================================
// VARIABLES GLOBALES
// ========================================

let scene, camera, renderer;
let cemeteryGround, moon, stars;
let ghosts = [];
let tombstones = [];
let controllers = [];
let gameActive = false;
let startTime;
let animationId;
let timerInterval;

// Controles de teclado
const keys = {};
const moveVector = new THREE.Vector3();

// ========================================
// ELEMENTOS DEL DOM
// ========================================

const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const gameHud = document.getElementById('game-hud');
const timerDisplay = document.getElementById('timer-display');
const gameInstructions = document.getElementById('game-instructions');
const gameOverScreen = document.getElementById('gameover-screen');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const restartButton = document.getElementById('restart-button');
const vrButtonContainer = document.getElementById('vr-button-container');
const gameContainer = document.getElementById('game-container');

// ========================================
// CLASE FANTASMA
// ========================================

class Ghost {
    constructor() {
        this.group = new THREE.Group();
        
        // Cuerpo fantasmal
        const bodyGeometry = new THREE.ConeGeometry(0.5, 2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            emissive: 0x4444ff,
            emissiveIntensity: 0.3
        });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        
        // Cabeza
        const headGeometry = new THREE.SphereGeometry(0.4, 8, 8);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.y = 1.3;
        
        // Ojos rojos brillantes
        const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1
        });
        this.leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        this.leftEye.position.set(-0.15, 1.4, 0.35);
        this.rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        this.rightEye.position.set(0.15, 1.4, 0.35);
        
        this.group.add(this.body, head, this.leftEye, this.rightEye);
        
        // Estado del fantasma
        this.scared = false;
        this.floatOffset = Math.random() * Math.PI * 2;
        
        // Posición inicial
        this.respawn();
        
        scene.add(this.group);
    }
    
    respawn() {
        const angle = Math.random() * Math.PI * 2;
        const distance = CEMETERY_RADIUS - 5;
        this.group.position.set(
            Math.cos(angle) * distance,
            1,
            Math.sin(angle) * distance
        );
    }
    
    update(playerPos, deltaTime) {
        if (this.scared) return false;
        
        // Moverse hacia el jugador
        const direction = new THREE.Vector3();
        direction.subVectors(playerPos, this.group.position);
        direction.y = 0;
        direction.normalize();
        
        this.group.position.x += direction.x * GHOST_SPEED;
        this.group.position.z += direction.z * GHOST_SPEED;
        
        // Mirar al jugador
        this.group.lookAt(playerPos.x, this.group.position.y, playerPos.z);
        
        // Animación flotante
        this.group.position.y = 1 + Math.sin(Date.now() * 0.003 + this.floatOffset) * 0.2;
        
        // Verificar colisión con el jugador
        const distance = this.group.position.distanceTo(playerPos);
        return distance < DANGER_DISTANCE;
    }
    
    scare() {
        // Desaparecer fantasma al ser asustado
        scene.remove(this.group);
        this.scared = true;
    }
    
    remove() {
        scene.remove(this.group);
    }
}

// ========================================
// INICIALIZACIÓN DE LA ESCENA
// ========================================

function initScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x111111, 0.03);
    
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 5);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    gameContainer.appendChild(renderer.domElement);
    
    checkVRSupport();
}

// ========================================
// VERIFICAR SOPORTE VR
// ========================================

function checkVRSupport() {
    if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                createVRButton();
            }
        });
    }
}

function createVRButton() {
    const vrButton = document.createElement('button');
    vrButton.textContent = 'ENTRAR EN VR';
    vrButton.className = 'vr-button';
    vrButton.onclick = async () => {
        try {
            await renderer.xr.getSession();
            vrButton.style.display = 'none';
        } catch (error) {
            console.error('Error al iniciar VR:', error);
            alert('No se pudo iniciar la sesión VR');
        }
    };
    vrButtonContainer.appendChild(vrButton);
}

// ========================================
// CREAR ILUMINACIÓN
// ========================================

function createLighting() {
    const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.3);
    scene.add(ambientLight);
    
    const moonLight = new THREE.DirectionalLight(0x8899ff, 0.8);
    moonLight.position.set(20, 40, 20);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 2048;
    moonLight.shadow.mapSize.height = 2048;
    moonLight.shadow.camera.far = 100;
    scene.add(moonLight);
    
    const moonGeometry = new THREE.SphereGeometry(3, 32, 32);
    const moonMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0xffffaa,
        emissiveIntensity: 1
    });
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.set(20, 40, 20);
    scene.add(moon);
}

// ========================================
// CREAR CIELO ESTRELLADO
// ========================================

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];
    
    for (let i = 0; i < 2000; i++) {
        const x = (Math.random() - 0.5) * 200;
        const y = Math.random() * 100 + 30;
        const z = (Math.random() - 0.5) * 200;
        starVertices.push(x, y, z);
    }
    
    starGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(starVertices, 3)
    );
    
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.3
    });
    
    stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

// ========================================
// CREAR SUELO DEL CEMENTERIO
// ========================================

function createGround() {
    const groundGeometry = new THREE.CircleGeometry(CEMETERY_RADIUS, 64);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a3a1a,
        roughness: 0.9
    });
    
    cemeteryGround = new THREE.Mesh(groundGeometry, groundMaterial);
    cemeteryGround.rotation.x = -Math.PI / 2;
    cemeteryGround.receiveShadow = true;
    scene.add(cemeteryGround);
}

// ========================================
// CREAR REJAS DEL CEMENTERIO
// ========================================

function createFence() {
    const fenceCount = 50;
    
    for (let i = 0; i < fenceCount; i++) {
        const angle = (i / fenceCount) * Math.PI * 2;
        const x = Math.cos(angle) * CEMETERY_RADIUS;
        const z = Math.sin(angle) * CEMETERY_RADIUS;
        
        const fenceGeometry = new THREE.BoxGeometry(0.1, 3, 0.1);
        const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const fence = new THREE.Mesh(fenceGeometry, fenceMaterial);
        
        fence.position.set(x, 1.5, z);
        fence.castShadow = true;
        scene.add(fence);
    }
}

// ========================================
// CREAR TUMBAS
// ========================================

function createTombstones() {
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (CEMETERY_RADIUS - 10) + 5;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        
        const tombGeometry = new THREE.BoxGeometry(1.5, 2, 0.3);
        const tombMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const tomb = new THREE.Mesh(tombGeometry, tombMaterial);
        
        tomb.position.set(x, 1, z);
        tomb.rotation.y = Math.random() * Math.PI;
        tomb.castShadow = true;
        tomb.receiveShadow = true;
        
        scene.add(tomb);
        tombstones.push(tomb);
    }
}

// ========================================
// CREAR ESTATUAS DE ÁNGELES
// ========================================

function createAngelStatues() {
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (CEMETERY_RADIUS - 15) + 10;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        
        const statueGroup = new THREE.Group();
        const statueMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
        const body = new THREE.Mesh(bodyGeometry, statueMaterial);
        
        const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const head = new THREE.Mesh(headGeometry, statueMaterial);
        head.position.y = 1.3;
        
        const wingGeometry = new THREE.ConeGeometry(0.8, 1.5, 8);
        const leftWing = new THREE.Mesh(wingGeometry, statueMaterial);
        leftWing.position.set(-0.7, 0.5, -0.3);
        leftWing.rotation.z = Math.PI / 4;
        
        const rightWing = new THREE.Mesh(wingGeometry, statueMaterial);
        rightWing.position.set(0.7, 0.5, -0.3);
        rightWing.rotation.z = -Math.PI / 4;
        
        statueGroup.add(body, head, leftWing, rightWing);
        statueGroup.position.set(x, 1, z);
        statueGroup.castShadow = true;
        
        scene.add(statueGroup);
    }
}

// ========================================
// CREAR CALAVERAS
// ========================================

function createSkulls() {
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (CEMETERY_RADIUS - 5) + 3;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        
        const skullGroup = new THREE.Group();
        const skullMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeecc });
        
        const skullGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const skull = new THREE.Mesh(skullGeometry, skullMaterial);
        
        const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.12, 0.08, 0.25);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.12, 0.08, 0.25);
        
        skullGroup.add(skull, leftEye, rightEye);
        skullGroup.position.set(x, 0.3, z);
        skullGroup.rotation.y = Math.random() * Math.PI * 2;
        
        scene.add(skullGroup);
    }
}

// ========================================
// CONFIGURAR CONTROLADORES VR
// ========================================

function setupVRControllers() {
    const leftController = renderer.xr.getController(0);
    scene.add(leftController);
    
    const leftGrip = renderer.xr.getControllerGrip(0);
    leftGrip.add(createControllerModel());
    scene.add(leftGrip);
    
    const rightController = renderer.xr.getController(1);
    rightController.addEventListener('selectstart', scareGhosts);
    scene.add(rightController);
    
    const rightGrip = renderer.xr.getControllerGrip(1);
    rightGrip.add(createControllerModel());
    scene.add(rightGrip);
    
    controllers = [leftController, rightController];
}

function createControllerModel() {
    const geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x4444ff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
}

// ========================================
// CONTROLES DE TECLADO
// ========================================

function setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
}

// ========================================
// MOVIMIENTO DEL JUGADOR
// ========================================

function updatePlayerMovement() {
    moveVector.set(0, 0, 0);
    
    if (keys['w'] || keys['arrowup']) moveVector.z -= 1;
    if (keys['s'] || keys['arrowdown']) moveVector.z += 1;
    if (keys['a'] || keys['arrowleft']) moveVector.x -= 1;
    if (keys['d'] || keys['arrowright']) moveVector.x += 1;
    
    if (moveVector.length() > 0) {
        moveVector.normalize();
        moveVector.applyQuaternion(camera.quaternion);
        moveVector.y = 0;
        moveVector.normalize();
        moveVector.multiplyScalar(MOVE_SPEED);
        
        const newPos = camera.position.clone().add(moveVector);
        if (newPos.length() < CEMETERY_RADIUS - 3) {
            camera.position.add(moveVector);
        }
    }
}

// ========================================
// ASUSTAR FANTASMAS
// ========================================

function scareGhosts() {
    if (!gameActive) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    ghosts.forEach(ghost => {
        if (ghost.scared) return;
        
        const distance = ghost.group.position.distanceTo(camera.position);
        if (distance < 10) {
            const direction = new THREE.Vector3();
            direction.subVectors(ghost.group.position, camera.position).normalize();
            
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            
            const angle = direction.dot(cameraDirection);
            if (angle > 0.8) {
                ghost.scare();
            }
        }
    });
}

// ========================================
// SPAWN DE FANTASMAS
// ========================================

function spawnGhosts() {
    for (let i = 0; i < GHOST_COUNT; i++) {
        ghosts.push(new Ghost());
    }
}

// ========================================
// INICIAR JUEGO
// ========================================

function startGame() {
    gameActive = true;
    startTime = Date.now();
    
    startScreen.classList.add('hidden');
    gameHud.classList.remove('hidden');
    gameInstructions.classList.remove('hidden');
    
    spawnGhosts();
    updateTimer();
}

// ========================================
// ACTUALIZAR TEMPORIZADOR
// ========================================

function updateTimer() {
    if (!gameActive) return;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, GAME_DURATION - elapsed);
    
    timerDisplay.textContent = Math.ceil(remaining) + 's';
    
    if (remaining <= 10 && remaining > 0) {
        timerDisplay.parentElement.classList.add('warning');
    } else {
        timerDisplay.parentElement.classList.remove('warning');
    }
    
    if (remaining <= 0) {
        endGame(true);
    }
}

// ========================================
// TERMINAR JUEGO
// ========================================

function endGame(won) {
    gameActive = false;
    
    gameHud.classList.add('hidden');
    gameInstructions.classList.add('hidden');
    
    ghosts.forEach(ghost => ghost.remove());
    ghosts = [];
    
    if (won) {
        resultTitle.textContent = '¡VICTORIA!';
        resultMessage.textContent = '¡Has sobrevivido! Escapaste del cementerio maldito.';
        resultTitle.style.color = '#00ff00';
    } else {
        resultTitle.textContent = 'GAME OVER';
        resultMessage.textContent = 'Un fantasma te ha atrapado...';
        resultTitle.style.color = '#ff0000';
    }
    
    gameOverScreen.classList.remove('hidden');
}

// ========================================
// LOOP DE ANIMACIÓN
// ========================================

function animate() {
    animationId = renderer.setAnimationLoop(render);
}

function render() {
    const deltaTime = 0.016;
    
    if (gameActive) {
        updatePlayerMovement();
        updateTimer();
        
        ghosts.forEach(ghost => {
            const danger = ghost.update(camera.position, deltaTime);
            if (danger) endGame(false);
        });
    }
    
    renderer.render(scene, camera);
}

// ========================================
// INICIALIZACIÓN DE TODO
// ========================================

function init() {
    initScene();
    createLighting();
    createStars();
    createGround();
    createFence();
    createTombstones();
    createAngelStatues();
    createSkulls();
    
    setupVRControllers();
    setupKeyboardControls();
    
    animate();
}

// ========================================
// EVENTOS DEL DOM
// ========================================

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========================================
// INICIAR
// ========================================

init();