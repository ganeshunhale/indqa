import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

const validUser = { name: 'Test User', email: 'test@example.com', password: 'password1' };

describe('Auth routes', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('rejects an invalid email (400 VALIDATION_ERROR)', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...validUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...validUser, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('prevents duplicate email registration (409)', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const ok = await request(app).post('/api/auth/login').send({ email: validUser.email, password: validUser.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email: validUser.email, password: 'wrongpass1' });
    expect(bad.status).toBe(401);
  });

  it('returns the current user from /me with a valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
  });

  it('rejects /me without a token (401)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
