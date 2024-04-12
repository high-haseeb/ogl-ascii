import {
    Renderer,
    Orbit,
    Program,
    Transform,
    Vec3,
    Polyline,
    Camera,
    Mesh,
    Vec2,
    Post,
    Texture,
    GLTFLoader
} from "https://cdn.skypack.dev/ogl";

const fragment = /* gjlsl */ `
                precision highp float;

                uniform sampler2D tMap;
                uniform float uCharactersCount;
                uniform sampler2D uCharacters;
                uniform vec2 uResolution;
                varying vec2 vUv;

                const vec2 SIZE = vec2(16.);

                vec3 greyscale(vec3 color, float strength) {
                    float g = dot(color, vec3(0.299, 0.587, 0.114));
                    return mix(color, vec3(g), strength);
                }

                vec3 greyscale(vec3 color) {
                    return greyscale(color, 1.0);
                }


                void main() {
                    vec2 cell = uResolution / 30.0;
                    vec2 grid = 1.0 / cell;
                    vec2 pixelizedUV = grid * (0.5 + floor(vUv / grid));
                    vec4 pixelized = texture2D(tMap, pixelizedUV);
                    float greyscaled = 1.0 - greyscale(pixelized.rgb).r;
                    // vec4 raw = texture2D(tMap, vUv);

                    float characterIndex = floor((uCharactersCount - 1.0) * greyscaled);
                    vec2 characterPosition = vec2(mod(characterIndex, SIZE.x), floor(characterIndex / SIZE.y));
                    vec2 offset = vec2(characterPosition.x, -characterPosition.y) / SIZE;
                    vec2 charUV = mod(vUv * (cell / SIZE), 1.0 / SIZE) - vec2(0., 1.0 / SIZE) + offset;
                    vec4 asciiCharacter = texture2D(uCharacters, charUV);

                    asciiCharacter.rgb = pixelized.rgb *  asciiCharacter.r;
                    asciiCharacter.a = pixelized.a; 
                    gl_FragColor = asciiCharacter;
                }
            `;

const vertex = `
            attribute vec3 position;
            attribute vec3 next;
            attribute vec3 prev;
            attribute vec2 uv;
            attribute float side;

            uniform vec2 uResolution;
            uniform float uDPR;
            uniform float uThickness;

            varying vec2 vUv;
            varying vec3 vPosition;

            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123) / 43758.5453123;
            }

            vec4 getPosition() {
                vec2 aspect = vec2(uResolution.x / uResolution.y, 1);
                vec2 nextScreen = next.xy * aspect;
                vec2 prevScreen = prev.xy * aspect;

                vec2 tangent = normalize(nextScreen - prevScreen);
                vec2 normal = vec2(-tangent.y, tangent.x);
                normal /= aspect;
                normal *= 1.0 - pow(abs(uv.y - 0.5) * 1.9, 2.0);

                float pixelWidth = 1.0 / (uResolution.y / uDPR);
                normal *= pixelWidth * uThickness;

                // When the points are on top of each other, shrink the line to avoid artifacts.
                float dist = length(nextScreen - prevScreen);
                normal *= smoothstep(0.0, 0.02, dist);

                vec4 current = vec4(position, 1);
                current.xy -= normal * side;
                return current;
            }

            void main() {
                vUv = uv;
                vec4 pos = getPosition();
                vPosition = pos.xyz;
                gl_Position = pos;
            }
        `;

{
    const renderer = new Renderer({ dpr: 2 });
    const gl = renderer.gl;
    document.body.appendChild(gl.canvas);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    const post = new Post(gl);
    const resolution = { value: new Vec2() };

    const lines = [];

    const camera = new Camera(gl, { near: 1, far: 1000 });
    camera.position.set(0, 0, -10);
    // camera.position.set(2,2, 2);
    const controls = new Orbit(camera);

    function resize() {
        renderer.setSize(window.innerWidth, window.innerHeight);
        post.resize();
        lines.forEach((line) => line.polyline.resize());
        camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
        resolution.value.set(gl.canvas.width, gl.canvas.height);
    }
    window.addEventListener("resize", resize, false);
    resize();

    const scene = new Transform();

    let gltf;

    // textures
    // const lutTexture = TextureLoader.load(gl, {
    //     src: "assets/lut.png",
    // });
    // const envDiffuseTexture = TextureLoader.load(gl, {
    //     src: "assets/sunset-diffuse-RGBM.png",
    // });
    // const envSpecularTexture = TextureLoader.load(gl, {
    //     src: "assets/sunset-specular-RGBM.png",
    // });


    function random(a, b) {
        const alpha = Math.random();
        return a * (1.0 - alpha) + b * alpha;
    }

    ["blue", "red", "green", "cyan", "cyan"].forEach((color, i) => {
       const line = {
            spring: random(0.02, 0.8),
            friction: random(0.7, 0.95),
            mouseVelocity: new Vec3(),
            mouseOffset: new Vec3(random(-1, 1) * 0.05),
        };
        const count = 40;
        const points = (line.points = []);
        for (let i = 0; i < count; i++) points.push(new Vec3());

        line.polyline = new Polyline(gl, {
            points,
            vertex,
            fragment: `
            precision highp float;
            varying vec2 vUv;
            uniform vec2 uResolution;
            varying vec3 vPosition;
            uniform sampler2D tMap;
            void main(){
                  // vec2 uv = vPosition.xy / uResolution;

                // Calculate distance from the center
                vec2 center = vec2(0.5);
                float distance = length(vUv - center);

                // Define gradient colors
                vec3 startColor = vec3(1.0, 1.0, 1.); // Red
                vec3 endColor = vec3(0.0, 0.0, 0.0);   // Blue

                // Calculate the interpolation factor based on distance
                float fadeFactor = mix(0.0, 1.0, distance); // Adjust these values for the desired fade range

                // Interpolate between start and end colors
                vec3 color = mix(startColor, endColor, fadeFactor);
                color *= vec3(0., 1.,1.);


                // Output final color
                gl_FragColor = vec4(color, 1.0);
            }`,
            uniforms: {
                // uColor: { value: new Color(color) },
                uThickness: { value: random(20, 100) },
                uResolution: { value: new Vec2(window.innerWidth, window.innerHeight) },
            },
        });

        line.polyline.mesh.setParent(scene);

        lines.push(line);
    });

    // ascii stuff
    const characters = [..."@MBHENR#KWXDFPQASUZbdehx*8Gm&04LOVYkpq5Tagns69owz$CIu23Jcfry%1v7l+it[] {}?j|()=~!-/<>\"^_';,:`.."];
    // characters.reverse();
    // const characters = " .:,'-^=*+?!|0#X%WM@"
    const fontSize = 54;
    const tex = createCharactersTexture(characters, fontSize);
    function createCharactersTexture(characters, fontSize) {
        const canvas = document.createElement("canvas");

        const SIZE = 1024;
        const MAX_PER_ROW = 16;
        const CELL = SIZE / MAX_PER_ROW;

        canvas.width = canvas.height = SIZE;

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Context not available");
        }

        context.clearRect(0, 0, SIZE, SIZE);
        context.font = `${fontSize}px arial`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#fff";

        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            const x = i % MAX_PER_ROW;
            const y = Math.floor(i / MAX_PER_ROW);

            context.fillText(char, x * CELL + CELL / 2, y * CELL + CELL / 2);
        }

        const canvasData = context.getImageData(0, 0, SIZE, SIZE);
        const texture = new Texture(gl, {
            image: canvasData.data,
            width: SIZE,
            height: SIZE,
            wrapS: gl.TEXTURE_WRAP_S,
            wrapT: gl.TEXTURE_WRAP_T,
            magFilter: gl.NEAREST,
            minFilter: gl.NEAREST,
        });

        return texture;
    }

    post.addPass({
        fragment,
        uniforms: {
            uResolution: resolution,
            uCharacters: { value: tex },
            uCharactersCount: { value: characters.length },
        },
    });

    const mouse = new Vec3();
    if ("ontouchstart" in window) {
        window.addEventListener("touchstart", updateMouse, false);
        window.addEventListener("touchmove", updateMouse, false);
    } else {
        window.addEventListener("mousemove", updateMouse, false);
    }

    function updateMouse(e) {
        if (e.changedTouches && e.changedTouches.length) {
            e.x = e.changedTouches[0].pageX;
            e.y = e.changedTouches[0].pageY;
        }
        if (e.x === undefined) {
            e.x = e.pageX;
            e.y = e.pageY;
        }

        // Get mouse value in -1 to 1 range, with y flipped
        mouse.set((e.x / gl.renderer.width) * 2 - 1, (e.y / gl.renderer.height) * -2 + 1, 0);
    }
    let mesh;
async function initScene() {
    // const geometry = new Box(gl);
    const gltf = await GLTFLoader.load(gl, './assci.glb');
    console.log(gltf.meshes[0].primitives[0].geometry)
    const geometry = gltf.meshes[0].primitives[0].geometry;
    console.log(gltf.meshes[0].primitives[0].rotation)
    
    const program = new Program(gl, {
      vertex: /* glsl */ `
                            attribute vec3 position;
                            attribute vec3 normal;
                            attribute vec2 uv;
                            uniform mat4 modelViewMatrix;
                            uniform mat4 projectionMatrix;

                            varying vec2 vUv;
                            varying vec3 vNormal;

                            void main() {
                                vUv = uv;
                                vNormal = normal;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
                            }
                        `,
      fragment: /* glsl */ `
                            precision highp float;

                            varying vec2 vUv;
                            varying vec3 vNormal;
                            void main() {
                                vec3 cyan = vec3(0., 1., 1.);
                                vec3 white = vec3(1., 1., 1.);
                                vec3 yellow = vec3(0.2, 0.2, 0.2);
                                vec3 black = vec3(0., 0., 0.4);
                                vec3 color = mix(white, yellow, smoothstep(0., 1., length(vUv)));
                                // color += mix(white, yellow, smoothstep(0., 1., 1. - vUv.y));
                                // color += mix(white, yellow, smoothstep(0., 1., vUv.y));
                                color += dot(vNormal, black);
                                color *= cyan; 
                                gl_FragColor = vec4(color, 1.0);
                            }
                        `,
    });
    mesh = new Mesh(gl, { geometry, program });
        // mesh.rotation.x = -Math.PI;
        // mesh.rotation.set( gltf.meshes[0].primitives[0].rotation)
        const DEG2RAD = 180 / Math.PI
        
    mesh.rotation.x = 93 * DEG2RAD
    mesh.rotation.x = -45  * DEG2RAD
        mesh.rotation.z = 137 * DEG2RAD  
        modelLoded = true;
    mesh.setParent(scene);
  }
    let modelLoded = false;
    initScene()

    requestAnimationFrame(update);

    const tmp = new Vec3();
    function update() {
        requestAnimationFrame(update);
        lines.forEach((line) => {
            // Update polyline input points
            for (let i = line.points.length - 1; i >= 0; i--) {
                if (!i) {
                    // For the first point, spring ease it to the mouse position
                    tmp.copy(mouse).add(line.mouseOffset).sub(line.points[i]).multiply(line.spring);
                    line.mouseVelocity.add(tmp).multiply(line.friction);
                    line.points[i].add(line.mouseVelocity );
                } else {
                    // The rest of the points ease to the point in front of them, making a line
                    line.points[i].lerp(line.points[i - 1], 0.9);
                }
            }
            line.polyline.updateGeometry();
        });

        // Replace Renderer.render with post.render. Use the same arguments.
        controls.update();
        if(modelLoded){ mesh.rotation.y += 0.01}
        post.render({ scene, camera, sort: false, frustumCull: false });
        // renderer.render({ scene, camera, sort: false, frustumCull: false });
    }
}
