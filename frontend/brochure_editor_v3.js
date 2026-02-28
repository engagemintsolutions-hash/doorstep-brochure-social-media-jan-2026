/**
 * BROCHURE EDITOR V3 - LANDSCAPE A4 INTERACTIVE EDITING
 *
 * Features:
 * - Session-based state management
 * - Landscape A4 page rendering (297mm x 210mm)
 * - Contenteditable text editing
 * - Photo display from session URLs
 * - Auto-save functionality
 * - Zoom and view controls
 * - Properties panel
 */

// ============================================================================
// GLOBAL STATE
// ============================================================================

const EditorState = {
    sessionId: null,
    sessionData: null,
    photoUrls: {},
    currentPage: null,
    selectedElement: null,
    isDirty: false,
    zoomLevel: 0.50,  // Default 50% for wider overview of full page
    showGuides: false,
    autoSaveInterval: null,
    pageDescriptions: {},  // Store page-specific AI descriptions by page ID
    pageLayouts: {},  // Store layout preference per page: '1-col', '2x2', '1x3', etc.
    photoGaps: {},  // Store photo grid gap per page in pixels: 0, 5, 10, 15
    customPhotoPositions: {},  // Store custom photo positions: {pageId: {photoId: {x, y, width, height}}}
    adjustMode: false,  // Toggle for drag/resize mode
    selectedPhoto: null,  // Currently selected photo for adjusting
    photoSizes: {},  // Store photo sizes per page: {pageId: {photoIndex: 'small'|'medium'|'large'|'full'}}
    photoStacking: {},  // Store photo stacking per page: {pageId: 'horizontal'|'vertical'|'grid'}
    activeTemplate: 'knight_frank_prestige',  // Currently active template - Knight Frank inspired default
    loadedFromWindowOpener: false,  // Track if session was loaded from window.opener (no backend save needed)
    // Undo/Redo history
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,
    isUndoRedo: false,  // Flag to prevent saving during undo/redo
    // Phase 2: Professional Tools
    elements: {},           // {pageId: [element, ...]} - Design elements (shapes, icons, QR codes)
    layerOrder: {},         // {pageId: [elementId, ...]} - Z-order of elements
    selectedElements: [],   // Currently selected design elements
    gridVisible: false,     // Grid overlay visibility
    smartGuidesEnabled: true  // Smart alignment guides enabled
};

// Expose EditorState globally for templates panel
window.EditorState = EditorState;

// ============================================================================
// CLIPBOARD & COPY/PASTE SYSTEM
// ============================================================================

let clipboardData = null;  // Store copied element data

/**
 * Copy the currently selected element(s) to clipboard
 */
function copySelectedElement() {
    const selected = EditorState.selectedElement ||
                    (EditorState.selectedElements && EditorState.selectedElements[0]);

    if (!selected) {
        console.log('📋 Nothing to copy');
        return false;
    }

    // Clone the element data
    clipboardData = {
        type: selected.dataset.elementType || 'unknown',
        html: selected.outerHTML,
        styles: selected.getAttribute('style') || '',
        dataset: { ...selected.dataset },
        rect: {
            width: selected.offsetWidth,
            height: selected.offsetHeight
        }
    };

    console.log('📋 Copied element:', clipboardData.type);
    showToast('Element copied');
    return true;
}

/**
 * Paste from clipboard with offset
 */
function pasteElement(offsetX = 20, offsetY = 20) {
    if (!clipboardData) {
        console.log('📋 Clipboard is empty');
        showToast('Nothing to paste');
        return false;
    }

    const currentPageId = EditorState.currentPage;
    if (!currentPageId) {
        console.log('📋 No page selected');
        return false;
    }

    // Create element from clipboard HTML
    const container = document.createElement('div');
    container.innerHTML = clipboardData.html;
    const newElement = container.firstElementChild;

    if (!newElement) {
        console.log('📋 Failed to create element from clipboard');
        return false;
    }

    // Generate new unique ID
    const newId = `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    newElement.id = newId;
    newElement.dataset.elementId = newId;

    // Offset position from original
    const currentLeft = parseInt(newElement.style.left) || 50;
    const currentTop = parseInt(newElement.style.top) || 50;
    newElement.style.left = `${currentLeft + offsetX}px`;
    newElement.style.top = `${currentTop + offsetY}px`;

    // Find the canvas for current page and append
    const pageCanvas = document.querySelector(`[data-page-id="${currentPageId}"] .page-canvas, [data-page-id="${currentPageId}"]`);
    if (pageCanvas) {
        pageCanvas.appendChild(newElement);

        // Register in EditorState
        if (!EditorState.elements[currentPageId]) {
            EditorState.elements[currentPageId] = [];
        }
        EditorState.elements[currentPageId].push({
            id: newId,
            type: clipboardData.type,
            element: newElement
        });

        // Select the new element
        selectElement(newElement);

        // Save to history
        saveToHistory('paste');
        markDirty();

        console.log('📋 Pasted element:', newId);
        showToast('Element pasted');
        return true;
    }

    console.log('📋 Could not find page canvas');
    return false;
}

/**
 * Duplicate the selected element in place with slight offset
 */
function duplicateElement() {
    if (copySelectedElement()) {
        pasteElement(30, 30);
        console.log('📋 Element duplicated');
    }
}

/**
 * Select an element and update EditorState
 */
function selectElement(element) {
    // Deselect previous
    if (EditorState.selectedElement) {
        EditorState.selectedElement.classList.remove('selected');
    }

    // Select new element
    if (element) {
        element.classList.add('selected');
        EditorState.selectedElement = element;
        EditorState.selectedElements = [element];
        console.log('✅ Selected element:', element.id || element.dataset.elementType);
    } else {
        EditorState.selectedElement = null;
        EditorState.selectedElements = [];
    }
}

/**
 * Delete the selected element(s)
 */
function deleteSelectedElement() {
    const selected = EditorState.selectedElement ||
                    (EditorState.selectedElements && EditorState.selectedElements[0]);

    if (!selected) {
        console.log('🗑️ Nothing to delete');
        return false;
    }

    // Check if element is locked
    if (selected.dataset.locked === 'true') {
        showToast('Element is locked. Unlock it first to delete.');
        return false;
    }

    const elementId = selected.id || selected.dataset.elementId;
    const pageId = EditorState.currentPage;

    // Remove from DOM
    selected.remove();

    // Remove from EditorState
    if (pageId && EditorState.elements[pageId]) {
        EditorState.elements[pageId] = EditorState.elements[pageId].filter(
            el => el.id !== elementId
        );
    }

    // Clear selection
    EditorState.selectedElement = null;
    EditorState.selectedElements = [];

    // Save to history
    saveToHistory('delete');
    markDirty();

    console.log('🗑️ Deleted element:', elementId);
    showToast('Element deleted');
    return true;
}

/**
 * Mark editor as having unsaved changes
 */
function markDirty() {
    EditorState.isDirty = true;
    updateStatus('editing', 'Unsaved changes');
}

/**
 * Group selected elements (placeholder - stores as group)
 */
function groupSelectedElements() {
    if (EditorState.selectedElements.length < 2) {
        showToast('Select multiple elements to group (Shift+click)');
        return;
    }
    // TODO: Implement full grouping
    showToast('Grouping coming soon!');
}

/**
 * Ungroup selected group element
 */
function ungroupSelectedElements() {
    // TODO: Implement ungrouping
    showToast('Ungrouping coming soon!');
}

/**
 * Toggle lock on selected element
 */
function toggleElementLock() {
    const selected = EditorState.selectedElement ||
                    (EditorState.selectedElements && EditorState.selectedElements[0]);

    if (!selected) {
        showToast('Select an element to lock/unlock');
        return false;
    }

    const isLocked = selected.dataset.locked === 'true';

    if (isLocked) {
        // Unlock
        selected.dataset.locked = 'false';
        selected.classList.remove('element-locked');
        selected.style.pointerEvents = '';
        showToast('Element unlocked');
    } else {
        // Lock
        selected.dataset.locked = 'true';
        selected.classList.add('element-locked');
        showToast('Element locked - click the lock icon to unlock');
    }

    // Save to history
    saveToHistory(isLocked ? 'unlock' : 'lock');
    markDirty();

    return true;
}

/**
 * Check if element is locked
 */
function isElementLocked(element) {
    return element && element.dataset.locked === 'true';
}

// Make lock functions globally available
window.toggleElementLock = toggleElementLock;
window.isElementLocked = isElementLocked;

// Note: undo/redo are defined as local functions later in this file
// They will be assigned to window after definition (see line ~610)

// Make page functions globally available
window.duplicateCurrentPage = function() {
    if (typeof duplicateCurrentPage === 'function') duplicateCurrentPage();
};

// Skip AI generation function
window.skipAIGeneration = function() {
    console.log('Skipping AI generation...');
    // Hide any AI loading states
    const loadingEl = document.querySelector('.ai-loading, .generation-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    // Show manual entry mode
    if (typeof showToast === 'function') {
        showToast('AI generation skipped - entering manual mode');
    }
};

/**
 * Show keyboard shortcuts help modal
 */
function showKeyboardShortcuts() {
    // Check if modal already exists
    let modal = document.getElementById('shortcutsModal');
    if (!modal) {
        // Create modal
        modal = document.createElement('div');
        modal.id = 'shortcutsModal';
        modal.className = 'modal shortcuts-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <button class="modal-close" onclick="document.getElementById('shortcutsModal').classList.remove('visible')">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div class="shortcuts-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="shortcut-section">
                            <h4 style="margin: 0 0 10px; color: #666; font-size: 12px; text-transform: uppercase;">Editing</h4>
                            <div class="shortcut-item"><kbd>Ctrl+C</kbd> Copy</div>
                            <div class="shortcut-item"><kbd>Ctrl+V</kbd> Paste</div>
                            <div class="shortcut-item"><kbd>Ctrl+D</kbd> Duplicate</div>
                            <div class="shortcut-item"><kbd>Delete</kbd> Delete</div>
                            <div class="shortcut-item"><kbd>Ctrl+Z</kbd> Undo</div>
                            <div class="shortcut-item"><kbd>Ctrl+Y</kbd> Redo</div>
                        </div>
                        <div class="shortcut-section">
                            <h4 style="margin: 0 0 10px; color: #666; font-size: 12px; text-transform: uppercase;">Navigation</h4>
                            <div class="shortcut-item"><kbd>Ctrl+S</kbd> Save</div>
                            <div class="shortcut-item"><kbd>Ctrl++</kbd> Zoom In</div>
                            <div class="shortcut-item"><kbd>Ctrl+-</kbd> Zoom Out</div>
                            <div class="shortcut-item"><kbd>Ctrl+0</kbd> Fit Width</div>
                            <div class="shortcut-item"><kbd>Esc</kbd> Deselect</div>
                        </div>
                        <div class="shortcut-section">
                            <h4 style="margin: 0 0 10px; color: #666; font-size: 12px; text-transform: uppercase;">Movement</h4>
                            <div class="shortcut-item"><kbd>↑↓←→</kbd> Nudge 1px</div>
                            <div class="shortcut-item"><kbd>Shift+↑↓←→</kbd> Nudge 10px</div>
                        </div>
                        <div class="shortcut-section">
                            <h4 style="margin: 0 0 10px; color: #666; font-size: 12px; text-transform: uppercase;">Selection</h4>
                            <div class="shortcut-item"><kbd>Shift+Click</kbd> Multi-select</div>
                            <div class="shortcut-item"><kbd>Ctrl+G</kbd> Group</div>
                            <div class="shortcut-item"><kbd>Ctrl+Shift+G</kbd> Ungroup</div>
                            <div class="shortcut-item"><kbd>Ctrl+L</kbd> Lock/Unlock</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #eee; text-align: center;">
                    <small style="color: #999;">Press <kbd>?</kbd> anytime to show this help</small>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add styles for kbd elements if not present
        if (!document.getElementById('shortcutStyles')) {
            const style = document.createElement('style');
            style.id = 'shortcutStyles';
            style.textContent = `
                .shortcuts-modal kbd {
                    display: inline-block;
                    padding: 3px 8px;
                    font-family: monospace;
                    font-size: 12px;
                    background: #f4f4f4;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    box-shadow: 0 1px 1px rgba(0,0,0,0.1);
                    margin-right: 8px;
                    min-width: 24px;
                    text-align: center;
                }
                .shortcut-item {
                    padding: 6px 0;
                    font-size: 13px;
                    color: #333;
                    display: flex;
                    align-items: center;
                }
                .shortcuts-modal .modal-content {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                .shortcuts-modal .modal-header {
                    padding: 15px 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .shortcuts-modal .modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                }
            `;
            document.head.appendChild(style);
        }
    }

    modal.classList.add('visible');
}

// ============================================================================
// UNDO/REDO SYSTEM
// ============================================================================

function saveToHistory(actionName = 'edit') {
    // Don't save during undo/redo operations
    if (EditorState.isUndoRedo) return;

    // Get current state snapshot (DOM content of all pages)
    const snapshot = captureEditorState();

    // If we're not at the end of history, truncate forward history
    if (EditorState.historyIndex < EditorState.history.length - 1) {
        EditorState.history = EditorState.history.slice(0, EditorState.historyIndex + 1);
    }

    // Add new state
    EditorState.history.push({
        action: actionName,
        state: snapshot,
        timestamp: Date.now()
    });

    // Limit history size
    if (EditorState.history.length > EditorState.maxHistorySize) {
        EditorState.history.shift();
    } else {
        EditorState.historyIndex++;
    }

    updateUndoRedoButtons();
    console.log(`📝 History saved: ${actionName} (${EditorState.historyIndex + 1}/${EditorState.history.length})`);
}

function captureEditorState() {
    // Capture the innerHTML of each brochure page
    const pageDoms = document.querySelectorAll('.brochure-page');
    const pageStates = {};

    pageDoms.forEach((page, index) => {
        pageStates[index] = page.innerHTML;
    });

    return {
        pages: pageStates,
        sessionPages: JSON.parse(JSON.stringify(EditorState.sessionData?.pages || [])),
        currentPage: EditorState.currentPage,
        pageDescriptions: JSON.parse(JSON.stringify(EditorState.pageDescriptions)),
        // Phase 2: Include design elements
        elements: JSON.parse(JSON.stringify(EditorState.elements || {})),
        layerOrder: JSON.parse(JSON.stringify(EditorState.layerOrder || {}))
    };
}

function restoreEditorState(snapshot) {
    if (!snapshot) return;

    EditorState.isUndoRedo = true;

    // Check if page structure changed (pages added/removed)
    const currentPageCount = EditorState.sessionData?.pages?.length || 0;
    const snapshotPageCount = snapshot.sessionPages?.length || 0;

    // Restore Phase 2 elements if present
    if (snapshot.elements) {
        EditorState.elements = JSON.parse(JSON.stringify(snapshot.elements));
    }
    if (snapshot.layerOrder) {
        EditorState.layerOrder = JSON.parse(JSON.stringify(snapshot.layerOrder));
    }

    if (snapshot.sessionPages && currentPageCount !== snapshotPageCount) {
        // Restore the session pages array and re-render
        EditorState.sessionData.pages = JSON.parse(JSON.stringify(snapshot.sessionPages));
        renderPages();

        // Restore page descriptions
        if (snapshot.pageDescriptions) {
            EditorState.pageDescriptions = JSON.parse(JSON.stringify(snapshot.pageDescriptions));
        }

        // Re-render design elements
        rerenderDesignElements();

        // Select appropriate page
        if (snapshot.currentPage) {
            setTimeout(() => {
                selectPage(snapshot.currentPage);
                EditorState.isUndoRedo = false;
            }, 200);
        } else {
            EditorState.isUndoRedo = false;
        }
    } else {
        // Just restore page content (no structural change)
        const pages = document.querySelectorAll('.brochure-page');
        pages.forEach((page, index) => {
            if (snapshot.pages[index]) {
                page.innerHTML = snapshot.pages[index];
            }
        });

        // Restore descriptions
        if (snapshot.pageDescriptions) {
            EditorState.pageDescriptions = JSON.parse(JSON.stringify(snapshot.pageDescriptions));
        }

        // Re-render design elements
        rerenderDesignElements();

        // Re-attach event handlers
        setTimeout(() => {
            if (typeof attachBrochurePhotoClickHandlers === 'function') {
                attachBrochurePhotoClickHandlers();
            }
            attachPhotoHoverEffects();
            EditorState.isUndoRedo = false;
        }, 100);
    }
}

// Re-render all design elements from EditorState.elements
function rerenderDesignElements() {
    // Removed — Canva-like drag/layer features cleaned up
}

function undo() {
    if (EditorState.historyIndex <= 0) {
        showToast('Nothing to undo', 'info');
        return;
    }

    EditorState.historyIndex--;
    const snapshot = EditorState.history[EditorState.historyIndex];
    restoreEditorState(snapshot.state);

    updateUndoRedoButtons();
    showToast('Undone: ' + snapshot.action, 'info');
    console.log(`↩️ Undo: ${snapshot.action} (${EditorState.historyIndex + 1}/${EditorState.history.length})`);
}

function redo() {
    if (EditorState.historyIndex >= EditorState.history.length - 1) {
        showToast('Nothing to redo', 'info');
        return;
    }

    EditorState.historyIndex++;
    const snapshot = EditorState.history[EditorState.historyIndex];
    restoreEditorState(snapshot.state);

    updateUndoRedoButtons();
    showToast('Redone: ' + snapshot.action, 'info');
    console.log(`↪️ Redo: ${snapshot.action} (${EditorState.historyIndex + 1}/${EditorState.history.length})`);
}

// Make undo/redo globally available
window.undo = undo;
window.redo = redo;

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const historyCounter = document.getElementById('historyCounter');

    if (undoBtn) {
        undoBtn.disabled = EditorState.historyIndex <= 0;
    }
    if (redoBtn) {
        redoBtn.disabled = EditorState.historyIndex >= EditorState.history.length - 1;
    }
    // Update history counter display
    if (historyCounter) {
        const current = EditorState.historyIndex + 1;
        const total = EditorState.history.length;
        historyCounter.textContent = `${current}/${total}`;
        historyCounter.title = `History: ${current} of ${total} states`;
    }
}

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
    // Ctrl+Z for Undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    }
    // Ctrl+Y or Ctrl+Shift+Z for Redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        redo();
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 Brochure Editor V3 initializing...');

    // Extract session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    EditorState.sessionId = urlParams.get('session');

    // Check for demo mode (no session or explicit demo param)
    const isDemoMode = !EditorState.sessionId || urlParams.get('demo') === 'true';

    if (isDemoMode) {
        console.log('🎭 Starting in DEMO MODE...');
        EditorState.sessionId = 'demo_' + Date.now();
        EditorState.isDemoMode = true;
        initializeEventListeners();
        loadDemoMode();
        return;
    }

    console.log(`📝 Session ID: ${EditorState.sessionId}`);

    // Initialize UI
    initializeEventListeners();

    // Load session data
    loadSession();
});

// ============================================================================
// DEMO MODE - For testing and feature exploration
// ============================================================================

function loadDemoMode() {
    console.log('🎭 Loading demo content...');
    showLoading(true, 'Loading demo...');

    // Create demo session data
    EditorState.sessionData = {
        property: {
            address: '42 Primrose Cottage, Cotswolds, GL54 1AB',
            price: '695,000',
            priceType: 'Guide Price',
            propertyType: 'Detached Cottage',
            bedrooms: 4,
            bathrooms: 2,
            receptions: 2
        },
        agent: {
            name: 'Cotswold Country Homes',
            branch: 'Stow-on-the-Wold',
            phone: '01451 123456',
            email: 'info@cotswoldcountry.co.uk'
        },
        photos: [],
        pages: [
            {
                id: 'demo_cover',
                type: 'cover',
                title: 'Cover Page',
                layout: 'hero',
                photos: [],
                content: {
                    headline: '42 Primrose Cottage',
                    subheadline: 'A charming period cottage in the heart of the Cotswolds',
                    price: 'Guide Price £695,000',
                    bedrooms: 4,
                    bathrooms: 2
                }
            },
            {
                id: 'demo_details',
                type: 'details',
                title: 'Property Details',
                layout: 'two-column',
                photos: [],
                content: {
                    description: 'This delightful Grade II listed cottage offers a rare opportunity to acquire a charming period property in an idyllic village setting. The accommodation is both versatile and characterful, retaining many original features including exposed beams, inglenook fireplace, and Cotswold stone walls.',
                    features: [
                        'Grade II Listed',
                        'Period Features Throughout',
                        'Inglenook Fireplace',
                        'Exposed Beams',
                        'South-Facing Garden',
                        'Village Location',
                        'Off-Street Parking',
                        'EPC Exempt'
                    ]
                }
            },
            {
                id: 'demo_rooms',
                type: 'living',
                title: 'Living Areas',
                layout: 'photo-left',
                photos: [],
                content: {
                    title: 'Reception Rooms',
                    description: 'The sitting room features an impressive inglenook fireplace with bread oven, perfect for cosy evenings. The separate dining room leads through to a well-appointed kitchen with views over the rear garden.'
                }
            }
        ]
    };

    // Set page descriptions
    EditorState.pageDescriptions = {
        'demo_cover': 'Welcome to this stunning Cotswold cottage',
        'demo_details': 'A truly exceptional family home',
        'demo_rooms': 'Light-filled living spaces'
    };

    // Update UI
    updatePropertyAddress();
    updateStatus('ready', 'Demo Mode');

    // Render pages
    renderPages();

    // Enable buttons
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
    document.getElementById('repurposeBtn').disabled = false;

    // Apply default template (knight_frank_prestige - professional estate agent style)
    setTimeout(() => {
        if (typeof applyTemplateToAll === 'function') {
            applyTemplateToAll('knight_frank_prestige');
        }
    }, 500);

    // Hide loading
    showLoading(false);
    showToast('Demo mode loaded. Explore the editor features!', 'info');
    console.log('✅ Demo mode loaded successfully');
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

// Helper function to add timeout to fetch
function fetchWithTimeout(url, options, timeout = 30000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

// Fallback descriptions when AI generation fails
function getDefaultDescription(pageType) {
    const defaults = {
        kitchen: 'A well-appointed kitchen with modern amenities and quality fixtures. The space offers excellent storage and preparation areas for everyday cooking and entertaining.',
        living: 'Generous living accommodation providing flexible space for relaxation and entertaining. The room benefits from good natural light and comfortable proportions.',
        bedrooms: 'Well-proportioned bedrooms offering restful accommodation. Each room has been designed with comfort and practicality in mind.',
        bathrooms: 'Contemporary bathroom facilities with quality fixtures and fittings. The space combines practicality with style.',
        garden: 'Private outdoor space perfect for relaxation and entertaining. The garden offers a pleasant setting with established planting.',
        exterior: 'The property presents an attractive facade with well-maintained grounds and ample parking. The exterior reflects the character and quality of the accommodation within.',
        location: 'A desirable location with excellent local amenities and transport connections. The area offers a balanced combination of convenience and character.',
        contact: 'For more information or to arrange a viewing, please contact our team.'
    };
    return defaults[pageType] || 'Please contact us for more details about this feature.';
}

async function generatePageSpecificDescription(page) {
    console.log(`🤖 Generating AI description for ${page.type} (${page.photos?.length || 0} photos)...`);

    try {
        const property = EditorState.sessionData.property || {};

        // Extract vision analysis details from photos on this page
        const photoDetails = [];
        console.log(`📸 Page ${page.type} has ${page.photos?.length || 0} photos`, page.photos);

        if (page.photos && page.photos.length > 0) {
            page.photos.forEach((photoItem, index) => {
                // photoItem might be an ID string OR an object with {id, ...}
                let photo = null;
                let photoId = null;

                // If photoItem is already an object, use it directly
                if (typeof photoItem === 'object' && photoItem !== null) {
                    photo = photoItem;
                    photoId = photoItem.id;
                } else {
                    // Otherwise it's an ID, look it up
                    photoId = photoItem;
                    photo = EditorState.sessionData.photos?.[photoId];

                    // If photos is an array, try direct lookup
                    if (!photo && Array.isArray(EditorState.sessionData.photos)) {
                        photo = EditorState.sessionData.photos.find(p => p.id === photoId);
                    }
                }

                console.log(`  📷 Photo ${index + 1} (${photoId}):`, photo?.analysis);

                if (photo && photo.analysis) {
                    const attributes = photo.analysis.attributes || [];
                    const caption = photo.analysis.caption || '';
                    if (attributes.length > 0 || caption) {
                        // Extract 'attribute' property from each attribute object
                        const attributeTexts = attributes.map(attr =>
                            typeof attr === 'string' ? attr : (attr.attribute || attr.description || String(attr))
                        ).join(', ');
                        photoDetails.push(`Photo ${index + 1}: ${attributeTexts}${caption ? ` - ${caption}` : ''}`);
                    }
                } else {
                    console.warn(`  ⚠️ No analysis for photo ${index + 1}:`, photo);
                }
            });
        }

        console.log(`✅ Extracted ${photoDetails.length} photo descriptions for ${page.type}`);

        const photoContext = photoDetails.length > 0
            ? `\n\nThe photos show these specific features: ${photoDetails.join('; ')}. Reference these exact details in your description.`
            : '';

        // Extract property context for richer prompts
        const keyFeatures = property.keyFeatures || property.key_features || [];
        const featuresList = Array.isArray(keyFeatures) ? keyFeatures.join(', ') : (keyFeatures || '');
        const propertyAddress = property.address || '';
        const propertyContext = featuresList
            ? `\n\nThis property is at ${propertyAddress}. Key features include: ${featuresList}. You MUST mention relevant key features in your description.`
            : (propertyAddress ? `\n\nThis property is at ${propertyAddress}.` : '');

        // Brochure-specific prompts — tuned for page layout constraints
        // Kitchen/bedrooms have ~60% page width for text, so keep descriptions tight
        // Location/garden pages have more text space
        const beds = property.bedrooms || '';
        const baths = property.bathrooms || '';
        const propType = property.propertyType || property.property_type || 'property';

        const roomPrompts = {
            kitchen: `Write a kitchen description for a premium property brochure.${photoContext}${propertyContext}

STRUCTURE: Write 3-4 SHORT paragraphs (2-3 sentences each). Total 100-130 words MAXIMUM.

Paragraph 1: Appliances and worktops — name specific brands/materials if visible (Aga, Siemens, granite, marble).
Paragraph 2: Layout — island, breakfast bar, dining area, utility room connection.
Paragraph 3: Light and character — windows, ceiling height, beams, flooring.

RULES:
- Name SPECIFIC materials and brands visible in photos (not generic "quality appliances")
- Include room connections: "leads through to", "opens onto", "adjoins"
- Mention aspect/orientation if known
- NO: "heart of the home", "perfect for entertaining", "hub of family life"
- Write like Savills, not like a lifestyle magazine`,

            living: `Write a reception rooms description for a premium property brochure.${photoContext}${propertyContext}

STRUCTURE: Write 3-4 SHORT paragraphs (2-3 sentences each). Total 100-130 words MAXIMUM.

Paragraph 1: Principal reception — size, fireplace, ceiling height, period features.
Paragraph 2: Additional rooms — study, family room, drawing room, library.
Paragraph 3: Character — flooring, windows, mouldings, views.

RULES:
- State room COUNT: "three reception rooms" not just "generous living space"
- Name architectural features: inglenook, bay window, cornice, dado rail
- Mention aspect and light: "south-facing", "dual-aspect", "floor-to-ceiling windows"
- NO: "perfect for relaxation", "ideal for families", "wonderful entertaining space"`,

            bedrooms: `Write a bedrooms description for a premium property brochure.${photoContext}${propertyContext}
This property has ${beds ? beds + ' bedrooms' : 'multiple bedrooms'} and ${baths ? baths + ' bathrooms' : 'several bathrooms'}.

STRUCTURE: Write 3-4 SHORT paragraphs (2-3 sentences each). Total 100-120 words MAXIMUM.

Paragraph 1: Principal bedroom — size, en-suite, dressing room, views.
Paragraph 2: Further bedrooms — how many, which floors, en-suites.
Paragraph 3: Bathrooms — fittings quality (freestanding bath, walk-in shower, heated towel rails).

RULES:
- State EXACT bedroom count and which have en-suites
- Describe the principal bedroom specifically, then summarise the rest
- Mention built-in storage: "fitted wardrobes", "dressing room"
- NO: "sanctuary", "retreat", "haven", "restful night's sleep"`,

            bathrooms: `Write a bathroom description for a premium property brochure.${photoContext}${propertyContext}

STRUCTURE: 2 SHORT paragraphs. Total 60-80 words MAXIMUM.

Paragraph 1: Principal bathroom — bath type (freestanding/built-in), shower, fixtures.
Paragraph 2: Additional bathrooms — count, notable features.

RULES:
- Name specific fixtures: "freestanding roll-top bath", "walk-in rainfall shower"
- Mention materials: "marble tiling", "Porcelanosa tiles", "natural stone"
- NO: "spa-like", "luxurious retreat", "pamper yourself"`,

            garden: `Write a gardens and grounds description for a premium property brochure.${photoContext}${propertyContext}

STRUCTURE: Write 3-4 SHORT paragraphs (2-3 sentences each). Total 120-160 words MAXIMUM.

Paragraph 1: Overall grounds — total acreage/size, setting, approach/driveway.
Paragraph 2: Formal gardens — lawns, borders, terraces, walled garden, kitchen garden.
Paragraph 3: Additional features — outbuildings, garaging, annexe, swimming pool, tennis court.
Paragraph 4 (optional): Boundaries and privacy — walls, hedging, woodland, views.

RULES:
- State EXACT acreage or dimensions if known
- Name specific features: "walled kitchen garden", "ha-ha", "yew hedging"
- Mention orientation: "south-facing terrace", "west-facing lawn"
- Describe approach: "tree-lined drive", "electric gates", "gravel drive"
- NO: "verdant paradise", "outdoor oasis", "tranquil retreat"`,

            exterior: `Write an exterior description for a premium property brochure.${photoContext}${propertyContext}

STRUCTURE: Write 2-3 SHORT paragraphs. Total 100-130 words MAXIMUM.

Paragraph 1: Architecture — building style, period, materials (stone, brick, render), roof.
Paragraph 2: Facade details — windows (mullioned, sash), porch, chimneys, listed features.
Paragraph 3: Practical — parking, garaging, outbuildings.

RULES:
- Name architectural period: "Georgian", "Victorian", "Arts and Crafts", "contemporary"
- Name materials: "Cotswold stone", "red brick", "rendered", "tile-hung"
- Mention conservation/listed status if known
- NO: "impressive facade", "kerb appeal", "sets the tone"`,

            location: `Write a location description for a premium property brochure.${photoContext}${propertyContext}
The address is: ${propertyAddress || 'not specified'}.

STRUCTURE: Write 4-5 SHORT paragraphs (2-3 sentences each). Total 150-200 words. This text will display in two columns so keep paragraphs SHORT.

Paragraph 1: Immediate setting — village/town name, character, distance from property.
Paragraph 2: Local amenities — NAME specific schools (prep, senior), shops, restaurants.
Paragraph 3: Transport — nearest station WITH London journey time, road connections (A-roads, motorways).
Paragraph 4: Wider area — Area of Outstanding Natural Beauty, National Trust, countryside.
Paragraph 5: Distances — nearest towns, London distance.

RULES:
- NAME specific schools, stations, pubs, shops — not just "excellent schools nearby"
- State DISTANCES: "0.5 miles to Haslemere station (Waterloo 55 minutes)"
- State journey times to London by rail
- Mention AONB, Green Belt, National Park if applicable
- NO: "sought-after location", "vibrant community", "perfect balance of town and country"
- Research real facts about the area — do not make up school or station names`,

            contact: `Write a brief call to action for a property brochure back page. 20-30 words maximum. Professional, direct. Example: "To arrange a private viewing or for further information, please contact our office." Do not use exclamation marks.`
        };

        const systemPrompt = roomPrompts[page.type] || `Write a comprehensive professional description of ${page.title}. 150-200 words in flowing paragraphs. Use sophisticated Savills tone.`;

        console.log(`📝 Prompt for ${page.type}:`, systemPrompt.substring(0, 200) + '...');

        // Use NEW /generate/room endpoint for room-specific descriptions
        // NOTE: Omit session_id during initial batch generation to avoid heavy session I/O
        // (each session load/save reads+writes full base64 photo data, causing timeouts with parallel calls)
        const isInitialGeneration = !EditorState._initialGenerationComplete;
        const response = await fetchWithTimeout('/generate/room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: systemPrompt,
                target_words: 150,
                session_id: isInitialGeneration ? null : EditorState.sessionId
            })
        }, 60000);

        if (!response.ok) {
            console.warn(`⚠️ Failed to generate ${page.type} description:`, response.statusText);
            return getDefaultDescription(page.type);
        }

        const result = await response.json();

        if (result.text) {
            console.log(`✅ Generated ${page.type} description (${result.text.length} chars, ${result.word_count} words)`);
            return result.text;
        }

        console.warn(`⚠️ Empty response for ${page.type}, using fallback`);
        return getDefaultDescription(page.type);

    } catch (error) {
        console.error(`❌ Failed to generate ${page.type} description (using fallback):`, error);
        return getDefaultDescription(page.type);
    }
}

function updateLoadingProgress(step, completed = false) {
    // Map page types to predefined step names
    const stepMapping = {
        'kitchen': 'kitchen',
        'living': 'living',
        'living_room': 'living',
        'lounge': 'living',
        'reception': 'living',
        'bedrooms': 'bedrooms',
        'bedroom': 'bedrooms',
        'master_bedroom': 'bedrooms',
        'bathrooms': 'bathrooms',
        'bathroom': 'bathrooms',
        'garden': 'garden',
        'outdoor': 'garden',
        'exterior': 'garden',
        'location': 'location',
        'contact': 'location',
        'session': 'session',
        'rendering': 'rendering'
    };

    const mappedStep = stepMapping[step] || step;
    const stepEl = document.querySelector(`.step[data-step="${mappedStep}"]`);

    if (stepEl) {
        stepEl.classList.remove('active');
        if (completed) {
            stepEl.classList.add('completed');
        } else {
            stepEl.classList.add('active');
        }
    }

    // Update progress bar
    const totalSteps = document.querySelectorAll('.step').length;
    const completedSteps = document.querySelectorAll('.step.completed').length;
    const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) progressFill.style.width = `${progress}%`;
    if (progressText) progressText.textContent = `${Math.round(progress)}%`;
}

async function generateAllPageDescriptions() {
    console.log('🤖 Loading page descriptions (using existing content if available)...');

    EditorState.pageDescriptions = {};

    const pages = EditorState.sessionData?.pages || [];
    const contentPages = pages.filter(page => page.type !== 'cover');

    console.log(`📋 Found ${contentPages.length} content pages to load`);

    // Mark all as active initially
    contentPages.forEach(page => updateLoadingProgress(page.type, false));

    // ⭐ FIX: Use existing content instead of regenerating!
    const generationPromises = contentPages.map(async (page) => {
        try {
            // Check if page already has content from the session
            const existingDescription = page.content?.description || page.content?.text;

            if (existingDescription && existingDescription.length > 50) {
                // Use existing description from session data
                console.log(`✅ Using existing content for ${page.type} (${existingDescription.length} chars)`);
                EditorState.pageDescriptions[page.id] = existingDescription;
                updateLoadingProgress(page.type, true);
                return { success: true, pageId: page.id, pageType: page.type, source: 'existing' };
            }

            // Only generate NEW description if no existing content
            console.log(`🤖 Generating NEW content for ${page.type} (no existing content found)`);
            const description = await generatePageSpecificDescription(page);

            if (description) {
                EditorState.pageDescriptions[page.id] = description;
                updateLoadingProgress(page.type, true);
                return { success: true, pageId: page.id, pageType: page.type, source: 'generated' };
            }

            updateLoadingProgress(page.type, true);
            return { success: false, pageId: page.id, pageType: page.type };

        } catch (error) {
            console.error(`❌ Failed to load/generate ${page.type}:`, error);
            updateLoadingProgress(page.type, true);
            return { success: false, pageId: page.id, pageType: page.type, error };
        }
    });

    // Wait for all generations to complete
    const results = await Promise.all(generationPromises);

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Generated descriptions for ${successCount}/${contentPages.length} pages in parallel`);

    return results;
}

async function loadSession() {
    console.log(`📂 Loading session ${EditorState.sessionId}...`);
    console.log(`[DEBUG] Session ID from URL: ${EditorState.sessionId}`);
    showLoading(true);
    updateLoadingProgress('session', false);

    // Safety timeout: Force close modal after 2 minutes max
    const loadingTimeout = setTimeout(() => {
        console.warn('⚠️ Loading timeout reached - forcing modal close');
        forceCloseLoadingModal();
    }, 120000);

    try {
        let sessionData = null;

        console.log('[DEBUG] Checking window.opener...');
        // Try to get data from window.opener first (avoids localStorage quota issues)
        if (window.opener && window.opener.brochureEditorData && window.opener.brochureSessionId === EditorState.sessionId) {
            sessionData = window.opener.brochureEditorData;
            EditorState.loadedFromWindowOpener = true;
            console.log('✅ Session loaded from window.opener (backend save disabled):', sessionData);
        } else {
            console.log('[DEBUG] window.opener not available, checking localStorage...');
            // Try localStorage first
            const sessionKey = `brochure_session_${EditorState.sessionId}`;
            console.log(`[DEBUG] localStorage key: ${sessionKey}`);
            const sessionDataStr = localStorage.getItem(sessionKey);
            console.log(`[DEBUG] localStorage data exists: ${!!sessionDataStr}`);

            if (sessionDataStr) {
                sessionData = JSON.parse(sessionDataStr);
                EditorState.loadedFromWindowOpener = false;
                console.log('✅ Session loaded from localStorage:', sessionData);
            } else {
                // Fallback to backend API
                console.log('[DEBUG] localStorage empty, falling back to API...');
                console.log('📡 Fetching session from backend API...');
                const apiUrl = `/api/brochure/session/${EditorState.sessionId}`;
                console.log(`[DEBUG] API URL: ${apiUrl}`);
                try {
                    const response = await fetch(apiUrl, {
                        credentials: 'include'
                    });
                    console.log(`[DEBUG] API response status: ${response.status}`);
                    if (!response.ok) {
                        throw new Error(`API returned ${response.status}`);
                    }
                    const apiData = await response.json();
                    console.log('📡 API response:', apiData);

                    // Transform API response to editor format
                    sessionData = apiData.data || {
                        property: apiData.property || {},
                        agent: apiData.agent || {},
                        photos: apiData.photos || [],
                        pages: apiData.pages || [],
                        generatedText: apiData.preferences?.generatedText || [],
                    };
                    // photo_urls is at root level of API response, not inside data
                    sessionData.photoUrls = apiData.photo_urls || {};
                    console.log('[DEBUG] Photo URLs from API:', apiData.photo_urls);
                    EditorState.loadedFromWindowOpener = false;
                    console.log('✅ Session loaded from backend API:', sessionData);
                } catch (apiError) {
                    console.error('❌ Failed to load from API:', apiError);
                    throw new Error(`Session not found: ${EditorState.sessionId}`);
                }
            }
        }

        // Store session data
        EditorState.sessionData = sessionData;
        EditorState.photoUrls = sessionData.photoUrls || {};

        // ===== AUTO-GENERATION: Create pages if requested and no pages exist =====
        const urlParams = new URLSearchParams(window.location.search);
        const shouldAutoGenerate = urlParams.get('autoGenerate') === 'true';
        const hasPhotos = sessionData.photos && sessionData.photos.length > 0;
        const hasNoPages = !sessionData.pages || sessionData.pages.length === 0;

        if (shouldAutoGenerate && hasPhotos && hasNoPages) {
            console.log('🚀 Auto-generating brochure pages...');
            console.log(`   Photos available: ${sessionData.photos.length}`);

            // Initialize UnifiedBrochureState with proper structure
            window.UnifiedBrochureState = window.UnifiedBrochureState || {};
            window.UnifiedBrochureState.property = sessionData.property || {};
            window.UnifiedBrochureState.agent = sessionData.agent || {};
            window.UnifiedBrochureState.photos = [];

            // Initialize categorizedPhotos with all required categories
            window.UnifiedBrochureState.categorizedPhotos = {
                cover: [],
                exterior: [],
                interior: [],
                kitchen: [],
                bedrooms: [],
                bathrooms: [],
                garden: []
            };

            // Helper function to normalize room_type to valid category
            const normalizeCategory = (roomType) => {
                if (!roomType) return 'interior';
                const type = roomType.toLowerCase();
                if (type.includes('exterior') || type.includes('front') || type.includes('building')) return 'exterior';
                if (type.includes('kitchen') || type.includes('cooking')) return 'kitchen';
                if (type.includes('bedroom') || type.includes('master')) return 'bedrooms';
                if (type.includes('bathroom') || type.includes('toilet') || type.includes('shower')) return 'bathrooms';
                if (type.includes('garden') || type.includes('outdoor') || type.includes('patio') || type.includes('yard')) return 'garden';
                if (type.includes('living') || type.includes('lounge') || type.includes('dining') || type.includes('reception')) return 'interior';
                return 'interior';
            };

            // Categorize each photo based on its analysis
            sessionData.photos.forEach((photo, index) => {
                const roomType = photo.analysis?.room_type || photo.category || 'interior';
                const category = normalizeCategory(roomType);

                const photoData = {
                    id: photo.id || `photo_${index + 1}`,
                    index: index,
                    name: photo.name || `Photo ${index + 1}`,
                    dataUrl: photo.dataUrl,
                    category: category,
                    roomType: roomType,
                    attributes: photo.analysis?.attributes || [],
                    caption: photo.analysis?.suggested_caption || ''
                };

                // Add to photos array
                window.UnifiedBrochureState.photos.push(photoData);

                // Add to categorized bucket
                if (!window.UnifiedBrochureState.categorizedPhotos[category]) {
                    window.UnifiedBrochureState.categorizedPhotos[category] = [];
                }
                window.UnifiedBrochureState.categorizedPhotos[category].push(photoData);

                console.log(`   📸 "${photoData.name}" → ${roomType} → ${category}`);
            });

            // Auto-assign cover if none exists
            if (window.UnifiedBrochureState.categorizedPhotos.cover.length === 0 &&
                window.UnifiedBrochureState.categorizedPhotos.exterior.length > 0) {
                const firstExterior = window.UnifiedBrochureState.categorizedPhotos.exterior[0];
                window.UnifiedBrochureState.categorizedPhotos.cover.push(firstExterior);
                console.log('   ✅ Auto-assigned first exterior as cover');
            }

            // Log categorization summary
            const summary = Object.entries(window.UnifiedBrochureState.categorizedPhotos)
                .filter(([_, photos]) => photos.length > 0)
                .map(([cat, photos]) => `${cat}: ${photos.length}`)
                .join(', ');
            console.log(`   📊 Categorization: ${summary}`);

            // Check if generateBrochurePages function exists (from unified_brochure_builder.js)
            if (typeof generateBrochurePages === 'function') {
                console.log('📄 Calling generateBrochurePages()...');
                const generatedPages = generateBrochurePages();

                if (generatedPages && generatedPages.length > 0) {
                    console.log(`✅ Generated ${generatedPages.length} pages`);
                    EditorState.sessionData.pages = generatedPages;

                    // Apply default template styling after a brief delay
                    setTimeout(() => {
                        if (typeof applyTemplateToAll === 'function') {
                            console.log('🎨 Applying default template (knight_frank_prestige)...');
                            applyTemplateToAll('knight_frank_prestige');
                        }
                        // Save session with generated pages
                        if (typeof saveSession === 'function') {
                            saveSession();
                            console.log('💾 Auto-generated session saved');
                        }
                    }, 500);
                } else {
                    console.warn('⚠️ generateBrochurePages() returned empty pages');
                }
            } else {
                console.warn('⚠️ generateBrochurePages function not found - ensure unified_brochure_builder.js is loaded');
            }
        }
        // ===== END AUTO-GENERATION =====

        // Update UI
        updatePropertyAddress();

        updateLoadingProgress('session', true);

        // Generate AI descriptions for all pages
        await generateAllPageDescriptions();
        EditorState._initialGenerationComplete = true;

        // Rendering phase
        updateLoadingProgress('rendering', false);

        // Use Knight Frank template for autoGenerate mode (professional 9-page layout)
        if (shouldAutoGenerate && typeof renderKnightFrankBrochure === 'function') {
            console.log('🏢 Using Knight Frank professional template...');

            // Save type→description mapping BEFORE KF replaces the pages array
            EditorState._descriptionsByType = {};
            const oldPages = EditorState.sessionData?.pages || [];
            for (const p of oldPages) {
                const desc = EditorState.pageDescriptions[p.id];
                if (desc && desc.length > 50 && p.type) {
                    EditorState._descriptionsByType[p.type] = desc;
                    console.log(`📝 Saved AI description for type '${p.type}' (${desc.length} chars)`);
                }
            }
            const kfSuccess = renderKnightFrankBrochure();
            if (!kfSuccess) {
                console.warn('⚠️ Knight Frank template failed, falling back to standard rendering');
                renderPages();
            }
        } else {
            renderPages();
        }
        populatePhotoGallerySidebar();

        // Wait for DOM to fully render before attaching handlers
        setTimeout(() => {
            // Attach photo swap click handlers if photo_gallery_manager is loaded
            if (typeof attachBrochurePhotoClickHandlers === 'function') {
                attachBrochurePhotoClickHandlers();
            }

            // Attach orange hover effects to all photo elements
            attachPhotoHoverEffects();

            // Save initial history state so undo has a baseline
            if (EditorState.history.length === 0) {
                saveToHistory('initial load');
                console.log('📝 Initial history state saved');
            }
        }, 100);

        updateLoadingProgress('rendering', true);

        updateStatus('ready', 'Ready');

        // Enable buttons
        document.getElementById('saveBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
        document.getElementById('repurposeBtn').disabled = false;

        // Start auto-save
        startAutoSave();

        // Clear safety timeout and close modal
        clearTimeout(loadingTimeout);
        showLoading(false);
        console.log('✅ Session loaded successfully, modal closed');

    } catch (error) {
        console.error('❌ Failed to load session:', error);
        showError('Failed to load brochure', error.message);
        updateStatus('error', 'Failed to load');
        clearTimeout(loadingTimeout);
        showLoading(false);
    }
}

async function saveSession() {
    if (!EditorState.isDirty) {
        console.log('💾 No changes to save');
        showToast('No changes to save');
        return;
    }

    // Skip backend save if loaded from window.opener (data is in memory only)
    if (EditorState.loadedFromWindowOpener) {
        console.log('💾 Changes tracked (in-memory session, no backend save)');
        EditorState.isDirty = false;
        updateStatus('ready', 'Changes tracked');
        showToast('Changes tracked in memory');

        setTimeout(() => {
            updateStatus('ready', 'Ready');
        }, 2000);
        return;
    }

    console.log('💾 Saving session to backend...');
    updateStatus('loading', 'Saving...');

    try {
        // Extract current state from DOM
        updateSessionDataFromDOM();

        const response = await fetch(`/api/brochure/session/${EditorState.sessionId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(EditorState.sessionData)
        });

        if (!response.ok) {
            throw new Error(`Failed to save: ${response.statusText}`);
        }

        console.log('✅ Session saved to backend');
        EditorState.isDirty = false;
        updateStatus('ready', 'Saved');
        showToast('Changes saved successfully');

        // Reset status after 2 seconds
        setTimeout(() => {
            updateStatus('ready', 'Ready');
        }, 2000);

    } catch (error) {
        console.error('❌ Failed to save session:', error);
        updateStatus('error', 'Save failed');
        showError('Failed to save changes', error.message);
    }
}

function startAutoSave() {
    // Auto-save every 30 seconds if there are changes
    EditorState.autoSaveInterval = setInterval(() => {
        if (EditorState.isDirty) {
            console.log('🔄 Auto-save triggered');
            saveSession();
        }
    }, 30000); // 30 seconds
}

function stopAutoSave() {
    if (EditorState.autoSaveInterval) {
        clearInterval(EditorState.autoSaveInterval);
        EditorState.autoSaveInterval = null;
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format price as £X,XXX,XXX or Guide Price £X.Xm
 */
function formatPrice(price) {
    if (!price) return '';
    const num = typeof price === 'string' ? parseInt(price.replace(/[^0-9]/g, '')) : price;
    if (isNaN(num)) return '';

    if (num >= 1000000) {
        const millions = num / 1000000;
        return `£${millions.toFixed(millions % 1 === 0 ? 0 : 2)}m`;
    }
    return `£${num.toLocaleString('en-GB')}`;
}

/**
 * Format feature name for display (underscores to spaces, title case)
 */
function formatFeatureName(feature) {
    if (!feature) return '';
    return feature
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get icon for a feature type
 */
function getFeatureIcon(feature) {
    const icons = {
        bedroom: '🛏️',
        bathroom: '🛁',
        garden: '🌳',
        parking: '🚗',
        garage: '🚙',
        kitchen: '🍳',
        fireplace: '🔥',
        pool: '🏊',
        gym: '💪',
        balcony: '🌅',
        terrace: '☀️',
        heating: '♨️',
        ensuite: '🚿',
        wardrobes: '👕',
        default: '✓'
    };

    const key = Object.keys(icons).find(k => feature.toLowerCase().includes(k));
    return icons[key] || icons.default;
}

// ============================================================================
// PAGE MANAGEMENT
// ============================================================================

function duplicateCurrentPage() {
    if (!EditorState.currentPage) {
        showToast('Please select a page to duplicate', 'warning');
        return;
    }

    const pages = EditorState.sessionData?.pages || [];
    // Use == for type-flexible comparison (page IDs can be numbers or strings)
    const currentPageIndex = pages.findIndex(p => String(p.id) === String(EditorState.currentPage));

    if (currentPageIndex === -1) {
        showToast('Page not found', 'error');
        return;
    }

    // Deep clone the current page
    const originalPage = pages[currentPageIndex];
    const duplicatedPage = JSON.parse(JSON.stringify(originalPage));

    // Generate new unique ID
    duplicatedPage.id = `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    duplicatedPage.title = (originalPage.title || originalPage.type) + ' (Copy)';

    // Insert after current page
    pages.splice(currentPageIndex + 1, 0, duplicatedPage);

    // Copy any descriptions
    if (EditorState.pageDescriptions[originalPage.id]) {
        EditorState.pageDescriptions[duplicatedPage.id] = EditorState.pageDescriptions[originalPage.id];
    }

    // Re-render pages
    renderPages();

    // Select the new page and save to history after render
    setTimeout(() => {
        selectPage(duplicatedPage.id);
        // Save to history AFTER the change is complete
        saveToHistory('duplicate page');
    }, 100);

    EditorState.isDirty = true;
    showToast('Page duplicated', 'success');
    console.log(`📋 Duplicated page: ${originalPage.title || originalPage.type}`);
}

// ============================================================================
// PAGE RENDERING
// ============================================================================

function renderPages() {
    console.log('🎨 Rendering pages...');

    const pageList = document.getElementById('pageList');
    const canvas = document.getElementById('brochureCanvas');

    pageList.innerHTML = '';
    canvas.innerHTML = '';

    if (!EditorState.sessionData || !EditorState.sessionData.pages) {
        console.warn('⚠️ No pages to render');
        return;
    }

    const pages = EditorState.sessionData.pages;

    console.log('📄 Pages to render:', pages.length, 'pages');
    pages.forEach((p, idx) => {
        console.log(`  Page ${idx + 1}: id=${p.id}, type=${p.type}, title=${p.title}`);
    });

    // Update page count
    document.getElementById('pageCount').textContent = `${pages.length} page${pages.length !== 1 ? 's' : ''}`;

    // Render each page
    pages.forEach((page, index) => {
        console.log(`🖼️ Rendering page ${index + 1} (type: ${page.type})`);
        renderPageListItem(page, index);
        renderPageCanvas(page, index);
    });

    // Select first page
    if (pages.length > 0) {
        selectPage(pages[0].id);
    }

    // Apply default zoom level after rendering
    setTimeout(() => {
        if (typeof setZoom === 'function') {
            setZoom(EditorState.zoomLevel);
            console.log(`🔍 Applied default zoom: ${Math.round(EditorState.zoomLevel * 100)}%`);
        }
    }, 100);

    // Drag/drop feature removed in cleanup
}

/**
 * Render Knight Frank template directly into the editor canvas
 * Uses KnightFrankTemplate.generate() for professional 9-page brochure layout
 */
function renderKnightFrankBrochure() {
    console.log('🏢 Rendering Knight Frank professional brochure...');

    const canvas = document.getElementById('brochureCanvas');
    const pageList = document.getElementById('pageList');

    if (!canvas) {
        console.error('❌ Canvas element not found');
        return false;
    }

    // Check if KnightFrankTemplate is available
    if (typeof KnightFrankTemplate === 'undefined') {
        console.warn('⚠️ KnightFrankTemplate not loaded, falling back to standard rendering');
        return false;
    }

    // Gather session data
    const sessionData = EditorState.sessionData || {};
    const property = sessionData.property || {};
    const rawPhotos = sessionData.photos || window.uploadedPhotos || [];
    const agent = sessionData.agent || {};
    const location = sessionData.location || {};

    // Resolve photo URLs from EditorState.photoUrls so KF template can display them
    // The session stores dataUrl as "FILE_STORED_photo_1" placeholders after upload,
    // but the real serving URLs are in EditorState.photoUrls (e.g. /api/brochure/session/{id}/photo/{id})
    const photos = rawPhotos.map(photo => {
        const resolved = { ...photo };
        const realUrl = EditorState.photoUrls?.[photo.id];
        if (realUrl) {
            resolved.url = realUrl;
        } else if (photo.dataUrl && !photo.dataUrl.startsWith('FILE_STORED')) {
            resolved.url = photo.dataUrl;
        }
        return resolved;
    });
    console.log('[KF] Resolved photo URLs:', photos.map(p => ({ id: p.id, url: p.url?.substring(0, 60) })));

    console.log('📊 Knight Frank template data:', {
        address: property.address,
        photos: photos.length,
        hasAgent: !!agent.name
    });

    // Read custom colors from session preferences (set on index.html color pickers)
    const prefs = sessionData.preferences || {};
    const cc = prefs.customColors || {};
    const brandPrimary = cc.primary || '#4A1420';
    const brandSecondary = cc.secondary || '#C4975A';
    const brandText = cc.text || '#3d3d3d';
    const brandBg = cc.background || '#ffffff';

    // Generate the Knight Frank brochure HTML
    const brochureHTML = KnightFrankTemplate.generate({
        property: property,
        photos: photos,
        location: location,
        agent: agent
    }, {
        brand: {
            primary: brandPrimary,
            secondary: brandSecondary,
            accent: brandPrimary,
            text: brandText,
            textLight: '#595959',
            background: brandBg,
            logoUrl: '/static/images/doorstep-logo.png'
        }
    });

    if (!brochureHTML) {
        console.error('❌ KnightFrankTemplate.generate() returned empty');
        return false;
    }

    // Clear canvas and page list
    canvas.innerHTML = '';
    pageList.innerHTML = '';

    // Create a temporary container to parse the HTML
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = brochureHTML;

    // Extract and inject styles from the template
    const styleEl = tempContainer.querySelector('style');
    if (styleEl) {
        // Remove any existing Knight Frank styles
        const existingStyle = document.getElementById('knight-frank-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Create new style element with scoped styles
        // Add overrides to reset editor's default .brochure-page styles
        // (display:flex, padding, flex-direction) which conflict with KF grid layouts
        const overrides = `
            /* Reset editor defaults for KF pages — editor CSS sets display:flex on .brochure-page */
            .brochure-page.cover-page,
            .brochure-page.summary-page,
            .brochure-page.location-page,
            .brochure-page.property-page,
            .brochure-page.bedrooms-page-v2,
            .brochure-page.floorplans-page,
            .brochure-page.gardens-page,
            .brochure-page.details-page,
            .brochure-page.back-cover {
                padding: 0 !important;
                flex-direction: unset !important;
            }
            /* Explicit grid/flex overrides per page type */
            .brochure-page.cover-page { display: block !important; }
            .brochure-page.summary-page { display: grid !important; grid-template-columns: 1fr 1fr !important; }
            .brochure-page.location-page { display: grid !important; grid-template-columns: 1fr !important; grid-template-rows: 0.45fr 0.55fr !important; }
            .brochure-page.property-page { display: grid !important; grid-template-columns: 1.2fr 1fr 0.8fr !important; }
            .brochure-page.bedrooms-page-v2 { display: grid !important; grid-template-columns: 1fr 1.2fr !important; }
            .bedrooms-page-v2 .bedroom-photos.photos-2 { grid-template-columns: 1fr !important; grid-template-rows: 1fr 1fr !important; }
            .bedrooms-page-v2 .bedroom-photos.photos-1 { grid-template-columns: 1fr !important; grid-template-rows: 1fr !important; }
            .brochure-page.floorplans-page { display: grid !important; grid-template-columns: 1fr 1fr !important; }
            .brochure-page.floorplans-page.photo-spread-page { display: grid !important; grid-template-columns: 1.4fr 1fr !important; }
            .brochure-page.gardens-page { display: grid !important; grid-template-columns: 1fr 1fr !important; }
            .brochure-page.details-page { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; }
            .brochure-page.details-page.no-map { grid-template-columns: 1.2fr 1fr !important; }
            .brochure-page.back-cover { display: block !important; }
            /* Ensure page footers render above grid content */
            .brochure-page .page-footer {
                position: absolute !important;
                bottom: 5mm !important;
                left: 15mm !important;
                right: 15mm !important;
                z-index: 50 !important;
                background: white !important;
            }
            /* Protect cover page overlay and content from editor interference */
            .brochure-page.cover-page .overlay {
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 10 !important;
                display: block !important;
            }
            .brochure-page.cover-page .cover-content {
                position: static !important;
                cursor: default !important;
            }
            .brochure-page.cover-page .design-element {
                position: static !important;
                cursor: default !important;
                transform: none !important;
            }
        `;
        const newStyle = document.createElement('style');
        newStyle.id = 'knight-frank-styles';
        newStyle.textContent = styleEl.textContent + overrides;
        document.head.appendChild(newStyle);
        console.log('🎨 Knight Frank styles injected with editor overrides');
    }

    // Create a container for the brochure
    const brochureContainer = document.createElement('div');
    brochureContainer.id = 'knight-frank-brochure';
    brochureContainer.innerHTML = tempContainer.querySelector('body')?.innerHTML || brochureHTML;

    // Extract individual pages from the generated HTML
    const generatedPages = brochureContainer.querySelectorAll('.brochure-page');
    console.log(`📄 Knight Frank template generated ${generatedPages.length} pages`);

    // Page type mapping for Knight Frank template
    const pageTypes = ['cover', 'summary', 'location', 'property', 'bedrooms', 'floorplan', 'gardens', 'details', 'back'];
    const pageTitles = ['Cover', 'Summary', 'Location', 'Property', 'Bedrooms', 'Floor Plan', 'Gardens', 'Details', 'Contact'];

    // Create session pages array and render each page
    EditorState.sessionData.pages = [];

    generatedPages.forEach((pageEl, index) => {
        const pageId = `kf_page_${index + 1}`;
        const pageType = pageTypes[index] || 'generic';
        const pageTitle = pageTitles[index] || `Page ${index + 1}`;

        // Add to session pages
        EditorState.sessionData.pages.push({
            id: pageId,
            type: pageType,
            title: pageTitle,
            photos: []
        });

        // Create canvas page wrapper — preserve the KF page-type CSS class
        // (e.g. "summary-page", "property-page", "bedrooms-page-v2")
        // so the template's grid/flex layouts apply correctly
        const canvasPage = document.createElement('div');
        canvasPage.className = pageEl.className || 'brochure-page';
        canvasPage.dataset.pageId = pageId;
        canvasPage.dataset.pageIndex = index;
        canvasPage.dataset.templateType = 'knight_frank';

        // Move the page content into the canvas wrapper
        canvasPage.innerHTML = pageEl.innerHTML;

        // Apply A4 landscape sizing
        // Reset editor's default .brochure-page styles (display:flex, padding)
        // which conflict with KF template's grid layouts
        canvasPage.style.cssText = `
            width: 297mm; height: 210mm; position: relative;
            overflow: hidden; margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 0; box-sizing: border-box;
        `;

        canvas.appendChild(canvasPage);

        // Create page list item
        const listItem = document.createElement('div');
        listItem.className = 'page-item';
        listItem.dataset.pageId = pageId;
        listItem.innerHTML = `
            <div class="page-thumbnail">
                <span class="page-number">${index + 1}</span>
            </div>
            <div class="page-info">
                <span class="page-title">${pageTitle}</span>
                <span class="page-type">${pageType}</span>
            </div>
        `;
        listItem.addEventListener('click', () => selectPage(pageId));
        pageList.appendChild(listItem);
    });

    // Update page count
    const pageCount = document.getElementById('pageCount');
    if (pageCount) {
        pageCount.textContent = `${generatedPages.length} pages`;
    }

    // Select first page
    if (EditorState.sessionData.pages.length > 0) {
        selectPage(EditorState.sessionData.pages[0].id);
    }

    // === Post-render: Replace generic KF text with AI-generated descriptions ===
    // Build type→description lookup from the OLD pages before they were replaced
    // The descriptions were generated with old page IDs, so we need this bridge
    if (!EditorState._descriptionsByType) {
        EditorState._descriptionsByType = {};
    }
    // This is populated in the calling code before renderKnightFrankBrochure runs
    injectAIDescriptionsIntoKnightFrank();

    // Make all text elements editable
    setTimeout(() => {
        makeKnightFrankEditable();
    }, 100);

    // Apply zoom
    setTimeout(() => {
        if (typeof setZoom === 'function') {
            setZoom(EditorState.zoomLevel);
        }
    }, 200);

    console.log('Knight Frank brochure rendered successfully');
    return true;
}

/**
 * Convert AI-generated text (which may contain markdown) into clean HTML paragraphs.
 * Strips markdown headers, bold markers, and splits into <p> tags.
 */
function formatAITextAsHTML(text) {
    if (!text) return '';
    if (text.includes('<p>')) return text; // Already HTML

    // Strip markdown headers (# Header, ## Header, etc.)
    let cleaned = text.replace(/^#{1,4}\s+.*$/gm, '');
    // Strip bold markdown (**text** or __text__)
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
    cleaned = cleaned.replace(/__(.*?)__/g, '$1');
    // Strip italic markdown (*text* or _text_)
    cleaned = cleaned.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '$1');
    // Strip bullet points (- item or * item)
    cleaned = cleaned.replace(/^[\-\*]\s+/gm, '');
    // Trim excess whitespace
    cleaned = cleaned.trim();

    // Split on double newlines into paragraphs
    return cleaned.split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => `<p>${p}</p>`)
        .join('\n');
}

/**
 * Inject AI-generated descriptions into Knight Frank template pages,
 * replacing the generic locally-generated text.
 *
 * Note: AI descriptions were generated BEFORE renderKnightFrankBrochure()
 * replaced the pages array, so descriptions are keyed by OLD page IDs.
 * We build a type-based lookup to bridge the gap.
 */
function injectAIDescriptionsIntoKnightFrank() {
    const descriptions = EditorState.pageDescriptions || {};
    const pages = EditorState.sessionData?.pages || [];

    if (Object.keys(descriptions).length === 0) {
        console.log('⚠️ No AI descriptions available to inject');
        return;
    }

    console.log('🔄 Injecting AI descriptions into Knight Frank template...');
    console.log('📋 Available descriptions:', Object.keys(descriptions).map(id => `${id} (${descriptions[id]?.length || 0} chars)`));

    // Build a lookup of descriptions by page TYPE from the original descriptions
    // The old page IDs may no longer match, so we extract type info from the descriptions
    const descByType = {};
    for (const [pageId, desc] of Object.entries(descriptions)) {
        if (!desc || desc.length < 50) continue;
        // Try to determine the type from the page ID pattern (e.g. "page_kitchen_1" or just use stored type)
        // The old pages stored type info - check if any pages still reference it
        const typeMatch = pageId.match(/^page_(\w+)_/) || pageId.match(/^(\w+)_page_/);
        if (typeMatch) {
            descByType[typeMatch[1]] = desc;
        }
        // Also store by raw ID for direct lookup
        descByType[pageId] = desc;
    }

    // Also try to find types from the description content/keys directly
    // The generateAllPageDescriptions stored results with old page objects that had .type
    // We can reconstruct by checking EditorState._originalPages if we saved them
    // Fallback: just use all descriptions in order they map to KF pages

    // Map KF page types to the AI description page types
    const kfToAiTypeMap = {
        'location': ['location'],
        'property': ['kitchen', 'living'],
        'bedrooms': ['bedrooms'],
        'gardens': ['garden', 'exterior']
    };

    // Map KF page types to their editable content selectors in the DOM
    const kfEditableSelectors = {
        'location': '[data-editable="location"]',
        'property': '[data-editable="property-description"]',
        'bedrooms': '[data-editable="bedroom-description"]',
        'gardens': '[data-editable="garden-description"]'
    };

    let injected = 0;

    pages.forEach(page => {
        const aiTypes = kfToAiTypeMap[page.type];
        if (!aiTypes) return;

        // Strategy 1: Direct lookup by page ID
        let aiText = descriptions[page.id];

        // Strategy 2: Use the pre-saved type→description map (most reliable)
        const savedByType = EditorState._descriptionsByType || {};
        if (!aiText || aiText.length < 50) {
            for (const aiType of aiTypes) {
                if (savedByType[aiType] && savedByType[aiType].length > 50) {
                    aiText = savedByType[aiType];
                    console.log(`  Found description for ${page.type} via saved type '${aiType}'`);
                    break;
                }
            }
        }

        // Strategy 3: Lookup by type name in the descByType map (parsed from IDs)
        if (!aiText || aiText.length < 50) {
            for (const aiType of aiTypes) {
                if (descByType[aiType] && descByType[aiType].length > 50) {
                    aiText = descByType[aiType];
                    break;
                }
            }
        }

        // Strategy 4: Search all descriptions for ones whose IDs contain the target type
        if (!aiText || aiText.length < 50) {
            for (const aiType of aiTypes) {
                for (const [descId, desc] of Object.entries(descriptions)) {
                    if (desc && desc.length > 50 && descId.toLowerCase().includes(aiType)) {
                        aiText = desc;
                        break;
                    }
                }
                if (aiText && aiText.length > 50) break;
            }
        }

        if (!aiText || aiText.length < 50) return;

        // Find the DOM element for this page
        const selector = kfEditableSelectors[page.type];
        if (!selector) return;

        const pageEl = document.querySelector(`[data-page-id="${page.id}"] ${selector}`);
        if (!pageEl) {
            // Fallback: try to find by page class
            const classMap = {
                'location': '.location-page',
                'property': '.property-page',
                'bedrooms': '.bedrooms-page-v2',
                'gardens': '.gardens-page'
            };
            const classSelector = classMap[page.type];
            if (!classSelector) return;
            const fallbackEl = document.querySelector(`#brochureCanvas ${classSelector} ${selector}`);
            if (!fallbackEl) {
                console.warn(`⚠️ Could not find DOM element for ${page.type} page`);
                return;
            }
            // Use fallback element
            const formattedText = formatAITextAsHTML(aiText);
            fallbackEl.innerHTML = formattedText;
            injected++;
            console.log(`✅ Injected AI description into ${page.type} page via class fallback (${aiText.length} chars)`);
            return;
        }

        // Convert plain text to paragraphs if needed, stripping markdown headers
        const formattedText = formatAITextAsHTML(aiText);

        pageEl.innerHTML = formattedText;
        injected++;
        console.log(`✅ Injected AI description into ${page.type} page (${aiText.length} chars)`);

        // Also update EditorState.pageDescriptions with the new KF page ID
        EditorState.pageDescriptions[page.id] = aiText;
    });

    console.log(`🔄 Injected ${injected} AI descriptions into Knight Frank template`);
}

/**
 * Make Knight Frank template elements editable
 */
function makeKnightFrankEditable() {
    console.log('✏️ Making Knight Frank elements editable...');

    // Make all text elements editable
    const editableSelectors = [
        'h1', 'h2', 'h3', 'h4', 'p',
        '.property-name', '.cover-title', '.cover-price',
        '.section-title', '.text-content',
        '.stat-value', '.stat-label',
        '.detail-value', '.detail-label'
    ];

    editableSelectors.forEach(selector => {
        document.querySelectorAll(`#brochureCanvas .brochure-page ${selector}`).forEach(el => {
            if (!el.querySelector('img') && el.textContent.trim()) {
                el.setAttribute('contenteditable', 'true');
                el.classList.add('editable-text');
                el.style.cursor = 'text';

                // Add edit indicator on hover
                el.addEventListener('mouseenter', function() {
                    if (!this.classList.contains('editing')) {
                        this.style.outline = '2px dashed rgba(0,51,102,0.3)';
                    }
                });
                el.addEventListener('mouseleave', function() {
                    if (!this.classList.contains('editing')) {
                        this.style.outline = '';
                    }
                });
                el.addEventListener('focus', function() {
                    this.classList.add('editing');
                    this.style.outline = '2px solid #003366';
                    EditorState.isDirty = true;
                });
                el.addEventListener('blur', function() {
                    this.classList.remove('editing');
                    this.style.outline = '';
                });
            }
        });
    });

    // Make images selectable for swapping
    document.querySelectorAll('#brochureCanvas .brochure-page img').forEach(img => {
        img.classList.add('photo-element');
        img.style.cursor = 'pointer';

        img.addEventListener('click', function(e) {
            e.stopPropagation();
            // Highlight selected image
            document.querySelectorAll('.photo-element.selected').forEach(el => {
                el.classList.remove('selected');
                el.style.outline = '';
            });
            this.classList.add('selected');
            this.style.outline = '3px solid #f59e0b';
            EditorState.selectedPhoto = this;
        });

        img.addEventListener('mouseenter', function() {
            if (!this.classList.contains('selected')) {
                this.style.boxShadow = 'inset 0 0 0 4px #f59e0b, 0 4px 12px rgba(245, 158, 11, 0.4)';
            }
        });
        img.addEventListener('mouseleave', function() {
            if (!this.classList.contains('selected')) {
                this.style.boxShadow = '';
            }
        });
    });

    console.log('✅ Knight Frank elements made editable');
}

// Expose globally
window.renderKnightFrankBrochure = renderKnightFrankBrochure;

function attachPhotoHoverEffects() {
    console.log('🎨 Attaching orange hover effects to photo elements...');

    const photoElements = document.querySelectorAll('.photo-element');
    let count = 0;

    photoElements.forEach(photoEl => {
        // Remove old listeners to avoid duplicates
        photoEl.onmouseenter = null;
        photoEl.onmouseleave = null;

        // Add hover effect
        photoEl.addEventListener('mouseenter', function() {
            this.style.boxShadow = 'inset 0 0 0 4px #f59e0b, 0 4px 12px rgba(245, 158, 11, 0.4)';
            this.style.filter = 'brightness(1.1)';
        });

        photoEl.addEventListener('mouseleave', function() {
            this.style.boxShadow = '';
            this.style.filter = '';
        });

        count++;
    });

    console.log(`✅ Orange hover effects attached to ${count} photo elements`);
}

function populatePhotoGallerySidebar() {
    console.log('📸 Populating photo gallery sidebar...');

    const galleryList = document.getElementById('photoGalleryList');
    const photoCountEl = document.getElementById('photoCount');

    if (!galleryList) {
        console.warn('⚠️ Photo gallery list element not found');
        return;
    }

    // Clear existing content
    galleryList.innerHTML = '';

    // Collect all photos from all pages
    const allPhotos = [];

    // First, check for unassigned photos in the session root (from API load)
    if (EditorState.sessionData && EditorState.sessionData.photos && EditorState.sessionData.photos.length > 0) {
        console.log(`📸 Found ${EditorState.sessionData.photos.length} photos in session root`);
        EditorState.sessionData.photos.forEach((photo, photoIndex) => {
            console.log(`   - Unassigned photo ${photoIndex + 1}: ${photo.name || photo.id || 'unnamed'}`);
            allPhotos.push({
                photo: photo,
                pageId: 'unassigned',
                pageTitle: 'Unassigned',
                photoIndex: photoIndex
            });
        });
    }

    // Then collect photos from pages
    if (EditorState.sessionData && EditorState.sessionData.pages) {
        console.log(`📄 Processing ${EditorState.sessionData.pages.length} pages for photos...`);
        EditorState.sessionData.pages.forEach((page, pageIndex) => {
            console.log(`   Page ${pageIndex + 1} (${page.type}): ${page.photos?.length || 0} photos`);
            if (page.photos && page.photos.length > 0) {
                page.photos.forEach((photo, photoIndex) => {
                    // Skip if this photo is already in allPhotos (avoid duplicates)
                    const isDuplicate = allPhotos.some(p => p.photo.id === photo.id);
                    if (!isDuplicate) {
                        console.log(`      - Photo ${photoIndex + 1}: ${photo.name || photo.id || 'unnamed'}`);
                        allPhotos.push({
                            photo: photo,
                            pageId: page.id,
                            pageTitle: page.title || `Page ${pageIndex + 1}`,
                            photoIndex: photoIndex
                        });
                    }
                });
            }
        });
    }

    // Update photo count
    if (photoCountEl) {
        photoCountEl.textContent = `${allPhotos.length} photo${allPhotos.length !== 1 ? 's' : ''}`;
    }

    console.log(`📸 Found ${allPhotos.length} photos across all pages`);
    console.log(`📸 Photo names in gallery: ${allPhotos.map(p => p.photo.name || p.photo.id).join(', ')}`);

    // Debug: log available photo URLs
    console.log('[DEBUG] EditorState.photoUrls:', EditorState.photoUrls);

    // Render each photo
    allPhotos.forEach(({ photo, pageId, pageTitle, photoIndex }, index) => {
        const photoId = photo.id || `photo-${pageId}-${photoIndex}`;
        // Try multiple URL sources
        let photoUrl = EditorState.photoUrls[photoId] || '';
        if (!photoUrl && photo.dataUrl && !photo.dataUrl.startsWith('FILE_STORED')) {
            photoUrl = photo.dataUrl;
        }
        if (!photoUrl) {
            photoUrl = photo.url || '';
        }
        console.log(`[DEBUG] Photo ${photoId}: URL = ${photoUrl ? photoUrl.substring(0, 50) + '...' : 'EMPTY'}`);
        const photoName = photo.name || photo.caption || `Photo ${index + 1}`;

        const photoItem = document.createElement('div');
        photoItem.className = 'gallery-photo-item';
        photoItem.dataset.photoId = photoId;
        photoItem.dataset.pageId = pageId;
        photoItem.dataset.photoIndex = photoIndex;

        photoItem.innerHTML = `
            <img src="${photoUrl}" alt="${photoName}">
            <div class="photo-label">${photoName}</div>
        `;

        // Click to select photo (green border) - allows switching selection
        photoItem.addEventListener('click', function(e) {
            e.stopPropagation();

            const wasSelected = this.classList.contains('selected');

            // Remove selected class from all photos
            document.querySelectorAll('.gallery-photo-item').forEach(item => {
                item.classList.remove('selected');
            });

            // Toggle selection on clicked photo
            if (!wasSelected) {
                this.classList.add('selected');

                // Store selected photo in PhotoGalleryState if available
                if (typeof PhotoGalleryState !== 'undefined') {
                    PhotoGalleryState.selectedPhoto = { photoId, pageId };
                }

                console.log(`📸 Selected photo: ${photoName} from ${pageTitle}`);
                console.log(`💡 Click on any photo in the brochure to swap it with this one`);
            } else {
                // Deselect if clicking the same photo
                if (typeof PhotoGalleryState !== 'undefined') {
                    PhotoGalleryState.selectedPhoto = null;
                }
                console.log(`📸 Deselected photo`);
            }
        });

        galleryList.appendChild(photoItem);
    });

    console.log('✅ Photo gallery sidebar populated');
}

function renderPageListItem(page, index) {
    const pageList = document.getElementById('pageList');

    const item = document.createElement('div');
    item.className = 'page-item';
    item.dataset.pageId = page.id;
    item.onclick = () => selectPage(page.id);

    item.innerHTML = `
        <div class="page-thumbnail">
            <span>Page ${index + 1}</span>
        </div>
        <div class="page-info">
            <div class="page-title">${page.title || 'Untitled'}</div>
            <div class="page-type">${page.type || 'general'}</div>
        </div>
    `;

    pageList.appendChild(item);
}

function renderPageCanvas(page, index) {
    const canvas = document.getElementById('brochureCanvas');

    const pageEl = document.createElement('div');
    pageEl.className = 'brochure-page';
    pageEl.dataset.pageId = page.id;
    pageEl.dataset.pageIndex = index;

    if (EditorState.showGuides) {
        pageEl.classList.add('show-guides');
    }

    // Render directly into pageEl (no wrapper needed)
    switch (page.type) {
        case 'cover':
            renderCoverPage(pageEl, page);
            break;
        case 'overview':
        case 'hero_intro':
            renderPropertyOverviewPage(pageEl, page);
            break;
        case 'details':
            renderDetailsPage(pageEl, page);
            break;
        case 'gallery':
            renderGalleryPage(pageEl, page);
            break;
        case 'location':
            renderLocationPage(pageEl, page);
            break;
        case 'floorplan':
            renderFloorplanPage(pageEl, page);
            break;
        default:
            renderGenericPage(pageEl, page);
    }

    canvas.appendChild(pageEl);
}

function renderCoverPage(container, page) {
    // Cover page: full photo with text overlay + layout controls
    const property = EditorState.sessionData.property || {};
    const houseName = property.houseName || page.title || 'Property Name';
    const address = property.address || 'Address';
    const postcode = property.postcode ? property.postcode.toUpperCase() : '';
    const price = property.price ? formatPrice(property.price) : '';
    const propertyType = property.property_type || property.propertyType || 'Property';
    const bedrooms = property.bedrooms || '';
    const bathrooms = property.bathrooms || '';

    // Format property type nicely
    const typeLabel = propertyType.charAt(0).toUpperCase() + propertyType.slice(1).replace(/_/g, ' ');

    // Text content (reusable across layouts)
    const titleText = `<h1 class="editable cover-title" contenteditable="true" data-field="title">
        ${houseName}
    </h1>`;

    const subtitleText = `<p class="cover-subtitle">
        ${address}${postcode ? ', ' + postcode : ''}
    </p>`;

    // Premium badge with property type
    const badgeHTML = `<div class="cover-badge">${typeLabel}</div>`;

    // Price display
    const priceHTML = price ? `<div class="cover-price">${price}</div>` : '';

    const logoHTML = `<img src="savills-logo.png" alt="Savills" class="cover-logo">`;

    // Use layout system
    const currentLayout = page.layout || 'photos-only';
    let layoutHTML = '';

    // Get first exterior photo for cover - prioritize exterior/front photos
    const exteriorPhotos = (EditorState.sessionData.photos || []).filter(p =>
        p.category === 'exterior' || p.category === 'front' || p.roomType === 'exterior'
    );
    const coverPhoto = exteriorPhotos[0] || (EditorState.sessionData.photos || [])[0];

    // Use page.photos if available, otherwise use the auto-found cover photo
    const photosForCover = (page.photos && page.photos.length > 0) ? page.photos : (coverPhoto ? [coverPhoto] : []);

    // Render based on selected layout
    switch (currentLayout) {
        case 'photos-only':
            // Full-page hero photo with overlay text (PREMIUM Canva-style cover page)
            layoutHTML = `
                <div class="cover-page" style="width: 100%; height: 100%; position: relative; padding: 0 !important;">
                    ${renderLayoutControls(page.id)}

                    <!-- Hero Background Image -->
                    <div class="cover-hero">
                        ${renderPhotoSection(photosForCover, '100%', '100%', 'photos-only', page.id)}
                    </div>

                    <!-- Dark Gradient Overlay -->
                    <div class="cover-overlay"></div>

                    <!-- Content Overlay -->
                    <div class="cover-content">
                        ${badgeHTML}
                        <h1 class="editable cover-title" contenteditable="true" data-field="title">
                            ${houseName}
                        </h1>
                        <p class="cover-subtitle">
                            ${address}${postcode ? ', ' + postcode : ''}
                        </p>
                        ${priceHTML}
                    </div>

                    ${logoHTML}
                </div>
            `;
            break;

        case 'photo-left':
            layoutHTML = `
                <div style="width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: center; position: relative;">
                    <div style="position: relative; height: 100%;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(photosForCover, '100%', '100%', 'photo-left', page.id)}
                    </div>
                    <div style="text-align: center; padding: 40px;">
                        ${titleText}
                        ${subtitleText}
                    </div>
                    ${logoHTML}
                </div>
            `;
            break;

        case 'photo-right':
            layoutHTML = `
                <div style="width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: center; position: relative;">
                    <div style="text-align: center; padding: 40px;">
                        ${titleText}
                        ${subtitleText}
                    </div>
                    <div style="position: relative; height: 100%;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(photosForCover, '100%', '100%', 'photo-right', page.id)}
                    </div>
                    ${logoHTML}
                </div>
            `;
            break;

        case 'text-top':
            layoutHTML = `
                <div style="width: 100%; height: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box; position: relative;">
                    <div style="text-align: center; padding: 40px 40px 20px 40px;">
                        ${titleText}
                        ${subtitleText}
                    </div>
                    <div style="position: relative; flex: 1;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(photosForCover, '100%', '100%', 'text-top', page.id)}
                    </div>
                    ${logoHTML}
                </div>
            `;
            break;

        case 'text-bottom':
            layoutHTML = `
                <div style="width: 100%; height: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box; position: relative;">
                    <div style="position: relative; flex: 1;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(photosForCover, '100%', '100%', 'text-bottom', page.id)}
                    </div>
                    <div style="text-align: center; padding: 20px 40px 40px 40px;">
                        ${titleText}
                        ${subtitleText}
                    </div>
                    ${logoHTML}
                </div>
            `;
            break;

        default:
            // Default to full-page hero (photos-only)
            layoutHTML = `
                <div style="width: 100%; height: 100%; position: relative;">
                    ${renderLayoutControls(page.id)}
                    ${renderPhotoSection(photosForCover, '100%', '100%', 'photos-only', page.id)}

                    <!-- Property Name Overlay (centered bottom) -->
                    <div style="position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%); text-align: center; z-index: 10;">
                        <h1 class="editable" contenteditable="true" data-field="title" style="font-size: 48px; font-weight: 400; color: white; margin: 0 0 8px 0; text-shadow: 2px 2px 8px rgba(0,0,0,0.7); letter-spacing: 2px; font-family: serif;">
                            ${houseName}
                        </h1>
                        <p style="font-size: 16px; font-weight: 300; color: white; margin: 0; text-shadow: 1px 1px 4px rgba(0,0,0,0.7); letter-spacing: 1px;">
                            ${address}${postcode ? ', ' + postcode : ''}
                        </p>
                    </div>

                    ${logoHTML}
                </div>
            `;
            break;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
}

function renderPropertyOverviewPage(container, page) {
    // Property Overview page: photos + property details + features + agent contact with layout controls
    const property = EditorState.sessionData.property || {};
    const content = page.content || {};
    // Prioritize content.agent for new 'overview' pages, fallback to session agent
    const agent = content.agent || EditorState.sessionData.agent || {};

    // Format guide price (prioritize content.price for new pages, fallback to property.askingPrice)
    const priceValue = content.price || property.askingPrice;
    const guidePrice = priceValue
        ? `£${parseInt(priceValue.replace(/[£,]/g, '')).toLocaleString()}`
        : 'Price on Request';

    // Get property description
    const description = content.description || content['description-part2'] ||
        'Exceptional property offering outstanding accommodation in this sought-after location.';

    // Separate features into Essential and Beneficial
    // Prioritize content.features (for new 'overview' pages), fallback to property.features (for legacy 'hero_intro')
    const allFeatures = content.features || property.features || [];

    console.log('🏠 Property Overview - Features Debug:', {
        totalFeatures: allFeatures.length,
        features: allFeatures,
        property: property
    });

    console.log('👤 Property Overview - Agent Debug:', {
        agent: agent,
        hasName: !!agent.name,
        hasPhone: !!agent.phone,
        hasEmail: !!agent.email,
        contentAgent: content.agent,
        sessionAgent: EditorState.sessionData?.agent
    });

    // Essential features (bedrooms/bathrooms)
    const essentialFeaturesList = [
        '1_bedroom', '2_bedrooms', '3_bedrooms', '4_bedrooms', '5_bedrooms',
        'master_bedroom', 'ensuite_bedroom', 'double_bedroom', 'single_bedroom',
        '1_bathroom', '2_bathrooms', '3_bathrooms', 'ensuite', 'family_bathroom',
        'shower_room', 'downstairs_wc', 'bath_shower', 'separate_shower'
    ];

    const essentialFeatures = allFeatures.filter(f => essentialFeaturesList.includes(f));
    const beneficialFeatures = allFeatures.filter(f => !essentialFeaturesList.includes(f));

    // Format feature names for display
    const formatFeatureName = (feature) => {
        return feature
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/(\d+)/, '$1 ')
            .replace(/Wc/, 'WC')
            .replace(/Ensuite/, 'En-suite');
    };

    // Build key stats HTML (bedrooms, bathrooms, property type)
    const bedroomCount = essentialFeatures.find(f => f.match(/(\d+)_bedroom/))?.match(/(\d+)/)?.[1] || property.bedrooms || '—';
    const bathroomCount = essentialFeatures.find(f => f.match(/(\d+)_bathroom/))?.match(/(\d+)/)?.[1] || property.bathrooms || '—';
    const propType = property.property_type || property.propertyType || 'Property';

    const keyStatsHTML = `
        <div class="key-stats">
            <div class="key-stat">
                <div class="key-stat-value">${bedroomCount}</div>
                <div class="key-stat-label">Bedrooms</div>
            </div>
            <div class="key-stat">
                <div class="key-stat-value">${bathroomCount}</div>
                <div class="key-stat-label">Bathrooms</div>
            </div>
            <div class="key-stat">
                <div class="key-stat-value">${propType.charAt(0).toUpperCase() + propType.slice(1)}</div>
                <div class="key-stat-label">Property Type</div>
            </div>
        </div>
    `;

    // Build feature pills HTML (Canva-style)
    const featurePillsHTML = beneficialFeatures.length > 0
        ? `<div class="feature-pills">
            ${beneficialFeatures.slice(0, 8).map(f => {
                const icon = getFeatureIcon(f);
                return `<span class="feature-pill"><span class="feature-pill-icon">${icon}</span> ${formatFeatureName(f)}</span>`;
            }).join('')}
           </div>`
        : '';

    // Legacy list format (kept for compatibility)
    const essentialHTML = essentialFeatures.length > 0
        ? `<ul style="list-style: none; margin: 0; padding: 0; line-height: 1.5;">
            ${essentialFeatures.map(f => `<li style="padding: 2px 0; color: #1a1a1a; font-size: 12px;">• ${formatFeatureName(f)}</li>`).join('')}
           </ul>`
        : '<p style="color: #666; font-style: italic; font-size: 11px; margin: 0;">No essential features specified</p>';

    // Build beneficial features HTML (legacy)
    const beneficialHTML = beneficialFeatures.length > 0
        ? `<ul style="list-style: none; margin: 0; padding: 0; line-height: 1.5;">
            ${beneficialFeatures.map(f => `<li style="padding: 2px 0; color: #1a1a1a; font-size: 12px;">• ${formatFeatureName(f)}</li>`).join('')}
           </ul>`
        : '<p style="color: #666; font-style: italic; font-size: 11px; margin: 0;">No beneficial features specified</p>';

    // Build agent contact HTML
    const agentHTML = agent.name
        ? `<div style="margin-top: 10px;">
            <p style="font-size: 13px; font-weight: 700; color: #1a1a1a; margin: 0 0 6px 0;">
                ${agent.name}
            </p>
            <p style="font-size: 12px; line-height: 1.5; margin: 0; color: #1a1a1a;">
                ${agent.phone ? `${agent.phone}<br>` : ''}
                ${agent.email ? `${agent.email}` : ''}
            </p>
           </div>`
        : '';

    // Build the property details content (reusable across layouts) - PREMIUM STYLE
    const detailsContent = `
        <div>
            <!-- Premium Section Header -->
            <div class="section-header">
                <h2 class="editable section-title" contenteditable="true" data-field="title">
                    ${page.title || 'Property Overview'}
                </h2>
            </div>

            <!-- Guide Price - Premium Style -->
            <div style="margin: 0 0 15px 0;">
                <p style="font-family: var(--font-display); font-size: 28px; font-weight: 600; color: var(--doorstep-red); margin: 0;">
                    ${guidePrice}
                </p>
            </div>

            <!-- Key Stats Row -->
            ${keyStatsHTML}

            <!-- Property Description - Premium Typography -->
            <div class="editable" contenteditable="true" data-field="description" style="font-family: var(--font-serif); font-size: 15px; line-height: 1.8; color: #2d2d2d; margin: 0 0 20px 0;">
                ${description}
            </div>
        </div>

        <!-- Feature Pills - Canva Style -->
        ${featurePillsHTML}

        <!-- Agent Contact Details -->
        ${agentHTML}
    `;

    // Use layout system
    const currentLayout = page.layout || 'photo-left';
    let layoutHTML = '';

    // Render based on selected layout
    switch (currentLayout) {
        case 'photo-left':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.3fr; gap: 30px; padding: 30px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id)}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${detailsContent}
                    </div>
                </div>
            `;
            break;

        case 'photo-right':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1.3fr 1fr; gap: 30px; padding: 30px; box-sizing: border-box; align-items: start;">
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${detailsContent}
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photo-right', page.id)}
                    </div>
                </div>
            `;
            break;

        case 'text-top':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 30px; box-sizing: border-box;">
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${detailsContent}
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-top', page.id)}
                    </div>
                </div>
            `;
            break;

        case 'text-bottom':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 30px; box-sizing: border-box;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-bottom', page.id)}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${detailsContent}
                    </div>
                </div>
            `;
            break;

        case 'photos-only':
            layoutHTML = `
                <div style="width: 100%; padding: 30px; box-sizing: border-box;">
                    <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0 0 20px 0; letter-spacing: -0.5px;">
                        ${page.title || 'Property Overview'}
                    </h2>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photos-only', page.id)}
                    </div>
                </div>
            `;
            break;

        default:
            // Default to photo-left
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.3fr; gap: 30px; padding: 30px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id)}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${detailsContent}
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
}

function renderDetailsPage(container, page) {
    // Details page: property description + key features + layout controls
    const content = page.content || {};

    // Use AI-generated text if available, otherwise use page content or placeholder
    const description = EditorState.generatedText || content.description || 'Enter property description here...';
    const features = EditorState.generatedFeatures || content.features;

    console.log('🎨 Rendering details page with:', {
        hasGeneratedText: !!EditorState.generatedText,
        hasGeneratedFeatures: !!EditorState.generatedFeatures,
        descriptionLength: description?.length || 0,
        featuresCount: features?.length || 0
    });

    // Use layout system for details page
    const currentLayout = page.layout || 'photo-right';

    // Build text content combining description and features
    const textContent = `
        <div class="editable" contenteditable="true" data-field="description" style="font-size: 14px; line-height: 1.8; color: #2c3e50; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; margin-bottom: 20px;">
            ${description}
        </div>
        <div>
            <h3 style="font-size: 20px; font-weight: 600; color: var(--savills-red); margin-bottom: 10px; border-bottom: 2px solid var(--savills-yellow); padding-bottom: 8px;">Key Features</h3>
            <div class="editable" contenteditable="true" data-field="features" style="font-size: 14px; line-height: 2; color: #2c3e50;">
                ${renderFeaturesList(features)}
            </div>
        </div>
    `;

    let layoutHTML = '';

    // Render based on selected layout
    switch (currentLayout) {
        case 'photo-left':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id) : ''}
                    </div>
                    <div>
                        <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 15px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                            ${page.title || 'Property Details'}
                        </h2>
                        ${textContent}
                    </div>
                </div>
            `;
            break;

        case 'photo-right':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div>
                        <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 15px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                            ${page.title || 'Property Details'}
                        </h2>
                        ${textContent}
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-right', page.id) : ''}
                    </div>
                </div>
            `;
            break;

        case 'text-top':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div>
                        <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 15px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                            ${page.title || 'Property Details'}
                        </h2>
                        ${textContent}
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-top', page.id)}
                    </div>
                </div>
            `;
            break;

        case 'text-bottom':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-bottom', page.id)}
                    </div>
                    <div>
                        <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 15px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                            ${page.title || 'Property Details'}
                        </h2>
                        ${textContent}
                    </div>
                </div>
            `;
            break;

        case 'photos-only':
            layoutHTML = `
                <div style="width: 100%; padding: 20px; box-sizing: border-box;">
                    <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                        ${page.title || 'Property Details'}
                    </h2>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photos-only', page.id)}
                    </div>
                </div>
            `;
            break;

        default:
            // Default to photo-right layout
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div>
                        <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 15px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                            ${page.title || 'Property Details'}
                        </h2>
                        ${textContent}
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-right', page.id) : ''}
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
}

function renderGalleryPage(container, page) {
    // Gallery page: grid of photos with Savills branding + layout controls
    const photoCount = page.photos ? page.photos.length : 0;

    if (photoCount === 0) {
        container.innerHTML = `
            <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 16px;">
                No photos assigned to this page
            </div>
        `;
        return;
    }

    // Use layout system for gallery page
    const currentLayout = page.layout || 'photos-only';
    const description = page.content?.description || 'Gallery of property photographs showcasing the finest features of this exceptional home.';

    let layoutHTML = '';

    // Render based on selected layout
    switch (currentLayout) {
        case 'photo-left':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id) : ''}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Photo Gallery'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'photo-right':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Photo Gallery'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-right', page.id) : ''}
                    </div>
                </div>
            `;
            break;

        case 'text-top':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Photo Gallery'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 13px; line-height: 1.7; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-top', page.id)}
                    </div>
                </div>
            `;
            break;

        case 'text-bottom':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-bottom', page.id)}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Photo Gallery'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 13px; line-height: 1.7; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'photos-only':
        default:
            // Photos-only layout - Pure photo showcase (default for gallery)
            layoutHTML = `
                <div style="width: 100%; padding: 20px; box-sizing: border-box;">
                    <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 10px;">
                        ${page.title || 'Photo Gallery'}
                    </h2>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photos-only', page.id)}
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
}

// Generate AI location description for Cranleigh
async function generateLocationDescription(locationName) {
    const prompt = `Write a concise, factual description of ${locationName}, Surrey for a property brochure. Cover in 2-3 short paragraphs:

- Local character and key amenities (shops, cafes, restaurants)
- Schools and transport links to London
- Proximity to Surrey Hills AONB

Write 80-100 words total. Professional tone. Be specific and factual. NO flowery language, NO excessive praise. State facts only.`;

    console.log('📍 Generating location description with prompt:', prompt.substring(0, 150) + '...');

    const response = await fetch('/generate/room', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: prompt,
            target_words: 90,
            session_id: EditorState.sessionId
        })
    });

    if (!response.ok) {
        throw new Error(`AI generation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || data.description || 'Failed to generate location description.';
}

async function renderLocationPage(container, page) {
    // Location page: area description + amenities with Savills branding
    const content = page.content || {};

    // Check if AI generation is needed
    if (content.generateAI && !content.location_description) {
        console.log('🤖 Generating AI content for location page...');

        // Show loading state
        container.innerHTML = `
            <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <div style="text-align: center;">
                    <h2 style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin-bottom: 15px;">${page.title || 'The Location'}</h2>
                    <p style="font-size: 14px; color: #666;">✨ Generating location description...</p>
                </div>
            </div>
        `;

        try {
            // Call Claude API to generate location content
            const locationText = await generateLocationDescription(content.locationName || 'Cranleigh');
            content.location_description = locationText;

            // Update page content in session
            if (EditorState.sessionData && EditorState.sessionData.pages) {
                const pageInSession = EditorState.sessionData.pages.find(p => p.id === page.id);
                if (pageInSession && pageInSession.content) {
                    pageInSession.content.location_description = locationText;
                    pageInSession.content.generateAI = false; // Don't regenerate
                }
            }
        } catch (error) {
            console.error('❌ Failed to generate location content:', error);
            content.location_description = 'Error generating location description. Please edit manually.';
        }
    }

    // Use layout system for location page
    const currentLayout = page.layout || 'photo-left';
    const description = content.location_description || 'Enter location description here...';

    let layoutHTML = '';

    // Render based on selected layout
    switch (currentLayout) {
        case 'photo-left':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id) : ''}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'The Location'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="location_description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'photo-right':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'The Location'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="location_description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-right', page.id) : ''}
                    </div>
                </div>
            `;
            break;

        case 'text-top':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'The Location'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="location_description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'text-top', page.id) : ''}
                    </div>
                </div>
            `;
            break;

        case 'text-bottom':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'text-bottom', page.id) : ''}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'The Location'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="location_description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'photos-only':
            layoutHTML = `
                <div style="width: 100%; padding: 20px; box-sizing: border-box;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photos-only', page.id) : ''}
                    </div>
                </div>
            `;
            break;

        default:
            // Default to photo-left
            layoutHTML = layoutHTML || `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${page.photos && page.photos.length > 0 ? renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id) : ''}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'The Location'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="location_description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
}

function renderFloorplanPage(container, page) {
    // Floorplan page: display uploaded floorplan image with title + layout controls
    const content = page.content || {};

    // Get floorplan URL from page.photos (first photo is the floor plan)
    let floorplanUrl = '';
    if (page.photos && page.photos.length > 0) {
        const floorPlanPhoto = page.photos[0];
        floorplanUrl = EditorState.sessionData?.photoUrls?.[floorPlanPhoto.id] ||
                      floorPlanPhoto.url ||
                      floorPlanPhoto.dataUrl || '';
    }

    const fileName = 'Property Layout';
    const description = content.description || 'Click to add description...';

    console.log('🏠 Rendering floorplan page:', {
        pageId: page.id,
        hasPhotos: !!(page.photos && page.photos.length > 0),
        floorplanUrl: floorplanUrl ? 'present' : 'missing',
        fileName: fileName
    });

    // Reusable floorplan image HTML
    const floorplanImage = floorplanUrl ? `
        <img src="${floorplanUrl}"
             alt="${fileName}"
             style="max-width: 100%; max-height: 100%; object-fit: contain;
                     border: 2px solid #ddd; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    ` : `
        <div style="padding: 60px; text-align: center; color: #999;
                    background: #f5f5f5; border-radius: 8px; border: 2px dashed #ccc;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            <p style="font-size: 16px; margin: 0;">No floorplan image available</p>
            <p style="font-size: 13px; margin: 8px 0 0 0; opacity: 0.7;">Upload a floorplan in the form to display it here</p>
        </div>
    `;

    // Use layout system
    const currentLayout = page.layout || 'photos-only';
    let layoutHTML = '';

    // Render based on selected layout
    switch (currentLayout) {
        case 'photos-only':
            // Full-page floorplan (default)
            layoutHTML = `
                <div style="width: 100%; height: 100%; display: flex; flex-direction: column; padding: 30px; box-sizing: border-box; justify-content: center; align-items: center; position: relative;">
                    ${renderLayoutControls(page.id)}
                    <h2 class="editable" contenteditable="true" data-field="title"
                        style="font-size: 32px; font-weight: 700; color: var(--savills-red);
                                margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow);
                                padding-bottom: 10px; width: 100%; text-align: center;">
                        ${page.title || 'Property Layout'}
                    </h2>
                    <div style="flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; max-height: 600px; margin: 20px 0;">
                        ${floorplanImage}
                    </div>
                    <div class="editable" contenteditable="true" data-field="description"
                         style="font-size: 13px; line-height: 1.7; color: #666;
                                 width: 100%; text-align: center; margin-top: 20px; font-style: italic;">
                        ${description}
                    </div>
                </div>
            `;
            break;

        case 'photo-left':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 30px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; display: flex; justify-content: center; align-items: center; min-height: 500px;">
                        ${renderLayoutControls(page.id)}
                        ${floorplanImage}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title"
                            style="font-size: 32px; font-weight: 700; color: var(--savills-red);
                                    margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow);
                                    padding-bottom: 10px;">
                            ${page.title || 'Property Layout'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description"
                             style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'photo-right':
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 30px; box-sizing: border-box; align-items: start;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title"
                            style="font-size: 32px; font-weight: 700; color: var(--savills-red);
                                    margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow);
                                    padding-bottom: 10px;">
                            ${page.title || 'Property Layout'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description"
                             style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; display: flex; justify-content: center; align-items: center; min-height: 500px;">
                        ${renderLayoutControls(page.id)}
                        ${floorplanImage}
                    </div>
                </div>
            `;
            break;

        case 'text-top':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 30px; box-sizing: border-box;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title"
                            style="font-size: 32px; font-weight: 700; color: var(--savills-red);
                                    margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow);
                                    padding-bottom: 10px; text-align: center;">
                            ${page.title || 'Property Layout'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description"
                             style="font-size: 14px; line-height: 1.8; color: #2c3e50; text-align: center;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; display: flex; justify-content: center; align-items: center; flex: 1; min-height: 500px;">
                        ${renderLayoutControls(page.id)}
                        ${floorplanImage}
                    </div>
                </div>
            `;
            break;

        case 'text-bottom':
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 30px; box-sizing: border-box;">
                    <div style="position: relative; display: flex; justify-content: center; align-items: center; flex: 1; min-height: 500px;">
                        ${renderLayoutControls(page.id)}
                        ${floorplanImage}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title"
                            style="font-size: 32px; font-weight: 700; color: var(--savills-red);
                                    margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow);
                                    padding-bottom: 10px; text-align: center;">
                            ${page.title || 'Property Layout'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description"
                             style="font-size: 14px; line-height: 1.8; color: #2c3e50; text-align: center;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        default:
            // Default to photos-only (full-page floorplan)
            layoutHTML = `
                <div style="width: 100%; height: 100%; display: flex; flex-direction: column; padding: 30px; box-sizing: border-box; justify-content: center; align-items: center; position: relative;">
                    ${renderLayoutControls(page.id)}
                    <h2 class="editable" contenteditable="true" data-field="title"
                        style="font-size: 32px; font-weight: 700; color: var(--savills-red);
                                margin: 0 0 20px 0; border-bottom: 3px solid var(--savills-yellow);
                                padding-bottom: 10px; width: 100%; text-align: center;">
                        ${page.title || 'Property Layout'}
                    </h2>
                    <div style="flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; max-height: 600px; margin: 20px 0;">
                        ${floorplanImage}
                    </div>
                    <div class="editable" contenteditable="true" data-field="description"
                         style="font-size: 13px; line-height: 1.7; color: #666;
                                 width: 100%; text-align: center; margin-top: 20px; font-style: italic;">
                        ${description}
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
}

function renderGenericPage(container, page) {
    // Generic page: title + content + photos with Savills branding
    const content = page.content || {};

    // Use page-specific AI-generated text if available
    const description = EditorState.pageDescriptions[page.id]
        || content.text
        || content.description
        || 'Click to edit this description...';

    console.log('🎨 Rendering generic page:', {
        pageId: page.id,
        pageType: page.type,
        hasAIText: !!EditorState.pageDescriptions[page.id],
        descriptionLength: description?.length || 0
    });

    const photoCount = page.photos?.length || 0;
    const savedLayout = EditorState.pageLayouts[page.id] || 'auto';
    const photoGap = EditorState.photoGaps?.[page.id] || 0;

    let layoutHTML = '';

    switch (savedLayout) {
        case 'text-top':
            // Text above, photos below - natural flow, no height constraints
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Page Title'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 13px; line-height: 1.7; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-top', page.id)}
                    </div>
                </div>
            `;
            break;

        case 'photo-right':
            // Text left, ALL photos displayed in grid on right - natural flow
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Page Title'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photo-right', page.id)}
                    </div>
                </div>
            `;
            break;

        case 'photo-left':
            // Photos left, text right - mirror of photo-right
            layoutHTML = `
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; padding: 20px; box-sizing: border-box; align-items: start;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'photo-left', page.id)}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Page Title'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 14px; line-height: 1.8; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'text-bottom':
            // Photos above, text below - mirror of text-top
            layoutHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 20px; padding: 20px; box-sizing: border-box;">
                    <div style="position: relative; min-height: 400px;">
                        ${renderLayoutControls(page.id)}
                        ${renderPhotoSection(page.photos, '100%', 'auto', 'text-bottom', page.id)}
                    </div>
                    <div>
                        <h2 class="editable" contenteditable="true" data-field="title" style="font-size: 28px; font-weight: 700; color: var(--savills-red); margin: 0 0 10px 0; border-bottom: 3px solid var(--savills-yellow); padding-bottom: 8px;">
                            ${page.title || 'Page Title'}
                        </h2>
                        <div class="editable" contenteditable="true" data-field="description" style="font-size: 13px; line-height: 1.7; color: #2c3e50;">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'magazine':
            // Magazine layout - Interleaved 2x2 grid matching diagram
            const mainPhoto = page.photos[0];
            const secondPhoto = page.photos[1];

            // Split description into two roughly equal parts
            const sentences = description.match(/[^.!?]+[.!?]+/g) || [description];
            const midpoint = Math.floor(sentences.length / 2);
            const firstHalf = sentences.slice(0, midpoint).join(' ').trim();
            const secondHalf = sentences.slice(midpoint).join(' ').trim();

            // Get photo URL helper
            const getPhotoUrl = (photo) => {
                return EditorState.photoUrls[photo.id] || photo.dataUrl || '';
            };

            layoutHTML = `
                ${renderLayoutControls(page.id)}

                <h2 class="page-title editable" contenteditable="true" data-field="title">
                    ${page.title || 'Page Title'}
                </h2>

                <div class="layout-magazine">
                    <div class="layout-magazine-text1 page-text-sm editable" contenteditable="true" data-field="description-part1">
                        ${firstHalf}
                    </div>
                    <div class="layout-magazine-photo1">
                        ${mainPhoto ? `<div class="layout-photo"><img src="${getPhotoUrl(mainPhoto)}" alt="${mainPhoto.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                    </div>
                    <div class="layout-magazine-text2 page-text-sm editable" contenteditable="true" data-field="description-part2">
                        ${secondHalf}
                    </div>
                    <div class="layout-magazine-photo2">
                        ${secondPhoto ? `<div class="layout-photo"><img src="${getPhotoUrl(secondPhoto)}" alt="${secondPhoto.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                    </div>
                </div>
            `;
            break;

        case 'hero':
            // Hero layout - Large hero photo at top, text below
            const heroPhoto = page.photos[0];

            layoutHTML = `
                ${renderLayoutControls(page.id)}

                <div class="layout-hero">
                    ${heroPhoto ? `<div class="layout-photo"><img src="${EditorState.photoUrls[heroPhoto.id] || heroPhoto.dataUrl || ''}" alt="${heroPhoto.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}

                    <div>
                        <h2 class="page-title editable" contenteditable="true" data-field="title">
                            ${page.title || 'Page Title'}
                        </h2>
                        <div class="page-text editable" contenteditable="true" data-field="description">
                            ${description}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'photos-only':
            // Photos-only layout - Pure photo showcase
            const poPhotos = page.photos;
            const poCount = poPhotos.length;
            let poCountClass = 'count-1';
            if (poCount === 2) poCountClass = 'count-2';
            else if (poCount >= 3 && poCount <= 4) poCountClass = 'count-4';
            else if (poCount >= 5) poCountClass = 'count-5plus';

            layoutHTML = `
                ${renderLayoutControls(page.id)}

                <div class="layout-photos-only ${poCountClass}">
                    ${poPhotos.map(photo => {
                        const photoUrl = EditorState.photoUrls[photo.id] || photo.dataUrl || '';
                        return `<div class="layout-photo"><img src="${photoUrl}" alt="${photo.caption || 'Property photo'}" loading="lazy"></div>`;
                    }).join('')}
                </div>
            `;
            break;

        case 'reverse-l':
            // Reverse-L layout - Text top-left, 3 photos in L shape
            const rlPhoto1 = page.photos[0];
            const rlPhoto2 = page.photos[1];
            const rlPhoto3 = page.photos[2];

            layoutHTML = `

                    ${renderLayoutControls(page.id)}

                    <h2 class="page-title editable" contenteditable="true" data-field="title">
                        ${page.title || 'Page Title'}
                    </h2>

                    <div class="layout-reverse-l">
                        <div class="layout-reverse-l-text page-text-sm editable" contenteditable="true" data-field="description">
                            ${description}
                        </div>

                        ${rlPhoto1 ? `<div class="layout-photo photo-1"><img src="${EditorState.photoUrls[rlPhoto1.id] || rlPhoto1.dataUrl || ''}" alt="${rlPhoto1.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo photo-1"></div>'}

                        ${rlPhoto2 ? `<div class="layout-photo photo-2"><img src="${EditorState.photoUrls[rlPhoto2.id] || rlPhoto2.dataUrl || ''}" alt="${rlPhoto2.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo photo-2"></div>'}

                        ${rlPhoto3 ? `<div class="layout-photo photo-3"><img src="${EditorState.photoUrls[rlPhoto3.id] || rlPhoto3.dataUrl || ''}" alt="${rlPhoto3.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo photo-3"></div>'}
                    </div>
                </div>
            `;
            break;

        case 'l-shape':
            // L-Shape layout - Large photo left, text and 2 photos right
            const lPhoto1 = page.photos[0];
            const lPhoto2 = page.photos[1];
            const lPhoto3 = page.photos[2];

            layoutHTML = `

                    ${renderLayoutControls(page.id)}

                    <h2 class="page-title editable" contenteditable="true" data-field="title">
                        ${page.title || 'Page Title'}
                    </h2>

                    <div class="layout-l-shape">
                        ${lPhoto1 ? `<div class="layout-photo photo-1"><img src="${EditorState.photoUrls[lPhoto1.id] || lPhoto1.dataUrl || ''}" alt="${lPhoto1.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo photo-1"></div>'}

                        <div class="layout-l-shape-text page-text-sm editable" contenteditable="true" data-field="description">
                            ${description}
                        </div>

                        <div class="layout-l-shape-photos-bottom">
                            ${lPhoto2 ? `<div class="layout-photo"><img src="${EditorState.photoUrls[lPhoto2.id] || lPhoto2.dataUrl || ''}" alt="${lPhoto2.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                            ${lPhoto3 ? `<div class="layout-photo"><img src="${EditorState.photoUrls[lPhoto3.id] || lPhoto3.dataUrl || ''}" alt="${lPhoto3.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'split':
            // Split layout - Perfect 50/50 text and photo
            const splitPhoto = page.photos[0];

            layoutHTML = `

                    ${renderLayoutControls(page.id)}

                    <h2 class="page-title editable" contenteditable="true" data-field="title">
                        ${page.title || 'Page Title'}
                    </h2>

                    <div class="layout-split">
                        <div class="layout-split-text page-text editable" contenteditable="true" data-field="description">
                            ${description}
                        </div>

                        ${splitPhoto ? `<div class="layout-photo"><img src="${EditorState.photoUrls[splitPhoto.id] || splitPhoto.dataUrl || ''}" alt="${splitPhoto.caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                    </div>
                </div>
            `;
            break;

        case 'mosaic':
            // Mosaic layout - Asymmetric photo grid
            const mosaicPhotos = page.photos;
            let mosaicGrid = '';

            if (mosaicPhotos.length === 3) {
                // 3 photos: 1 large left, 2 stacked right
                mosaicGrid = `
                    <div class="layout-mosaic-3">
                        ${mosaicPhotos[0] ? `<div class="layout-photo photo-1"><img src="${EditorState.photoUrls[mosaicPhotos[0].id] || mosaicPhotos[0].dataUrl || ''}" alt="${mosaicPhotos[0].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo photo-1"></div>'}
                        ${mosaicPhotos[1] ? `<div class="layout-photo"><img src="${EditorState.photoUrls[mosaicPhotos[1].id] || mosaicPhotos[1].dataUrl || ''}" alt="${mosaicPhotos[1].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                        ${mosaicPhotos[2] ? `<div class="layout-photo"><img src="${EditorState.photoUrls[mosaicPhotos[2].id] || mosaicPhotos[2].dataUrl || ''}" alt="${mosaicPhotos[2].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                    </div>
                `;
            } else if (mosaicPhotos.length === 4) {
                // 4 photos: 2x2 grid with varying sizes
                mosaicGrid = `
                    <div class="layout-mosaic-4">
                        ${mosaicPhotos[0] ? `<div class="layout-photo"><img src="${EditorState.photoUrls[mosaicPhotos[0].id] || mosaicPhotos[0].dataUrl || ''}" alt="${mosaicPhotos[0].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                        ${mosaicPhotos[1] ? `<div class="layout-photo photo-2"><img src="${EditorState.photoUrls[mosaicPhotos[1].id] || mosaicPhotos[1].dataUrl || ''}" alt="${mosaicPhotos[1].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo photo-2"></div>'}
                        ${mosaicPhotos[2] ? `<div class="layout-photo"><img src="${EditorState.photoUrls[mosaicPhotos[2].id] || mosaicPhotos[2].dataUrl || ''}" alt="${mosaicPhotos[2].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                        ${mosaicPhotos[3] ? `<div class="layout-photo"><img src="${EditorState.photoUrls[mosaicPhotos[3].id] || mosaicPhotos[3].dataUrl || ''}" alt="${mosaicPhotos[3].caption || 'Property photo'}" loading="lazy"></div>` : '<div class="layout-photo"></div>'}
                    </div>
                `;
            } else {
                // 5+ photos: mixed grid
                mosaicGrid = `
                    <div class="layout-mosaic-5plus">
                        ${mosaicPhotos.map(photo => {
                            const photoUrl = EditorState.photoUrls[photo.id] || photo.dataUrl || '';
                            return `<div class="layout-photo"><img src="${photoUrl}" alt="${photo.caption || 'Property photo'}" loading="lazy"></div>`;
                        }).join('')}
                    </div>
                `;
            }

            layoutHTML = `

                    ${renderLayoutControls(page.id)}

                    <h2 class="page-title editable" contenteditable="true" data-field="title">
                        ${page.title || 'Page Title'}
                    </h2>

                    <div class="page-text editable" contenteditable="true" data-field="description">
                        ${description}
                    </div>

                    ${mosaicGrid}
                </div>
            `;
            break;

        case 'auto':
        default:
            // Auto layout - Adaptive two-column layout
            const autoPhotos = page.photos;
            const autoCount = autoPhotos.length;

            // Determine grid class based on photo count
            let autoLayoutClass = 'layout-auto';
            if (autoCount === 1) autoLayoutClass += ' photos-1';
            else if (autoCount >= 3) autoLayoutClass += ' photos-3plus';

            // Determine photo grid class
            let autoPhotoClass = 'layout-auto-photos';
            if (autoCount === 1) autoPhotoClass += ' count-1';
            else if (autoCount === 2) autoPhotoClass += ' count-2';
            else if (autoCount >= 3 && autoCount <= 4) autoPhotoClass += ' count-4';
            else if (autoCount >= 5) autoPhotoClass += ' count-5plus';

            layoutHTML = `

                    ${renderLayoutControls(page.id)}

                    <h2 class="page-title editable" contenteditable="true" data-field="title">
                        ${page.title || 'Page Title'}
                    </h2>

                    <div class="${autoLayoutClass}">
                        <div class="layout-auto-text page-text editable" contenteditable="true" data-field="description">
                            ${description}
                        </div>

                        <div class="${autoPhotoClass}">
                            ${autoPhotos.map(photo => {
                                const photoUrl = EditorState.photoUrls[photo.id] || photo.dataUrl || '';
                                return `<div class="layout-photo"><img src="${photoUrl}" alt="${photo.caption || 'Property photo'}" loading="lazy"></div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = layoutHTML;
    attachEditableListeners(container);
    attachLayoutControlListeners(page.id);
}

// ============================================================================
// PHOTO RENDERING HELPERS
// ============================================================================

function renderPhotoSection(photos, width = '100%', height = 'auto', layout = 'auto', pageId = null) {
    if (!photos || photos.length === 0) {
        return '';
    }

    // Limit to maximum 4 photos per page (or 5 for photos-only layout)
    const maxPhotos = layout === 'photos-only' ? 5 : 4;
    const limitedPhotos = photos.slice(0, maxPhotos);
    const photoCount = limitedPhotos.length;
    let gridCols = '1fr';
    let gridRows = 'auto';  // Use auto for flexible heights

    // Get saved layout preference, gap, and stacking for this page
    const savedLayout = pageId ? EditorState.pageLayouts[pageId] : null;
    const activeLayout = savedLayout || layout;
    const photoGap = pageId ? (EditorState.photoGaps[pageId] || 0) : 0;
    const photoStacking = pageId ? (EditorState.photoStacking[pageId] || 'grid') : 'grid';

    // Determine grid layout based on mode and photo count
    switch (activeLayout) {
        case 'text-top':
        case 'text-bottom':
            // Horizontal row of photos with auto height (max 4 photos in a row)
            gridCols = `repeat(${Math.min(photoCount, 4)}, 1fr)`;
            gridRows = 'auto';
            break;
        case 'hero':
            // Single large photo with auto height
            gridCols = '1fr';
            gridRows = 'auto';
            break;
        case 'photo-right':
        case 'photo-left':
            // Photos in side column - use preset arrangement
            if (photoCount === 1) {
                gridCols = '1fr';
                gridRows = '1fr';
            } else if (photoCount === 2) {
                if (photoStacking === 'side-by-side') {
                    gridCols = '1fr 1fr';
                    gridRows = '1fr';
                } else if (photoStacking === 'stacked') {
                    gridCols = '1fr';
                    gridRows = '1fr 1fr';
                } else {
                    // Default: stacked
                    gridCols = '1fr';
                    gridRows = '1fr 1fr';
                }
            } else if (photoCount === 3) {
                if (photoStacking === '2-top-1-bottom') {
                    gridCols = 'repeat(2, 1fr)';
                    gridRows = '1fr 1fr';
                } else if (photoStacking === '3-stacked') {
                    gridCols = '1fr';
                    gridRows = 'repeat(3, 1fr)';
                } else if (photoStacking === '3-row') {
                    gridCols = 'repeat(3, 1fr)';
                    gridRows = '1fr';
                } else if (photoStacking === '1-top-2-bottom') {
                    gridCols = 'repeat(2, 1fr)';
                    gridRows = '1fr 1fr';
                } else {
                    // Default: 2 top, 1 bottom
                    gridCols = 'repeat(2, 1fr)';
                    gridRows = '1fr 1fr';
                }
            } else if (photoCount === 4) {
                if (photoStacking === '2x2-grid') {
                    gridCols = 'repeat(2, 1fr)';
                    gridRows = '1fr 1fr';
                } else if (photoStacking === '4-row') {
                    gridCols = 'repeat(4, 1fr)';
                    gridRows = '1fr';
                } else {
                    // Default: 2x2 grid
                    gridCols = 'repeat(2, 1fr)';
                    gridRows = '1fr 1fr';
                }
            } else {
                // 5+ photos: grid layout
                gridCols = 'repeat(2, 1fr)';
                gridRows = `repeat(${Math.ceil(photoCount / 2)}, 1fr)`;
            }
            break;
        case 'magazine':
            // Magazine layout - not used in renderPhotoSection (handled in applyLayout)
            gridCols = '1fr';
            gridRows = 'auto';
            break;
        case 'photos-only':
            // Photos Only layout - equal grid squares
            if (photoCount === 1) {
                gridCols = '1fr';
                gridRows = '1fr';
            } else if (photoCount === 2) {
                gridCols = 'repeat(2, 1fr)';
                gridRows = '1fr';
            } else if (photoCount === 3) {
                gridCols = 'repeat(2, 1fr)';
                gridRows = '1fr 1fr';
            } else if (photoCount === 4) {
                gridCols = 'repeat(2, 1fr)';
                gridRows = '1fr 1fr';
            } else if (photoCount === 5) {
                // 5 photos: 3 top row, 2 bottom row
                gridCols = 'repeat(3, 1fr)';
                gridRows = '1fr 1fr';
            } else {
                // 6+ photos (shouldn't happen): 2 column grid
                gridCols = 'repeat(2, 1fr)';
                gridRows = `repeat(${Math.ceil(photoCount / 2)}, 1fr)`;
            }
            break;
        case 'reverse-l':
        case 'l-shape':
        case 'split':
        case 'mosaic':
            // These layouts are not used in renderPhotoSection (handled in applyLayout)
            gridCols = '1fr';
            gridRows = 'auto';
            break;
        case 'auto':
        default:
            // Auto mode - intelligent grid with flexible heights
            if (photoCount === 1) {
                // Single photo: full width
                gridCols = '1fr';
                gridRows = 'auto';
            } else if (photoCount === 2) {
                // Two photos: stack vertically (one above the other)
                gridCols = '1fr';
                gridRows = 'auto auto';
            } else if (photoCount >= 3 && photoCount <= 4) {
                // 3-4 photos: 2x2 grid
                gridCols = 'repeat(2, 1fr)';
                gridRows = 'auto auto';
            } else {
                // 5+ photos: 2 column grid, multiple rows
                gridCols = 'repeat(2, 1fr)';
                gridRows = `repeat(${Math.ceil(photoCount / 2)}, auto)`;
            }
            break;
    }

    // Use the user-configured gap spacing
    const gridHeight = height === 'auto' ? 'auto' : (height === '100%' ? '100%' : height);

    // Special handling for specific presets
    let photoElements = limitedPhotos.map((photo, index) => {
        // 5 photos in photos-only layout
        if (activeLayout === 'photos-only' && photoCount === 5 && index === 3) {
            return renderPhotoElement(photo, '100%', 'auto', 'grid-column: 1 / 3;');
        } else if (activeLayout === 'photos-only' && photoCount === 5 && index === 4) {
            return renderPhotoElement(photo, '100%', 'auto', 'grid-column: 2 / 4;');
        }
        // 1-top-2-bottom preset: first photo spans 2 columns
        else if (photoStacking === '1-top-2-bottom' && photoCount === 3 && index === 0) {
            return renderPhotoElement(photo, '100%', 'auto', 'grid-column: 1 / 3;');
        }
        // 2-top-1-bottom preset: last photo spans 2 columns
        else if (photoStacking === '2-top-1-bottom' && photoCount === 3 && index === 2) {
            return renderPhotoElement(photo, '100%', 'auto', 'grid-column: 1 / 3;');
        }
        return renderPhotoElement(photo, '100%', 'auto');
    }).join('');

    return `
        <div class="photo-grid" data-page-id="${pageId || ''}" data-layout="${activeLayout}"
             style="width: ${width}; height: ${gridHeight}; display: grid;
                    grid-template-columns: ${gridCols}; grid-template-rows: ${gridRows};
                    gap: ${photoGap}px; box-sizing: border-box;">
            ${photoElements}
        </div>
    `;
}

function renderPhotoElement(photo, width = '100%', height = 'auto', extraStyle = '') {
    // Get photo URL from session photo URLs mapping
    const photoUrl = EditorState.photoUrls[photo.id] || photo.dataUrl || '';

    if (!photoUrl) {
        return `
            <div class="photo-element" style="display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 12px; ${extraStyle}">
                Photo not available
            </div>
        `;
    }

    return `
        <div class="photo-element photo-swappable" data-photo-id="${photo.id}" style="${extraStyle}">
            <img src="${photoUrl}"
                 alt="${photo.caption || photo.name || 'Property photo'}"
                 loading="lazy">
            ${photo.caption ? `<div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; background: rgba(0,0,0,0.6); color: white; font-size: 12px; z-index: 1;">${photo.caption}</div>` : ''}
        </div>
    `;
}

function renderFeaturesList(features) {
    if (!features || !Array.isArray(features)) {
        return '• Feature 1<br>• Feature 2<br>• Feature 3';
    }

    return features.map(f => `• ${f}`).join('<br>');
}

// ============================================================================
// LAYOUT PICKER PANEL
// ============================================================================

// SVG diagram generators for each layout
const layoutDiagrams = {
    'auto': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="text-block" x="5" y="5" width="45" height="70" rx="3"/>
        <rect class="photo-block" x="55" y="5" width="40" height="32" rx="3"/>
        <rect class="photo-block" x="55" y="43" width="40" height="32" rx="3"/>
    </svg>`,

    'text-top': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="text-block" x="5" y="5" width="90" height="30" rx="3"/>
        <rect class="photo-block" x="5" y="40" width="25" height="35" rx="3"/>
        <rect class="photo-block" x="35" y="40" width="25" height="35" rx="3"/>
        <rect class="photo-block" x="65" y="40" width="30" height="35" rx="3"/>
    </svg>`,

    'photo-right': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="text-block" x="5" y="5" width="50" height="70" rx="3"/>
        <rect class="photo-block" x="60" y="5" width="35" height="70" rx="3"/>
    </svg>`,

    'magazine': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="text-block" x="5" y="5" width="42" height="32" rx="3"/>
        <rect class="photo-block" x="53" y="5" width="42" height="32" rx="3"/>
        <rect class="text-block" x="5" y="43" width="42" height="32" rx="3"/>
        <rect class="photo-block" x="53" y="43" width="42" height="32" rx="3"/>
    </svg>`,

    'hero': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="photo-block" x="5" y="5" width="90" height="45" rx="3"/>
        <rect class="text-block" x="5" y="55" width="90" height="20" rx="3"/>
    </svg>`,

    'photos-only': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="photo-block" x="5" y="5" width="42" height="35" rx="3"/>
        <rect class="photo-block" x="53" y="5" width="42" height="35" rx="3"/>
        <rect class="photo-block" x="5" y="45" width="42" height="30" rx="3"/>
        <rect class="photo-block" x="53" y="45" width="42" height="30" rx="3"/>
    </svg>`,

    'photo-left': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="photo-block" x="5" y="5" width="35" height="70" rx="3"/>
        <rect class="text-block" x="45" y="5" width="50" height="70" rx="3"/>
    </svg>`,

    'text-bottom': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="photo-block" x="5" y="5" width="25" height="40" rx="3"/>
        <rect class="photo-block" x="35" y="5" width="25" height="40" rx="3"/>
        <rect class="photo-block" x="65" y="5" width="30" height="40" rx="3"/>
        <rect class="text-block" x="5" y="50" width="90" height="25" rx="3"/>
    </svg>`,

    'reverse-l': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="text-block" x="5" y="5" width="42" height="35" rx="3"/>
        <rect class="photo-block" x="53" y="5" width="42" height="16" rx="3"/>
        <rect class="photo-block" x="53" y="24" width="42" height="16" rx="3"/>
        <rect class="photo-block" x="5" y="45" width="42" height="30" rx="3"/>
    </svg>`,

    'l-shape': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="photo-block" x="5" y="5" width="42" height="70" rx="3"/>
        <rect class="text-block" x="53" y="5" width="42" height="30" rx="3"/>
        <rect class="photo-block" x="53" y="40" width="19" height="35" rx="3"/>
        <rect class="photo-block" x="76" y="40" width="19" height="35" rx="3"/>
    </svg>`,

    'split': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="text-block" x="5" y="5" width="42" height="70" rx="3"/>
        <rect class="photo-block" x="53" y="5" width="42" height="70" rx="3"/>
    </svg>`,

    'mosaic': `<svg class="layout-diagram" viewBox="0 0 100 80">
        <rect class="photo-block" x="5" y="5" width="48" height="70" rx="3"/>
        <rect class="photo-block" x="57" y="5" width="38" height="32" rx="3"/>
        <rect class="photo-block" x="57" y="43" width="38" height="32" rx="3"/>
    </svg>`
};

// Render layout picker panel
function renderLayoutPicker() {
    const currentPageId = EditorState.currentPage;
    console.log('🎨 renderLayoutPicker called for page:', currentPageId);

    if (!currentPageId) {
        console.warn('⚠️ No current page ID');
        return;
    }

    // Check if session data is loaded
    if (!EditorState.sessionData || !EditorState.sessionData.pages) {
        console.log('⏳ Session data not ready yet, skipping layout picker render');
        return;
    }

    // Debug logging to understand page lookup failure
    console.log('🔍 DEBUG - Looking for page:', {
        currentPageId: currentPageId,
        currentPageIdType: typeof currentPageId,
        availablePages: EditorState.sessionData.pages.map(p => ({ id: p.id, idType: typeof p.id, type: p.type })),
        pagesCount: EditorState.sessionData.pages.length
    });

    const page = EditorState.sessionData.pages.find(p => p.id === currentPageId);
    if (!page) {
        console.log('❌ Page not found in sessionData.pages:', currentPageId);
        console.log('Available page IDs:', EditorState.sessionData.pages.map(p => p.id));
        return;
    }

    const currentLayout = EditorState.pageLayouts[currentPageId] || 'auto';
    const currentGap = EditorState.photoGaps[currentPageId] || 0;
    console.log('📐 Current layout for page', currentPageId, ':', currentLayout);

    // Determine if this is the cover/first page
    const pageIndex = EditorState.sessionData.pages.findIndex(p => p.id === currentPageId);
    const isCoverPage = pageIndex === 0;

    // Check if this page has a fixed layout (no layout options)
    // Note: All pages now support layouts! Only truly fixed pages should be here.
    const fixedLayoutPages = ['contact'];  // Removed 'hero_intro', 'cover', 'location' - they now have layouts
    if (fixedLayoutPages.includes(page.type)) {
        document.getElementById('layoutPickerContent').innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p style="font-size: 14px;">This page has a fixed layout.</p>
            </div>
        `;
        return;
    }

    // Get photo count for current page
    const photoCount = page.photos?.length || 0;
    console.log('📸 Photo count for page', currentPageId, ':', photoCount);

    // Filter layouts based on photo count
    let layouts = [];

    if (photoCount === 0) {
        // No photos: only show Auto (which handles text-only gracefully)
        layouts = [
            { key: 'auto', name: 'Auto' }
        ];
    } else if (photoCount === 1) {
        // Single photo: simplified layouts only
        layouts = [
            { key: 'text-top', name: 'Photos Above Text' },
            { key: 'text-bottom', name: 'Photos Below Text' },
            { key: 'photo-right', name: 'Photos Right' },
            { key: 'photo-left', name: 'Photos Left' },
            { key: 'photos-only', name: 'Photos Only' }
        ];
    } else if (photoCount === 2) {
        // Two photos: simplified layouts only
        layouts = [
            { key: 'text-top', name: 'Photos Above Text' },
            { key: 'text-bottom', name: 'Photos Below Text' },
            { key: 'photo-right', name: 'Photos Right' },
            { key: 'photo-left', name: 'Photos Left' },
            { key: 'photos-only', name: 'Photos Only' }
        ];
    } else {
        // Three or more photos: simplified layouts only
        layouts = [
            { key: 'text-top', name: 'Photos Above Text' },
            { key: 'text-bottom', name: 'Photos Below Text' },
            { key: 'photo-right', name: 'Photos Right' },
            { key: 'photo-left', name: 'Photos Left' },
            { key: 'photos-only', name: 'Photos Only' }
        ];
    }

    const layoutCardsHTML = layouts.map(layout => `
        <div class="layout-preview-card ${currentLayout === layout.key ? 'active' : ''}"
             data-layout="${layout.key}"
             data-page-id="${currentPageId}">
            <div class="layout-preview-visual">
                ${layoutDiagrams[layout.key]}
            </div>
            <div class="layout-preview-label">${layout.name}</div>
        </div>
    `).join('');

    // Photo gap control
    const gapControlHTML = `
        <div style="padding: 15px; border-top: 2px solid #e5e7eb; background: #f9fafb;">
            <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
                Photo Spacing
            </label>
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="range" id="photoGapSlider"
                       min="0" max="30" step="5" value="${currentGap}"
                       style="flex: 1; height: 4px; border-radius: 2px; outline: none; cursor: pointer;"
                       data-page-id="${currentPageId}">
                <span id="gapValue" style="font-size: 12px; font-weight: 600; color: #6b7280; min-width: 35px;">${currentGap}px</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 10px; color: #9ca3af;">
                <span>Flush</span>
                <span>Wide</span>
            </div>
        </div>
    `;

    // Smart Photo Arrangement Presets (context-aware based on photo count)
    let photoPresets = [];
    const currentStacking = EditorState.photoStacking[currentPageId] || 'auto';

    if (photoCount === 0) {
        // No presets needed for text-only pages
    } else if (photoCount === 1) {
        photoPresets = [
            { key: 'single', name: 'Single', icon: '▢' }
        ];
    } else if (photoCount === 2) {
        photoPresets = [
            { key: 'side-by-side', name: 'Side by Side', icon: '▢▢' },
            { key: 'stacked', name: 'Stacked', icon: '▢\n▢' }
        ];
    } else if (photoCount === 3) {
        photoPresets = [
            { key: '2-top-1-bottom', name: '2 + 1', icon: '▢▢\n ▢' },
            { key: '3-stacked', name: '3 Stack', icon: '▢\n▢\n▢' },
            { key: '3-row', name: '3 Row', icon: '▢▢▢' },
            { key: '1-top-2-bottom', name: '1 + 2', icon: ' ▢\n▢▢' }
        ];
    } else if (photoCount === 4) {
        photoPresets = [
            { key: '2x2-grid', name: '2×2 Grid', icon: '▢▢\n▢▢' },
            { key: '4-row', name: '4 Row', icon: '▢▢▢▢' },
            { key: '1-large-3-small', name: '1+3', icon: '▢▢\n▢▢' }
        ];
    } else {
        // 5+ photos
        photoPresets = [
            { key: 'grid', name: 'Grid', icon: '▢▢\n▢▢' },
            { key: 'row', name: 'Row', icon: '▢▢▢' }
        ];
    }

    const presetsHTML = photoPresets.length > 0 ? `
        <div style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 8px;">
            <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 10px;">
                Photo Arrangement (${photoCount} photo${photoCount !== 1 ? 's' : ''})
            </label>
            <div style="display: grid; grid-template-columns: repeat(${Math.min(photoPresets.length, 3)}, 1fr); gap: 8px;">
                ${photoPresets.map(preset => `
                    <button class="preset-btn ${currentStacking === preset.key ? 'active' : ''}"
                            data-preset="${preset.key}"
                            data-page-id="${currentPageId}"
                            style="padding: 12px 8px; border: 2px solid ${currentStacking === preset.key ? '#3b82f6' : '#e5e7eb'};
                                   background: ${currentStacking === preset.key ? '#eff6ff' : 'white'};
                                   border-radius: 6px; cursor: pointer; font-size: 10px; font-weight: 500;
                                   display: flex; flex-direction: column; align-items: center; gap: 6px;
                                   transition: all 0.2s;">
                        <div style="font-size: 16px; line-height: 1.2; white-space: pre;">${preset.icon}</div>
                        <div style="font-size: 10px;">${preset.name}</div>
                    </button>
                `).join('')}
            </div>
        </div>
    ` : '';

    const pickerContent = document.getElementById('layoutPickerContent');
    if (pickerContent) {
        pickerContent.innerHTML = layoutCardsHTML + gapControlHTML + presetsHTML;
        attachLayoutPickerListeners();
        attachGapControlListener();
        attachPresetControlListener();
        console.log('✅ Layout picker rendered with', layouts.length, 'options and', photoPresets.length, 'presets');
    }
}

// Attach click listeners to layout cards
function attachLayoutPickerListeners() {
    const cards = document.querySelectorAll('.layout-preview-card');
    console.log('🔗 Attaching listeners to', cards.length, 'layout cards');

    cards.forEach(card => {
        card.addEventListener('click', (e) => {
            const layout = card.dataset.layout;
            const pageId = card.dataset.pageId;
            console.log('🖱️ Layout card clicked - Layout:', layout, 'PageID:', pageId);
            console.log('📊 Current EditorState.currentPage:', EditorState.currentPage);

            if (layout && pageId) {
                console.log('✅ Calling changePageLayout for page', pageId, 'with layout', layout);
                changePageLayout(pageId, layout);
                renderLayoutPicker(); // Re-render to update active state
            } else {
                console.error('❌ Missing layout or pageId!');
            }
        });
    });
}

// Attach listener to photo gap slider
function attachGapControlListener() {
    const slider = document.getElementById('photoGapSlider');
    const gapValue = document.getElementById('gapValue');

    if (!slider) return;

    slider.addEventListener('input', (e) => {
        const pageId = parseInt(slider.dataset.pageId, 10); // Convert to number
        const gap = parseInt(e.target.value);

        // Update display
        gapValue.textContent = `${gap}px`;

        // Save to state
        EditorState.photoGaps[pageId] = gap;
        EditorState.isDirty = true;

        console.log(`📏 Photo gap changed for page ${pageId}: ${gap}px`);

        // Re-render the page to apply new gap
        const page = EditorState.sessionData.pages.find(p => p.id === pageId);
        if (page) {
            const pageEl = document.querySelector(`.brochure-page[data-page-id="${pageId}"]`);
            if (pageEl) {
                renderGenericPage(pageEl, page);
            }
        }
    });
}

// Attach listener to photo preset buttons
function attachPresetControlListener() {
    const buttons = document.querySelectorAll('.preset-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pageId = parseInt(btn.dataset.pageId, 10); // Convert to number
            const preset = btn.dataset.preset;

            // Save to state
            EditorState.photoStacking[pageId] = preset;
            EditorState.isDirty = true;

            console.log(`📐 Photo preset changed for page ${pageId}: ${preset}`);

            // Re-render the page to apply new preset
            const page = EditorState.sessionData.pages.find(p => p.id === pageId);
            if (page) {
                const pageEl = document.querySelector(`.brochure-page[data-page-id="${pageId}"]`);
                if (pageEl) {
                    // Use appropriate render function based on page type
                    if (page.type === 'hero_intro') {
                        renderPropertyOverviewPage(pageEl, page);
                    } else {
                        renderGenericPage(pageEl, page);
                    }
                }
            }

            // Re-render layout picker to update button states
            renderLayoutPicker();
        });
    });
}

// ============================================================================
// LAYOUT CONTROLS (INLINE BUTTONS ON PAGE)
// ============================================================================

function renderLayoutControls(pageId) {
    // Layout controls removed - using sidebar layout picker instead
    return '';
}

function attachLayoutControlListeners(pageId) {
    // Wait for next tick to ensure buttons are in DOM
    setTimeout(() => {
        const buttons = document.querySelectorAll(`.layout-btn[data-page-id="${pageId}"]`);
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layout = btn.dataset.layout;
                changePageLayout(pageId, layout);
            });
        });
    }, 0);
}

function changePageLayout(pageId, layout) {
    // Ensure pageId is a number for consistency
    pageId = typeof pageId === 'string' ? parseInt(pageId, 10) : pageId;
    console.log(`🎨 Changing layout for page ${pageId} to ${layout}`);

    // Save layout preference
    EditorState.pageLayouts[pageId] = layout;
    EditorState.isDirty = true;

    // Find the page in session data
    const page = EditorState.sessionData.pages.find(p => p.id === pageId);
    if (!page) return;

    // Re-render the page based on type
    const pageEl = document.querySelector(`.brochure-page[data-page-id="${pageId}"]`);
    if (pageEl) {
        // Use appropriate render function based on page type
        if (page.type === 'hero_intro') {
            renderPropertyOverviewPage(pageEl, page);
        } else {
            renderGenericPage(pageEl, page);
        }

        // Re-attach photo swap click handlers after re-render
        if (typeof attachBrochurePhotoClickHandlers === 'function') {
            attachBrochurePhotoClickHandlers();
        }

        // Re-attach orange hover effects after re-render
        attachPhotoHoverEffects();
    }
}

// ============================================================================
// PAGE SELECTION & NAVIGATION
// ============================================================================

function selectPage(pageId) {
    // Keep pageId as string for consistent comparison (supports both numeric and string IDs)
    pageId = String(pageId);
    console.log(`📄 Selecting page: ${pageId}`);

    // Update sidebar
    document.querySelectorAll('.page-item').forEach(item => {
        item.classList.toggle('active', item.dataset.pageId == pageId); // Use == for type-flexible comparison
    });

    // Scroll to page in canvas
    const pageEl = document.querySelector(`.brochure-page[data-page-id="${pageId}"]`);
    if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        EditorState.currentPage = pageId;

        // Update layout picker to show layouts for this page
        renderLayoutPicker();
    }
}

// Update current page based on scroll position
function updateCurrentPageFromScroll() {
    const canvasScroll = document.querySelector('.canvas-scroll');
    if (!canvasScroll) return;

    const scrollTop = canvasScroll.scrollTop;
    const pages = document.querySelectorAll('.brochure-page');

    // Find which page is most visible in the viewport
    let currentVisiblePage = null;
    let maxVisibility = 0;

    pages.forEach(page => {
        const rect = page.getBoundingClientRect();
        const scrollRect = canvasScroll.getBoundingClientRect();

        // Calculate how much of the page is visible
        const visibleTop = Math.max(rect.top, scrollRect.top);
        const visibleBottom = Math.min(rect.bottom, scrollRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibility = visibleHeight / rect.height;

        if (visibility > maxVisibility) {
            maxVisibility = visibility;
            currentVisiblePage = page;
        }
    });

    if (currentVisiblePage) {
        const pageId = parseInt(currentVisiblePage.dataset.pageId, 10); // Convert to number

        // Only update if different from current
        if (EditorState.currentPage !== pageId) {
            console.log(`🔄 Scroll detected - switching to page: ${pageId}`);
            EditorState.currentPage = pageId;

            // Update sidebar highlighting
            document.querySelectorAll('.page-item').forEach(item => {
                item.classList.toggle('active', item.dataset.pageId == pageId); // Use == for type-flexible comparison
            });

            // Update layout picker
            renderLayoutPicker();
        }
    }
}

// ============================================================================
// EDITABLE CONTENT HANDLERS
// ============================================================================

function attachEditableListeners(container) {
    const editables = container.querySelectorAll('.editable');

    editables.forEach(el => {
        // Track changes
        el.addEventListener('input', () => {
            EditorState.isDirty = true;
            console.log('✏️ Content changed, marking as dirty');
        });

        // Prevent default paste behavior (paste as plain text)
        el.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });
    });
}

function updateSessionDataFromDOM() {
    console.log('📝 Extracting state from DOM...');

    if (!EditorState.sessionData || !EditorState.sessionData.pages) {
        return;
    }

    // Update each page's content from DOM
    EditorState.sessionData.pages.forEach(page => {
        const pageEl = document.querySelector(`.brochure-page[data-page-id="${page.id}"]`);
        if (!pageEl) return;

        const editables = pageEl.querySelectorAll('.editable');
        editables.forEach(el => {
            const field = el.dataset.field;
            if (!field) return;

            const value = el.innerHTML.trim();

            // Store in page content or page properties
            if (field === 'title') {
                page.title = el.textContent.trim();
            } else {
                if (!page.content) page.content = {};
                page.content[field] = value;
            }
        });
    });

    console.log('✅ Session data updated from DOM');
}

// ============================================================================
// PROPERTIES PANEL
// ============================================================================

function updatePropertiesPanel(element) {
    const panel = document.getElementById('propertiesContent');

    if (!element) {
        panel.innerHTML = `
            <div class="empty-state">
                <p>Select an element to edit its properties</p>
            </div>
        `;
        return;
    }

    const field = element.dataset.field || 'text';
    const currentValue = element.textContent.trim();

    panel.innerHTML = `
        <div class="property-group">
            <div class="property-group-title">Text Properties</div>
            <div class="property-field">
                <label class="property-label">Content</label>
                <textarea class="property-textarea" id="propContent">${currentValue}</textarea>
            </div>
            <div class="property-field">
                <label class="property-label">Font Size</label>
                <select class="property-select" id="propFontSize">
                    <option value="12px">12px - Small</option>
                    <option value="14px" selected>14px - Normal</option>
                    <option value="16px">16px - Medium</option>
                    <option value="20px">20px - Large</option>
                    <option value="28px">28px - Heading</option>
                    <option value="42px">42px - Title</option>
                </select>
            </div>
            <div class="property-field">
                <label class="property-label">Font Weight</label>
                <select class="property-select" id="propFontWeight">
                    <option value="400">Normal</option>
                    <option value="500">Medium</option>
                    <option value="600" selected>Semi-Bold</option>
                    <option value="700">Bold</option>
                </select>
            </div>
        </div>
    `;

    // Attach listeners
    document.getElementById('propContent').addEventListener('input', (e) => {
        element.textContent = e.target.value;
        EditorState.isDirty = true;
    });

    document.getElementById('propFontSize').addEventListener('change', (e) => {
        element.style.fontSize = e.target.value;
        EditorState.isDirty = true;
    });

    document.getElementById('propFontWeight').addEventListener('change', (e) => {
        element.style.fontWeight = e.target.value;
        EditorState.isDirty = true;
    });
}

// ============================================================================
// ZOOM & VIEW CONTROLS
// ============================================================================

function setZoom(level) {
    EditorState.zoomLevel = Math.max(0.25, Math.min(2.0, level));

    const canvas = document.getElementById('brochureCanvas');
    if (canvas) {
        canvas.style.transform = `scale(${EditorState.zoomLevel})`;
    }

    // Update zoom display - try both possible element IDs
    const zoomLabel = document.getElementById('zoomLevel') || document.getElementById('zoomLevelSelect');
    if (zoomLabel) {
        if (zoomLabel.tagName === 'SELECT') {
            zoomLabel.value = EditorState.zoomLevel;
        } else {
            zoomLabel.textContent = `${Math.round(EditorState.zoomLevel * 100)}%`;
        }
    }
}

function zoomIn() {
    setZoom(EditorState.zoomLevel + 0.1);
}

function zoomOut() {
    setZoom(EditorState.zoomLevel - 0.1);
}

function fitToWidth() {
    const container = document.getElementById('canvasContainer');
    const canvas = document.getElementById('brochureCanvas');

    // Calculate zoom to fit page width
    const containerWidth = container.offsetWidth - 64; // padding
    const pageWidth = 297 * 3.7795275591; // 297mm to pixels (at 96dpi)
    const zoom = containerWidth / pageWidth;

    setZoom(zoom);
}

function toggleGuides() {
    EditorState.showGuides = !EditorState.showGuides;

    document.querySelectorAll('.brochure-page').forEach(page => {
        page.classList.toggle('show-guides', EditorState.showGuides);
    });
}

// ============================================================================
// UI HELPERS
// ============================================================================

function updatePropertyAddress() {
    const property = EditorState.sessionData?.property || {};
    const addressEl = document.getElementById('propertyAddress');
    addressEl.textContent = property.address || 'Property Brochure';
}

function updateStatus(state, text) {
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    dot.className = `status-dot ${state}`;
    statusText.textContent = text;
}

function showLoading(visible) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('visible', visible);
        console.log(`🔄 Loading overlay visibility: ${visible}`);
    }
}

// Force close loading modal - used as safety fallback
function forceCloseLoadingModal() {
    console.log('🔒 Force closing loading modal...');
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.style.display = 'none'; // Extra insurance
    }

    // Set progress to 100%
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '100%';

    // Mark all steps as completed
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
        step.classList.add('completed');
    });

    // Enable buttons in case they weren't enabled
    const saveBtn = document.getElementById('saveBtn');
    const exportBtn = document.getElementById('exportBtn');
    const repurposeBtn = document.getElementById('repurposeBtn');
    if (saveBtn) saveBtn.disabled = false;
    if (exportBtn) exportBtn.disabled = false;
    if (repurposeBtn) repurposeBtn.disabled = false;

    updateStatus('ready', 'Ready');
    showToast('Brochure loaded (some AI content may use defaults)');
}

// Skip AI generation and use default descriptions
function skipAIGeneration() {
    console.log('⏭️ Skipping AI generation, using default descriptions...');

    // Set flag to abort pending generation requests
    EditorState.skipGeneration = true;

    // Use default descriptions for all pages
    const pages = EditorState.sessionData?.pages || [];
    pages.forEach(page => {
        if (page.type !== 'cover' && !EditorState.pageDescriptions[page.id]) {
            EditorState.pageDescriptions[page.id] = getDefaultDescription(page.type);
            console.log(`📝 Using default for ${page.type}`);
        }
        // Mark step as completed
        updateLoadingProgress(page.type, true);
    });

    // Mark rendering as active
    updateLoadingProgress('rendering', false);

    // Render pages immediately
    renderPages();
    populatePhotoGallerySidebar();

    // Attach handlers
    setTimeout(() => {
        if (typeof attachBrochurePhotoClickHandlers === 'function') {
            attachBrochurePhotoClickHandlers();
        }
        attachPhotoHoverEffects();

        // Save initial history state so undo has a baseline
        if (EditorState.history.length === 0) {
            saveToHistory('initial load');
            console.log('📝 Initial history state saved (skip path)');
        }
    }, 100);

    updateLoadingProgress('rendering', true);
    updateStatus('ready', 'Ready');

    // Enable buttons
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
    document.getElementById('repurposeBtn').disabled = false;

    // Start auto-save
    startAutoSave();

    // Hide loading
    showLoading(false);

    showToast('Loaded with default descriptions. You can edit text directly on the pages.');
}

function showError(title, message) {
    const modal = document.getElementById('errorModal');
    const messageEl = document.getElementById('errorMessage');

    messageEl.textContent = message;
    modal.classList.add('visible');
}

function hideError() {
    const modal = document.getElementById('errorModal');
    modal.classList.remove('visible');
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('successToast');
    const messageEl = document.getElementById('toastMessage');

    messageEl.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initializeEventListeners() {
    // Header buttons
    document.getElementById('backBtn').addEventListener('click', () => {
        if (EditorState.isDirty) {
            if (confirm('You have unsaved changes. Save before leaving?')) {
                saveSession().then(() => {
                    window.location.href = '/static/index.html';
                });
            } else {
                window.location.href = '/static/index.html';
            }
        } else {
            window.location.href = '/static/index.html';
        }
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        saveSession();
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        exportPDF();
    });

    // DISABLED: Old repurposing system - now using social_media_repurpose.js modal
    // document.getElementById('repurposeBtn').addEventListener('click', () => {
    //     if (typeof showRepurposingPopup === 'function') {
    //         showRepurposingPopup();
    //     } else {
    //         console.error('Repurposing popup function not loaded');
    //     }
    // });

    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
    document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
    document.getElementById('fitToWidthBtn').addEventListener('click', fitToWidth);
    document.getElementById('showGuidesToggle').addEventListener('change', toggleGuides);

    // Error modal - use specific selector to avoid grabbing wrong modal's close button
    const errorModalClose = document.querySelector('#errorModal .modal-close');
    if (errorModalClose) {
        errorModalClose.addEventListener('click', hideError);
    }
    document.getElementById('errorBackBtn').addEventListener('click', () => {
        window.location.href = '/static/index.html';
    });
    document.getElementById('errorRetryBtn').addEventListener('click', () => {
        hideError();
        loadSession();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            // Allow Escape to exit editing
            if (e.key === 'Escape') {
                e.target.blur();
            }
            return;
        }

        // Ctrl/Cmd + S = Save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveSession();
        }

        // Ctrl/Cmd + C = Copy
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            e.preventDefault();
            copySelectedElement();
        }

        // Ctrl/Cmd + V = Paste
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.preventDefault();
            pasteElement();
        }

        // Ctrl/Cmd + D = Duplicate
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            duplicateElement();
        }

        // Ctrl/Cmd + G = Group (placeholder for now)
        if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey) {
            e.preventDefault();
            groupSelectedElements();
        }

        // Ctrl/Cmd + Shift + G = Ungroup
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
            e.preventDefault();
            ungroupSelectedElements();
        }

        // Ctrl/Cmd + L = Lock/Unlock element
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            toggleElementLock();
        }

        // Delete or Backspace = Delete selected
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedElement();
        }

        // Escape = Deselect
        if (e.key === 'Escape') {
            selectElement(null);
        }

        // ? = Show keyboard shortcuts
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
            e.preventDefault();
            showKeyboardShortcuts();
        }

        // Ctrl/Cmd + Plus = Zoom In
        if ((e.ctrlKey || e.metaKey) && e.key === '+') {
            e.preventDefault();
            zoomIn();
        }

        // Ctrl/Cmd + Minus = Zoom Out
        if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            e.preventDefault();
            zoomOut();
        }

        // Ctrl/Cmd + 0 = Fit to Width
        if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            e.preventDefault();
            fitToWidth();
        }

        // Arrow keys = Nudge selected element
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const selected = EditorState.selectedElement;
            if (selected) {
                e.preventDefault();
                const nudge = e.shiftKey ? 10 : 1;  // 10px with Shift, 1px without
                const currentLeft = parseInt(selected.style.left) || 0;
                const currentTop = parseInt(selected.style.top) || 0;

                switch (e.key) {
                    case 'ArrowUp':
                        selected.style.top = `${currentTop - nudge}px`;
                        break;
                    case 'ArrowDown':
                        selected.style.top = `${currentTop + nudge}px`;
                        break;
                    case 'ArrowLeft':
                        selected.style.left = `${currentLeft - nudge}px`;
                        break;
                    case 'ArrowRight':
                        selected.style.left = `${currentLeft + nudge}px`;
                        break;
                }
                markDirty();
            }
        }
    });

    // Scroll listener to auto-select page in view
    const canvasScroll = document.querySelector('.canvas-scroll');
    if (canvasScroll) {
        let scrollTimeout;
        canvasScroll.addEventListener('scroll', () => {
            // Debounce scroll events
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateCurrentPageFromScroll();
            }, 150);
        });
    }

    // Warn before closing with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (EditorState.isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
}

// ============================================================================
// EXPORT FUNCTIONALITY
// ============================================================================

async function exportPDF() {
    console.log('📄 Exporting PDF...');

    // First, save current state
    if (EditorState.isDirty) {
        await saveSession();
    }

    updateStatus('loading', 'Generating PDF...');
    showToast('Generating PDF... This may take a moment.', 'info');

    try {
        // Prepare pages data with photos
        const pagesData = (EditorState.sessionData.pages || []).map(page => {
            // Get photos for this page with their dataUrls
            const photos = (page.photos || []).map(photoItem => {
                // photoItem might be an ID or an object
                let photo = null;
                if (typeof photoItem === 'object' && photoItem !== null) {
                    photo = photoItem;
                } else {
                    // Look up by ID from session photos
                    if (Array.isArray(EditorState.sessionData.photos)) {
                        photo = EditorState.sessionData.photos.find(p => p.id === photoItem);
                    }
                }

                if (photo) {
                    return {
                        id: photo.id,
                        name: photo.name || 'photo.jpg',
                        dataUrl: photo.dataUrl,
                        category: photo.category || page.type,
                        width: photo.width,
                        height: photo.height,
                        wrapStyle: photo.wrapStyle || 'square'
                    };
                }
                return null;
            }).filter(Boolean);

            // Get content/description for this page
            const description = EditorState.pageDescriptions[page.id] ||
                               page.content?.description ||
                               page.content?.text ||
                               '';

            return {
                id: page.id,
                title: page.title || page.type,
                type: page.type,
                layout: page.layout || 'standard',
                photos: photos,
                content: {
                    description: description,
                    ...page.content
                }
            };
        });

        // Build export request
        const exportRequest = {
            property: EditorState.sessionData.property || {},
            agent: EditorState.sessionData.agent || {},
            pages: pagesData,
            layoutStyle: EditorState.sessionData.preferences?.layoutStyle || 'standard'
        };

        console.log('📤 Sending export request:', {
            pages: exportRequest.pages.length,
            property: exportRequest.property.address
        });

        // Call export endpoint
        const response = await fetch('/export/brochure-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(exportRequest)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail?.message || errorData.detail || `Export failed (${response.status})`);
        }

        // Download the PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        // Create download link
        const filename = `brochure_${EditorState.sessionData.property?.address || 'property'}_${Date.now()}.pdf`;
        const safeFilename = filename.replace(/[^a-z0-9_\-\.]/gi, '_');

        const a = document.createElement('a');
        a.href = url;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('✅ PDF exported successfully');
        showToast('PDF exported successfully!', 'success');
        updateStatus('ready', 'Ready');

    } catch (error) {
        console.error('❌ PDF export failed:', error);
        showToast(`Export failed: ${error.message}`, 'error');
        updateStatus('error', 'Export failed');
    }
}

// ============================================================================
// CLEANUP
// ============================================================================

window.addEventListener('unload', () => {
    stopAutoSave();
});

console.log('✅ Brochure Editor V3 loaded');
