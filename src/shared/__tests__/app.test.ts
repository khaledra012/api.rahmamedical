import { createApp } from '../../app';
import { Request, Response } from 'express';

describe('Express App Base Routes', () => {
  const app = createApp();

  it('should initialize app without crashing', () => {
    expect(app).toBeDefined();
  });
});
