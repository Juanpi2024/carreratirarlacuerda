// 3D Scene Controller
let scene, camera, renderer, cssRenderer;
let ropeMesh, char1Params, char2Params;
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
        color: 0xe0e0e0, 
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0x222222 
    });
    ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
    scene.add(ropeMesh);
    
    // Ribbon in the center
    const ribbonGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 24);
    ribbonGeo.rotateY(Math.PI / 2);
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xaa0000 });
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    ropeMesh.add(ribbonMesh);

    // Team 1 Avatar (3D Geometric Crystal/Sphere)
    const geo1 = new THREE.IcosahedronGeometry(1.5, 1);
    const mat1 = new THREE.MeshStandardMaterial({ 
        color: 0x00bfff, 
        emissive: 0x0055ff, 
        emissiveIntensity: 0.4,
        wireframe: true 
    });
    const char1 = new THREE.Mesh(geo1, mat1);
    char1.position.set(-8, 0, 0);
    scene.add(char1);
    char1Params = { mesh: char1, basePos: -8 };

    // Team 2 Avatar 
    const geo2 = new THREE.IcosahedronGeometry(1.5, 1);
    const mat2 = new THREE.MeshStandardMaterial({ 
        color: 0xff00ff, 
        emissive: 0xaa00aa,
        emissiveIntensity: 0.4,
        wireframe: true 
    });
    const char2 = new THREE.Mesh(geo2, mat2);
    char2.position.set(8, 0, 0);
    scene.add(char2);
    char2Params = { mesh: char2, basePos: 8 };

    // Create particles for tension effect
    createParticles();

    tow3dEnabled = true;
    
    window.addEventListener('resize', onWindowResize);
    animate3D();
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
    // Add pulsing based on tension!
    char1Params.mesh.material.emissiveIntensity = 0.4 + tension;
    char2Params.mesh.material.emissiveIntensity = 0.4 + tension;
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
    ropeMesh.position.y = Math.sin(time * 2) * 0.2;
    char1Params.mesh.position.y = ropeMesh.position.y;
    char2Params.mesh.position.y = ropeMesh.position.y;

    // Gentle rotation of avatars
    char1Params.mesh.rotation.x += 0.01;
    char1Params.mesh.rotation.y += 0.015;
    char2Params.mesh.rotation.x -= 0.01;
    char2Params.mesh.rotation.y += 0.015;

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
