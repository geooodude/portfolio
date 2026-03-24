import * as THREE from 'three';
import {throttle} from 'lodash';

import {
    FRAGMENT_SHADER,
    EMBOSS_DISPLAY_VERTEX,
    EMBOSS_DISPLAY_FRAGMENT,
    SORT_PASS_VERTEX,
    SORT_PASS_FRAGMENT,
} from './shader';
import { createSortFlowTexture, readSortSeed } from './sortFlow';
import { mainProps } from './types';

/** Grid density for height sampling; higher = finer relief, more GPU cost. */
const EMBOSS_SEGMENTS = 256;
/** Base relief strength (fragment bump); higher = more Z separation. */
const EMBOSS_DEPTH = 0.95;
/** Fractal shader: drawing-buffer pixels per “macro pixel” block. */
const PIXEL_BLOCK = 5;
/** Odd–even sort passes per frame (ping-pong); higher = stronger streaks, more GPU cost. */
const SORT_ITERATIONS = 28;

const DEFAULT_ZOOM = 4.0;
/** Cannot zoom out past this (smaller = more zoomed out in shader space). */
const MIN_ZOOM = 0.45;
/** Optional cap so scroll can’t zoom in without bound. */
const MAX_ZOOM = 220;

function defaultOffsetForAspect(aspect: number): THREE.Vector2 {
    return new THREE.Vector2(-2.0 * aspect, -2.0);
}

export default class Main {
    props: mainProps;
    uniforms;

    aspect = window.innerWidth / window.innerHeight;
    zoom = DEFAULT_ZOOM;
    offset = defaultOffsetForAspect(this.aspect);

    fractalScene: THREE.Scene;
    fractalCamera: THREE.OrthographicCamera;
    displayScene: THREE.Scene;
    displayCamera: THREE.OrthographicCamera;
    fractalTarget: THREE.WebGLRenderTarget;
    sortTargetA: THREE.WebGLRenderTarget;
    sortTargetB: THREE.WebGLRenderTarget;
    sortScene: THREE.Scene;
    sortCamera: THREE.OrthographicCamera;
    sortMesh: THREE.Mesh;
    sortUniforms: {
        tInput: { value: THREE.Texture | null };
        tDirection: { value: THREE.DataTexture };
        uResolution: { value: THREE.Vector2 };
        uPhase: { value: number };
        uThreshold: { value: number };
    };
    renderer: THREE.WebGLRenderer;
    fractalMesh: THREE.Mesh;
    displayMesh: THREE.Mesh;
    displayUniforms: {
        fractalMap: { value: THREE.Texture };
        depthScale: { value: number };
        invertDepth: { value: number };
        lightDir: { value: THREE.Vector3 };
        uCameraPosition: { value: THREE.Vector3 };
        fractalTexel: { value: THREE.Vector2 };
        pixelUv: { value: THREE.Vector2 };
        audioPulse: { value: number };
        beat: { value: number };
        grayscaleFactor: { value: number };
    };
    audioPulse = 0;
    beat = 0;

    private panning = false;
    private lastPanX = 0;
    private lastPanY = 0;
    
    constructor(props: mainProps) {
        this.props = props;

        this.uniforms = {
            res: {type: 'vec2', value: new THREE.Vector2(window.innerWidth, window.innerHeight)},
            aspect: {type: 'float', value: this.aspect},
            zoom: {type:'float', value: this.zoom},
            offset: {type:'vec2', value: this.offset},
            pixelSize: { type: 'float', value: PIXEL_BLOCK },
            color_scheme: {type: "int", value: props.color_scheme},
            a: {type:'float', value: props.params[0]},
            b: {type:'float', value: props.params[1]},
            c: {type:'float', value: props.params[2]},
            d: {type:'float', value: props.params[3]},
            e: {type:'float', value: props.params[4]},
            f: {type:'float', value: props.params[5]},
        };

        this.render = throttle(this.render.bind(this), 1000 / 90);

        this.setupScene();

        this.scroll = this.scroll.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerCancel = this.onPointerCancel.bind(this);
        this.onDblClick = this.onDblClick.bind(this);
        this.subscribeEvents();
        window.addEventListener('resize', this.onResize);
        this.attachToDOM();
        this.render();
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        this.aspect = w / Math.max(1, h);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h);
        const buf = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(buf);
        this.uniforms.res.value.copy(buf);
        this.uniforms.aspect.value = this.aspect;
        this.fractalTarget.setSize(buf.x, buf.y);
        this.sortTargetA.setSize(buf.x, buf.y);
        this.sortTargetB.setSize(buf.x, buf.y);
        this.sortUniforms.uResolution.value.set(buf.x, buf.y);
        this.setFractalTexelUniform(buf.x, buf.y);
        this.syncPixelUniforms(buf.x, buf.y);
        this.render();
    }

    setFractalTexelUniform(w: number, h: number) {
        if (this.displayUniforms) {
            this.displayUniforms.fractalTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
        }
    }

    syncPixelUniforms(bufW: number, bufH: number) {
        if (!this.displayUniforms) return;
        const ps = PIXEL_BLOCK;
        this.displayUniforms.pixelUv.value.set(ps / Math.max(1, bufW), ps / Math.max(1, bufH));
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

        const rtOpts = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false,
        };
        this.fractalTarget = new THREE.WebGLRenderTarget(buf.x, buf.y, rtOpts);
        this.sortTargetA = new THREE.WebGLRenderTarget(buf.x, buf.y, rtOpts);
        this.sortTargetB = new THREE.WebGLRenderTarget(buf.x, buf.y, rtOpts);

        const sortSeed = readSortSeed();
        this.sortUniforms = {
            tInput: { value: null },
            tDirection: { value: createSortFlowTexture(sortSeed) },
            uResolution: { value: buf.clone() },
            uPhase: { value: 0 },
            uThreshold: { value: 0.22 },
        };
        this.sortScene = new THREE.Scene();
        this.sortCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sortMat = new THREE.ShaderMaterial({
            uniforms: this.sortUniforms,
            vertexShader: SORT_PASS_VERTEX,
            fragmentShader: SORT_PASS_FRAGMENT,
            depthTest: false,
            depthWrite: false,
        });
        this.sortMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sortMat);
        this.sortScene.add(this.sortMesh);

        this.displayScene = new THREE.Scene();

        // Same orthographic framing as the fractal pass so the plane fills the viewport (no perspective trapezoid or side gutters).
        this.displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.displayCamera.position.set(0, 0, 1);
        this.displayCamera.lookAt(0, 0, 0);

        this.createFractalMesh();
        this.createDisplayMesh(buf.x, buf.y);
        this.syncPixelUniforms(buf.x, buf.y);
    }

    attachToDOM() {
        const element = document.getElementById("canvas");

        if (element) {
            element.appendChild(this.renderer.domElement);
            const canvas = this.renderer.domElement;
            canvas.style.touchAction = 'none';
            canvas.addEventListener('pointerdown', this.onPointerDown);
            canvas.addEventListener('pointermove', this.onPointerMove);
            canvas.addEventListener('pointerup', this.onPointerUp);
            canvas.addEventListener('pointercancel', this.onPointerCancel);
            canvas.addEventListener('lostpointercapture', this.onPointerUp);
            canvas.addEventListener('dblclick', this.onDblClick);
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

    createDisplayMesh(fractalW: number, fractalH: number) {
        const geometry = new THREE.PlaneGeometry(2, 2, EMBOSS_SEGMENTS, EMBOSS_SEGMENTS);
        this.displayUniforms = {
            fractalMap: { value: this.fractalTarget.texture },
            depthScale: { value: EMBOSS_DEPTH },
            invertDepth: { value: 0 },
            lightDir: { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() },
            uCameraPosition: { value: this.displayCamera.position.clone() },
            fractalTexel: {
                value: new THREE.Vector2(1 / Math.max(1, fractalW), 1 / Math.max(1, fractalH)),
            },
            pixelUv: {
                value: new THREE.Vector2(
                    PIXEL_BLOCK / Math.max(1, fractalW),
                    PIXEL_BLOCK / Math.max(1, fractalH),
                ),
            },
            audioPulse: { value: 0 },
            beat: { value: 0 },
            grayscaleFactor: { value: 0 },
        };
        const material = new THREE.ShaderMaterial({
            uniforms: this.displayUniforms,
            vertexShader: EMBOSS_DISPLAY_VERTEX,
            fragmentShader: EMBOSS_DISPLAY_FRAGMENT,
            lights: false,
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

        this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom));

        const space = this.zoom - zoom_0;
        const w = window.innerWidth;
        const h = Math.max(1, window.innerHeight);
        const mouseX = event.clientX / w;
        const mouseY = 1 - event.clientY / h;
        this.offset.add(new THREE.Vector2(-mouseX * space * this.aspect, -mouseY * space));
        
        this.uniforms.zoom.value = this.zoom;
        this.uniforms.offset.value.copy(this.offset);

        this.render();
    }

    private onPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        this.panning = true;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.panning) return;
        const dx = e.clientX - this.lastPanX;
        const dy = e.clientY - this.lastPanY;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        const w = window.innerWidth;
        const h = Math.max(1, window.innerHeight);
        this.offset.x -= (dx / w) * this.zoom * this.aspect;
        this.offset.y += (dy / h) * this.zoom;
        this.uniforms.offset.value.copy(this.offset);
        e.preventDefault();
        this.render();
    }

    private onPointerUp(e: PointerEvent) {
        if (e.type === 'pointerup' && e.button !== 0) return;
        if (!this.panning) return;
        this.panning = false;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* already released */
        }
    }

    private onPointerCancel(e: PointerEvent) {
        this.panning = false;
    }

    /** Same framing as a fresh load for the current window aspect. */
    private onDblClick(e: MouseEvent) {
        e.preventDefault();
        this.zoom = DEFAULT_ZOOM;
        this.offset.copy(defaultOffsetForAspect(this.aspect));
        this.uniforms.zoom.value = this.zoom;
        this.uniforms.offset.value.copy(this.offset);
        this.render();
    }

    subscribeEvents() {
        document.addEventListener('wheel', this.scroll, { passive: true });
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

    /** Bass / energy 0–1, beat envelope 0–1 (kick emphasis). */
    updateAudioReactive(bass: number, beatEnv: number, energy: number) {
        this.audioPulse = Math.min(1, Math.max(0, energy * 1.15 + bass * 0.55));
        this.beat = Math.min(1, Math.max(0, beatEnv));
        const zoomPulse = 1 + bass * 0.018 + this.beat * 0.028;
        this.uniforms.zoom.value = this.zoom * zoomPulse;
        this.uniforms.offset.value.copy(this.offset);
        this.displayUniforms.depthScale.value =
            EMBOSS_DEPTH * (1 + bass * 0.05 + this.beat * 0.08);
        this.displayUniforms.audioPulse.value = this.audioPulse;
        this.displayUniforms.beat.value = this.beat;
    }

    updateColors(color_scheme: number) {
        this.uniforms.color_scheme.value = color_scheme;
    }

    setGrayscaleFactor(factor: number) {
        this.displayUniforms.grayscaleFactor.value = Math.max(0, Math.min(1, factor));
    }

    render() {
        this.displayUniforms.uCameraPosition.value.copy(this.displayCamera.position);

        this.renderer.setRenderTarget(this.fractalTarget);
        this.renderer.render(this.fractalScene, this.fractalCamera);

        let src: THREE.WebGLRenderTarget = this.fractalTarget;
        for (let i = 0; i < SORT_ITERATIONS; i++) {
            const dest = i % 2 === 0 ? this.sortTargetA : this.sortTargetB;
            this.sortUniforms.tInput.value = src.texture;
            this.sortUniforms.uPhase.value = i;
            this.renderer.setRenderTarget(dest);
            this.renderer.render(this.sortScene, this.sortCamera);
            src = dest;
        }
        this.displayUniforms.fractalMap.value = src.texture;

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