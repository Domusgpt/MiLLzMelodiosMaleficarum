/* core/ShaderManager.js - v1.3 L */

/**
 * Manages WebGL shader compilation, linking, and dynamic assembly
 * based on selected geometry and projection methods. Caches compiled
 * shaders and linked programs. Handles injecting GLSL code snippets.
 * v1.3: Updated to inject both geometry and projection code into the fragment shader.
 */

class ShaderManager {
    /**
     * Creates a new ShaderManager instance.
     * @param {WebGLRenderingContext} gl - The WebGL rendering context.
     * @param {import('./GeometryManager.js').GeometryManager} geometryManager - Instance of GeometryManager.
     * @param {import('./ProjectionManager.js').ProjectionManager} projectionManager - Instance of ProjectionManager.
     * @param {object} [options={}] - Configuration options.
     */
    constructor(gl, geometryManager, projectionManager, options = {}) {
        if (!gl) throw new Error("ShaderManager requires a WebGL context.");
        if (!geometryManager) throw new Error("ShaderManager requires a GeometryManager instance.");
        if (!projectionManager) throw new Error("ShaderManager requires a ProjectionManager instance.");

        this.gl = gl;
        this.geometryManager = geometryManager; // Needed for geometry code injection
        this.projectionManager = projectionManager; // Needed for projection code injection
        this.options = this._mergeDefaults(options);

        // Caches
        this.shaderSources = {};       // { name: { source, type } }
        this.compiledShaders = {};     // { uniqueShaderName: WebGLShader | null }
        this.programs = {};            // { programName: WebGLProgram | null }
        this.uniformLocations = {};    // { programName: { uniformName: WebGLUniformLocation | null } }
        this.attributeLocations = {};  // { programName: { attribName: number | null } }

        this.currentProgramName = null; // Tracks the program last activated via useProgram

        this._initShaderTemplates();
    }

    /** Merges provided options with defaults. */
    _mergeDefaults(options) {
        return {
            baseVertexShaderName: 'base-vertex',
            baseFragmentShaderName: 'base-fragment',
            ...options
        };
    }

    /** Loads the base shader templates. */
    _initShaderTemplates() {
        this._registerShaderSource(this.options.baseVertexShaderName, this._getBaseVertexShaderSource(), this.gl.VERTEX_SHADER);
        this._registerShaderSource(this.options.baseFragmentShaderName, this._getBaseFragmentShaderSource(), this.gl.FRAGMENT_SHADER);
    }

    /** Stores shader source code. */
    _registerShaderSource(name, source, type) {
        this.shaderSources[name] = { source, type };
    }

     /**
      * Compiles a shader from source, utilizing a cache.
      * @param {string} shaderIdentifier - A unique name for this specific shader source version.
      * @param {string} source - The GLSL source code.
      * @param {GLenum} type - this.gl.VERTEX_SHADER or this.gl.FRAGMENT_SHADER.
      * @returns {WebGLShader | null} The compiled shader or null on failure.
      * @private
      */
     _compileShader(shaderIdentifier, source, type) {
         if (this.compiledShaders[shaderIdentifier]) {
             return this.compiledShaders[shaderIdentifier];
         }

         const shader = this.gl.createShader(type);
         if (!shader) {
              console.error(`ShaderManager: Failed to create shader object for '${shaderIdentifier}'.`);
              this.compiledShaders[shaderIdentifier] = null; // Cache failure
              return null;
          }
         this.gl.shaderSource(shader, source);
         this.gl.compileShader(shader);

         if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
             const errorLog = this.gl.getShaderInfoLog(shader);
             console.error(`ShaderManager: Error compiling shader '${shaderIdentifier}':\n${errorLog}`);
             this._logShaderSourceWithError(source, errorLog);
             this.gl.deleteShader(shader);
             this.compiledShaders[shaderIdentifier] = null; // Cache failure
             return null;
         }

         // console.log(`ShaderManager: Compiled shader: ${shaderIdentifier}`);
         this.compiledShaders[shaderIdentifier] = shader; // Cache success
         return shader;
     }

     /** Helper to log shader source with error markers. */
     _logShaderSourceWithError(source, errorLog) {
         const lines = source.split('\n');
         const match = errorLog.match(/ERROR:\s*\d+:(\d+):/); // Extract line number
         let errorLineNum = match && match[1] ? parseInt(match[1], 10) : -1;

         console.error("--- Shader Source Start ---");
         lines.forEach((line, index) => {
             const lineNum = index + 1;
             const prefix = (lineNum === errorLineNum) ? `>> ${lineNum.toString().padStart(3)}: ` : `   ${lineNum.toString().padStart(3)}: `;
             console.error(prefix + line);
         });
         console.error("--- Shader Source End ---");
     }

      /**
       * Links vertex and fragment shaders into a WebGL program.
       * Replaces existing program and clears its caches if programName exists.
       * @param {string} programName - The name to identify this program.
       * @param {WebGLShader} vertexShader - Compiled vertex shader.
       * @param {WebGLShader} fragmentShader - Compiled fragment shader.
       * @returns {WebGLProgram | null} The linked program or null on failure.
       * @private
       */
      _createProgram(programName, vertexShader, fragmentShader) {
          // Clean up old program if rebuilding this specific one
          if (this.programs[programName]) {
              // console.log(`ShaderManager: Rebuilding program: ${programName}...`);
               const oldProgram = this.programs[programName];
               if (oldProgram) {
                   try {
                      const attachedShaders = this.gl.getAttachedShaders(oldProgram);
                      attachedShaders?.forEach(shader => this.gl.detachShader(oldProgram, shader));
                      this.gl.deleteProgram(oldProgram);
                   } catch (e) { console.warn(`ShaderManager: Error cleaning up old program '${programName}':`, e); }
               }
               // Clear caches for the program being replaced
               delete this.programs[programName];
               delete this.uniformLocations[programName];
               delete this.attributeLocations[programName];
          }

          const program = this.gl.createProgram();
           if (!program) {
               console.error(`ShaderManager: Failed to create program object for '${programName}'.`);
               return null;
           }
          this.gl.attachShader(program, vertexShader);
          this.gl.attachShader(program, fragmentShader);
          this.gl.linkProgram(program);

          if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
              const errorLog = this.gl.getProgramInfoLog(program);
              console.error(`ShaderManager: Error linking program '${programName}':\n${errorLog}`);
               try { this.gl.detachShader(program, vertexShader); } catch(e) {}
               try { this.gl.detachShader(program, fragmentShader); } catch(e) {}
              this.gl.deleteProgram(program);
              this.programs[programName] = null; // Cache failure
              return null;
          }

          // Cache successful program and initialize its location caches
          this.programs[programName] = program;
          this.uniformLocations[programName] = {};
          this.attributeLocations[programName] = {};
          console.log(`ShaderManager: Program '${programName}' created and linked successfully.`);
          return program;
      }

       /**
        * Creates or updates a shader program by injecting Geometry and Projection GLSL code
        * into the base fragment shader template and linking with the base vertex shader.
        *
        * @param {string} programName - A unique name for this program configuration (e.g., 'mainViz').
        * @param {string} geometryTypeName - Name of the geometry type (e.g., 'hypercube').
        * @param {string} projectionMethodName - Name of the projection method (e.g., 'perspective').
        * @returns {WebGLProgram | null} The linked WebGLProgram or null on failure.
        */
       createDynamicProgram(programName, geometryTypeName, projectionMethodName) {
            // console.log(`ShaderManager: Creating/Updating program '${programName}' with Geom: '${geometryTypeName}', Proj: '${projectionMethodName}'`);

           // --- Get Base Vertex Shader (Cached) ---
           const vertexShaderTemplateName = this.options.baseVertexShaderName;
           const vertexShaderSourceInfo = this.shaderSources[vertexShaderTemplateName];
           if (!vertexShaderSourceInfo) { console.error(`ShaderManager: Base vertex shader source '${vertexShaderTemplateName}' not found.`); return null; }
           // Compile if not already cached (compilation is idempotent)
           const vertexShader = this._compileShader(vertexShaderTemplateName, vertexShaderSourceInfo.source, vertexShaderSourceInfo.type);
           if (!vertexShader) return null; // Vertex shader failed


           // --- Get Dynamic Code Snippets ---
           const geometry = this.geometryManager.getGeometry(geometryTypeName);
           const projection = this.projectionManager.getProjection(projectionMethodName);
           if (!geometry) { console.error(`ShaderManager: Failed to get geometry provider for '${geometryTypeName}'.`); return null; }
           if (!projection) { console.error(`ShaderManager: Failed to get projection provider for '${projectionMethodName}'.`); return null; }

           const geometryGLSL = geometry.getShaderCode();
           const projectionGLSL = projection.getShaderCode();
           if (typeof geometryGLSL !== 'string' || typeof projectionGLSL !== 'string') {
               console.error(`ShaderManager: Invalid GLSL code returned by geometry or projection provider.`);
               return null;
           }

           // --- Inject Code into Fragment Shader Template ---
           const fragmentShaderTemplateName = this.options.baseFragmentShaderName;
           const fragmentShaderSourceInfo = this.shaderSources[fragmentShaderTemplateName];
           if (!fragmentShaderSourceInfo) { console.error(`ShaderManager: Base fragment shader source '${fragmentShaderTemplateName}' not found.`); return null; }

           let fragmentSource = fragmentShaderSourceInfo.source;
           fragmentSource = fragmentSource.replace('//__GEOMETRY_CODE_INJECTION_POINT__', geometryGLSL);
           fragmentSource = fragmentSource.replace('//__PROJECTION_CODE_INJECTION_POINT__', projectionGLSL);

           // --- Compile Combined Fragment Shader (Cached based on combination) ---
           const dynamicFragmentShaderIdentifier = `fragment-${geometryTypeName}-${projectionMethodName}`;
           const fragmentShader = this._compileShader(dynamicFragmentShaderIdentifier, fragmentSource, fragmentShaderSourceInfo.type);
           if (!fragmentShader) return null; // Fragment shader failed


           // --- Create and Link Program (Replaces existing program with this name) ---
           const newProgram = this._createProgram(programName, vertexShader, fragmentShader);

           // --- Handle Current Program State ---
           // If the program that was just rebuilt is the currently active one...
           if (this.currentProgramName === programName) {
               if (newProgram) {
                   // Re-activate it (necessary after deletion/creation) and clear caches
                   this.gl.useProgram(newProgram);
                   console.log(`ShaderManager: Re-activated rebuilt program '${programName}'. Caches were cleared.`);
               } else {
                   // Rebuild failed, deactivate current program
                   this.gl.useProgram(null);
                   this.currentProgramName = null;
                   console.error(`ShaderManager: Failed to rebuild active program '${programName}'. Deactivating.`);
               }
           }

           return newProgram; // Return the newly created (or null) program
       }

        /** Activates the specified shader program for use. */
       useProgram(programName) {
           if (programName === null) {
               if (this.currentProgramName !== null) {
                   this.gl.useProgram(null);
                   this.currentProgramName = null;
               }
               return;
           }

           const program = this.programs[programName];
           if (program) { // Check if program exists and is valid
               // Avoid redundant gl.useProgram calls if already active
                const currentGLProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
                if (currentGLProgram !== program) {
                    this.gl.useProgram(program);
                }
                this.currentProgramName = programName; // Update tracker
            } else {
                console.warn(`ShaderManager: Program '${programName}' not found or not compiled yet. Cannot use.`);
                // If the requested program was the current one but is now invalid, clear the tracker
                if (this.currentProgramName === programName) {
                    this.currentProgramName = null;
                    try { this.gl.useProgram(null); } catch(e){} // Try to deactivate GL program too
                }
            }
       }

       /**
        * Gets the location of a uniform variable for the *currently active* program. Caches the result.
        * @param {string} name - The name of the uniform.
        * @returns {WebGLUniformLocation | null} The location or null if not found/no active program.
        */
       getUniformLocation(name) {
           if (!this.currentProgramName || !this.programs[this.currentProgramName]) {
               // Avoid console spam if repeatedly called before program is ready
               // console.warn(`ShaderManager: Cannot get uniform '${name}': Program '${this.currentProgramName || 'none'}' is not active or valid.`);
               return null;
           }
           const programName = this.currentProgramName;
           const cache = this.uniformLocations[programName];

           // Check cache first
           if (cache.hasOwnProperty(name)) {
               return cache[name];
           }

           // Not cached, get location from GL
           const location = this.gl.getUniformLocation(this.programs[programName], name);
           cache[name] = location; // Cache the result (even if null)

           // if (location === null) {
           //     console.warn(`Uniform '${name}' not found in program '${programName}'`);
           // }
           return location;
       }

       /**
        * Gets the location of an attribute variable for the *currently active* program. Caches the result.
        * @param {string} name - The name of the attribute.
        * @returns {number | null} The attribute location (>= 0) or null if not found/no active program.
        */
       getAttributeLocation(name) {
            if (!this.currentProgramName || !this.programs[this.currentProgramName]) {
                // console.warn(`ShaderManager: Cannot get attribute '${name}': Program '${this.currentProgramName || 'none'}' is not active or valid.`);
                return null;
            }
            const programName = this.currentProgramName;
            const cache = this.attributeLocations[programName];

            if (cache.hasOwnProperty(name)) {
                return cache[name];
            }

            const location = this.gl.getAttribLocation(this.programs[programName], name);
            cache[name] = (location === -1) ? null : location; // Store null if not found (-1)

            // if (location === -1) {
            //      console.warn(`Attribute '${name}' not found in program '${programName}'`);
            // }
            return cache[name];
       }


    // --- Shader Source Templates ---

    _getBaseVertexShaderSource() {
        // Standard pass-through vertex shader
        return `
            attribute vec2 a_position; // Input: Clip space (-1 to 1)
            varying vec2 v_uv;       // Output: UV coordinates (0 to 1)

            void main() {
                // Flip Y for standard texture coordinates (optional, depends on texture loading)
                // v_uv = a_position * 0.5 + 0.5; v_uv.y = 1.0 - v_uv.y;
                v_uv = a_position * 0.5 + 0.5; // Standard UV 0,0 at bottom-left
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;
    }

    _getBaseFragmentShaderSource() {
        // Base fragment shader with injection points and necessary uniforms declared
        return `
            precision highp float;

            // Uniforms from HypercubeCore state
            uniform vec2 u_resolution;
            uniform float u_time;
            // uniform vec2 u_mouse; // Often unused now, controlled by audio/XY pads

            // Visual Parameters
            uniform float u_dimension;     // Typically 3.0 to 4.0+
            uniform float u_morphFactor;   // 0.0 to 1.0+ for blending/transitions
            uniform float u_rotationSpeed; // Multiplier for time-based rotations
            uniform float u_universeModifier; // Spatial expansion/compression factor
            uniform float u_patternIntensity; // Overall brightness/contrast control
            uniform float u_gridDensity;   // Base density for lattice structures

            // Audio Levels
            uniform float u_audioBass;     // Normalized 0-1
            uniform float u_audioMid;      // Normalized 0-1
            uniform float u_audioHigh;     // Normalized 0-1
            uniform float u_currentNoteFreq; // Frequency of last note played

            // Effects Parameters (Can be used by geometry/projection or main shader)
            uniform float u_glitchIntensity; // 0.0 to 1.0+
            uniform float u_plasmaSpeed;
            uniform float u_plasmaScale;
            uniform float u_moireIntensity;
            uniform float u_moireScale;

            // Color Scheme
            uniform vec3 u_primaryColor;
            uniform vec3 u_secondaryColor;
            uniform vec3 u_backgroundColor; // Used for mixing/base color

            // Varyings
            varying vec2 v_uv; // Texture/screen coordinates (0-1)


            // --- 4D Rotation Matrices (Helper Functions) ---
            // (Ensure these match the ones used in geometry GLSL if called there)
            mat4 rotXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
            mat4 rotYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
            mat4 rotZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }
            mat4 rotXY(float a) { float c=cos(a),s=sin(a); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
            mat4 rotYZ(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
            mat4 rotXZ(float a) { float c=cos(a),s=sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
            // Add more rotations (like XZ, YZ, XY for 4D) if needed by geometry code


            // --- Dynamic Code Injection ---

            // Defines: vec3 project4Dto3D(vec4 p)
            //__PROJECTION_CODE_INJECTION_POINT__

            // Defines: float calculateLattice(vec3 p)
            //__GEOMETRY_CODE_INJECTION_POINT__


            // --- Main Fragment Shader Logic ---
            void main() {
                // Calculate UV coordinates centered and aspect-corrected
                vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                vec2 uv = (v_uv * 2.0 - 1.0) * aspect; // Centered UVs (-aspect to +aspect, -1 to 1)

                // Simple camera setup (can be expanded)
                vec3 rayOrigin = vec3(0.0, 0.0, -2.5); // Camera position
                vec3 rayDirection = normalize(vec3(uv, 1.0)); // Simple perspective ray

                // --- Apply Basic 3D Camera Rotation (Example) ---
                // Rotate camera based on time and rotation speed
                float camRotY = u_time * 0.1 * u_rotationSpeed;
                float camRotX = sin(u_time * 0.07 * u_rotationSpeed) * 0.2;
                mat4 camMat = rotXY(camRotX) * rotYZ(camRotY); // Example rotation
                rayDirection = (camMat * vec4(rayDirection, 0.0)).xyz;
                rayOrigin = (camMat * vec4(rayOrigin, 1.0)).xyz;


                // --- Sampling Position ---
                // For simple volume rendering or surface finding, 'p' is the sampling point.
                // Here, we'll use rayDirection directly as the input 'p' for the lattice function,
                // effectively sampling the lattice based on view direction from origin.
                // More complex rendering (ray marching) would iterate along rayDirection.
                vec3 p = rayDirection * 1.5; // Scale the direction vector to sample a region

                // --- Calculate Lattice Value using Injected Geometry Function ---
                float latticeValue = calculateLattice(p); // Use the injected function

                // --- Color Calculation ---
                // Base color mixing using theme colors and lattice value
                vec3 color = mix(u_backgroundColor, u_primaryColor, latticeValue);
                // Add secondary color based on audio highs or other factors
                color = mix(color, u_secondaryColor, smoothstep(0.3, 0.8, u_audioHigh) * latticeValue * 0.5);

                // Apply overall pattern intensity
                color *= u_patternIntensity;

                // --- Glitch Effect ---
                if (u_glitchIntensity > 0.01) {
                    float glitchAmount = u_glitchIntensity * 0.01; // Scale effect
                    vec2 offsetR = vec2(cos(u_time * 15.0), sin(u_time * 11.8)) * glitchAmount * aspect;
                    vec2 offsetB = vec2(sin(u_time * 18.2), cos(u_time * 14.1)) * glitchAmount * aspect;

                    // Recalculate lattice at offset positions for R and B channels
                    // Use the original UV sampling space for offsets
                     vec3 pR = normalize(vec3(uv + offsetR / aspect, 1.0)); // Recalculate ray direction
                     vec3 pB = normalize(vec3(uv + offsetB / aspect, 1.0));
                     pR = (camMat * vec4(pR, 0.0)).xyz * 1.5; // Apply camera rotation and scale
                     pB = (camMat * vec4(pB, 0.0)).xyz * 1.5;

                     float latticeR = calculateLattice(pR);
                     float latticeB = calculateLattice(pB);

                    // Combine channels - Use the offset lattice values for R and B
                    color = vec3(mix(u_backgroundColor.r, u_primaryColor.r, latticeR),
                                 color.g, // Keep original green channel calculation
                                 mix(u_backgroundColor.b, u_primaryColor.b, latticeB));
                    color = mix(color, u_secondaryColor, smoothstep(0.3, 0.8, u_audioHigh) * max(latticeR, latticeB) * 0.5); // Mix secondary based on max offset
                    color *= u_patternIntensity; // Re-apply intensity
                }


                // --- Final Output ---
                // Basic gamma correction / tone mapping
                color = pow(clamp(color, 0.0, 1.0), vec3(0.8));

                gl_FragColor = vec4(color, 1.0);
            }
        `;
    }

     /** Cleans up all managed WebGL resources (shaders, programs). */
     dispose() {
         console.log("ShaderManager: Disposing resources...");
         if (!this.gl) { console.warn("ShaderManager: GL context already null during dispose."); return; }

         try { this.gl.useProgram(null); } // Deactivate any active program
         catch(e) { console.warn("ShaderManager: Error calling useProgram(null) during dispose:", e); }

         // Delete programs first
         for (const name in this.programs) {
             if (this.programs[name]) {
                  const program = this.programs[name];
                  try {
                      // Detach shaders currently attached (WebGL requires this before deleting program)
                      const attachedShaders = this.gl.getAttachedShaders(program);
                      attachedShaders?.forEach(shader => { try { this.gl.detachShader(program, shader); } catch(e) {/* ignore */} });
                      // Delete the program
                      this.gl.deleteProgram(program);
                  } catch (e) { console.warn(`ShaderManager: Error deleting program '${name}':`, e); }
             }
         }
         this.programs = {}; // Clear cache

         // Delete all compiled shaders (vertex and dynamic fragments)
         for (const name in this.compiledShaders) {
             if (this.compiledShaders[name]) {
                 try { this.gl.deleteShader(this.compiledShaders[name]); }
                 catch(e) { console.warn(`ShaderManager: Error deleting shader '${name}':`, e); }
             }
         }
         this.compiledShaders = {}; // Clear cache

         // Clear other caches and references
         this.shaderSources = {};
         this.uniformLocations = {};
         this.attributeLocations = {};
         this.currentProgramName = null;
         this.geometryManager = null; // Release references
         this.projectionManager = null;
         // Do not nullify GL context here if owned externally (e.g., by HypercubeCore)
         // this.gl = null;

         console.log("ShaderManager: Disposed.");
     }
}

export default ShaderManager;