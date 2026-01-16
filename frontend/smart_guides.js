/**
 * Smart Guides & Snapping System
 * Canva-style alignment guides and intelligent snapping
 */
const SmartGuides = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        snapThreshold: 8,       // Pixels to trigger snap
        guideColor: '#FF00FF',  // Magenta guides (Canva-style)
        guideWidth: 1,
        showDistances: true,
        snapToGrid: false,
        gridSize: 10,
        snapToElements: true,
        snapToCenter: true,
        snapToEdges: true
    };

    // State
    let guides = [];
    let activeElement = null;
    let canvas = null;
    let guidesContainer = null;
    let isEnabled = true;

    /**
     * Initialize smart guides for a canvas
     */
    function init(canvasElement) {
        canvas = canvasElement;

        // Check if AlignmentSystem already created a guides container
        const existingContainer = document.getElementById('smartGuidesContainer') ||
                                   canvas.querySelector('.smart-guides-container');

        if (existingContainer) {
            guidesContainer = existingContainer;
            console.log('[SmartGuides] Reusing existing guides container from AlignmentSystem');
        } else {
            // Create guides container
            guidesContainer = document.createElement('div');
            guidesContainer.className = 'smart-guides-container';
            guidesContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9999;
            `;
            canvas.style.position = 'relative';
            canvas.appendChild(guidesContainer);
        }

        // Add styles
        addStyles();

        console.log('[SmartGuides] Initialized');
    }

    /**
     * Get all snappable elements on canvas (excluding active element)
     */
    function getSnappableElements() {
        if (!canvas) return [];

        const elements = canvas.querySelectorAll('.design-element, .brochure-element, .template-element');
        return Array.from(elements).filter(el => el !== activeElement && el.offsetParent !== null);
    }

    /**
     * Calculate snap points for an element
     */
    function getElementSnapPoints(element) {
        const rect = element.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        // Convert to canvas-relative coordinates
        const left = rect.left - canvasRect.left;
        const top = rect.top - canvasRect.top;
        const right = left + rect.width;
        const bottom = top + rect.height;
        const centerX = left + rect.width / 2;
        const centerY = top + rect.height / 2;

        return {
            left,
            top,
            right,
            bottom,
            centerX,
            centerY,
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * Get canvas snap points (edges and center)
     */
    function getCanvasSnapPoints() {
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        return {
            left: 0,
            top: 0,
            right: rect.width,
            bottom: rect.height,
            centerX: rect.width / 2,
            centerY: rect.height / 2,
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * Calculate snapping for a moving element
     * Returns adjusted position and active guides
     */
    function calculateSnap(element, newX, newY) {
        if (!isEnabled || !canvas) {
            return { x: newX, y: newY, guides: [] };
        }

        activeElement = element;
        const elementRect = element.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        const elementWidth = elementRect.width;
        const elementHeight = elementRect.height;

        // Calculate element edges at new position
        const elementLeft = newX;
        const elementTop = newY;
        const elementRight = newX + elementWidth;
        const elementBottom = newY + elementHeight;
        const elementCenterX = newX + elementWidth / 2;
        const elementCenterY = newY + elementHeight / 2;

        let snappedX = newX;
        let snappedY = newY;
        const activeGuides = [];

        // Get all snap targets
        const snapTargets = [];

        // Add canvas snap points
        const canvasPoints = getCanvasSnapPoints();
        if (canvasPoints) {
            snapTargets.push({ ...canvasPoints, type: 'canvas' });
        }

        // Add other elements as snap targets
        if (CONFIG.snapToElements) {
            const elements = getSnappableElements();
            elements.forEach(el => {
                const points = getElementSnapPoints(el);
                snapTargets.push({ ...points, type: 'element', element: el });
            });
        }

        // Check horizontal snapping (X axis)
        let xSnapped = false;
        for (const target of snapTargets) {
            if (xSnapped) break;

            // Left edge to left edge
            if (Math.abs(elementLeft - target.left) <= CONFIG.snapThreshold) {
                snappedX = target.left;
                activeGuides.push({ type: 'vertical', x: target.left, from: Math.min(elementTop, target.top), to: Math.max(elementBottom, target.bottom) });
                xSnapped = true;
            }
            // Right edge to right edge
            else if (Math.abs(elementRight - target.right) <= CONFIG.snapThreshold) {
                snappedX = target.right - elementWidth;
                activeGuides.push({ type: 'vertical', x: target.right, from: Math.min(elementTop, target.top), to: Math.max(elementBottom, target.bottom) });
                xSnapped = true;
            }
            // Left edge to right edge
            else if (Math.abs(elementLeft - target.right) <= CONFIG.snapThreshold) {
                snappedX = target.right;
                activeGuides.push({ type: 'vertical', x: target.right, from: Math.min(elementTop, target.top), to: Math.max(elementBottom, target.bottom) });
                xSnapped = true;
            }
            // Right edge to left edge
            else if (Math.abs(elementRight - target.left) <= CONFIG.snapThreshold) {
                snappedX = target.left - elementWidth;
                activeGuides.push({ type: 'vertical', x: target.left, from: Math.min(elementTop, target.top), to: Math.max(elementBottom, target.bottom) });
                xSnapped = true;
            }
            // Center to center (horizontal)
            else if (CONFIG.snapToCenter && Math.abs(elementCenterX - target.centerX) <= CONFIG.snapThreshold) {
                snappedX = target.centerX - elementWidth / 2;
                activeGuides.push({ type: 'vertical', x: target.centerX, from: 0, to: canvasPoints.height, isCenter: true });
                xSnapped = true;
            }
        }

        // Check vertical snapping (Y axis)
        let ySnapped = false;
        for (const target of snapTargets) {
            if (ySnapped) break;

            const adjustedElementTop = snappedX !== newX ? elementTop : newY;
            const adjustedElementBottom = adjustedElementTop + elementHeight;
            const adjustedElementCenterY = adjustedElementTop + elementHeight / 2;

            // Top edge to top edge
            if (Math.abs(adjustedElementTop - target.top) <= CONFIG.snapThreshold) {
                snappedY = target.top;
                activeGuides.push({ type: 'horizontal', y: target.top, from: Math.min(snappedX, target.left), to: Math.max(snappedX + elementWidth, target.right) });
                ySnapped = true;
            }
            // Bottom edge to bottom edge
            else if (Math.abs(adjustedElementBottom - target.bottom) <= CONFIG.snapThreshold) {
                snappedY = target.bottom - elementHeight;
                activeGuides.push({ type: 'horizontal', y: target.bottom, from: Math.min(snappedX, target.left), to: Math.max(snappedX + elementWidth, target.right) });
                ySnapped = true;
            }
            // Top edge to bottom edge
            else if (Math.abs(adjustedElementTop - target.bottom) <= CONFIG.snapThreshold) {
                snappedY = target.bottom;
                activeGuides.push({ type: 'horizontal', y: target.bottom, from: Math.min(snappedX, target.left), to: Math.max(snappedX + elementWidth, target.right) });
                ySnapped = true;
            }
            // Bottom edge to top edge
            else if (Math.abs(adjustedElementBottom - target.top) <= CONFIG.snapThreshold) {
                snappedY = target.top - elementHeight;
                activeGuides.push({ type: 'horizontal', y: target.top, from: Math.min(snappedX, target.left), to: Math.max(snappedX + elementWidth, target.right) });
                ySnapped = true;
            }
            // Center to center (vertical)
            else if (CONFIG.snapToCenter && Math.abs(adjustedElementCenterY - target.centerY) <= CONFIG.snapThreshold) {
                snappedY = target.centerY - elementHeight / 2;
                activeGuides.push({ type: 'horizontal', y: target.centerY, from: 0, to: canvasPoints.width, isCenter: true });
                ySnapped = true;
            }
        }

        // Grid snapping (if enabled)
        if (CONFIG.snapToGrid && !xSnapped) {
            snappedX = Math.round(newX / CONFIG.gridSize) * CONFIG.gridSize;
        }
        if (CONFIG.snapToGrid && !ySnapped) {
            snappedY = Math.round(newY / CONFIG.gridSize) * CONFIG.gridSize;
        }

        return {
            x: snappedX,
            y: snappedY,
            guides: activeGuides,
            snappedX: xSnapped,
            snappedY: ySnapped
        };
    }

    /**
     * Render guides on canvas
     */
    function renderGuides(activeGuides) {
        if (!guidesContainer) return;

        // Clear existing guides
        guidesContainer.innerHTML = '';

        if (!isEnabled || !activeGuides || activeGuides.length === 0) return;

        activeGuides.forEach(guide => {
            const guideEl = document.createElement('div');
            guideEl.className = 'smart-guide';

            if (guide.type === 'vertical') {
                guideEl.style.cssText = `
                    position: absolute;
                    left: ${guide.x}px;
                    top: ${guide.from}px;
                    width: ${CONFIG.guideWidth}px;
                    height: ${guide.to - guide.from}px;
                    background: ${CONFIG.guideColor};
                    pointer-events: none;
                `;
                if (guide.isCenter) {
                    guideEl.style.background = `repeating-linear-gradient(to bottom, ${CONFIG.guideColor} 0px, ${CONFIG.guideColor} 4px, transparent 4px, transparent 8px)`;
                }
            } else if (guide.type === 'horizontal') {
                guideEl.style.cssText = `
                    position: absolute;
                    left: ${guide.from}px;
                    top: ${guide.y}px;
                    width: ${guide.to - guide.from}px;
                    height: ${CONFIG.guideWidth}px;
                    background: ${CONFIG.guideColor};
                    pointer-events: none;
                `;
                if (guide.isCenter) {
                    guideEl.style.background = `repeating-linear-gradient(to right, ${CONFIG.guideColor} 0px, ${CONFIG.guideColor} 4px, transparent 4px, transparent 8px)`;
                }
            }

            guidesContainer.appendChild(guideEl);
        });
    }

    /**
     * Clear all guides
     */
    function clearGuides() {
        if (guidesContainer) {
            guidesContainer.innerHTML = '';
        }
        activeElement = null;
    }

    /**
     * Enable/disable smart guides
     */
    function setEnabled(enabled) {
        isEnabled = enabled;
        if (!enabled) clearGuides();
    }

    /**
     * Update configuration
     */
    function setConfig(newConfig) {
        Object.assign(CONFIG, newConfig);
    }

    /**
     * Add CSS styles
     */
    function addStyles() {
        if (document.getElementById('smart-guides-styles')) return;

        const style = document.createElement('style');
        style.id = 'smart-guides-styles';
        style.textContent = `
            .smart-guides-container {
                overflow: hidden;
            }

            .smart-guide {
                transition: opacity 0.1s ease;
            }

            .smart-guide::before,
            .smart-guide::after {
                content: '';
                position: absolute;
                background: ${CONFIG.guideColor};
            }

            /* Distance indicators */
            .distance-indicator {
                position: absolute;
                background: ${CONFIG.guideColor};
                color: white;
                font-size: 10px;
                padding: 2px 4px;
                border-radius: 2px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Get spacing between two elements
     */
    function getSpacing(element1, element2) {
        const rect1 = element1.getBoundingClientRect();
        const rect2 = element2.getBoundingClientRect();

        const horizontal = Math.max(0, Math.max(rect1.left, rect2.left) - Math.min(rect1.right, rect2.right));
        const vertical = Math.max(0, Math.max(rect1.top, rect2.top) - Math.min(rect1.bottom, rect2.bottom));

        return { horizontal, vertical };
    }

    /**
     * Align selected element to canvas
     */
    function alignToCanvas(element, alignment) {
        if (!canvas || !element) return;

        const canvasRect = canvas.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        let newX = parseFloat(element.style.left) || 0;
        let newY = parseFloat(element.style.top) || 0;

        switch (alignment) {
            case 'left':
                newX = 0;
                break;
            case 'center-h':
                newX = (canvasRect.width - elementRect.width) / 2;
                break;
            case 'right':
                newX = canvasRect.width - elementRect.width;
                break;
            case 'top':
                newY = 0;
                break;
            case 'center-v':
                newY = (canvasRect.height - elementRect.height) / 2;
                break;
            case 'bottom':
                newY = canvasRect.height - elementRect.height;
                break;
            case 'center':
                newX = (canvasRect.width - elementRect.width) / 2;
                newY = (canvasRect.height - elementRect.height) / 2;
                break;
        }

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;

        return { x: newX, y: newY };
    }

    /**
     * Distribute elements evenly
     */
    function distributeElements(elements, direction) {
        if (!elements || elements.length < 3) return;

        const sorted = [...elements].sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return direction === 'horizontal' ? rectA.left - rectB.left : rectA.top - rectB.top;
        });

        const first = sorted[0].getBoundingClientRect();
        const last = sorted[sorted.length - 1].getBoundingClientRect();

        if (direction === 'horizontal') {
            const totalWidth = sorted.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
            const availableSpace = last.right - first.left - totalWidth;
            const gap = availableSpace / (sorted.length - 1);

            let currentX = first.left;
            sorted.forEach((el, i) => {
                if (i === 0) {
                    currentX = first.left + el.getBoundingClientRect().width + gap;
                    return;
                }
                if (i === sorted.length - 1) return;

                const rect = el.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                el.style.left = `${currentX - canvasRect.left}px`;
                currentX += rect.width + gap;
            });
        } else {
            const totalHeight = sorted.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
            const availableSpace = last.bottom - first.top - totalHeight;
            const gap = availableSpace / (sorted.length - 1);

            let currentY = first.top;
            sorted.forEach((el, i) => {
                if (i === 0) {
                    currentY = first.top + el.getBoundingClientRect().height + gap;
                    return;
                }
                if (i === sorted.length - 1) return;

                const rect = el.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                el.style.top = `${currentY - canvasRect.top}px`;
                currentY += rect.height + gap;
            });
        }
    }

    // Initialize on load
    console.log('[SmartGuides] Module loaded');

    // Public API
    return {
        init,
        calculateSnap,
        renderGuides,
        clearGuides,
        setEnabled,
        setConfig,
        alignToCanvas,
        distributeElements,
        getSpacing,
        CONFIG,
        isLoaded: true
    };
})();

// Global export
window.SmartGuides = SmartGuides;
