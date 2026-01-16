/**
 * Color Schemes - Global color scheme management for brochure editor
 * Allows users to change the entire color palette with one click
 */

(function() {
    'use strict';

    // ============================================================================
    // PRESET COLOR SCHEMES
    // ============================================================================

    const COLOR_SCHEMES = {
        // Classic & Professional
        classicNavy: { name: 'Classic Navy', primary: '#1a365d', secondary: '#2c5282', accent: '#ed8936', background: '#ffffff', text: '#2d3748' },
        corporateBlue: { name: 'Corporate Blue', primary: '#0066cc', secondary: '#004499', accent: '#ff6600', background: '#f8fafc', text: '#1e293b' },
        executiveGray: { name: 'Executive Gray', primary: '#374151', secondary: '#6b7280', accent: '#f59e0b', background: '#ffffff', text: '#111827' },
        professionalGreen: { name: 'Professional Green', primary: '#065f46', secondary: '#047857', accent: '#fbbf24', background: '#f0fdf4', text: '#14532d' },

        // Luxury & Premium
        blackGold: { name: 'Black & Gold', primary: '#1a1a1a', secondary: '#333333', accent: '#d4af37', background: '#0d0d0d', text: '#ffffff' },
        platinumLux: { name: 'Platinum Luxury', primary: '#2d3748', secondary: '#4a5568', accent: '#c9a961', background: '#f7fafc', text: '#1a202c' },
        roseGoldElite: { name: 'Rose Gold Elite', primary: '#4a3728', secondary: '#6b4423', accent: '#e8b4b8', background: '#fdf2f8', text: '#3d2914' },
        sapphireRoyal: { name: 'Sapphire Royal', primary: '#1e3a5f', secondary: '#2c5282', accent: '#c9a961', background: '#f0f9ff', text: '#0c4a6e' },
        emeraldPrestige: { name: 'Emerald Prestige', primary: '#064e3b', secondary: '#047857', accent: '#fcd34d', background: '#ecfdf5', text: '#022c22' },

        // Modern & Contemporary
        modernMono: { name: 'Modern Mono', primary: '#000000', secondary: '#404040', accent: '#666666', background: '#ffffff', text: '#000000' },
        cleanSlate: { name: 'Clean Slate', primary: '#334155', secondary: '#64748b', accent: '#0ea5e9', background: '#f8fafc', text: '#0f172a' },
        urbanChic: { name: 'Urban Chic', primary: '#18181b', secondary: '#3f3f46', accent: '#a855f7', background: '#fafafa', text: '#09090b' },
        techModern: { name: 'Tech Modern', primary: '#0f172a', secondary: '#1e293b', accent: '#22d3ee', background: '#f1f5f9', text: '#020617' },

        // Bold & Vibrant
        sunsetCoral: { name: 'Sunset Coral', primary: '#dc2626', secondary: '#f97316', accent: '#fbbf24', background: '#fff7ed', text: '#7c2d12' },
        oceanBreeze: { name: 'Ocean Breeze', primary: '#0891b2', secondary: '#06b6d4', accent: '#f97316', background: '#ecfeff', text: '#164e63' },
        forestFresh: { name: 'Forest Fresh', primary: '#15803d', secondary: '#22c55e', accent: '#facc15', background: '#f0fdf4', text: '#14532d' },
        berryBliss: { name: 'Berry Bliss', primary: '#7c3aed', secondary: '#a855f7', accent: '#f472b6', background: '#faf5ff', text: '#4c1d95' },

        // Natural & Earthy
        warmSand: { name: 'Warm Sand', primary: '#92400e', secondary: '#b45309', accent: '#059669', background: '#fefce8', text: '#78350f' },
        stoneNatural: { name: 'Stone Natural', primary: '#57534e', secondary: '#78716c', accent: '#84cc16', background: '#fafaf9', text: '#292524' },
        woodlandBrown: { name: 'Woodland Brown', primary: '#5c4033', secondary: '#8b6914', accent: '#4ade80', background: '#fdf6e3', text: '#3d2914' },
        terracotta: { name: 'Terracotta', primary: '#c2410c', secondary: '#ea580c', accent: '#16a34a', background: '#fff7ed', text: '#7c2d12' },

        // 2026 British Cosy Modern
        britishCottage: { name: 'British Cottage', primary: '#5d6e5c', secondary: '#a8b5a0', accent: '#d4a574', background: '#faf8f5', text: '#3d3d3d' },
        cosyHearth: { name: 'Cosy Hearth', primary: '#8b4d3b', secondary: '#c9a88e', accent: '#deb887', background: '#fff9f5', text: '#4a3728' },
        sageAndStone: { name: 'Sage & Stone', primary: '#7d8471', secondary: '#b5baa8', accent: '#c49a6c', background: '#f5f5f0', text: '#404040' },
        dustyRose: { name: 'Dusty Rose', primary: '#b8848c', secondary: '#d4a5a5', accent: '#8b7355', background: '#fdf6f6', text: '#5c4a4a' },
        warmTaupe: { name: 'Warm Taupe', primary: '#8b7d72', secondary: '#a89f94', accent: '#c17f59', background: '#faf7f4', text: '#4a4540' },
        heritageGreen: { name: 'Heritage Green', primary: '#2d4a3e', secondary: '#5c7a6b', accent: '#d4af37', background: '#f4f7f5', text: '#1a2e24' },
        countryManor: { name: 'Country Manor', primary: '#4a5568', secondary: '#9ca3af', accent: '#92400e', background: '#f8f6f3', text: '#2d3748' },
        coastalCalm: { name: 'Coastal Calm', primary: '#4a6670', secondary: '#8fa3ad', accent: '#d4a574', background: '#f5f8f9', text: '#2c3e43' },

        // UK Agency Inspired
        savillsStyle: { name: 'Savills', primary: '#1a3c6e', secondary: '#c9a961', accent: '#8b7355', background: '#f8f6f3', text: '#333333' },
        knightFrankStyle: { name: 'Knight Frank', primary: '#003366', secondary: '#d4af37', accent: '#4a4a4a', background: '#ffffff', text: '#1a1a1a' },
        foxtonsStyle: { name: 'Foxtons', primary: '#00594c', secondary: '#8dc63f', accent: '#ffffff', background: '#f5f5f5', text: '#333333' },
        purpleBricksStyle: { name: 'Purple Bricks', primary: '#6b2d5b', secondary: '#f7941d', accent: '#ffffff', background: '#ffffff', text: '#333333' },
        rightmoveStyle: { name: 'Rightmove', primary: '#00deb6', secondary: '#2c2c2c', accent: '#ff5a00', background: '#ffffff', text: '#2c2c2c' },
        zooplaStyle: { name: 'Zoopla', primary: '#6d2077', secondary: '#e95420', accent: '#8a3e91', background: '#ffffff', text: '#333333' },
        hamptonsStyle: { name: 'Hamptons', primary: '#003057', secondary: '#c5a572', accent: '#666666', background: '#f9f9f9', text: '#1a1a1a' },
        dextersStyle: { name: 'Dexters', primary: '#000000', secondary: '#e31837', accent: '#ffffff', background: '#f5f5f5', text: '#1a1a1a' }
    };

    // Current active scheme
    let currentScheme = null;

    // ============================================================================
    // RENDER SCHEMES GRID
    // ============================================================================

    function renderColorSchemesGrid() {
        const grid = document.getElementById('colorSchemesGrid');
        if (!grid) return;

        const categories = [
            { name: 'Professional', schemes: ['classicNavy', 'corporateBlue', 'executiveGray', 'professionalGreen'] },
            { name: 'Luxury', schemes: ['blackGold', 'platinumLux', 'roseGoldElite', 'sapphireRoyal', 'emeraldPrestige'] },
            { name: 'Modern', schemes: ['modernMono', 'cleanSlate', 'urbanChic', 'techModern'] },
            { name: 'Bold', schemes: ['sunsetCoral', 'oceanBreeze', 'forestFresh', 'berryBliss'] },
            { name: 'Natural', schemes: ['warmSand', 'stoneNatural', 'woodlandBrown', 'terracotta'] },
            { name: 'British Cosy', schemes: ['britishCottage', 'cosyHearth', 'sageAndStone', 'dustyRose', 'warmTaupe', 'heritageGreen', 'countryManor', 'coastalCalm'] },
            { name: 'UK Agencies', schemes: ['savillsStyle', 'knightFrankStyle', 'foxtonsStyle', 'purpleBricksStyle', 'rightmoveStyle', 'zooplaStyle', 'hamptonsStyle', 'dextersStyle'] }
        ];

        grid.innerHTML = categories.map(cat => `
            <div class="scheme-category">
                <h5 style="font-size: 11px; color: #666; margin: 12px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">${cat.name}</h5>
                <div class="schemes-row" style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${cat.schemes.map(schemeId => {
                        const scheme = COLOR_SCHEMES[schemeId];
                        if (!scheme) return '';
                        return `
                            <div class="scheme-swatch ${currentScheme === schemeId ? 'active' : ''}"
                                 data-scheme="${schemeId}"
                                 title="${scheme.name}"
                                 onclick="ColorSchemes.apply('${schemeId}')"
                                 style="
                                    width: 40px;
                                    height: 40px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    position: relative;
                                    overflow: hidden;
                                    border: 2px solid ${currentScheme === schemeId ? '#0066ff' : '#e0e0e0'};
                                    box-shadow: ${currentScheme === schemeId ? '0 0 0 2px rgba(0,102,255,0.3)' : 'none'};
                                    transition: all 0.2s;
                                 ">
                                <div style="position: absolute; top: 0; left: 0; width: 50%; height: 50%; background: ${scheme.primary};"></div>
                                <div style="position: absolute; top: 0; right: 0; width: 50%; height: 50%; background: ${scheme.secondary};"></div>
                                <div style="position: absolute; bottom: 0; left: 0; width: 50%; height: 50%; background: ${scheme.accent};"></div>
                                <div style="position: absolute; bottom: 0; right: 0; width: 50%; height: 50%; background: ${scheme.background}; border: 1px solid #eee;"></div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `).join('');

        // Add hover effects
        grid.querySelectorAll('.scheme-swatch').forEach(swatch => {
            swatch.addEventListener('mouseenter', () => {
                if (!swatch.classList.contains('active')) {
                    swatch.style.transform = 'scale(1.1)';
                    swatch.style.borderColor = '#999';
                }
            });
            swatch.addEventListener('mouseleave', () => {
                if (!swatch.classList.contains('active')) {
                    swatch.style.transform = 'scale(1)';
                    swatch.style.borderColor = '#e0e0e0';
                }
            });
        });
    }

    // ============================================================================
    // APPLY COLOR SCHEME
    // ============================================================================

    function applyColorScheme(schemeId, currentPageOnly = false) {
        const scheme = COLOR_SCHEMES[schemeId];
        if (!scheme) {
            console.error('Unknown color scheme:', schemeId);
            return;
        }

        currentScheme = schemeId;
        applyColorsToPages(scheme, currentPageOnly);
        updateCustomColorInputs(scheme);
        renderColorSchemesGrid(); // Re-render to show active state

        if (typeof showToast === 'function') {
            showToast(`Applied "${scheme.name}" color scheme`, 'success');
        }

        // Mark as dirty
        if (window.EditorState) {
            window.EditorState.isDirty = true;
        }

        // Save to history
        if (typeof saveToHistory === 'function') {
            saveToHistory('apply color scheme');
        }
    }

    function applyColorsToPages(scheme, currentPageOnly = false) {
        const pages = currentPageOnly && window.EditorState?.currentPage
            ? [document.querySelector(`.brochure-page[data-page-id="${window.EditorState.currentPage}"]`)]
            : document.querySelectorAll('.brochure-page');

        pages.forEach(page => {
            if (!page) return;

            // Apply background color to page
            page.style.backgroundColor = scheme.background;

            // Apply colors to shapes (SVG elements)
            page.querySelectorAll('.draggable-element[data-element-type="shape"] svg').forEach(svg => {
                // Apply primary color to fill
                svg.querySelectorAll('[fill]:not([fill="none"])').forEach(el => {
                    const currentFill = el.getAttribute('fill');
                    if (currentFill && currentFill !== 'none' && currentFill !== 'currentColor') {
                        el.setAttribute('fill', scheme.primary);
                    }
                });
                svg.querySelectorAll('[stroke]:not([stroke="none"])').forEach(el => {
                    const currentStroke = el.getAttribute('stroke');
                    if (currentStroke && currentStroke !== 'none' && currentStroke !== 'currentColor') {
                        el.setAttribute('stroke', scheme.secondary);
                    }
                });
            });

            // Apply colors to icons
            page.querySelectorAll('.draggable-element[data-element-type="icon"] svg').forEach(svg => {
                svg.querySelectorAll('[fill]:not([fill="none"])').forEach(el => {
                    el.setAttribute('fill', scheme.accent);
                });
                svg.querySelectorAll('[stroke]:not([stroke="none"])').forEach(el => {
                    el.setAttribute('stroke', scheme.accent);
                });
            });

            // Apply colors to text elements
            page.querySelectorAll('.text-element, .editable-text, [contenteditable="true"]').forEach(textEl => {
                // Check if it's a heading (larger font or specific class)
                const fontSize = parseInt(window.getComputedStyle(textEl).fontSize);
                if (fontSize >= 24 || textEl.classList.contains('heading') || textEl.tagName === 'H1' || textEl.tagName === 'H2') {
                    textEl.style.color = scheme.primary;
                } else {
                    textEl.style.color = scheme.text;
                }
            });

            // Apply colors to decorative elements with backgrounds
            page.querySelectorAll('.draggable-element').forEach(el => {
                const bg = el.style.backgroundColor;
                if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                    // Determine which color to use based on element type or position
                    const rect = el.getBoundingClientRect();
                    const pageRect = page.getBoundingClientRect();
                    const isHeader = rect.top - pageRect.top < pageRect.height * 0.2;
                    const isFooter = rect.bottom - pageRect.top > pageRect.height * 0.8;

                    if (isHeader || isFooter) {
                        el.style.backgroundColor = scheme.primary;
                    } else {
                        el.style.backgroundColor = scheme.secondary;
                    }
                }
            });

            // Apply accent color to special elements (badges, buttons, highlights)
            page.querySelectorAll('.badge, .price-badge, .highlight, .cta-button').forEach(el => {
                el.style.backgroundColor = scheme.accent;
            });
        });
    }

    // ============================================================================
    // CUSTOM COLORS
    // ============================================================================

    function updateCustomColorInputs(scheme) {
        const inputs = {
            primary: ['schemePrimary', 'schemePrimaryHex'],
            secondary: ['schemeSecondary', 'schemeSecondaryHex'],
            accent: ['schemeAccent', 'schemeAccentHex'],
            background: ['schemeBackground', 'schemeBackgroundHex'],
            text: ['schemeText', 'schemeTextHex']
        };

        Object.entries(inputs).forEach(([key, [colorId, hexId]]) => {
            const colorInput = document.getElementById(colorId);
            const hexInput = document.getElementById(hexId);
            if (colorInput && hexInput && scheme[key]) {
                colorInput.value = scheme[key];
                hexInput.value = scheme[key];
            }
        });
    }

    function getCustomSchemeFromInputs() {
        return {
            name: 'Custom',
            primary: document.getElementById('schemePrimary')?.value || '#1a365d',
            secondary: document.getElementById('schemeSecondary')?.value || '#c9a961',
            accent: document.getElementById('schemeAccent')?.value || '#ed8936',
            background: document.getElementById('schemeBackground')?.value || '#ffffff',
            text: document.getElementById('schemeText')?.value || '#2d3748'
        };
    }

    function applyCustomColorScheme(currentPageOnly = false) {
        const scheme = getCustomSchemeFromInputs();
        currentScheme = null; // Clear preset selection
        applyColorsToPages(scheme, currentPageOnly);
        renderColorSchemesGrid(); // Clear active states

        if (typeof showToast === 'function') {
            showToast(`Applied custom color scheme${currentPageOnly ? ' to current page' : ''}`, 'success');
        }

        if (window.EditorState) {
            window.EditorState.isDirty = true;
        }

        if (typeof saveToHistory === 'function') {
            saveToHistory('apply custom colors');
        }
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    function initColorInputSync() {
        const pairs = [
            ['schemePrimary', 'schemePrimaryHex'],
            ['schemeSecondary', 'schemeSecondaryHex'],
            ['schemeAccent', 'schemeAccentHex'],
            ['schemeBackground', 'schemeBackgroundHex'],
            ['schemeText', 'schemeTextHex']
        ];

        pairs.forEach(([colorId, hexId]) => {
            const colorInput = document.getElementById(colorId);
            const hexInput = document.getElementById(hexId);

            if (colorInput && hexInput) {
                colorInput.addEventListener('input', () => {
                    hexInput.value = colorInput.value;
                });
                hexInput.addEventListener('change', () => {
                    let val = hexInput.value;
                    if (!val.startsWith('#')) val = '#' + val;
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        colorInput.value = val;
                        hexInput.value = val;
                    }
                });
            }
        });
    }

    function init() {
        renderColorSchemesGrid();
        initColorInputSync();
        console.log('Color Schemes initialized with', Object.keys(COLOR_SCHEMES).length, 'schemes');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Small delay to ensure panel is rendered
        setTimeout(init, 100);
    }

    // Also re-init when colors panel is shown
    document.addEventListener('click', (e) => {
        if (e.target.matches('[data-panel="colors"]')) {
            setTimeout(renderColorSchemesGrid, 50);
        }
    });

    // ============================================================================
    // EXPORT
    // ============================================================================

    window.ColorSchemes = {
        apply: applyColorScheme,
        applyCustom: applyCustomColorScheme,
        getSchemes: () => COLOR_SCHEMES,
        getCurrent: () => currentScheme,
        render: renderColorSchemesGrid
    };

    // Also expose for onclick handlers
    window.applyCustomColorScheme = applyCustomColorScheme;

})();
