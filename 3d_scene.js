// 3D Scene Controller
let scene, camera, renderer, cssRenderer;
let ropeMesh, ribbonMesh, char1Params, char2Params;
let particles = [];
let tow3dEnabled = false;

function init3DScene() {
    if (tow3dEnabled) return;
    const container = document.createElement('div');
    container.id = 'three-canvas-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '0'; // Behind calculators
    
    const parent = document.querySelector('.tow-animation-center');
    if (!parent) return;
    // hide 2d ground
    const ground2d = document.querySelector('.tow-ground-stage');
    if (ground2d) ground2d.style.opacity = '0';
    
    parent.appendChild(container);

    // Three.js Setup
    scene = new THREE.Scene();
    // Dark nebula color or transparent to show HTML background
    // We will use transparent so the epic CSS background is still visible!
    
    camera = new THREE.PerspectiveCamera(45, parent.clientWidth / parent.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 25);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(parent.clientWidth, parent.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // CSS3D Renderer for calculators (Optionally map html to 3D later)
    /* 
    cssRenderer = new THREE.CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = 0;
    document.body.appendChild(cssRenderer.domElement);
    */

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // 3D Rope (Cylinder)
    const ropeGeo = new THREE.CylinderGeometry(0.15, 0.15, 20, 16);
    ropeGeo.rotateZ(Math.PI / 2);
    // Use an epic glowing material for the rope
    const ropeMat = new THREE.MeshStandardMaterial({
        color: 0xd7a45a,
        roughness: 0.9,
        metalness: 0.05,
        emissive: 0x3a2108
    });
    ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
    scene.add(ropeMesh);
    
    // Ribbon in the center
    const ribbonGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 24);
    ribbonGeo.rotateY(Math.PI / 2);
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xaa0000 });
    ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    ropeMesh.add(ribbonMesh);

    const char1 = createChildAvatar({
        shirt: 0x12b7ff,
        shorts: 0x174ea6,
        shoes: 0xffffff,
        hair: 0x3b2416,
        skin: 0xf2bf8f,
        direction: 1
    });
    char1.position.set(-8, 0, 0);
    scene.add(char1);
    char1Params = { mesh: char1, basePos: -8, team: 1 };

    const char2 = createChildAvatar({
        shirt: 0xff4db8,
        shorts: 0x7c1f74,
        shoes: 0xffffff,
        hair: 0x171717,
        skin: 0xd79a68,
        direction: -1
    });
    char2.position.set(8, 0, 0);
    scene.add(char2);
    char2Params = { mesh: char2, basePos: 8, team: 2 };

    // Create particles for tension effect
    createParticles();

    tow3dEnabled = true;
    
    window.addEventListener('resize', onWindowResize);
    animate3D();
}

function makeMat(color, emissive = 0x000000, emissiveIntensity = 0.05) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
        roughness: 0.72,
        metalness: 0.02
    });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
}

function createChildAvatar({ shirt, shorts, shoes, hair, skin, direction }) {
    const child = new THREE.Group();
    child.scale.set(1.05, 1.05, 1.05);
    child.rotation.z = direction === 1 ? -0.18 : 0.18;

    const skinMat = makeMat(skin, 0x2b1205, 0.04);
    const shirtMat = makeMat(shirt, shirt, 0.18);
    const shortsMat = makeMat(shorts, shorts, 0.08);
    const hairMat = makeMat(hair);
    const shoeMat = makeMat(shoes);
    const darkMat = makeMat(0x111827);

    addMesh(child, new THREE.SphereGeometry(0.62, 32, 24), skinMat, [0, 1.9, 0]);
    addMesh(child, new THREE.SphereGeometry(0.66, 32, 16), hairMat, [0, 2.18, -0.05], [0.05, 0, 0], [1, 0.55, 1]);
    addMesh(child, new THREE.SphereGeometry(0.08, 12, 8), darkMat, [-0.18 * direction, 1.95, 0.58]);
    addMesh(child, new THREE.SphereGeometry(0.08, 12, 8), darkMat, [0.18 * direction, 1.95, 0.58]);
    addMesh(child, new THREE.TorusGeometry(0.16, 0.018, 8, 16), darkMat, [0, 1.76, 0.6], [Math.PI / 2, 0, 0]);

    addMesh(child, new THREE.CylinderGeometry(0.5, 0.62, 1.1, 24), shirtMat, [0, 0.72, 0], [0, 0, 0]);
    addMesh(child, new THREE.BoxGeometry(0.95, 0.42, 0.62), shortsMat, [0, -0.05, 0]);

    const armRotZ = direction === 1 ? -0.95 : 0.95;
    addMesh(child, new THREE.CylinderGeometry(0.12, 0.12, 1.35, 16), skinMat, [0.55 * direction, 0.95, 0.2], [0.12, 0, armRotZ]);
    addMesh(child, new THREE.CylinderGeometry(0.12, 0.12, 1.25, 16), skinMat, [0.72 * direction, 0.55, 0.1], [0.18, 0, armRotZ]);
    addMesh(child, new THREE.SphereGeometry(0.19, 16, 12), skinMat, [1.15 * direction, 0.18, 0.08]);
    addMesh(child, new THREE.SphereGeometry(0.16, 16, 12), skinMat, [1.0 * direction, -0.06, 0.08]);

    addMesh(child, new THREE.CylinderGeometry(0.15, 0.15, 0.95, 16), skinMat, [-0.24, -0.72, 0], [0.22, 0, -0.15]);
    addMesh(child, new THREE.CylinderGeometry(0.15, 0.15, 0.95, 16), skinMat, [0.28, -0.72, 0], [0.22, 0, 0.24]);
    addMesh(child, new THREE.BoxGeometry(0.52, 0.18, 0.32), shoeMat, [-0.34, -1.23, 0.15], [0, 0, -0.1]);
    addMesh(child, new THREE.BoxGeometry(0.52, 0.18, 0.32), shoeMat, [0.44, -1.2, 0.15], [0, 0, 0.12]);

    const labelGeo = new THREE.TorusGeometry(0.44, 0.035, 8, 24);
    const label = new THREE.Mesh(labelGeo, makeMat(shirt, shirt, 0.4));
    label.position.set(0, 0.95, 0.36);
    label.rotation.set(Math.PI / 2, 0, 0);
    child.add(label);

    return child;
}

function createParticles() {
    const geo = new THREE.BufferGeometry();
    const count = 150;
    const positions = new Float32Array(count * 3);
    for(let i=0; i<count*3; i++) {
        positions[i] = (Math.random() - 0.5) * 30;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffdd44,
        size: 0.15,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    const pSys = new THREE.Points(geo, mat);
    scene.add(pSys);
    particles.push(pSys);
}

function onWindowResize() {
    const parent = document.querySelector('.tow-animation-center');
    if (!parent || !camera || !renderer) return;
    camera.aspect = parent.clientWidth / parent.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(parent.clientWidth, parent.clientHeight);
}

// Map the 0-100 logic positional system to 3D coords
function update3DPositions(towPosPercent) {
    if (!tow3dEnabled || !ropeMesh) return;
    
    // towPosPercent is between -100 and +100
    // Maps to +/- 10 units in 3D space
    const targetX = (towPosPercent / 100) * 8;
    
    // Smoothly interpolate rope's position
    ropeMesh.position.x += (targetX - ropeMesh.position.x) * 0.1;

    // Characters grab the rope ends
    char1Params.mesh.position.x = ropeMesh.position.x + char1Params.basePos;
    char2Params.mesh.position.x = ropeMesh.position.x + char2Params.basePos;
    
    // Tension scale
    const tension = Math.abs(towPosPercent) / 100;
    char1Params.mesh.rotation.z = -0.18 - tension * 0.2;
    char2Params.mesh.rotation.z = 0.18 + tension * 0.2;
    ropeMesh.material.emissiveIntensity = 0.08 + tension * 0.35;
}

// A pulse effect when a team pulls
function trigger3DPull(teamNum) {
    if(!tow3dEnabled) return;
    const targetChar = teamNum === 1 ? char1Params.mesh : char2Params.mesh;
    // Scale up temporarily
    targetChar.scale.set(1.4, 1.4, 1.4);
    setTimeout(() => {
        targetChar.scale.set(1, 1, 1);
    }, 300);
}

function animate3D() {
    if (!tow3dEnabled) return;
    requestAnimationFrame(animate3D);

    const time = performance.now() * 0.001;

    // Gentle float
    ropeMesh.position.y = Math.sin(time * 2) * 0.08;
    char1Params.mesh.position.y = ropeMesh.position.y - 0.05;
    char2Params.mesh.position.y = ropeMesh.position.y - 0.05;
    char1Params.mesh.position.z = Math.sin(time * 5) * 0.04;
    char2Params.mesh.position.z = Math.cos(time * 5) * 0.04;

    // Particles subtle movement
    particles.forEach(p => {
        p.rotation.y = time * 0.1;
        p.rotation.z = time * 0.05;
    });

    if (window.towRopePos !== undefined) {
        update3DPositions(window.towRopePos);
    }

    renderer.render(scene, camera);
}
