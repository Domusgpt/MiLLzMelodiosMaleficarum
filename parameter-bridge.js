/**
 * ParameterBridge.js - Unified parameter system with visualization mapping
 * 
 * Provides a central parameter management system that bridges audio parameters
 * with their visualization counterparts, ensuring synchronized state.
 */

export class ParameterBridge {
    /**
     * Creates a new ParameterBridge instance
     * @param {AudioEngine} engine - Reference to the parent audio engine
     */
    constructor(engine) {
        this.engine = engine;
        
        // Parameter storage by module
        this.parameters = new Map(); // moduleId -> Map(paramId -> paramData)
        
        // Parameter metadata - describes parameters and their visual mappings
        this.parameterMetadata = new Map(); // moduleId.paramId -> metadata
        
        // Visual parameter mappings
        this.visualMappings = new Map(); // visual param name -> { sources: [{moduleId, paramId, transform}] }
        
        // Change listeners for parameter updates
        this.changeListeners = new Map(); // moduleId.paramId -> Set(callbacks)
        
        // Update cycle tracking
        this.updateCallbacks = new Map(); // id -> callback
        this.nextUpdateId = 1;
        this.isUpdateScheduled = false;
        this.lastUpdateTime = 0;
        
        // Track whether parameter changes should trigger updates
        this.batchUpdates = false;
        this.pendingUpdates = new Set(); // Set of changed parameters during batch update
    }
    
    /**
     * Register a module's parameters
     * @param {String} moduleId - ID of the module
     * @param {Object} initialParams - Initial parameter values
     * @param {Object} metadata - Parameter metadata including visual mappings
     */
    registerModuleParameters(moduleId, initialParams = {}, metadata = {}) {
        // Create module parameter map if it doesn't exist
        if (!this.parameters.has(moduleId)) {
            this.parameters.set(moduleId, new Map());
        }
        
        const moduleParams = this.parameters.get(moduleId);
        
        // Register each parameter with its initial value and metadata
        for (const [paramId, paramValue] of Object.entries(initialParams)) {
            moduleParams.set(paramId, paramValue);
            
            // Register parameter metadata if provided
            const paramKey = `${moduleId}.${paramId}`;
            if (metadata[paramId]) {
                this.parameterMetadata.set(paramKey, metadata[paramId]);
                
                // Set up visual mappings if specified
                if (metadata[paramId].visualMappings) {
                    this._registerVisualMappings(moduleId, paramId, metadata[paramId].visualMappings);
                }
            }
        }
        
        console.log(`ParameterBridge: Registered parameters for module '${moduleId}'`);
    }
    
    /**
     * Register visual mappings for a parameter
     * @param {String} moduleId - ID of the source module
     * @param {String} paramId - ID of the source parameter
     * @param {Array|Object} mappings - Visual mapping configuration
     * @private
     */
    _registerVisualMappings(moduleId, paramId, mappings) {
        // Handle both array and single mapping
        const mappingArray = Array.isArray(mappings) ? mappings : [mappings];
        
        for (const mapping of mappingArray) {
            const { visualParam, transform } = mapping;
            
            // Create visual parameter entry if it doesn't exist
            if (!this.visualMappings.has(visualParam)) {
                this.visualMappings.set(visualParam, { sources: [] });
            }
            
            // Add this parameter as a source for the visual parameter
            const visualMapping = this.visualMappings.get(visualParam);
            visualMapping.sources.push({
                moduleId,
                paramId,
                transform: transform || (val => val) // Default to identity transform
            });
            
            console.log(`ParameterBridge: Mapped ${moduleId}.${paramId} -> visual.${visualParam}`);
        }
    }
    
    /**
     * Set a parameter value
     * @param {String} moduleId - ID of the module
     * @param {String} paramId - ID of the parameter
     * @param {*} value - New parameter value
     * @param {Object} options - Options for parameter setting
     * @param {Boolean} options.notifyListeners - Whether to notify listeners (default: true)
     * @param {Boolean} options.applyVisualMappings - Whether to apply visual mappings (default: true)
     */
    setParameter(moduleId, paramId, value, options = {}) {
        const opts = {
            notifyListeners: true,
            applyVisualMappings: true,
            ...options
        };
        
        // Validate the module and parameter exist
        if (!this.parameters.has(moduleId)) {
            console.warn(`ParameterBridge: Unknown module '${moduleId}'`);
            return false;
        }
        
        const moduleParams = this.parameters.get(moduleId);
        
        // Check if parameter exists and value is different
        const currentValue = moduleParams.get(paramId);
        const hasChanged = currentValue === undefined || !this._areValuesEqual(currentValue, value);
        
        if (hasChanged) {
            // Update the parameter value
            moduleParams.set(paramId, value);
            
            // Track updates for batch processing
            if (this.batchUpdates) {
                this.pendingUpdates.add(`${moduleId}.${paramId}`);
            } else if (opts.notifyListeners) {
                this._notifyParameterListeners(moduleId, paramId, value);
            }
            
            // Apply visual mappings if requested
            if (opts.applyVisualMappings) {
                this._updateVisualMappings();
            }
            
            // Schedule update if not already scheduled
            if (!this.isUpdateScheduled && this.updateCallbacks.size > 0) {
                this._scheduleUpdate();
            }
            
            return true;
        }
        
        return false; // No change
    }
    
    /**
     * Get a parameter value
     * @param {String} moduleId - ID of the module
     * @param {String} paramId - ID of the parameter
     * @returns {*} Parameter value or undefined if not found
     */
    getParameter(moduleId, paramId) {
        const moduleParams = this.parameters.get(moduleId);
        
        if (!moduleParams) {
            return undefined;
        }
        
        return moduleParams.get(paramId);
    }
    
    /**
     * Get all parameters for a module
     * @param {String} moduleId - ID of the module
     * @returns {Object|null} Object with parameter values or null if module not found
     */
    getAllParameters(moduleId) {
        const moduleParams = this.parameters.get(moduleId);
        
        if (!moduleParams) {
            return null;
        }
        
        // Convert Map to plain object
        const result = {};
        for (const [paramId, value] of moduleParams.entries()) {
            result[paramId] = value;
        }
        
        return result;
    }
    
    /**
     * Get all parameters in the system
     * @returns {Object} Object with all parameters organized by module
     */
    getAllParametersFlat() {
        const result = {};
        
        for (const [moduleId, moduleParams] of this.parameters.entries()) {
            for (const [paramId, value] of moduleParams.entries()) {
                result[`${moduleId}.${paramId}`] = value;
            }
        }
        
        return result;
    }
    
    /**
     * Calculate the current value of a visual parameter based on its mappings
     * @param {String} visualParam - Name of the visual parameter
     * @returns {*} Calculated visual parameter value or null if not found
     */
    getVisualParameter(visualParam) {
        const mapping = this.visualMappings.get(visualParam);
        
        if (!mapping || !mapping.sources || mapping.sources.length === 0) {
            return null;
        }
        
        // Start with 0 for additive combination of sources
        let result = 0;
        
        for (const source of mapping.sources) {
            const { moduleId, paramId, transform } = source;
            const paramValue = this.getParameter(moduleId, paramId);
            
            if (paramValue !== undefined) {
                // Apply transform and add to result
                result += transform(paramValue);
            }
        }
        
        return result;
    }
    
    /**
     * Get all visual parameters as a flat object
     * @returns {Object} Object with all visual parameter values
     */
    getAllVisualParameters() {
        const result = {};
        
        for (const visualParam of this.visualMappings.keys()) {
            result[visualParam] = this.getVisualParameter(visualParam);
        }
        
        return result;
    }
    
    /**
     * Begin a batch update (multiple parameter changes as one operation)
     */
    beginBatchUpdate() {
        this.batchUpdates = true;
        this.pendingUpdates.clear();
    }
    
    /**
     * End a batch update and apply all pending changes
     */
    endBatchUpdate() {
        this.batchUpdates = false;
        
        // Process all pending updates
        for (const paramKey of this.pendingUpdates) {
            const [moduleId, paramId] = paramKey.split('.');
            const value = this.getParameter(moduleId, paramId);
            
            this._notifyParameterListeners(moduleId, paramId, value);
        }
        
        // Update visual mappings once for all changes
        this._updateVisualMappings();
        
        // Clear pending updates
        this.pendingUpdates.clear();
        
        // Schedule update if needed
        if (this.updateCallbacks.size > 0) {
            this._scheduleUpdate();
        }
    }
    
    /**
     * Add a listener for parameter changes
     * @param {String} moduleId - ID of the module
     * @param {String} paramId - ID of the parameter
     * @param {Function} callback - Callback function(value, metadata)
     * @returns {Function} Function to remove the listener
     */
    addParameterListener(moduleId, paramId, callback) {
        const paramKey = `${moduleId}.${paramId}`;
        
        if (!this.changeListeners.has(paramKey)) {
            this.changeListeners.set(paramKey, new Set());
        }
        
        const listeners = this.changeListeners.get(paramKey);
        listeners.add(callback);
        
        // Return function to remove the listener
        return () => {
            listeners.delete(callback);
            
            if (listeners.size === 0) {
                this.changeListeners.delete(paramKey);
            }
        };
    }
    
    /**
     * Notify listeners about a parameter change
     * @param {String} moduleId - ID of the module
     * @param {String} paramId - ID of the parameter
     * @param {*} value - New parameter value
     * @private
     */
    _notifyParameterListeners(moduleId, paramId, value) {
        const paramKey = `${moduleId}.${paramId}`;
        const listeners = this.changeListeners.get(paramKey);
        
        if (!listeners) {
            return;
        }
        
        const metadata = this.parameterMetadata.get(paramKey);
        
        // Call all listeners with the new value and metadata
        for (const callback of listeners) {
            try {
                callback(value, metadata);
            } catch (error) {
                console.error(`Error in parameter listener for ${paramKey}:`, error);
            }
        }
    }
    
    /**
     * Update visual mappings based on current parameter values
     * @private
     */
    _updateVisualMappings() {
        // This would typically update a cache of visual parameter values
        // or notify visualization systems about changes
        
        // For now, we'll just ensure an update cycle is scheduled
        if (this.updateCallbacks.size > 0 && !this.isUpdateScheduled) {
            this._scheduleUpdate();
        }
    }
    
    /**
     * Schedule an update cycle
     * @private
     */
    _scheduleUpdate() {
        if (this.isUpdateScheduled) {
            return;
        }
        
        this.isUpdateScheduled = true;
        
        requestAnimationFrame(() => {
            this._processUpdate();
        });
    }
    
    /**
     * Process an update cycle, calling all registered update callbacks
     * @private
     */
    _processUpdate() {
        this.isUpdateScheduled = false;
        this.lastUpdateTime = performance.now();
        
        // Calculate all visual parameters
        const visualParams = this.getAllVisualParameters();
        
        // Call all update callbacks with visual parameters
        for (const callback of this.updateCallbacks.values()) {
            try {
                callback(visualParams);
            } catch (error) {
                console.error("Error in update callback:", error);
            }
        }
    }
    
    /**
     * Register a callback to be called on each update cycle
     * @param {Function} callback - Function to call on update with visual parameters
     * @returns {Number} ID for the callback (used to unregister)
     */
    registerUpdateCallback(callback) {
        const id = this.nextUpdateId++;
        this.updateCallbacks.set(id, callback);
        
        // Schedule an immediate update if this is the first callback
        if (this.updateCallbacks.size === 1 && !this.isUpdateScheduled) {
            this._scheduleUpdate();
        }
        
        return id;
    }
    
    /**
     * Unregister an update callback
     * @param {Number} id - Callback ID to remove
     */
    unregisterUpdateCallback(id) {
        this.updateCallbacks.delete(id);
    }
    
    /**
     * Check if two parameter values are equal
     * Handles special cases like arrays and objects
     * @param {*} a - First value
     * @param {*} b - Second value
     * @returns {Boolean} Whether the values are equal
     * @private
     */
    _areValuesEqual(a, b) {
        // Handle arrays
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                return false;
            }
            
            for (let i = 0; i < a.length; i++) {
                if (!this._areValuesEqual(a[i], b[i])) {
                    return false;
                }
            }
            
            return true;
        }
        
        // Handle objects
        if (a && typeof a === 'object' && b && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            
            if (keysA.length !== keysB.length) {
                return false;
            }
            
            for (const key of keysA) {
                if (!b.hasOwnProperty(key) || !this._areValuesEqual(a[key], b[key])) {
                    return false;
                }
            }
            
            return true;
        }
        
        // Handle primitive values
        return a === b;
    }
    
    /**
     * Dispose of all resources and clear registrations
     */
    dispose() {
        // Clear all maps and listeners
        this.parameters.clear();
        this.parameterMetadata.clear();
        this.visualMappings.clear();
        this.changeListeners.clear();
        this.updateCallbacks.clear();
        this.pendingUpdates.clear();
        
        // Reset state
        this.isUpdateScheduled = false;
        this.batchUpdates = false;
        
        console.log("ParameterBridge: Disposed");
    }
}
