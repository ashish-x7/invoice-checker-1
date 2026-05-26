/**
 * Brand Central - Dashboard Timer Component
 * Tracks and estimates processing speeds and remaining times during auto loops.
 */
class DashboardTimer {
    constructor(containerId, valId, speedId, remainingId) {
        this.container = document.getElementById(containerId);
        this.valEl = document.getElementById(valId);
        this.speedEl = document.getElementById(speedId);
        this.remainingEl = document.getElementById(remainingId);
        
        this.timerInterval = null;
        this.startTime = null;
        this.elapsedMs = 0;
        this.startIndex = 0;
        this.totalCount = 0;
        this.lastIndex = 0;
    }

    start(startIndex, totalCount) {
        if (this.timerInterval) return;
        
        this.startIndex = startIndex;
        this.totalCount = totalCount;
        this.lastIndex = startIndex;
        
        this.startTime = Date.now() - this.elapsedMs;
        
        // Update UI to active state (Premium Blue/Sky theme)
        if (this.container) {
            this.container.style.display = 'flex';
            this.container.style.background = '#e0f2fe';
            this.container.style.borderColor = '#bae6fd';
            this.container.style.color = '#0369a1';
        }

        this.timerInterval = setInterval(() => {
            this.elapsedMs = Date.now() - this.startTime;
            this.tick();
        }, 100);
    }

    stop() {
        if (!this.timerInterval) return;
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        
        // Update UI to paused/stopped state (Slate grey)
        if (this.container) {
            this.container.style.background = '#f1f5f9';
            this.container.style.borderColor = '#e2e8f0';
            this.container.style.color = '#64748b';
        }
    }

    reset() {
        this.stop();
        this.elapsedMs = 0;
        this.startIndex = 0;
        this.lastIndex = 0;
        this.totalCount = 0;
        
        if (this.valEl) this.valEl.textContent = '00:00';
        if (this.speedEl) this.speedEl.textContent = '0.0s / inv';
        if (this.remainingEl) this.remainingEl.textContent = '--';
    }

    updateProgress(currentIndex) {
        this.lastIndex = currentIndex;
        this.tick();
    }

    tick() {
        // Format elapsed time
        const totalSeconds = Math.floor(this.elapsedMs / 1000);
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        if (this.valEl) this.valEl.textContent = `${mins}:${secs}`;

        // Speed calculation
        const processed = Math.max(1, this.lastIndex - this.startIndex);
        const elapsedSecs = this.elapsedMs / 1000;
        const speed = elapsedSecs / processed;
        
        if (this.speedEl) {
            this.speedEl.textContent = `${speed.toFixed(1)}s / inv`;
        }

        // Remaining time prediction
        const remaining = Math.max(0, this.totalCount - this.lastIndex);
        if (remaining === 0) {
            if (this.remainingEl) this.remainingEl.textContent = 'Done ✓';
        } else {
            const remSecs = Math.round(remaining * speed);
            const remMins = Math.floor(remSecs / 60);
            const remSecsLeft = remSecs % 60;
            
            let remStr = '';
            if (remMins > 0) {
                remStr = `${remMins}m ${remSecsLeft}s`;
            } else {
                remStr = `${remSecsLeft}s`;
            }
            if (this.remainingEl) this.remainingEl.textContent = `~${remStr}`;
        }
    }
}
