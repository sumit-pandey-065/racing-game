import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sky, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import "./App.css";

const keys = {
  KeyW: false,
  KeyS: false,
  KeyA: false,
  KeyD: false,
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

function useKeyboard() {
  useEffect(() => {
    const onDown = (e) => {
      if (e.code in keys) keys[e.code] = true;
    };
    const onUp = (e) => {
      if (e.code in keys) keys[e.code] = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
}

function SnowFlakes() {
  const points = useRef();
  const tick = useRef(0);
  const particles = useMemo(() => {
    const count = 720;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 120;
      arr[i * 3 + 1] = Math.random() * 35 + 5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const pos = points.current.geometry.attributes.position.array;
    const total = pos.length / 3;
    const batch = 190;
    const start = (tick.current * batch) % total;
    for (let k = 0; k < batch; k += 1) {
      const i = ((start + k) % total) * 3;
      pos[i + 1] -= delta * (2 + (i % 7) * 0.1);
      if (pos[i + 1] < 0.3) {
        pos[i + 1] = Math.random() * 30 + 8;
      }
    }
    tick.current += 1;
    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particles.length / 3} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#f2f8ff" size={0.2} sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

function Trees() {
  const trees = useMemo(() => {
    const out = [];
    for (let i = 0; i < 60; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -80 + i * 3;
      out.push({ x: side * (10 + Math.random() * 25), z, s: 0.8 + Math.random() * 1.6 });
    }
    return out;
  }, []);

  return (
    <group>
      {trees.map((t, idx) => (
        <group key={idx} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 1.6, 10]} />
            <meshStandardMaterial color="#4a342a" />
          </mesh>
          <mesh position={[0, 2.4, 0]} castShadow>
            <coneGeometry args={[1.1, 2.2, 12]} />
            <meshStandardMaterial color="#1f5a2e" />
          </mesh>
          <mesh position={[0, 3.2, 0]} castShadow>
            <coneGeometry args={[0.8, 1.6, 12]} />
            <meshStandardMaterial color="#2e7a41" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function trackProgress(carPos, raceStateRef, checkpoints) {
  const state = raceStateRef.current;
  const nextIndex = state.nextCheckpoint;
  const target = checkpoints[nextIndex];
  if (!target) return;

  const dist = carPos.distanceTo(target);
  if (dist > 4.2) return;

  if (nextIndex === checkpoints.length - 1) {
    state.lap += 1;
    state.nextCheckpoint = 0;
    state.lastLapMs = performance.now() - state.lapStartMs;
    state.lapStartMs = performance.now();
  } else {
    state.nextCheckpoint += 1;
  }
}

function Obstacles({ items }) {
  return (
    <group>
      {items.map((o, idx) => (
        <group key={idx} position={[o.x, o.y, o.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={o.size} />
            <meshStandardMaterial color={o.color} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CheckpointMarkers({ checkpoints, raceStateRef }) {
  const markerRefs = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    markerRefs.current.forEach((mesh, idx) => {
      if (!mesh) return;
      const isNext = idx === raceStateRef.current.nextCheckpoint;
      mesh.material.opacity = isNext ? 0.75 : 0.35;
      mesh.material.color.set(isNext ? "#41d3ff" : "#91a9c7");
      mesh.position.y = 0.8 + Math.sin(t * 2 + idx) * 0.15;
    });
  });

  return (
    <group>
      {checkpoints.map((cp, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            markerRefs.current[idx] = el;
          }}
          position={[cp.x, 0.8, cp.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[2, 0.18, 10, 36]} />
          <meshStandardMaterial transparent opacity={0.4} color="#91a9c7" emissive="#0f2538" emissiveIntensity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Car({ speedRef, driftRef, raceStateRef, checkpoints, obstacles, resetSignal }) {
  const car = useRef();
  const velocity = useRef(new THREE.Vector3());
  const heading = useRef(0);
  const sideSlip = useRef(0);
  const cameraOffset = useMemo(() => new THREE.Vector3(0, 4, 10), []);
  const cameraLook = useMemo(() => new THREE.Vector3(), []);
  const cameraTargetPos = useMemo(() => new THREE.Vector3(), []);
  const forwardVec = useMemo(() => new THREE.Vector3(), []);
  const rightVec = useMemo(() => new THREE.Vector3(), []);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const cameraUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(() => {
    if (!car.current) return;
    car.current.position.set(0, 0.35, 0);
    car.current.rotation.set(0, 0, 0);
    velocity.current.set(0, 0, 0);
    heading.current = 0;
    sideSlip.current = 0;
    speedRef.current = 0;
    driftRef.current = 0;
  }, [resetSignal, driftRef, speedRef]);

  useFrame(({ camera }, delta) => {
    if (!raceStateRef.current.raceActive) {
      velocity.current.multiplyScalar(THREE.MathUtils.clamp(1 - 4 * delta, 0, 1));
      car.current.position.addScaledVector(velocity.current, delta);
      speedRef.current = Math.round(velocity.current.length() * 12);
      driftRef.current = 0;
      cameraTargetPos.copy(car.current.position).add(cameraOffset.clone().applyAxisAngle(cameraUp, heading.current));
      camera.position.lerp(cameraTargetPos, 1 - Math.exp(-delta * 6));
      cameraLook.copy(car.current.position).add(new THREE.Vector3(0, 1.2, 0));
      camera.lookAt(cameraLook);
      return;
    }

    const accelInput = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const steerInput = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);

    const acceleration = 18;
    const maxForward = 24;
    const maxBackward = 10;
    const baseGrip = 8.5;
    const steerStrength = 2.3;

    forwardVec.set(Math.sin(heading.current), 0, Math.cos(heading.current));
    rightVec.set(forwardVec.z, 0, -forwardVec.x);
    const currentForwardSpeed = velocity.current.dot(forwardVec);
    const currentSideSpeed = velocity.current.dot(rightVec);

    const throttleForce = accelInput * acceleration;
    const desiredForward = THREE.MathUtils.clamp(currentForwardSpeed + throttleForce * delta, -maxBackward, maxForward);
    const speedFactor = THREE.MathUtils.clamp(Math.abs(currentForwardSpeed) / maxForward, 0, 1);
    heading.current += steerInput * steerStrength * delta * (0.25 + speedFactor * 0.85);

    // Lower side grip at high speed to create controllable snow drift.
    const sideGrip = THREE.MathUtils.lerp(baseGrip, 2.1, speedFactor);
    const sideDamping = THREE.MathUtils.clamp(1 - sideGrip * delta, 0, 1);
    sideSlip.current = currentSideSpeed * sideDamping;

    velocity.current.copy(forwardVec).multiplyScalar(desiredForward).addScaledVector(rightVec, sideSlip.current);
    velocity.current.addScaledVector(velocity.current, -1.8 * delta);

    car.current.rotation.y = heading.current;
    car.current.position.addScaledVector(velocity.current, delta);
    car.current.rotation.z = THREE.MathUtils.lerp(car.current.rotation.z, -THREE.MathUtils.clamp(sideSlip.current * 0.05, -0.2, 0.2), 0.2);

    car.current.position.x = THREE.MathUtils.clamp(car.current.position.x, -38, 38);
    car.current.position.z = THREE.MathUtils.clamp(car.current.position.z, -95, 25);

    for (let i = 0; i < obstacles.length; i += 1) {
      const o = obstacles[i];
      tmpVec.set(o.x, o.y, o.z);
      const dist = car.current.position.distanceTo(tmpVec);
      if (dist < o.hitRadius + 1.1) {
        const push = car.current.position.clone().sub(tmpVec).normalize();
        car.current.position.addScaledVector(push, (o.hitRadius + 1.1 - dist) * 0.9);
        velocity.current.addScaledVector(push, 3.5);
        velocity.current.multiplyScalar(0.55);
      }
    }

    trackProgress(car.current.position, raceStateRef, checkpoints);
    speedRef.current = Math.round(velocity.current.length() * 12);
    driftRef.current = Math.round(Math.abs(sideSlip.current) * 20);

    cameraTargetPos.copy(car.current.position).add(cameraOffset.clone().applyAxisAngle(cameraUp, heading.current));
    camera.position.lerp(cameraTargetPos, 1 - Math.exp(-delta * 6));
    cameraLook.copy(car.current.position).add(new THREE.Vector3(0, 1.2, 0));
    camera.lookAt(cameraLook);
  });

  return (
    <group ref={car} position={[0, 0.35, 0]} castShadow>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.6, 0.6, 3.2]} />
        <meshStandardMaterial color="#b70f20" roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.9, -0.15]} castShadow>
        <boxGeometry args={[1.3, 0.5, 1.6]} />
        <meshStandardMaterial color="#cf2535" roughness={0.3} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.93, -0.18]} castShadow>
        <boxGeometry args={[1.15, 0.35, 1.25]} />
        <meshStandardMaterial color="#7fc5ff" roughness={0.1} metalness={0.1} transparent opacity={0.75} />
      </mesh>

      {[
        [-0.85, 0.2, -1.1],
        [0.85, 0.2, -1.1],
        [-0.85, 0.2, 1.1],
        [0.85, 0.2, 1.1],
      ].map((p, idx) => (
        <mesh key={idx} position={p} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.33, 0.33, 0.25, 20]} />
          <meshStandardMaterial color="#111" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -30]}>
        <planeGeometry args={[140, 180, 64, 64]} />
        <meshStandardMaterial color="#f5fbff" roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -35]}>
        <planeGeometry args={[8, 150]} />
        <meshStandardMaterial color="#d6dce2" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Scene({ speedRef, driftRef, raceStateRef, checkpoints, obstacles, resetSignal }) {
  return (
    <>
      <fog attach="fog" args={["#dceeff", 25, 125]} />
      <Sky distance={450000} sunPosition={[3, 1, 8]} inclination={0.54} azimuth={0.2} turbidity={9} rayleigh={0.45} mieCoefficient={0.006} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 18, 6]} intensity={1.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <Environment preset="warehouse" />
      <Ground />
      <Trees />
      <Obstacles items={obstacles} />
      <CheckpointMarkers checkpoints={checkpoints} raceStateRef={raceStateRef} />
      <SnowFlakes />
      <Car
        speedRef={speedRef}
        driftRef={driftRef}
        raceStateRef={raceStateRef}
        checkpoints={checkpoints}
        obstacles={obstacles}
        resetSignal={resetSignal}
      />
      <Text position={[0, 4, -10]} fontSize={0.9} color="#214764" anchorX="center" anchorY="middle">
        Snow Drive
      </Text>
    </>
  );
}

function formatLapTime(ms) {
  if (!ms) return "--:--.--";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  const cent = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, "0")}:${String(rest).padStart(2, "0")}.${String(cent).padStart(2, "0")}`;
}

function Hud({
  speed,
  drift,
  lap,
  nextCheckpoint,
  totalCheckpoints,
  lapTime,
  bestLapTime,
  countdown,
  raceWon,
  totalLaps,
  onRestart,
  onClearBestLap,
}) {
  return (
    <div className="hud">
      <div className="card">
        <p>WASD / Arrow Keys</p>
        <h3>{speed} km/h</h3>
        <p>Drift {drift}</p>
        <p>Lap {lap}</p>
        <p>
          CP {nextCheckpoint + 1}/{totalCheckpoints}
        </p>
        <p>Last Lap {formatLapTime(lapTime)}</p>
        <p>Best Lap {formatLapTime(bestLapTime)}</p>
        <p>
          Goal {Math.min(lap, totalLaps)}/{totalLaps} laps
        </p>
      </div>
      {countdown > 0 && (
        <div className="overlay">
          <h1>{countdown}</h1>
          <p>Get ready</p>
        </div>
      )}
      {countdown === 0 && !raceWon && (
        <div className="overlay small">
          <h1>GO!</h1>
        </div>
      )}
      {raceWon && (
        <div className="overlay win">
          <h1>You Win</h1>
          <p>
            Best Lap {formatLapTime(bestLapTime)} | Last Lap {formatLapTime(lapTime)}
          </p>
          <div className="actions">
            <button type="button" onClick={onRestart}>
              Restart Race (R)
            </button>
            <button type="button" onClick={onClearBestLap}>
              Clear Best Lap
            </button>
          </div>
        </div>
      )}
      {!raceWon && (
        <div className="top-actions">
          <button type="button" onClick={onRestart}>
            Restart (R)
          </button>
          <button type="button" onClick={onClearBestLap}>
            Clear Best
          </button>
        </div>
      )}
    </div>
  );
}

function getStoredBestLap() {
  try {
    const raw = localStorage.getItem("snow-drive-best-lap-ms");
    if (!raw) return 0;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

function setStoredBestLap(ms) {
  try {
    localStorage.setItem("snow-drive-best-lap-ms", String(ms));
  } catch {
    // no-op for blocked storage environments
  }
}

const TOTAL_LAPS_TO_WIN = 3;

export default function App() {
  useKeyboard();
  const speedRef = useRef(0);
  const driftRef = useRef(0);
  const raceStateRef = useRef({
    lap: 1,
    nextCheckpoint: 0,
    lapStartMs: performance.now(),
    lastLapMs: 0,
    raceActive: false,
    raceWon: false,
  });

  const checkpoints = useMemo(
    () => [
      new THREE.Vector3(0, 0.5, 16),
      new THREE.Vector3(30, 0.5, -8),
      new THREE.Vector3(0, 0.5, -72),
      new THREE.Vector3(-30, 0.5, -8),
    ],
    []
  );
  const obstacles = useMemo(
    () => [
      { x: -6, y: 0.7, z: -14, size: [2, 1.3, 2], color: "#9b724f", hitRadius: 1.3 },
      { x: 8, y: 0.6, z: -26, size: [1.7, 1.1, 1.7], color: "#7d8ea6", hitRadius: 1.2 },
      { x: -12, y: 0.85, z: -38, size: [2.2, 1.5, 2.2], color: "#8b6856", hitRadius: 1.4 },
      { x: 10, y: 0.65, z: -54, size: [1.9, 1.2, 1.9], color: "#6f849f", hitRadius: 1.2 },
      { x: -4, y: 0.75, z: -66, size: [2.4, 1.4, 2.4], color: "#9a7c60", hitRadius: 1.5 },
      { x: 12, y: 0.6, z: -78, size: [1.6, 1.1, 1.6], color: "#7389a3", hitRadius: 1.1 },
    ],
    []
  );

  const [speed, setSpeed] = useState(0);
  const [drift, setDrift] = useState(0);
  const [lap, setLap] = useState(1);
  const [nextCheckpoint, setNextCheckpoint] = useState(0);
  const [lapTime, setLapTime] = useState(0);
  const [bestLapTime, setBestLapTime] = useState(() => getStoredBestLap());
  const [countdown, setCountdown] = useState(3);
  const [raceWon, setRaceWon] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const countdownTimerRef = useRef(null);

  const startCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    let count = 3;
    setCountdown(3);
    raceStateRef.current.raceActive = false;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count === 0) {
        raceStateRef.current.raceActive = true;
        raceStateRef.current.lapStartMs = performance.now();
      }
      if (count < 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }, 1000);
  };

  const restartRace = () => {
    raceStateRef.current = {
      lap: 1,
      nextCheckpoint: 0,
      lapStartMs: performance.now(),
      lastLapMs: 0,
      raceActive: false,
      raceWon: false,
    };
    setSpeed(0);
    setDrift(0);
    setLap(1);
    setNextCheckpoint(0);
    setLapTime(0);
    setRaceWon(false);
    setResetSignal((n) => n + 1);
    startCountdown();
  };

  const clearBestLap = () => {
    setBestLapTime(0);
    setStoredBestLap(0);
  };

  useEffect(() => {
    startCountdown();
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "KeyR") restartRace();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const state = raceStateRef.current;
      if (state.raceWon) state.raceActive = false;

      if (state.lastLapMs > 0 && (bestLapTime === 0 || state.lastLapMs < bestLapTime)) {
        setBestLapTime(state.lastLapMs);
        setStoredBestLap(state.lastLapMs);
      }

      if (!state.raceWon && state.lap > TOTAL_LAPS_TO_WIN) {
        state.raceWon = true;
        state.raceActive = false;
      }

      setSpeed(speedRef.current);
      setDrift(driftRef.current);
      setLap(state.lap);
      setNextCheckpoint(state.nextCheckpoint);
      setLapTime(state.lastLapMs);
      setRaceWon(state.raceWon);
    }, 120);
    return () => clearInterval(id);
  }, [bestLapTime]);

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [0, 4, 10], fov: 55 }}>
        <Scene
          speedRef={speedRef}
          driftRef={driftRef}
          raceStateRef={raceStateRef}
          checkpoints={checkpoints}
          obstacles={obstacles}
          resetSignal={resetSignal}
        />
      </Canvas>
      <Hud
        speed={speed}
        drift={drift}
        lap={lap}
        nextCheckpoint={nextCheckpoint}
        totalCheckpoints={checkpoints.length}
        lapTime={lapTime}
        bestLapTime={bestLapTime}
        countdown={countdown}
        raceWon={raceWon}
        totalLaps={TOTAL_LAPS_TO_WIN}
        onRestart={restartRace}
        onClearBestLap={clearBestLap}
      />
    </div>
  );
}
