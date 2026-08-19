import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { HealthResponse } from '@hero/contracts';
import { App } from './app';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  it('mostra status e database quando /api/health responde ok', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const response: HealthResponse = { status: 'ok', database: 'ok' };
    httpMock.expectOne('/api/health').flush(response);

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('p')?.textContent).toContain('status: ok · database: ok');
  });
});
