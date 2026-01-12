export class HelpManager {
    constructor(
        private btnHelp: HTMLButtonElement,
        private helpModal: HTMLDivElement,
        private helpModalClose: HTMLButtonElement
    ) { }

    public init(): void {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Open modal
        this.btnHelp.addEventListener('click', () => {
            this.openModal();
        });

        // Close modal (button)
        this.helpModalClose.addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal (overlay click)
        this.helpModal.addEventListener('click', (e) => {
            if (e.target === this.helpModal) {
                this.closeModal();
            }
        });

        // Close modal (Escape key)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.helpModal.style.display === 'flex') {
                this.closeModal();
            }
        });
    }

    private openModal(): void {
        this.helpModal.style.display = 'flex';
    }

    private closeModal(): void {
        this.helpModal.style.display = 'none';
    }
}
