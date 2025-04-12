/* core/GeometryManager.js - v1.3 L */

/**
 * Manages different types of geometric structures (e.g., Hypercube, Hypersphere)
 * and provides GLSL code snippets representing them for use in shaders.
 * Ensures uniform names used in GLSL match those set by HypercubeCore.
 */

// --- Base Geometry Class ---
class BaseGeometry {
    constructor() {}
    /**
     * Returns GLSL code defining: `float calculateLattice(vec3 p)`
     * Uses uniforms: u_dimension, u_time, u_morphFactor, u_gridDensity,
     * u_universeModifier, u_audioBass, u_audioMid, u_audioHigh, u_rotationSpeed,
     * and the function `project4Dto3D(vec4 p)`.
     * @returns {string} GLSL code snippet.
     */
    getShaderCode() { throw new Error(`getShaderCode() must be implemented by geometry subclass.`); }
}

// --- Hypercube Geometry ---
class HypercubeGeometry extends BaseGeometry {
    getShaderCode() {
        return `
            // --- Hypercube Lattice Calculation (GeometryManager) ---
            float calculateLattice(vec3 p) {
                // Grid density pulses with bass
                float dynamicGridDensity = max(0.1, u_gridDensity * (1.0 + u_audioBass * 0.6)); // Slightly increased bass effect
                float lineThickness = 0.045; // Slightly thinner lines

                // Base 3D lattice
                vec3 p_grid3D = fract(p * dynamicGridDensity * 0.5);
                vec3 dist3D = abs(p_grid3D - 0.5);
                float box3D = max(dist3D.x, max(dist3D.y, dist3D.z));
                float lattice3D = smoothstep(0.5, 0.5 - lineThickness, box3D);

                // 4D Calculation & Projection (Blends based on u_dimension)
                float finalLattice = lattice3D;
                float dim_factor = smoothstep(3.0, 3.9, u_dimension); // Smooth transition 3D -> 4D

                if (dim_factor > 0.01) {
                    // Define w-coordinate using various inputs
                    float w_coord = sin(p.x*1.4 - p.y*0.7 + p.z*1.5 + u_time * 0.25)
                                  * cos(length(p) * 1.1 - u_time * 0.35 + u_audioMid * 2.0)
                                  * dim_factor
                                  * (0.4 + u_morphFactor * 0.6 + u_audioHigh * 0.5); // Morph & Highs affect amplitude

                    vec4 p4d = vec4(p, w_coord);

                    // Apply multiple 4D rotations driven by time, speed, audio, morph
                    float baseSpeed = u_rotationSpeed * 1.0;
                    float time_rot1 = u_time * 0.33 * baseSpeed + u_audioHigh * 0.18 + u_morphFactor * 0.45;
                    float time_rot2 = u_time * 0.28 * baseSpeed - u_audioMid * 0.22;
                    float time_rot3 = u_time * 0.25 * baseSpeed + u_audioBass * 0.28;

                    // Combined rotations (order defines the resulting complex rotation)
                    p4d = rotXW(time_rot1) * rotYZ(time_rot2 * 1.1) * rotZW(time_rot3 * 0.9) * p4d;
                    p4d = rotYW(u_time * -0.22 * baseSpeed + u_morphFactor * 0.2) * p4d; // Morph influences this rotation too

                    // Project the rotated 4D point back to 3D
                    vec3 projectedP = project4Dto3D(p4d);

                    // Calculate lattice for the projected 3D position
                    vec3 p_grid4D_proj = fract(projectedP * dynamicGridDensity * 0.5);
                    vec3 dist4D_proj = abs(p_grid4D_proj - 0.5);
                    float box4D_proj = max(dist4D_proj.x, max(dist4D_proj.y, dist4D_proj.z));
                    float lattice4D_proj = smoothstep(0.5, 0.5 - lineThickness, box4D_proj);

                    // Blend based on morphFactor (already smoothed in HypercubeCore usually)
                    finalLattice = mix(lattice3D, lattice4D_proj, u_morphFactor);
                }

                // Apply universe modifier (spatial compression/expansion)
                // pow() enhances contrast; ensure modifier is positive.
                // Modifier > 1 expands space (finer lattice), < 1 compresses (thicker lattice).
                return pow(finalLattice, 1.0 / max(0.1, u_universeModifier));
            }
        `;
    }
}

// --- Hypersphere Geometry ---
class HypersphereGeometry extends BaseGeometry {
    getShaderCode() {
        return `
            // --- Hypersphere Lattice Calculation (GeometryManager) ---
            float calculateLattice(vec3 p) {
                 float radius3D = length(p);
                 float densityFactor = max(0.1, u_gridDensity * 0.7); // Density scales shell frequency
                 float shellWidth = 0.025 + u_audioBass * 0.04; // Bass affects shell thickness
                 float phase = radius3D * densityFactor * 6.28318 - u_time * 0.65 + u_audioMid * 2.8; // Mid freqs affect phase shift
                 float shells3D = 0.5 + 0.5 * sin(phase);
                 shells3D = smoothstep(1.0 - shellWidth, 1.0, shells3D); // Sharpen sine into shells

                // 4D Calculation & Projection
                float finalLattice = shells3D;
                float dim_factor = smoothstep(3.0, 3.9, u_dimension);

                if (dim_factor > 0.01) {
                     float w_coord = cos(radius3D * 2.5 - u_time * 0.55)
                                   * sin(p.x*1.0 + p.y*1.3 - p.z*0.7 + u_time*0.2)
                                   * dim_factor
                                   * (0.5 + u_morphFactor * 0.5 + u_audioHigh * 0.4); // Morph/Highs affect amplitude

                    vec4 p4d = vec4(p, w_coord);

                     float baseSpeed = u_rotationSpeed * 0.85; // Slightly different base speed
                     float time_rot1 = u_time * 0.38 * baseSpeed + u_audioHigh * 0.15;
                     float time_rot2 = u_time * 0.31 * baseSpeed + u_morphFactor * 0.55; // Morph affects rotation
                     float time_rot3 = u_time * -0.24 * baseSpeed + u_audioBass * 0.2;

                     p4d = rotXW(time_rot1 * 1.05) * rotYZ(time_rot2) * rotYW(time_rot3 * 0.95) * p4d;

                     vec3 projectedP = project4Dto3D(p4d); // Project back to 3D

                     // Calculate shells in projected space
                     float radius4D_proj = length(projectedP);
                     float phase4D = radius4D_proj * densityFactor * 6.28318 - u_time * 0.65 + u_audioMid * 2.8;
                     float shells4D_proj = 0.5 + 0.5 * sin(phase4D);
                     shells4D_proj = smoothstep(1.0 - shellWidth, 1.0, shells4D_proj);

                     finalLattice = mix(shells3D, shells4D_proj, u_morphFactor); // Blend based on morph
                 }

                // Apply universe modifier - affects perceived radius/density/brightness
                return pow(max(0.0, finalLattice), max(0.1, u_universeModifier));
            }
        `;
    }
}

// --- Hypertetrahedron Geometry ---
class HypertetrahedronGeometry extends BaseGeometry {
    getShaderCode() {
        return `
             // --- Hypertetrahedron Lattice Calculation (Simplified Planar Grid) ---
             float calculateLattice(vec3 p) {
                 float density = max(0.1, u_gridDensity * 0.65); // Density scales grid
                 float thickness = 0.035 + u_audioBass * 0.05; // Bass affects thickness

                 // Define normalized vectors pointing to corners/face normals of a base tetrahedron
                 vec3 c1 = normalize(vec3( 1.0,  1.0,  1.0));
                 vec3 c2 = normalize(vec3(-1.0, -1.0,  1.0));
                 vec3 c3 = normalize(vec3(-1.0,  1.0, -1.0));
                 vec3 c4 = normalize(vec3( 1.0, -1.0, -1.0));

                 // Calculate position within a repeating cell (centered at origin)
                 vec3 p_mod3D = fract(p * density * 0.5 + 0.5) - 0.5; // Use +0.5 to center cell at origin

                 // Calculate signed distance to the 4 planes defining the tetrahedron cell
                 float d1 = dot(p_mod3D, c1); float d2 = dot(p_mod3D, c2);
                 float d3 = dot(p_mod3D, c3); float d4 = dot(p_mod3D, c4);
                 // Find the minimum absolute distance to any plane
                 float minDistToPlane3D = min(min(abs(d1), abs(d2)), min(abs(d3), abs(d4)));
                 // Create lines/planes using smoothstep: bright near distance 0
                 float lattice3D = 1.0 - smoothstep(0.0, thickness, minDistToPlane3D);

                 // --- 4D Calculation & Projection ---
                 float finalLattice = lattice3D;
                 float dim_factor = smoothstep(3.0, 3.9, u_dimension);

                 if (dim_factor > 0.01) {
                     float w_coord = cos(p.x*1.8 - p.y*1.5 + p.z*1.2 + u_time * 0.24)
                                   * sin(length(p)*1.4 + u_time*0.18 - u_audioMid*1.7)
                                   * dim_factor
                                   * (0.45 + u_morphFactor * 0.55 + u_audioHigh * 0.35);

                     vec4 p4d = vec4(p, w_coord);

                     float baseSpeed = u_rotationSpeed * 1.15; // Faster base speed
                     float time_rot1 = u_time * 0.28 * baseSpeed + u_audioHigh * 0.2;
                     float time_rot2 = u_time * 0.36 * baseSpeed - u_audioBass * 0.18 + u_morphFactor * 0.4;
                     float time_rot3 = u_time * 0.32 * baseSpeed + u_audioMid * 0.12;

                     p4d = rotXW(time_rot1 * 0.95) * rotYW(time_rot2 * 1.05) * rotZW(time_rot3) * p4d;

                     vec3 projectedP = project4Dto3D(p4d); // Project back to 3D

                     // Calculate tetrahedral pattern for the projected point
                     vec3 p_mod4D_proj = fract(projectedP * density * 0.5 + 0.5) - 0.5;
                     float dp1 = dot(p_mod4D_proj, c1); float dp2 = dot(p_mod4D_proj, c2);
                     float dp3 = dot(p_mod4D_proj, c3); float dp4 = dot(p_mod4D_proj, c4);
                     float minDistToPlane4D = min(min(abs(dp1), abs(dp2)), min(abs(dp3), abs(dp4)));
                     float lattice4D_proj = 1.0 - smoothstep(0.0, thickness, minDistToPlane4D);

                    finalLattice = mix(lattice3D, lattice4D_proj, u_morphFactor); // Blend based on morph
                 }

                 // Apply universe modifier
                 return pow(max(0.0, finalLattice), max(0.1, u_universeModifier));
             }
         `;
    }
}


// --- Geometry Manager Class ---
class GeometryManager {
    constructor(options = {}) {
        this.options = { defaultGeometry: 'hypercube', ...options };
        this.geometries = {};
        this._initGeometries();
    }

    _initGeometries() {
        this.registerGeometry('hypercube', new HypercubeGeometry());
        this.registerGeometry('hypersphere', new HypersphereGeometry());
        this.registerGeometry('hypertetrahedron', new HypertetrahedronGeometry());
        // Register new geometries here
    }

    registerGeometry(name, geometryInstance) {
        const lowerCaseName = name.toLowerCase();
        if (!(geometryInstance instanceof BaseGeometry)) {
            console.error(`GeometryManager: Invalid geometry object for '${lowerCaseName}'. Must inherit from BaseGeometry.`);
            return;
        }
        if (this.geometries[lowerCaseName]) {
             console.warn(`GeometryManager: Overwriting geometry '${lowerCaseName}'.`);
        }
        this.geometries[lowerCaseName] = geometryInstance;
    }

    getGeometry(name) {
        const lowerCaseName = name ? name.toLowerCase() : this.options.defaultGeometry;
        const geometry = this.geometries[lowerCaseName];
        if (!geometry) {
            console.warn(`GeometryManager: Geometry '${name}' not found. Using default '${this.options.defaultGeometry}'.`);
            return this.geometries[this.options.defaultGeometry.toLowerCase()];
        }
        return geometry;
    }

    getGeometryTypes() {
        return Object.keys(this.geometries);
    }
}

// Export classes
export { GeometryManager, BaseGeometry, HypercubeGeometry, HypersphereGeometry, HypertetrahedronGeometry };
export default GeometryManager;