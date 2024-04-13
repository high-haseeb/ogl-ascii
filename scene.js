import { Renderer, Program, Transform, Vec3, Polyline, Camera, Mesh, Vec2, Post, Texture, GLTFLoader } from "https://cdn.skypack.dev/ogl";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

const DEG2RAD = 180 / Math.PI;

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
                    vec2 cell = uResolution / 24.0;
                    vec2 grid = 1.0 / cell;
                    vec2 pixelizedUV = 1.0/500.0 * (0.5 + floor(vUv / (1.0/500.0)));
                    vec4 pixelized = texture2D(tMap, pixelizedUV);
                    float greyscaled = 1.0 - greyscale(pixelized.rgb).r;
                    // vec4 raw = texture2D(tMap, pixelizedUV);

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
                // normal *= 1.0 - pow(abs(uv.y - 0.5) * 1.9, 2.0);
                normal *= 1.0 - pow(abs(uv.y - 0.5) * 1.9, 2.0);
                // normal *= cos(uv.y * 12.56) * 0.1 + 0.2;

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
    camera.position.set(0, 0, -12);
    camera.lookAt([0, 0, 0]);

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

    function random(a, b) {
        const alpha = Math.random();
        return a * (1.0 - alpha) + b * alpha;
    }
    const mouse = new Vec3();

    function initPolyLines() {
        [new Vec3(0, 1, 0)].forEach((color, i) => {
            const line = {
                // spring: random(0.02, 0.8),
                // friction: random(0.7, 0.95),
                // mouseVelocity: new Vec3(),
                // mouseOffset: new Vec3(random(-1, 1) * 0.05),
                spring: 0.1,
                friction: 0.8,
                mouseVelocity: new Vec3(),
                mouseOffset: new Vec3(0),
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
            uniform float uTime;
            uniform vec3 uMouse;
            void main(){

                // Calculate distance from the center
                vec2 center = vec2(0.5);
                float distanceToCenter = length(vUv - center);

                // Define gradient colors
                vec3 light = vec3(1.0, 1.0, 1.0); 
                vec3 dark = vec3(0.0, 0.0, 0.0); 

                // Calculate the interpolation factor based on distanceToCenter
                float fadeFactor = mix(0.0, 0.8, distanceToCenter); // Adjust these values for the desired fade range

                // Interpolate between start and end colors
                vec3 color = mix(light, dark, fadeFactor);
                color *= vec3(0.0, 0.8, ( 1.0 + sin(uTime) ) / 2.0 + 0.5);

                // Output final color
                gl_FragColor = vec4(color, 1.0);
            }`,
                uniforms: {
                    uTime : {value : time },
                    uMouse: { value: mouse },
                    uThickness: { value: 40 },
                    uResolution: { value: new Vec2(window.innerWidth, window.innerHeight) },
                },
            });

            line.polyline.mesh.setParent(scene);

            lines.push(line);
        });
    }

    // ascii stuff
    const characters = [..."@MBHENR#KWXDFPQASUZbdehx*8Gm&04LOVYkpq5Tagns69owz$CIu23Jcfry%1v7l+it[] {}?j|()=~!-/<>\"^_';,:`.."];
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

    function addEventHandlers() {
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

        if ("ontouchstart" in window) {
            window.addEventListener("touchstart", updateMouse, false);
            window.addEventListener("touchmove", updateMouse, false);
        } else {
            window.addEventListener("mousemove", updateMouse, false);
        }
    }

    // load the model geometry doesnot load any materials
    async function loadModel() {
        let model;
        const gltf = await GLTFLoader.load(gl, "./assci.glb");
        const geometry = gltf.meshes[0].primitives[0].geometry;

        const program = new Program(gl, {
            uniforms: { uColor: { value: new Vec3(0, 0.5, 0) } },
            vertex: /* glsl */ `
                            attribute vec3 position;
                            attribute vec3 normal;
                            attribute vec2 uv;
                            uniform mat4 modelViewMatrix;
                            uniform mat4 projectionMatrix;

                            varying vec2 vUv;
                            varying vec3 vNormal;
                            varying vec3 vPosition;

                            void main() {
                                vUv = uv;
                                vNormal = normal;
                                vPosition = position;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
                            }
                        `,
            fragment: /* glsl */ `
                            precision highp float;

                            varying vec2 vUv;
                            varying vec3 vNormal;
                            varying vec3 vPosition;
                            uniform vec3 uColor;

                            vec3 white = vec3(1.);
                            vec3 black = vec3(0.7);

                            vec3 greyscale(vec3 color) {
                                return vec3(dot(color, vec3(0.299, 0.587, 0.114)));
                            }


                            void main() {
                                vec3 normal = normalize(vNormal * vNormal) + 0.2;
                                vec3 grayscale = vec3(0, 2.0, 2.0) - greyscale(normal);
                                // vec3 color = mix(white, black, grayscale);
                                // color *= uColor;
                                gl_FragColor = vec4(grayscale * uColor, 1.0);
                            }
                        `,
        });

        model = new Mesh(gl, { geometry, program });
        model.setParent(scene);
        return model;
    }

    // wait fot the model to load before starting
    let model;
    loadModel().then((mesh) => {
        model = mesh;
        initPolyLines();
        addEventHandlers();
        update();
        console.log();
    });

    let time;
    function update(t) {
        requestAnimationFrame(update);

        updatePolyLines();
        roatateModel(model, mouse);
        time = t * 0.001;
        model.program.uniforms.uColor.value.z = (Math.sin(time) + 1) / 2;

        post.render({ scene, camera, sort: false, frustumCull: false });
        // renderer.render({ scene, camera, sort: false, frustumCull: false });
    }

    // rotates the model depending of the mouse position
    // mouse coords are already normalized :)
    // rotates in 4 directions, clamped on x-axis
    function roatateModel(model, mouse) {
        const sensitivity = 0.005;
        model.rotation.y += (mouse.x >= 0 ? 1 : -1) * sensitivity;
        model.rotation.x += (mouse.y >= 0 ? 1 : -1) * sensitivity;
        const minX = -10;
        const maxX = 10;
        model.rotation.x = clamp(model.rotation.x, minX, maxX);
    }

    // updates the line point to follow mouse
    const tmp = new Vec3();
    function updatePolyLines() {
        lines.forEach((line) => {
            // Update polyline input points
            for (let i = line.points.length - 1; i >= 0; i--) {
                if (!i) {
                    // For the first point, spring ease it to the mouse position
                    tmp.copy(mouse).add(line.mouseOffset).sub(line.points[i]).multiply(line.spring);
                    line.mouseVelocity.add(tmp).multiply(line.friction);
                    line.points[i].add(line.mouseVelocity);
                } else {
                    // The rest of the points ease to the point in front of them, making a line
                    line.points[i].lerp(line.points[i - 1], 0.9);
                }
            }
            line.polyline.updateGeometry();
            line.polyline.program.uniforms.uTime.value = time;
        });
    }
}
