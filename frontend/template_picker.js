/**
 * Template Picker - Canva-style template selection with category filtering
 */

(function() {
    'use strict';

    // Template categories
    const TEMPLATE_CATEGORIES = [
        { id: 'my-templates', name: 'My Templates', icon: '⭐' },
        { id: 'professional', name: 'Professional', icon: '✨' },  // NEW! Top-tier templates
        { id: 'all', name: 'All Templates', icon: '🎨' },
        { id: 'agency', name: 'UK Agencies', icon: '🏢' },
        { id: 'minimalist', name: 'Minimalist', icon: '⬜' },
        { id: 'bold', name: 'Bold', icon: '🌅' },
        { id: 'luxury', name: 'Luxury', icon: '🏆' },
        { id: 'social', name: 'Social Media', icon: '📱' }
    ];

    // Custom templates cache
    let customTemplates = [];
    let customTemplatesLoaded = false;

    let currentCategory = 'all';
    let searchTerm = '';
    let currentContainerId = 'templatePickerContent'; // Track current container

    /**
     * Generate a visual SVG preview showing what a brochure page looks like with this template
     */
    function generateVisualPreview(template) {
        const styles = template.styles || {};
        const accent = styles.accentColor || '#4A1420';
        const bg = styles.pageBackground || '#ffffff';
        const textPrimary = styles.textPrimary || '#333333';
        const textSecondary = styles.textSecondary || '#666666';
        const secondary = styles.accentSecondary || '#f5f5f5';

        // Choose a layout variation based on template ID hash
        const layoutVariant = getLayoutVariant(template.id);

        return generateLayoutSVG(layoutVariant, { accent, bg, textPrimary, textSecondary, secondary });
    }

    /**
     * Get layout variant based on template ID
     */
    function getLayoutVariant(id) {
        if (!id) return 0;
        const variants = ['hero', 'split', 'magazine', 'minimal', 'overlay'];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) - hash) + id.charCodeAt(i);
        }
        return variants[Math.abs(hash) % variants.length];
    }

    /**
     * Generate SVG for different layout styles - realistic brochure previews
     */
    function generateLayoutSVG(variant, colors) {
        const { accent, bg, textPrimary, textSecondary, secondary } = colors;

        // Create unique IDs for gradients based on accent color
        const uid = accent.replace('#', '') + Math.random().toString(36).substr(2, 4);

        const layouts = {
            // Luxury property cover - full hero image with elegant overlay
            hero: `
                <svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="sky${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#87CEEB"/>
                            <stop offset="100%" stop-color="#E0F4FF"/>
                        </linearGradient>
                        <linearGradient id="heroOverlay${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="transparent"/>
                            <stop offset="60%" stop-color="transparent"/>
                            <stop offset="100%" stop-color="${accent}" stop-opacity="0.9"/>
                        </linearGradient>
                    </defs>
                    <!-- Sky background -->
                    <rect width="200" height="180" fill="url(#sky${uid})"/>
                    <!-- House silhouette -->
                    <rect x="30" y="100" width="140" height="80" fill="#8B7355" rx="2"/>
                    <polygon points="100,50 30,100 170,100" fill="#654321"/>
                    <rect x="50" y="120" width="25" height="35" fill="#4A4A4A"/>
                    <rect x="85" y="130" width="30" height="50" fill="#6B4423"/>
                    <rect x="130" y="120" width="25" height="35" fill="#4A4A4A"/>
                    <!-- Windows glow -->
                    <rect x="53" y="123" width="19" height="14" fill="#FFE4B5" opacity="0.8"/>
                    <rect x="133" y="123" width="19" height="14" fill="#FFE4B5" opacity="0.8"/>
                    <!-- Garden/grass -->
                    <rect x="0" y="175" width="200" height="10" fill="#228B22"/>
                    <!-- Gradient overlay -->
                    <rect width="200" height="185" fill="url(#heroOverlay${uid})"/>
                    <!-- Price badge -->
                    <rect x="140" y="8" width="52" height="22" fill="${accent}" rx="3"/>
                    <text x="166" y="17" fill="white" font-size="6" text-anchor="middle" font-weight="bold">FOR SALE</text>
                    <text x="166" y="26" fill="white" font-size="8" text-anchor="middle" font-weight="bold">£850,000</text>
                    <!-- Content area -->
                    <rect x="0" y="185" width="200" height="95" fill="${bg}"/>
                    <!-- Property name -->
                    <text x="15" y="205" fill="${accent}" font-size="11" font-weight="bold">Primrose Cottage</text>
                    <text x="15" y="218" fill="${textSecondary}" font-size="7">Cotswolds, Gloucestershire</text>
                    <!-- Divider -->
                    <line x1="15" y1="228" x2="185" y2="228" stroke="${secondary}" stroke-width="1"/>
                    <!-- Features row -->
                    <g fill="${textPrimary}" font-size="7">
                        <text x="25" y="245" text-anchor="middle">🛏️</text>
                        <text x="25" y="256" text-anchor="middle" font-weight="bold">4</text>
                        <text x="70" y="245" text-anchor="middle">🚿</text>
                        <text x="70" y="256" text-anchor="middle" font-weight="bold">3</text>
                        <text x="115" y="245" text-anchor="middle">🚗</text>
                        <text x="115" y="256" text-anchor="middle" font-weight="bold">2</text>
                        <text x="160" y="245" text-anchor="middle">📐</text>
                        <text x="160" y="256" text-anchor="middle" font-weight="bold">2,400</text>
                    </g>
                    <!-- Description preview -->
                    <rect x="15" y="265" width="170" height="3" fill="${textSecondary}" rx="1" opacity="0.4"/>
                </svg>
            `,

            // Split layout - professional side-by-side
            split: `
                <svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="splitSky${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#87CEEB"/>
                            <stop offset="100%" stop-color="#B0E0E6"/>
                        </linearGradient>
                    </defs>
                    <!-- Left side - Image -->
                    <rect width="95" height="280" fill="url(#splitSky${uid})"/>
                    <!-- Modern house -->
                    <rect x="10" y="80" width="75" height="60" fill="#F5F5F5" rx="2"/>
                    <rect x="10" y="70" width="75" height="15" fill="#2C3E50"/>
                    <rect x="20" y="95" width="20" height="30" fill="#34495E"/>
                    <rect x="50" y="90" width="25" height="35" fill="#5DADE2" opacity="0.6"/>
                    <rect x="10" y="140" width="75" height="20" fill="#27AE60"/>
                    <!-- Accent bar -->
                    <rect x="0" y="0" width="5" height="280" fill="${accent}"/>

                    <!-- Right side - Content -->
                    <rect x="95" y="0" width="105" height="280" fill="${bg}"/>
                    <!-- Header -->
                    <rect x="105" y="20" width="40" height="4" fill="${accent}" rx="1"/>
                    <text x="105" y="45" fill="${textPrimary}" font-size="10" font-weight="bold">The Willows</text>
                    <text x="105" y="58" fill="${textSecondary}" font-size="6">Richmond, Surrey</text>
                    <!-- Price -->
                    <text x="105" y="78" fill="${accent}" font-size="12" font-weight="bold">£1,250,000</text>
                    <!-- Divider -->
                    <line x1="105" y1="88" x2="190" y2="88" stroke="${secondary}" stroke-width="1"/>
                    <!-- Description -->
                    <rect x="105" y="98" width="80" height="3" fill="${textSecondary}" rx="1" opacity="0.5"/>
                    <rect x="105" y="106" width="75" height="3" fill="${textSecondary}" rx="1" opacity="0.4"/>
                    <rect x="105" y="114" width="70" height="3" fill="${textSecondary}" rx="1" opacity="0.4"/>
                    <rect x="105" y="122" width="78" height="3" fill="${textSecondary}" rx="1" opacity="0.4"/>
                    <rect x="105" y="130" width="65" height="3" fill="${textSecondary}" rx="1" opacity="0.3"/>
                    <!-- Features boxes -->
                    <rect x="105" y="150" width="38" height="35" fill="${secondary}" rx="4"/>
                    <text x="124" y="167" fill="${accent}" font-size="12" text-anchor="middle" font-weight="bold">5</text>
                    <text x="124" y="180" fill="${textSecondary}" font-size="5" text-anchor="middle">Bedrooms</text>
                    <rect x="148" y="150" width="38" height="35" fill="${secondary}" rx="4"/>
                    <text x="167" y="167" fill="${accent}" font-size="12" text-anchor="middle" font-weight="bold">3</text>
                    <text x="167" y="180" fill="${textSecondary}" font-size="5" text-anchor="middle">Bathrooms</text>
                    <!-- Key features list -->
                    <text x="105" y="205" fill="${textPrimary}" font-size="6" font-weight="bold">Key Features</text>
                    <circle cx="110" cy="218" r="2" fill="${accent}"/>
                    <text x="116" y="220" fill="${textSecondary}" font-size="5">Period property</text>
                    <circle cx="110" cy="232" r="2" fill="${accent}"/>
                    <text x="116" y="234" fill="${textSecondary}" font-size="5">Private garden</text>
                    <circle cx="110" cy="246" r="2" fill="${accent}"/>
                    <text x="116" y="248" fill="${textSecondary}" font-size="5">Close to schools</text>
                    <!-- CTA Button -->
                    <rect x="105" y="258" width="80" height="16" fill="${accent}" rx="3"/>
                    <text x="145" y="269" fill="white" font-size="6" text-anchor="middle" font-weight="bold">Book Viewing</text>
                </svg>
            `,

            // Magazine style - editorial layout
            magazine: `
                <svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
                    <rect width="200" height="280" fill="${bg}"/>
                    <!-- Accent stripe -->
                    <rect x="0" y="0" width="200" height="6" fill="${accent}"/>
                    <!-- Header area -->
                    <text x="15" y="28" fill="${accent}" font-size="8" font-weight="bold" letter-spacing="2">FEATURED PROPERTY</text>
                    <!-- Main image -->
                    <rect x="15" y="40" width="170" height="85" fill="#E8E8E8" rx="4"/>
                    <rect x="20" y="45" width="160" height="75" fill="#B8D4E8" rx="2"/>
                    <!-- House illustration -->
                    <rect x="60" y="75" width="80" height="40" fill="#D4A574"/>
                    <polygon points="100,55 55,80 145,80" fill="#8B4513"/>
                    <rect x="85" y="90" width="30" height="25" fill="#4A3728"/>
                    <rect x="70" y="85" width="12" height="15" fill="#87CEEB" opacity="0.7"/>
                    <rect x="118" y="85" width="12" height="15" fill="#87CEEB" opacity="0.7"/>
                    <!-- Price overlay -->
                    <rect x="130" y="48" width="52" height="18" fill="${accent}" rx="2"/>
                    <text x="156" y="60" fill="white" font-size="8" text-anchor="middle" font-weight="bold">£725,000</text>
                    <!-- Title section -->
                    <text x="15" y="145" fill="${textPrimary}" font-size="11" font-weight="bold">Victorian Townhouse</text>
                    <text x="15" y="158" fill="${textSecondary}" font-size="6">Islington, North London</text>
                    <!-- Two column layout -->
                    <rect x="15" y="170" width="80" height="50" fill="${secondary}" rx="4"/>
                    <text x="55" y="188" fill="${textPrimary}" font-size="6" text-anchor="middle" font-weight="bold">Property Highlights</text>
                    <text x="25" y="202" fill="${textSecondary}" font-size="5">• 4 bedrooms</text>
                    <text x="25" y="212" fill="${textSecondary}" font-size="5">• Garden</text>
                    <rect x="105" y="170" width="80" height="50" fill="${secondary}" rx="4"/>
                    <text x="145" y="188" fill="${textPrimary}" font-size="6" text-anchor="middle" font-weight="bold">Location</text>
                    <text x="115" y="202" fill="${textSecondary}" font-size="5">• 5 min to tube</text>
                    <text x="115" y="212" fill="${textSecondary}" font-size="5">• Local shops</text>
                    <!-- Description -->
                    <rect x="15" y="232" width="170" height="3" fill="${textSecondary}" rx="1" opacity="0.4"/>
                    <rect x="15" y="240" width="160" height="3" fill="${textSecondary}" rx="1" opacity="0.3"/>
                    <rect x="15" y="248" width="165" height="3" fill="${textSecondary}" rx="1" opacity="0.3"/>
                    <!-- Footer CTA -->
                    <rect x="50" y="260" width="100" height="14" fill="${accent}" rx="3"/>
                    <text x="100" y="270" fill="white" font-size="6" text-anchor="middle" font-weight="bold">View Full Details</text>
                </svg>
            `,

            // Minimal clean design - modern luxury
            minimal: `
                <svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
                    <rect width="200" height="280" fill="${bg}"/>
                    <!-- Thin accent line -->
                    <rect x="20" y="20" width="30" height="3" fill="${accent}"/>
                    <!-- Property name large -->
                    <text x="20" y="50" fill="${textPrimary}" font-size="14" font-weight="bold">Maple</text>
                    <text x="20" y="68" fill="${textPrimary}" font-size="14" font-weight="bold">House</text>
                    <text x="20" y="85" fill="${textSecondary}" font-size="7">Hampstead, London NW3</text>
                    <!-- Large price -->
                    <text x="20" y="110" fill="${accent}" font-size="16" font-weight="bold">£2.4M</text>
                    <!-- Minimal image -->
                    <rect x="20" y="125" width="160" height="80" fill="#F0F0F0" rx="2"/>
                    <rect x="25" y="130" width="150" height="70" fill="#C9E4F3" rx="1"/>
                    <!-- Minimalist house -->
                    <rect x="65" y="155" width="70" height="40" fill="white"/>
                    <rect x="70" y="160" width="25" height="30" fill="#333" opacity="0.1"/>
                    <rect x="105" y="170" width="20" height="20" fill="#333" opacity="0.1"/>
                    <!-- Stats row - clean -->
                    <g fill="${textPrimary}" font-size="9">
                        <text x="35" y="225" text-anchor="middle" font-weight="bold">6</text>
                        <text x="35" y="235" fill="${textSecondary}" font-size="5" text-anchor="middle">beds</text>
                        <text x="75" y="225" text-anchor="middle" font-weight="bold">4</text>
                        <text x="75" y="235" fill="${textSecondary}" font-size="5" text-anchor="middle">baths</text>
                        <text x="125" y="225" text-anchor="middle" font-weight="bold">3,200</text>
                        <text x="125" y="235" fill="${textSecondary}" font-size="5" text-anchor="middle">sq ft</text>
                    </g>
                    <!-- Minimal divider -->
                    <line x1="20" y1="248" x2="180" y2="248" stroke="${secondary}" stroke-width="1"/>
                    <!-- Clean CTA -->
                    <text x="20" y="268" fill="${accent}" font-size="7" font-weight="bold">ARRANGE VIEWING →</text>
                </svg>
            `,

            // Overlay premium style - dark sophisticated
            overlay: `
                <svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="darkOverlay${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#1a1a2e" stop-opacity="0.7"/>
                            <stop offset="100%" stop-color="#1a1a2e" stop-opacity="0.95"/>
                        </linearGradient>
                    </defs>
                    <!-- Background image simulation -->
                    <rect width="200" height="280" fill="#4a6fa5"/>
                    <rect x="0" y="50" width="200" height="150" fill="#6b8cae"/>
                    <!-- Building silhouette -->
                    <rect x="40" y="80" width="120" height="100" fill="#2c3e50"/>
                    <rect x="50" y="90" width="20" height="25" fill="#f4d03f" opacity="0.5"/>
                    <rect x="80" y="90" width="20" height="25" fill="#f4d03f" opacity="0.4"/>
                    <rect x="110" y="90" width="20" height="25" fill="#f4d03f" opacity="0.5"/>
                    <rect x="50" y="125" width="20" height="25" fill="#f4d03f" opacity="0.3"/>
                    <rect x="80" y="130" width="40" height="50" fill="#34495e"/>
                    <rect x="110" y="125" width="20" height="25" fill="#f4d03f" opacity="0.4"/>
                    <!-- Dark overlay -->
                    <rect width="200" height="280" fill="url(#darkOverlay${uid})"/>
                    <!-- Logo/brand area -->
                    <rect x="75" y="15" width="50" height="20" fill="${accent}" rx="2"/>
                    <text x="100" y="28" fill="white" font-size="6" text-anchor="middle" font-weight="bold">EXCLUSIVE</text>
                    <!-- Central content card -->
                    <rect x="25" y="100" width="150" height="90" fill="white" rx="4" opacity="0.95"/>
                    <text x="100" y="125" fill="${accent}" font-size="7" text-anchor="middle" letter-spacing="2">PENTHOUSE</text>
                    <text x="100" y="145" fill="${textPrimary}" font-size="11" text-anchor="middle" font-weight="bold">The Shard</text>
                    <text x="100" y="160" fill="${textSecondary}" font-size="6" text-anchor="middle">London Bridge, SE1</text>
                    <text x="100" y="180" fill="${accent}" font-size="14" text-anchor="middle" font-weight="bold">£8,500,000</text>
                    <!-- Bottom features on dark -->
                    <g fill="white" font-size="6">
                        <text x="40" y="215" text-anchor="middle">🛏️ 4 Beds</text>
                        <text x="100" y="215" text-anchor="middle">🚿 4 Baths</text>
                        <text x="160" y="215" text-anchor="middle">📐 4,500 sqft</text>
                    </g>
                    <!-- Premium CTA -->
                    <rect x="50" y="235" width="100" height="20" fill="${accent}" rx="4"/>
                    <text x="100" y="248" fill="white" font-size="7" text-anchor="middle" font-weight="bold">Private Viewing</text>
                    <!-- Agent branding -->
                    <text x="100" y="272" fill="white" font-size="5" text-anchor="middle" opacity="0.7">Exclusive to Premium Estates</text>
                </svg>
            `
        };

        return layouts[variant] || layouts.hero;
    }

    /**
     * Get templates by category
     */
    function getTemplatesByCategory(category) {
        // Handle custom templates category
        if (category === 'my-templates') {
            return { isCustom: true, templates: customTemplates };
        }

        if (!window.BrochureTemplates || !window.BrochureTemplates.free) {
            console.warn('BrochureTemplates not loaded');
            return [];
        }

        const freeTemplates = Object.values(window.BrochureTemplates.free);

        // Get professional templates (NEW!)
        const professionalTemplates = window.BrochureTemplates.professional
            ? Object.values(window.BrochureTemplates.professional)
            : [];

        // Handle professional category (NEW!)
        if (category === 'professional') {
            return professionalTemplates;
        }

        // Combine all templates for 'all' category
        const allTemplates = [...professionalTemplates, ...freeTemplates];

        if (category === 'all') {
            return allTemplates;
        }

        // Map categories to template prefixes or category fields
        const categoryMap = {
            'agency': ['savills', 'rightmove', 'zoopla', 'foxtons', 'knight_frank', 'hamptons', 'winkworth', 'strutt', 'chestertons', 'dexters', 'purplebricks', 'connells', 'countrywide', 'countryside', 'jackson', 'mayfair'],
            'minimalist': template => template.category === 'minimalist' || template.id?.startsWith('minimal'),
            'bold': template => template.category === 'bold' || template.id?.startsWith('bold'),
            'luxury': template => template.category === 'luxury' || template.id?.startsWith('luxury'),
            'social': template => template.category === 'social' || template.id?.startsWith('social')
        };

        const filter = categoryMap[category];

        if (Array.isArray(filter)) {
            // Filter by ID prefix
            return freeTemplates.filter(t => filter.some(prefix => t.id?.startsWith(prefix)));
        } else if (typeof filter === 'function') {
            // Filter by function
            return freeTemplates.filter(filter);
        }

        return allTemplates;
    }

    /**
     * Filter templates by search term
     */
    function filterBySearch(templates, term) {
        if (!term) return templates;
        const lowerTerm = term.toLowerCase();
        return templates.filter(t =>
            t.name?.toLowerCase().includes(lowerTerm) ||
            t.description?.toLowerCase().includes(lowerTerm) ||
            t.id?.toLowerCase().includes(lowerTerm)
        );
    }

    /**
     * Render template picker panel
     */
    function renderTemplatePicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Store current container ID for re-renders
        currentContainerId = containerId;

        let result = getTemplatesByCategory(currentCategory);
        const isCustomCategory = result && result.isCustom;
        let templates = isCustomCategory ? result.templates : result;

        // Filter by search (works for both custom and built-in templates)
        templates = filterBySearch(templates || [], searchTerm);

        // Generate templates grid content
        let templatesGridContent;
        if (isCustomCategory) {
            templatesGridContent = renderCustomTemplatesGrid(templates);
        } else {
            templatesGridContent = templates.length > 0 ? templates.map(template => `
                <div class="template-card" data-template-id="${template.id}" title="${template.description || template.name}">
                    <div class="template-preview-svg">
                        ${generateVisualPreview(template)}
                    </div>
                    <div class="template-info">
                        <div class="template-colors">
                            <span style="background: ${template.styles?.accentColor || '#333'}"></span>
                            <span style="background: ${template.styles?.pageBackground || '#fff'}"></span>
                            <span style="background: ${template.styles?.textPrimary || '#333'}"></span>
                        </div>
                        <span class="template-name">${template.name}</span>
                    </div>
                </div>
            `).join('') : `
                <div class="no-templates">
                    <p>No templates found</p>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="template-picker">
                <!-- Search Bar -->
                <div class="template-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="templateSearchInput" placeholder="Search templates..." value="${searchTerm}">
                </div>

                <!-- Category Tabs -->
                <div class="template-categories">
                    ${TEMPLATE_CATEGORIES.map(cat => `
                        <button class="category-btn ${currentCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
                            <span class="category-icon">${cat.icon}</span>
                            <span class="category-name">${cat.name}</span>
                        </button>
                    `).join('')}
                </div>

                ${isCustomCategory ? `
                <!-- Save Template Button -->
                <div class="save-template-bar">
                    <button class="btn btn-primary save-template-btn" id="saveCurrentAsTemplate">
                        <span>+</span> Save Current Design as Template
                    </button>
                </div>
                ` : ''}

                <!-- Templates Grid -->
                <div class="templates-grid ${isCustomCategory ? 'custom-templates-grid' : ''}">
                    ${templatesGridContent}
                </div>

                <!-- Template Count -->
                <div class="template-count">
                    ${templates.length} ${isCustomCategory ? 'custom ' : ''}template${templates.length !== 1 ? 's' : ''} ${isCustomCategory ? 'saved' : 'available'}
                </div>
            </div>
        `;

        // Attach event listeners
        initTemplatePickerEvents(container, isCustomCategory);
    }

    /**
     * Render custom templates grid
     */
    function renderCustomTemplatesGrid(templates) {
        if (!templates || templates.length === 0) {
            return `
                <div class="empty-templates">
                    <div class="empty-icon">⭐</div>
                    <h4>No Custom Templates Yet</h4>
                    <p>Save your current design as a template to reuse it later.</p>
                </div>
            `;
        }

        return templates.map(template => `
            <div class="template-card custom-template" data-template-id="${template.id}" data-is-custom="true" title="${template.description || template.name}">
                <div class="template-preview-svg">
                    ${generateVisualPreview({
                        id: template.id,
                        styles: template.template_data?.styles || {}
                    })}
                </div>
                <div class="template-info">
                    <div class="template-colors">
                        <span style="background: ${template.template_data?.styles?.accentColor || '#333'}"></span>
                        <span style="background: ${template.template_data?.styles?.pageBackground || '#fff'}"></span>
                        <span style="background: ${template.template_data?.styles?.textPrimary || '#333'}"></span>
                    </div>
                    <span class="template-name">${template.name}</span>
                </div>
                <button class="delete-template-btn" data-template-id="${template.id}" title="Delete template">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    /**
     * Initialize template picker events
     */
    function initTemplatePickerEvents(container, isCustomCategory = false) {
        // Category buttons
        container.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentCategory = btn.dataset.category;
                renderTemplatePicker(currentContainerId);
            });
        });

        // Search input
        const searchInput = container.querySelector('#templateSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                // Debounce search
                clearTimeout(searchInput._debounce);
                searchInput._debounce = setTimeout(() => {
                    renderTemplatePicker(currentContainerId);
                }, 200);
            });
        }

        // Save current as template button (only in custom templates view)
        const saveBtn = container.querySelector('#saveCurrentAsTemplate');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showSaveTemplateModal();
            });
        }

        // Delete template buttons (custom templates)
        container.querySelectorAll('.delete-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger card click
                const templateId = btn.dataset.templateId;
                deleteCustomTemplate(templateId);
            });
        });

        // Template cards
        container.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', () => {
                const templateId = card.dataset.templateId;
                const isCustom = card.dataset.isCustom === 'true';

                if (isCustom) {
                    applyCustomTemplate(templateId);
                } else {
                    applyTemplateToCurrentPage(templateId);
                }
            });
        });
    }

    /**
     * Apply template to current page
     */
    function applyTemplateToCurrentPage(templateId) {
        const currentPageId = window.EditorState?.currentPage;
        if (!currentPageId) {
            showToast('Please select a page first', 'warning');
            return;
        }

        const pageElement = document.querySelector(`.brochure-page[data-page-id="${currentPageId}"]`);
        if (!pageElement) {
            console.error('Page element not found');
            return;
        }

        // Use the global applyTemplate function from brochure_templates.js
        if (typeof window.applyTemplate === 'function') {
            window.applyTemplate(templateId, pageElement);
            showToast(`Applied "${templateId}" template`, 'success');

            // Mark as dirty
            if (window.EditorState) {
                window.EditorState.isDirty = true;
            }

            // Save to history
            if (typeof saveToHistory === 'function') {
                saveToHistory('apply template');
            }
        } else {
            console.error('applyTemplate function not found');
        }
    }

    /**
     * Apply template to all pages
     */
    function applyTemplateToAllPages(templateId) {
        const pages = document.querySelectorAll('.brochure-page');
        pages.forEach(pageElement => {
            if (typeof window.applyTemplate === 'function') {
                window.applyTemplate(templateId, pageElement);
            }
        });

        showToast(`Applied "${templateId}" to all pages`, 'success');

        if (window.EditorState) {
            window.EditorState.isDirty = true;
        }
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // =========================================================================
    // CUSTOM TEMPLATES
    // =========================================================================

    /**
     * Load custom templates from server
     */
    async function loadCustomTemplates() {
        try {
            const response = await fetch('/api/templates/custom?user_id=default', {
                credentials: 'include',
                headers: getAuthHeaders()
            });
            if (response.ok) {
                const data = await response.json();
                customTemplates = data.templates || [];
                customTemplatesLoaded = true;
                console.log(`Loaded ${customTemplates.length} custom templates`);
            }
        } catch (error) {
            console.error('Error loading custom templates:', error);
            customTemplates = [];
        }
        return customTemplates;
    }

    /**
     * Save current page design as a custom template
     */
    async function saveAsTemplate(name, description = '') {
        // Get current page styles
        const currentStyles = getCurrentPageStyles();
        if (!currentStyles) {
            showToast('Unable to capture current design', 'error');
            return null;
        }

        const templateData = {
            styles: currentStyles,
            savedAt: new Date().toISOString()
        };

        try {
            const response = await fetch('/api/templates/custom', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({
                    user_id: 'default',
                    name: name,
                    description: description,
                    template_data: templateData
                })
            });

            if (response.ok) {
                const data = await response.json();
                customTemplates.unshift(data.template);
                showToast(`Template "${name}" saved!`, 'success');
                renderTemplatePicker(currentContainerId);
                return data.template;
            } else {
                throw new Error('Failed to save template');
            }
        } catch (error) {
            console.error('Error saving template:', error);
            showToast('Error saving template', 'error');
            return null;
        }
    }

    /**
     * Delete a custom template
     */
    async function deleteCustomTemplate(templateId) {
        if (!confirm('Delete this template? This cannot be undone.')) {
            return false;
        }

        try {
            const response = await fetch(`/api/templates/custom/${templateId}?user_id=default`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getAuthHeaders()
            });

            if (response.ok) {
                customTemplates = customTemplates.filter(t => t.id !== templateId);
                showToast('Template deleted', 'success');
                renderTemplatePicker(currentContainerId);
                return true;
            }
        } catch (error) {
            console.error('Error deleting template:', error);
            showToast('Error deleting template', 'error');
        }
        return false;
    }

    /**
     * Get current page styles for saving as template
     */
    function getCurrentPageStyles() {
        const currentPageId = window.EditorState?.currentPage;
        if (!currentPageId) return null;

        const page = document.querySelector(`.brochure-page[data-page-id="${currentPageId}"]`);
        if (!page) return null;

        // Extract computed styles
        const computedStyle = window.getComputedStyle(page);

        // Find accent color from any colored element
        let accentColor = '#4A1420';
        const accentElements = page.querySelectorAll('[style*="color"], [style*="background"]');
        for (const el of accentElements) {
            const style = el.getAttribute('style') || '';
            const colorMatch = style.match(/(background|color):\s*(#[0-9a-fA-F]{3,6}|rgb[^)]+\))/);
            if (colorMatch && colorMatch[2] && !colorMatch[2].includes('fff') && !colorMatch[2].includes('000')) {
                accentColor = colorMatch[2];
                break;
            }
        }

        return {
            accentColor: accentColor,
            pageBackground: computedStyle.backgroundColor || '#ffffff',
            textPrimary: '#333333',
            textSecondary: '#666666',
            accentSecondary: '#f5f5f5'
        };
    }

    /**
     * Get auth headers for API calls
     */
    function getAuthHeaders() {
        // Browser caches basic auth credentials after login dialog
        // fetch calls should use credentials: 'include' to send them
        return {};
    }

    /**
     * Show save template modal
     */
    function showSaveTemplateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content save-template-modal">
                <div class="modal-header">
                    <h3>Save as Template</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Template Name</label>
                        <input type="text" id="templateName" placeholder="My Custom Template" autofocus>
                    </div>
                    <div class="form-group">
                        <label>Description (optional)</label>
                        <textarea id="templateDescription" placeholder="Describe your template..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button class="btn btn-primary" id="saveTemplateBtn">Save Template</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle save
        modal.querySelector('#saveTemplateBtn').addEventListener('click', async () => {
            const name = modal.querySelector('#templateName').value.trim();
            const description = modal.querySelector('#templateDescription').value.trim();

            if (!name) {
                showToast('Please enter a template name', 'warning');
                return;
            }

            const result = await saveAsTemplate(name, description);
            if (result) {
                modal.remove();
            }
        });

        // Handle enter key
        modal.querySelector('#templateName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#saveTemplateBtn').click();
            }
        });
    }

    /**
     * Render custom templates section
     */
    function renderCustomTemplates() {
        if (customTemplates.length === 0) {
            return `
                <div class="empty-templates">
                    <div class="empty-icon">⭐</div>
                    <h4>No Custom Templates Yet</h4>
                    <p>Save your current design as a template to reuse it later.</p>
                    <button class="btn btn-primary" onclick="window.TemplatePicker.showSaveModal()">
                        Save Current Design
                    </button>
                </div>
            `;
        }

        return customTemplates.map(template => `
            <div class="template-card custom-template" data-template-id="${template.id}" title="${template.description || template.name}">
                <div class="template-preview-svg">
                    ${generateVisualPreview({
                        id: template.id,
                        styles: template.template_data?.styles || {}
                    })}
                </div>
                <div class="template-info">
                    <div class="template-colors">
                        <span style="background: ${template.template_data?.styles?.accentColor || '#333'}"></span>
                        <span style="background: ${template.template_data?.styles?.pageBackground || '#fff'}"></span>
                        <span style="background: ${template.template_data?.styles?.textPrimary || '#333'}"></span>
                    </div>
                    <span class="template-name">${template.name}</span>
                    <div class="template-actions">
                        <button class="btn-icon delete-template" data-id="${template.id}" title="Delete template">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Apply custom template
     */
    function applyCustomTemplate(templateId) {
        const template = customTemplates.find(t => t.id === templateId);
        if (!template || !template.template_data?.styles) {
            showToast('Template not found', 'error');
            return;
        }

        const currentPageId = window.EditorState?.currentPage;
        if (!currentPageId) {
            showToast('Please select a page first', 'warning');
            return;
        }

        const page = document.querySelector(`.brochure-page[data-page-id="${currentPageId}"]`);
        if (!page) return;

        const styles = template.template_data.styles;

        // Apply styles to page
        page.style.backgroundColor = styles.pageBackground || '#ffffff';

        // Apply accent color to relevant elements
        const accentElements = page.querySelectorAll('.page-accent, .page-highlight, h1, h2, .price');
        accentElements.forEach(el => {
            el.style.color = styles.accentColor;
        });

        // Apply to backgrounds with accent
        const accentBgElements = page.querySelectorAll('.accent-bg, .badge, .highlight-box');
        accentBgElements.forEach(el => {
            el.style.backgroundColor = styles.accentColor;
        });

        showToast(`Applied "${template.name}" template`, 'success');

        if (window.EditorState) {
            window.EditorState.isDirty = true;
        }
    }

    // Export to global scope
    window.TemplatePicker = {
        render: renderTemplatePicker,
        applyToCurrentPage: applyTemplateToCurrentPage,
        applyToAllPages: applyTemplateToAllPages,
        getCategories: () => TEMPLATE_CATEGORIES,
        setCategory: (cat) => { currentCategory = cat; },
        setSearch: (term) => { searchTerm = term; },
        // Custom template functions
        loadCustomTemplates,
        saveAsTemplate,
        deleteCustomTemplate,
        showSaveModal: showSaveTemplateModal,
        applyCustomTemplate,
        getCustomTemplates: () => customTemplates
    };

    // Load custom templates on init
    loadCustomTemplates();

    console.log('Template Picker loaded with custom template support');

})();
