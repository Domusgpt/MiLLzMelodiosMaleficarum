/* core/ProjectionManager.js - v1.3 L */

/**
 * Manages different methods for projecting 4-dimensional points into 3-dimensional space.
 * Provides GLSL code snippets defining the `project4Dto3D(vec4 p)` function for shaders.
 * Ensures uniform names used in GLSL match those set by HypercubeCore.
 */

// --- Base Projection Class ---
class BaseProjection {
    constructor() {}
    /**
     * Returns GLSL code defining: `vec3 project4Dto3D(vec4 p)`
     * Can use uniforms like u_morphFactor, u_audioMid, u_audioHigh if needed.
     * @returns {string} GLSL code snippet.
     */
    getShaderCode() { throw new Error(`getShaderCode() must be implemented by projection subclass.`); }
}

// --- Perspective Projection ---
class PerspectiveProjection extends BaseProjection {
    constructor(viewDistance = 2.5) {
        super();
        this.viewDistance = Math.max(0.1, viewDistance); // Base distance
    }

    getShaderCode() {
        return `
            // --- Perspective Projection (ProjectionManager) ---
            // Projects onto w=0 hyperplane from a viewpoint on the positive W axis.
            vec3 project4Dto3D(vec4 p) {
                 // Base distance can be adjusted via constructor if needed later
                 float baseDistance = ${this.viewDistance.toFixed(2)};

                 // Modulate the effective view distance dynamically
                 // Morph strengthens/weakens perspective, audio can pulse it.
                 float dynamicDistance = baseDistance * (1.0 + u_morphFactor * 0.4 - u_audioMid * 0.35); // Increased audio effect slightly
                 dynamicDistance = max(0.2, dynamicDistance); // Ensure positive distance

                 // Perspective division factor
                 float denominator = dynamicDistance + p.w;

                 // Prevent division by zero or near-zero; clamp magnitude.
                 // If denominator is close to zero, point is near viewpoint -> scale becomes huge.
                 // A small positive clamp prevents this singularity.
                 float w_factor = dynamicDistance / max(0.1, denominator);

                 // Scale xyz by the perspective factor.
                 return p.xyz * w_factor;
            }
        `;
    }
}

// --- Orthographic Projection ---
class OrthographicProjection extends BaseProjection {
    getShaderCode() {
        return `
            // --- Orthographic Projection (ProjectionManager) ---
            // Primarily drops the w coordinate, but allows blending towards perspective
            // using u_morphFactor.
            vec3 project4Dto3D(vec4 p) {
                 // Pure orthographic projection simply takes xyz components.
                 vec3 orthoP = p.xyz;

                 // Define the perspective projection to blend towards (for the mix)
                 float basePerspectiveDistance = 2.5;
                 // Perspective part can still be modulated slightly by audio for subtle effect
                 float dynamicPerspectiveDistance = basePerspectiveDistance * (1.0 - u_audioMid * 0.4);
                 dynamicPerspectiveDistance = max(0.2, dynamicPerspectiveDistance);

                 float perspDenominator = dynamicPerspectiveDistance + p.w;
                 float persp_w_factor = dynamicPerspectiveDistance / max(0.1, perspDenominator);
                 vec3 perspP = p.xyz * persp_w_factor;

                 // Blend between orthographic and the dynamic perspective using morphFactor.
                 // morphFactor = 0 -> Ortho, morphFactor = 1 -> Perspective Blend
                 float morphT = smoothstep(0.0, 1.0, u_morphFactor);

                 return mix(orthoP, perspP, morphT);
            }
        `;
    }
}

// --- Stereographic Projection ---
class StereographicProjection extends BaseProjection {
    constructor(projectionPoleW = -1.5) {
        super();
        // Ensure pole is not exactly zero
        this.baseProjectionPoleW = Math.abs(projectionPoleW) < 0.01 ? -1.0 : projectionPoleW;
    }

    getShaderCode() {
        return `
             // --- Stereographic Projection (ProjectionManager) ---
             // Projects from a 'pole' point onto the w=0 hyperplane. Conformal (preserves angles locally).
             vec3 project4Dto3D(vec4 p) {
                 float basePoleW = ${this.baseProjectionPoleW.toFixed(2)};
                 // Modulate pole position slightly with audio for warping effect
                 float dynamicPoleW = basePoleW + u_audioHigh * 0.4 * sign(basePoleW); // High freq warp
                 dynamicPoleW = sign(dynamicPoleW) * max(0.1, abs(dynamicPoleW)); // Prevent zero pole

                 // Scaling factor derived from similar triangles: scale = (-poleW) / (p.w - poleW)
                 float denominator = p.w - dynamicPoleW;

                 vec3 projectedP;
                 // Avoid division by zero/near-zero, prevents extreme scaling artifacts when p.w approaches poleW.
                 float epsilon = 0.001;
                 if (abs(denominator) < epsilon) {
                      // Point is near the projection pole; map to a point "at infinity" (large magnitude)
                      // Normalize prevents issues if p.xyz is zero, then scale significantly.
                      projectedP = normalize(p.xyz + vec3(epsilon)) * 1000.0; // Add epsilon to handle zero vector
                 } else {
                    float scale = (-dynamicPoleW) / denominator; // Standard stereographic scaling
                    projectedP = p.xyz * scale;
                 }

                 // Allow morphFactor to blend towards orthographic (p.xyz) to soften stereographic extremes.
                 // 0.0 -> Stereographic, 0.8 -> Orthographic (limits morph effect)
                 float morphT = smoothstep(0.0, 1.0, u_morphFactor * 0.8);
                 vec3 orthoP = p.xyz; // The orthographic position

                 return mix(projectedP, orthoP, morphT);
             }
         `;
    }
}


// --- Projection Manager Class ---
class ProjectionManager {
    constructor(options = {}) {
        this.options = { defaultProjection: 'perspective', ...options };
        this.projections = {};
        this._initProjections();
    }

    _initProjections() {
        this.registerProjection('perspective', new PerspectiveProjection());
        this.registerProjection('orthographic', new OrthographicProjection());
        this.registerProjection('stereographic', new StereographicProjection());
        // Register new projections here
    }

    registerProjection(name, projectionInstance) {
         const lowerCaseName = name.toLowerCase();
         if (!(projectionInstance instanceof BaseProjection)) {
            console.error(`ProjectionManager: Invalid projection object for '${lowerCaseName}'. Must inherit from BaseProjection.`);
            return;
        }
         if (this.projections[lowerCaseName]) {
             console.warn(`ProjectionManager: Overwriting projection '${lowerCaseName}'.`);
         }
        this.projections[lowerCaseName] = projectionInstance;
    }

    getProjection(name) {
        const lowerCaseName = name ? name.toLowerCase() : this.options.defaultProjection;
        const projection = this.projections[lowerCaseName];
        if (!projection) {
            console.warn(`ProjectionManager: Projection '${name}' not found. Using default '${this.options.defaultProjection}'.`);
            return this.projections[this.options.defaultProjection.toLowerCase()];
        }
        return projection;
    }

    getProjectionTypes() {
        return Object.keys(this.projections);
    }
}

// Export classes
export { ProjectionManager, BaseProjection, PerspectiveProjection, OrthographicProjection, StereographicProjection };
export default ProjectionManager;