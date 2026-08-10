import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { visibleText, type ChatMessage } from '../../state/chat-message';

@Component({
  selector: 'app-chat-message',
  templateUrl: './chat-message.html',
  styleUrl: './chat-message.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
  readonly message = input.required<ChatMessage>();

  protected readonly isUser = computed(() => this.message().role === 'user');
  protected readonly text = computed(() => visibleText(this.message()));
  protected readonly showCursor = computed(
    () => !this.isUser() && !this.message().done && this.message().words.length > 0,
  );
}
