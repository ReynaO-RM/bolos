// main.js (Código Final Consolidado)

// ===================================================================
// CONFIGURACIÓN
// ===================================================================

const SCENE_BG_COLOR = 0x333333; 
const PLAYER_START_Z = 3.0;      
const PLAYER_START_Y = 1.6;      
const VR_WALK_SPEED = 5.5;       
const WORLD_RADIUS = 20.0;       

// ===================================================================
// VARIABLES GLOBALES
// ===================================================================

let camera, scene, renderer;
let controls, player, floor;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let bowlGame;    
let bowlPhysics; 

// ELIMINADA la declaración de 'raycaster' para evitar el conflicto.
let tempVector, tempMatrix, tempQuaternion; 

const clock = new THREE.Clock();


// ===================================================================
// INICIALIZACIÓN DEL MOTOR DE FÍSICA (Ammo.js)
// ===================================================================

Ammo().then(function (AmmoLib) {
    Ammo = AmmoLib; 
    
    // Se asume que BowlPhysics está disponible globalmente.
    bowlPhysics = new BowlPhysics();

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

    player = new THREE.Group();
    player.position.set(0, PLAYER_START_Y, PLAYER_START_Z);
    player.add(camera);
    scene.add(player);

    // 2. ILUMINACIÓN
    const ambient = new THREE.AmbientLight(0xFFFFFF, 5); 
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 8);
    keyLight.position.set(0, 5, 5); 
    scene.add(keyLight);

    // 3. RENDERIZADOR
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('scene') });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true; 

    document.body.appendChild(VRButton.createButton(renderer));

    // 4. INTEGRACIÓN DEL JUEGO DE BOLOS (¡CRÍTICO!)
    if (window.BowlChallenge) {
        bowlGame = window.BowlChallenge(scene, bowlPhysics, player, camera);
        console.log("Juego de Bolos inicializado y listo.");
    } else {
        console.error("ERROR: window.BowlChallenge no encontrado. Asegúrate que bowlchallenge.js se cargó.");
    }

    // 5. CONTROLADORES VR
    const controllerModelFactory = new XRControllerModelFactory();

    // Controlador 1
    controller1 = renderer.xr.getController(0);
    player.add(controller1);

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    player.add(controllerGrip1);

    // Controlador 2 (Lanzamiento)
    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    player.add(controller2);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    player.add(controllerGrip2);

    // 6. Utilidades
    // NOTA: raycaster se inicializa dentro de bowlchallenge.js.
    // Aquí solo inicializamos las variables de trabajo de main.js
    tempVector = new THREE.Vector3();
    tempMatrix = new THREE.Matrix4();
    tempQuaternion = new THREE.Quaternion();

    window.addEventListener('resize', onWindowResize);
}

// ===================================================================
// MANEJO DE ENTRADA (VR CONTROLLERS)
// ===================================================================

function onSelectStart(event) {
    const controller = event.target;
    const time = performance.now();

    if (controller === controller2) { 
        // Coordenadas virtuales para activar la lógica de "pick up"
        const clientX = window.innerWidth / 2;
        const clientY = window.innerHeight / 2;
        
        // Llamamos a la versión modificada de onActionDown
        bowlGame.onActionDown(clientX, clientY, time);
    }
}

function onSelectEnd(event) {
    const controller = event.target;
    const time = performance.now();

    if (controller === controller2) { 
        // Coordenadas virtuales para activar la lógica de "release"
        const clientX = window.innerWidth / 2;
        const clientY = window.innerHeight / 2;
        
        // Llamamos a onActionUp
        bowlGame.onActionUp(clientX, clientY, time);
    }
}

// ... (El resto de funciones vrGamepadMove, updateHUD, animate y onWindowResize) ...

function vrGamepadMove(dt) {
    const gamepad = controller1.userData.gamepad || controller2.userData.gamepad;

    if (gamepad && gamepad.axes.length > 2) {
        const x = gamepad.axes[2]; 
        const y = gamepad.axes[3]; 

        if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
            tempMatrix.extractRotation(camera.matrixWorld);
            tempVector.set(x, 0, y).applyMatrix4(tempMatrix);
            tempVector.y = 0; 
            tempVector.normalize();

            const moveSpeed = VR_WALK_SPEED * dt;
            player.position.x += tempVector.x * moveSpeed;
            player.position.z += tempVector.z * moveSpeed;

            const distance = player.position.clone().sub(new THREE.Vector3(0, player.position.y, 0)).length();
            if (distance > WORLD_RADIUS) {
                player.position.normalize().multiplyScalar(WORLD_RADIUS);
            }
        }
    }
}

function updateHUD() {
    if (!bowlGame || !bowlGame.scores) return;

    const scores = bowlGame.scores;
    
    document.getElementById('hudScore').textContent = scores.score.toString();
    document.getElementById('hudFrame').textContent = `${scores.frameNumber + 1} / 10`;

    // Asumimos que pinBodies existe
    const pinCount = bowlPhysics.pinBodies.filter(body => !!body).length;
    document.getElementById('hudPins').textContent = pinCount.toString();
}

function animate() {
    renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.05); 

        if (renderer.xr.isPresenting) {
            vrGamepadMove(dt);
        }

        if (bowlGame) {
            bowlGame.update(dt);
            updateHUD();
        }

        renderer.render(scene, camera);
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}