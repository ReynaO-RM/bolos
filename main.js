// main.js (Fusión de VR de main4.js con lógica de Bolos)

// Accedemos a THREE y sus extensiones globalmente (asumiendo que se cargaron como scripts)
const THREE = window.THREE; 
const VRButton = window.VRButton; 
const XRControllerModelFactory = window.XRControllerModelFactory; 
const RGBELoader = window.RGBELoader; 
// GLTFLoader se usa internamente en bowlchallenge.js, no en main.js directamente

/** ========= CONFIG VR (Mantenido de main4.js) ========= */
const VR_WALK_SPEED = 5.5;
const VR_STRAFE_SPEED = 4.8;
const ARC_STEPS = 40;
const ARC_SPEED = 7.5;
const ARC_GRAVITY = 9.8;
const MAX_SLOPE_DEG = 45;

// La posición de inicio de lanzamiento de bolos (Z=20)
const PLAYER_START_Z = 20;

/** ========= VARIABLES GLOBALES DE ESCENA/VR ========= */
let renderer, scene, camera, player;
let controllerLeft, controllerRight, grip0, grip1;
let raycaster, arcLine, marker;
let arcMatOK, arcMatBAD;
let teleporting = false;
const tempMatrix = new THREE.Matrix4();
const tempVector = new THREE.Vector3();

/** ========= VARIABLES DE JUEGO DE BOLOS ========= */
let physics, bowlGame;
let gameInitialized = false;

/** ========= UTILIDADES DE TERRENO (Adaptadas) ========= */

// Asumimos que la pista de bolos es una superficie plana a Y=1.6
function getTerrainHeight(p) {
    return 1.6; 
}

// Limita la posición del jugador al área de lanzamiento.
function clampToWorld(position) {
  // Restricciones para la plataforma de lanzamiento (ejemplo)
  if (position.z > 22) position.z = 22; 
  if (position.z < 18) position.z = 18; 
  if (position.x > 1.5) position.x = 1.5; 
  if (position.x < -1.5) position.x = -1.5; 
  
  // Fija la altura del jugador al suelo de la pista
  position.y = getTerrainHeight(position); 
  return position;
}

/** ========= CONFIGURACIÓN DE ESCENA Y VR ========= */

function init() {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.autoClear = true; 

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x333333); 
  scene.fog = new THREE.FogExp2(0x190130, 0.005); 

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 0);

  player = new THREE.Group();
  player.add(camera);
  scene.add(player);
  player.position.set(0, getTerrainHeight({x:0, z:PLAYER_START_Z}), PLAYER_START_Z); 

  window.addEventListener('resize', onWindowResize);

  // === BOTÓN VR ===
  document.body.appendChild(VRButton.createButton(renderer));

  // === LUCES ===
  const ambient = new THREE.AmbientLight(0x404040, 5); 
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 5);
  keyLight.position.set(-10, 10, 50);
  keyLight.castShadow = true;
  scene.add(keyLight);
  
  // === CONTROLADORES VR ===
  setupControllers();
  
  // === LÓGICA DE TELETRANSPORTE ===
  setupTeleportArc();

  // === INICIALIZACIÓN DEL JUEGO DE BOLOS CON AMMO.JS ===
  window.Ammo().then((AmmoLib) => {
    window.Ammo = AmmoLib;
    
    // Inicializar la física y el juego. 
    // Aquí es donde bowlchallenge.js se encarga de cargar 'scene.gltf', 'ball.png', etc.
    physics = window.BowlPhysics(scene); 
    bowlGame = window.BowlChallenge(scene, physics, player, camera); 
    
    gameInitialized = true;
    updateHUD(); 
  });

  renderer.setAnimationLoop(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupControllers() {
  const modelFactory = new XRControllerModelFactory();
  raycaster = new THREE.Raycaster();

  // Controlador Derecho: Lanzamiento de la Bola (Trigger)
  controllerRight = renderer.xr.getController(0);
  controllerRight.addEventListener('selectstart', onSelectStart);
  controllerRight.addEventListener('selectend', onSelectEnd);
  player.add(controllerRight);

  grip0 = renderer.xr.getControllerGrip(0);
  grip0.add(modelFactory.createControllerModel(grip0));
  player.add(grip0);

  // Controlador Izquierdo: Teletransporte (Trigger) y Locomoción (Joystick)
  controllerLeft = renderer.xr.getController(1);
  controllerLeft.addEventListener('selectstart', onTeleportStart);
  controllerLeft.addEventListener('selectend', onTeleportEnd);
  player.add(controllerLeft);

  grip1 = renderer.xr.getControllerGrip(1);
  grip1.add(modelFactory.createControllerModel(grip1));
  player.add(grip1);
}

function setupTeleportArc() {
    arcMatOK = new THREE.LineBasicMaterial({ color: 0x00ff7f, linewidth: 2 });
    arcMatBAD = new THREE.LineBasicMaterial({ color: 0xff4040, linewidth: 2 });
    const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(ARC_STEPS + 1));
    arcLine = new THREE.Line(arcGeo, arcMatBAD);
    arcLine.visible = false;
    scene.add(arcLine);

    const markerGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12);
    markerGeo.translate(0, 0.025, 0);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff7f, transparent: true, opacity: 0.5 });
    marker = new THREE.Mesh(markerGeo, markerMat);
    marker.visible = false;
    scene.add(marker);
}

/** ========= LÓGICA DE JUEGO DE BOLOS (Adaptación VR) ========= */

function onSelectStart(event) {
    if (bowlGame) {
        // Llama a la función de inicio de acción del juego de bolos
        // Se usan coordenadas de pantalla ficticias (centro)
        bowlGame.onActionDown?.(window.innerWidth / 2, window.innerHeight / 2, performance.now());
    }
}

function onSelectEnd(event) {
    if (bowlGame) {
        // Llama a la función de final de acción (lanzamiento)
        bowlGame.onActionUp?.(window.innerWidth / 2, window.innerHeight / 2, performance.now()); 
        
        updateHUD();
    }
}

function updateHUD() {
    const scores = bowlGame?.scores; 
    if (scores) {
        document.getElementById('hudScore').innerText = scores.score || 0;
        document.getElementById('hudFrame').innerText = `${scores.frameNumber + 1} / 10`;
        // Calculamos los pines restantes basándonos en la información del juego
        const pinsStanding = 10 - (scores.beatenPins ? scores.beatenPins.length : 0);
        document.getElementById('hudPins').innerText = pinsStanding >= 0 ? pinsStanding : '0'; 
    }
}

/** ========= LOCOMOCIÓN VR (Completado) ========= */

function vrGamepadMove(dt) {
  const p = player.position;
  // Usamos el controlador izquierdo para el movimiento (joystick)
  const pad = controllerLeft.gamepad; 

  if (pad && pad.axes && pad.axes.length > 3) {
      // Joystick 1: Ejes 2 (X) y 3 (Y)
      const forward = pad.axes[3]; // Adelante/Atrás
      const strafe = pad.axes[2];  // Izquierda/Derecha

      if (Math.abs(forward) > 0.1 || Math.abs(strafe) > 0.1) {
          // 1. Obtener dirección de la cámara y anular Y (solo movimiento plano)
          camera.getWorldDirection(tempVector); 
          tempVector.setY(0).normalize();
          
          // 2. Calcular los vectores de movimiento
          const moveForward = tempVector.clone().multiplyScalar(forward * VR_WALK_SPEED * dt);
          const moveStrafe = tempVector.clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(strafe * VR_STRAFE_SPEED * dt);

          // 3. Aplicar movimiento
          const nextX = p.x + moveForward.x + moveStrafe.x;
          const nextZ = p.z + moveForward.z + moveStrafe.z;
          
          // 4. Actualizar y aplicar límites
          p.x = nextX;
          p.z = nextZ;
          clampToWorld(p);
      }
  }
}

function updateTeleportArc() {
    if (!teleporting) return;

    // 1. Obtener el punto de origen y la dirección del arco desde el controlador izquierdo
    tempMatrix.identity().extractRotation(controllerLeft.matrixWorld);
    const origin = tempVector.setFromMatrixPosition(controllerLeft.matrixWorld);
    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();

    const points = [];
    let hit = false;
    let hitPoint = new THREE.Vector3();
    let yVel = ARC_SPEED * direction.y + direction.y * 0.5;
    
    // 2. Calcular la parábola
    for (let i = 0; i <= ARC_STEPS; i++) {
        const t = i / ARC_SPEED; // Usamos ARC_SPEED en lugar de ARC_STEPS para calcular el tiempo
        const x = origin.x + direction.x * ARC_SPEED * t;
        const z = origin.z + direction.z * ARC_SPEED * t;
        const y = origin.y + yVel * t - 0.5 * ARC_GRAVITY * t * t;
        
        const currentPoint = new THREE.Vector3(x, y, z);
        points.push(currentPoint);

        // 3. Colisión con el suelo (Y = getTerrainHeight)
        if (y <= getTerrainHeight(currentPoint) && i > 1) {
            hit = true;
            hitPoint.copy(currentPoint);
            // Corregir el punto de impacto al suelo
            hitPoint.y = getTerrainHeight(currentPoint);
            break;
        }
    }

    // 4. Actualizar la línea y el marcador
    if (hit) {
        points.pop();
        points.push(hitPoint);
        arcLine.geometry.setFromPoints(points);
        arcLine.material = arcMatOK;
        marker.position.copy(hitPoint);
        marker.visible = true;
        arcLine.visible = true;
    } else {
        arcLine.geometry.setFromPoints(points);
        arcLine.material = arcMatBAD;
        arcLine.visible = true;
        marker.visible = false;
    }
}

function onTeleportStart(event) {
  const controller = event.target;
  if (controller === controllerLeft) {
      teleporting = true;
      arcLine.visible = true;
      marker.visible = true;
  }
}

function onTeleportEnd(event) {
  const controller = event.target;
  // Teletransporte solo si hay un destino válido
  if (teleporting && marker.visible && controller === controllerLeft) {
      const teleportPos = marker.position.clone();
      player.position.set(teleportPos.x, getTerrainHeight(teleportPos), teleportPos.z);
  }
  
  teleporting = false;
  arcLine.visible = false;
  marker.visible = false;
}

/** ========= BUCLE DE ANIMACIÓN ========= */
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (renderer.xr.isPresenting) {
    // 1. Locomoción
    vrGamepadMove(dt);
    if (teleporting) updateTeleportArc();
  }

  // 2. Actualizar la física y la lógica del juego de bolos
  if (gameInitialized) {
      physics.update(dt);
      bowlGame.update(dt);
      // Actualizamos el HUD en cada frame para reflejar el estado de los pines
      updateHUD();
  }

  renderer.render(scene, camera);
}

init(); // Iniciar la aplicación