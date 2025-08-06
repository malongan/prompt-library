"use strict";

const { Plugin, ItemView, PluginSettingTab, Setting, Modal, Notice, requestUrl, setIcon } = require("obsidian");

// --- UTILITY MODAL ---
class ConfirmationModal extends Modal {
    constructor(app, message, onConfirm) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('p', { text: this.message });
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.createEl('button', { text: '确认', cls: 'mod-cta' })
            .addEventListener('click', () => {
                this.onConfirm();
                this.close();
            });
        buttonContainer.createEl('button', { text: '取消' })
            .addEventListener('click', () => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- CONSTANTS ---
const DEFAULT_EDITOR_CONFIG = {
    version: 2,
    fields: [
        { id: 'field_title', dataKey: 'title', label: '标题', type: 'input', behavior: 'special', width: 'full' },
        { id: 'field_image_theme', dataKey: 'promptTopic', label: '生图主题', rows: 1, behavior: 'append', width: 'full', type: 'textarea' },
        { id: 'field_main_content', dataKey: 'objects', label: '主体内容', rows: 2, behavior: 'append', width: 'full', type: 'textarea' },
        { id: 'field_style', dataKey: 'style', label: '风格', rows: 1, behavior: 'replace', width: 'full', type: 'textarea' },
        { id: 'field_material', dataKey: 'material', label: '材质', rows: 1, behavior: 'append', width: 'half', type: 'textarea' },
        { id: 'field_view', dataKey: 'view', label: '视图', rows: 1, behavior: 'replace', width: 'half', type: 'textarea' },
        { id: 'field_light', dataKey: 'light', label: '光线', rows: 1, behavior: 'append', width: 'half', type: 'textarea' },
        { id: 'field_color', dataKey: 'color', label: '颜色', rows: 1, behavior: 'replace', width: 'half', type: 'textarea' },
        { id: 'field_composition', dataKey: 'composition', label: '构图', rows: 1, behavior: 'append', width: 'full', type: 'textarea' },
        { id: 'field_background', dataKey: 'background', label: '背景', rows: 1, behavior: 'append', width: 'full', type: 'textarea' },
        { id: 'field_ratio', dataKey: 'ratio', label: '比例', behavior: 'special', width: 'full' }
    ]
};

const DEFAULT_SYSTEM_SETTINGS = {
    translation: { service: 'ollama', ollama: { url: 'http://localhost:11434', model: 'qwen3:8b', prompt: '请将以下中文文本翻译成英文，不需要额外的思考，不输出think标签内容包括在这两个标签 <think></think> ，只输出英文 Text: "{text}" English translation:' }, mymemory: { sourceLang: 'zh-CN', targetLang: 'en-GB' } },
    customRatios: ['21:9', '32:9', '4:5'],
    themeCategories: ['默认', '3D', '插图', '摄影']
};

const DEFAULT_SETTINGS = {
    editorConfig: DEFAULT_EDITOR_CONFIG,
    libraryData: {},
    themes: {},
    systemSettings: DEFAULT_SYSTEM_SETTINGS
};

const PROMPT_LIBRARY_VIEW_TYPE = "prompt-library-view";

// --- THEME DETAIL MODAL ---
class ThemeDetailModal extends Modal {
    constructor(app, plugin, view, themeName) {
        super(app);
        this.plugin = plugin;
        this.view = view;
        this.themeName = themeName;
        this.theme = this.plugin.settings.themes[themeName];
        this.mode = 'preview'; // 'preview' or 'edit'

        this.newImageUrl = this.theme.imageUrl || '';
        this.newCategory = this.theme.category || '未分类';
    }

    onOpen() {
        if (!this.theme) {
            new Notice("错误：无法加载主题。");
            this.close();
            return;
        }

        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('theme-detail-modal');
        this.renderContent();
    }
    
    renderContent() {
        const { contentEl } = this;
        contentEl.empty();
        
        const container = contentEl.createDiv({ cls: 'theme-detail-modal-container' });
        
        const imageContainer = container.createDiv({ cls: 'theme-detail-image-container' });
        this.imageEl = imageContainer.createEl('img');
        this.placeholderTextEl = imageContainer.createDiv({ cls: 'placeholder-text' });
        this.updateImage(this.newImageUrl);

        const infoContainer = container.createDiv({ cls: 'theme-detail-info-container' });
        
        infoContainer.createEl('h3', { text: this.themeName, cls: 'theme-detail-title' });

        const promptGroup = infoContainer.createDiv({ cls: 'theme-detail-group' });
        const promptLabel = promptGroup.createEl('label', { text: '提示词内容' });
        setIcon(promptLabel, 'file-text');
        promptGroup.createDiv({
            text: Object.values(this.theme.fieldValues || {}).filter(v => typeof v === 'string' && v).join(', ') || '无内容',
            cls: 'theme-detail-prompt-preview'
        });

        if (this.mode === 'preview') {
            this.renderPreviewMode(infoContainer);
        } else {
            this.renderEditMode(infoContainer);
        }
    }
    
    renderPreviewMode(container) {
        const categoryGroup = container.createDiv({ cls: 'theme-detail-group' });
        const categoryLabel = categoryGroup.createEl('label', { text: '分类' });
        setIcon(categoryLabel, 'tag');
        categoryGroup.createDiv({ text: this.theme.category || '未分类', cls: 'theme-detail-category-display' });

        const actionsContainer = container.createDiv({ cls: 'theme-detail-actions' });
        const leftActions = actionsContainer.createDiv({ cls: 'theme-detail-actions-left' });
        const rightActions = actionsContainer.createDiv({ cls: 'theme-detail-actions-right' });

        const editBtn = leftActions.createEl('button', { text: '编辑', cls: 'btn' });
        setIcon(editBtn, 'edit');
        this.plugin.registerDomEvent(editBtn, 'click', () => {
            this.mode = 'edit';
            this.renderContent();
        });

        const favBtn = leftActions.createEl('button', { cls: 'btn' });
        const updateFavBtn = (isFav) => {
            favBtn.empty();
            setIcon(favBtn, isFav ? 'star' : 'star-off');
            favBtn.appendText(isFav ? ' 已收藏' : ' 收藏');
            if (isFav) favBtn.addClass('is-active'); else favBtn.removeClass('is-active');
        };
        updateFavBtn(this.theme.isFavorite);
        this.plugin.registerDomEvent(favBtn, 'click', async () => {
            this.theme.isFavorite = !this.theme.isFavorite;
            await this.plugin.saveSettings();
            updateFavBtn(this.theme.isFavorite);
            this.view.renderThemeGallery();
            new Notice(this.theme.isFavorite ? `已收藏 "${this.themeName}"` : `已取消收藏 "${this.themeName}"`);
        });

        const shareBtn = leftActions.createEl('button', { text: '分享', cls: 'btn' });
        setIcon(shareBtn, 'share-2');
        this.plugin.registerDomEvent(shareBtn, 'click', () => {
            const themeData = {
                fieldValues: this.theme.fieldValues,
                imageUrl: this.theme.imageUrl,
                category: this.theme.category,
                isFavorite: this.theme.isFavorite
            };
            navigator.clipboard.writeText(JSON.stringify(themeData, null, 2));
            new Notice('完整主题数据已复制到剪贴板。');
        });

        const useBtn = rightActions.createEl('button', { text: '使用此主题', cls: 'btn mod-cta use-button' });
        setIcon(useBtn, 'download');
        this.plugin.registerDomEvent(useBtn, 'click', () => {
            this.view.loadTheme(this.themeName);
            this.close();
        });
    }

    renderEditMode(container) {
        const categoryGroup = container.createDiv({ cls: 'theme-detail-group' });
        const categoryLabel = categoryGroup.createEl('label', { text: '分类' });
        setIcon(categoryLabel, 'tag');
        new Setting(categoryGroup)
            .addDropdown(dropdown => {
                const categories = this.plugin.settings.systemSettings.themeCategories;
                const allCategories = [...new Set([this.newCategory, '未分类', ...categories])];
                allCategories.forEach(cat => dropdown.addOption(cat, cat));
                dropdown.setValue(this.newCategory);
                dropdown.onChange(value => { this.newCategory = value; });
            }).settingEl.classList.remove('setting-item');

        const imageUrlGroup = container.createDiv({ cls: 'theme-detail-group' });
        const imageLabel = imageUrlGroup.createEl('label', { text: '图片链接' });
        setIcon(imageLabel, 'link');
        const imageUrlSetting = new Setting(imageUrlGroup);
        
        this.imageUrlInput = imageUrlSetting.addText(text => {
            text.setValue(this.newImageUrl)
                .setPlaceholder('在此粘贴图片URL...');
            
            text.onChange(value => {
                this.newImageUrl = value.trim();
                this.updateImage(this.newImageUrl);
            });
        }).components[0];
        
        imageUrlSetting.settingEl.classList.remove('setting-item');

        const actionsContainer = container.createDiv({ cls: 'theme-detail-actions' });
        const leftActions = actionsContainer.createDiv({ cls: 'theme-detail-actions-left' });
        const rightActions = actionsContainer.createDiv({ cls: 'theme-detail-actions-right' });

        const deleteBtn = leftActions.createEl('button', { text: '删除主题', cls: 'btn mod-warning' });
        setIcon(deleteBtn, 'trash');
        this.plugin.registerDomEvent(deleteBtn, 'click', () => {
            new ConfirmationModal(this.app, `确定要删除主题 "${this.themeName}" 吗？此操作不可撤销。`, async () => {
                await this.view.deleteTheme(this.themeName);
                this.close();
            }).open();
        });

        const cancelBtn = rightActions.createEl('button', { text: '取消', cls: 'btn' });
        this.plugin.registerDomEvent(cancelBtn, 'click', () => {
            this.mode = 'preview';
            this.newImageUrl = this.theme.imageUrl || '';
            this.newCategory = this.theme.category || '未分类';
            this.renderContent();
        });

        const saveBtn = rightActions.createEl('button', { text: '保存更改', cls: 'btn mod-cta' });
        setIcon(saveBtn, 'save');
        this.plugin.registerDomEvent(saveBtn, 'click', async () => {
            this.theme.imageUrl = this.newImageUrl;
            this.theme.category = this.newCategory;
            await this.plugin.saveSettings();
            new Notice(`主题 "${this.themeName}" 已更新。`);
            this.view.renderThemeGallery();
            this.close();
        });
    }

    updateImage(url) {
        if (url) {
            this.imageEl.src = url;
            this.imageEl.style.display = 'block';
            this.placeholderTextEl.style.display = 'none';
        } else {
            this.imageEl.style.display = 'none';
            this.placeholderTextEl.style.display = 'block';
            this.placeholderTextEl.setText('无图片链接');
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}


// --- MAIN VIEW ---
class PromptLibraryView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentRatio = '16:9';
        this.originalText = '';
        this.translatedText = '';
        this.isShowingTranslation = false;
        this.currentThemeFilter = 'all';
        this.libraryDeleteMode = new Set();
    }

    getViewType() { return PROMPT_LIBRARY_VIEW_TYPE; }
    getDisplayText() { return "提示词库"; }
    getIcon() { return "library"; }

    async onOpen() {
        try {
            const container = this.containerEl.children[1];
            container.empty();
            container.classList.add("prompt-library-view");
            const root = container.createDiv({ cls: "container" });
            const mainContainer = root.createDiv({ cls: "main-container" });
            this.drawPreviewPanel(mainContainer.createDiv({ cls: "preview-panel" }));
            this.drawEditorPanel(mainContainer.createDiv({ cls: "editor-panel" }));
            this.drawLibraryPanel(mainContainer.createDiv({ cls: "library-panel" }));

            this.loadInitialContent();
            this.updateAll();
        } catch (e) {
            console.error("加载提示词库视图时出错:", e);
            new Notice('加载提示词库插件时出错。请检查开发者控制台。');
        }
    }

    drawPreviewPanel(panel) {
        const header = panel.createDiv({ cls: "panel-header" });
        setIcon(header, "monitor-play");
        header.createSpan({ text: '预览' });

        const content = panel.createDiv({ cls: "panel-content" });

        const previewWrapper = content.createDiv({ cls: "preview-content-wrapper" });
        this.previewTitleEl = previewWrapper.createDiv({ cls: "card-title" });
        this.previewOutputEl = previewWrapper.createDiv({ cls: "card-text" });
        
        const actionsRow = content.createDiv({ cls: "preview-actions-row" });
        const translateBtn = actionsRow.createEl("button", { text: '翻译', cls: 'btn' });
        const toggleBtn = actionsRow.createEl("button", { text: '切换原文/译文', cls: 'btn' });
        const copyBtn = actionsRow.createEl("button", { text: '复制提示词', cls: 'btn' });
        const settingsBtn = actionsRow.createEl("button", { cls: "push-right" });

        setIcon(translateBtn, "languages");
        setIcon(toggleBtn, "repeat");
        setIcon(copyBtn, "copy");
        setIcon(settingsBtn, "settings");
        settingsBtn.setAttribute('aria-label', '设置');

        this.registerDomEvent(translateBtn, 'click', async () => await this.handleTranslation());
        this.registerDomEvent(toggleBtn, 'click', () => this.toggleTranslation());
        this.registerDomEvent(copyBtn, 'click', () => this.copyText(this.previewOutputEl.textContent, copyBtn, '复制提示词', '已复制!'));
        this.registerDomEvent(settingsBtn, 'click', () => this.plugin.openSettings());       
        
        const themeManager = content.createDiv({ cls: "theme-gallery-manager" });
        const themeHeader = themeManager.createDiv({ cls: "theme-header" });
        const titleDiv = themeHeader.createDiv();
        setIcon(titleDiv, "gallery-thumbnails");
        titleDiv.createEl("label", { text: '主题画廊' });
        
        const buttonGroup = themeHeader.createDiv({ cls: "theme-button-group" });
        
        const pasteBtn = buttonGroup.createEl("button", { cls: 'btn' });
        setIcon(pasteBtn, "clipboard-paste");
        pasteBtn.appendText(" 粘贴主题");
        pasteBtn.setAttribute('aria-label', '从剪贴板粘贴主题');

        const saveBtn = buttonGroup.createEl("button", { cls: 'btn' });
        setIcon(saveBtn, "save");
        saveBtn.appendText(" 保存");
        saveBtn.setAttribute('aria-label', '保存当前为主题');

        this.themeGalleryTabsEl = themeManager.createDiv({ cls: "theme-gallery-tabs" });
        this.themeGalleryContentEl = themeManager.createDiv({ cls: "theme-gallery-content" });

        this.registerDomEvent(pasteBtn, 'click', async () => await this.pasteThemeFromClipboard());
        this.registerDomEvent(saveBtn, 'click', async () => await this.saveTheme());
    }

    drawEditorPanel(panel) {
        const header = panel.createDiv({ cls: "panel-header" });
        setIcon(header, "edit");
        header.createSpan({ text: '结构化编辑器' });
        this.editorContentEl = panel.createDiv({ cls: "panel-content" });
        const footer = panel.createDiv({ cls: "editor-bottom-actions" });

        const copyContentBtn = footer.createEl("button", { text: '复制内容', cls: 'btn' });
        const pasteContentBtn = footer.createEl("button", { text: '粘贴内容', cls: 'btn' });
        const clearBtn = footer.createEl("button", { text: '清空', cls: 'btn' });

        setIcon(copyContentBtn, "copy-plus");
        setIcon(pasteContentBtn, "clipboard-paste");
        setIcon(clearBtn, "eraser");

        this.registerDomEvent(copyContentBtn, 'click', () => this.copyStructuredContent());
        this.registerDomEvent(pasteContentBtn, 'click', async () => await this.pasteStructuredContent());
        this.registerDomEvent(clearBtn, 'click', () => new ConfirmationModal(this.app, '您确定要清空所有编辑器字段吗？', () => this.clearAllFields()).open());
    }

    drawLibraryPanel(panel) {
        const header = panel.createDiv({ cls: "library-header" });
        setIcon(header, "database");
        header.createSpan({ text: '全局共享元素库' });
        this.libraryContentEl = panel.createDiv({ cls: "library-content" });
    }

    updateAll() {
        this.renderEditorPanel();
        this.renderLibraryPanel();
        this.renderThemeGallery();
        this.updatePreview();
    }
    
    renderThemeGallery() {
        this.renderThemeGalleryTabs();
        this.renderThemeGalleryGrid();
    }

    renderThemeGalleryTabs() {
        this.themeGalleryTabsEl.empty();
        const categories = [
            { id: 'all', name: '所有主题' },
            { id: 'favorites', name: '我的收藏' },
            ...this.plugin.settings.systemSettings.themeCategories.map(c => ({ id: c, name: c })),
            { id: '未分类', name: '未分类' }
        ];

        categories.forEach(cat => {
            const el = this.themeGalleryTabsEl.createEl('button', { 
                text: cat.name, 
                cls: `theme-tab-btn ${cat.id === this.currentThemeFilter ? 'is-active' : ''}` 
            });
            if (cat.id === 'favorites') setIcon(el, 'star');
            this.registerDomEvent(el, 'click', (e) => {
                e.preventDefault();
                this.currentThemeFilter = cat.id;
                this.renderThemeGallery();
            });
        });
    }

    renderThemeGalleryGrid() {
        this.themeGalleryContentEl.empty();
        const themes = this.plugin.settings.themes;
        const themeNames = Object.keys(themes);

        const filteredThemes = themeNames.filter(name => {
            if (this.currentThemeFilter === 'all') return true;
            if (this.currentThemeFilter === 'favorites') return themes[name].isFavorite;
            const themeCategory = themes[name].category || '未分类';
            return themeCategory === this.currentThemeFilter;
        }).sort();

        if (filteredThemes.length === 0) {
            this.themeGalleryContentEl.setText('此分类下没有主题。');
            return;
        }

        filteredThemes.forEach(name => {
            const theme = themes[name];
            const item = this.themeGalleryContentEl.createDiv({ cls: 'theme-gallery-item' });
            if (theme.isFavorite) item.addClass('is-favorite');
            
            this.registerDomEvent(item, 'click', () => {
                new ThemeDetailModal(this.app, this.plugin, this, name).open();
            });

            const favoriteIndicator = item.createDiv({ cls: 'favorite-indicator' });
            setIcon(favoriteIndicator, 'star');

            const imageWrapper = item.createDiv({cls: 'theme-gallery-image-wrapper'});
            if (theme.imageUrl) {
                imageWrapper.createEl('img', { attr: { src: theme.imageUrl, alt: name } });
            } else {
                const placeholder = imageWrapper.createDiv({cls: 'placeholder'});
                setIcon(placeholder, 'image-off');
            }
            
            const footer = item.createDiv({ cls: 'theme-gallery-item-footer' });
            footer.createDiv({ text: name, cls: 'theme-gallery-item-title' });
        });
    }

    renderEditorPanel() {
        this.editorContentEl.empty();
        this.registerDomEvent(this.editorContentEl, 'input', (e) => this.handleEditorInput(e));
        this.registerDomEvent(this.editorContentEl, 'click', (e) => this.handleEditorClick(e));
        
        let i = 0;
        const fields = this.plugin.settings.editorConfig.fields;
        
        const rows = [];
        while (i < fields.length) {
            const field1 = fields[i];
            if (field1.width === 'half' && (i + 1) < fields.length && fields[i + 1].width === 'half') {
                rows.push([field1, fields[i + 1]]);
                i += 2;
            } else {
                rows.push([field1]);
                i += 1;
            }
        }
        
        rows.forEach(rowFields => {
            const row = this.editorContentEl.createDiv({ cls: 'editor-row' });
            rowFields.forEach(field => {
                row.appendChild(this.createFieldElement(field));
            });
        });
    }


    createFieldElement(field) {
        const formGroup = createDiv({ cls: `form-group form-group-${field.width}` });
        const labelText = field.label;

        if (field.dataKey === 'ratio') {
            const label = formGroup.createEl('label');
            setIcon(label, "aspect-ratio");
            label.appendText(` ${labelText}`);
            const controls = formGroup.createDiv({ cls: 'ratio-controls' });
            const presets = controls.createDiv({ cls: 'ratio-presets' });
            
            const allRatios = [...new Set(['16:9', '9:16', '4:3', '1:1', '3:4', ...this.plugin.settings.systemSettings.customRatios])];
            allRatios.forEach(r => {
                const btn = presets.createEl('button', { text: r, cls: `ratio-btn ${this.currentRatio === r ? 'active' : ''}` });
                btn.dataset.ratio = r;
            });
            controls.createDiv({ cls: 'custom-ratio-input' }).createEl('input', { type: 'text', attr: { id: 'customRatio', placeholder: '例如 5:4' } });
        } else {
            const label = formGroup.createEl('label', { attr: { 'data-id': field.id } });
            setIcon(label, field.behavior === 'special' ? 'heading' : 'arrow-right-circle');
            label.appendText(` ${labelText}`);
            
            const inputEl = field.type === 'input' 
                ? formGroup.createEl('input', { type: 'text' }) 
                : formGroup.createEl('textarea', { attr: { rows: field.rows || 1 } });
            inputEl.id = `editor-input-${field.id}`;
            inputEl.classList.add('input');
        }
        return formGroup;
    }

    renderLibraryPanel() {
        this.libraryContentEl.empty();
        this.registerDomEvent(this.libraryContentEl, 'click', (e) => { this.handleLibraryClick(e); });
        
        this.plugin.settings.editorConfig.fields.forEach(field => {
            if (field.behavior === 'special') return;

            const isDeleteMode = this.libraryDeleteMode.has(field.id);
            
            const section = this.libraryContentEl.createDiv({ 
                cls: `library-section ${isDeleteMode ? 'is-delete-mode' : ''}`, 
                attr: { 'data-id': field.id, id: `library-section-${field.id}` } 
            });

            const header = section.createDiv({ cls: "section-header" });
            
            const title = header.createDiv({ cls: "section-title" });
            const actionIcon = title.createSpan({ cls: 'library-title-action-icon', attr: { 'data-action': 'toggle-delete-mode' } });
            setIcon(actionIcon, isDeleteMode ? 'check' : 'arrow-right-circle'); // Icon change
            
            title.createSpan({ text: field.label, cls: 'section-title-text' });

            const input = header.createEl('input', { 
                type: 'text', 
                cls: 'library-header-input',
                attr: { placeholder: '回车添加...' } 
            });

            this.registerDomEvent(input, 'click', (e) => e.stopPropagation());
            this.registerDomEvent(input, 'keydown', (e) => {
                if(e.key === 'Enter' && input.value.trim() !== '') {
                    e.preventDefault();
                    this.addNewLibraryItem(field.id, input.value.trim());
                    input.value = '';
                }
            });

            const content = section.createDiv({ cls: "section-content" });
            const items = this.plugin.settings.libraryData[field.dataKey] || [];
            items.forEach(itemText => {
                const itemEl = content.createEl('button', { text: itemText, cls: 'library-item', attr: { 'data-action': 'apply-item' } });
                const deleteBtn = itemEl.createDiv({ cls: 'library-item-delete-btn', attr: { 'data-action': 'delete-item', 'data-item': itemText } });
                setIcon(deleteBtn, 'x');
            });
        });
    }

    updatePreview() {
        const titleField = this.plugin.settings.editorConfig.fields.find(f => f.behavior === 'special' && f.type === 'input');
        const titleInput = titleField ? this.editorContentEl.querySelector(`#editor-input-${titleField.id}`) : null;
        this.previewTitleEl.setText(titleInput?.value.trim() || '输入标题');

        const parts = [];
        for (const field of this.plugin.settings.editorConfig.fields) {
            if (field.behavior === 'special') continue;
            const inputEl = this.editorContentEl.querySelector(`#editor-input-${field.id}`);
            const value = inputEl?.value.trim();
            if (value) {
                parts.push(value);
            }
        }
        
        let output = parts.join(', ');
        
        const ratioField = this.plugin.settings.editorConfig.fields.find(f => f.dataKey === 'ratio');
        if (ratioField) {
            output += ` --ar ${this.currentRatio}`;
        }
        
        this.previewOutputEl.textContent = output;
        if (!this.isShowingTranslation) {
            this.originalText = output;
        }
    }

    handleEditorInput(e) {
        const target = e.target;
        if (target.id === 'customRatio') {
            const ratio = target.value.trim();
            if (ratio?.includes(':')) {
                this.currentRatio = ratio;
                this.editorContentEl.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.remove('active'));
            }
        }
        this.updatePreview();
    }

    handleEditorClick(e) {
        const target = e.target;
        const ratioBtn = target.closest('.ratio-btn');
        if (ratioBtn) {
            this.currentRatio = ratioBtn.getAttribute('data-ratio');
            this.editorContentEl.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
            ratioBtn.classList.add('active');
            this.editorContentEl.querySelector('#customRatio').value = '';
            this.updatePreview();
        } else {
            const fieldLabel = target.closest('label[data-id]');
            if (fieldLabel) {
                const fieldId = fieldLabel.getAttribute('data-id');
                const targetSection = this.libraryContentEl.querySelector(`#library-section-${fieldId}`);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetSection.classList.add('highlighted-section');
                    setTimeout(() => targetSection.classList.remove('highlighted-section'), 1500);
                }
            }
        }
    }

    async handleLibraryClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
    
        const action = target.dataset.action;
        const sectionEl = target.closest('.library-section');
        if (!sectionEl) return;
        
        const fieldId = sectionEl.dataset.id;
        
        switch (action) {
            case 'toggle-delete-mode': {
                const isInDeleteMode = this.libraryDeleteMode.has(fieldId);
                const newDeleteState = !isInDeleteMode;

                if (newDeleteState) {
                    this.libraryDeleteMode.add(fieldId);
                } else {
                    this.libraryDeleteMode.delete(fieldId);
                }
                
                sectionEl.classList.toggle('is-delete-mode', newDeleteState);
                setIcon(target, newDeleteState ? 'check' : 'arrow-right-circle'); // Icon change
                break;
            }
            case 'apply-item': {
                if (this.libraryDeleteMode.has(fieldId)) return;
                const text = target.textContent;
                this.applyLibraryItem(fieldId, text);
                break;
            }
            case 'delete-item': {
                if (!this.libraryDeleteMode.has(fieldId)) return;
                const itemText = target.dataset.item;
                const itemEl = target.closest('.library-item');
                
                if (itemEl) {
                    await this.deleteLibraryItem(fieldId, itemText);
                    itemEl.remove();
                    new Notice(`已删除项目: "${itemText}"`);
                }
                break;
            }
        }
    }

    loadInitialContent() {
        const d = { title: '磨砂玻璃艺术', objects: '扁平透明图标：文档, 计算器, 钢笔, 扬声器, 文件夹, 正方形, 圆形', promptTopic: '艺术构图, 复杂, 包豪斯, 抽象', material: '3d磨砂玻璃', view: '顶视图', composition: '重叠, 无缝图案', color: '明亮的蓝色调', background: '细波点, 激光色点', ratio: '16:9' };
        this.importTemplateData(d);
    }

    applyLibraryItem(fieldId, text) {
        const field = this.plugin.settings.editorConfig.fields.find(f => f.id === fieldId);
        if (!field) return;

        const textarea = this.editorContentEl.querySelector(`#editor-input-${fieldId}`);
        if (textarea) {
            if (field.behavior === 'replace') {
                textarea.value = text;
            } else {
                const currentValue = textarea.value.trim();
                if (currentValue === '') {
                    textarea.value = text;
                } else if (!currentValue.split(/, ?/).map(s=>s.trim()).includes(text)) {
                    textarea.value = `${currentValue}, ${text}`;
                }
            }
            this.updatePreview();
        }
    }

    async addNewLibraryItem(fieldId, value) {
        const trimmedValue = value?.trim();
        if (!trimmedValue) return;

        const field = this.plugin.settings.editorConfig.fields.find(f => f.id === fieldId);
        if (!field) return;

        const key = field.dataKey;
        if (!this.plugin.settings.libraryData[key]) {
            this.plugin.settings.libraryData[key] = [];
        }

        if (!this.plugin.settings.libraryData[key].includes(trimmedValue)) {
            this.plugin.settings.libraryData[key].push(trimmedValue);
            this.plugin.settings.libraryData[key].sort();
            await this.plugin.saveSettings(false);
            
            const sectionEl = this.libraryContentEl.querySelector(`#library-section-${fieldId}`);
            if (sectionEl) {
                const content = sectionEl.querySelector('.section-content');
                
                content.empty();
                const items = this.plugin.settings.libraryData[key];
                items.forEach(itemText => {
                    const itemEl = content.createEl('button', { text: itemText, cls: 'library-item', attr: { 'data-action': 'apply-item' } });
                    const deleteBtn = itemEl.createDiv({ cls: 'library-item-delete-btn', attr: { 'data-action': 'delete-item', 'data-item': itemText } });
                    setIcon(deleteBtn, 'x');
                });
            }
        }
    }
    
    async deleteLibraryItem(fieldId, value) {
        const trimmedValue = value?.trim();
        if (!trimmedValue) return;

        const field = this.plugin.settings.editorConfig.fields.find(f => f.id === fieldId);
        if (!field) return;

        const key = field.dataKey;
        const items = this.plugin.settings.libraryData[key];

        if (items) {
            const index = items.indexOf(trimmedValue);
            if (index > -1) {
                items.splice(index, 1);
                await this.plugin.saveSettings(false);
            }
        }
    }

    getCurrentFieldValues() {
        const data = {};
        this.plugin.settings.editorConfig.fields.forEach(field => {
            if (field.dataKey === 'ratio') {
                data.ratio = this.currentRatio;
            } else {
                const input = this.editorContentEl.querySelector(`#editor-input-${field.id}`);
                if (input) data[field.dataKey] = input.value;
            }
        });
        return data;
    }

    importTemplateData(data) {
        if (!data) return;

        if (data.ratio) {
            this.currentRatio = data.ratio;
            this.renderEditorPanel();
        }

        this.plugin.settings.editorConfig.fields.forEach(field => {
            if (field.dataKey !== 'ratio' && data[field.dataKey] !== undefined) {
                const input = this.editorContentEl.querySelector(`#editor-input-${field.id}`);
                if (input) input.value = data[field.dataKey];
            }
        });

        this.updatePreview();
    }

    clearAllFields() {
        this.editorContentEl.querySelectorAll('textarea, input').forEach((el) => {
            if (el.id !== 'customRatio') el.value = '';
        });
        this.updatePreview();
    }

    copyText(text, button, originalButtonText = '', copiedText = '已复制!') {
        navigator.clipboard.writeText(text).then(() => {
            if (button) {
                const originalIcon = button.querySelector('svg')?.cloneNode(true);
                const originalTextContent = button.textContent.trim();
                button.empty();
                setIcon(button, 'check');
                if (copiedText) button.appendText(` ${copiedText}`);
                
                setTimeout(() => {
                    button.empty();
                    if(originalIcon) button.appendChild(originalIcon);
                    button.appendText(` ${originalButtonText || originalTextContent}`);
                }, 1500);
            } else {
                new Notice('已复制到剪贴板！');
            }
        }).catch(() => new Notice('复制失败。'));
    }

    copyStructuredContent() {
        const dataToExport = {
            fieldValues: this.getCurrentFieldValues()
        };
        this.copyText(JSON.stringify(dataToExport, null, 2));
        new Notice('内容已作为结构化文本复制！');
    }

    async pasteStructuredContent() {
        try {
            const text = await navigator.clipboard.readText();
            const importedData = JSON.parse(text);

            if (importedData.fieldValues) {
                this.importTemplateData(importedData.fieldValues);
                new Notice('内容已粘贴！');
            } else {
                 new Notice('剪贴板中的文本格式不正确。');
            }
        } catch (e) {
            new Notice('剪贴板中的 JSON 无效。');
            console.error("内容粘贴错误:", e);
        }
    }
    
    async pasteThemeFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            const importedData = JSON.parse(text);

            if (!importedData.fieldValues || !importedData.fieldValues.title) {
                 new Notice('剪贴板中的主题数据无效或缺少标题。');
                 return;
            }
            
            const themeName = importedData.fieldValues.title.trim();
            if (!themeName) {
                new Notice('主题标题不能为空。');
                return;
            }
            
            const themeToSave = {
                fieldValues: importedData.fieldValues,
                imageUrl: importedData.imageUrl || '',
                category: importedData.category || '未分类',
                isFavorite: importedData.isFavorite || false,
            };

            if (this.plugin.settings.themes[themeName]) {
                 new ConfirmationModal(this.app, `主题 "${themeName}" 已存在。要覆盖它吗？`, async () => {
                    this.plugin.settings.themes[themeName] = { ...this.plugin.settings.themes[themeName], ...themeToSave };
                    await this.plugin.saveSettings();
                    this.renderThemeGallery();
                    new Notice(`主题 "${themeName}" 已更新。`);
                }).open();
            } else {
                this.plugin.settings.themes[themeName] = themeToSave;
                await this.plugin.saveSettings();
                this.renderThemeGallery();
                new Notice(`主题 "${themeName}" 已添加。`);
            }
        } catch (e) {
            new Notice('从剪贴板粘贴主题失败。无效的JSON格式。');
            console.error("主题粘贴错误:", e);
        }
    }

    async saveTheme() {
        const titleField = this.plugin.settings.editorConfig.fields.find(f => f.dataKey === 'title');
        const themeName = this.editorContentEl.querySelector(`#editor-input-${titleField.id}`)?.value.trim();

        if (!themeName) {
            new Notice('请先输入标题。');
            return;
        }
        
        const existingTheme = this.plugin.settings.themes[themeName];
        if (existingTheme) {
            new ConfirmationModal(this.app, `确定要覆盖主题 "${themeName}" 吗？`, async () => {
                await this.performSaveTheme(themeName);
            }).open();
        } else {
            await this.performSaveTheme(themeName);
        }
    }
    
    async performSaveTheme(themeName) {
        const existingTheme = this.plugin.settings.themes[themeName] || {};
        const newTheme = {
            fieldValues: this.getCurrentFieldValues(),
            imageUrl: existingTheme.imageUrl || '',
            category: existingTheme.category || '未分类',
            isFavorite: existingTheme.isFavorite || false,
        };
        this.plugin.settings.themes[themeName] = newTheme;
        await this.plugin.saveSettings();
        this.renderThemeGallery();
        new Notice(`主题 "${themeName}" 已保存。`);
    }

    async loadTheme(themeName) {
        if (!themeName) return;

        const theme = this.plugin.settings.themes[themeName];
        if (theme) {
            this.importTemplateData(theme.fieldValues);
            new Notice(`已加载主题 "${themeName}"。`);
        }
    }

    async deleteTheme(themeName) {
        if (!themeName) return;
        
        delete this.plugin.settings.themes[themeName];
        await this.plugin.saveSettings();
        this.renderThemeGallery();
        new Notice('主题已删除。');
    }

    async handleTranslation() {
        if (!this.originalText.trim()) {
            new Notice('没有要翻译的文本。');
            return;
        }

        const loadingNotice = new Notice('翻译中...', 0);
        try {
            let translated = '';
            const s = this.plugin.settings.systemSettings.translation;
            if (s.service === 'ollama') {
                const { url, model, prompt } = s.ollama;
                if (!url || !model) throw new Error("Ollama未配置");
                const finalPrompt = prompt.replace('{text}', this.originalText);
                
                const res = await requestUrl({
                    url: `${url.replace(/\/$/, '')}/api/generate`,
                    method: 'POST',
                    contentType: 'application/json',
                    body: JSON.stringify({ model, prompt: finalPrompt, stream: false, options: { temperature: 0.1 } })
                });
                
                if (res.status !== 200) throw new Error(`Ollama 错误: ${res.status}`);
                translated = res.json.response?.trim();
            } else {
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(this.originalText)}&langpair=${s.mymemory.sourceLang}|${s.mymemory.targetLang}`;
                const res = await requestUrl({ url });
                if (res.status !== 200) throw new Error("MyMemory API 错误");
                translated = res.json.responseData?.translatedText;
            }

            if (!translated) throw new Error("翻译结果为空");

            this.translatedText = translated;
            this.previewOutputEl.textContent = this.translatedText;
            this.isShowingTranslation = true;
            loadingNotice.hide();
            new Notice('翻译成功！');
        } catch (e) {
            console.error("Translation Error:", e);
            loadingNotice.hide();
            let finalMessage;
            const translationSettings = this.plugin.settings.systemSettings.translation;
            if (translationSettings.service === 'ollama' && e.message?.includes('ERR_CONNECTION_REFUSED')) {
                finalMessage = `无法连接到 Ollama (${translationSettings.ollama.url})。请确保 Ollama 正在运行。`;
            } else {
                finalMessage = `翻译失败: ${e.message}`;
            }
            new Notice(finalMessage, 7000);
        }
    }

    toggleTranslation() {
        if (!this.translatedText) {
            new Notice('请先翻译。');
            return;
        }
        this.isShowingTranslation = !this.isShowingTranslation;
        this.previewOutputEl.textContent = this.isShowingTranslation ? this.translatedText : this.originalText;
        new Notice(`已切换到${this.isShowingTranslation ? '译文' : '原文'}`);
    }
}

// --- MAIN PLUGIN CLASS ---
class PromptLibraryPlugin extends Plugin {
    async onload() {
        try {
            await this.loadSettings();
            this.registerView(PROMPT_LIBRARY_VIEW_TYPE, (leaf) => new PromptLibraryView(leaf, this));
            this.addRibbonIcon("library", "打开提示词库", () => { this.activateView(); });
            this.addCommand({ id: 'open-prompt-library', name: '打开提示词库', callback: () => { this.activateView(); } });
            this.addSettingTab(new PromptLibrarySettingTab(this.app, this));
            console.log('提示词库插件加载成功。');
        } catch (e) {
            console.error("CRITICAL: Error loading Prompt Library plugin:", e);
            new Notice('加载提示词库插件时出错。');
        }
    }

    async activateView() {
        this.app.workspace.detachLeavesOfType(PROMPT_LIBRARY_VIEW_TYPE);
    
        const newLeaf = this.app.workspace.getLeaf('tab');
        await newLeaf.setViewState({
            type: PROMPT_LIBRARY_VIEW_TYPE,
            active: true,
        });
        this.app.workspace.revealLeaf(newLeaf);
    }
    
    openSettings() {
        this.app.setting.open();
        this.app.setting.openTabById(this.manifest.id);
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        
        const freshDefaultSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        
        this.settings = this.deepMerge(freshDefaultSettings, loadedData || {});

        const codeEditorConfig = JSON.parse(JSON.stringify(DEFAULT_EDITOR_CONFIG));
        const savedEditorConfig = loadedData?.editorConfig;

        if (savedEditorConfig && savedEditorConfig.version === codeEditorConfig.version) {
            codeEditorConfig.fields.forEach(field => {
                const savedField = savedEditorConfig.fields.find(f => f.id === field.id);
                if (savedField) {
                    field.label = savedField.label;
                    field.width = savedField.width;
                }
            });
        }
        
        this.settings.editorConfig = codeEditorConfig;
        
        this.migrateThemeData();
    }
    
    deepMerge(target, source) {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (key === 'editorConfig') {
                    if (source[key]) output[key] = source[key];
                    return;
                }
                if (this.isObject(source[key]) && key in target && this.isObject(target[key]) && !Array.isArray(source[key])) {
                    output[key] = this.deepMerge(target[key], source[key]);
                } else {
                    output[key] = source[key];
                }
            });
        }
        return output;
    }

    isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    migrateThemeData() {
        const themes = this.settings.themes || {};
        let changed = false;
        for (const themeName in themes) {
            const theme = themes[themeName];
            if (typeof theme.imageUrl === 'undefined') { theme.imageUrl = ''; changed = true; }
            if (typeof theme.category === 'undefined') { theme.category = '未分类'; changed = true; }
            if (typeof theme.isFavorite === 'undefined') { theme.isFavorite = false; changed = true; }
            if (theme.editorConfig) { delete theme.editorConfig; changed = true; }
        }
        if (changed) {
            console.log("Prompt Library: Migrated theme data to new format.");
            this.saveSettings(false);
        }
    }

    async saveSettings(updateViews = true) {
        await this.saveData(this.settings);
        if (updateViews) {
            const leaves = this.app.workspace.getLeavesOfType(PROMPT_LIBRARY_VIEW_TYPE);
            if (leaves.length > 0) {
                setTimeout(() => {
                    leaves.forEach(leaf => {
                        if (leaf.view instanceof PromptLibraryView) {
                            leaf.view.updateAll();
                        }
                    });
                }, 0);
            }
        }
    }

    downloadAsJson(data, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
    }

    importFromJson(callback) {
        const input = createEl('input', { type: 'file', attr: { accept: '.json' } });
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (re) => {
                try {
                    await callback(JSON.parse(re.target.result));
                } catch (err) {
                    new Notice('无效的 JSON 文件。');
                }
            };
            reader.readAsText(file);
        };
        input.click();
        input.remove();
    }
}

// --- SETTINGS TAB ---
class PromptLibrarySettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "提示词库设置" });

        new Setting(containerEl).setName("翻译设置").setHeading();
        new Setting(containerEl).setName("翻译服务").addDropdown(dd => dd.addOption('ollama', '本地 Ollama').addOption('mymemory', 'MyMemory API').setValue(this.plugin.settings.systemSettings.translation.service).onChange(async (v) => {
            this.plugin.settings.systemSettings.translation.service = v;
            await this.plugin.saveSettings();
            this.display();
        }));
        if (this.plugin.settings.systemSettings.translation.service === 'ollama') {
            new Setting(containerEl).setName('Ollama URL').addText(text => text.setValue(this.plugin.settings.systemSettings.translation.ollama.url).onChange(async (v) => { this.plugin.settings.systemSettings.translation.ollama.url = v; await this.plugin.saveSettings(false); }));
            new Setting(containerEl).setName('Ollama 模型').addText(text => text.setValue(this.plugin.settings.systemSettings.translation.ollama.model).onChange(async (v) => { this.plugin.settings.systemSettings.translation.ollama.model = v; await this.plugin.saveSettings(false); }));
            new Setting(containerEl).setName('Ollama 提示词').setDesc('使用 {text} 作为占位符。').addTextArea(text => text.setValue(this.plugin.settings.systemSettings.translation.ollama.prompt).onChange(async (v) => { this.plugin.settings.systemSettings.translation.ollama.prompt = v; await this.plugin.saveSettings(false); }));
        } else {
            new Setting(containerEl).setName('源语言').addText(text => text.setValue(this.plugin.settings.systemSettings.translation.mymemory.sourceLang).onChange(async (v) => { this.plugin.settings.systemSettings.translation.mymemory.sourceLang = v; await this.plugin.saveSettings(false); }));
            new Setting(containerEl).setName('目标语言').addText(text => text.setValue(this.plugin.settings.systemSettings.translation.mymemory.targetLang).onChange(async (v) => { this.plugin.settings.systemSettings.translation.mymemory.targetLang = v; await this.plugin.saveSettings(false); }));
        }

        new Setting(containerEl).setName("自定义比例").setHeading();
        const customRatiosSetting = new Setting(containerEl).setName("添加自定义比例");
        let customRatioInput;
        customRatiosSetting.addText(text => { customRatioInput = text; text.setPlaceholder('例如 21:9'); });
        customRatiosSetting.addButton(btn => btn.setButtonText("添加").onClick(async () => {
            const ratio = customRatioInput.getValue().trim();
            if (ratio && ratio.includes(':') && !this.plugin.settings.systemSettings.customRatios.includes(ratio)) {
                this.plugin.settings.systemSettings.customRatios.push(ratio);
                await this.plugin.saveSettings();
                this.display();
            } else if (this.plugin.settings.systemSettings.customRatios.includes(ratio)) { new Notice('此比例已存在'); }
        }));
        this.plugin.settings.systemSettings.customRatios.forEach((ratio, index) => {
            new Setting(containerEl).setName(ratio).addButton(btn => btn.setIcon("trash").setTooltip("移除").onClick(async () => {
                this.plugin.settings.systemSettings.customRatios.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
            }));
        });
        
        new Setting(containerEl).setName("主题分类管理").setHeading();
        const addCategorySetting = new Setting(containerEl).setName('添加新分类');
        let categoryInput;
        addCategorySetting.addText(text => { categoryInput = text; text.setPlaceholder('分类名称'); });
        addCategorySetting.addButton(btn => btn.setButtonText('添加').onClick(async () => {
            const categoryName = categoryInput.getValue().trim();
            if (!categoryName) { new Notice('分类名称不能为空。'); return; }
            if (this.plugin.settings.systemSettings.themeCategories.includes(categoryName)) { new Notice('此分类名称已存在。'); return; }
            this.plugin.settings.systemSettings.themeCategories.push(categoryName);
            await this.plugin.saveSettings();
            this.display();
        }));
        this.plugin.settings.systemSettings.themeCategories.forEach((category, index) => {
             new Setting(containerEl)
                .addText(text => {
                    text.setValue(category);
                    text.inputEl.onblur = async () => {
                        const newName = text.getValue().trim();
                        const oldName = category;
                        if (newName === oldName) return;
                        if (!newName) { new Notice('分类名称不能为空。'); text.setValue(oldName); return; }
                        if (this.plugin.settings.systemSettings.themeCategories.some((c, i) => c.toLowerCase() === newName.toLowerCase() && i !== index)) { new Notice('此分类名称已存在。'); text.setValue(oldName); return; }
                        this.plugin.settings.systemSettings.themeCategories[index] = newName;
                        Object.values(this.plugin.settings.themes).forEach(theme => { if (theme.category === oldName) theme.category = newName; });
                        await this.plugin.saveSettings();
                        this.display();
                    };
                })
                .addButton(btn => btn.setIcon('arrow-up').setTooltip('上移').setDisabled(index === 0).onClick(async () => { const cats = this.plugin.settings.systemSettings.themeCategories; [cats[index], cats[index - 1]] = [cats[index - 1], cats[index]]; await this.plugin.saveSettings(); this.display(); }))
                .addButton(btn => btn.setIcon('arrow-down').setTooltip('下移').setDisabled(index === this.plugin.settings.systemSettings.themeCategories.length - 1).onClick(async () => { const cats = this.plugin.settings.systemSettings.themeCategories; [cats[index], cats[index + 1]] = [cats[index + 1], cats[index]]; await this.plugin.saveSettings(); this.display(); }))
                .addButton(btn => btn.setIcon('trash-2').setTooltip('删除').setWarning().onClick(() => {
                    new ConfirmationModal(this.app, `您确定要删除分类 "${category}" 吗？此分类下的主题将变为未分类。`, async () => {
                        Object.values(this.plugin.settings.themes).forEach(theme => { if (theme.category === category) theme.category = '未分类'; });
                        this.plugin.settings.systemSettings.themeCategories.splice(index, 1);
                        await this.plugin.saveSettings();
                        new Notice('分类已删除。');
                        this.display();
                    }).open();
                }));
        });
        
        new Setting(containerEl).setName("编辑器字段自定义").setHeading().setDesc("自定义字段的标签和布局宽度。");
        this.plugin.settings.editorConfig.fields.forEach((field) => {
            if (field.behavior === 'special') return;
            const setting = new Setting(containerEl)
                .setName(field.dataKey)
                .addText(text => {
                    text.setPlaceholder('标签名称').setValue(field.label).onChange(async (v) => {
                        field.label = v.trim() || field.dataKey;
                        await this.plugin.saveSettings();
                    });
                });
            
            setting.addDropdown(dropdown => {
                dropdown.addOption('full', '整行');
                dropdown.addOption('half', '半行');
                dropdown.setValue(field.width);
                dropdown.onChange(async (value) => {
                    field.width = value;
                    await this.plugin.saveSettings();
                });
            });
        });

        const dataSection = containerEl.createDiv({ cls: 'prompt-library-data-management' });
        new Setting(dataSection).setName("数据管理").setHeading();
        
        new Setting(dataSection).setName("主题库管理")
            .setDesc("批量导入或导出您的所有主题。")
            .addButton(btn => btn.setButtonText("导出所有主题").onClick(() => {
                const themes = this.plugin.settings.themes;
                if (Object.keys(themes).length === 0) { new Notice('没有可导出的主题。'); return; }
                this.plugin.downloadAsJson(themes, 'prompt_library_themes.json');
                new Notice('所有主题已导出。');
            }))
            .addButton(btn => btn.setButtonText("导入主题").onClick(() => {
                this.plugin.importFromJson(async (imported) => {
                    const originalCount = Object.keys(this.plugin.settings.themes).length;
                    this.plugin.settings.themes = { ...this.plugin.settings.themes, ...imported };
                    const newCount = Object.keys(this.plugin.settings.themes).length;
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(`导入完成。新增或覆盖了 ${newCount - originalCount} 个主题。`);
                });
            }));
            
        new Setting(dataSection).setName("元素库管理")
            .setDesc("导入或导出您的全局元素库。")
            .addButton(btn => btn.setButtonText("导出元素库").onClick(() => this.plugin.downloadAsJson(this.plugin.settings.libraryData, 'prompt_library_elements.json')))
            .addButton(btn => btn.setButtonText("导入元素库").onClick(() => new ConfirmationModal(this.app, "这将覆盖现有的同名元素库条目。您确定吗？", () => this.plugin.importFromJson(async (data) => {
                this.plugin.settings.libraryData = { ...this.plugin.settings.libraryData, ...data };
                await this.plugin.saveSettings(false);
                this.display();
                new Notice('元素库已导入！');
            })).open()));

        new Setting(dataSection).setName("备份与恢复")
            .setDesc("导出或导入所有插件数据，包括设置、主题和元素库。")
            .addButton(btn => btn.setButtonText("完整备份").onClick(() => this.plugin.downloadAsJson(this.plugin.settings, `prompt_library_backup_${Date.now()}.json`)))
            .addButton(btn => btn.setButtonText("从备份恢复").setWarning().onClick(() => new ConfirmationModal(this.app, "警告：这将覆盖所有当前的词库数据和设置。此操作不可撤销。您确定要继续吗？", () => this.plugin.importFromJson(async (data) => {
                await this.plugin.saveData(data);
                await this.plugin.loadSettings();
                this.display();
                new Notice('数据已从备份中恢复！请重新打开插件视图以确保所有更改生效。');
            })).open()));
    }
}

module.exports = PromptLibraryPlugin;