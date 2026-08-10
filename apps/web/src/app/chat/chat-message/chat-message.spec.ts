import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../state/chat-message';
import { ChatMessageComponent } from './chat-message';

function render(message: ChatMessage) {
  const fixture = TestBed.createComponent(ChatMessageComponent);
  fixture.componentRef.setInput('message', message);
  fixture.detectChanges();
  return fixture;
}

describe('ChatMessageComponent', () => {
  it('mensagem do usuário aparece à direita, sem cabeçalho de avatar', () => {
    const fixture = render({
      id: 1,
      role: 'user',
      words: ['Qual a receita da Vale?'],
      revealed: 1,
      done: true,
    });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.bubble--user')?.textContent).toContain(
      'Qual a receita da Vale?',
    );
    expect(compiled.querySelector('.bubble__avatar')).toBeFalsy();
  });

  it('mensagem do assistente em streaming mostra só os tokens revelados e o cursor', () => {
    const fixture = render({
      id: 2,
      role: 'assistant',
      words: ['A ', 'receita ', 'foi ', 'X.'],
      revealed: 2,
      done: false,
    });

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.bubble__text')?.textContent?.trim()).toBe('A receita');
    expect(compiled.querySelector('.bubble__cursor')).toBeTruthy();
  });

  it('mensagem do assistente concluída não mostra cursor', () => {
    const fixture = render({
      id: 3,
      role: 'assistant',
      words: ['ok.'],
      revealed: 1,
      done: true,
    });

    expect((fixture.nativeElement as HTMLElement).querySelector('.bubble__cursor')).toBeFalsy();
  });
});
