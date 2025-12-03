// bowlchallenge.js (ADAPTADO para ser un módulo de juego llamado por main.js)

// ===================================================================
// VARIABLES GLOBALES (Limpiadas de duplicados de Three.js)
// ===================================================================

// Nota: Constantes como BALL_ANGLE_MAX y TRACK_WIDTH se asumen definidas en bowlphysics.js o scores.js
const CAMERA_FOV = 50.0;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10.0;

const FRAME_ROLL_TIME = 3.0;

const GRAB_BALL_THRESHOLD_INCH = 0.05;
const GRAB_BALL_THRESHOLD_INCH_SQUARED = GRAB_BALL_THRESHOLD_INCH * GRAB_BALL_THRESHOLD_INCH;
// Se asume que BALL_ANGLE_MAX está definido en bowlphysics.js
const GRAB_BALL_ROLL_POS_RATIO = Math.tan(BALL_ANGLE_MAX); 

// Se asume que TRACK_WIDTH está definido en bowlphysics.js
const TRACK_DISTANCE = TRACK_WIDTH + 0.1; 

const IMITATION_EMERGING_TIME_MIN = 2.0;
const IMITATION_EMERGING_TIME_MAX = 10.0;
const IMITATION_THROW_TIME_MIN = 3.5;
const IMITATION_THROW_TIME_MAX = 7.0;
const IMITATION_THROW_POSITION_MAX = 0.3;
const IMITATION_THROW_ANGLE_MAX = Math.PI / 18.0;

// ELIMINADAS: var container, scene, camera, clock, renderer, ppi; <-- Evita conflictos
var touchPoint, raycaster, pickPoint, dragPoint, releaseVector, pickSphere;
var trackProtoMesh, ballProtoMesh, pinProtoMesh;
var players, imitations, scoresDiv; 

var imitationPlayerId = 0;
var pickingBall = false;
var positioningBall = false;
var rollingBall = false;
var pickX = 0.0;
var pickY = 0.0;
var pickOffset = 0.0;
var pickTime = 0;

// ===================================================================
// CLASES (Mantenidas)
// ===================================================================

class Player {
	constructor(id, local, physics, scores, ballMesh, pinMeshes) {
		this.id = id;
		this.local = local;
		this.physics = physics;
		this.scores = scores;
		this.ballMesh = ballMesh;
		this.pinMeshes = pinMeshes;
	}
}

class Imitation {
	constructor(frames, emergingTime, slot) {
		this.frames = frames;
		this.waitingTime = emergingTime;
		this.slot = slot;
	}
}

// ===================================================================
// FUNCIONES UTILITARIAS (Adaptadas)
// ===================================================================

// ELIMINADAS: function init(), function setAnisotropy(parent, anisotropy)

function getLocalPlayer() {
	if (!players) {
		return undefined;
	}
	return players.find(p => p.local);
}

// ADAPTADA: Ahora recibe la escena y la física ya creadas por main.js
function addPlayer(id, local, slot, sceneRef, physicsRef) {
	var physics = physicsRef; 
	// Scores se asume disponible globalmente
	var scores = new Scores(); 

	var group = new THREE.Group();
	group.position.x = slot * TRACK_DISTANCE;
	sceneRef.add(group); 

	var trackMesh = trackProtoMesh.clone();
	group.add(trackMesh);

	var ballMesh = ballProtoMesh.clone();
	group.add(ballMesh);

	// PIN_COUNT se asume disponible globalmente (de bowlphysics.js)
	var pinMeshes = new Array(PIN_COUNT); 
	for (var i = 0; i < pinMeshes.length; i++) {
		var pinMesh = pinProtoMesh.clone();
		group.add(pinMesh);
		pinMeshes[i] = pinMesh;
	}

	var player = new Player(id, local, physics, scores, ballMesh, pinMeshes);

	if (!players) {
		players = new Array();
	}
	players.push(player);

	return player;
}

function removePlayer(id, sceneRef) {
	if (!players) {
		return;
	}
	for (var i = 0; i < players.length; i++) {
		var player = players[i];
		if (player.id === id) {
			sceneRef.remove(player.ballMesh.parent); 
			players.splice(i, 1);
			return;
		}
	}
}

function createImitation(slot) {
	// FRAME_COUNT se asume disponible globalmente (de scores.js)
	var frames = 1 + Math.floor(Math.random() * FRAME_COUNT); 
	var emergingTime = IMITATION_EMERGING_TIME_MIN + Math.random()
			* (IMITATION_EMERGING_TIME_MAX - IMITATION_EMERGING_TIME_MIN);
	return new Imitation(frames, emergingTime, slot);
}

function addImitation(slot) {
	var imitation = createImitation(slot);
	if (!imitations) {
		imitations = new Array();
	}
	imitations.push(imitation);
	return imitation;
}

function restartImitation(imitation) {
	if (imitation.player) {
		removePlayer(imitation.player.id);
	}
	if (!imitations) {
		return;
	}
	var imitationIndex = imitations.findIndex(i => i === imitation);
	if (imitationIndex === undefined) {
		return;
	}
	imitations[imitationIndex] = createImitation(imitation.slot);
}

function updateImitation(imitation, dt, sceneRef) {
	imitation.waitingTime -= dt;
	if (imitation.waitingTime > 0.0) {
		return;
	}

	imitation.waitingTime = IMITATION_THROW_TIME_MIN + Math.random()
			* (IMITATION_THROW_TIME_MAX - IMITATION_THROW_TIME_MIN);

	if (!imitation.player) {
		// Pasa las referencias a escena y física del jugador local
		imitation.player = addPlayer(++imitationPlayerId, false, imitation.slot, sceneRef, players[0].physics);
	}

	if (imitation.player.scores.gameOver
			|| (imitation.player.scores.frameNumber >= imitation.frames)) {
		restartImitation(imitation);
		return;
	}

	var position = IMITATION_THROW_POSITION_MAX * 2.0 * (Math.random() - 0.5);
	var angle = IMITATION_THROW_ANGLE_MAX * 2.0 * (Math.random() - 0.5);
	var velocity = players[0].physics.BALL_VELOCITY_MIN + Math.random() * (players[0].physics.BALL_VELOCITY_MAX - players[0].physics.BALL_VELOCITY_MIN);
	imitation.player.physics.positionBall(position, false);
	imitation.player.physics.releaseBall(velocity, angle);
}

// ELIMINADA: function initScene() 

function updateGame(player, dt) {
	player.physics.updatePhysics(dt);

	if (player.physics.simulationActive && (player.physics.simulationTime > FRAME_ROLL_TIME)) {
		var standingPinsMask = player.physics.detectStandingPins();
		var beatenPinsMask = player.physics.currentPinsMask & (~standingPinsMask);
		var beatenPinCount = player.physics.countPins(beatenPinsMask);

		var prevFrameNumber = player.scores.frameNumber;
		player.scores.addThrowResult(beatenPinCount);
		
		// ELIMINADA: La actualización directa del scoreDiv. main.js lo maneja vía updateHUD().

		if (!player.scores.gameOver) {
			var pinsMask;
			if ((prevFrameNumber != player.scores.frameNumber) || (standingPinsMask == 0)) {
				pinsMask = -1;
			} else {
				pinsMask = standingPinsMask;
			}
			player.physics.resetPhysics(false, pinsMask);
		} else if (player.local) {
			alert("Game over");
			player.scores = new Scores();
			player.physics.resetPhysics();
		}
	}

	syncView(player);
}

// ADAPTADA: Recibe sceneRef para poder manejar las imitaciones
function updateScene(dt, sceneRef) {
	if (imitations) {
		for (var i = 0; i < imitations.length; i++) {
			updateImitation(imitations[i], dt, sceneRef);
		}
	}

	if (players) {
		for (var i = 0; i < players.length; i++) {
			updateGame(players[i], dt);
		}
	}
}

// ELIMINADA: resizeViewport()
// ELIMINADAS: render() y animate()

function syncMeshToBody(mesh, body) {
	var transform = body.getCenterOfMassTransform();
	var p = transform.getOrigin();
	var q = transform.getRotation();
	mesh.position.set(p.x(), p.y(), p.z());
	mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
}

function syncView(player) {
	if (player.local || player.physics.simulationActive) {
		player.ballMesh.visible = true;
		syncMeshToBody(player.ballMesh, player.physics.ballBody);
	} else {
		player.ballMesh.visible = false;
	}
	for (var i = 0; i < player.physics.pinBodies.length; i++) {
		var pinBody = player.physics.pinBodies[i];
		var pinMesh = player.pinMeshes[i];
		if (pinBody) {
			pinMesh.visible = true;
			syncMeshToBody(pinMesh, pinBody);
		} else {
			pinMesh.visible = false;
		}
	}
}

// ===================================================================
// FUNCIONES DE ACCIÓN (Adaptadas para VR)
// ===================================================================

function updateTouchRay(clientX, clientY, cameraRef) {
	// En VR, esta función no se usa tan directamente, pero la mantenemos
	// para que las funciones onActionDown/Up/Move funcionen como en el original.
	// La referencia a THREE.js es necesaria
    
    // Asumimos que cameraRef es la cámara pasada desde main.js
	var rect = document.getElementById('scene').getBoundingClientRect();
    
	touchPoint.x = ((clientX - rect.left) / rect.width) * 2.0 - 1.0;
	touchPoint.y = -((clientY - rect.top) / rect.height) * 2.0 + 1.0;

	// raycaster se inicializa en window.BowlChallenge.
	raycaster.setFromCamera(touchPoint, cameraRef); 
}

function intersectTouchPlane(ray) {
    // BASE_HEIGHT se asume de bowlphysics.js
	if (Math.abs(ray.direction.y) > 1e-5) { 
		var t = (BASE_HEIGHT - ray.origin.y) / ray.direction.y;
		if (t >= 0.0) {
			dragPoint.copy(ray.direction).multiplyScalar(t).add(ray.origin);
			return true;
		}
	}
	return false;
}

// onActionDown recibe clientX, clientY, time y el objeto camera de main.js
function onActionDown(clientX, clientY, time, cameraRef) {
	var localPlayer = getLocalPlayer();
	if (!localPlayer) {
		return;
	}

	if (localPlayer.physics.simulationActive) {
		return;
	}

    // Usamos un valor fijo para ppi, ya que no podemos acceder a renderer aquí.
    var ppi = 96 * window.devicePixelRatio; 

	updateTouchRay(clientX, clientY, cameraRef); // Usar la referencia de la cámara

	pickingBall = false;
	positioningBall = false;
	rollingBall = false;

	if (!intersectTouchPlane(raycaster.ray)) {
		return;
	}

    // BALL_HEIGHT, BALL_LINE, BALL_RADIUS se asumen de bowlphysics.js
	pickSphere.center.set(localPlayer.physics.releasePosition, BALL_HEIGHT, BALL_LINE);
	if (raycaster.ray.intersectsSphere(pickSphere)) {
		pickOffset = dragPoint.x - localPlayer.physics.releasePosition;
		pickPoint.copy(dragPoint);
		pickingBall = true;
		pickX = clientX;
		pickY = clientY;
		pickTime = time;
	}
}

// onActionMove recibe clientX, clientY, time y el objeto camera de main.js
function onActionMove(clientX, clientY, time, cameraRef) {
	var localPlayer = getLocalPlayer();
	if (!localPlayer) {
		return;
	}

	if (localPlayer.physics.simulationActive) {
		return;
	}
    
    // Usamos un valor fijo para ppi
    var ppi = 96 * window.devicePixelRatio; 

	updateTouchRay(clientX, clientY, cameraRef); // Usar la referencia de la cámara

	if (!intersectTouchPlane(raycaster.ray)) {
		return;
	}

	if (pickingBall) {
		var distX = clientX - pickX;
		var distY = clientY - pickY;
		var grabDistanceSquared = distX * distX + distY * distY;
		if (grabDistanceSquared > ppi * ppi * GRAB_BALL_THRESHOLD_INCH_SQUARED) {
			if ((pickPoint.z - dragPoint.z) * GRAB_BALL_ROLL_POS_RATIO
					> Math.abs(pickPoint.x - dragPoint.x)) {
				rollingBall = true;
			} else {
				positioningBall = true;
			}
			pickingBall = false;
		}
	}

	if (positioningBall) {
		var position = dragPoint.x - pickOffset;
		localPlayer.physics.positionBall(position);
	}
}

function onActionUp(clientX, clientY, time) {
	var localPlayer = getLocalPlayer();
	if (!localPlayer) {
		return;
	}

	if (localPlayer.physics.simulationActive) {
		return;
	}

	if (rollingBall) {
		releaseVector.copy(dragPoint).sub(pickPoint);
        // BALL_VELOCITY_MAX se asume disponible
		var velocity = (time > pickTime)
				? releaseVector.length() / (1e-3 * (time - pickTime))
				: BALL_VELOCITY_MAX;
		var angle = Math.atan2(-releaseVector.x, -releaseVector.z);
		localPlayer.physics.releaseBall(velocity, angle);
	}

	pickingBall = false;
	positioningBall = false;
	rollingBall = false;
}

// ELIMINADAS: Todas las funciones onDocumentMouse/Touch...

// ===================================================================
// INICIALIZACIÓN ADAPTADA PARA VR (window.BowlChallenge)
// ===================================================================

// Exportamos la función para que main.js la llame después de Ammo()
window.BowlChallenge = function(sceneRef, physicsRef, playerGroup, cameraRef) {
    
	// 1. Inicialización de variables globales usadas por onActionDown/Up
    touchPoint = new THREE.Vector2();
    pickPoint = new THREE.Vector3();
    dragPoint = new THREE.Vector3();
    releaseVector = new THREE.Vector3();
	
	// Raycaster y pickSphere se inicializan aquí
    raycaster = new THREE.Raycaster();
    // Asumimos que BALL_RADIUS está en physicsRef si no está globalmente
    pickSphere = new THREE.Sphere(new THREE.Vector3(), physicsRef.BALL_RADIUS || 0.1); 
    
    // 2. LÓGICA DE CARGA DE MODELOS
	// THREE.GLTFLoader se asume globalmente disponible
	var loader = new THREE.GLTFLoader();
	
	// RUTA CRÍTICA: La ruta del GLTF debe ser la correcta (res/scene.gltf según tu código original)
	loader.load("res/scene.gltf", (gltf) => {
		
		// 2.1 Extraer los prototipos del modelo GLTF
		trackProtoMesh = gltf.scene.children.find(child => child.name == "Track");
		if (!trackProtoMesh) {
			throw new Error("Track not found");
		}
		ballProtoMesh = gltf.scene.children.find(child => child.name == "Ball");
		if (!ballProtoMesh) {
			throw new Error("Ball not found");
		}
		pinProtoMesh = gltf.scene.children.find(child => child.name == "Pin");
		if (!pinProtoMesh) {
			throw new Error("Pin not found");
		}

		// 2.2 Inicializar la Pista y el Jugador
		sceneRef.add(trackProtoMesh); 
		
		physicsRef.initTrack(trackProtoMesh); 

		// Añadir jugador local (slot 0)
		addPlayer(0, true, 0, sceneRef, physicsRef); 
		
	}, (xhr) => {
		// Función de progreso (opcional)
	}, (error) => {
		console.error('Error loading GLTF model:', error);
		alert("ERROR: No se pudo cargar el modelo 3D (res/scene.gltf). Revisa la ruta en bowlchallenge.js.");
	});

	// 3. RETORNO DE INTERFAZ
	return {
		// Llama a updateScene() que actualiza todos los jugadores
		update: (dt) => updateScene(dt, sceneRef), 
		
		// Las acciones ahora necesitan la cámara para el raycasting
		onActionDown: (clientX, clientY, time) => onActionDown(clientX, clientY, time, cameraRef),
		onActionMove: (clientX, clientY, time) => onActionMove(clientX, clientY, time, cameraRef),
		onActionUp: onActionUp,
		
		get scores() { 
			return getLocalPlayer() ? getLocalPlayer().scores : null;
		}
	};
}

// ELIMINADA la llamada automática a init() al final del archivo.