import { Injectable, inject, signal } from '@angular/core';
import { ChatService } from '../api/chat.service';
import { tokenize, type ChatMessage } from './chat-message';

const STREAM_SPEED_MS = 70;
const RESPOSTA_INDISPONIVEL =
  'Não foi possível obter uma resposta agora. Tente novamente em instantes.';

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly chatService = inject(ChatService);

  private readonly _messages = signal<ChatMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  private readonly _pending = signal(false);
  readonly pending = this._pending.asReadonly();

  private nextId = 1;
  private revealTimer?: ReturnType<typeof setInterval>;

  async send(question: string): Promise<void> {
    const texto = question.trim();
    if (!texto || this._pending()) return;

    this.clearReveal();
    const userId = this.nextId++;
    const assistantId = this.nextId++;
    this._messages.update((mensagens) => [
      ...mensagens,
      { id: userId, role: 'user', words: [texto], revealed: 1, done: true },
      { id: assistantId, role: 'assistant', words: [], revealed: 0, done: false },
    ]);
    this._pending.set(true);

    try {
      for await (const evento of this.chatService.ask(texto)) {
        if (evento.node === 'answer' && evento.answerText) {
          this.startReveal(assistantId, evento.answerText);
        }
      }
    } catch {
      this.finishWithText(assistantId, RESPOSTA_INDISPONIVEL);
    } finally {
      this._pending.set(false);
    }
  }

  reset(): void {
    this.clearReveal();
    this._messages.set([]);
    this._pending.set(false);
  }

  private startReveal(messageId: number, fullText: string): void {
    const words = tokenize(fullText);
    this.updateMessage(messageId, { words, revealed: 0, done: words.length === 0 });
    if (words.length === 0) return;

    let revealed = 0;
    this.revealTimer = setInterval(() => {
      revealed++;
      const done = revealed >= words.length;
      this.updateMessage(messageId, { revealed, done });
      if (done) this.clearReveal();
    }, STREAM_SPEED_MS);
  }

  private finishWithText(messageId: number, text: string): void {
    this.updateMessage(messageId, { words: [text], revealed: 1, done: true });
  }

  private updateMessage(messageId: number, changes: Partial<ChatMessage>): void {
    this._messages.update((mensagens) =>
      mensagens.map((mensagem) =>
        mensagem.id === messageId ? { ...mensagem, ...changes } : mensagem,
      ),
    );
  }

  private clearReveal(): void {
    if (this.revealTimer) {
      clearInterval(this.revealTimer);
      this.revealTimer = undefined;
    }
  }
}
