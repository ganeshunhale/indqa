import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import User from '../models/User.js';

async function registerUser(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'password1' });
  return { token: res.body.token, id: res.body.user.id };
}

async function promoteToAdmin(id) {
  await User.findByIdAndUpdate(id, { role: 'admin' });
}

describe('Admin RBAC + analytics', () => {
  it('forbids non-admins from the knowledge endpoint (403)', async () => {
    const { token } = await registerUser('user@example.com');
    const res = await request(app).get('/api/admin/knowledge').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows admins to list the knowledge base', async () => {
    const { token, id } = await registerUser('admin@example.com');
    await promoteToAdmin(id);
    const res = await request(app).get('/api/admin/knowledge').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('forbids non-admins from analytics (403) and allows admins (200)', async () => {
    const userA = await registerUser('plain@example.com');
    const forbidden = await request(app).get('/api/analytics').set('Authorization', `Bearer ${userA.token}`);
    expect(forbidden.status).toBe(403);

    const userB = await registerUser('boss@example.com');
    await promoteToAdmin(userB.id);
    const ok = await request(app).get('/api/analytics').set('Authorization', `Bearer ${userB.token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.totals).toBeDefined();
    expect(ok.body.grounding).toHaveProperty('confidenceThreshold');
  });
});
