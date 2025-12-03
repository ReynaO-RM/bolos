// main.js (Fusión de VR y Bolos)

// ===================================================================
// CONFIGURACIÓN
// ===================================================================

const SCENE_BG_COLOR = 0x333333; // Color de fondo gris oscuro
const PLAYER_START_Z = 3.0;      // Posición inicial del jugador (línea de lanzamiento)
const PLAYER_START_Y = 1.6;      // Altura de los ojos del jugador
const VR_WALK_SPEED = 5.5;       // Velocidad de movimiento
const WORLD_RADIUS = 20.0;       // Límite de movimiento

// ===================================================================
// VARIABLES GLOBALES
// ===================================================================

// Nota: raycaster ha sido eliminado de esta declaración para evitar el conflicto
// ya que es declarado en bowlchallenge.js (o será inicializado dentro de init).
let camera, scene, renderer;
let controls, player, floor;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

// Objetos de Juego
let bowlGame;    
let bowlPhysics; 

// Utilidades para Raycasting y VR
let tempVector, tempMatrix, tempQuaternion; // <--- raycaster ELIMINADO de aquí

const clock = new THREE.Clock();
// NOTA: 'raycaster' será una variable global gracias al script bowlchallenge.js
// o será inicializado dentro de init.


// ===================================================================
// INICIALIZACIÓN DEL MOTOR DE FÍSICA (Ammo.js)
// ===================================================================

// Todo el setup debe esperar a que Ammo.js cargue y se inicialice.
Ammo().then(function (AmmoLib) {
    Ammo = AmmoLib; // Asigna Ammo.js a la variable global Ammo

    // 1. Inicializa la lógica de física de bolos
    // Se asume que BowlPhysics está disponible globalmente.
    bowlPhysics = new BowlPhysics();

    // 2. Continúa con la inicialización de Three.js y VR
    init();
    animate();
});

// ===================================================================
// SETUP DE LA ESCENA VR
// ===================================================================

function init() {
    // 1. ESCENA y CÁMARA
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_BG_COLOR);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

    // Player Group (maneja la posición en el mundo)
    player = new THREE.Group();
    // Posiciona al jugador en la línea de lanzamiento (Z=3.0)
    player.position.set(0, PLAYER_START_Y, PLAYER_START_Z);
    player.add(camera);
    scene.add(player);

    // 2. ILUMINACIÓN
    const ambient = new THREE.AmbientLight(0xFFFFFF, 5); 
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 8);
    keyLight.position.set(0, 5, 5); // Luz desde arriba/adelante
    scene.add(keyLight);

    // 3. RENDERIZADOR
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('scene') });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true; // Habilita VR

    // VRButton (se asume disponible globalmente)
    document.body.appendChild(VRButton.createButton(renderer));

    // 4. INTEGRACIÓN DEL JUEGO DE BOLOS (¡CRÍTICO!)
    if (window.BowlChallenge) {
        // Llama a la función exportada que inicializa la lógica y carga los modelos
        bowlGame = window.BowlChallenge(scene, bowlPhysics, player, camera);
        console.log("Juego de Bolos inicializado y listo.");
    } else {
        console.error("ERROR: window.BowlChallenge no encontrado. Asegúrate que bowlchallenge.js se cargó.");
    }

    // 5. CONTROLADORES VR
    const controllerModelFactory = new XRControllerModelFactory();

    // Controlador 1 (Mano izquierda - Movimiento)
    controller1 = renderer.xr.getController(0);
    player.add(controller1);

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    player.add(controllerGrip1);

    // Controlador 2 (Mano derecha - Lanzamiento)
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    player.add(controller2);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    player.add(controllerGrip2);

    // 6. Utilidades (Raycaster se inicializa aquí, usando la variable global)
    // Se asume que bowlchallenge.js ya declaró raycaster globalmente usando 'var'
    raycaster = new THREE.Raycaster(); 
    
    tempVector = new THREE.Vector3();
    tempMatrix = new THREE.Matrix4();
    tempQuaternion = new THREE.Quaternion();

    // Eventos de ventana
    window.addEventListener('resize', onWindowResize);
}

// ===================================================================
// MANEJO DE ENTRADA (VR CONTROLLERS)
// ===================================================================

function onSelectStart(event) {
    const controller = event.target;
    const time = performance.now();

    if (controller === controller2) { // Controlador derecho: Intento de "agarrar" la bola
        // Usamos una posición virtual de la pantalla para activar la lógica de pick up
        const clientX = window.innerWidth / 2;
        const clientY = window.innerHeight / 2;
        
        // Llama a la función de bowlchallenge.js
        bowlGame.onActionDown(clientX, clientY, time);
    }
}

function onSelectEnd(event) {
    const controller = event.target;
    const time = performance.now();

    if (controller === controller2) { // Controlador derecho: Lanzamiento
        // Usamos la misma posición virtual para activar la lógica de lanzamiento
        const clientX = window.innerWidth / 2;
        const clientY = window.innerHeight / 2;
        
        // Llama a la función de bowlchallenge.js
        bowlGame.onActionUp(clientX, clientY, time);
    }
}

// ===================================================================
// LÓGICA DE MOVIMIENTO VR
// ===================================================================

function vrGamepadMove(dt) {
    // Implementa el movimiento del jugador usando el joystick/touchpad del controlador
    const gamepad = controller1.userData.gamepad || controller2.userData.gamepad;

    if (gamepad && gamepad.axes.length > 2) {
        const x = gamepad.axes[2]; // Eje X del joystick
        const y = gamepad.axes[3]; // Eje Y del joystick

        if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
            
            // Mueve el player en la dirección de la cámara (para inmersión)
            tempMatrix.extractRotation(camera.matrixWorld);
            tempVector.set(x, 0, y).applyMatrix4(tempMatrix);

            // Evitar movimiento vertical
            tempVector.y = 0; 
            tempVector.normalize();

            // Aplicar velocidad
            const moveSpeed = VR_WALK_SPEED * dt;
            player.position.x += tempVector.x * moveSpeed;
            player.position.z += tempVector.z * moveSpeed;

            // Clamp: Limitar el movimiento para que no se aleje demasiado del área de juego
            const distance = player.position.clone().sub(new THREE.Vector3(0, player.position.y, 0)).length();
            if (distance > WORLD_RADIUS) {
                player.position.normalize().multiplyScalar(WORLD_RADIUS);
            }
        }
    }
}

// ===================================================================
// ACTUALIZACIÓN DEL HUD (Puntuación)
// ===================================================================

function updateHUD() {
    if (!bowlGame || !bowlGame.scores) return;

    const scores = bowlGame.scores;
    
    // Puntuación Total
    document.getElementById('hudScore').textContent = scores.score.toString();
    
    // Frame
    document.getElementById('hudFrame').textContent = `${scores.frameNumber + 1} / 10`;

    // Pines restantes 
    const pinCount = bowlPhysics.pinBodies.filter(body => !!body).length;
    document.getElementById('hudPins').textContent = pinCount.toString();
}

// ===================================================================
// BUCLE PRINCIPAL (ANIMACIÓN)
// ===================================================================

function animate() {
    renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.05); // Delta time, limitado para estabilidad de la física

        if (renderer.xr.isPresenting) {
            vrGamepadMove(dt);
        }

        // 1. Actualización de la Física y Lógica de Bolos
        if (bowlGame) {
            bowlGame.update(dt);
            updateHUD();
        }

        // 2. Renderizado
        renderer.render(scene, camera);
    });
}

// ===================================================================
// MANEJO DE LA VENTANA
// ===================================================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}