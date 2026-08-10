import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent } from '@hero/contracts';
import { ChatService } from '../api/chat.service';
import { Chat } from './chat';

function fakeChatService(events: ChatStreamEvent[]): ChatService {
  return {
    async *ask() {
      for (const evento of events) yield evento;
    },
  } as ChatService;
}

describe('Chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('envia a pergunta ao clicar em Enviar, limpa o campo e revela a resposta em streaming', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ChatService,
          useValue: fakeChatService([{ node: 'answer', answerText: 'A receita foi X.' }]),
        },
      ],
    });
    const fixture = TestBed.createComponent(Chat);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('.chat__input') as HTMLInputElement;
    const sendButton = compiled.querySelector('.chat__send') as HTMLButtonElement;

    input.value = 'Qual a receita da Vale?';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(sendButton.disabled).toBe(false);

    sendButton.click();
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(sendButton.disabled).toBe(true);
    expect(compiled.textContent).toContain('Qual a receita da Vale?');

    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(compiled.textContent).toContain('A receita foi X.');
    expect(sendButton.disabled).toBe(true); // input voltou a ficar vazio
  });

  it('botão Enviar fica desabilitado com o campo vazio', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ChatService, useValue: fakeChatService([]) }],
    });
    const fixture = TestBed.createComponent(Chat);
    fixture.detectChanges();

    const sendButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.chat__send',
    ) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it('"Nova conversa" limpa o histórico', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChatService, useValue: fakeChatService([{ node: 'answer', answerText: 'ok' }]) },
      ],
    });
    const fixture = TestBed.createComponent(Chat);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const input = compiled.querySelector('.chat__input') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (compiled.querySelector('.chat__send') as HTMLButtonElement).click();
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.bubble--user, .bubble--assistant').length).toBeGreaterThan(
      0,
    );

    (compiled.querySelector('.chat__reset') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.bubble--user, .bubble--assistant').length).toBe(0);
  });
});
