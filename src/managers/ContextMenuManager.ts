import { MenuItem } from '../types';

/**
 * コンテキストメニュー管理クラス
 */
export class ContextMenuManager {
    private container: HTMLDivElement;
    private overlay: HTMLDivElement;
    private onClose: (() => void) | null = null; // コールバック追加

    constructor() {
        // メニューコンテナ
        this.container = document.createElement('div');
        this.container.className = 'context-menu';
        this.container.style.display = 'none';

        // 背景オーバーレイ（クリックして閉じる用）
        this.overlay = document.createElement('div');
        this.overlay.className = 'context-menu-overlay';
        this.overlay.style.display = 'none';

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.container);

        // オーバーレイクリックで閉じる
        this.overlay.addEventListener('click', () => {
            this.hide();
        });

        // 右クリックを無効化（メニュー上での右クリック防止）
        this.container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    /**
     * コンテキストメニューを表示
     * @param x 表示位置X
     * @param y 表示位置Y
     * @param items メニュー項目
     * @param onClose 閉じる時のコールバック
     */
    show(x: number, y: number, items: MenuItem[], onClose?: () => void): void {
        this.hide(); // 既存のメニューをクリア
        this.onClose = onClose || null;

        if (items.length === 0) return;

        // メニュー構築
        this.container.innerHTML = '';

        items.forEach(item => {
            if (item.divider) {
                const divider = document.createElement('div');
                divider.className = 'context-menu-divider';
                this.container.appendChild(divider);
                return;
            }

            const el = document.createElement('div');
            el.className = 'context-menu-item';
            if (item.disabled) el.classList.add('disabled');
            if (item.danger) el.classList.add('danger');

            // アイコン
            if (item.icon) {
                const icon = document.createElement('span');
                icon.className = 'context-menu-icon';
                icon.innerHTML = item.icon; // SVG想定
                el.appendChild(icon);
            }

            // ラベル
            const label = document.createElement('span');
            label.className = 'context-menu-label';
            label.textContent = item.label;
            el.appendChild(label);

            // アクション
            if (!item.disabled && item.action) {
                el.addEventListener('click', () => {
                    this.hide();
                    item.action!();
                });
            }

            this.container.appendChild(el);
        });

        // 表示して位置計算
        this.container.style.display = 'block';
        this.overlay.style.display = 'block';

        // 位置調整（画面端からはみ出さないように）
        const rect = this.container.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let posX = x;
        let posY = y;

        if (posX + rect.width > winWidth) {
            posX = winWidth - rect.width - 10;
        }
        if (posY + rect.height > winHeight) {
            posY = winHeight - rect.height - 10;
        }

        this.container.style.left = `${posX}px`;
        this.container.style.top = `${posY}px`;
    }

    /**
     * メニューを非表示
     */
    hide(): void {
        if (this.onClose) {
            this.onClose();
            this.onClose = null;
        }
        this.container.style.display = 'none';
        this.overlay.style.display = 'none';
    }
}
