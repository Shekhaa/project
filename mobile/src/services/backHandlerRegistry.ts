/**
 * BackHandlerRegistry - Centralized Android Hardware & Browser Back Navigation Stack
 * Ensures that pressing Back closes the topmost modal/overlay first before navigating back through tabs.
 */

import { Platform } from 'react-native';

export type BackHandlerFn = () => boolean | void;

interface StackItem {
  id: string;
  handler: BackHandlerFn;
}

class BackHandlerRegistry {
  private stack: StackItem[] = [];
  private isProcessingPopstate = false;
  private isSuppressingNextPopstate = false;

  push(id: string, handler: BackHandlerFn) {
    // Remove duplicate if already present
    this.stack = this.stack.filter((item) => item.id !== id);
    this.stack.push({ id, handler });

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
      try {
        window.history.pushState({ modalId: id }, '');
      } catch {}
    }
  }

  pop(id: string) {
    const wasTop = this.stack.length > 0 && this.stack[this.stack.length - 1].id === id;
    this.stack = this.stack.filter((item) => item.id !== id);

    if (wasTop && !this.isProcessingPopstate && Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
      try {
        if (window.history.state?.modalId === id) {
          this.isSuppressingNextPopstate = true;
          window.history.back();
        }
      } catch {}
    }
  }

  handleBack(): boolean {
    if (this.isSuppressingNextPopstate) {
      this.isSuppressingNextPopstate = false;
      return true;
    }

    if (this.stack.length > 0) {
      const top = this.stack.pop();
      if (top) {
        try {
          this.isProcessingPopstate = true;
          const handled = top.handler();
          return handled !== false;
        } catch {
          return true;
        } finally {
          this.isProcessingPopstate = false;
        }
      }
    }
    return false;
  }

  hasModalsOpen(): boolean {
    return this.stack.length > 0;
  }
}

export const backHandlerRegistry = new BackHandlerRegistry();
