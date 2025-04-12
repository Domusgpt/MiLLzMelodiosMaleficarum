/* core/HypercubeCore.js - v1.3 L */

/**
 * Main WebGL rendering engine for the Maleficarum's visualization.
 * Manages the unified canvas, WebGL context, shader programs (via ShaderManager),
 * rendering loop, and visual state parameters driven by audio/UI.
 */
import ShaderManager from './ShaderManager.js';

// Default state reflecting uniforms used in the current shaders
const DEFAULT_STATE = {
    // Core GL / Timing
    startTime: 0,
    lastUpdateTime: 0,
    deltaTime: 0,
    time: 0.0,                  // u_time
    resolution: [0, 0],         // u_resolution
    // mouse: [0.5, 0.5],       // u_mouse (Currently unused by default shader)

    // Visual Parameters (Mapped to uniforms)
    geometryType: 'hypercube',      // String name (passed to ShaderManager)
    projectionMethod: 'perspective',// String name (passed to ShaderManager)
    dimensions: 4.0,            // u_dimension
    morphFactor: 0.5,           // u_morphFactor
    rotationSpeed: 0.2,         // u_rotationSpeed (Base speed multiplier)
    universeModifier: 1.0,      // u_universeModifier (Spatial expansion/compression)
    patternIntensity: 1.0,      // u_patternIntensity (Overall brightness/contrast)
    gridDensity: 8.0,           // u_gridDensity (Base density for lattice structures)

    // Effects Parameters (Mapped to uniforms)
    glitchIntensity: 0.0,       // u_glitchIntensity
    plasmaSpeed: 0.5,           // u_plasmaSpeed (Available, but maybe unused by current shader)
    plasmaScale: 1.0,           // u_plasmaScale (Available, but maybe unused by current shader)
    moireIntensity: 0.0,        // u_moireIntensity (Available, but maybe unused by current shader)
    moireScale: 5.0,            // u_moireScale (Available, but maybe unused by current shader)
    currentNoteFrequency: 440.0,// u_currentNoteFreq (For potential audio-visual sync)

    // Audio Levels (Updated externally via audio analysis loop)
    audioLevels: { bass: 0, mid: 0, high: 0 }, // u_audioBass, u_audioMid, u_audioHigh

    // Color Scheme (Mapped to uniforms)
    colorScheme: {
        primary: [1.0, 0.2, 0.8],    // u_primaryColor (vec3)
        secondary: [0.2, 1.0, 1.0],  // u_secondaryColor (vec3)
        background: [0.05, 0.0, 0.2] // u_backgroundColor (vec3) - Alpha handled by clearColor directly
    },

    // Performance / State Tracking
    needsShaderUpdate: false, // Flag to trigger shader recompilation
    _dirtyUniforms: new Set(), // Tracks which uniforms need GPU update
    isRendering: false,
    animationFrameId: null,

    // Shader Program Control
    shaderProgramName: 'maleficarumViz', // Default program name used with ShaderManager

    // Callbacks
    callbacks: {
        onRender: null, // (state) => {}
        onError: null   // (error) => {}
    }
};


class HypercubeCore {
    /**
     * Creates an instance of HypercubeCore.
     * @param {HTMLCanvasElement} canvas - The canvas element to render on.
     * @param {ShaderManager} shaderManager - An instance of ShaderManager for this context.
     * @param {object} [options={}] - Initial configuration options, merged with defaults.
     */
    constructor(canvas, shaderManager, options = {}) {
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) throw new Error("HypercubeCore requires a valid HTMLCanvasElement.");
        if (!shaderManager || !(shaderManager instanceof ShaderManager)) throw new Error("HypercubeCore requires a valid ShaderManager instance.");

        this.canvas = canvas;
        this.gl = shaderManager.gl; // Get GL context from ShaderManager
        this.shaderManager = shaderManager;
        this.quadBuffer = null;
        this.aPositionLoc = -1; // Cache attribute location

        // --- State Initialization ---
        // Deep merge options with defaults (simple approach, assumes flat objects for nested props)
        this.state = {
            ...DEFAULT_STATE,
            ...options,
            // Deep copy nested objects to prevent shared references
            colorScheme: { ...DEFAULT_STATE.colorScheme, ...(options.colorScheme || {}) },
            audioLevels: { ...DEFAULT_STATE.audioLevels, ...(options.audioLevels || {}) },
            callbacks: { ...DEFAULT_STATE.callbacks, ...(options.callbacks || {}) },
             _dirtyUniforms: new Set() // Initialize empty, will be populated below
        };
        // Mark all corresponding uniforms as dirty initially
        this._markAllUniformsDirty();

        // Copy initial geometry/projection/shader from options to state if provided
        if (options.geometryType) this.state.geometryType = options.geometryType;
        if (options.projectionMethod) this.state.projectionMethod = options.projectionMethod;
        if (options.shaderProgramName) this.state.shaderProgramName = options.shaderProgramName;
        else this.state.shaderProgramName = 'maleficarumViz'; // Ensure default name

        try {
            this._setupWebGLState();
            this._initBuffers();
            // Trigger initial shader creation based on final state
            this.state.needsShaderUpdate = true;
            this._updateShaderIfNeeded(); // Creates and compiles the initial shader

        } catch (error) {
            console.error("HypercubeCore Initialization Error:", error);
            this.state.callbacks.onError?.(error);
        }
    }

    /** Marks all uniforms corresponding to DEFAULT_STATE keys as dirty. */
    _markAllUniformsDirty() {
        this.state._dirtyUniforms = new Set();
        for (const key in DEFAULT_STATE) {
            // Skip non-uniform state keys
            if (key === 'geometryType' || key === 'projectionMethod' || key === 'shaderProgramName' ||
                key === 'needsShaderUpdate' || key === '_dirtyUniforms' || key === 'isRendering' ||
                key === 'animationFrameId' || key === 'callbacks' || key === 'startTime' ||
                key === 'lastUpdateTime' || key === 'deltaTime') continue;

            // Map state key to uniform name
            let uniformName;
            if (key === 'time') uniformName = 'u_time';
            else if (key === 'resolution') uniformName = 'u_resolution';
            // else if (key === 'mouse') uniformName = 'u_mouse'; // If mouse uniform is used
            else if (key === 'dimensions') uniformName = 'u_dimension';
            else if (key === 'morphFactor') uniformName = 'u_morphFactor';
            else if (key === 'rotationSpeed') uniformName = 'u_rotationSpeed';
            else if (key === 'universeModifier') uniformName = 'u_universeModifier';
            else if (key === 'patternIntensity') uniformName = 'u_patternIntensity';
            else if (key === 'gridDensity') uniformName = 'u_gridDensity';
            else if (key === 'glitchIntensity') uniformName = 'u_glitchIntensity';
            else if (key === 'plasmaSpeed') uniformName = 'u_plasmaSpeed';
            else if (key === 'plasmaScale') uniformName = 'u_plasmaScale';
            else if (key === 'moireIntensity') uniformName = 'u_moireIntensity';
            else if (key === 'moireScale') uniformName = 'u_moireScale';
            else if (key === 'currentNoteFrequency') uniformName = 'u_currentNoteFreq';
            else if (key === 'audioLevels') {
                this.state._dirtyUniforms.add('u_audioBass');
                this.state._dirtyUniforms.add('u_audioMid');
                this.state._dirtyUniforms.add('u_audioHigh');
                continue; // Skip adding 'u_audioLevels' itself
            } else if (key === 'colorScheme') {
                 this.state._dirtyUniforms.add('u_primaryColor');
                 this.state._dirtyUniforms.add('u_secondaryColor');
                 this.state._dirtyUniforms.add('u_backgroundColor');
                 continue; // Skip adding 'u_colorScheme' itself
            } else {
                console.warn(`HypercubeCore: No explicit uniform mapping for initial state key '${key}'.`);
                continue; // Skip unknown keys
            }
            this.state._dirtyUniforms.add(uniformName);
        }
         // console.log("Initial dirty uniforms:", this.state._dirtyUniforms);
    }

    /** Sets initial WebGL state parameters. */
    _setupWebGLState() {
        const gl = this.gl;
        // Use background color from state, default alpha 1.0
        const bg = this.state.colorScheme.background;
        gl.clearColor(bg[0], bg[1], bg[2], 1.0);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    /** Initializes the vertex buffer for the full-screen quad. */
    _initBuffers() {
        const gl = this.gl;
        const positions = new Float32Array([ -1, -1, 1, -1, -1, 1, 1, 1 ]); // Covers clip space

        this.quadBuffer = gl.createBuffer();
        if (!this.quadBuffer) throw new Error("Failed to create WebGL buffer.");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind
    }

    /** Updates shader program if geometry or projection changed. */
     _updateShaderIfNeeded() {
        if (!this.state.needsShaderUpdate) return true; // No update needed

        const programName = this.state.shaderProgramName;
        const geomName = this.state.geometryType;
        const projName = this.state.projectionMethod;

        console.log(`HypercubeCore: Updating shader program '${programName}' -> Geom: ${geomName}, Proj: ${projName}`);

        // Use ShaderManager to create/update the program
        const program = this.shaderManager.createDynamicProgram(programName, geomName, projName);

        if (!program) {
            console.error(`HypercubeCore: Failed to create/update shader program '${programName}'. Halting rendering.`);
            this.state.callbacks.onError?.(new Error(`Failed shader update for ${geomName}/${projName}`));
            this.stop();
            return false; // Indicate failure
        }

        // Shader updated successfully
        this.state.needsShaderUpdate = false;
        this.shaderManager.useProgram(programName); // Activate the new program

        // --- Re-cache attribute location ---
        this.aPositionLoc = this.shaderManager.getAttributeLocation('a_position');
        if (this.aPositionLoc === null) { // Check explicitly for null (location not found)
            console.warn(`HypercubeCore: Attribute 'a_position' not found in program '${programName}'. Draw call will fail.`);
            // Don't try to enable if null
        } else {
            try {
                this.gl.enableVertexAttribArray(this.aPositionLoc);
            } catch (e) {
                 console.error(`HypercubeCore: Error enabling vertex attribute 'a_position' (loc: ${this.aPositionLoc}):`, e);
                 this.aPositionLoc = -1; // Mark as invalid to prevent drawing errors
            }
        }

        // Mark all uniforms as dirty after shader change, as locations might be invalid/changed
        this._markAllUniformsDirty();

        console.log(`HypercubeCore: Shader program '${programName}' updated successfully.`);
        return true; // Indicate success
    }

    /**
     * Updates visual state parameters based on external input (e.g., UI, audio analysis).
     * @param {object} newParams - Object containing parameters to update (keys should match state).
     */
    updateParameters(newParams) {
        let shaderNeedsUpdate = false;
        let needsFullUniformUpdate = false; // Flag if any parameter change occurred

        for (const key in newParams) {
            if (!Object.hasOwnProperty.call(this.state, key)) {
                // console.warn(`HypercubeCore: Attempted to update unknown parameter '${key}'`);
                continue; // Skip unknown parameters
            }

            const oldValue = this.state[key];
            const newValue = newParams[key];

            // Special handling for nested objects (deep comparison might be needed for complex objects)
            if (typeof oldValue === 'object' && oldValue !== null && !Array.isArray(oldValue)) {
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    // Update nested state (simple merge, assumes flat structure within nested obj)
                    this.state[key] = { ...oldValue, ...newValue };
                    needsFullUniformUpdate = true; // Mark related uniforms dirty below

                    // Mark specific uniforms dirty based on nested key
                    if (key === 'colorScheme') {
                        if (newValue.hasOwnProperty('primary')) this.state._dirtyUniforms.add('u_primaryColor');
                        if (newValue.hasOwnProperty('secondary')) this.state._dirtyUniforms.add('u_secondaryColor');
                        if (newValue.hasOwnProperty('background')) this.state._dirtyUniforms.add('u_backgroundColor');
                    } else if (key === 'audioLevels') {
                        if (newValue.hasOwnProperty('bass')) this.state._dirtyUniforms.add('u_audioBass');
                        if (newValue.hasOwnProperty('mid')) this.state._dirtyUniforms.add('u_audioMid');
                        if (newValue.hasOwnProperty('high')) this.state._dirtyUniforms.add('u_audioHigh');
                    }
                }
            }
            // Handle primitive types and arrays (simple comparison)
            else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                this.state[key] = newValue;
                needsFullUniformUpdate = true;

                // Mark corresponding uniform dirty
                this._markUniformDirty(key);

                // Check if geometry or projection changed - requires shader rebuild
                if (key === 'geometryType' || key === 'projectionMethod') {
                    shaderNeedsUpdate = true;
                }
            }
        }

        if (shaderNeedsUpdate) {
            this.state.needsShaderUpdate = true; // Trigger shader rebuild on next frame
            // Note: _updateShaderIfNeeded will mark *all* uniforms dirty anyway
        }
        // Note: _dirtyUniforms set is managed within this loop and _markUniformDirty
    }

    /** Marks a single uniform as dirty based on its state key */
    _markUniformDirty(stateKey) {
         // Map state key to uniform name
         let uniformName;
            if (stateKey === 'time') uniformName = 'u_time';
            else if (stateKey === 'resolution') uniformName = 'u_resolution';
            else if (stateKey === 'dimensions') uniformName = 'u_dimension';
            else if (stateKey === 'morphFactor') uniformName = 'u_morphFactor';
            else if (stateKey === 'rotationSpeed') uniformName = 'u_rotationSpeed';
            else if (stateKey === 'universeModifier') uniformName = 'u_universeModifier';
            else if (stateKey === 'patternIntensity') uniformName = 'u_patternIntensity';
            else if (stateKey === 'gridDensity') uniformName = 'u_gridDensity';
            else if (stateKey === 'glitchIntensity') uniformName = 'u_glitchIntensity';
            else if (stateKey === 'plasmaSpeed') uniformName = 'u_plasmaSpeed';
            else if (stateKey === 'plasmaScale') uniformName = 'u_plasmaScale';
            else if (stateKey === 'moireIntensity') uniformName = 'u_moireIntensity';
            else if (stateKey === 'moireScale') uniformName = 'u_moireScale';
            else if (stateKey === 'currentNoteFrequency') uniformName = 'u_currentNoteFreq';
            // Nested objects are handled in updateParameters directly
            else if (stateKey === 'audioLevels' || stateKey === 'colorScheme') return;
            // Skip keys that don't map to uniforms
            else if (['geometryType', 'projectionMethod', 'shaderProgramName', 'needsShaderUpdate',
                      '_dirtyUniforms', 'isRendering', 'animationFrameId', 'callbacks', 'startTime',
                      'lastUpdateTime', 'deltaTime'].includes(stateKey)) return;
            else {
                console.warn(`HypercubeCore: No explicit uniform mapping for updated state key '${stateKey}'.`);
                return;
            }

        if(uniformName) this.state._dirtyUniforms.add(uniformName);
    }


    /** Checks if the canvas needs resizing and updates viewport/resolution. */
    _checkResize() {
        const gl = this.gl;
        const canvas = this.canvas;
        // Use clientWidth/Height for responsive sizing based on CSS
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
            this.state.resolution = [canvas.width, canvas.height];
            this.state._dirtyUniforms.add('u_resolution'); // Mark resolution uniform dirty
            console.log(`HypercubeCore (${this.state.shaderProgramName}): Resized canvas to ${canvas.width}x${canvas.height}`);
            return true;
        }
        return false;
    }

    /** Sets all tracked dirty uniforms on the GPU for the current shader program. */
    _setUniforms() {
        const gl = this.gl;
        const dirty = this.state._dirtyUniforms;
        const programName = this.state.shaderProgramName;

        // Ensure the correct program is active (crucial after shader rebuild)
        this.shaderManager.useProgram(programName);
        // Check if useProgram failed (program might be null)
        if(this.shaderManager.currentProgramName !== programName) {
            // console.warn(`HypercubeCore: Skipping uniform update, program '${programName}' is not active.`);
             return; // Cannot set uniforms if program isn't active/valid
        }

        // Handle time separately as it always changes
        const timeLoc = this.shaderManager.getUniformLocation('u_time');
        if (timeLoc) gl.uniform1f(timeLoc, this.state.time);
        else dirty.add('u_time'); // Keep trying if location not found yet

        // Process other dirty uniforms
        const uniformsToRetry = new Set(); // Track uniforms where location is temporarily null

        dirty.forEach(uniformName => {
             if (uniformName === 'u_time') return; // Already handled above

            const location = this.shaderManager.getUniformLocation(uniformName);
            if (location !== null) { // Location found, attempt to set
                try {
                    // --- Map state properties to uniform calls ---
                    switch (uniformName) {
                        // Core
                        case 'u_resolution': gl.uniform2fv(location, this.state.resolution); break;
                        // case 'u_mouse': gl.uniform2fv(location, this.state.mouse); break; // If used
                        // Visual Params
                        case 'u_dimension': gl.uniform1f(location, this.state.dimensions); break;
                        case 'u_morphFactor': gl.uniform1f(location, this.state.morphFactor); break;
                        case 'u_rotationSpeed': gl.uniform1f(location, this.state.rotationSpeed); break;
                        case 'u_universeModifier': gl.uniform1f(location, this.state.universeModifier); break;
                        case 'u_patternIntensity': gl.uniform1f(location, this.state.patternIntensity); break;
                        case 'u_gridDensity': gl.uniform1f(location, this.state.gridDensity); break;
                        // Effects
                        case 'u_glitchIntensity': gl.uniform1f(location, this.state.glitchIntensity); break;
                        case 'u_plasmaSpeed': gl.uniform1f(location, this.state.plasmaSpeed); break;
                        case 'u_plasmaScale': gl.uniform1f(location, this.state.plasmaScale); break;
                        case 'u_moireIntensity': gl.uniform1f(location, this.state.moireIntensity); break;
                        case 'u_moireScale': gl.uniform1f(location, this.state.moireScale); break;
                        case 'u_currentNoteFreq': gl.uniform1f(location, this.state.currentNoteFrequency); break;
                        // Colors (send vec3)
                        case 'u_primaryColor': gl.uniform3fv(location, this.state.colorScheme.primary); break;
                        case 'u_secondaryColor': gl.uniform3fv(location, this.state.colorScheme.secondary); break;
                        case 'u_backgroundColor': gl.uniform3fv(location, this.state.colorScheme.background); break;
                        // Audio Levels
                        case 'u_audioBass': gl.uniform1f(location, this.state.audioLevels.bass); break;
                        case 'u_audioMid': gl.uniform1f(location, this.state.audioLevels.mid); break;
                        case 'u_audioHigh': gl.uniform1f(location, this.state.audioLevels.high); break;
                        default:
                            console.warn(`HypercubeCore: No specific update logic for dirty uniform '${uniformName}'.`);
                             // Don't remove from dirty set here, let it be removed below if successful
                            break;
                    }
                    // Successfully set the uniform, remove from dirty set for this frame
                     // dirty.delete(uniformName); // Will be cleared below

                } catch (e) {
                    console.error(`HypercubeCore: Error setting uniform '${uniformName}':`, e);
                    // dirty.delete(uniformName); // Remove to prevent spamming errors
                }
            } else {
                // Location not found - could be temporary after shader rebuild. Keep it dirty.
                 // console.warn(`HypercubeCore: Location not found for uniform '${uniformName}'. Will retry.`);
                 uniformsToRetry.add(uniformName);
            }
        });

         // Clear the processed dirty set and replace with any uniforms that need retrying
         this.state._dirtyUniforms = uniformsToRetry;
    }

    /** The main rendering loop. */
    _render(timestamp) {
        if (!this.state.isRendering) return;

        const gl = this.gl;
        if (!gl || gl.isContextLost()) {
             console.error(`HypercubeCore (${this.state.shaderProgramName}): GL context lost. Stopping render loop.`);
             this.stop();
             this.state.callbacks.onError?.(new Error("WebGL context lost"));
             return;
        }

        // Update Time
        if (!this.state.startTime) this.state.startTime = timestamp;
        const currentTime = (timestamp - this.state.startTime) * 0.001; // Seconds
        this.state.deltaTime = currentTime - this.state.time;
        this.state.time = currentTime;
        this.state.lastUpdateTime = timestamp;
        this.state._dirtyUniforms.add('u_time'); // Time always changes

        // Check for Canvas Resize
        this._checkResize();

        // Update shader program IF needed (triggered by state changes)
         if (this.state.needsShaderUpdate) {
            if (!this._updateShaderIfNeeded()) {
                 return; // Shader update failed, loop already stopped
             }
             // _updateShaderIfNeeded marks all uniforms dirty
         }

        // Set all dirty uniforms
        this._setUniforms();

        // Prepare for Drawing
        const bg = this.state.colorScheme.background;
        gl.clearColor(bg[0], bg[1], bg[2], 1.0); // Use vec3 from state, alpha 1.0
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Draw Call
        if (this.quadBuffer && this.aPositionLoc !== null && this.aPositionLoc >= 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            // Ensure attribute is enabled (might be disabled if context state is weird)
             try {
                gl.enableVertexAttribArray(this.aPositionLoc);
                gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the quad
             } catch (e) {
                 console.error("HypercubeCore: Error during draw call:", e);
                  this.stop(); // Stop rendering on draw error
                  this.state.callbacks.onError?.(new Error("WebGL draw error"));
             }
        } else {
             // Avoid spamming console if buffer/attribute location is invalid
             // It will be re-checked/re-cached on shader updates or if start() is called again.
        }

        // Callback & Next Frame
        this.state.callbacks.onRender?.(this.state); // Pass current state
        this.state.animationFrameId = requestAnimationFrame(this._render.bind(this));
    }

    /** Starts the rendering loop. */
    start() {
        if (this.state.isRendering) return;
        if (!this.gl || this.gl.isContextLost()) {
             console.error(`HypercubeCore (${this.state.shaderProgramName}): Cannot start rendering, WebGL context invalid.`);
             return;
        }

        console.log(`HypercubeCore (${this.state.shaderProgramName}): Starting render loop.`);
        this.state.isRendering = true;
        this.state.startTime = performance.now();
        this.state.time = 0;
        this.state.lastUpdateTime = this.state.startTime;

        // Ensure shader is up-to-date and attribute location is valid before first frame
        if (this.state.needsShaderUpdate) {
            if (!this._updateShaderIfNeeded()) {
                 console.error(`HypercubeCore (${this.state.shaderProgramName}): Initial shader update failed. Cannot start.`);
                 this.state.isRendering = false;
                 return;
            }
        } else if (this.aPositionLoc === null || this.aPositionLoc < 0) {
             // Try recaching attribute location if it was invalid before
             this.aPositionLoc = this.shaderManager.getAttributeLocation('a_position');
             if (this.aPositionLoc === null || this.aPositionLoc < 0) {
                  console.error(`HypercubeCore (${this.state.shaderProgramName}): Attribute 'a_position' invalid. Cannot start rendering.`);
                  this.state.isRendering = false;
                  return;
             }
             try { this.gl.enableVertexAttribArray(this.aPositionLoc); } catch (e) {
                 console.error("Error enabling vertex attribute on start:", e);
                 this.state.isRendering = false; return;
             }
        }


        // Mark all uniforms dirty on first start or restart
        this._markAllUniformsDirty();

        this.state.animationFrameId = requestAnimationFrame(this._render.bind(this));
    }

    /** Stops the rendering loop. */
    stop() {
        if (!this.state.isRendering) return;
        console.log(`HypercubeCore (${this.state.shaderProgramName}): Stopping render loop.`);
        if (this.state.animationFrameId) {
            cancelAnimationFrame(this.state.animationFrameId);
        }
        this.state.isRendering = false;
        this.state.animationFrameId = null;
    }

    /** Cleans up WebGL resources. */
    dispose() {
        const name = this.state?.shaderProgramName || 'Unknown';
        console.log(`HypercubeCore (${name}): Disposing resources...`);
        this.stop();

        if (this.gl && !this.gl.isContextLost()) {
            try {
                if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
                // ShaderManager disposal should be handled externally if shared,
                // or called here if exclusive to this HypercubeCore instance.
                 if (this.shaderManager && typeof this.shaderManager.dispose === 'function') {
                     console.log(`HypercubeCore (${name}): Disposing associated ShaderManager.`);
                     this.shaderManager.dispose(); // Dispose shader manager if owned
                 }

                 // Attempt to lose context gracefully
                 const loseContextExt = this.gl.getExtension('WEBGL_lose_context');
                 loseContextExt?.loseContext();
             } catch(e) { console.warn(`HypercubeCore (${name}): Error during WebGL resource cleanup:`, e); }
        }

        this.quadBuffer = null;
        this.gl = null; // Release GL context reference
        this.canvas = null; // Release canvas reference
        this.shaderManager = null; // Release manager reference
        this.state = {}; // Clear state
        console.log(`HypercubeCore (${name}): Disposed.`);
    }
}
export default HypercubeCore;