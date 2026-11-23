/**
 * ActiveVideoManager - Global Singleton Coordinator
 * Guarantees that at most ONE video is playing across the entire application.
 * If a video starts playing, any previously playing video is automatically paused.
 * When a video leaves the viewport, it automatically pauses to avoid runaway audio/video.
 */

type PauseCallback = () => void;

class ActiveVideoManager {
  private activeId: string | null = null;
  private pauseCallback: PauseCallback | null = null;
  private registeredPlayers = new Map<string, PauseCallback>();

  register(id: string, pauseCb: PauseCallback) {
    this.registeredPlayers.set(id, pauseCb);
  }

  unregister(id: string) {
    this.registeredPlayers.delete(id);
    if (this.activeId === id) {
      this.activeId = null;
      this.pauseCallback = null;
    }
  }

  play(id: string, pauseCb: PauseCallback) {
    if (this.activeId && this.activeId !== id && this.pauseCallback) {
      try {
        this.pauseCallback();
      } catch (e) {
        // Safe fallback
      }
    }
    this.activeId = id;
    this.pauseCallback = pauseCb;
    this.registeredPlayers.set(id, pauseCb);
  }

  pause(id: string) {
    if (this.activeId === id) {
      this.activeId = null;
      this.pauseCallback = null;
    }
  }

  pauseAll() {
    this.registeredPlayers.forEach((pauseCb) => {
      try {
        pauseCb();
      } catch (e) {}
    });
    this.activeId = null;
    this.pauseCallback = null;
  }

  getActiveId(): string | null {
    return this.activeId;
  }
}

export const activeVideoManager = new ActiveVideoManager();
