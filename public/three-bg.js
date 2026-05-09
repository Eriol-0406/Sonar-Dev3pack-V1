import * as THREE from 'three';

const container = document.getElementById('three-container');

// ── Scene setup ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040a, 0.06);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(0, 0.3, 5.5);

// ── Colors ───────────────────────────────────────────────────
const TEAL = new THREE.Color(0x00e5c8);
const TEAL_DIM = new THREE.Color(0x00a090);
const GLASS = new THREE.Color(0x9dd8d4);
const DARK_GLASS = new THREE.Color(0x1a4040);

// ── Lights ───────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x061818, 1.5));

const coreLight = new THREE.PointLight(TEAL, 3, 10);
coreLight.position.set(0, 0, 0);
scene.add(coreLight);

const rimLight = new THREE.DirectionalLight(0x80ffee, 1.2);
rimLight.position.set(-4, 3, 2);
scene.add(rimLight);

const backLight = new THREE.DirectionalLight(0x003333, 0.6);
backLight.position.set(3, -2, -3);
scene.add(backLight);

// ── Scene group for parallax ─────────────────────────────────
const sceneGroup = new THREE.Group();
scene.add(sceneGroup);

const globeGroup = new THREE.Group();
sceneGroup.add(globeGroup);

// ── Earth Sphere (dark body) ─────────────────────────────────
const GLOBE_RADIUS = 1.6;

const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 80, 80);
const earthMat = new THREE.MeshPhysicalMaterial({
    color: DARK_GLASS,
    metalness: 0.2,
    roughness: 0.6,
    transparent: true,
    opacity: 0.92,
    side: THREE.FrontSide,
    emissive: TEAL_DIM,
    emissiveIntensity: 0.05,
});
const earthMesh = new THREE.Mesh(earthGeo, earthMat);
globeGroup.add(earthMesh);

// ── Atmosphere glow shell ────────────────────────────────────
const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64);
const atmosMat = new THREE.ShaderMaterial({
    uniforms: {
        glowColor: { value: new THREE.Color(0x00e5c8) },
        viewVector: { value: camera.position },
    },
    vertexShader: `
        uniform vec3 viewVector;
        varying float vIntensity;
        void main() {
            vec3 vNormal = normalize(normalMatrix * normal);
            vec3 vNormel = normalize(normalMatrix * viewVector);
            vIntensity = pow(0.6 - dot(vNormal, vNormel), 3.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 glowColor;
        varying float vIntensity;
        void main() {
            vec3 glow = glowColor * vIntensity;
            gl_FragColor = vec4(glow, vIntensity * 0.35);
        }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
});
const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
globeGroup.add(atmosMesh);



// ── Country borders from GeoJSON ─────────────────────────────
const countryGroup = new THREE.Group();
globeGroup.add(countryGroup);

const borderMat = new THREE.LineBasicMaterial({
    color: TEAL,
    transparent: true,
    opacity: 0.55,
});

// Helper: lat/lng to 3D position on globe surface
function latLngToVec3(lat, lng, r = GLOBE_RADIUS * 1.003) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

// Draw a single ring of coordinates as a THREE.Line
function drawRing(coords, material, group) {
    const pts = [];
    for (const [lng, lat] of coords) {
        pts.push(latLngToVec3(lat, lng));
    }
    if (pts.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geo, material));
}

// Parse a GeoJSON geometry and draw all its rings
function drawGeometry(geometry, material, group) {
    if (geometry.type === 'Polygon') {
        for (const ring of geometry.coordinates) {
            drawRing(ring, material, group);
        }
    } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
            for (const ring of polygon) {
                drawRing(ring, material, group);
            }
        }
    }
}

// Load TopoJSON and render country borders
async function loadCountryBorders() {
    try {
        const { feature } = await import('topojson-client');
        const res = await fetch('/geojson/countries-110m.json');
        const topo = await res.json();

        // Convert TopoJSON → GeoJSON FeatureCollection
        const geojson = feature(topo, topo.objects.countries);

        for (const feat of geojson.features) {
            drawGeometry(feat.geometry, borderMat, countryGroup);
        }

        console.log(`[SONAR] Loaded ${geojson.features.length} country borders`);
    } catch (err) {
        console.warn('[SONAR] Could not load country borders:', err);
    }
}

loadCountryBorders();


// ── Orbiting slogan text rings (flat ribbons) ────────────────
const sloganGroup = new THREE.Group();
globeGroup.add(sloganGroup);

const SLOGAN = '  ◆  SONAR — BEHAVIORAL SECURITY LAYER  ◆  PROTECTING SOLANA WALLETS WORLDWIDE  ◆  INTERCEPT · ANALYZE · INTERVENE  ';

function createTextRibbon(text, fontSize, ringRadius, ribbonHeight, color, glowColor, opacity) {
    const canvas = document.createElement('canvas');

    // Measure text width
    const tmpCtx = canvas.getContext('2d');
    tmpCtx.font = `bold ${fontSize}px 'Chakra Petch', monospace`;
    const textWidth = tmpCtx.measureText(text).width;

    // Canvas should tile seamlessly — make it exactly the text width
    canvas.width = Math.ceil(textWidth) + 128;
    canvas.height = Math.ceil(fontSize * 1.6);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw text with glow
    ctx.font = `bold ${fontSize}px 'Chakra Petch', monospace`;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    // Draw multiple passes for strong glow
    ctx.fillText(text, 64, canvas.height / 2);
    ctx.fillText(text, 64, canvas.height / 2);
    ctx.shadowBlur = 8;
    ctx.fillText(text, 64, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);

    // CylinderGeometry: open-ended cylinder = flat ribbon ring
    // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded
    const cylGeo = new THREE.CylinderGeometry(
        ringRadius, ringRadius, ribbonHeight, 128, 1, true
    );
    const cylMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const cylMesh = new THREE.Mesh(cylGeo, cylMat);
    sloganGroup.add(cylMesh);

    return { texture, mesh: cylMesh };
}

// Inner slogan ring — bright teal, close to globe surface
const sloganRing = createTextRibbon(
    SLOGAN, 64,
    GLOBE_RADIUS * 1.12,   // radius
    0.14,                   // ribbon height
    '#00e5c8',              // text color
    '#00ffdd',              // glow color
    1.0                     // opacity
);

// Outer slogan ring — slightly dimmer, larger
const OUTER_TEXT = '  ▲  REAL-TIME THREAT DETECTION  ▲  ON-CHAIN GUARDIAN PROTOCOL  ▲  ZERO TRUST · FULL VIGILANCE  ';
const outerRing = createTextRibbon(
    OUTER_TEXT, 52,
    GLOBE_RADIUS * 1.35,   // radius
    0.12,                   // ribbon height
    '#9dd8d4',              // text color
    '#00e5c8',              // glow color
    0.9                     // opacity
);

// ── Equator accent ring ──────────────────────────────────────
const equatorGeo = new THREE.TorusGeometry(GLOBE_RADIUS * 1.005, 0.005, 16, 200);
const equatorMat = new THREE.MeshBasicMaterial({
    color: TEAL,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
});
const equatorRing = new THREE.Mesh(equatorGeo, equatorMat);
equatorRing.rotation.x = Math.PI / 2;
globeGroup.add(equatorRing);

// ── Glowing node dots on globe surface ───────────────────────
const nodeDotGroup = new THREE.Group();
globeGroup.add(nodeDotGroup);

const nodeLocations = [
    [40.7, -74.0],   // New York
    [51.5, -0.1],    // London
    [35.7, 139.7],   // Tokyo
    [1.3, 103.9],    // Singapore
    [-33.9, 18.4],   // Cape Town
    [-23.5, -46.6],  // São Paulo
    [55.8, 37.6],    // Moscow
    [25.2, 55.3],    // Dubai
    [-33.8, 151.2],  // Sydney
    [19.4, -99.1],   // Mexico City
    [37.6, 127.0],   // Seoul
    [28.6, 77.2],    // Delhi
    [48.9, 2.3],     // Paris
    [13.8, 100.5],   // Bangkok
    [39.9, 116.4],   // Beijing
    [22.3, 114.2],   // Hong Kong
    [-1.3, 36.8],    // Nairobi
    [59.9, 30.3],    // St Petersburg
    [34.1, -118.2],  // Los Angeles
    [41.9, 12.5],    // Rome
];

nodeLocations.forEach(([lat, lng]) => {
    const pos = latLngToVec3(lat, lng, GLOBE_RADIUS * 1.008);

    // Dot
    const dotGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity: 0.9,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(pos);
    nodeDotGroup.add(dot);

    // Glow halo around dot
    const glowGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(pos);
    nodeDotGroup.add(glow);
});

// (Star field removed)

// ── Nearby floating particles ────────────────────────────────
const dustCount = 200;
const dustPositions = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = GLOBE_RADIUS * 1.5 + Math.random() * 2.5;
    dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dustPositions[i * 3 + 2] = r * Math.cos(phi);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustMat = new THREE.PointsMaterial({
    color: TEAL,
    size: 0.015,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const dustField = new THREE.Points(dustGeo, dustMat);
globeGroup.add(dustField);


// ── Mouse interaction ────────────────────────────────────────
const mouse = new THREE.Vector2(-999, -999);
let targetX = 0;
let targetY = 0;

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// ── Resize ───────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation loop ───────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // ── Globe horizontal spin (Y-axis only) ──
    globeGroup.rotation.y = t * 0.12;

    // ── Slogan ribbons scroll text via texture offset ──
    sloganRing.texture.offset.x = t * 0.015;
    outerRing.texture.offset.x = -t * 0.012;

    // ── Country borders subtle pulse ──
    const pulse = 0.45 + 0.15 * Math.sin(t * 1.5);
    borderMat.opacity = pulse;

    // ── Node dots twinkle ──
    nodeDotGroup.children.forEach((child, i) => {
        if (i % 2 === 1) { // glow halos
            child.material.opacity = 0.15 + 0.15 * Math.sin(t * 2.5 + i * 0.7);
            child.scale.setScalar(1.0 + 0.3 * Math.sin(t * 2.0 + i * 0.5));
        }
    });



    // ── Atmosphere pulse ──
    atmosMat.uniforms.viewVector.value.copy(camera.position);

    // ── Equator ring pulse ──
    equatorMat.opacity = 0.4 + 0.2 * Math.sin(t * 1.2);

    // ── Dust slow orbit ──
    dustField.rotation.y = t * 0.03;
    dustField.rotation.x = Math.sin(t * 0.1) * 0.02;



    // ── Core light pulse ──
    const lightPulse = 0.8 + 0.2 * Math.sin(t * 2.0);
    coreLight.intensity = 3 * lightPulse;

    // ── Mouse parallax ──
    if (mouse.x !== -999) {
        targetX = mouse.x * 0.3;
        targetY = mouse.y * 0.2;
    }

    sceneGroup.rotation.y += 0.04 * (targetX - sceneGroup.rotation.y);
    sceneGroup.rotation.x += 0.04 * (targetY * 0.5 - sceneGroup.rotation.x);

    // ── Gentle hover float ──
    sceneGroup.position.y = Math.sin(t * 0.8) * 0.08;

    renderer.render(scene, camera);
}

animate();
