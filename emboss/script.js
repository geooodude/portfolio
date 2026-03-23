import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import GUI from 'lil-gui';

// --- Configuration ---
const CONFIG = {
    // IMAGE URL (Set your default image here)
    imageUrl: 'https://ik.imagekit.io/sqiqig7tz/sample.png', 

    // Mesh structure
    baseSize: 10,
    density: 180,        // Segments count
    
    // Depth & Easing
    depthScale: 0.635,    
    smoothness: 5,       // Iterations of smoothing (0 = sharp, 10 = very smooth)
    invertDepth: false,
    wireframe: false,

    // Lines (Fat Lines)
    lineCount: 0,       
    lineWidth: 3,        
    lineColor: '#00ffcc', // Cyan
    lineOpacity: 0.5,    
    lineLift: 0.2,       
    globalSpeed: 1.0,    

    // Animation
    autoRotateSpeed: 1.3,
    autoRotateAngle: 10, // Degrees
};

// --- State Variables ---
let mesh, geometry, material;

// Data buffers
let rawBrightnessData = new Float32Array(0);     // Original pixel data
let smoothBrightnessData = new Float32Array(0);  // Processed data for display

// Lines storage
let linesArray = []; 

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.dithering = true; 
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const group = new THREE.Group();
scene.add(group);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 5, 10);
scene.add(dirLight);

// --- Core Logic: Geometry & Processing ---

/**
 * 1. Rebuilds geometry based on aspect ratio
 */
function updateGeometry(aspect) {
    if (mesh) {
        group.remove(mesh);
        mesh.geometry.dispose();
    }

    // Calculate dimensions
    let width, height, segX, segY;
    if (aspect >= 1) {
        width = CONFIG.baseSize;
        height = CONFIG.baseSize / aspect;
        segX = CONFIG.density;
        segY = Math.floor(CONFIG.density / aspect);
    } else {
        width = CONFIG.baseSize * aspect;
        height = CONFIG.baseSize;
        segX = Math.floor(CONFIG.density * aspect);
        segY = CONFIG.density;
    }

    geometry = new THREE.PlaneGeometry(width, height, segX, segY);
    
    // Initialize buffers
    const count = geometry.attributes.position.count;
    rawBrightnessData = new Float32Array(count);
    smoothBrightnessData = new Float32Array(count);

    if (!material) {
        material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            side: THREE.DoubleSide,
            roughness: 0.6,
            wireframe: CONFIG.wireframe,
            dithering: true 
        });
    }

    mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    
    // Lines depend on geometry width
    initLines();
}

/**
 * 2. Reads image pixels -> rawBrightnessData
 */
function processImage(image) {
    const aspect = image.width / image.height;
    updateGeometry(aspect);

    // Update Texture
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;

    // Extract Pixel Data
    const segX = geometry.parameters.widthSegments;
    const segY = geometry.parameters.heightSegments;
    const cols = segX + 1;
    const rows = segY + 1;

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, cols, rows);
    const imgData = ctx.getImageData(0, 0, cols, rows);
    const pixels = imgData.data;

    // Fill Raw Data
    for (let i = 0; i < rawBrightnessData.length; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        // Luma formula
        rawBrightnessData[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    // Apply smoothing and depth
    calculateSmoothing();
    
}

/**
 * 3. Easing Algorithm (Box Blur)
 * Averages pixels to reduce noise and jagged edges
 */
function calculateSmoothing() {
    // If smoothness is 0, just copy raw to smooth
    if (CONFIG.smoothness <= 0) {
        smoothBrightnessData.set(rawBrightnessData);
        applyDepth();
        return;
    }

    const segX = geometry.parameters.widthSegments;
    const segY = geometry.parameters.heightSegments;
    const cols = segX + 1;
    const rows = segY + 1;
    const count = rawBrightnessData.length;

    // Start with a copy of raw data
    let currentBuffer = new Float32Array(rawBrightnessData);
    let nextBuffer = new Float32Array(count);

    // Perform iterations
    for (let iter = 0; iter < CONFIG.smoothness; iter++) {
        for (let i = 0; i < count; i++) {
            // Simple average of center + neighbors (up, down, left, right)
            let sum = currentBuffer[i];
            let neighbors = 1;

            // Neighbors indices checks
            const col = i % cols;
            const row = Math.floor(i / cols);

            // Left
            if (col > 0) { sum += currentBuffer[i - 1]; neighbors++; }
            // Right
            if (col < cols - 1) { sum += currentBuffer[i + 1]; neighbors++; }
            // Up
            if (row > 0) { sum += currentBuffer[i - cols]; neighbors++; }
            // Down
            if (row < rows - 1) { sum += currentBuffer[i + cols]; neighbors++; }

            nextBuffer[i] = sum / neighbors;
        }
        // Swap buffers for next iteration
        currentBuffer.set(nextBuffer);
    }

    smoothBrightnessData.set(currentBuffer);
    applyDepth();
}

/**
 * 4. Updates Z-positions from smoothBrightnessData
 */
function applyDepth() {
    if (!mesh) return;
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
        let val = smoothBrightnessData[i];
        if (CONFIG.invertDepth) val = 1.0 - val;
        
        positions.setZ(i, val * CONFIG.depthScale);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

// --- Line Logic (Line2) ---

function initLines() {
    // Cleanup existing
    linesArray.forEach(l => {
        group.remove(l.line2);
        l.line2.geometry.dispose();
        l.line2.material.dispose();
    });
    linesArray = [];

    if (!mesh) return;
    const segX = geometry.parameters.widthSegments;

    // Create new batch
    for (let i = 0; i < CONFIG.lineCount; i++) {
        const lineGeom = new LineGeometry();
        const points = [];
        // Init placeholder points
        for(let j=0; j <= segX; j++) points.push(0,0,0);
        lineGeom.setPositions(points);

        const lineMat = new LineMaterial({
            color: CONFIG.lineColor,
            linewidth: CONFIG.lineWidth,
            opacity: CONFIG.lineOpacity,
            transparent: true,
            dashed: false
        });
        lineMat.resolution.set(window.innerWidth, window.innerHeight);

        const line2 = new Line2(lineGeom, lineMat);
        line2.computeLineDistances();
        group.add(line2);

        linesArray.push({
            line2: line2,
            pos: Math.random(),
            velocity: (Math.random() * 0.002 + 0.0005) * (Math.random() > 0.5 ? 1 : -1)
        });
    }
}

function updateLines() {
    if (!mesh || linesArray.length === 0) return;

    const segX = geometry.parameters.widthSegments;
    const segY = geometry.parameters.heightSegments;
    const cols = segX + 1;
    const rows = segY + 1;
    const positions = mesh.geometry.attributes.position;

    linesArray.forEach(obj => {
        obj.pos += obj.velocity * CONFIG.globalSpeed;

        // Bounce
        if (obj.pos >= 1 || obj.pos <= 0) {
            obj.velocity *= -1;
            obj.pos = Math.max(0, Math.min(1, obj.pos));
        }

        const rowIndex = Math.floor(obj.pos * (rows - 1));
        const linePositions = [];

        // Copy vertex coordinates
        for (let x = 0; x < cols; x++) {
            const meshIndex = rowIndex * cols + x;
            linePositions.push(
                positions.getX(meshIndex),
                positions.getY(meshIndex),
                positions.getZ(meshIndex) + CONFIG.lineLift
            );
        }
        obj.line2.geometry.setPositions(linePositions);
    });
}

// --- Animation Loop ---

function updateRotation(time) {
    const rad = THREE.MathUtils.degToRad(CONFIG.autoRotateAngle);
    group.rotation.y = Math.sin(time * CONFIG.autoRotateSpeed) * rad;
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    updateRotation(time);
    updateLines();
    controls.update();

    renderer.render(scene, camera);
}

// --- Inputs & GUI ---

const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => processImage(img);
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

function setupGUI() {
    const gui = new GUI({ container: document.getElementById('gui-container'), width: 320 });
    gui.title('Depth with Emboss');

    const fFile = gui.addFolder('Image');
    fFile.add({ load: () => fileInput.click() }, 'load').name('📂 Upload Image');

    const fDepth = gui.addFolder('Depth Settings');
    fDepth.add(CONFIG, 'depthScale', 0, 5).name('Depth Power').onChange(applyDepth);
    // New Easing Parameter
    fDepth.add(CONFIG, 'smoothness', 0, 20, 1).name('Smoothing (Easing)').onFinishChange(calculateSmoothing);
    fDepth.add(CONFIG, 'invertDepth').name('Inverse Depth').onChange(applyDepth);
    fDepth.add(CONFIG, 'wireframe').onChange(v => material.wireframe = v);

    const fLines = gui.addFolder('Lines (Fat)');
    fLines.add(CONFIG, 'lineCount', 0, 50, 1).name('Count').onFinishChange(initLines);
    fLines.add(CONFIG, 'lineWidth', 1, 20).name('Thickness (px)').onChange(v => {
        linesArray.forEach(l => l.line2.material.linewidth = v);
    });
    fLines.add(CONFIG, 'lineOpacity', 0, 1).name('Opacity').onChange(v => {
        linesArray.forEach(l => l.line2.material.opacity = v);
    });
    fLines.add(CONFIG, 'globalSpeed', 0, 5).name('Move Speed');
    fLines.add(CONFIG, 'lineLift', 0, 1).name('Z-Lift');
    fLines.addColor(CONFIG, 'lineColor').name('Color').onChange(v => {
        linesArray.forEach(l => l.line2.material.color.set(v));
    });

    const fAnim = gui.addFolder('Auto Animation');
    fAnim.add(CONFIG, 'autoRotateAngle', 0, 90).name('X-Angle (Deg)');
    fAnim.add(CONFIG, 'autoRotateSpeed', 0, 2).name('Sway Speed');

    fFile.open();
    fLines.open();
}

// Start with example image from CONFIG
const loader = new THREE.TextureLoader();
loader.crossOrigin = "Anonymous";

// Using the variable from CONFIG
loader.load(CONFIG.imageUrl, (tex) => processImage(tex.image));

setupGUI();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    linesArray.forEach(l => l.line2.material.resolution.set(window.innerWidth, window.innerHeight));
});