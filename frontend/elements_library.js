// ============================================================================
// ELEMENTS LIBRARY
// Shapes, icons, and element management for brochure editor
// Uses expanded SHAPES_LIBRARY and ICONS_LIBRARY from elements_library_v2.js
// ============================================================================

(function() {
    'use strict';

    // ========================================================================
    // PANEL RENDERING - Canva-style with tabs, categories, and search
    // ========================================================================

    let renderRetryCount = 0;
    const MAX_RENDER_RETRIES = 5;

    function renderElementsPanel() {
        // Target the specific wrapper, NOT the whole elementsPanel
        // This preserves prebuiltSectionsContainer and textEffectsPanelContainer
        const container = document.getElementById('elementsLibraryContent');
        if (!container) {
            console.warn('Elements library content container not found');
            return;
        }

        // Dynamically reference the V2 libraries each time (fixes timing issues)
        const REAL_ESTATE_ICONS = window.ICONS_LIBRARY || {};
        const SHAPES = window.SHAPES_LIBRARY || {};
        const getShapeCategories = window.getShapesByCategory || (() => ({}));
        const getIconCategories = window.getIconsByCategory || (() => ({}));

        const shapeCategories = getShapeCategories();
        const iconCategories = getIconCategories();

        // If libraries not loaded yet, retry after a short delay
        if (Object.keys(shapeCategories).length === 0 && renderRetryCount < MAX_RENDER_RETRIES) {
            renderRetryCount++;
            console.log(`[Elements] V2 library not ready, retry ${renderRetryCount}/${MAX_RENDER_RETRIES}...`);
            setTimeout(renderElementsPanel, 200);
            return;
        }
        renderRetryCount = 0; // Reset counter on success

        // Render shapes by category
        function renderShapeCategories() {
            if (!shapeCategories || Object.keys(shapeCategories).length === 0) {
                return `<p class="no-items">Loading shapes...</p>`;
            }
            return Object.entries(shapeCategories).map(([category, shapes]) => `
                <div class="element-category" data-category="${category}">
                    <h5 class="category-title">${category.charAt(0).toUpperCase() + category.slice(1)}</h5>
                    <div class="elements-grid shapes-grid">
                        ${shapes.map(shape => `
                            <div class="element-item shape-item"
                                 data-element-type="shape"
                                 data-shape-type="${shape.id}"
                                 draggable="true"
                                 title="${shape.name}">
                                ${shape.svg}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }

        // Render icons by category
        function renderIconCategories() {
            if (!iconCategories || Object.keys(iconCategories).length === 0) {
                return `<p class="no-items">Loading icons...</p>`;
            }
            return Object.entries(iconCategories).map(([category, icons]) => `
                <div class="element-category" data-category="${category}">
                    <h5 class="category-title">${category.charAt(0).toUpperCase() + category.slice(1)}</h5>
                    <div class="elements-grid icons-grid">
                        ${icons.map(icon => `
                            <div class="element-item icon-item"
                                 data-element-type="icon"
                                 data-icon-type="${icon.id}"
                                 draggable="true"
                                 title="${icon.name}">
                                ${icon.svg}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }

        container.innerHTML = `
            <div class="elements-panel-content">
                <!-- Tabs for Shapes/Icons -->
                <div class="elements-tabs">
                    <button class="elements-tab active" data-tab="shapes">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                        </svg>
                        Shapes
                    </button>
                    <button class="elements-tab" data-tab="icons">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="16"/>
                            <line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                        Icons
                    </button>
                    <button class="elements-tab" data-tab="qrcode">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                        </svg>
                        QR
                    </button>
                </div>

                <!-- Search Bar -->
                <div class="elements-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="elementsSearchInput" placeholder="Search elements...">
                </div>

                <!-- Shapes Tab Content -->
                <div class="elements-tab-content active" id="shapes-content">
                    ${renderShapeCategories()}
                </div>

                <!-- Icons Tab Content -->
                <div class="elements-tab-content" id="icons-content">
                    ${renderIconCategories()}
                </div>

                <!-- QR Code Tab Content -->
                <div class="elements-tab-content" id="qrcode-content">
                    <div class="qr-section">
                        <div class="qr-preview">
                            <svg viewBox="0 0 100 100" width="80" height="80">
                                <rect x="0" y="0" width="100" height="100" fill="#f0f0f0"/>
                                <rect x="10" y="10" width="25" height="25" fill="#333"/>
                                <rect x="65" y="10" width="25" height="25" fill="#333"/>
                                <rect x="10" y="65" width="25" height="25" fill="#333"/>
                                <rect x="45" y="45" width="10" height="10" fill="#333"/>
                            </svg>
                        </div>
                        <button id="addQRCodeBtn" class="action-btn primary full-width">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add QR Code
                        </button>
                        <p class="help-text">Generates a QR code linking to the property listing</p>
                    </div>
                </div>

                <!-- Color Picker for Selected Element -->
                <div class="elements-section element-properties" id="elementPropertiesSection" style="display: none;">
                    <h4 class="section-title">Element Properties</h4>
                    <div class="property-row">
                        <label>Fill Color</label>
                        <div class="color-input-group">
                            <input type="color" id="elementFillColor" value="#C20430">
                            <input type="text" id="elementFillColorHex" value="#C20430" maxlength="7">
                        </div>
                    </div>
                    <div class="property-row">
                        <label>Stroke Color</label>
                        <div class="color-input-group">
                            <input type="color" id="elementStrokeColor" value="#000000">
                            <input type="text" id="elementStrokeColorHex" value="#000000" maxlength="7">
                        </div>
                    </div>
                    <div class="property-row">
                        <label>Stroke Width</label>
                        <input type="range" id="elementStrokeWidth" min="0" max="10" value="0" step="1">
                        <span id="elementStrokeWidthValue">0px</span>
                    </div>
                    <div class="property-row">
                        <label>Opacity</label>
                        <input type="range" id="elementOpacity" min="0" max="100" value="100" step="5">
                        <span id="elementOpacityValue">100%</span>
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners
        attachElementsLibraryListeners();
    }

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    function attachElementsLibraryListeners() {
        const panel = document.getElementById('elementsPanel');
        if (!panel) return;

        // Tab switching
        panel.querySelectorAll('.elements-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                panel.querySelectorAll('.elements-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show corresponding content
                const tabName = tab.dataset.tab;
                panel.querySelectorAll('.elements-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const targetContent = panel.querySelector(`#${tabName}-content`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });

        // Search functionality
        const searchInput = panel.querySelector('#elementsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                // Search in visible tab
                const activeContent = panel.querySelector('.elements-tab-content.active');
                if (activeContent) {
                    activeContent.querySelectorAll('.element-item').forEach(item => {
                        const name = item.title.toLowerCase();
                        item.style.display = !term || name.includes(term) ? 'flex' : 'none';
                    });
                    // Show/hide empty categories
                    activeContent.querySelectorAll('.element-category').forEach(cat => {
                        const visibleItems = cat.querySelectorAll('.element-item[style*="flex"], .element-item:not([style*="display"])');
                        cat.style.display = visibleItems.length > 0 ? 'block' : 'none';
                    });
                }
            });
        }

        // Drag start for shapes and icons
        panel.querySelectorAll('.element-item').forEach(item => {
            item.addEventListener('dragstart', handleLibraryDragStart);
            item.addEventListener('click', handleLibraryItemClick);
        });

        // QR Code button
        const qrBtn = document.getElementById('addQRCodeBtn');
        if (qrBtn) {
            qrBtn.addEventListener('click', addQRCodeToCurrentPage);
        }

        // Property controls
        attachPropertyListeners();

        // Set up canvas drop zone
        setupCanvasDropZone();
    }

    function handleLibraryDragStart(event) {
        const item = event.target.closest('.element-item');
        if (!item) {
            console.warn('[Drag] No element-item found');
            return;
        }

        const elementType = item.dataset.elementType;
        const shapeType = item.dataset.shapeType || '';
        const iconType = item.dataset.iconType || '';

        console.log('[Drag] Starting drag:', { elementType, shapeType, iconType });

        // Set drag data
        const dragData = JSON.stringify({
            elementType,
            shapeType,
            iconType,
            source: 'elements-library'
        });

        event.dataTransfer.setData('text/plain', dragData);
        event.dataTransfer.setData('application/json', dragData);
        event.dataTransfer.effectAllowed = 'copy';

        // Create drag image (clone of the SVG)
        const svg = item.querySelector('svg');
        if (svg) {
            const dragImage = svg.cloneNode(true);
            dragImage.style.width = '50px';
            dragImage.style.height = '50px';
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-1000px';
            document.body.appendChild(dragImage);
            event.dataTransfer.setDragImage(dragImage, 25, 25);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        }

        // Add visual feedback
        item.classList.add('dragging');
        setTimeout(() => item.classList.remove('dragging'), 100);
    }

    function handleLibraryItemClick(event) {
        const item = event.target.closest('.element-item');
        if (!item) return;

        // Add element to center of current page
        const elementType = item.dataset.elementType;
        const shapeType = item.dataset.shapeType || '';
        const iconType = item.dataset.iconType || '';

        addElementToCurrentPage(elementType, shapeType, iconType);
    }

    function setupCanvasDropZone() {
        const canvas = document.getElementById('brochureCanvas');
        if (!canvas) {
            console.warn('[Drop Zone] Canvas not found, will retry...');
            // Retry after a delay in case canvas loads later
            setTimeout(setupCanvasDropZone, 1000);
            return;
        }

        console.log('[Drop Zone] Setting up canvas drop zone');

        // Remove any existing listeners first (prevent duplicates)
        canvas.removeEventListener('dragover', handleCanvasDragOver);
        canvas.removeEventListener('dragleave', handleCanvasDragLeave);
        canvas.removeEventListener('drop', handleCanvasDrop);

        // Add new listeners
        canvas.addEventListener('dragover', handleCanvasDragOver);
        canvas.addEventListener('dragleave', handleCanvasDragLeave);
        canvas.addEventListener('drop', handleCanvasDrop);

        console.log('[Drop Zone] Canvas drop zone ready');
    }

    function handleCanvasDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';

        // Highlight drop target
        const page = e.target.closest('.brochure-page');
        if (page) {
            // Remove highlight from other pages
            document.querySelectorAll('.brochure-page.drop-target').forEach(p => {
                if (p !== page) p.classList.remove('drop-target');
            });
            page.classList.add('drop-target');
        }
    }

    function handleCanvasDragLeave(e) {
        // Only remove highlight if we're actually leaving the page
        const page = e.target.closest('.brochure-page');
        const relatedPage = e.relatedTarget?.closest('.brochure-page');

        if (page && page !== relatedPage) {
            page.classList.remove('drop-target');
        }
    }

    function handleCanvasDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        console.log('[Drop] Drop event received');

        // Remove all highlights
        document.querySelectorAll('.brochure-page.drop-target').forEach(p => {
            p.classList.remove('drop-target');
        });

        // Get drop data - try both formats
        let data;
        try {
            const jsonData = e.dataTransfer.getData('application/json') ||
                           e.dataTransfer.getData('text/plain');
            if (!jsonData) {
                console.warn('[Drop] No drag data found');
                return;
            }
            data = JSON.parse(jsonData);
            console.log('[Drop] Parsed data:', data);
        } catch (err) {
            console.warn('[Drop] Failed to parse drag data:', err);
            return;
        }

        if (!data.elementType) {
            console.warn('[Drop] No element type in data');
            return;
        }

        // Find which page was dropped on
        const page = e.target.closest('.brochure-page');
        if (!page) {
            console.warn('[Drop] No page found at drop location');
            // Try to find the first page as fallback
            const firstPage = document.querySelector('.brochure-page');
            if (!firstPage) {
                console.error('[Drop] No pages available');
                return;
            }
            console.log('[Drop] Using first page as fallback');
        }

        const targetPage = page || document.querySelector('.brochure-page');
        const pageId = targetPage.dataset.pageId;
        const pageRect = targetPage.getBoundingClientRect();
        const zoom = getCanvasZoom();

        // Calculate drop position relative to page
        const x = Math.max(10, (e.clientX - pageRect.left) / zoom - 50);
        const y = Math.max(10, (e.clientY - pageRect.top) / zoom - 50);

        console.log('[Drop] Adding element at:', { pageId, x, y });

        // Create element at drop position
        addElementAtPosition(pageId, data.elementType, data.shapeType, data.iconType, x, y);

        // Show success feedback
        if (typeof showToast === 'function') {
            showToast(`Added ${data.shapeType || data.iconType || 'element'}`, 'success');
        }
    }

    function attachPropertyListeners() {
        // Fill color
        const fillColor = document.getElementById('elementFillColor');
        const fillColorHex = document.getElementById('elementFillColorHex');
        if (fillColor && fillColorHex) {
            fillColor.addEventListener('input', (e) => {
                fillColorHex.value = e.target.value;
                updateSelectedElementProperty('fill', e.target.value);
            });
            fillColorHex.addEventListener('change', (e) => {
                const val = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
                fillColor.value = val;
                updateSelectedElementProperty('fill', val);
            });
        }

        // Stroke color
        const strokeColor = document.getElementById('elementStrokeColor');
        const strokeColorHex = document.getElementById('elementStrokeColorHex');
        if (strokeColor && strokeColorHex) {
            strokeColor.addEventListener('input', (e) => {
                strokeColorHex.value = e.target.value;
                updateSelectedElementProperty('stroke', e.target.value);
            });
            strokeColorHex.addEventListener('change', (e) => {
                const val = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
                strokeColor.value = val;
                updateSelectedElementProperty('stroke', val);
            });
        }

        // Stroke width
        const strokeWidth = document.getElementById('elementStrokeWidth');
        const strokeWidthValue = document.getElementById('elementStrokeWidthValue');
        if (strokeWidth && strokeWidthValue) {
            strokeWidth.addEventListener('input', (e) => {
                strokeWidthValue.textContent = e.target.value + 'px';
                updateSelectedElementProperty('strokeWidth', parseInt(e.target.value));
            });
        }

        // Opacity
        const opacity = document.getElementById('elementOpacity');
        const opacityValue = document.getElementById('elementOpacityValue');
        if (opacity && opacityValue) {
            opacity.addEventListener('input', (e) => {
                opacityValue.textContent = e.target.value + '%';
                updateSelectedElementProperty('opacity', e.target.value / 100);
            });
        }
    }

    // ========================================================================
    // ELEMENT CREATION
    // ========================================================================

    function createShapeElement(shapeType, options = {}) {
        return {
            id: ElementDrag.createElementId(),
            type: 'shape',
            shapeType: shapeType,
            position: options.position || { x: 100, y: 100 },
            size: options.size || { width: 100, height: 100 },
            rotation: 0,
            zIndex: options.zIndex || 10,
            locked: false,
            visible: true,
            fill: options.fill || '#C20430',
            stroke: options.stroke || 'none',
            strokeWidth: options.strokeWidth || 0,
            opacity: options.opacity || 1,
            borderRadius: options.borderRadius || 0
        };
    }

    function createIconElement(iconType, options = {}) {
        const iconsLib = window.ICONS_LIBRARY || {};
        const iconDef = iconsLib[iconType];
        if (!iconDef) {
            console.warn('Unknown icon type:', iconType);
            return null;
        }

        return {
            id: ElementDrag.createElementId(),
            type: 'icon',
            iconType: iconType,
            position: options.position || { x: 100, y: 100 },
            size: options.size || { width: 48, height: 48 },
            rotation: 0,
            zIndex: options.zIndex || 10,
            locked: false,
            visible: true,
            fill: options.fill || '#374151',
            viewBox: iconDef.viewBox,
            svgPath: iconDef.path,
            opacity: options.opacity || 1
        };
    }

    function createQRCodeElement(url, options = {}) {
        return {
            id: ElementDrag.createElementId(),
            type: 'qrcode',
            position: options.position || { x: 100, y: 100 },
            size: options.size || { width: 100, height: 100 },
            rotation: 0,
            zIndex: options.zIndex || 10,
            locked: false,
            visible: true,
            url: url || '',
            foreground: options.foreground || '#000000',
            background: options.background || '#FFFFFF',
            opacity: options.opacity || 1
        };
    }

    // ========================================================================
    // ADD ELEMENTS TO PAGE
    // ========================================================================

    function addElementToCurrentPage(elementType, shapeType, iconType) {
        const pageId = EditorState.currentPage;
        if (!pageId) {
            showToast('Please select a page first', 'warning');
            return;
        }

        // Center position on page
        const page = document.querySelector(`.brochure-page[data-page-id="${pageId}"]`);
        if (!page) return;

        const centerX = (page.offsetWidth / 2) - 50;
        const centerY = (page.offsetHeight / 2) - 50;

        addElementAtPosition(pageId, elementType, shapeType, iconType, centerX, centerY);
    }

    function addElementAtPosition(pageId, elementType, shapeType, iconType, x, y) {
        let elementData;
        const zIndex = ElementDrag.getNextZIndex(pageId);

        switch (elementType) {
            case 'shape':
                elementData = createShapeElement(shapeType, {
                    position: { x, y },
                    zIndex
                });
                break;
            case 'icon':
                elementData = createIconElement(iconType, {
                    position: { x, y },
                    zIndex
                });
                break;
            case 'qrcode':
                const propertyUrl = getPropertyUrl();
                elementData = createQRCodeElement(propertyUrl, {
                    position: { x, y },
                    zIndex
                });
                break;
        }

        if (!elementData) return;

        // Save to history
        if (typeof saveToHistory === 'function') {
            saveToHistory('add element');
        }

        // Add to page
        ElementDrag.addElementToPage(elementData, pageId);

        // Select the new element
        setTimeout(() => {
            const element = document.querySelector(`[data-element-id="${elementData.id}"]`);
            if (element) {
                ElementDrag.selectElement(element);
            }
        }, 50);

        showToast(`Added ${elementType}`, 'success');
    }

    function addQRCodeToCurrentPage() {
        addElementToCurrentPage('qrcode', '', '');
    }

    // ========================================================================
    // ELEMENT PROPERTIES
    // ========================================================================

    function showElementProperties(element, elementType) {
        const section = document.getElementById('elementPropertiesSection');
        if (!section) return;

        section.style.display = 'block';

        // Get element data
        const elementId = element.dataset.elementId;
        const pageId = element.closest('.brochure-page')?.dataset.pageId;
        const elementData = getElementData(elementId, pageId);

        if (!elementData) return;

        // Update controls with element values
        const fillColor = document.getElementById('elementFillColor');
        const fillColorHex = document.getElementById('elementFillColorHex');
        if (fillColor && elementData.fill) {
            fillColor.value = elementData.fill;
            fillColorHex.value = elementData.fill;
        }

        const strokeColor = document.getElementById('elementStrokeColor');
        const strokeColorHex = document.getElementById('elementStrokeColorHex');
        if (strokeColor && elementData.stroke) {
            strokeColor.value = elementData.stroke === 'none' ? '#000000' : elementData.stroke;
            strokeColorHex.value = elementData.stroke === 'none' ? '#000000' : elementData.stroke;
        }

        const strokeWidth = document.getElementById('elementStrokeWidth');
        const strokeWidthValue = document.getElementById('elementStrokeWidthValue');
        if (strokeWidth) {
            strokeWidth.value = elementData.strokeWidth || 0;
            strokeWidthValue.textContent = (elementData.strokeWidth || 0) + 'px';
        }

        const opacity = document.getElementById('elementOpacity');
        const opacityValue = document.getElementById('elementOpacityValue');
        if (opacity) {
            opacity.value = (elementData.opacity || 1) * 100;
            opacityValue.textContent = Math.round((elementData.opacity || 1) * 100) + '%';
        }
    }

    function hideElementProperties() {
        const section = document.getElementById('elementPropertiesSection');
        if (section) {
            section.style.display = 'none';
        }
    }

    function updateSelectedElementProperty(property, value) {
        if (!EditorState.selectedElements || EditorState.selectedElements.length === 0) return;

        EditorState.selectedElements.forEach(element => {
            const elementId = element.dataset.elementId;
            const pageId = element.closest('.brochure-page')?.dataset.pageId;

            // Update data
            const elementData = getElementData(elementId, pageId);
            if (elementData) {
                elementData[property] = value;
            }

            // Update DOM
            updateElementAppearance(element, property, value);
        });

        EditorState.isDirty = true;
    }

    function updateElementAppearance(element, property, value) {
        const svg = element.querySelector('svg');
        if (!svg) return;

        const shape = svg.querySelector('rect, circle, ellipse, polygon, line, path');

        switch (property) {
            case 'fill':
                if (shape) shape.setAttribute('fill', value);
                break;
            case 'stroke':
                if (shape) shape.setAttribute('stroke', value);
                break;
            case 'strokeWidth':
                if (shape) shape.setAttribute('stroke-width', value);
                break;
            case 'opacity':
                element.style.opacity = value;
                break;
        }
    }

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function getElementData(elementId, pageId) {
        if (!pageId || !EditorState.elements[pageId]) return null;
        return EditorState.elements[pageId].find(el => el.id === elementId);
    }

    function getCanvasZoom() {
        const canvas = document.getElementById('brochureCanvas');
        if (!canvas) return 1;
        const transform = canvas.style.transform;
        const match = transform.match(/scale\(([^)]+)\)/);
        return match ? parseFloat(match[1]) : 1;
    }

    function getPropertyUrl() {
        // Try to get property URL from session data
        if (EditorState.sessionData?.property?.url) {
            return EditorState.sessionData.property.url;
        }
        if (EditorState.sessionData?.property?.id) {
            return `https://doorstep.co.uk/property/${EditorState.sessionData.property.id}`;
        }
        return 'https://doorstep.co.uk';
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // ========================================================================
    // EXPOSE TO GLOBAL SCOPE
    // ========================================================================

    window.ElementsLibrary = {
        render: renderElementsPanel,
        createShape: createShapeElement,
        createIcon: createIconElement,
        createQRCode: createQRCodeElement,
        addToCurrentPage: addElementToCurrentPage,
        addAtPosition: addElementAtPosition,
        showProperties: showElementProperties,
        hideProperties: hideElementProperties,
        get ICONS() { return window.ICONS_LIBRARY || {}; },
        get SHAPES() { return window.SHAPES_LIBRARY || {}; },
        isLoaded: true
    };

    // Expose property functions for external use
    window.showElementProperties = showElementProperties;
    window.hideElementProperties = hideElementProperties;

})();
