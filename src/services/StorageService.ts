import type { AppState } from '../types';

const DB_NAME = 'pdf-editor-db';
const DB_VERSION = 1;
const STORE_NAME = 'session-store';
const STATE_KEY = 'appState';

/**
 * IndexedDBを使用したセッション保存サービス
 */
export class StorageService {
    private db: IDBDatabase | null = null;

    /**
     * データベースを初期化
     */
    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB open error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    /**
     * アプリケーション状態を保存
     */
    async saveState(state: AppState): Promise<void> {
        if (!this.db) {
            console.warn('StorageService: DB not initialized');
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            // AppStateをそのまま保存（Structured Clone対応）
            const request = store.put(state, STATE_KEY);

            request.onerror = () => {
                console.error('Save state error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve();
            };
        });
    }

    /**
     * アプリケーション状態を読み込み
     */
    async loadState(): Promise<AppState | null> {
        if (!this.db) {
            console.warn('StorageService: DB not initialized');
            return null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(STATE_KEY);

            request.onerror = () => {
                console.error('Load state error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result || null);
            };
        });
    }

    /**
     * 保存データをクリア
     */
    async clearState(): Promise<void> {
        if (!this.db) {
            console.warn('StorageService: DB not initialized');
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(STATE_KEY);

            request.onerror = () => {
                console.error('Clear state error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve();
            };
        });
    }
}
