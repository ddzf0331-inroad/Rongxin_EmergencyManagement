import { RefreshCcw, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MAP_SCALE_X, MAP_SCALE_Y, physicalToMap } from "../mapGeometry";
import type { ConsequenceZone, EscapeRoute, MapCalibration, MapLayerKey, MapPoint } from "../types";

interface MapStageProps {
  points: MapPoint[];
  routes: EscapeRoute[];
  activeLayers: Record<MapLayerKey, boolean>;
  selectedPointId?: string;
  onSelectPoint: (point: MapPoint) => void;
  initialZoom?: number;
  initialPosition?: { x: number; y: number };
  initialRotation?: number;
  simulationZones?: ConsequenceZone[];
  simulationSource?: { eastM: number; northM: number };
  calibration?: MapCalibration;
  onSelectZone?: (zone: ConsequenceZone) => void;
  onSelectMapCoordinate?: (point: { x: number; y: number }) => void;
}

const LAYER_STYLE: Record<MapLayerKey, { color: string; label: string }> = {
  camera: { color: "#0e7cff", label: "视频" },
  material: { color: "#ff9d18", label: "物资" },
  plan: { color: "#24a8ff", label: "预案" },
  personnel: { color: "#3ed56d", label: "人员" },
  hazard: { color: "#ff5638", label: "危险源" },
  drill: { color: "#9b7cff", label: "演练" },
  alarm: { color: "#ff3333", label: "报警" },
  duty: { color: "#21d6d2", label: "值班" },
  escapeRoute: { color: "#32c871", label: "路线" },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeMarkerTexture(point: MapPoint, selected: boolean) {
  const style = LAYER_STYLE[point.layer];
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = style.color;
  ctx.shadowBlur = selected ? 30 : 18;

  const pinX = 64;
  const pinY = 72;
  const radius = selected ? 31 : 26;

  ctx.beginPath();
  ctx.arc(pinX, pinY, radius, 0, Math.PI * 2);
  ctx.fillStyle = style.color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = selected ? "#ffffff" : "rgba(255,255,255,0.82)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pinX - 13, pinY + radius - 3);
  ctx.lineTo(pinX + 13, pinY + radius - 3);
  ctx.lineTo(pinX, pinY + radius + 29);
  ctx.closePath();
  ctx.fillStyle = style.color;
  ctx.fill();

  ctx.shadowBlur = 0;
  drawLayerIcon(ctx, point.layer, pinX, pinY, selected ? 39 : 34);

  const labelX = 104;
  const labelY = 42;
  const labelW = Math.min(374, 74 + point.name.length * 15);
  const labelH = 58;
  ctx.shadowColor = style.color;
  ctx.shadowBlur = selected ? 28 : 14;
  roundRect(ctx, labelX, labelY, labelW, labelH, 10);
  ctx.fillStyle = hexToRgba(style.color, selected ? 0.72 : 0.54);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(style.color, 0.92);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.font = "700 25px Arial";
  ctx.fillStyle = "#dff8ff";
  ctx.fillText(point.name, labelX + 20, labelY + 30);

  if (point.status) {
    ctx.font = "18px Arial";
    ctx.fillStyle = "rgba(211, 239, 255, 0.86)";
    ctx.fillText(point.status, labelX + 20, labelY + 52);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawLayerIcon(ctx: CanvasRenderingContext2D, layer: MapLayerKey, x: number, y: number, size: number) {
  const scale = size / 48;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";

  if (layer === "camera") {
    roundRect(ctx, -18, -12, 36, 25, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 1, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, -16);
    ctx.lineTo(-2, -16);
    ctx.lineTo(2, -12);
    ctx.stroke();
  } else if (layer === "material") {
    ctx.beginPath();
    ctx.rect(-17, -13, 34, 29);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-17, -3);
    ctx.lineTo(17, -3);
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 16);
    ctx.moveTo(-10, -13);
    ctx.lineTo(-4, -3);
    ctx.moveTo(10, -13);
    ctx.lineTo(4, -3);
    ctx.stroke();
  } else if (layer === "plan") {
    ctx.beginPath();
    ctx.moveTo(-13, -18);
    ctx.lineTo(7, -18);
    ctx.lineTo(16, -9);
    ctx.lineTo(16, 18);
    ctx.lineTo(-13, 18);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, -18);
    ctx.lineTo(7, -9);
    ctx.lineTo(16, -9);
    ctx.moveTo(-5, 3);
    ctx.lineTo(-1, 8);
    ctx.lineTo(9, -3);
    ctx.stroke();
  } else if (layer === "personnel") {
    ctx.beginPath();
    ctx.arc(0, -10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 15);
    ctx.moveTo(-13, 7);
    ctx.quadraticCurveTo(0, -1, 13, 7);
    ctx.moveTo(-10, 18);
    ctx.quadraticCurveTo(0, 10, 10, 18);
    ctx.stroke();
  } else if (layer === "hazard") {
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(19, 15);
    ctx.lineTo(-19, 15);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 11, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (layer === "drill") {
    roundRect(ctx, -16, -16, 32, 32, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, -6);
    ctx.lineTo(16, -6);
    ctx.moveTo(-8, -20);
    ctx.lineTo(-8, -12);
    ctx.moveTo(8, -20);
    ctx.lineTo(8, -12);
    ctx.moveTo(-6, 7);
    ctx.lineTo(-1, 12);
    ctx.lineTo(10, 0);
    ctx.stroke();
  } else if (layer === "alarm") {
    ctx.beginPath();
    ctx.moveTo(-13, 13);
    ctx.lineTo(13, 13);
    ctx.moveTo(-10, 13);
    ctx.quadraticCurveTo(-10, -9, 0, -9);
    ctx.quadraticCurveTo(10, -9, 10, 13);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-21, -7);
    ctx.lineTo(-15, -1);
    ctx.moveTo(21, -7);
    ctx.lineTo(15, -1);
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -15);
    ctx.stroke();
  } else if (layer === "duty") {
    ctx.beginPath();
    ctx.arc(0, 0, 17, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-19, -1, 7, 15);
    ctx.rect(12, -1, 7, 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(19, 11);
    ctx.quadraticCurveTo(13, 20, 2, 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, 18, 2.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 10);
    ctx.stroke();
  }

  ctx.restore();
}

function makeRouteLabelTexture(label: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");

  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  roundRect(ctx, 28, 18, 200, 42, 8);
  ctx.fillStyle = hexToRgba(color, 0.46);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f0fff7";
  ctx.font = "700 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, 128, 47);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function routePointToVector(point: { x: number; y: number }, z = 0.16) {
  return new THREE.Vector3(point.x * MAP_SCALE_X, point.y * MAP_SCALE_Y, z);
}

function makePolylineCurve(points: THREE.Vector3[]) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let index = 1; index < points.length; index += 1) {
    path.add(new THREE.LineCurve3(points[index - 1], points[index]));
  }
  return path;
}

function getRouteLabelPosition(route: EscapeRoute, points: THREE.Vector3[]) {
  const endPoint = points[points.length - 1];
  if (route.exitName.includes("东")) {
    const anchor = points[Math.floor(points.length / 2)] ?? endPoint;
    return new THREE.Vector3(anchor.x - 0.04, anchor.y + 0.24, 0.55);
  }
  if (route.exitName.includes("南")) {
    return new THREE.Vector3(endPoint.x + 0.18, endPoint.y + 0.24, 0.45);
  }
  return new THREE.Vector3(endPoint.x + 0.18, endPoint.y + 0.06, 0.45);
}

function clearObjectGroup(group: THREE.Group) {
  group.children.forEach((child) => {
    child.traverse((object) => {
      const mesh = object as THREE.Mesh | THREE.Sprite;
      if ("geometry" in mesh && mesh.geometry) {
        mesh.geometry.dispose();
      }
      const material = mesh.material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((entry) => {
        if ("map" in entry) {
          entry.map?.dispose();
        }
        entry.dispose();
      });
    });
  });
  group.clear();
}

function addEscapeRouteToGroup(route: EscapeRoute, group: THREE.Group) {
  const points = route.points.map((point) => routePointToVector(point, 0.18));
  if (points.length < 2) return;

  const routePath = makePolylineCurve(points);
  const tubeSegments = Math.max(48, (points.length - 1) * 28);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: route.color,
    transparent: true,
    opacity: 0.24,
    depthTest: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: route.color,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const glow = new THREE.Mesh(new THREE.TubeGeometry(routePath, tubeSegments, 0.065, 8, false), glowMaterial);
  const core = new THREE.Mesh(new THREE.TubeGeometry(routePath, tubeSegments, 0.026, 8, false), coreMaterial);
  glow.renderOrder = 7;
  core.renderOrder = 8;
  group.add(glow, core);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.18);
  arrowShape.lineTo(-0.11, -0.13);
  arrowShape.lineTo(0.11, -0.13);
  arrowShape.closePath();

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const direction = new THREE.Vector3().subVectors(end, start);
    if (direction.length() < 0.2) continue;
    const angle = Math.atan2(direction.y, direction.x);
    const arrow = new THREE.Mesh(
      new THREE.ShapeGeometry(arrowShape),
      new THREE.MeshBasicMaterial({
        color: route.color,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    arrow.position.copy(start.clone().lerp(end, 0.68));
    arrow.position.z = 0.34;
    arrow.rotation.z = angle - Math.PI / 2;
    arrow.renderOrder = 9;
    group.add(arrow);
  }

  const labelPosition = getRouteLabelPosition(route, points);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeRouteLabelTexture(route.exitName, route.color),
      transparent: true,
      depthTest: false,
    }),
  );
  label.position.copy(labelPosition);
  label.scale.set(1.2, 0.45, 1);
  label.renderOrder = 10;
  group.add(label);
}

export function MapStage({
  points,
  routes,
  activeLayers,
  selectedPointId,
  onSelectPoint,
  initialZoom = 1,
  initialPosition = { x: 0, y: -0.14 },
  initialRotation = -0.035,
  simulationZones = [],
  simulationSource,
  calibration,
  onSelectZone,
  onSelectMapCoordinate,
}: MapStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const mapGroupRef = useRef<THREE.Group | null>(null);
  const markersRef = useRef<THREE.Group | null>(null);
  const routeGroupRef = useRef<THREE.Group | null>(null);
  const simulationGroupRef = useRef<THREE.Group | null>(null);
  const mapMeshRef = useRef<THREE.Mesh | null>(null);
  const pointByObjectId = useRef(new Map<string, MapPoint>());
  const zoneByObjectId = useRef(new Map<string, ConsequenceZone>());
  const animationRef = useRef<number | null>(null);
  const dragState = useRef({
    active: false,
    mode: "pan" as "pan" | "rotate",
    x: 0,
    y: 0,
    moved: 0,
  });
  const onSelectRef = useRef(onSelectPoint);
  const onSelectZoneRef = useRef(onSelectZone);
  const onSelectMapRef = useRef(onSelectMapCoordinate);

  const visiblePoints = useMemo(
    () => points.filter((point) => point.layer !== "escapeRoute" && activeLayers[point.layer]),
    [activeLayers, points],
  );

  useEffect(() => {
    onSelectRef.current = onSelectPoint;
  }, [onSelectPoint]);

  useEffect(() => { onSelectZoneRef.current = onSelectZone; }, [onSelectZone]);
  useEffect(() => { onSelectMapRef.current = onSelectMapCoordinate; }, [onSelectMapCoordinate]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020d17);
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-6.2, 6.2, 3.7, -3.7, 0.1, 100);
    camera.position.set(initialPosition.x, initialPosition.y, 8);
    camera.zoom = initialZoom;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const mapGroup = new THREE.Group();
    mapGroup.rotation.z = initialRotation;
    mapGroupRef.current = mapGroup;
    scene.add(mapGroup);

    const texture = new THREE.TextureLoader().load("/assets/plant-map.png");
    texture.colorSpace = THREE.SRGBColorSpace;
    const mapMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 7.1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: false }),
    );
    mapMesh.position.set(0, 0, 0);
    mapMeshRef.current = mapMesh;
    mapGroup.add(mapMesh);

    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 7.1),
      new THREE.MeshBasicMaterial({ color: 0x001e2f, transparent: true, opacity: 0.16 }),
    );
    veil.position.z = 0.015;
    mapGroup.add(veil);

    const grid = new THREE.GridHelper(11.4, 24, 0x0ee5ff, 0x0a4f70);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.025;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.22;
    mapGroup.add(grid);

    const markers = new THREE.Group();
    markers.position.z = 0.12;
    markersRef.current = markers;

    const simulationGroup = new THREE.Group();
    simulationGroup.position.z = 0.04;
    simulationGroupRef.current = simulationGroup;
    mapGroup.add(simulationGroup);

    const routeGroup = new THREE.Group();
    routeGroup.position.z = 0.08;
    routeGroupRef.current = routeGroup;
    mapGroup.add(routeGroup);

    mapGroup.add(markers);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function render() {
      renderer.render(scene, camera);
    }

    function animate() {
      const now = performance.now() / 1000;
      markers.children.forEach((child, index) => {
        const sprite = child as THREE.Sprite;
        const pulse = 1 + Math.sin(now * 2.6 + index) * 0.035;
        const base = sprite.userData.baseScale ?? 1;
        sprite.scale.set(base * pulse, base * 0.5 * pulse, 1);
      });
      render();
      animationRef.current = requestAnimationFrame(animate);
    }

    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const aspect = width / Math.max(height, 1);
      camera.left = -4.15 * aspect;
      camera.right = 4.15 * aspect;
      camera.top = 4.15;
      camera.bottom = -4.15;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      render();
    }

    function setPointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function handlePointerDown(event: PointerEvent) {
      event.preventDefault();
      renderer.domElement.setPointerCapture(event.pointerId);
      dragState.current = {
        active: true,
        mode: event.button === 2 || event.shiftKey ? "rotate" : "pan",
        x: event.clientX,
        y: event.clientY,
        moved: 0,
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const state = dragState.current;
      if (!state.active) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      state.x = event.clientX;
      state.y = event.clientY;
      state.moved += Math.abs(dx) + Math.abs(dy);

      if (state.mode === "rotate") {
        mapGroup.rotation.z += dx * 0.004;
      } else {
        const zoom = camera.zoom || 1;
        camera.position.x -= dx * 0.012 / zoom;
        camera.position.y += dy * 0.012 / zoom;
      }
      camera.position.x = clamp(camera.position.x, -1.8, 1.8);
      camera.position.y = clamp(camera.position.y, -1.2, 1.2);
      camera.updateProjectionMatrix();
    }

    function handlePointerUp(event: PointerEvent) {
      const state = dragState.current;
      dragState.current.active = false;
      renderer.domElement.releasePointerCapture(event.pointerId);

      if (state.moved > 8) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(markers.children, false);
      const hit = intersections[0]?.object;
      if (hit) {
        const point = pointByObjectId.current.get(hit.uuid);
        if (point) onSelectRef.current(point);
        return;
      }
      const zoneHit = raycaster.intersectObjects(simulationGroup.children, false)[0]?.object;
      if (zoneHit) {
        const zone = zoneByObjectId.current.get(zoneHit.uuid);
        if (zone) onSelectZoneRef.current?.(zone);
        return;
      }
      const mapHit = mapMeshRef.current ? raycaster.intersectObject(mapMeshRef.current, false)[0] : undefined;
      if (mapHit) {
        const local = mapGroup.worldToLocal(mapHit.point.clone());
        onSelectMapRef.current?.({ x: local.x / MAP_SCALE_X, y: local.y / MAP_SCALE_Y });
      }
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      camera.zoom = clamp(camera.zoom + (event.deltaY < 0 ? 0.12 : -0.12), 0.78, 2.2);
      camera.updateProjectionMatrix();
    }

    function blockContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("resize", resize);

    resize();
    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.domElement.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("resize", resize);
      if (routeGroupRef.current) clearObjectGroup(routeGroupRef.current);
      if (simulationGroupRef.current) clearObjectGroup(simulationGroupRef.current);
      renderer.dispose();
      texture.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;

    markers.children.forEach((child) => {
      const sprite = child as THREE.Sprite;
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    });
    markers.clear();
    pointByObjectId.current.clear();

    visiblePoints.forEach((point) => {
      const texture = makeMarkerTexture(point, point.id === selectedPointId);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      const selected = point.id === selectedPointId;
      const scale = selected ? 1.95 : 1.62;
      sprite.userData.baseScale = scale;
      sprite.scale.set(scale, scale * 0.5, 1);
      sprite.position.set(point.x * MAP_SCALE_X, point.y * MAP_SCALE_Y, 0.18 + (point.z ?? 0));
      sprite.renderOrder = selected ? 20 : 10;
      markers.add(sprite);
      pointByObjectId.current.set(sprite.uuid, point);
    });
  }, [selectedPointId, visiblePoints]);

  useEffect(() => {
    const routeGroup = routeGroupRef.current;
    if (!routeGroup) return;
    clearObjectGroup(routeGroup);
    if (!activeLayers.escapeRoute) return;
    routes.forEach((route) => addEscapeRouteToGroup(route, routeGroup));
  }, [activeLayers.escapeRoute, routes]);

  useEffect(() => {
    const group = simulationGroupRef.current;
    if (!group) return;
    clearObjectGroup(group);
    zoneByObjectId.current.clear();
    if (!calibration?.validForSimulation) return;
    [...simulationZones].reverse().forEach((zone, index) => {
      const projected = zone.coordinates.map((point) => physicalToMap(calibration.physicalToMapMatrix, point));
      if (projected.length < 3) return;
      const shape = new THREE.Shape();
      shape.moveTo(projected[0].x * MAP_SCALE_X, projected[0].y * MAP_SCALE_Y);
      projected.slice(1).forEach((point) => shape.lineTo(point.x * MAP_SCALE_X, point.y * MAP_SCALE_Y));
      shape.closePath();
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: 0.27, side: THREE.DoubleSide, depthTest: false }),
      );
      mesh.position.z = index * 0.004;
      mesh.renderOrder = 5;
      group.add(mesh);
      zoneByObjectId.current.set(mesh.uuid, zone);
    });
    if (simulationSource) {
      const position = physicalToMap(calibration.physicalToMapMatrix, simulationSource);
      const markerShape = new THREE.Shape();
      markerShape.moveTo(-0.1, 0.16);
      markerShape.lineTo(0.1, 0.16);
      markerShape.lineTo(0, 0);
      markerShape.closePath();
      const marker = new THREE.Mesh(
        new THREE.ShapeGeometry(markerShape),
        new THREE.MeshBasicMaterial({ color: 0xff2f20, side: THREE.DoubleSide, depthTest: false }),
      );
      marker.position.set(position.x * MAP_SCALE_X, position.y * MAP_SCALE_Y, 0.42);
      marker.renderOrder = 30;
      group.add(marker);
    }
  }, [calibration, simulationSource, simulationZones]);

  const resetView = () => {
    const camera = cameraRef.current;
    const group = mapGroupRef.current;
    if (!camera || !group) return;
    camera.position.set(initialPosition.x, initialPosition.y, 8);
    camera.zoom = initialZoom;
    camera.updateProjectionMatrix();
    group.rotation.z = initialRotation;
  };

  const zoom = (direction: 1 | -1) => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.zoom = clamp(camera.zoom + direction * 0.14, 0.78, 2.2);
    camera.updateProjectionMatrix();
  };

  const rotateView = (direction: 1 | -1) => {
    const group = mapGroupRef.current;
    if (!group) return;
    group.rotation.z += direction * 0.18;
  };

  return (
    <div className="map-shell">
      <div className="map-canvas" ref={containerRef} />
      <div className="map-compass">
        <div className="map-compass__needle" />
        <span>N</span>
      </div>
      <div className="map-controls" aria-label="地图控制">
        <button type="button" onClick={() => zoom(1)} title="放大">
          <ZoomIn size={17} />
        </button>
        <button type="button" onClick={() => zoom(-1)} title="缩小">
          <ZoomOut size={17} />
        </button>
        <button type="button" onClick={() => rotateView(-1)} title="逆时针旋转">
          <RotateCcw size={17} />
        </button>
        <button type="button" onClick={() => rotateView(1)} title="顺时针旋转">
          <RotateCw size={17} />
        </button>
        <button type="button" onClick={resetView} title="复位视角">
          <RefreshCcw size={17} />
        </button>
      </div>
      <div className="map-tip">拖拽平移 · 滚轮缩放 · 右键拖拽/按钮旋转</div>
    </div>
  );
}
