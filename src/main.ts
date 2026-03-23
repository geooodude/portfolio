import * as THREE from 'three';
import {throttle} from 'lodash';

import { FRAGMENT_SHADER, EMBOSS_DISPLAY_VERTEX, EMBOSS_DISPLAY_FRAGMENT } from './shader'
import { mainProps } from './types';

/** Grid density for height sampling; higher = finer relief, more GPU cost. */
const EMBOSS_SEGMENTS = 256;
/** World-space Z displacement scale (plane is 2×2 in XY). */
const EMBOSS_DEPTH = 0.42;

export default class Main {
    props: mainProps;
    uniforms;

    aspect = window.innerWidth / window.innerHeight;
    zoom = 4.0;
    offset = new THREE.Vector2(-2.0*this.aspect, -2.0);

    fractalScene: THREE.Scene;
    fractalCamera: THREE.OrthographicCamera;
    displayScene: THREE.Scene;
    displayCamera: THREE.OrthographicCamera;
    fractalTarget: THREE.WebGLRenderTarget;
    renderer: THREE.WebGLRenderer;
    fractalMesh: THREE.Mesh;
    displayMesh: THREE.Mesh;
    displayUniforms: {
        fractalMap: { value: THREE.Texture };
        depthScale: { value: number };
        invertDepth: { value: number };
        lightDir: { value: THREE.Vector3 };
    };
    
    constructor(props: mainProps) {
        this.props = props;

        this.uniforms = {
            res: {type: 'vec2', value: new THREE.Vector2(window.innerWidth, window.innerHeight)},
            aspect: {type: 'float', value: this.aspect},
            zoom: {type:'float', value: this.zoom},
            offset: {type:'vec2', value: this.offset},
            color_scheme: {type: "int", value: props.color_scheme},
            a: {type:'float', value: props.params[0]},
            b: {type:'float', value: props.params[1]},
            c: {type:'float', value: props.params[2]},
            d: {type:'float', value: props.params[3]},
            e: {type:'float', value: props.params[4]},
            f: {type:'float', value: props.params[5]},
        };

        this.render = throttle(this.render.bind(this), 20);

        this.setupScene();

        this.scroll = this.scroll.bind(this);
        this.onResize = this.onResize.bind(this);
        this.subscribeEvents();
        window.addEventListener('resize', this.onResize);
        this.attachToDOM();
        this.render();
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        this.aspect = w / h;
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h);
        const buf = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(buf);
        this.uniforms.res.value.copy(buf);
        this.uniforms.aspect.value = this.aspect;
        this.fractalTarget.setSize(buf.x, buf.y);
        this.render();
    }

    setupScene() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.fractalScene = new THREE.Scene();
        this.fractalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        const dpr = window.devicePixelRatio || 1;
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h);
        const buf = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(buf);

        this.uniforms.res.value.copy(buf);

        this.fractalTarget = new THREE.WebGLRenderTarget(buf.x, buf.y, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
        });

        this.displayScene = new THREE.Scene();

        // Same orthographic framing as the fractal pass so the plane fills the viewport (no perspective trapezoid or side gutters).
        this.displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.displayCamera.position.set(0, 0, 1);
        this.displayCamera.lookAt(0, 0, 0);

        this.createFractalMesh();
        this.createDisplayMesh();
    }

    attachToDOM() {
        const element = document.getElementById("canvas");

        if (element) {
            element.appendChild(this.renderer.domElement);
        }
        else {
            console.log("uh oh");
        }
    }

    createFractalMesh() {
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            fragmentShader: FRAGMENT_SHADER,
        });

        this.fractalMesh = new THREE.Mesh(geometry, material);
        this.fractalScene.add(this.fractalMesh);
    }

    createDisplayMesh() {
        const geometry = new THREE.PlaneGeometry(2, 2, EMBOSS_SEGMENTS, EMBOSS_SEGMENTS);
        this.displayUniforms = {
            fractalMap: { value: this.fractalTarget.texture },
            depthScale: { value: EMBOSS_DEPTH },
            invertDepth: { value: 0 },
            lightDir: { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() },
        };
        const material = new THREE.ShaderMaterial({
            uniforms: this.displayUniforms,
            vertexShader: EMBOSS_DISPLAY_VERTEX,
            fragmentShader: EMBOSS_DISPLAY_FRAGMENT,
            lights: false,
            extensions: { derivatives: true },
        });
        this.displayMesh = new THREE.Mesh(geometry, material);
        this.displayScene.add(this.displayMesh);
    }

    /// ================ EVENTS ================

    scroll(event: WheelEvent){
        const zoom_0 = this.zoom;

        // accounting for the different in scrolling between Chrome and FireFox
        if (navigator.userAgent.indexOf("Firefox") !== -1) {
            this.zoom *= 1 + event.deltaY*0.003;
        }
        else {
            this.zoom *= 1 + event.deltaY*0.001;
        }
        
        const space = this.zoom - zoom_0;
        const mouseX = event.clientX / window.innerWidth;
        const mouseY = 1-event.clientY / window.innerHeight;
        this.offset = this.offset.add(new THREE.Vector2(-mouseX * space * this.aspect, -mouseY * space));
        
        this.uniforms.zoom.value = this.zoom;
        this.uniforms.offset.value = this.offset;

        this.render();
    }

    subscribeEvents() {
        document.addEventListener('wheel', this.scroll);
    }

    /// ======== UPDATING AND RENDERING ========

    update(params: number[]) {
        this.uniforms.a.value = params[0];
        this.uniforms.b.value = params[1];
        this.uniforms.c.value = params[2];
        this.uniforms.d.value = params[3];
        this.uniforms.e.value = params[4];
        this.uniforms.f.value = params[5];
    }

    updateColors(color_scheme: number) {
        this.uniforms.color_scheme.value = color_scheme;
    }

    render() {
        this.renderer.setRenderTarget(this.fractalTarget);
        this.renderer.render(this.fractalScene, this.fractalCamera);

        this.renderer.setRenderTarget(null);
        this.renderer.render(this.displayScene, this.displayCamera);
    }

    /** Optional: match reference “inverse depth”. */
    setEmbossInvert(invert: boolean) {
        this.displayUniforms.invertDepth.value = invert ? 1 : 0;
    }

    setEmbossDepth(scale: number) {
        this.displayUniforms.depthScale.value = scale;
    }
}